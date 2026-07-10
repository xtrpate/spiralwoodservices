// src/components/LocationPicker.jsx
// One "Address" field that does both jobs: free typing (with live search
// suggestions) AND drives the map pin. No separate/duplicate search box —
// type an address, pick a suggestion, tap the map, drag the marker, or
// use current location — all of it keeps the address text and the pin
// in sync. Used by profile settings and checkout.
import { useState, useRef, useCallback, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// CRA/webpack breaks Leaflet's default marker icon path resolution —
// this re-points it at the bundled image imports instead. Runs once
// per bundle load (module-level), not per render.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Default center when there's no saved/selected pin yet: Marilao, Bulacan.
const DEFAULT_CENTER = { lat: 14.7566, lng: 120.9502 };
const DEFAULT_ZOOM_WITH_PIN = 15;
const DEFAULT_ZOOM_NO_PIN = 12;
const SEARCH_DEBOUNCE_MS = 450;
const SEARCH_MIN_CHARS = 3;
const TILE_ERROR_THRESHOLD = 6;
const POOR_ACCURACY_METERS = 100;

// Rough Philippines bounding box — wide enough to include all provinces,
// only used to catch obviously-wrong geolocation results (e.g. a
// desktop's network-based location resolving to another country).
const PH_BOUNDS = { minLat: 4.5, maxLat: 21.5, minLng: 116.0, maxLng: 127.0 };

function isWithinPhilippines(lat, lng) {
  return (
    lat >= PH_BOUNDS.minLat &&
    lat <= PH_BOUNDS.maxLat &&
    lng >= PH_BOUNDS.minLng &&
    lng <= PH_BOUNDS.maxLng
  );
}

// Fallback tile source used only if the primary OSM tile server fails to
// load repeatedly (e.g. rate limiting or an outage).
const PRIMARY_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const FALLBACK_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

function ClickHandler({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// Scroll-wheel zoom stays off until the user focuses/clicks the map, so
// scrolling the surrounding page is never trapped by an unfocused map.
function ScrollZoomGate() {
  const map = useMap();
  useEffect(() => {
    map.scrollWheelZoom.disable();
    const enable = () => map.scrollWheelZoom.enable();
    const disable = () => map.scrollWheelZoom.disable();
    map.on("focus", enable);
    map.on("click", enable);
    map.on("blur", disable);
    return () => {
      map.off("focus", enable);
      map.off("click", enable);
      map.off("blur", disable);
    };
  }, [map]);
  return null;
}

// Imperatively recenters the map when a pin is set from search or
// "use my current location" (react-leaflet ignores center/zoom prop
// changes after mount, so a plain prop update would not move the map).
function FlyToController({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo(
      [target.lat, target.lng],
      Math.max(map.getZoom(), DEFAULT_ZOOM_WITH_PIN),
    );
  }, [target, map]);
  return null;
}

// Leaflet sizes its canvas from its container at the moment it mounts.
// Since this component can now mount/unmount as part of a toggled
// section (e.g. checkout's "use a different address" block), give it a
// nudge shortly after mount so the tiles never render blank/mis-sized.
function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 0);
    const t2 = setTimeout(() => map.invalidateSize(), 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [map]);
  return null;
}

function TileFallbackLayer({ onTileError, useFallback }) {
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url={useFallback ? FALLBACK_TILE_URL : PRIMARY_TILE_URL}
      eventHandlers={{ tileerror: onTileError }}
    />
  );
}

/**
 * @param {string} addressValue - the address text, controlled by the parent
 * @param {(text: string) => void} onAddressChange - fired on every
 *   keystroke, and again with the full place name when a search
 *   suggestion is picked
 * @param {{lat:number,lng:number}|null} value - current pin, or null if unset
 * @param {(next: {lat:number,lng:number}|null) => void} onChange
 * @param {string} [label="Address"] - set to "" to hide the label (parent
 *   supplying its own heading)
 * @param {number} [height=380] - map height in px
 */
