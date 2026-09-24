# InspectHero — Current System Architecture & Technical Audit

> **DOCUMENT TYPE:** Stage 0 Master Audit Artifact  
> **REPO LOCATION:** `/home/ubuntu/building-task-manager`  
> **DATE:** 2026-09-24  
> **STATUS:** Verified against live code and database migrations

---

## 1. Architecture Overview

InspectHero is a multi-tenant construction and electrical installation management platform supporting blueprint CAD/PDF rendering, real-time pin workflows, fire alarm (BMA) symbol detection, cable routing, switchboard circuits (Stromkreise), orders, and attendance.

```text
+---------------------------------------------------------------------------------------------------+
|                                            CLIENT LAYER                                           |
|  - Web Application: Next.js 16.1.6 (React 19.2.3, Tailwind CSS 4.2.0, Lucide Icons)              |
|  - Native Shell: Capacitor 8.1.0 (Camera, Geolocation, Network, Preferences, Push Notifications)   |
|  - Mapping & Visuals: React-Leaflet 5.0 (CRS.Simple coordinate space), React-Konva 19.2.4 (2D)   |
|  - Web Offline: IndexedDB Storage (IDBStorage) + MutationQueue + SyncService                      |
+-------------------------------------------------+-------------------------------------------------+
                                                  | HTTPS / REST / JSON / FormData / Bearer JWT
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                      SERVER LAYER (Node.js)                                       |
|                                                                                                   |
|  [ Hybrid Router ]                                                                                |
|  - Pages API Router (src/pages/api/*) : 90% of business endpoints (Tasks, Cables, BMA, Users)   |
|  - App Router (src/app/api/*)         : Tile server (/api/tiles), Reports, QR Decode             |
|                                                                                                   |
|  [ Authentication & Authorization Layer ]                                                         |
|  - supabaseServer.ts   : Bearer token extraction, profile fetching, client factory                |
|  - requesterProfile.ts : In-memory profile & permission cache (TTL 30s), role check (ADMIN/MOD)  |
|                                                                                                   |
|  [ Processing Subsystems ]                                                                        |
|  - PDF & OCR Engine    : pdfjs-dist, Tesseract.js, PDF-Lib                                       |
|  - AI Integration      : Vercel AI SDK (@ai-sdk/openai), OpenAI GPT-4o                            |
|  - Geometry & Tiling   : Sharp/Canvas tile generator, coordinate transformations                  |
+-------------------+-----------------------------+-----------------------------+-------------------+
                    |                             |                             |
                    v                             v                             v
+------------------------------------+ +--------------------+ +------------------------------------+
|        SUPABASE / POSTGRESQL       | |   PARSER-SIDECAR   | |         EXTERNAL SERVICES        |
| - Postgres 16 (PostgREST + RLS)    | | (FastAPI / Py3.11) | | - Resend API (Transactional Email)|
| - Schemas: public, auth, storage   | | - PyMuPDF (fitz)   | | - Telegram Bot API (Webhooks)    |
| - 88 SQL Migrations, Triggers, RPC | | - OpenCV / NumPy   | | - Brother Label Web API          |
| - Supabase Storage (S3 S3-compat)  | | - Port 8001        | | - OpenAI API (Vision & GPT-4o)   |
+------------------------------------+ +--------------------+ +------------------------------------+
```

---

## 2. Database & Domain Tables Inventory

### Key Domain Tables & Metadata

