// services/blueprintLifecycleService.js – Blueprint order lifecycle resolver
//
// SINGLE SOURCE OF TRUTH for "which estimation is actually valid for this
// blueprint/order right now". Replaces the unsafe pattern used throughout
// blueprintController.js, orderController.js, managementController.js, and
// customer.customorders.js of selecting an estimation by
// `WHERE blueprint_id = ? ORDER BY version DESC, id DESC LIMIT 1` with no
// timing or ownership check.
//
// ROOT CAUSE THIS FIXES: backend/wipe-db.js truncates `blueprints`/`orders`
// (resetting their AUTO_INCREMENT counters) without truncating `estimations`.
// Old estimation rows survive with `blueprint_id` values that later get
// reused by brand-new blueprints, so a numeric blueprint_id match alone is
// not sufficient proof that an estimation actually belongs to the current
// blueprint/order lifecycle.
//
// CONTRACT WITH CALLERS:
//   - Both functions accept an already-open, already-transactional mysql2
//     connection (`conn`, e.g. from `pool.getConnection()` after
//     `beginTransaction()`). This module never opens its own connection and
//     never commits/rolls back — that stays the caller's responsibility.
//   - Only resolveLifecycleByOrder accepts `lockOrder`/`lockBlueprint: true`
//     to add `FOR UPDATE` to the relevant SELECT (only meaningful inside an
//     active transaction). resolveLifecycleByBlueprint does NOT accept or
//     apply either option — it is a discovery/read resolution entry point
//     for routes that only have a blueprintId (no orderId) available, such
//     as blueprintController's GET/POST /blueprints/:id/estimation
//     endpoints. It deliberately does not lock anything itself, and it does
//     not introduce blueprint-first locking, to avoid conflicting with the
//     order-first lock order used everywhere a write actually happens.
//     Write callers that resolve through resolveLifecycleByBlueprint and
//     find exactly one linked order must re-resolve that order through
//     resolveLifecycleByOrder with lockOrder (and lockBlueprint if needed)
//     inside their own transaction before making any write decision — see
//     blueprintController.saveEstimation for the reference pattern.
//   - `status: 'OK'` does NOT by itself mean a write is safe. Reasons
//     'NO_ESTIMATION' and 'NO_BLUEPRINT_LINKED' are also 'OK' (they are
//     normal, non-corruption states), but each endpoint must additionally
//     check the specific fields it needs (e.g. estimation.status === 'sent',
//     order.status === 'confirmed', contract === null) before writing.
//     This module reports state; it does not enforce per-endpoint rules.
//   - This module never deletes, rewrites, or relinks historical rows. The
//     `stale_candidate` field is for display/audit purposes only.

const REASON_CODES = Object.freeze({
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  BLUEPRINT_NOT_FOUND: 'BLUEPRINT_NOT_FOUND',
  ORDER_BLUEPRINT_MISMATCH: 'ORDER_BLUEPRINT_MISMATCH',
  MULTIPLE_ORDER_OWNERS: 'MULTIPLE_ORDER_OWNERS',
  NO_BLUEPRINT_LINKED: 'NO_BLUEPRINT_LINKED',
  NO_ESTIMATION: 'NO_ESTIMATION',
  STALE_ESTIMATION: 'STALE_ESTIMATION',
});

// ── Small local helpers (money/status normalization) ────────────────────────
// Intentionally NOT added to utils/validators.js: that file is pure
// request-input validation with no DB awareness, while these two helpers
// exist only to support this resolver's own queries/results.
function roundMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

