# AI_CONTEXT.md — Al-Nukhba Express
**Compact bootstrap for new AI sessions. Read this first. Consult other docs only for detail.**
Last updated: P5 Merchant Webhooks + REST API

---

## Project in One Paragraph

Al-Nukhba Express is an Arabic RTL enterprise logistics SaaS (comparable to Bosta/Mylerz) built with **Vanilla JS + Supabase + GitHub Pages**. No build step. One `app.js` (~6,700 lines), one `styles.css` (~1,070 lines), one `index.html` shell. All persistence through Supabase (Postgres + Auth + Storage + Realtime). Four active user roles: Admin, Merchant, Courier, Customer.

---

## Current Status

| Item | Value |
|---|---|
| **Current phase** | Post-roadmap stabilization — all phases shipped + 8 extra features |
| **Last completed** | SMS Provider — Twilio/Vonage/HTTP Gateway + admin settings modal + test button |
| **Next action** | P6: Scalability — cursor-based pagination in loadShipments, virtual scroll, AppState memory management |
| **Live URL** | `https://oloom2006sec.github.io/Shipping-Plattform/` |
| **Supabase project** | `urktddxiyzwsilddamci` (London) |
| **Local path** | `C:\Users\AMY\shipping-platform\Shipping-Plattform` |

---

## Completed Phases

| Phase | What was built |
|---|---|
| 0 | Foundation schema: profiles, RBAC (10 roles, 96 permissions), shipments, audit |
| 1 | 13-status shipment lifecycle, service/order types, weight/dims/barcode, OTP columns |
| 2A | Merchant portal: addresses, recipients, products, pickup requests, COD ledger |
| 2A-Admin | Admin cross-merchant management view |
| 2B | Finance: driver wallets, COD reconciliation, invoices, expenses |
| 2C | Pricing engine: zones, rules, auto-calculate fee, simulator |
| 2D | Branches & warehouses with branch log |
| 3 (partial) | Driver self-service wallet view. OTP backend methods written, UI pending. |
| 3 (OTP) | OTP delivery verification — send/verify/resend in courier tasks, 3-attempt lockout, SMS stub |
| 3 (Sig) | Signature capture — canvas modal, touch/mouse, DPI scaling, PNG upload, detail panel display |
| 9 | Reporting — 5-tab analytics, period picker, bar charts, courier/merchant perf tables, Excel+PDF export |
| 4 | Realtime Ops — live pipeline, courier board, activity feed, RT status dot, enhanced Realtime channels |
| Customer | Customer Portal — overview, shipment history, DB-scoped loadShipments, customer nav 4 tabs |
| P1 | Auto-Dispatch Engine — dispatch_rules, courier_configs, dispatch_log, PL/pgSQL engine (4 strategies), preview, 15th admin nav tab |
| P2 | Driver Location Tracking — GPS broadcast, Leaflet map in liveops, courier trail history, dynamic CDN loading |
| P3 | SLA Monitoring — sla_configs, sla_breaches, SQL breach detection engine, 4-tab admin view, overview breach banner |
| P4 | Proactive SMS — SMS_TRIGGERS config, _sendStatusSMS(), auto-fires on status change, trigger toggles in SMS modal |
| P5 | Webhooks + API — api_keys, webhooks, webhook_deliveries, delivery engine, merchant 3-tab UI, API key gen with SHA-256 |
| Import | Bulk Shipment Import — 6-step wizard, validation, Excel template, error reports, auto-create |
| Stabilization | Fixed 8 regressions — see KNOWN_BUGS.md for full list |

---

## Architecture

```
app.js
├── AppState          — single global state object (all UI reads from here)
├── DB                — all Supabase queries (never call db.from() outside DB.*)
├── App               — all onclick handlers (try/catch/finally + button-lock mandatory)
├── view*()           — 21 page functions returning HTML strings (+ viewImport, viewLiveOps, viewCustomerOverview, viewCustomerShipments)
├── render()          — full page rebuild (on login/logout/boot)
├── rerenderContent() — replaces #viewContent only (on nav clicks + App.* actions)
├── bindDashboardEvents() — shell-level listeners, wired once per render()
├── bindContentEvents()   — content-level listeners, re-wired on every rerenderContent()
└── postRender()      — side effects: charts, QR codes, lazy tab loaders
```

**Render rule:** `rerenderContent()` never touches the sidebar. Active tab class MUST be synced manually in the nav click handler.

---

## Folder Structure

```
Shipping-Plattform/
├── index.html                    static shell, never changes
├── app.js                        all application logic
├── styles.css                    all styling
├── cities.json                   Egypt governorates dataset (static)
└── docs/
    ├── AI_CONTEXT.md             ← this file
    ├── PROJECT_STATE.md          phase roadmap
    ├── DATABASE_SCHEMA.md        all 19 tables + functions + triggers
    ├── APP_ARCHITECTURE.md       render flow + AppState + lifecycle
    ├── API_REFERENCE.md          every DB.* / App.* / view*() method
    ├── FEATURES.md               feature inventory with status
    ├── CHANGELOG.md              chronological phase history
    ├── KNOWN_BUGS.md             regression watch list (8 entries)
    ├── TODO.md                   remaining work + priorities
    ├── DEPLOYMENT.md             git + supabase deploy steps
    ├── CODING_CONVENTIONS.md     rules that prevent real bugs
    └── DECISIONS.md              10 architectural decisions with rationale
```

---

## Database — 21 Tables

**Core:** `profiles` · `roles` · `permissions` · `role_permissions` · `profile_roles` · `shipments` · `shipment_timeline` · `notifications` · `audit_logs`

