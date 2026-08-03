# Bug Fix Sprint 1 — Report
**Date:** July 2026 | **Status:** All 10 bugs fixed, 2 UX improvements implemented

---

## BUG #1 — Session Management
**Root Cause:** `getSession()` returned the stored token with no expiry check. `saveSession()` never stored a timestamp. Users were permanently logged in.

**Fix:**
- Added `SESSION_MAX_MS = 12h` (absolute max lifetime)
- Added `SESSION_INACTIVITY_MS = 2h` (inactivity timeout)
- `getSession()` now validates both timestamps and clears + returns null if exceeded
- `saveSession()` stores `createdAt` (first login) and `lastActive` (updated timestamp)
- `touchSession()` updates `lastActive` — called on click/keydown/mousemove/touchstart (throttled to 1/minute)
- `setInterval(60s)` checks session validity and auto-calls `App.logout()` if expired
- **SQL Changes:** None

---

## BUG #2 — Navigation State
**Root Cause:** After boot, `AppState.view` was always set to `"overview"` (admin) or `"shipments"` (merchant). No nav state was ever persisted to localStorage.

**Fix:**
- Added `saveNavState(view)` → `localStorage.setItem("nukhba_nav", view)`
- Added `getNavState()` → reads from localStorage, defaults to `"overview"`
- Every nav button click now calls `saveNavState(btn.dataset.view)`
- Boot path restores `getNavState()` for admin and merchant roles
- Couriers and customers always land on `tasks` / `overview` (intentional)
- **SQL Changes:** None

---

## BUG #3 — Live Broadcast State
**Root Cause:** `AppState.locationBroadcasting` was initialized to `false` on every page load. No persistence mechanism existed.

**Fix:**
- Added `saveBroadcastState(bool)` → `localStorage.setItem("nukhba_bcast", "1"/"0")`
- Added `getBroadcastState()` → reads from localStorage
- `startLocationBroadcast()` calls `saveBroadcastState(true)` after starting
- `stopLocationBroadcast()` calls `saveBroadcastState(false)` after stopping
- Boot path for courier role checks `getBroadcastState()` and calls `App.startLocationBroadcast()` if true
- **SQL Changes:** None

---

## BUG #4 — Auto Dispatch Specific Courier Dropdown Empty
**Root Cause:** `openDispatchRuleModal()` used `AppState.courierConfigs` as the dropdown source. `courierConfigs` only contains couriers that have been explicitly configured via the courier config panel. Couriers without a `courier_configs` row are invisible.

**Fix:** Changed dropdown source to `AppState.couriers` (all active couriers loaded at login), filtered by `is_active !== false`. Changed option value from `c.courier_id` (config table FK) to `c.id` (profiles PK). Added empty-state message when no couriers are loaded.
- **SQL Changes:** None

---

## BUG #5 — Auto Dispatch Save: null value in column "id"
**Root Cause:** `App.saveDispatchRule()` passed `id: ruleId||undefined` in the payload object. JavaScript object spread `{...payload}` with `id: undefined` sends the key `id` with a null-equivalent to Supabase, which overrides `DEFAULT gen_random_uuid()` in Postgres, producing a NULL PK error.

**Fix:** `DB.saveDispatchRule()` now destructures payload: for INSERT, extracts and discards the `id` field before sending: `const { id: _drop, ...rest } = payload`. For UPDATE, passes `id` separately to `.eq("id", id)` and sends `rest` as the update object. Same pattern applied to `DB.saveSLAConfig()` and `DB.saveWebhook()`.
- **SQL Changes:** None (issue was in JS, not SQL)

---

## BUG #6 — SLA Configuration: null value in column "id"
**Root Cause:** Identical to BUG #5 — `App.saveSLAConfig()` passed `id: configId||undefined`.
**Fix:** Identical to BUG #5 — `DB.saveSLAConfig()` strips `id` from INSERT payload.
- **SQL Changes:** None

---

## BUG #7 — Connection Indicator Shows Mixed States
**Root Cause:** The `.rt-status` container div had `title="${rtStatusConfig(AppState.rtStatus).label}"` rendered at template-literal time (stale value from the last full re-render). The Realtime subscription's `.subscribe()` callback updated `rtStatusDot` and `rtStatusText` in-place but never updated the container's `title` attribute. The two elements showed different values until the next full re-render.

**Fix:** Added `container = document.querySelector(".rt-status")` to the subscription callback. Now updates all three elements (`dot`, `text`, `container.title`) from the same `cfg` object in the same synchronous call.
- **SQL Changes:** None

---

## BUG #8 — Live Operations Shows Wrong Courier Count
**Root Cause:** "Connected couriers" count was derived from `driver_locations.is_online` DB rows, which are only updated when a courier explicitly starts/stops broadcasting. Admin sessions opening the liveops page were never excluded. Stale `is_online=true` rows from previous sessions were counted.

**Fix:** Added a dedicated Supabase Realtime Presence channel (`presence_v1`). Couriers join presence with `track({role:"courier", ...})`. Admins/merchants subscribe but never call `track()`, so they are never counted. `AppState.onlineCouriers` is derived from `presenceState()` filtered by `p.role==="courier"`. This reflects real browser connections, not stale DB rows.
- **SQL Changes:** None (uses Supabase Realtime Presence, no DB table needed)

---

