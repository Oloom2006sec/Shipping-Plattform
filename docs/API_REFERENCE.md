# API_REFERENCE.md
**Al-Nukhba Express — Complete Developer Reference**
Extracted from `app.js` (5,214 lines). Updated after every phase.

This document makes it possible to understand the entire application without reading `app.js` first.

---

## Table of Contents
1. [Render Flow (Boot to Screen)](#1-render-flow)
2. [AppState Reference](#2-appstate-reference)
3. [DB Layer — All Methods](#3-db-layer)
4. [App Layer — All Methods](#4-app-layer)
5. [View Functions — All Pages](#5-view-functions)
6. [Global Helpers](#6-global-helpers)
7. [Call Relationship Map](#7-call-relationships)
8. [Constants Reference](#8-constants)

---

## 1. Render Flow

### Complete lifecycle from page load to interactive screen

```
PAGE LOAD
  └─► boot IIFE (async, at end of app.js)
        ├─ getSession()                      read localStorage token
        ├─ no session?  → render("home")     show homepage, stop
        └─ session found?
              ├─ db.auth.getSession()         verify token with Supabase
              ├─ DB.getProfile(session.id)    load primary_role from DB
              ├─ loadUserPermissions(uid)     fills AppPerms Set from DB
              ├─ DB.loadShipments()           load user's shipments
              ├─ DB.loadNotifications(role)
              ├─ DB.loadUsers()               admin/merchant only
              ├─ DB.loadCouriers()
              ├─ if admin:
              │     startRealtime()
              │     DB.loadAllMerchants()     ← must await, not .then()
              │     DB.loadBranches()
              │     DB.loadWarehouses()
              ├─ if merchant: App.loadMerchantData()
              ├─ if courier:  App.loadMyWallet()
              └─ render()

render()
  ├─ no user?  → renderHomepage() or renderAuth()
  └─ user?     → renderDashboard()
                    ├─ resolve _role = primary_role || role
                    ├─ build navKeys from ROLE_MAP[_role].nav
                    ├─ if admin → renderAdminShell(navKeys, unread)
                    │               writes full page HTML to document.body
                    └─ else     → renderSimpleShell(navKeys, unread)
                    ├─ bindDashboardEvents()   shell-level listeners (sidebar, header)
                    └─ postRender()            side effects

NAV CLICK (sidebar item)
  └─ AppState.view = newView
     $$("[data-view]").forEach → sync .active class   ← must be explicit
     rerenderContent()

rerenderContent()
  ├─ $("viewContent").innerHTML = renderView()   switch on AppState.view
  ├─ bindContentEvents()                         content-level listeners only
  └─ postRender()

postRender()
  ├─ renderQRCodes()
  ├─ renderCharts()
  ├─ if view==="audit" → App.loadAudit()
  ├─ if view==="finance" && tab !== "overview" → App._loadFinanceTabData(tab)
  ├─ if view==="pricing" && !_pricingDataLoaded → loadPricingData()   (one-time flag)
  └─ if view==="branches" && !_branchDataLoaded → loadBranchData()    (one-time flag)
```

### Authentication flow (login path)

```
handleLogin(e)
  ├─ db.auth.signInWithPassword(email, password)
  ├─ DB.getProfile(uid)                     get primary_role
  ├─ set AppState.user                      with role + primary_role
  ├─ Promise.all([
  │     loadUserPermissions(uid),           fills AppPerms
  │     DB.loadShipments(),
  │     DB.loadNotifications(role),
  │     DB.loadUsers(),
  │     DB.loadCouriers()
  │   ])
  ├─ await all data → commit to AppState atomically
  ├─ saveSession(user)                      write to localStorage
  ├─ if admin: startRealtime() + load merchants/branches/warehouses
  ├─ DB.addAudit("LOGIN", ...)              fire-and-forget
  └─ render()                               single call, everything ready
```

---

## 2. AppState Reference

Single source of truth. All UI reads from here. All DB writes update here after confirming success.

| Property | Type | Default | Purpose |
|---|---|---|---|
| `page` | string | `"home"` | Top-level page: `"home"`, `"auth"`, `"dashboard"` |
| `authMode` | string | `"login"` | Auth screen mode: `"login"` or `"register"` |
| `user` | object\|null | `null` | Current user `{id, name, role, primary_role, email, phone}` |
| `view` | string | `"overview"` | Current dashboard tab key (matches `ROLE_MAP[role].nav`) |
| `query` | string | `""` | Shipment list search query |
| `statusFilter` | string | `"all"` | Shipment status filter |
| `serviceFilter` | string | `""` | Service type filter (`door_to_door`/`drop_off`/`pickup`) |
| `orderFilter` | string | `""` | Order type filter (`express`/`standard`/`scheduled`) |
| `selectedShipment` | string\|null | `null` | Currently open shipment code (for detail panel) |
| `userFilter` | string | `""` | User list search query |
| `auditFilter` | string | `""` | Audit log search query |
| `shipments` | array | `[]` | All loaded shipments (role-filtered at load time) |
| `users` | array | `[]` | All non-deleted profiles (admin/merchant only) |
| `couriers` | array | `[]` | Active couriers for assignment dropdowns |
| `notifications` | array | `[]` | Current user's unread notifications |
| `realtimeChannel` | object\|null | `null` | Supabase Realtime subscription (admin only) |
| `merchantAddresses` | array | `[]` | Merchant's own saved addresses (Phase 2A) |
| `merchantRecipients` | array | `[]` | Merchant's own recipient database |
| `merchantProducts` | array | `[]` | Merchant's own product catalog |
| `pickupRequests` | array | `[]` | Merchant's own pickup requests |
| `merchantBalance` | number | `0` | Merchant's current COD balance from ledger |
| `allMerchants` | array | `[]` | All merchant profiles (admin only) |
| `selectedMerchantId` | string | `""` | Currently selected merchant in admin view |
| `adminMerchantTab` | string | `"shipments"` | Active tab in admin merchant detail view |
| `_adminMerchantData` | object | `{}` | Loaded data for selected merchant (addresses/recipients/products/etc.) |
| `financeTab` | string | `"overview"` | Active tab in finance view |
| `financeRange` | string | `"today"` | Selected date range in finance view |
| `driverWallet` | array | `[]` | Reserved — transactions loaded on demand |
| `codReconciliation` | array | `[]` | Reserved — loaded on demand |
| `expenses` | array | `[]` | Reserved — loaded on demand |
| `pricingZones` | array | `[]` | All active pricing zones (Phase 2C) |
| `pricingRules` | array | `[]` | All active pricing rules |
| `pricingTab` | string | `"rules"` | Active tab in pricing view |
| `lastFeeCalc` | object\|null | `null` | Last pricing simulator result |
| `_pricingDataLoaded` | boolean | `false` | One-time load guard — prevents infinite loop |
| `branches` | array | `[]` | All active branches (Phase 2D) |
| `warehouses` | array | `[]` | All active warehouses |
| `branchTab` | string | `"branches"` | Active tab in branches view |
| `selectedBranchId` | string | `""` | Currently selected branch |
| `_branchDataLoaded` | boolean | `false` | One-time load guard — prevents infinite loop |
| `myWalletBalance` | number | `0` | Courier's current wallet balance (Phase 3) |
| `myWalletTxns` | array | `[]` | Courier's wallet transaction history |
| `settleFilter` | string | `""` | Settlement status filter in finance view |
| `expenseCategory` | string | `""` | Expense category filter in finance view |

---

## 3. DB Layer

All Supabase access goes through the `DB` object. Never call `db.from(...)` directly in view functions or event handlers.

### Core / Identity

#### `DB.getProfile(uid)`
- **Purpose:** Load a user's profile from DB
- **Params:** `uid` — Supabase Auth user ID
- **Returns:** `{id, full_name, email, phone, primary_role, is_active, is_suspended, is_deleted}` or `null`
- **Tables:** `profiles`
- **Called by:** login handler, boot sequence

#### `DB.loadShipments()`
- **Purpose:** Load all shipments accessible to the current user (role-filtered via RLS + client)
- **Returns:** `Array<mappedRow>` — see `mapRow()` for shape
- **Tables:** `shipments`
- **Called by:** login, boot, post-create refresh

#### `DB.loadCouriers()`
- **Purpose:** Load all active, non-deleted couriers for assignment dropdowns
- **Returns:** `Array<{id, full_name, phone, email, primary_role}>`
- **Tables:** `profiles`
- **Filters:** `primary_role=courier`, `is_active=true`, `is_deleted=false`

#### `DB.loadUsers()`
- **Purpose:** Load all non-deleted user profiles (admin/merchant use)
- **Returns:** `Array<{id, name, email, phone, role, isActive, is_suspended, suspended, createdAt}>`
- **Tables:** `profiles`
- **Filters:** `is_deleted=false`
- **⚠️ Critical:** MUST include `.eq("is_deleted", false)` — removing this filter causes deleted users to reappear (KNOWN_BUGS.md #3)

#### `DB.loadNotifications(role)`
- **Purpose:** Load notifications for the current user's role
- **Returns:** `Array<notification>`
- **Tables:** `notifications`

### Shipment Operations

#### `DB.createShipment(payload)`
- **Purpose:** Insert a new shipment row
- **Tables:** `shipments`
- **Side effects:** None — caller must call `addTimeline()` and `addAudit()` separately
- **⚠️ Never include** `address` or `address_full` in payload — both are either non-existent or computed

#### `DB.updateShipment(code, patch)`
- **Purpose:** Update specific fields on a shipment
- **Tables:** `shipments`
- **Side effects:** triggers `shipments_on_update()` DB trigger for status timestamps

#### `DB.addTimeline(shipmentCode, message, actorName, actorRole, eventType)`
- **Purpose:** Append an event to the shipment timeline (append-only)
- **Tables:** `shipment_timeline`
- **⚠️ Never call UPDATE or DELETE on this table**

#### `DB.loadTimeline(shipmentCode)`
- **Returns:** `Array<{message, actor_name, actor_role, event_type, created_at}>`
- **Tables:** `shipment_timeline`

#### `DB.uploadPOD(shipmentCode, file)`
- **Purpose:** Upload proof-of-delivery image to Supabase Storage, then update `shipments.pod_url`
- **Tables:** `shipments`
- **Storage:** `shipment-pods` bucket

### Audit / Notifications

#### `DB.addAudit(action, entityId, details, entityType)`
- **Purpose:** Write an immutable audit record
- **Tables:** `audit_logs` (append-only)
- **Convention:** Call fire-and-forget (no `await`) — never let audit failure block the main action
- **Required details format:** `"Target: ${name} | Email: ${email} | By: ${actor}"`

#### `DB.addNotification(recipientId, recipientRole, message, type, shipmentCode?)`
- **Tables:** `notifications`

#### `DB.loadAuditLogs(filter?)`
- **Returns:** `Array<audit_log>`
- **Tables:** `audit_logs`

### Phase 3 — OTP / SMS

#### `DB.sendSMS(phone, message)`
- **Purpose:** Abstraction layer for SMS sending. Currently a `console.log` stub.
- **⚠️ To wire a real provider:** Replace only the body of this function. No other code changes needed.
- **Returns:** `{success: boolean, provider: string}`
- **Tables:** none

#### `DB.generateAndSendOTP(shipmentCode, customerPhone)`
- **Purpose:** Generate a 6-digit OTP, store it on the shipment, send via `sendSMS()`
- **Returns:** the OTP string (for admin display during testing)
- **Tables:** `shipments`

#### `DB.verifyOTP(shipmentCode, enteredCode)`
- **Purpose:** Compare entered code against stored, mark `otp_verified=true` on match
- **Returns:** `boolean`
- **Tables:** `shipments`

### Finance (Phase 2B)

#### `DB.loadDriverTransactions(driverId)` → `Array<transaction>` — `driver_transactions`
#### `DB.loadDriverBalance(driverId)` → `number` — calls `get_driver_balance()` RPC
#### `DB.loadInvoices(merchantId?)` → `Array<invoice>` — `invoices`
#### `DB.loadExpenses(category?)` → `Array<expense>` — `expenses`
#### `DB.loadCodReconciliation(driverId?, date?)` → `Array<reconciliation>` — `cod_reconciliation`
#### `DB.getFinancialSummary(start, end)` → `{total_shipments, delivered, returned, cod_total, fees_total, return_fees}` — calls `get_financial_summary()` RPC

### Pricing (Phase 2C)

#### `DB.loadPricingZones()` → `Array<zone>` — `pricing_zones`
#### `DB.loadPricingRules(merchantId?)` → `Array<rule>` with joined `pricing_zones(name,code)` — `pricing_rules`
#### `DB.calculateFee(merchantId, governorate, serviceType, orderType, weight)` → `{delivery_fee, return_fee, zone_name, rule_id, matched_on}` or `null` — calls `calculate_shipping_fee()` RPC

### Branches (Phase 2D)

#### `DB.loadBranches()` → `Array<branch>` — `branches` (is_deleted=false)
#### `DB.loadWarehouses()` → `Array<warehouse>` — `warehouses` (is_deleted=false)
#### `DB.loadBranchLog(shipmentCode)` → `Array<log>` — `shipment_branch_log`
#### `DB.getBranchMetrics(branchId, start, end)` → `{total_received, total_dispatched, active_shipments}` — calls `get_branch_metrics()` RPC

### Merchant Portal — own data (Phase 2A)

#### `DB.loadMerchantAddresses(merchantId)` → `Array<address>` — `merchant_addresses`
#### `DB.loadMerchantRecipients(merchantId, query?)` → `Array<recipient>` — `merchant_recipients`
#### `DB.loadMerchantProducts(merchantId)` → `Array<product>` — `merchant_products`
#### `DB.loadMerchantLedger(merchantId)` → `Array<entry>` — `merchant_ledger`
#### `DB.loadMerchantBalance(merchantId)` → `number` — calls `get_merchant_balance()` RPC
#### `DB.loadSettlements(merchantId)` → `Array<settlement>` — `settlements`
#### `DB.loadPickupRequests(merchantId)` → `Array<request>` — `pickup_requests`

### Admin cross-merchant data

#### `DB.loadAllMerchants()` → `Array<profile>` — `profiles` (primary_role=merchant, is_deleted=false)
#### `DB.loadAdminMerchantAddresses(merchantId)` → `Array<address>`
#### `DB.loadAdminMerchantRecipients(merchantId)` → `Array<recipient>`
#### `DB.loadAdminMerchantProducts(merchantId)` → `Array<product>`
#### `DB.loadAdminPickupRequests(merchantId?)` → `Array<request>`
#### `DB.loadAdminSettlements(merchantId?)` → `Array<settlement>`
#### `DB.loadAdminLedger(merchantId)` → `Array<entry>`

---

## 4. App Layer

All user-triggered actions. Every `onclick="App.xxx(...)"` in the UI points here.

### Navigation / Filters

| Method | Params | Purpose |
|---|---|---|
| `setFilter(f)` | status string | Set `AppState.statusFilter`, re-render |
| `setServiceFilter(f)` | service type string | Set `AppState.serviceFilter`, re-render |
| `setOrderFilter(f)` | order type string | Set `AppState.orderFilter`, re-render |
| `setFinanceTab(tab)` | tab id | Switch finance sub-tab, lazy-load data |
| `setBranchTab(tab)` | tab id | Switch branches sub-tab |
| `setPricingTab(tab)` | tab id | Switch pricing sub-tab |
| `setAdminMerchantTab(tab)` | tab id | Switch merchant detail sub-tab |
| `setSettleFilter(f)` | status string | Filter settlements list |
| `setExpenseCategory(c)` | category string | Filter expenses list |
| `filterMerchants(q)` | search string | Filter merchant list in admin view |

### Shipment Actions

| Method | Params | Permission | DB calls | Side effects |
|---|---|---|---|---|
| `newShipment()` | — | `shipments.create` | `loadCouriers`, `loadEgyptData`, `calculateFee`, `createShipment` | Opens modal |
| `updateStatus(id, status)` | code, status | `change_status` | `updateShipment`, `addTimeline`, `addNotification`, `addAudit` | |
| `rescheduleShipment(id)` | code | `shipments.reschedule` | `updateShipment`, `addTimeline`, `addAudit` | `prompt()` for reason |
| `suspendShipment(id)` | code | `shipments.suspend` | `updateShipment`, `addTimeline`, `addAudit` | `prompt()` for reason |
| `uploadPOD(id, inputId)` | code, input element id | `upload_pod` | `uploadPOD`, `updateShipment`, `addTimeline`, `addAudit` | |
| `exportExcel()` | — | `export_excel` | — | Generates xlsx download via SheetJS |
| `exportMerchantShipments(merchantId)` | merchant id | admin | `addAudit` | Generates xlsx download |
| `print(id)` | code | `print_shipment` | — | `window.print()` |
| `assignCourier(id, courierId)` | code, courier id | `assign_courier` | `updateShipment`, `addTimeline`, `addAudit` | |

### OTP (Phase 3, UI incomplete)

| Method | Params | DB calls |
|---|---|---|
| `sendDeliveryOTP(id, phone)` | shipment code, phone | `generateAndSendOTP`, `addAudit` |
| `openVerifyOTP(id)` | shipment code | `verifyOTP`, `updateShipment`, `addAudit` |

### User Management

| Method | Params | DB calls | Notes |
|---|---|---|---|
| `addUser()` | — | Supabase Auth admin invite, `addAudit` | |
| `editUser(id)` | user id | `db.from("profiles").update`, `addAudit` | |
| `toggleUser(id)` | user id | `db.from("profiles").update`, `addAudit` | try/catch/finally, button-lock mandatory |
| `deleteUser(id)` | user id | `db.from("profiles").update`, `addAudit` | SOFT DELETE ONLY — never hard DELETE |

### Finance (Phase 2B)

| Method | Params | Purpose |
|---|---|---|
| `viewDriverWallet(driverId, name)` | — | Opens wallet modal with full transaction history |
| `addDriverWalletEntry(driverId, name)` | — | Opens modal to credit/debit a specific driver |
| `addDriverTransaction()` | — | Opens modal to select driver + add transaction |
| `newCodReconciliation()` | — | Opens COD reconciliation entry modal |
| `verifyCodRecon(id)` | reconciliation id | Mark as verified |
| `flagCodRecon(id)` | reconciliation id | Mark as needing review |
| `addExpense()` | — | Opens expense entry modal |
| `generateInvoice()` | — | Opens invoice generation modal (period range picker) |
| `markInvoicePaid(id)` | invoice id | Mark invoice as paid |
| `approveSettlement(id, merchantId)` | — | Approve merchant settlement request |
| `rejectSettlement(id, merchantId)` | settlement id | Reject with reason prompt |
| `markSettlementPaid(id, merchantId)` | settlement id | Mark as paid, auto-creates ledger debit entry |
| `requestSettlement()` | — | Merchant requests payout (merchant-facing) |
| `_loadFinanceTabData(tab)` | tab id | Internal — lazy-loads data for active finance tab |

### Pricing (Phase 2C)

| Method | Purpose |
|---|---|
| `loadPricingData()` | Loads zones + rules into AppState |
| `simulateFee()` | Runs `calculateFee` with simulator form inputs |
| `addPricingRule()` | Opens add rule modal |
| `editPricingRule(id)` | Opens pre-filled edit rule modal |
| `deletePricingRule(id)` | Soft-deactivates rule (`is_active=false`) |
| `addPricingZone()` | Opens add zone modal with multi-select governorates |
| `editPricingZone(id)` | Opens pre-filled edit zone modal |

### Branches & Warehouses (Phase 2D)

| Method | Purpose |
|---|---|
| `loadBranchData()` | Loads branches + warehouses in parallel |
| `addBranch()` | Opens add branch modal (awaits `loadEgyptData()` first) |
| `editBranch(id)` | Opens pre-filled edit modal |
| `deleteBranch(id)` | Soft delete (`is_deleted=true, deleted_at, deleted_by`) |
| `viewBranchMetrics(id, name)` | Opens performance metrics modal (30-day stats) |
| `addWarehouse()` | Opens add warehouse modal (awaits `loadEgyptData()` first) |
| `editWarehouse(id)` | Opens pre-filled edit modal |
| `deleteWarehouse(id)` | Soft delete |

### Merchant Portal (merchant-facing)

| Method | Purpose |
|---|---|
| `loadMerchantData()` | Loads all merchant's own data in parallel |
| `addAddress()` / `setDefaultAddress(id)` / `deleteAddress(id)` | Address book CRUD |
| `addRecipient()` / `editRecipient(id)` / `deleteRecipient(id)` | Recipient CRUD |
| `shipToRecipient(id)` | Pre-fills new shipment modal from a saved recipient |
| `searchRecipients(q)` | Async recipient search |
| `addProduct()` / `editProduct(id)` / `deleteProduct(id)` | Product CRUD |
| `newPickupRequest()` / `cancelPickupRequest(id)` | Pickup request workflow |

### Admin Merchant Management

| Method | Purpose |
|---|---|
| `selectMerchant(id)` | Load all data for selected merchant (6 parallel queries) |
| `adminDeleteAddress(addressId, merchantId)` | Soft-delete a merchant's address |
| `adminDeleteRecipient(recipientId, merchantId)` | Soft-delete a merchant's recipient |
| `adminDeleteProduct(productId, merchantId)` | Soft-delete a merchant's product |
| `adminAssignPickup(requestId, merchantId)` | Assign courier to pickup request |
| `adminMarkPickedUp(requestId, merchantId)` | Mark pickup as completed |
| `adminCancelPickup(requestId, merchantId)` | Cancel a pickup request |
| `adminAddLedgerEntry(merchantId)` | Manually credit/debit merchant ledger |

### Driver Wallet (Phase 3)

| Method | Purpose |
|---|---|
| `loadMyWallet()` | Load courier's own balance + transactions into AppState |
| `refreshMyWallet()` | Re-load + re-render courier wallet view |

---

## 5. View Functions

Each `view*()` function returns an HTML string. Called by `renderView()` switch.

| Function | Route key | Audience | Required perms | Key DB methods | Key App methods |
|---|---|---|---|---|---|
| `viewOverview()` | `overview` | admin | — | — (uses AppState.shipments) | `setFilter` |
| `viewShipments()` | `shipments` | admin, merchant | `shipments.view_all` or `view_own` | — (uses AppState.shipments) | `newShipment`, `setFilter`, `setServiceFilter`, `setOrderFilter` |
| `viewTasks()` | `tasks` | courier | `view_assigned` | — | `updateStatus`, `uploadPOD`, `sendDeliveryOTP`, `openVerifyOTP` |
| `viewTrack()` | `track` | customer, public | `tracking.public` | `loadTimeline` | `manualTrack` |
| `viewAccounts()` | `accounts` | all | — | — | Routes internally by role: customer→empty, courier→`viewMyWallet()`, merchant/admin→COD |
| `viewMyWallet()` | (internal) | courier | — | — (uses AppState.myWalletTxns) | `refreshMyWallet` |
| `viewReports()` | `reports` | admin | `reports.view` | — (uses AppState.shipments) | `setFilter`, `setServiceFilter`, `setOrderFilter` |
| `viewUsers()` | `users` | admin | `users.view` | `loadUsers` | `addUser`, `editUser`, `toggleUser`, `deleteUser` |
| `viewAudit()` | `audit` | admin | `audit.view` | `loadAuditLogs` | — |
| `viewFinance()` | `finance` | admin | `finance.view` | Multiple (lazy per tab) | `setFinanceTab`, finance action methods |
| `viewPricing()` | `pricing` | admin | `pricing.view` | `loadPricingZones`, `loadPricingRules` | `setPricingTab`, pricing action methods |
| `viewBranches()` | `branches` | admin | `branches.view` | `loadBranches`, `loadWarehouses` | `setBranchTab`, branch action methods |
| `viewAdminMerchants()` | `merchants` | admin | — | `loadAllMerchants` | `selectMerchant`, admin merchant methods |
| `viewAddresses()` | `addresses` | merchant | `merchant.view_addresses` | — (uses AppState.merchantAddresses) | `addAddress`, `setDefaultAddress`, `deleteAddress` |
| `viewRecipients()` | `recipients` | merchant | `merchant.view_recipients` | — (uses AppState.merchantRecipients) | `addRecipient`, `shipToRecipient`, `searchRecipients` |
| `viewProducts()` | `products` | merchant | `merchant.view_products` | — (uses AppState.merchantProducts) | `addProduct`, `deleteProduct` |
| `viewPickupRequests()` | `pickup` | merchant | `merchant.view_pickup_req` | — (uses AppState.pickupRequests) | `newPickupRequest`, `cancelPickupRequest` |

---

## 6. Global Helpers

### `esc(str)` → string
HTML-encodes a string for safe interpolation into template literals. Prevents XSS.
```js
`<div>${esc(user.name)}</div>`   // ✅ always use esc() on user data
`<div>${user.name}</div>`         // ❌ never do this
```

### `money(n)` → string
Formats a number as currency with Arabic locale.
```js
money(1234.5)  // → "1,234.50 ج.م"
```

### `fmtDate(dateStr)` → string
Short date format from an ISO timestamp.
```js
fmtDate("2024-12-25T10:00:00Z")  // → "25/12/2024"
```

### `fmtTime(dateStr)` → string
Date + time format from an ISO timestamp.
```js
fmtTime("2024-12-25T10:30:00Z")  // → "25/12/2024 10:30"
```

### `initials(name)` → string
Returns up to 2 uppercase initials for avatar placeholders.
```js
initials("محمد أحمد")  // → "مأ"
```

### `icon(name, size?)` → string
Returns SVG markup for a named icon. Returns `""` for unknown names.
```js
icon("truck", 16)   // → "<svg ...>...</svg>"
icon("edit")        // → default 18px
```

### `can(permCode)` → boolean
Checks if the current user has a permission. Resolves legacy codes via `PERM_ALIAS`.
```js
can("manage_users")      // legacy code → resolves to "users.view"
can("branches.create")   // new format
```
Returns `false` if `AppState.user` is null.

### `toast(msg, type?)` → void
Shows a transient notification. Types: `"success"` (default), `"error"`, `"warning"`, `"info"`.
```js
toast("✅ تم الحفظ")
toast("فشل الاتصال", "error")
```

### `visible()` → Array
Returns the role-filtered + search-filtered + status-filtered shipment list.
This is the single source for every shipment table render — never filter `AppState.shipments` directly in a view function.

### `mapRow(r)` → object
Maps a raw Supabase shipments row to the canonical JS shape used throughout the app.
Key mappings to remember:
- `r.address_full` → `s.address`
- `r.delivery_attempts` → `s.attempts`
- `r.primary_role` is loaded separately (not from shipments)

### `kpi(label, value, icon, color, bg, filter?, hint?)` → string
Renders a KPI card HTML string. `filter` is an optional `statusFilter` value to set on click.
```js
kpi("تم التسليم", 42, "chart", "var(--success)", "var(--success-bg)", "delivered", "100%")
```

### `loadEgyptData()` → Promise\<void\>
Loads the Egypt governorate/city dataset into `EGYPT_GOV`. Idempotent (cached after first call).
**MUST be awaited before any modal that renders a governorate `<select>`.**
```js
await loadEgyptData();
const govOpts = Object.keys(EGYPT_GOV).sort().map(...);
```

### `startRealtime()` → void
Subscribes to Supabase Realtime on the `shipments` table. Admin only — called once on login.

### `shipTable(list)` → string
Renders a standard shipment table HTML string from an array of mapped shipment rows.

### `detailPanel(shipment)` → string
Renders the full shipment detail view (all fields, timeline, status action buttons).

---

## 7. Call Relationships

### Shipment Creation
```
App.newShipment()
  └── await loadEgyptData()           populate EGYPT_GOV
  └── DB.loadCouriers()               fresh courier list
  └── Modals.open()                   render form
  └── DB.calculateFee()               on field change (auto-calculate)
  └── DB.createShipment(payload)      on save
  └── DB.loadShipments()              refresh list
  └── rerenderContent()
```

### Status Update
```
App.updateStatus(id, status)
  └── DB.updateShipment(id, {status})   triggers DB shipments_on_update()
  └── DB.addTimeline(...)               append event (append-only)
  └── DB.addNotification(...)
  └── DB.addAudit(...)                  fire-and-forget
  └── rerenderContent()                 in finally block
```

### Settlement Approval
```
App.approveSettlement(settlementId, merchantId)
  └── db.from("settlements").update({status:"approved"})
  └── DB.addAudit(...)
  └── App.selectMerchant(merchantId)   reload merchant detail

App.markSettlementPaid(settlementId, merchantId)
  └── db.from("settlements").update({status:"paid"})
  └── DB.loadMerchantBalance()         get current balance
  └── db.from("merchant_ledger").insert({type:"settlement", amount:-X})
  └── DB.addAudit(...)
  └── App.selectMerchant(merchantId)
```

### Admin selects a merchant
```
App.selectMerchant(id)
  └── AppState.selectedMerchantId = id
  └── rerenderContent()                 paint skeleton immediately
  └── Promise.all([
        DB.loadAdminMerchantAddresses(id),
        DB.loadAdminMerchantRecipients(id),
        DB.loadAdminMerchantProducts(id),
        DB.loadAdminPickupRequests(id),
        DB.loadAdminLedger(id),
        DB.loadAdminSettlements(id)
      ])
  └── AppState._adminMerchantData = results
  └── rerenderContent()                 paint with real data
```

### Pricing auto-calculate on shipment form
```
recalcFee() [closure inside App.newShipment modal]
  └── DB.calculateFee(merchantId, gov, svc, ord, weight)
        └── db.rpc("calculate_shipping_fee", params)
  └── $("fFee").value = result.delivery_fee
  └── $("fReturnFee").value = result.return_fee
  └── $("fFeeHint").textContent = matched rule description
```

---

## 8. Constants

### `STATUS_MAP`
13 shipment statuses with display label and badge class.
```js
STATUS_MAP["delivered"] // → {label:"تم التسليم", badge:"badge-success", step:8}
```

### `SERVICE_MAP`
3 service types: `door_to_door`, `drop_off`, `pickup`.

### `ORDER_TYPE_MAP`
3 order types: `express`, `standard`, `scheduled`.

### `STATUS_STEPS`
Array defining the progression steps for the shipment progress indicator:
`["submitted","pickup_requested","picked_up","at_warehouse","in_transit","at_branch","out_for_delivery","delivered"]`

### `ROLE_MAP`
Maps each role to its sidebar nav tab array.
```js
ROLE_MAP["admin"]    // → {nav: ["overview","shipments","tasks","accounts","finance","pricing","branches","reports","users","merchants","audit","track"]}
ROLE_MAP["merchant"] // → {nav: ["overview","shipments","addresses","recipients","products","pickup","accounts"]}
ROLE_MAP["courier"]  // → {nav: ["tasks","accounts"]}
ROLE_MAP["customer"] // → {nav: ["track","accounts"]}
```

### `NAV_LABELS`
Maps view key → Arabic sidebar label.

### `PERM_ALIAS`
Maps legacy permission strings to current DB permission codes.
```js
PERM_ALIAS["create_shipment"] // → "shipments.create"
PERM_ALIAS["manage_users"]    // → "users.view"
```

### `AppPerms`
A `Set<string>` of the current user's permission codes, loaded from DB on login.
Queried by `can()`. Direct access: `AppPerms.has("branches.create")`.
