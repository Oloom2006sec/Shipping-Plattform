# KNOWN_BUGS.md
**Al-Nukhba Express — Bug Tracker & Regression History**

Status legend: 🟢 Fixed & stable · 🔴 Open · ⚠️ Fixed but regression-prone (watch list)

---

## Currently Open Bugs

**None at time of writing.** All 8 bugs from the stabilization sprint are fixed and verified against the live codebase (string-matched, not assumed).

---

## Regression Watch List

These bugs were fixed once already and regressed at least once. Treat any future change touching these areas with extra caution — prefer `str_replace` against a freshly-viewed copy of the exact current code, never a remembered version.

### ⚠️ #1 — Mobile dashboard / inline grid styles
**Symptom:** Dashboard unusable on mobile, content overflows or stacks wrong.
**Root cause:** Raw inline `style="display:grid;grid-template-columns:..."` on a layout container. Inline styles always win over external stylesheet rules regardless of media query specificity — a `@media` rule in `styles.css` can never override an inline style on the same element.
**Fix:** Use a named CSS class (`.overview-grid`, `.grid-2col`) with both a desktop base rule AND a `@media (max-width: 768px)` override in the same file.
**Fixed:** Stabilization sprint (see CHANGELOG.md)
**Regression history:** Fixed once previously in an earlier session reportedly; regressed when new dashboard sections were added with quick inline styles instead of reusing the class.
**Prevention rule:** Never write `style="display:grid;grid-template-columns:..."` inline in `app.js`. Always add/reuse a CSS class.

### ⚠️ #2 — Sidebar active tab indicator
**Symptom:** Clicking a sidebar nav item shows the correct page content, but the green "active" highlight stays on the previous tab.
**Root cause:** `rerenderContent()` (used by nav clicks) only replaces `#viewContent.innerHTML`. The sidebar itself is part of the outer shell, rendered once by `renderDashboard()` and never touched again. The `active` class was baked into the HTML string at initial render time and had no mechanism to update afterward.
**Fix:** The nav click handler in `bindDashboardEvents()` now explicitly does:
```js
$$("[data-view]").forEach(b => {
  b.classList.toggle("active", b.dataset.view === AppState.view);
});
```
**Fixed:** Stabilization sprint
**Regression history:** Fixed once previously; regressed — likely a later patch replaced the click handler body without preserving this sync logic.
**Prevention rule:** Any change to `bindDashboardEvents()`'s nav click handler must keep the explicit active-class sync. Do not assume `rerenderContent()` updates the sidebar.

### ⚠️ #3 — User suspend not persisting
**Symptom:** Admin suspends a user, UI shows it as suspended, but after a page refresh the user appears active again.
**Root cause:** Two compounding issues — `loadUsers()` lost its `.eq("is_deleted", false)` filter (irrelevant to suspend directly but signals the function was reverted to an older version), and more critically the mapped object used a non-canonical field name `suspended` while other code paths checked `is_suspended`. The DB write itself (`toggleUser()`) was also reverted to a version with no `try/catch/finally`, no `suspended_at`/`suspended_by` write, and no button lock — meaning failures were silent.
**Fix:** Restored full field write (`is_suspended`, `suspended_at`, `suspended_by`), canonical field naming throughout, and the `try/catch/finally` + button-lock pattern.
**Fixed:** Stabilization sprint
**Regression history:** Fixed once previously; regressed.
**Prevention rule:** Always use `is_suspended` as the canonical field name in JS (never bare `suspended`, which exists only as a legacy alias). Every state-changing `App.*` method must follow the `try/catch/finally` pattern documented in APP_ARCHITECTURE.md §4.

### ⚠️ #4 — User delete throws FK violation
**Symptom:** Deleting a user fails with: `referential integrity query on "profiles" from constraint "shipment_timeline_actor_id_fkey"`.
**Root cause:** `deleteUser()` called `db.from("profiles").delete()` directly (hard delete). `shipment_timeline.actor_id` (and `audit_logs.actor_id`) reference `profiles.id`. Any user who ever appeared in a shipment's timeline or the audit log cannot be hard-deleted without violating that FK.
**Fix:** `deleteUser()` performs a soft delete only: `UPDATE profiles SET is_deleted=true, deleted_at=now(), deleted_by=<admin_id>`. Never calls `.delete()`.
**Fixed:** Stabilization sprint
**Regression history:** Fixed once previously (this is documented as the canonical reason soft-delete exists on `profiles` at all); regressed when `deleteUser()` was rewritten and the hard-delete pattern crept back in.
**Prevention rule:** **Never call `.delete()` on the `profiles` table from application code, under any circumstance.** Grep for `from("profiles").*\.delete()` before any deploy — it should always return zero matches.

