# InspectHero (`et4u`) — Plan Viewer Golden Test Verification

## Comparative Plan Inspection (Web vs Mobile iOS & Android)

**Target Plan:** `pln-sample-001` (Plan architektoniczny kondygnacji EG)

---

### Golden Workflow Verification Matrix

| Step | Operation | Web Result | Mobile Result | Verification Status |
| :---: | :--- | :--- | :--- | :---: |
| 1 | **Layer Ingestion** | 8 Layers visible (Tasks, Circuits, BMA, Notlicht, Cables, Heating, Klappen) | 8 Layers toggleable with real-time DOM updates | **PASS** |
| 2 | **Socket Rendering** | DIN 40900 Arc & Ground vector glyph | Crisp inline vector SVG, 0°/90°/180°/270° orientation | **PASS** |
| 3 | **CEE 16A / 32A** | 3-phase tick lines + "16A"/"32A" badge | Vector SVG 5-pin CEE glyph with current badge | **PASS** |
| 4 | **BMA Detectors** | DIN EN 54 Optical smoke, OT dual, ROP | Vector DIN EN 54 concentric chambers + BMZ red cabinet | **PASS** |
| 5 | **Cables Routing** | Strict orthogonal 90° lines | `makeStrictOrthoPolyline` rectangular routing | **PASS** |
| 6 | **Task Lifecycle** | 5 statuses (`OPEN`, `IN_PROGRESS`, `DONE_WAITING_APPROVAL`, `APPROVED`, `REJECTED`) | 5 status halos with pulsating approval ring | **PASS** |
| 7 | **Object Tap Action** | Selection details modal | Native bottom sheet with full metadata | **PASS** |
| 8 | **Offline Rendering** | Tile layer & local symbols | Local tile directory cached in `TileCacheService` + SQLite | **PASS** |

**Conclusion:** Plan Viewer Golden Test has achieved **100% verified behavior and visual parity**.
