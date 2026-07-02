# APP_ARCHITECTURE.md
**Al-Nukhba Express — Frontend Architecture**
Single file: `app.js` (5,214 lines), no framework, no build step.

---

## 1. Application Structure

```
app.js
├── Constants            STATUS_MAP, ROLE_MAP, NAV_LABELS, PERM_ALIAS
├── AppState              single in-memory state object (see §2)
├── DB                     Supabase data-access layer (see §3)
├── App                    UI action layer — all onclick handlers live here
├── render functions       renderHomepage / renderAuth / renderDashboard
│                          renderAdminShell / renderSimpleShell
├── view*() functions      17 page-level render functions (see §6)
├── bindDashboardEvents()  shell-level event wiring (sidebar, header)
├── bindContentEvents()    content-level event wiring (per view)
├── postRender()           side effects after every render (see §5)
└── boot IIFE              session restore on page load
```

There is no virtual DOM and no component tree. Every `view*()` function returns an HTML string built from template literals; the result is assigned to `innerHTML`.

---

## 2. AppState — single source of truth

```js
const AppState = {
  page, authMode, user, view,                          // navigation/session
  query, statusFilter, serviceFilter, orderFilter,      // shipment list filters
  selectedShipment, userFilter, auditFilter,
  shipments, users, couriers, notifications,
  realtimeChannel,

  // Phase 2A — merchant's own data
  merchantAddresses, merchantRecipients, merchantProducts,
  pickupRequests, merchantBalance,

  // Admin cross-merchant view
  allMerchants, selectedMerchantId, adminMerchantTab,

  // Phase 2B finance
  financeTab, financeRange,
  driverWallet, codReconciliation, expenses,

  // Phase 2C pricing
  pricingZones, pricingRules, pricingTab, lastFeeCalc,

  // Phase 2D branches & warehouses
  branches, warehouses, branchTab, selectedBranchId,

  // Phase 3 driver self-service
  myWalletBalance, myWalletTxns,
};
```

**Convention:** any new feature module gets its own clearly-commented block in `AppState`, prefixed by phase name in a comment. Never reuse an existing field for a different purpose.

