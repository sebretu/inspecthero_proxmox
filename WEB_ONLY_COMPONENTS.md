# InspectHero (`et4u`) — Web-Only Component Inventory

This inventory documents every React web component in `web/src/components/` that currently lacks a direct mobile counterpart in `apps/mobile/src/`.

---

| Component Path | Name | Business Purpose | Category | Recommendation for Mobile |
| :--- | :--- | :--- | :--- | :--- |
| `web/src/components/TaskDrawer.tsx` | TaskDrawer | Full slide-over task editor with Assignee, Due Date, Vorher/Nachher photo typing, and Approval buttons | Field Critical | **REMEDIATE TO NATIVE BOTTOM SHEET** |
| `web/src/components/CableDrawer.tsx` | CableDrawer | Slide-over cable editor with drum optimizer (`findBestTrommel`), route waypoints, and QA verification | Field Critical | **REMEDIATE TO NATIVE BOTTOM SHEET** |
| `web/src/components/PlanMeasurementModule.tsx` | PlanMeasurementModule | Distance measurement ruler & scale calibration on blueprints | Field Critical | **PORT TO LEAFLET WEBVIEW LAYER** |
| `web/src/components/PhotoLightbox.tsx` | PhotoLightbox | Fullscreen image zoom, pan, rotation, and watermark inspector | Field Useful | **PORT USING EXPO-IMAGE LIGHTBOX** |
| `web/src/components/aufmass/AufmassCanvas.tsx` | AufmassCanvas | Interactive multi-vertex polygon area drafting tool on plan | Field Useful | **PORT TO LEAFLET VECTOR LAYER** |
| `web/src/components/Et4uBentoHero.tsx` | Et4uBentoHero | Interactive Bento grid summary with task counters and live activity feed | UI/UX Enhancement | **ADAPT TO NATIVE MOBILE DASHBOARD** |
| `web/src/components/BulkTrommelReportModal.tsx` | BulkTrommelReportModal | Batch drum return and inventory summary PDF generator | Back-Office | **INTENTIONAL WEB ONLY** |
| `web/src/components/StandalonePdfEditor/*` | StandalonePdfEditor | Desktop PDF page splitting, rotation, and re-ordering canvas | Back-Office | **INTENTIONAL WEB ONLY** |
| `web/src/components/SymbolDetectionMap.tsx` | SymbolDetectionMap | AI YOLO symbol bounding box annotation and dataset validation | AI Lab | **INTENTIONAL WEB ONLY** |