### ⚠️ #5 — Merchants/branches disappear after page refresh
**Symptom:** Data loads fine right after login, but vanishes (empty list) after an F5 refresh while staying logged in.
**Root cause:** The boot/session-restore code path (distinct from the login code path) called `DB.loadAllMerchants()` and `Promise.all([DB.loadBranches(), DB.loadWarehouses()])` using fire-and-forget `.then()` instead of `await`. `render()` on the next line painted the shell before the promises resolved. If the admin landed on the merchants/branches tab immediately (e.g. it was their last open tab), they saw an empty list with no subsequent re-render to fix it.
**Fix:** Both the login path and the boot/session-restore path now `await Promise.all([...])` before calling `render()`.
**Fixed:** Stabilization sprint
**Regression history:** First occurrence — the login path was correct from when it was originally written; the boot path was a separate code path that copied an earlier (worse) pattern.
**Prevention rule:** Login and boot/session-restore are two separate code paths in `app.js`. Any new "load X on sign-in" logic must be added to **both** paths, and must be `await`ed before the subsequent `render()` call.

### ⚠️ #6 — Governorate dropdown empty in Branches modal
**Symptom:** Creating a branch shows an empty governorate `<select>`. Oddly, if the shipment-creation modal was opened first in the same session, governorates suddenly work in Branches too.
**Root cause:** `EGYPT_GOV` is a module-level object populated lazily by `await loadEgyptData()` — it starts empty. Only the shipment-creation modal and the pricing-zone modal called `await loadEgyptData()` before reading `Object.keys(EGYPT_GOV)`. `App.addBranch()` and `App.addWarehouse()` read the object directly with no await, so if the user hadn't visited shipment creation yet, the object was still `{}`.
**Fix:** Added `await loadEgyptData();` as the first line of both `App.addBranch()` and `App.addWarehouse()`.
**Fixed:** Stabilization sprint
**Regression history:** First occurrence — this was a gap from the original Phase 2D implementation, not a true regression of previously-working code, but is documented here because the pattern (any new modal with a governorate dropdown) is a recurring risk.
**Prevention rule:** Any new modal that renders a governorate/city `<select>` from `EGYPT_GOV` MUST start with `await loadEgyptData();` before building the options HTML.

### ⚠️ #7 — Pricing rule Edit button does nothing
**Symptom:** Clicking "Edit" on a pricing rule produces no visible action — no modal, no error toast, nothing.
**Root cause:** The button's `onclick="App.editPricingRule('${id}')"` referenced a method that was never implemented. `addPricingRule()` and `deletePricingRule()` existed; `editPricingRule()` did not. The click threw a `TypeError` that was silently swallowed by the inline `onclick` attribute (no global error boundary).
**Fix:** Implemented `App.editPricingRule(id)` — a full modal pre-filled from the existing rule's fields, mirroring `addPricingRule()`'s structure.
**Fixed:** Stabilization sprint
**Regression history:** First occurrence — never actually existed, not a regression. Documented as a cautionary example: **a button referencing a non-existent method fails silently in this codebase.** There is no global onclick error handler.
**Prevention rule:** When adding a new button with `onclick="App.xxx(...)"`, grep the file to confirm `App.xxx` is actually defined before considering the feature complete. Consider a future task: wrap inline `onclick` calls or add a dev-mode console warning for undefined `App` methods.

### ⚠️ #8 — Infinite request loop on Branches/Pricing tabs (3,000+ requests)
**Symptom:** Opening the Branches or Pricing admin tab causes the browser to fire continuous network requests indefinitely, reaching thousands of requests and degrading performance/cost.
**Root cause:** `postRender()` contained a lazy-load guard of the shape:
```js
if (AppState.view === "branches" && !AppState.branches.length) {
  App.loadBranchData();
}
```
`loadBranchData()` ends with `rerenderContent()`, which calls `postRender()` again. If the DB call ever returns an empty array — due to RLS denying access, a transient network error, or genuinely zero branches existing yet — `AppState.branches.length` stays `0` forever, so the guard condition (`!length`) is permanently true, and the load→render→check→load cycle never terminates. The identical pattern existed in the Pricing tab guard (masked there only because zones were pre-seeded with data, so the array was never actually empty in practice).
**Fix:** Replaced array-length checks with dedicated one-time-fired boolean flags:
```js
if (AppState.view === "branches" && !AppState._branchDataLoaded) {
  AppState._branchDataLoaded = true;
  App.loadBranchData();
}
```
The flag is set to `true` *before* the async call starts, so even a slow or failing request can't cause a second trigger.
**Fixed:** Stabilization sprint
**Regression history:** First occurrence in Branches (newly built in Phase 2D); latent/dormant identical bug in Pricing (Phase 2C) fixed proactively in the same sprint since it shared the exact same flawed pattern.
**Prevention rule:** **Never use an array-length check (`!AppState.x.length`) as a "have I loaded this yet" guard inside `postRender()` or any function that itself triggers a re-render.** Always use a dedicated boolean flag (`AppState._xDataLoaded`) set synchronously before the async call begins.