// Strict positive-integer validation for requestedBlueprintId. Accepts a
// real number that is a positive integer, or a string containing only
// digits with no leading zero (so "5" is valid but "0", "-5", "5.5",
// "05", and "abc" are all rejected). Returns null for anything invalid —
// callers must treat null as "supplied but invalid", never as "not
// supplied", so a bad value is never silently ignored.
function parsePositiveIntegerOrNull(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^[1-9][0-9]*$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

// ── Result shape ──────────────────────────────────────────────────────────
// Every return value from this module has this exact shape, regardless of
// which branch produced it, so callers never need to guess which fields
// exist.
function baseResult(status, reason, message, extra = {}) {
  return {
    status, // 'OK' | 'BLOCKED'
    reason, // one of REASON_CODES, or null when status === 'OK' with a valid estimation
    message,
    order: extra.order ?? null,
    blueprint: extra.blueprint ?? null,
    estimation: extra.estimation ?? null,
    contract: extra.contract ?? null,
    verified_payment_total: extra.verified_payment_total ?? 0,
    has_pending_payment_transaction: extra.has_pending_payment_transaction ?? false,
    integrity_warning: extra.integrity_warning ?? (status === 'BLOCKED'),
    stale_candidate: extra.stale_candidate ?? null,
    conflicting_order_ids: extra.conflicting_order_ids ?? null,
    // Only ever true when reason === 'STALE_ESTIMATION' (order-scoped) or
    // 'NO_ESTIMATION'/'STALE_ESTIMATION' (blueprint-only context). Always
    // false for MULTIPLE_ORDER_OWNERS per the approved design.
    can_create_replacement_estimation: extra.can_create_replacement_estimation ?? false,
    recovery_block_reason: extra.recovery_block_reason ?? null,
  };
}

function blockedResult(reason, message, extra = {}) {
  return baseResult('BLOCKED', reason, message, {
    can_create_replacement_estimation: false, // default; caller's explicit value below wins
    ...extra,
  });
}

function okResult(reason, message, extra = {}) {
  return baseResult('OK', reason, message, { ...extra, integrity_warning: false });
}

// Shared recovery-eligibility computation for order-scoped results — used
// for BOTH 'NO_ESTIMATION' and 'STALE_ESTIMATION' when an order is linked.
// A replacement estimation is only safe to create when nothing financial
// is riding on the order yet:
//   order.status === 'confirmed' AND no contract AND verified total = 0
//   AND no pending payment_transactions row.
// Returns null when eligible, or a human-readable reason for the first
// blocking condition encountered. Blueprint-only context (zero linked
// orders) does NOT go through this helper — it is always eligible
// separately in resolveLifecycleByBlueprint, since there is no order for
// any of these conditions to apply to.
function computeOrderRecoveryEligibility({
  order,
  contract,
  verifiedPaymentTotal,
  hasPendingPaymentTransaction,
}) {
  const normalizedStatus = normalizeStatus(order.status);

  if (normalizedStatus !== 'confirmed') {
    return `Order status is "${order.status}"; must be exactly "confirmed" to create a replacement estimation.`;
  }
  if (contract) {
    return 'A contract already exists for this order.';
  }
  if (verifiedPaymentTotal > 0) {
    return `Order already has a verified payment total of ${verifiedPaymentTotal}.`;
  }
  if (hasPendingPaymentTransaction) {
    return 'Order has a pending payment proof awaiting review. Resolve it through the normal payment-review flow first.';
  }
  return null;
}

// ── Shared estimation/contract/payment resolution ───────────────────────────
// Used once an exact single order+blueprint pair has already been
// established (no ownership ambiguity). Runs the valid-estimation query
// first (never "latest then test"), then separately checks whether ANY
// estimation exists at all, purely to power the integrity warning and the
// recovery-eligibility computation.
async function resolveEstimationAndContext(conn, { order, blueprint }) {
  const [validRows] = await conn.query(
    `SELECT *
     FROM estimations
     WHERE blueprint_id = ?
       AND created_at >= ?
       AND created_at >= ?
     ORDER BY version DESC, id DESC
     LIMIT 1`,
    [blueprint.id, blueprint.created_at, order.created_at],
  );
  const estimation = validRows[0] || null;

  const [contractRows] = await conn.query(
    `SELECT * FROM contracts WHERE order_id = ? LIMIT 1`,
    [order.id],
  );
  const contract = contractRows[0] || null;

  const [paymentRows] = await conn.query(
    `SELECT status, amount FROM payment_transactions WHERE order_id = ?`,
    [order.id],
  );
  const verifiedPaymentTotal = roundMoney(
    paymentRows
      .filter((row) => normalizeStatus(row.status) === 'verified')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0),
  );
  const hasPendingPaymentTransaction = paymentRows.some(
    (row) => normalizeStatus(row.status) === 'pending',
  );

  if (estimation) {
    return okResult(null, 'Lifecycle-valid estimation resolved.', {
      order,
      blueprint,
      estimation,
      contract,
      verified_payment_total: verifiedPaymentTotal,
      has_pending_payment_transaction: hasPendingPaymentTransaction,
    });
  }

  // No lifecycle-valid estimation. Check whether ANY estimation exists for
  // this blueprint_id at all (display-only — never used as write data).
  const [anyRows] = await conn.query(
    `SELECT id, created_at, status, grand_total
     FROM estimations
     WHERE blueprint_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [blueprint.id],
  );
  const staleCandidate = anyRows[0] || null;

  if (!staleCandidate) {
    // Genuinely fresh blueprint — but a canonical order IS linked to it,
    // so recovery eligibility still depends on that order's own state.
    // Previously this branch returned can_create_replacement_estimation:
    // true unconditionally, which would have allowed saving a "first"
    // estimation even against an order that had already progressed to
    // e.g. completed with a contract and full payment.
    const recoveryBlockReason = computeOrderRecoveryEligibility({
      order,
      contract,
      verifiedPaymentTotal,
      hasPendingPaymentTransaction,
    });

    return okResult(
      REASON_CODES.NO_ESTIMATION,
      'No estimation has been saved yet for this blueprint.',
      {
        order,
        blueprint,
        contract,
        verified_payment_total: verifiedPaymentTotal,
        has_pending_payment_transaction: hasPendingPaymentTransaction,
        can_create_replacement_estimation: recoveryBlockReason === null,
        recovery_block_reason: recoveryBlockReason,
      },
    );
  }

  // STALE_ESTIMATION — compute recovery eligibility via the same shared
  // helper used above, so both reasons are judged by identical rules.
  const recoveryBlockReason = computeOrderRecoveryEligibility({
    order,
    contract,
    verifiedPaymentTotal,
    hasPendingPaymentTransaction,
  });

  return blockedResult(
    REASON_CODES.STALE_ESTIMATION,
    `Estimation ${staleCandidate.id} exists for blueprint ${blueprint.id} but predates the current order/blueprint lifecycle (created ${staleCandidate.created_at}).`,
    {
      order,
      blueprint,
      contract,
      verified_payment_total: verifiedPaymentTotal,
      has_pending_payment_transaction: hasPendingPaymentTransaction,
      integrity_warning: true,
      stale_candidate: staleCandidate,
      can_create_replacement_estimation: recoveryBlockReason === null,
      recovery_block_reason: recoveryBlockReason,
    },
  );
}

// ── Order-scoped resolver ───────────────────────────────────────────────────
// Used by: orderController.getOne/updateStatus/verifyPayment,
// managementController.generateContract, and all 5 customer.customorders.js
// call sites. Canonical blueprint id is ALWAYS order.blueprint_id;
// requestedBlueprintId (e.g. from req.body) is only ever used for the
// mismatch check below, never as a query key.
async function resolveLifecycleByOrder(conn, options = {}) {
  const {
    orderId,
    requestedBlueprintId = null,
    lockOrder = false,
    lockBlueprint = false,
  } = options;

  const id = Number(orderId) || 0;
  if (!id) {
    return blockedResult(REASON_CODES.ORDER_NOT_FOUND, 'Order not found.');
  }

  const orderSql =
    `SELECT id, order_number, customer_id, order_type, status, blueprint_id,
        subtotal, tax, discount, total, down_payment, payment_status,
        created_at, updated_at
     FROM orders
     WHERE id = ?
     LIMIT 1` + (lockOrder ? ' FOR UPDATE' : '');

  const [orderRows] = await conn.query(orderSql, [id]);
  const order = orderRows[0] || null;

  if (!order) {
    return blockedResult(REASON_CODES.ORDER_NOT_FOUND, `Order ${id} not found.`);
  }

  const bpIdFromOrder = Number(order.blueprint_id) || 0;

  if (requestedBlueprintId != null && requestedBlueprintId !== '') {
    const reqBpId = parsePositiveIntegerOrNull(requestedBlueprintId);

    if (reqBpId === null) {
      // Supplied but not a valid positive integer (0, negative, decimal,
      // non-numeric string, etc.) — never silently ignored. Blocked the
      // same way an outright mismatch is blocked, since an invalid value
      // is just as unsafe to proceed on as a wrong one.
      return blockedResult(
        REASON_CODES.ORDER_BLUEPRINT_MISMATCH,
        `Requested blueprint id "${requestedBlueprintId}" is not a valid positive integer.`,
        { order },
      );
    }

    if (reqBpId !== bpIdFromOrder) {
      return blockedResult(
        REASON_CODES.ORDER_BLUEPRINT_MISMATCH,
        `Requested blueprint ${reqBpId} does not match this order's linked blueprint (${bpIdFromOrder || 'none'}).`,
        { order },
      );
    }
  }

  if (!bpIdFromOrder) {
    return okResult(
      REASON_CODES.NO_BLUEPRINT_LINKED,
      'Order is not yet linked to a blueprint.',
      { order },
    );
  }

  const bpSql =
    `SELECT id, title, stage, is_deleted, created_at, updated_at
     FROM blueprints
     WHERE id = ?
     LIMIT 1` + (lockBlueprint ? ' FOR UPDATE' : '');

  const [bpRows] = await conn.query(bpSql, [bpIdFromOrder]);
  const blueprint = bpRows[0] || null;

  if (!blueprint) {
    return blockedResult(
      REASON_CODES.BLUEPRINT_NOT_FOUND,
      `Blueprint ${bpIdFromOrder} referenced by this order no longer exists.`,
      { order },
    );
  }

  // Ownership check — never guess which order is correct when more than one
  // order references the same blueprint_id. Blocks ALL of them equally.
  const [ownerRows] = await conn.query(`SELECT id FROM orders WHERE blueprint_id = ?`, [
    blueprint.id,
  ]);

  if (ownerRows.length > 1) {
    const conflictingOrderIds = ownerRows.map((row) => row.id);
    return blockedResult(
      REASON_CODES.MULTIPLE_ORDER_OWNERS,
      `Blueprint ${blueprint.id} is referenced by more than one order (${conflictingOrderIds.join(', ')}). Manual review required.`,
      { order, blueprint, conflicting_order_ids: conflictingOrderIds },
    );
  }

  return resolveEstimationAndContext(conn, { order, blueprint });
}