| Table | Primary Key | Foreign Keys & Tenant Path | `updated_at` | Version Field | Delete Semantics | RLS Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`companies`** | `id` (UUID) | Root tenant entity | Yes (`updated_at`) | None | Hard DELETE | Enabled (`id = current_company_id()`) |
| **`profiles`** | `id` (UUID -> `auth.users`) | `company_id -> companies(id)` | Yes (`updated_at`) | None | Hard DELETE | Enabled (Filtered by `company_id`) |
| **`projects`** | `id` (UUID) | `company_id -> companies(id)` | Yes (`updated_at`) | None | Hard DELETE / Cascade | Enabled (Member/Company RLS) |
| **`project_members`** | `(project_id, user_id)` | `project_id -> projects(id)`, `user_id -> profiles(id)` | No | None | Hard DELETE | Enabled |
| **`buildings`** | `id` (UUID) | `project_id -> projects(id)` | Yes (`updated_at`) | None | Cascade DELETE | Enabled |
| **`floors`** | `id` (UUID) | `building_id -> buildings(id)` | Yes (`updated_at`) | None | Cascade DELETE | Enabled |
| **`plans`** | `id` (UUID) | `floor_id -> floors(id)`, `project_id -> projects(id)` | Yes (`updated_at`) | Yes (`plan_versions` table) | Soft status / Cascade | Enabled |
| **`tasks`** | `id` (UUID) | `plan_id -> plans(id)` $\to$ `floors` $\to$ `buildings` $\to$ `projects` | Yes (`updated_at`) | `task_history` audit log | Hard DELETE / Trigger log | Enabled (Trigger workflow `trg_tasks_workflow`) |
| **`task_photos`** | `id` (UUID) | `task_id -> tasks(id)` | Yes (`created_at`) | None | Hard DELETE | Enabled |
| **`task_comments`** | `id` (UUID) | `task_id -> tasks(id)`, `user_id -> profiles(id)` | Yes (`created_at`) | None | Append-only / Hard DELETE | Enabled |
| **`task_history`** | `id` (UUID) | `task_id -> tasks(id)`, `user_id -> profiles(id)` | Yes (`created_at`) | None | Append-only | Enabled |
| **`cables`** | `id` (UUID) | `plan_id -> plans(id)`, `trommel_id -> trommels(id)` | Yes (`updated_at`) | `cable_history` | Hard DELETE | Enabled |
| **`trommels`** | `id` (UUID) | `project_id -> projects(id)`, `company_id -> companies(id)` | Yes (`updated_at`) | None | Hard DELETE / Archived flag | Enabled |
| **`cable_routes`** | `id` (UUID) | `plan_id -> plans(id)` | Yes (`updated_at`) | None | Hard DELETE | Enabled |
| **`cable_buses`** | `id` (UUID) | `project_id -> projects(id)` | Yes (`updated_at`) | None | Hard DELETE | Enabled |
| **`cable_bus_nodes`** | `id` (UUID) | `bus_id -> cable_buses(id)`, `plan_id -> plans(id)` | Yes (`created_at`) | None | Hard DELETE | Enabled |
| **`bma_devices`** | `id` (UUID) | `plan_id -> plans(id)` | Yes (`updated_at`) | Snapshots | Hard DELETE | Enabled |
| **`bma_connections`** | `id` (UUID) | `project_id -> projects(id)` | Yes (`updated_at`) | Snapshots | Hard DELETE | Enabled |
| **`stromkreise`** | `id` (UUID) | `plan_id -> plans(id)` | Yes (`updated_at`) | `stromkreis_history` | Hard DELETE | Enabled |
| **`materials`** | `id` (UUID) | `company_id -> companies(id)` | Yes (`updated_at`) | None | Hard DELETE | Enabled |
| **`material_categories`**| `id` (UUID) | `company_id -> companies(id)` | Yes (`created_at`) | None | Hard DELETE | Enabled |
| **`orders`** | `id` (UUID) | `company_id -> companies(id)`, `user_id -> profiles(id)`, `task_id -> tasks(id)` | Yes (`updated_at`) | None | Hard DELETE | Enabled |
| **`order_items`** | `id` (UUID) | `order_id -> orders(id)`, `material_id -> materials(id)` | Yes (`created_at`) | None | Hard DELETE | Enabled |
| **`attendance`** | `id` (UUID) | `company_id -> companies(id)`, `user_id -> profiles(id)` | Yes (`updated_at`) | None | Hard DELETE | Enabled |
| **`revisions`** | `id` (UUID) | `plan_id -> plans(id)` | Yes (`updated_at`) | None | Hard DELETE | Enabled |
| **`vde_protocols`** | `id` (UUID) | `plan_id -> plans(id)`, `project_id -> projects(id)` | Yes (`updated_at`) | None | Hard DELETE | Enabled |
| **`maengelanzeige`** | `id` (UUID) | `project_id -> projects(id)`, `company_id -> companies(id)` | Yes (`updated_at`) | None | Hard DELETE | Enabled |

---

## 3. Authorization & Tenant Graph