---

## Other Notes

**Stray debug code removed (not a "bug" but worth recording):** A duplicate `menuToggle` click listener with `console.log("MENU CLICKED")` statements was found registered at module scope, outside `bindDashboardEvents()`. This ran once per page load on top of whatever the proper shell-level handler already wired up, contributing console noise and a redundant listener. Removed in the stabilization sprint.

---

## How to use this document

Before fixing any bug report, check this file first — if the symptom matches an entry here, the root cause and fix pattern are already known; verify the fix is still in place (it may have regressed again) rather than re-diagnosing from scratch. After fixing any new bug, add an entry here in the same format, even if it appears unrelated to the watch list above.

---

## Fixed in Regression Sprint #2 (Priority 1 & 2)

### 🟢 #9 — Shipment creation fails with NOT NULL constraint on merchant_name
**Symptom:** Admin and merchant shipment creation fails with: `null value in column "merchant_name" violates not-null constraint`
**Root cause:** `createShipment()` sent `merchant_name: null` for admin-created shipments. The column is defined as `NOT NULL DEFAULT ''` — an explicit `null` overrides the default and violates the constraint.
**Fix:** Changed to `merchant_name: isMerchant ? (user.name||"") : ""` and same for `merchant_phone`.
**Fixed:** Regression Sprint #2
**Prevention rule:** `merchant_name` and `merchant_phone` are `NOT NULL DEFAULT ''`. Always send `""` not `null` for non-merchant creators. See DATABASE_SCHEMA.md.

### 🟢 #10 — Pricing Calculator governorates empty
**Symptom:** The pricing simulator tab shows an empty governorate dropdown.
**Root cause:** `viewPricing()` is a synchronous function that calls `Object.keys(EGYPT_GOV)` directly. `EGYPT_GOV` starts empty and is only populated after `await loadEgyptData()`. No code was calling `loadEgyptData()` before the simulator tab rendered.
**Fix:** Added a guard in `postRender()`: when `view==="pricing"` and `pricingTab==="simulator"` and `EGYPT_GOV` is still empty, call `loadEgyptData().then(()=>rerenderContent())`.
**Fixed:** Regression Sprint #2
**Prevention rule:** Any synchronous view that reads `Object.keys(EGYPT_GOV)` needs a `postRender()` trigger or a separate `setPricingTab()` await — not just the modal functions.

### 🟢 #11 — Preview As broken on desktop (sidebar/layout not updated)
**Symptom:** On desktop, switching role via Preview As only refreshed the content area — the sidebar nav, tab labels, and permissions stayed as admin.
**Root cause:** `roleSwitcher` handler called `renderDashboard()` which rebuilds `#app` but does not re-run the full page boot sequence. On mobile this appeared to work because the sidebar was hidden; on desktop the stale sidebar was visible.
**Fix:** Changed to call `render()` which triggers the full page rebuild including sidebar nav recalculation from the new `ROLE_MAP[role].nav`.
**Fixed:** Regression Sprint #2
**Prevention rule:** Any action that changes `AppState.user.primary_role` must call `render()`, not `renderDashboard()` or `rerenderContent()`.

### 🟢 #12 — Logout button hidden on mobile
**Symptom:** The sidebar on mobile was taller than the viewport and could not be scrolled to reach the logout button in `.sb-footer`.
**Root cause:** The mobile sidebar CSS override set `width` and `max-width` but did not enforce `height:100vh` or `overflow-y:auto`. The sidebar grew beyond the viewport with no scroll mechanism.
**Fix:** Added `height:100vh; overflow-y:auto; display:flex; flex-direction:column;` to the mobile `.sidebar` rule so it fills the viewport and scrolls internally.
**Fixed:** Regression Sprint #2

### 🟢 #13 — Admin Dashboard not responsive on mobile
**Symptom:** Only the main dashboard/overview page had content overflowing the viewport width on mobile. Other views were fine.
**Root cause:** The `.page` and `.card` containers lacked `max-width:100%; overflow-x:hidden; box-sizing:border-box` in the mobile breakpoint. Cards and content expanded beyond the viewport.
**Fix:** Added explicit `max-width`, `overflow-x:hidden`, and `box-sizing:border-box` to both `.page` and `.card` in the `@media (max-width:768px)` block.
**Fixed:** Regression Sprint #2