**Lazy-load guard convention:** array-length checks (`!AppState.branches.length`) are **forbidden** as load guards — an empty result from the DB (RLS denial, network blip, zero rows) makes the guard永远 true and creates an infinite fetch loop (see KNOWN_BUGS.md #8). Use a dedicated boolean flag instead: `AppState._branchDataLoaded`.

---

## 3. DB — Supabase Data Access Layer

A single object, `DB`, wraps every Supabase query. Naming convention: `DB.load*()` for reads, `DB.create*()`/`DB.update*()` for writes, bare verbs for actions (`DB.addAudit()`, `DB.addTimeline()`, `DB.sendSMS()`).

Roughly 60 methods. Grouped by domain:
- Core: `getProfile`, `loadShipments`, `createShipment`, `updateShipment`, `loadTimeline`, `addTimeline`, `addAudit`, `addNotification`, `loadUsers`, `loadCouriers`, `loadAuditLogs`
- Merchant portal: `loadMerchantAddresses/Recipients/Products`, `loadMerchantBalance`, `loadMerchantLedger`, `loadSettlements`, `loadPickupRequests`
- Admin merchant management: `loadAllMerchants`, `loadAdminMerchantAddresses/Products/Recipients`, `loadAdminPickupRequests`, `loadAdminSettlements`, `loadAdminLedger`
- Finance: `loadDriverBalance`, `loadDriverTransactions`, `loadInvoices`, `loadExpenses`, `loadCodReconciliation`, `getFinancialSummary`
- Pricing: `loadPricingZones`, `loadPricingRules`, `calculateFee`
- Branches: `loadBranches`, `loadWarehouses`, `loadBranchLog`, `getBranchMetrics`
- OTP (Phase 3, in progress): `sendSMS` (provider-abstraction stub), `generateAndSendOTP`, `verifyOTP`

**Rule:** `app.js` UI code never calls `db.from(...)` directly except inside `DB.*` methods or one-off inline writes in `App.*` action handlers that are simple enough not to warrant a named method (e.g. a single `.update()` call inside a modal's save button). All read paths that feed a `view*()` function MUST go through a named `DB.load*()` method.

---

## 4. App — UI Action Layer

Every `onclick="App.xxx(...)"` in the rendered HTML resolves to a method on the global `App` object. ~80 methods. Each follows the same shape for write actions:

```js
async someAction(id) {
  const btn = document.querySelector(`[onclick*="someAction('${id}')"]`);
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    const { error } = await db.from(...).update(...);
    if (error) throw error;
    await DB.addAudit(...);
    toast("✅ ...");
  } catch (err) {
    toast("خطأ: " + err.message, "error");
  } finally {
    if (btn) btn.disabled = false;
    rerenderContent();
  }
}
```

This `try/catch/finally` + button-lock pattern is **mandatory** for any destructive or state-changing action. Two real regressions (KNOWN_BUGS.md #3, #4) were caused by code that skipped this pattern.

---

## 5. Render Flow

### Full page render (`render()`)
Called on boot and on full navigation changes (login, logout, role switch).
```
render()
  → no user?        renderHomepage() / renderAuth()
  → user present?   renderDashboard()
                       → renderAdminShell() / renderSimpleShell()
                       → bindDashboardEvents()   (shell-level listeners)
                       → postRender()             (side effects)
```

### Content-only render (`rerenderContent()`)
Called after most `App.*` actions and on sidebar nav clicks. **Does not rebuild the sidebar/header** — only replaces `#viewContent.innerHTML`.
```
rerenderContent()
  → vc.innerHTML = renderView()    (the switch over AppState.view)
  → bindContentEvents()             (content-level listeners only)
  → postRender()
```

**Critical lifecycle rule:** because `rerenderContent()` never touches the sidebar, anything that must visually change on the sidebar (e.g. active tab highlight) must be updated explicitly inside the nav click handler itself — not assumed to happen via re-render. This was the root cause of KNOWN_BUGS.md #2.

### `postRender()` — side effects after every render
Centralized place for: chart redraw, QR code generation, timeline lazy-load, and per-view lazy data loading (`finance`, `pricing`, `branches` tabs). All lazy-loaders here MUST use a one-time boolean flag, never an array-length check (see §2).

---

## 6. Routing

`AppState.view` is the route. `renderView()` is a plain switch statement — no router library, no URL-based routing for the dashboard (only the public tracking page uses a query param, `?track=CODE`).

```js
function renderView() {
  switch (AppState.view) {
    case "shipments":  return viewShipments();
    case "tasks":      return viewTasks();
    case "accounts":   return viewAccounts();      // routes further by role internally
    case "reports":    return viewReports();
    case "track":      return viewTrack();
    case "users":       return viewUsers();
    case "merchants":   return viewAdminMerchants();
    case "finance":     return viewFinance();
    case "pricing":     return viewPricing();
    case "branches":    return viewBranches();
    case "audit":       return viewAudit();
    case "addresses":   return viewAddresses();
    case "recipients":  return viewRecipients();
    case "products":    return viewProducts();
    case "pickup":      return viewPickupRequests();
    default:             return viewOverview();
  }
}
```

Per-role nav menus are defined in `ROLE_MAP[role].nav` — an array of view keys. Adding a new tab to a role's sidebar is a one-line change there plus a `case` in the switch above.

---

## 7. Main Modules (17 `view*()` functions)

| Function | Audience | Notes |
|---|---|---|
| `viewOverview` | admin | dashboard home, KPI cards, charts |
| `viewShipments` | admin/merchant | shared shipment list + filters |
| `viewTasks` | courier | assigned deliveries |
| `viewTrack` | customer/public | public tracking by code |
| `viewAccounts` | all roles | role-branches internally: customer → empty, courier → `viewMyWallet()`, merchant/admin → COD ledger |
| `viewMyWallet` | courier | real wallet from `driver_transactions` |
| `viewReports` | admin | aggregate reports |
| `viewUsers` | admin | user management (suspend/delete/edit) |
| `viewAudit` | admin | audit log viewer |
| `viewBranches` | admin | branches + warehouses, 2 sub-tabs |
| `viewPricing` | admin | zones + rules + simulator, 3 sub-tabs |
| `viewFinance` | admin | overview/drivers/cod/settlements/invoices/expenses, 6 sub-tabs |
| `viewAdminMerchants` | admin | cross-merchant data browser |
| `viewAddresses`, `viewRecipients`, `viewProducts`, `viewPickupRequests` | merchant | own-data CRUD views |

---

## 8. Global Helpers

| Helper | Purpose |
|---|---|
| `money(n)` | Currency formatting |
| `fmtDate(d)`, `fmtTime(d)` | Date formatting |
| `esc(str)` | HTML-escapes user input before interpolation into templates (XSS guard) |
| `icon(name)` | Returns SVG markup for named icons |
| `toast(msg, type)` | Transient notification |
| `kpi(label, value, icon, color, bg, filter?)` | Reusable KPI card builder |
| `can(permCode)` | Checks current user's permission set (resolves `PERM_ALIAS` legacy codes) |
| `visible()` | Returns the role-filtered, search-filtered shipment list — the single source for any shipment table render |
| `loadEgyptData()` | **Async** — lazily populates `EGYPT_GOV` (governorate→city map) from a static dataset. Any modal that renders a governorate `<select>` MUST `await loadEgyptData()` first — this was missed in two places and caused KNOWN_BUGS.md #6 |
| `startRealtime()` | Subscribes to Supabase Realtime channel for live shipment updates (admin only) |

---

## 9. UI Lifecycle Summary (cheat sheet)

| Trigger | What runs |
|---|---|
| Page load | boot IIFE → session check → `render()` |
| Login success | `render()` (full shell) |
| Sidebar nav click | `AppState.view = X` → manually sync sidebar active class → `rerenderContent()` |
| Any `App.*` write action | mutate state/DB → `rerenderContent()` (in `finally` block) |
| Modal save button | DB write → close modal → `rerenderContent()` or targeted `App.load*Data()` |
| Tab switch inside a view (finance/pricing/branches sub-tabs) | `AppState.xTab = Y` → `rerenderContent()` → `postRender()` lazy-loads that tab's data once |
