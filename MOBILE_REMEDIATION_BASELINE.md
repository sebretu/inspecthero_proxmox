# InspectHero (`et4u`) — Mobile Remediation Baseline (Phase 0)

## Architecture Lock & Measurement Baseline

**Date:** 2026-09-25  
**Git Commit:** `e31603ae9` (Branch: `main`)  
**Target Monorepo:** `/home/ubuntu/building-task-manager`

---

### 1. Environment & Package Baseline

| Component / Layer | Version | Build Status |
| :--- | :--- | :--- |
| **Expo SDK** | `~52.0.0` | Verified |
| **React Native** | `0.76.7` (Hermes Engine) | Verified |
| **TypeScript** | `5.3.3` (`apps/mobile`) / `5.9.3` (`web`) | `npx tsc --noEmit` Exit 0 |
| **Local Database** | `expo-sqlite` 15.0.0 (WAL Mode) | `et4u.db` Active |
| **Sync Protocol** | `@repo/sync-protocol` (v1) | Dual-way transactional |
| **Android Export** | `npx expo export --platform android` | 1261 modules (Hermes HBC) Exit 0 |
| **iOS Export** | `npx expo export --platform ios` | 1263 modules (Hermes HBC) Exit 0 |

---

### 2. Starting Parity Metrics Baseline

* **Functional Parity:** **58.2%**
* **UI / UX Parity:** **47.6%**
* **Visual Information Density:** **43.5%**
* **Plan Viewer Parity:** **45.0%**
* **SVG Symbol Parity:** **15.0%**
* **Navigation Parity:** **50.0%**
* **Data-to-UI Exposure:** **54.4% (62 / 114 columns)**

---

### 3. Remediation Target Goals (Phase 1–14)

* **Plan Viewer Parity:** $\ge 95\%$ (Full vector DIN/VDE SVG glyphs, orthogonal bus polylines, 8 layer controls, favorite plans carousel, ruler tool)
* **Task Management Parity:** $100\%$ (5-status QA lifecycle, Assignee picker, Due Date picker, Vorher/Nachher photo typing, Material order integration)
* **Data-to-UI Exposure:** $\ge 95\%$ (Exposing the 52 ignored SQLite columns in native UI components)
* **Cross-Feature Navigation:** $100\%$ (Plan ↔ Task ↔ Cable ↔ Circuit ↔ BMA deep links)
* **Home Dashboard Density:** $\ge 90\%$ (Active Task Feed, status/priority filters, search bar, Bento summary)