// ── Blueprint-scoped resolver ───────────────────────────────────────────────
// Used by: blueprintController.getEstimation/saveEstimation/approveEstimation
// (routes are /blueprints/:id/... with no orderId available), and the
// read-only pre-check in ContractsPage.jsx's GET call.
//
//   0 linked orders  -> blueprint-only context; validate against
//                        blueprint.created_at only (e.g. templates, or a
//                        blueprint an admin is designing before any order
//                        has been approved against it yet).
//   1 linked order   -> delegate to resolveLifecycleByOrder for full checks.
//   >1 linked orders -> MULTIPLE_ORDER_OWNERS; no auto-draft, no replacement
//                        estimation allowed, manual review required.
async function resolveLifecycleByBlueprint(conn, options = {}) {
  const blueprintId = Number(options.blueprintId) || 0;

  if (!blueprintId) {
    return blockedResult(REASON_CODES.BLUEPRINT_NOT_FOUND, 'Blueprint not found.');
  }

  const [bpRows] = await conn.query(
    `SELECT id, title, stage, is_deleted, created_at, updated_at
     FROM blueprints
     WHERE id = ?
     LIMIT 1`,
    [blueprintId],
  );
  const blueprint = bpRows[0] || null;

  if (!blueprint) {
    return blockedResult(
      REASON_CODES.BLUEPRINT_NOT_FOUND,
      `Blueprint ${blueprintId} not found.`,
    );
  }

  const [orderRows] = await conn.query(`SELECT id FROM orders WHERE blueprint_id = ?`, [
    blueprint.id,
  ]);

  if (orderRows.length > 1) {
    const conflictingOrderIds = orderRows.map((row) => row.id);
    return blockedResult(
      REASON_CODES.MULTIPLE_ORDER_OWNERS,
      `Blueprint ${blueprint.id} is referenced by more than one order (${conflictingOrderIds.join(', ')}). Manual review required.`,
      { blueprint, conflicting_order_ids: conflictingOrderIds },
    );
  }

  if (orderRows.length === 1) {
    return resolveLifecycleByOrder(conn, { orderId: orderRows[0].id });
  }

  // Branch A: zero linked orders — blueprint-only context.
  const [validRows] = await conn.query(
    `SELECT *
     FROM estimations
     WHERE blueprint_id = ?
       AND created_at >= ?
     ORDER BY version DESC, id DESC
     LIMIT 1`,
    [blueprint.id, blueprint.created_at],
  );
  const estimation = validRows[0] || null;

  if (estimation) {
    return okResult(null, 'Lifecycle-valid estimation resolved (blueprint-only context).', {
      blueprint,
      estimation,
    });
  }

  const [anyRows] = await conn.query(
    `SELECT id, created_at, status, grand_total
     FROM estimations
     WHERE blueprint_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [blueprint.id],
  );
  const staleCandidate = anyRows[0] || null;

  if (!staleCandidate) {
    return okResult(
      REASON_CODES.NO_ESTIMATION,
      'No estimation has been saved yet for this blueprint.',
      { blueprint, can_create_replacement_estimation: true },
    );
  }

  // Stale, but blueprint-only (no order attached yet) — nothing financial is
  // riding on it, so a replacement is always allowed in this branch.
  return blockedResult(
    REASON_CODES.STALE_ESTIMATION,
    `Estimation ${staleCandidate.id} predates this blueprint (created ${staleCandidate.created_at}), and no order is currently linked to it.`,
    {
      blueprint,
      integrity_warning: true,
      stale_candidate: staleCandidate,
      can_create_replacement_estimation: true,
    },
  );
}

module.exports = {
  REASON_CODES,
  resolveLifecycleByOrder,
  resolveLifecycleByBlueprint,
};