export default function LocationPicker({
  addressValue,
  onAddressChange,
  value,
  onChange,
  label = "Address",
  height = 380,
}) {
  const hasPin = Boolean(
    value && Number.isFinite(value.lat) && Number.isFinite(value.lng),
  );

  // Only used for the map's INITIAL view — react-leaflet ignores
  // center/zoom prop changes after mount, which is what we want here
  // (the map shouldn't jump around every time the marker moves).
  const [initial] = useState(() => ({
    center: hasPin ? value : DEFAULT_CENTER,
    zoom: hasPin ? DEFAULT_ZOOM_WITH_PIN : DEFAULT_ZOOM_NO_PIN,
  }));

  // Set only when the pin should be re-centered programmatically
  // (search select / current location). Plain map clicks and marker
  // drags do NOT set this, since the map is already where it needs to be.
  const [flyTarget, setFlyTarget] = useState(null);

  // --- tile fallback ---
  const [useFallback, setUseFallback] = useState(false);
  const tileFailCount = useRef(0);
  const handleTileError = useCallback(() => {
    tileFailCount.current += 1;
    if (tileFailCount.current >= TILE_ERROR_THRESHOLD) {
      setUseFallback(true);
    }
  }, []);

  // --- search, triggered by typing in the single address input below ---
  const [query, setQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState("idle"); // idle | loading | results | no-results | error
  const [results, setResults] = useState([]);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < SEARCH_MIN_CHARS) {
      setSearchStatus("idle");
      setResults([]);
      return undefined;
    }

    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearchStatus("loading");
      try {
        const url =
          "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ph&q=" +
          encodeURIComponent(trimmed);
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error("search request failed");
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setResults(data);
          setSearchStatus("results");
          // Follow the top match automatically as the customer types —
          // the full list stays visible below so they can pick a
          // different one if the top match isn't the right spot.
          const top = data[0];
          const topLatLng = {
            lat: parseFloat(top.lat),
            lng: parseFloat(top.lon),
          };
          if (Number.isFinite(topLatLng.lat) && Number.isFinite(topLatLng.lng)) {
            onChange(topLatLng);
            setFlyTarget(topLatLng);
          }
        } else {
          setResults([]);
          setSearchStatus("no-results");
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        setResults([]);
        setSearchStatus("error");
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Every keystroke updates the parent's address text immediately (free
  // typing is always allowed) AND feeds the debounced search above.
  const handleAddressInputChange = (e) => {
    const text = e.target.value;
    onAddressChange(text);
    setQuery(text);
  };

  // --- current location ---
  const [locStatus, setLocStatus] = useState("idle"); // idle | loading | error
  const [locError, setLocError] = useState("");
  // Meters, from pos.coords.accuracy. Null once the pin changes for any
  // other reason (search, click, drag) — the accuracy figure only ever
  // describes the most recent geolocation result, never a stale one.
  const [locAccuracy, setLocAccuracy] = useState(null);

  const handleResultClick = (r) => {
    const next = { lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
    setLocAccuracy(null);
    onChange(next);
    setFlyTarget(next);
    onAddressChange(r.display_name);
    setResults([]);
    setSearchStatus("idle");
  };

  const handleUseCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocStatus("error");
      setLocError("Your browser does not support location services.");
      return;
    }
    setLocStatus("loading");
    setLocError("");
    // getCurrentPosition is only ever called from this click handler —
    // never automatically, and watchPosition is never used.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const accuracy = pos.coords.accuracy;

        // Desktop/network-based geolocation can occasionally resolve far
        // outside the expected service area. Don't silently drop a pin
        // there — leave the existing pin alone and ask the customer to
        // search or tap the map instead.
        if (!isWithinPhilippines(next.lat, next.lng)) {
          setLocStatus("error");
          setLocAccuracy(null);
          setLocError(
            "Your detected location looks like it's outside the expected service area. Please search for your address or tap the map instead.",
          );
          return;
        }

        setLocStatus("idle");
        setLocAccuracy(Number.isFinite(accuracy) ? accuracy : null);
        onChange(next);
        setFlyTarget(next);
      },
      (err) => {
        setLocStatus("error");
        if (err.code === err.PERMISSION_DENIED) {
          setLocError(
            "Location permission was denied. You can still search or tap the map.",
          );
        } else if (err.code === err.TIMEOUT) {
          setLocError("Getting your location timed out. Please try again.");
        } else {
          setLocError(
            "Your location is unavailable right now. Please try again.",
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleMarkerDragEnd = useCallback(
    (e) => {
      const pos = e.target.getLatLng();
      setLocAccuracy(null);
      onChange({ lat: pos.lat, lng: pos.lng });
    },
    [onChange],
  );

  const handleMapClick = useCallback(
    (latlng) => {
      setLocAccuracy(null);
      onChange(latlng);
    },
    [onChange],
  );

  return (
    <div className="location-picker">
      {label && (
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            color: "#333",
            marginBottom: 6,
          }}
        >
          {label}
        </label>
      )}

      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            value={addressValue || ""}
            onChange={handleAddressInputChange}
            placeholder="Street, Barangay, City, Province"
            style={{
              flex: "1 1 220px",
              minWidth: 0,
              padding: "8px 10px",
              border: "1px solid #d4d4d4",
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={locStatus === "loading"}
            style={{
              flex: "1 1 auto",
              padding: "8px 12px",
              border: "1px solid #d4d4d4",
              borderRadius: 8,
              background: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: locStatus === "loading" ? "default" : "pointer",
              whiteSpace: "nowrap",
              minHeight: 40,
            }}
          >
            {locStatus === "loading" ? "Locating..." : "Use My Current Location"}
          </button>
        </div>

        {/* Suggestions float over the map instead of pushing it down —
            keeps the whole component compact instead of growing a second
            stacked box every time there are results. */}
        {searchStatus === "results" && results.length > 0 && (
          <ul
            style={{
              position: "absolute",
              zIndex: 20,
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              listStyle: "none",
              padding: 0,
              background: "#fff",
              border: "1px solid #e2e2e2",
              borderRadius: 8,
              maxHeight: 160,
              overflowY: "auto",
              boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
            }}
          >
            {results.map((r) => (
              <li
                key={r.place_id}
                style={{ borderBottom: "1px solid #f0f0f0" }}
              >
                <button
                  type="button"
                  onClick={() => handleResultClick(r)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    padding: "8px 10px",
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {searchStatus === "loading" && (
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          Searching...
        </div>
      )}
      {searchStatus === "no-results" && (
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          No matching places found.
        </div>
      )}
      {searchStatus === "error" && (
        <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>
          Search is unavailable right now. Please try again.
        </div>
      )}
      {locStatus === "error" && locError && (
        <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>
          {locError}
        </div>
      )}

      <div
        style={{
          height,
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid #e2e2e2",
          marginTop: 8,
        }}
      >
        <MapContainer
          center={[initial.center.lat, initial.center.lng]}
          zoom={initial.zoom}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileFallbackLayer
            onTileError={handleTileError}
            useFallback={useFallback}
          />
          <ScrollZoomGate />
          <InvalidateSizeOnMount />
          <ClickHandler onSelect={handleMapClick} />
          <FlyToController target={flyTarget} />
          {hasPin && (
            <Marker
              position={[value.lat, value.lng]}
              draggable
              eventHandlers={{ dragend: handleMarkerDragEnd }}
            />
          )}
        </MapContainer>
      </div>

      {locAccuracy != null && (
        <div
          style={
            locAccuracy > POOR_ACCURACY_METERS
              ? {
                  fontSize: 12.5,
                  color: "#7c4a03",
                  background: "#fff7e6",
                  border: "1px solid #f5c563",
                  borderRadius: 8,
                  padding: "8px 10px",
                  marginTop: 8,
                  lineHeight: 1.4,
                }
              : { fontSize: 12, color: "#666", marginTop: 6 }
          }
        >
          {locAccuracy > POOR_ACCURACY_METERS ? (
            <>
              ⚠️ Your detected location is only accurate to about{" "}
              {Math.round(locAccuracy)} meters — this is common on
              desktop/Wi-Fi. Please <strong>drag the pin</strong> to your
              exact delivery point.
            </>
          ) : (
            <>Estimated accuracy: about {Math.round(locAccuracy)} meters</>
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          rowGap: 4,
          marginTop: 8,
          fontSize: 12,
          color: "#666",
        }}
      >
        <span style={{ minWidth: 0 }}>
          {hasPin
            ? `Pin set at ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`
            : "Type above, tap the map, or use your current location to set a pin."}
        </span>
        {hasPin && (
          <button
            type="button"
            onClick={() => {
              setLocAccuracy(null);
              onChange(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "#b91c1c",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              padding: 0,
            }}
          >
            Clear pin
          </button>
        )}
      </div>
    </div>
  );
}