### 🟢 #14 — Shipment table: Merchant and Weight columns swapped
**Symptom:** Merchant column displayed weight values (e.g. "0.3 كجم"), Weight column displayed merchant names.
**Root cause:** When Phase 1 added the Weight column between Amount and Merchant, the two `<td>` data cells were inserted in reversed order relative to the `<thead>` headers. Headers read: المبلغ → **الوزن** → **التاجر** → المندوب. Data cells read: amount → **merchantName** → **weight** → courierName — exact swap of positions 8 and 9.
**Fix:** Swapped the two `<td>` cells so weight renders under الوزن and merchantName renders under التاجر.
**Fixed:** UI regression fix session
**Verified:** Full 11-column header-to-data audit run — all columns confirmed correct.
**Prevention rule:** After adding or reordering columns in a table, always count `<th>` positions against `<td>` positions and run a mapping audit before deploying.

### ℹ️ OTP SMS — stub only (not a bug, by design — Decision-009)
`DB.sendSMS()` currently logs to console and does not send real SMS. The OTP code is shown in the courier's toast notification during testing. Replace the function body with a real provider (Twilio, Vonage, ConnectMisr) when ready. No other code changes needed.

### 🟢 #15 — Silent no-op when App.* method is undefined (mitigation added)
**Symptom:** Clicking a button with `onclick="App.foo()"` where `App.foo` doesn't exist produces no visible error — the UI appears frozen or unresponsive.
**Root cause:** Inline `onclick` attributes evaluate the expression in the global scope. If `App.foo` is undefined, calling `App.foo()` throws a `TypeError: App.foo is not a function` which the browser swallows silently — no toast, no console warning visible to non-devs.
**Fix:** Added a global `window.addEventListener("error")` handler that catches TypeErrors mentioning `App.` and both logs them to the console with file/line context AND shows an error toast to the user. This does not prevent the error but makes it visible for debugging.
**Status:** 🟢 Mitigated — not fully prevented. The real prevention is the grep check documented in CODING_CONVENTIONS.md: before deploying any button with `onclick="App.xxx(...)"`, confirm `App.xxx` is defined in the file.
**Fixed:** Tech debt sprint

---

## Fixed in Live Ops Stabilization Sprint

### 🟢 #16 — Shipment Pipeline shows all zeros
**Symptom:** Live Ops pipeline shows 0 for every status even when shipments exist in other views.
**Root cause:** Two-part issue. First: `postRender()` had no hook for the `liveops` view, so `AppState.shipments` was never refreshed when navigating to it — stale login-time snapshot may have had all shipments delivered. Second: `submitted` shipments used `status==="submitted"` but the pipeline had no row for `draft` status (same semantic group). Both caused zero-count display even with real data.
**Fix:** Added `postRender()` hook that calls `App.refreshLiveOpsData()` on every `liveops` view render. Added `draft` to the `submitted` row filter. Added manual "🔄 تحديث" button for force-refresh.
**Fixed:** Live Ops Stabilization Sprint

### 🟢 #17 — Courier Board shows no data
**Symptom:** Courier Board always shows zero active/idle couriers regardless of actual state.
**Root cause:** `viewLiveOps` filtered `AppState.users` by `u.role==="courier"` but `AppState.users` is a mapped array with shape `{id, name, role, is_suspended}` from `loadUsers()`. The courier board needed workload data (shipments per courier, outForDelivery count) which requires joining against `AppState.shipments`. The old code had no such join — it only checked `outForDelivery.map(s=>s.courierId)` against the users array. `AppState.couriers` (from `loadCouriers()`, shape `{id, full_name, phone, primary_role}`) is the correct source and is always populated for admins. Additionally, `refreshLiveOpsData()` now reloads `AppState.couriers` fresh on every liveops visit.
**Fix:** Rewrote courier board to use `AppState.couriers` directly. Built a `courierWorkload` map per `courierId` from all active shipments. Active = courier has at least one shipment in `picked_up/in_transit/at_warehouse/at_branch/out_for_delivery`. Each active courier card now shows total assigned, out-for-delivery count, and picked-up count.
**Fixed:** Live Ops Stabilization Sprint

### 🟢 #18 — Live Activity Feed always empty
**Symptom:** Activity feed shows "في انتظار الأحداث..." always — even with hundreds of shipments.
**Root cause:** `AppState.liveActivityFeed` starts as `[]` and is only populated by future Realtime events (INSERT/UPDATE on `shipments` after login). Historical activity is never loaded. A user who logs in and immediately opens Live Ops sees an empty feed even if thousands of status changes happened today.
**Fix:** `App.refreshLiveOpsData()` (called by `postRender()` whenever `view==="liveops"`) now loads the 30 most recent `shipment_timeline` events from DB and maps them to the feed format — but **only if the feed is currently empty** (to avoid overwriting accumulated live events). Each event gets an appropriate icon from a `STATUS_ICON` map. The feed also now shows a `statusLabel` badge derived from `STATUS_MAP` on RT events.
**Fixed:** Live Ops Stabilization Sprint