## BUG #9 — New Shipment Button Sometimes Does Nothing
**Root Cause:** `postRender()` used `$("newShipBtn")?.addEventListener("click", ...)`. This fails when: (a) the element hasn't painted yet when postRender fires, or (b) the merchant overview renders `newShipBtn2` instead of `newShipBtn`. Each postRender also re-added listeners on the same element without removing the old ones (multiple-listener accumulation).

**Fix:** Replaced direct getElementById binding with event delegation on `#viewContent`: `document.getElementById("viewContent")?.addEventListener("click", fn, { once: true })`. The `once: true` flag auto-removes after first trigger, and a new delegated listener is added on each `postRender`. The selector `closest("#newShipBtn, #newShipBtn2, [data-action='newShipment']")` handles all button variants.
- **SQL Changes:** None

---

## BUG #10 — Settlement Shows Zero Balance / Wrong Error
**Root Cause:** `requestSettlement()` checked `AppState.merchantBalance` which is set by `DB.loadMerchantBalance()` RPC. If the RPC returned 0 or failed silently, the function showed "no balance" even when the merchant's overview correctly displayed a positive balance. The function also used `prompt()` (browser dialog) with no payment method selection.

**Fix:** `requestSettlement()` now recalculates available balance directly from `AppState.shipments` (delivered COD − delivery fees − return fees − already-settled amounts). Uses `Math.max()` between the RPC value and the local calculation. When balance = 0, opens a diagnostic modal showing the full breakdown instead of a toast. Settlement entry now uses a proper modal with amount input and payment method selector (`bank_transfer`, `InstaPay`, `cash`). Moved actual insert to `App._doRequestSettlement(maxBal)`.
- **SQL Changes:** None (existing `settlements` table used)

---

## DATABASE AUDIT — NULL Primary Key Pattern

**Verified affected methods (all fixed with `{ id: _drop, ...rest }` pattern):**
- `DB.saveDispatchRule()` → `dispatch_rules` ✅
- `DB.saveSLAConfig()` → `sla_configs` ✅
- `DB.saveWebhook()` → `webhooks` ✅

**Verified unaffected (never send id on insert):**
- `DB.createApiKey()` — uses `.insert([payload])` where payload never includes `id` field ✅
- `DB.saveCourierConfig()` — uses `.upsert()` on `courier_id` PK (not uuid PK) ✅
- All other DB insert methods — checked, none include `id` in insert payload ✅

**Migration UUID defaults verified:**
| Table | PK Column | Default | Status |
|---|---|---|---|
| dispatch_rules | id | gen_random_uuid() | ✅ |
| courier_configs | courier_id | FK (no default needed) | ✅ |
| dispatch_log | id | gen_random_uuid() | ✅ |
| driver_locations | courier_id | FK (no default needed) | ✅ |
| driver_location_history | id | bigserial | ✅ |
| sla_configs | id | gen_random_uuid() | ✅ |
| sla_breaches | id | gen_random_uuid() | ✅ |
| webhooks | id | gen_random_uuid() | ✅ |
| webhook_deliveries | id | bigserial | ✅ |
| api_keys | id | gen_random_uuid() | ✅ |

---

## UX IMPROVEMENT #1 — Audit Log Redesigned

`viewAudit()` completely rewritten as a business-grade audit trail:
- `ACTION_META` map: 22 action codes → human-readable Arabic label, emoji icon, category, color
- Category filter dropdown: auth / shipments / finance / dispatch / SLA / API / SMS
- Category badge pills showing count per category
- Entity ID displayed with click-to-copy
- Action shown in two layers: Arabic label (prominent) + raw code (small, monospace)
- Max 200 rows displayed per filter
- Search across action + entity_id + description + user

---

## UX IMPROVEMENT #2 — Settlement Status on Shipment Detail

`detailPanel()` now shows a settlement status badge alongside the shipment status badge for delivered shipments:
- **✅ مؤهل للتسوية** — delivered, no settlement request yet
- **⏳ طلب تسوية مُقدَّم** — pending settlement exists for this merchant
- **✔️ تسوية معتمدة** — settlement approved by admin
- **💰 تم الدفع** — settlement marked as paid

---

## Verification Status

| Bug | Root Cause | Fix | Verified |
|---|---|---|---|
| #1 Session expiry | No expiry checks in getSession() | SESSION_MAX_MS + INACTIVITY + activity tracking | ✅ |
| #2 Nav state | Never persisted to localStorage | saveNavState/getNavState + localStorage | ✅ |
| #3 Broadcast state | No persistence | saveBroadcastState/getBroadcastState | ✅ |
| #4 Courier dropdown | courierConfigs not AppState.couriers | Uses AppState.couriers filtered by is_active | ✅ |
| #5 Dispatch save null PK | id:undefined in INSERT payload | Strip id from INSERT, pass separately to UPDATE | ✅ |
| #6 SLA save null PK | Same as #5 | Same fix as #5 | ✅ |
| #7 RT indicator mixed state | container.title stale after inline update | Update all 3 elements from same cfg in subscription | ✅ |
| #8 Wrong courier count | DB rows not real connections | Supabase Realtime Presence channel, couriers only | ✅ |
| #9 New shipment button | postRender race condition | Event delegation with once:true | ✅ |
| #10 Settlement zero balance | merchantBalance RPC stale | Recalculate from AppState.shipments + diagnostic modal | ✅ |
| UX#1 Audit log | Developer-oriented | Business audit trail with ACTION_META, categories, icons | ✅ |
| UX#2 Settlement status | Not shown on shipment | settlBadge in detailPanel for delivered shipments | ✅ |
