# InspectHero (`et4u`) — 6-Level Deep UI & Data-Context Parity Matrix

## Forensic Web ↔ Mobile Comparison Across All Architectural Layers

**Level 1: Route Parity** (Does the route exist?)  
**Level 2: Screen Parity** (Is the screen model present?)  
**Level 3: Data Parity** (Are all DB/API fields fetched and stored?)  
**Level 4: Component Parity** (Are all sub-components, drawers, and overlays present?)  
**Level 5: Visual Parity** (Are exact vector symbols, layout density, and glyphs rendered?)  
**Level 6: Interaction Parity** (Can all user actions, drags, approvals, and connections be executed?)

---

| Feature / Domain | Web Route & Component | Mobile Route & Component | L1 Route | L2 Screen | L3 Data | L4 Component | L5 Visual | L6 Interaction | Deep Status | Root Cause & Failure Evidence |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| **Plan Viewer: Base PDF & Tiles** | `/plan/[id]` (`PlanMap.tsx`) | `app/plans/[id].tsx` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **FULL_MATCH** | Leaflet in WebView + TileCacheService offline file system. |
| **Plan Viewer: Vector SVG Symbols** | `/plan/[id]` (`PlanBmaSymbolsModule.tsx`, `StromkreiseMap.tsx`) | `app/plans/[id].tsx` | ✅ | ✅ | ⚠️ | ❌ | ❌ | ❌ | **SVG_LAYER_MISSING** | Web renders 35+ DIN/VDE SVG symbols; Mobile degrades them into generic colored circle divs with emojis. |
| **Plan Viewer: Orthogonal Cable Routes** | `/plan/[id]` (`makeStrictOrthoPolyline`) | `app/plans/[id].tsx` | ✅ | ✅ | ⚠️ | ❌ | ❌ | ❌ | **VISUAL_INFORMATION_LOSS** | Web draws 90° snapped vector bus lines; Mobile lacks polyline rendering on map. |
| **Plan Viewer: Measurement Ruler & Scale** | `/plan/[id]` (`PlanMeasurementModule.tsx`) | `app/plans/[id].tsx` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | **COMPONENT_MISSING** | Web allows calibrating meters-per-pixel and distance measurement; Mobile has no ruler tool. |
| **Plan Viewer: Favorite Plans Carousel** | `/plan/[id]` (`PlanPageClient.tsx:148`) | `app/plans/[id].tsx` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | **NAVIGATION_GAP** | Web has top quick-switch carousel; Mobile requires navigating back to project screen. |
| **Plan Viewer: Deep Link Auto-Focus** | `/plan/[id]?taskId=...` | `app/plans/[id].tsx` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | **INTERACTION_GAP** | Web auto-pans and highlights selected pin; Mobile opens plan at default zoom center. |
| **Task Management: 5-Status Workflow** | `/task/[id]` (`TaskDrawer.tsx`) | `app/tasks/[id].tsx` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | **BEHAVIOR_MISMATCH** | Web has 5 enum states; Mobile hardcodes 3 lowercase strings, breaking supervisor approval. |
| **Task Management: Assignee & Due Date** | `/task/[id]` (`TaskDrawer.tsx`) | `app/tasks/[id].tsx` | ✅ | ✅ | ⚠️ | ❌ | ❌ | ❌ | **DATA_PRESENT_UI_MISSING** | SQLite has `assigned_user_id` and `due_date`, but Mobile JSX lacks the input controls. |
| **Task Management: Vorher/Nachher Photo Typing**| `/task/[id]` (`TaskDrawer.tsx:185`) | `app/tasks/[id].tsx` | ✅ | ✅ | ⚠️ | ❌ | ❌ | ❌ | **VISUAL_INFORMATION_LOSS** | Web tags photos as `BEFORE`/`AFTER` with GPS watermarking; Mobile stores untyped raw photos. |
| **Task Management: In-Task Material Ordering** | `/task/[id]` (`TaskDrawer.tsx:196`) | `app/tasks/[id].tsx` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | **COMPONENT_MISSING** | Web has embedded material search and cart adding in Task Drawer; Mobile lacks this entirely. |
| **Task Management: Audit History Log** | `/task/[id]` (`TaskDrawer.tsx:323`) | `app/tasks/[id].tsx` | ✅ | ✅ | ⚠️ | ❌ | ❌ | ❌ | **DATA_PRESENT_UI_MISSING** | `task_history` is in DB, but Mobile does not query or render the timeline. |
| **Home Dashboard: Active Task Feed & Filters** | `/` (`HomeClient.tsx:94-135`) | `app/index.tsx` | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | **MAJOR_INFORMATION_DENSITY_LOSS** | Web displays full task feed with 5 filters; Mobile only shows 3 count boxes and navigation tiles. |
| **Cables: Detail Drawer & Drum Optimizer** | `/cables` (`CableDrawer.tsx`) | `app/cables/index.tsx` | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | **INTERACTION_GAP** | Web opens full editor with `findBestTrommel`; Mobile only toggles status on row tap. |
| **Cables: Thermal Label Printing (QR)** | `/cables` (`CableDrawer.tsx:120`) | `app/cables/index.tsx` | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | **COMPONENT_MISSING** | Web formats Brother/Zebra labels; Mobile has no label printing module. |
| **Materials: Past Order History** | `/materials` (`app/materials/page.tsx`) | `app/orders/index.tsx` | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | **DATA_PRESENT_UI_MISSING** | Web lists past orders with status pills; Mobile only displays active cart checkout. |
| **Mängelanzeige: Defect Response & Camera** | `/maengelanzeige` | `app/maengelanzeige/index.tsx` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **FULL_MATCH** | Defect cards, photo review, and repair status updates function smoothly. |
| **Mängelanzeige: Client PDF Compiler** | `/maengelanzeige` (`MaengelanzeigePdf.tsx`)| None | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | **WEB_ONLY** | Heavy client-side `@react-pdf/renderer` document generator executed on Web. |
| **Aufmass: Polygon Area Drawing Canvas** | `/aufmass/[id]` (`AufmassCanvas.tsx`) | `app/aufmass/index.tsx` | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | **SVG_LAYER_MISSING** | Web features HTML5 vector polygon drawing on plan; Mobile only displays session metadata. |
| **Zeiterfassung: Work Time & Vacations** | `/admin/attendance-calendar` | `app/attendance/index.tsx` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **FULL_MATCH** | Start/End/Break calculation, Vacation selector, and monthly KPI balance fully matched. |
| **BMA: Loop Topology & Detector Pins** | `/bma-automation` | `app/bma/index.tsx` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | **PARTIAL** | Mobile displays detector list & loop cards, but lacks orthogonal bus lines on floor plan. |
| **Stromkreise: Distribution Boards** | `/stromkreise` (`StromkreiseClient.tsx`) | `app/circuits/index.tsx` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | **PARTIAL** | Circuit cards & fuse ratings mapped to plans; line arrow feeder routes missing in Mobile map. |
| **CAD Ingestion: PDF Tiling & OpenCV** | `/plans/upload` | None | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | **INTENTIONAL_WEB_ONLY** | Heavy server sidecar CPU process. |
| **AI Lab: YOLO Annotator & Confusion Matrix** | `/admin/symbol-*` | None | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | **INTENTIONAL_WEB_ONLY** | AI training and model evaluation console. |