```text
auth.users (Supabase Auth ID)
    │
    ▼
public.profiles (id = auth.users.id, role: 'admin' | 'mod' | 'user', company_id)
    │
    ├───► public.companies (Tenant Boundary)
    │        │
    │        ├───► materials, material_categories, attendance, maengelanzeige, trommels
    │        │
    │        └───► public.projects (company_id)
    │                 │
    │                 ├───► project_members (project_id, user_id)
    │                 │
    │                 ├───► cable_buses, bma_connections, trommels, orders
    │                 │
    │                 └───► public.buildings (project_id)
    │                          │
    │                          └───► public.floors (building_id)
    │                                   │
    │                                   └───► public.plans (floor_id, project_id)
    │                                            │
    │                                            ├───► tasks (plan_id)
    │                                            │        ├───► task_photos (task_id)
    │                                            │        ├───► task_comments (task_id)
    │                                            │        └───► task_history (task_id)
    │                                            │
    │                                            ├───► cables (plan_id)
    │                                            ├───► cable_routes (plan_id)
    │                                            ├───► cable_bus_nodes (plan_id)
    │                                            ├───► bma_devices (plan_id)
    │                                            ├───► stromkreise (plan_id)
    │                                            ├───► revisions (plan_id)
    │                                            └───► vde_protocols (plan_id)
```

> [!IMPORTANT]
> **Tenant Traversal Rule:** Tables like `tasks`, `cables`, `bma_devices`, and `stromkreise` do not have a direct `company_id` column. They derive their tenancy through `plan_id` $\to$ `floor_id` $\to$ `building_id` $\to$ `project_id` $\to$ `company_id` or `project_members`.

---

## 4. API Inventory & Security Classification

### Key API Routes in `web/src/pages/api/` and `web/src/app/api/`