**Phase 2A:** `merchant_addresses` · `merchant_recipients` · `merchant_products` · `merchant_ledger`† · `settlements` · `pickup_requests`

**Phase 2B:** `driver_transactions`† · `invoices` · `expenses` · `cod_reconciliation`

**Phase 2C:** `pricing_zones` · `pricing_rules`

**Phase 2D:** `branches` · `warehouses` · `shipment_branch_log`†

**Import:** `import_batches` · `import_rows`

† = append-only (SELECT + INSERT only via RLS — never UPDATE or DELETE)

**Key DB functions:** `get_user_permissions()` · `calculate_shipping_fee()` · `get_merchant_balance()` · `get_driver_balance()` · `get_branch_metrics()` · `next_invoice_number()`

---

## Admin Nav Tabs (16) · Customer Nav Tabs (4)

`overview` · `shipments` · `tasks` · `accounts` · `finance` · `pricing` · `branches` · `liveops` · `reports` · `users` · `merchants` · `import` · `audit` · `track`

---

## Critical Conventions (the ones that caused real bugs)

**1. NEVER hard-delete profiles.**
`shipment_timeline.actor_id → profiles(id)`. Always soft-delete: `{is_deleted:true, deleted_at, deleted_by}`. Regressed twice (KNOWN_BUGS #4).

**2. NEVER use array length as a lazy-load guard.**
```js
// ❌ infinite loop if DB returns []
if (!AppState.branches.length) App.loadBranchData();
// ✅ one-time flag
if (!AppState._branchDataLoaded) { AppState._branchDataLoaded=true; App.loadBranchData(); }
```
Caused 3,000+ requests in production (KNOWN_BUGS #8).

**3. ALWAYS `await loadEgyptData()` before any governorate dropdown.**
`EGYPT_GOV` starts empty. Any modal building a `<select>` from it must call this first (KNOWN_BUGS #6).

**4. ALWAYS `await` critical data on BOTH login AND boot paths.**
Both `handleLogin()` and the boot IIFE are separate code paths. Fire-and-forget `.then()` races against `render()` (KNOWN_BUGS #5).

**5. NEVER use inline grid styles in app.js.**
`style="grid-template-columns:1fr 340px"` overrides all media queries. Use `.overview-grid` / `.grid-2col` CSS classes (KNOWN_BUGS #1).

**6. Every App.* write method must use try/catch/finally + button-lock.**
```js
const btn = document.querySelector(`[onclick*="method('${id}')"]`);
if (btn) { btn.disabled=true; btn.textContent="…"; }
try { /* DB write */ } catch(err) { toast(err.message,"error"); } finally { btn.disabled=false; rerenderContent(); }
```
Skipping this caused frozen UI (KNOWN_BUGS #2, #3).

**7. `primary_role` is the canonical column.** Not `role`. Not `suspended` — use `is_suspended`.

**8. `merchant_name` / `merchant_phone` are `NOT NULL DEFAULT ''`.** Always send `""` not `null` for admin-created shipments (KNOWN_BUGS #9).

**9. Role switching must call `render()`, not `renderDashboard()`.** Only `render()` rebuilds the full sidebar nav for the new role (KNOWN_BUGS #11).

**10. `address_full` is GENERATED ALWAYS.** Never include it in INSERT/UPDATE.

**11. Never write to DB columns that may not exist.** Always check the migration SQL before adding new fields to `.update()` calls. The `read_at` column was written before being created (KNOWN_BUGS #25).

**12. Import row IDs are server-assigned.** After `insertImportRows()`, client JS objects have no `.id`. Update rows by `(batch_id, row_number)` not by a client-side id field (KNOWN_BUGS #23).

**13. `manualTrack()` reads input field first.** Any call site that adds a `<input id="trackCodeInput">` will be read by `manualTrack()` automatically. Don't add competing track logic.

---

## Active AppState Fields to Know

```js
AppState.view              // current route key ("overview", "shipments", etc.)
AppState.statusFilter      // "all" or a status string
AppState.serviceFilter     // "" or "door_to_door"|"drop_off"|"pickup"
AppState.orderFilter       // "" or "express"|"standard"|"scheduled"
AppState._branchDataLoaded // boolean flag — lazy-load guard
AppState._pricingDataLoaded// boolean flag — lazy-load guard
AppState.allMerchants      // loaded on admin login + boot (must be awaited)
AppState.myWalletBalance   // courier's real wallet balance (Phase 3)
// SMS_CONFIG (not AppState — module-level const at top of app.js)
// SMS_CONFIG.provider        // "stub"|"twilio"|"vonage"|"http_gateway"
```

---

## Pending Work (Priority Order)

1. **Phase 4 Realtime Ops** — live driver status board, live shipment updates beyond the current admin-only Realtime channel.
2. ~~SMS provider~~ ✅ Done — set `SMS_CONFIG.provider` in app.js to activate Twilio/Vonage/HTTP Gateway.
3. **Multi-tenant activation** — schema 100% ready (`tenant_id` on all tables). Needs RLS policy updates + tenant-switching UI.

---

## How to Start a New Session

1. Read this file.
2. Check `TODO.md` for the specific next task.
3. Read `KNOWN_BUGS.md` before touching any user/branch/pricing/mobile code.
4. For any DB change, check `DATABASE_SCHEMA.md` for exact column names.
5. For any new feature, consult `API_REFERENCE.md` to find the right DB method and App pattern.
6. After completing a phase: update `AI_CONTEXT.md`, `CHANGELOG.md`, `FEATURES.md`, `TODO.md`, `PROJECT_STATE.md`.
