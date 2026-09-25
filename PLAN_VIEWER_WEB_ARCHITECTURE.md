# InspectHero (`et4u`) — Web Plan Viewer Architecture & Reverse Engineering (Phase 2)

## Reverse-Engineered Blueprint of Web Plan Viewer

This document specifies the exact rendering engine, coordinate systems, layer composition, vector SVG generators, and interaction handlers in `web/src/components/PlanMap.tsx`, `StromkreiseMap.tsx`, and `PlanBmaSymbolsModule.tsx`.

---

### 1. Coordinate System & Geometry

* **Base Coordinate Space:** `L.CRS.Simple` (Flat Cartesian coordinate system where `y` grows downward or upward depending on origin).
* **Normalized Model Space:** Every marker coordinate is normalized to the unit interval $[0.0, 1.0] \times [0.0, 1.0]$:
  $$x_{\text{norm}} = \frac{x_{\text{px}}}{\text{image\_width}},\quad y_{\text{norm}} = \frac{y_{\text{px}}}{\text{image\_height}}$$
* **Tile Transformation:**
  $$\text{Leaflet LatLng} = \left[ -y_{\text{norm}} \cdot \frac{\text{height}}{2^{\text{maxZoom}}}, x_{\text{norm}} \cdot \frac{\text{width}}{2^{\text{maxZoom}}} \right]$$

---

### 2. SVG Symbol Generation Pipeline

```text
Record from SQLite / API
  ↓
Extract { type, fuse_type, breaker_current, metadata.rotation, status }
  ↓
Select Vector SVG Template (DIN 40900 / DIN EN 54)
  ↓
Apply CSS Transform rotate({deg}) + Status Halo Color
  ↓
Wrap in L.divIcon({ html: svgMarkup, className: 'custom-svg-pin' })
  ↓
Add to L.featureGroup layer on Map
```

---

### 3. Orthogonal Bus Routing Engine (`makeStrictOrthoPolyline`)

* **Rule:** Cable trays, BMA loops, and UV feeder connections must strictly follow building corridors at $90^\circ$ right angles (no diagonal shortcuts across architectural walls).
* **Algorithm:** For any two connected nodes $P_A(x_1, y_1)$ and $P_B(x_2, y_2)$, compute corner vertex $C$:
  $$C = \begin{cases} (x_2, y_1) & \text{if } |x_2 - x_1| \ge |y_2 - y_1| \\ (x_1, y_2) & \text{if } |x_2 - x_1| < |y_2 - y_1| \end{cases}$$
* **Rendering:** Injected as `L.polyline([ [lat1, lng1], [latC, lngC], [lat2, lng2] ], { color: '#0284C7', weight: 3, opacity: 0.85 })`.