| Method | Path | Purpose | Auth Mechanism | Tenant / Project Validation | Service Role | Risk / Vulnerability |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET, POST, PATCH, DELETE` | `/api/tasks` | Task lifecycle & management | Bearer JWT / Cookie | Via `ensureProjectMembership` & RLS | Yes (for admin bypass & notifications) | Medium (state machine trigger enforced) |
| `GET, POST, DELETE` | `/api/task-photos` | Task photo uploads/listing | Bearer JWT | Via task membership | Yes | Low |
| `GET, POST, DELETE` | `/api/task-comments` | Task discussion comments | Bearer JWT | Via task membership | Yes | Low (Append-only) |
| `GET, POST, PATCH, DELETE` | `/api/cables` | Cable management & approval | Bearer JWT | Via project membership | Yes | Low |
| `GET, POST, DELETE` | `/api/cable-categories` | Manage cable categories | None | None | Yes | 🔴 **CRITICAL (SEC-04 RLS Bypass)** |
| `GET, POST, PATCH, DELETE` | `/api/trommels` | Drum lengths & meter status | Bearer JWT | Via `project_id` / `company_id` | Yes | Low |
| `GET, POST, PATCH, DELETE` | `/api/bma/devices` | BMA smoke/heat detector pins | Bearer JWT | Via `plan_id` membership | Yes | Low |
| `POST` | `/api/bma/scan` | OCR & Regex BMA scanning | Bearer JWT | Via request plan | No | 🟠 **HIGH (SEC-06 ReDoS risk)** |
| `GET, POST, PATCH, DELETE` | `/api/stromkreise` | Fuse circuit management | Bearer JWT | Via `plan_id` membership | Yes | Low |
| `GET, POST, PATCH, DELETE` | `/api/materials` | Material master catalog | Base64 decode (`getUserIdFromRequest`) | Tenant via profile query | Yes | 🔴 **CRITICAL (SEC-02 JWT Bypass)** |
| `GET, POST, PATCH, DELETE` | `/api/orders` | Material purchase orders | Base64 decode (`getUserIdFromRequest`) | Tenant via profile query | Yes | 🔴 **CRITICAL (SEC-02 JWT Bypass)** |
| `GET, POST, PATCH, DELETE` | `/api/attendance` | Time tracking / HR | Bearer JWT | Missing tenant filter on Mod | Yes | 🟠 **HIGH (SEC-08 Cross-tenant IDOR)** |
| `POST` | `/api/users` | User invitation & management | Bearer JWT (Admin) | Admin check | Yes | 🔴 **CRITICAL (SEC-03 Account Takeover)** |
| `GET` | `/api/download-photo` | Proxied photo downloader | Query `?url=` (None) | None | No | 🔴 **CRITICAL (SEC-01 SSRF)** |
| `POST` | `/api/telegram-webhook` | Telegram inline approvals | None / Chat ID check | None (No secret token header) | Yes | 🟠 **HIGH (SEC-07 Webhook Spoofing)** |
| `GET` | `/api/debug-users` | Dump user profiles | None | None | Yes | 🔴 **CRITICAL (SEC-04 Data leak)** |
| `GET` | `/api/sync-users` | Trigger user sync | None | None | Yes | 🔴 **CRITICAL (SEC-04 Data leak)** |

---

## 5. Web Offline Subsystem

InspectHero currently has a client-side web offline engine located in `web/src/lib/offline/`:
1. **`idb.ts` (`IDBStorage`)**: IndexedDB wrapper for caching projects, plans, tasks, photos, and current user profile.
2. **`queue.ts` (`MutationQueue`)**: FIFO queue stored in IndexedDB under key `mutation_queue` with types `CREATE`, `UPDATE`, `DELETE`, `CREATE_COMPOSITE_TASK`. Tracks `id`, `resource`, `data`, `timestamp`, `retryCount` (max 3 retries).
3. **`sync.ts` (`SyncService`)**: Listens to `@capacitor/network` `networkStatusChange` and window `online` / `sync-requested` events. Sequentially drains `MutationQueue` by issuing standard HTTP requests (`/api/tasks`, `/api/task-photos`, etc.).
4. **`prefetch.ts`**: Prefetches plan metadata, task lists, and raster tiles into IndexedDB and CacheStorage for offline viewing.

> [!NOTE]
> **Preservation Rule:** The existing Web IndexedDB offline system must remain completely untouched and operational. The upcoming Expo Mobile offline subsystem will operate independently using `SQLite` and the dedicated `/api/sync/pull` + `/api/sync/push` engine.

---

## 6. Known Risks & Remediation Map

| Risk ID | Severity | Location | Summary | Recommended Fix (Stage 1) |
| :--- | :---: | :--- | :--- | :--- |
| **SEC-01** | 🔴 CRITICAL | `src/pages/api/download-photo.ts` | SSRF allows requesting internal IPs and metadata services. | Restrict to allowed Supabase storage URLs or signed storage tokens; block private IP ranges. |
| **SEC-02** | 🔴 CRITICAL | `src/lib/supabaseServer.ts`, `materials.ts`, `orders.ts` | Unverified base64 JWT payload decode (`getUserIdFromRequest`). | Replace with cryptographic verification via `supabase.auth.getUser(token)`. |
| **SEC-03** | 🔴 CRITICAL | `src/pages/api/users.ts` | Overwriting existing passwords on duplicate email invite. | Return 409 Conflict if user exists in another tenant; do not overwrite password. |
| **SEC-04** | 🔴 CRITICAL | `cable-categories.ts`, `debug-users.ts`, `sync-users.ts` | Unauthenticated endpoints with full `service_role` DB access. | Require admin auth on `cable-categories.ts`; delete or protect debug endpoints. |
| **SEC-05** | 🟠 HIGH | `src/pages/api/send-email.ts` | Hardcoded Resend API key fallback. | Remove hardcoded fallback; read strictly from `process.env.RESEND_API_KEY`. |
| **SEC-06** | 🟠 HIGH | `src/pages/api/bma/scan.ts` | Client-supplied regex in `new RegExp(regex)` (ReDoS). | Validate and sanitize regex or use predefined safe pattern tokens. |
| **SEC-07** | 🟠 HIGH | `src/pages/api/telegram-webhook.ts` | Webhook verification bypass (missing secret header). | Validate `X-Telegram-Bot-Api-Secret-Token` on every incoming webhook call. |
| **SEC-08** | 🟠 HIGH | `src/pages/api/attendance.ts` | Moderator cross-tenant deletion/update (IDOR). | Enforce `company_id` filter on all attendance database mutations. |
