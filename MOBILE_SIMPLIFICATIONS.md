# InspectHero (`et4u`) — Mobile Simplifications & Degradation Inventory

This document identifies all areas where the mobile implementation replaced rich, structured domain logic with simplified prototypes, mock logic, or generic placeholders.

---

### 1. Hardcoded Status Simplification (Tasks)
* **Location:** `apps/mobile/app/tasks/[id].tsx:203-211`
* **Simplification:** Replaced the 5-state PostgreSQL enum (`OPEN`, `IN_PROGRESS`, `DONE_WAITING_APPROVAL`, `APPROVED`, `REJECTED`) with a 3-element hardcoded array: `['open', 'in_progress', 'closed']`.
* **Consequence:** Breaks the fundamental QA approval lifecycle on mobile devices.

---

### 2. Generic Div Markers Instead of Vector SVG Symbols
* **Location:** `apps/mobile/app/plans/[id].tsx:94-159`
* **Simplification:** Replaced precise DIN 40900 / DIN EN 54 vector CAD symbols with generic circular `<div>` containers containing emojis (e.g. `🔌`, `🚨`, `⚡`).
* **Consequence:** Plan looks like a generic map app rather than a professional electrical/CAD blueprint viewer.

---

### 3. Untyped Photo Array (Loss of Vorher/Nachher)
* **Location:** `apps/mobile/app/tasks/[id].tsx:321-340` & `PhotoService.ts`
* **Simplification:** Photos are uploaded and rendered in an untyped horizontal scrollview without separating them into `BEFORE` (Przed) and `AFTER` (Po) phases or enforcing the mandatory Nachher photo rule before completion.
* **Consequence:** Documentation cannot be directly converted into official construction acceptance protocols.

---

### 4. Omission of Cable Details & Drum Assignment
* **Location:** `apps/mobile/app/cables/index.tsx:115-125`
* **Simplification:** Tapping a cable immediately mutates its status in SQLite without opening a drawer, preventing electricians from viewing or adjusting the pulled length, drum assignment, or route notes.
* **Consequence:** Electricians must rely on Web to edit cable metadata.

---

### 5. Absence of Active Task Feed on Home Dashboard
* **Location:** `apps/mobile/app/index.tsx`
* **Simplification:** Replaced the entire interactive Home task table and multi-dimensional filters with 3 static count boxes (`Projekte`, `Aufgaben`, `Sync-Warteschlange`).
* **Consequence:** Workers cannot see what needs to be done today directly upon opening the app.
