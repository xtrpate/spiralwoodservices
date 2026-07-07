// routes/customer.cart.js
const express = require("express");
const router = express.Router();

const { authenticate, requireCustomer } = require("../middleware/auth");
const cartController = require("../controllers/customer/customer.cart");

router.get("/", authenticate, requireCustomer, cartController.getCart);
router.post("/sync", authenticate, requireCustomer, cartController.syncCart);

module.exports = router;