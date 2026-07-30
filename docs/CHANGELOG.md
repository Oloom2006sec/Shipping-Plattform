# CHANGELOG.md
**Al-Nukhba Express — Chronological Development Log**

Entries are in execution order. Each entry lists the SQL migration (if any), UI changes, and whether it was a breaking change.

---

## Phase 0 — Production Schema Foundation
**Migration:** `migration_production.sql`
**Breaking:** Yes — establishes the canonical schema all later phases build on.

- Created `profiles`, `shipments`, `shipment_timeline`, `notifications`, `audit_logs`
- Created full RBAC core: `roles`, `permissions`, `role_permissions`, `profile_roles`
- Seeded 10 roles and initial permission set
- Established multi-tenancy hook pattern (`tenant_id uuid DEFAULT NULL` on every table)
- Established soft-delete pattern (`is_deleted`/`deleted_at`/`deleted_by`)
- Established append-only pattern for `shipment_timeline` and `audit_logs`
- `address_full` as `GENERATED ALWAYS AS` computed column

## Phase 1 — Shipment Lifecycle Expansion
**Migration:** `phase1_migration.sql`
**Breaking:** No — additive only.

- Expanded shipment status from a basic set to 13 full-lifecycle states (`draft` → `submitted` → ... → `delivered`/`returned`/`cancelled`/`suspended`/`rescheduled`)
- Added `service_type`, `order_type`, `scheduled_at`
- Added physical attributes: `weight`, `quantity`, `width`, `height`, `depth`, `barcode`
- Added `return_fee`
- Added proof-of-delivery extensions: `signature_url`, `otp_code`, `otp_verified`, `otp_verified_at`
- Added reschedule/suspend tracking columns
- Added legacy `branch_code`/`warehouse_code` text columns (later superseded by proper FKs in Phase 2D)

## Phase 2A — Merchant Portal
**Migration:** `phase2a_migration.sql`
**Breaking:** No.

- Created `merchant_addresses`, `merchant_recipients`, `merchant_products`
- Created `merchant_ledger` (append-only)
- Created `settlements`, `pickup_requests`
- New UI: `viewAddresses()`, `viewRecipients()`, `viewProducts()`, `viewPickupRequests()`
- New merchant sidebar nav: addresses, recipients, products, pickup

## Phase 2A-Admin — Admin Merchant Management
**Migration:** none (reuses Phase 2A tables)
**Breaking:** No.

- New UI: `viewAdminMerchants()` — cross-merchant data browser
- New `DB.loadAllMerchants()` and per-merchant admin-scoped loaders
- New admin sidebar tab: merchants

## Phase 2B — Financial Management
**Migration:** `phase2b_migration.sql`
**Breaking:** No.

- Created `driver_transactions` (append-only courier wallet ledger)
- Created `invoices` with auto-numbering (`next_invoice_number()`)
- Created `expenses`
- Created `cod_reconciliation`
- New functions: `get_driver_balance()`, `get_financial_summary()`
- New UI: `viewFinance()` with 6 sub-tabs (overview/drivers/cod/settlements/invoices/expenses)
- New admin sidebar tab: finance

## Phase 2C — Pricing Engine
**Migration:** `phase2c_migration.sql`
**Breaking:** No.

- Created `pricing_zones`, `pricing_rules`
- New function: `calculate_shipping_fee()` — server-side fee resolution with priority-based rule matching
- New UI: `viewPricing()` with 3 sub-tabs (rules/zones/simulator)
- New admin sidebar tab: pricing
- Shipment creation form now calls `calculateFee()` to suggest delivery fee

## Phase 2D — Branch & Warehouse Management
**Migration:** `phase2d_migration.sql`
**Breaking:** No.

- Created `branches`, `warehouses`
- Created `shipment_branch_log` (append-only)
- Added proper FK columns `shipments.branch_id`, `shipments.warehouse_id` (superseding Phase 1's text columns)
- New functions: `get_branch_metrics()`, `get_warehouse_load()`
- New UI: `viewBranches()` with 2 sub-tabs
- New admin sidebar tab: branches

## Phase 3 (partial) — Driver Self-Service Wallet
**Migration:** none (reuses Phase 2B `driver_transactions`)
**Breaking:** No.

- New UI: `viewMyWallet()` — courier-facing wallet view
- New `App.loadMyWallet()`, `App.refreshMyWallet()`
- Courier `accounts` tab now routes to real wallet data instead of placeholder

## Phase 3 (in progress, paused) — OTP Delivery Verification
**Migration:** none (uses Phase 1's `otp_code`/`otp_verified` columns)
**Breaking:** No.
**Status:** Backend methods written (`sendSMS()` stub, `generateAndSendOTP()`, `verifyOTP()`). Courier-facing UI not yet built — paused for stabilization sprint.

---

## Stabilization Sprint — 8-Bug Regression Fix
**Migration:** none (frontend + CSS only)
**Breaking:** No — pure bug fixes.

Eight previously-working features had regressed during the Phase 2/3 development sequence. Full root-cause detail in `KNOWN_BUGS.md`. Summary:

1. **Mobile dashboard layout** — fixed inline `style="grid-template-columns:1fr 340px"` bypassed all media queries. Replaced with `.overview-grid`/`.grid-2col` CSS classes (and added the missing desktop base rule for `.overview-grid`, which had only ever had a mobile override).
2. **Sidebar active tab not following navigation** — `rerenderContent()` never touches the sidebar; nav click handler now explicitly syncs the `.active` class.
3. **User suspend not persisting** — `loadUsers()` had lost its `is_deleted=false` filter and used a non-canonical field name (`suspended` vs `is_suspended`).
4. **User delete throwing FK violation** — `deleteUser()` had reverted to a hard `DELETE` on `profiles`, which violates `shipment_timeline.actor_id` FK. Reverted to soft delete.
5. **Merchants/branches disappearing after page refresh** — boot/session-restore path used fire-and-forget `.then()` instead of `await`, racing against `render()`.
6. **Governorate dropdown empty in Branches modal** — `EGYPT_GOV` is lazily loaded via `loadEgyptData()`; `addBranch()`/`addWarehouse()` were missing the `await` call.
7. **Pricing rule Edit button dead** — `App.editPricingRule()` was referenced in the UI but never implemented.
8. **Infinite request loop on Branches/Pricing tabs (3000+ requests)** — lazy-load guards used `!AppState.branches.length` instead of a one-time-fired flag; an empty DB result kept the guard permanently true, causing `loadBranchData()` → `rerenderContent()` → `postRender()` to loop forever.

Also removed: a stray duplicate `menuToggle` click listener with leftover `console.log("MENU CLICKED")` debug statements registered at module scope.

**Files touched:** `app.js`, `styles.css`. No SQL changes.

---

## Convention going forward

Every future phase gets one entry here, added the same session the phase is completed — not retroactively reconstructed from chat history.

## Regression Sprint #2 — 5-Bug Fix
**Migration:** none (frontend + CSS only)
**Breaking:** No — pure bug fixes.

1. **Shipment creation NOT NULL constraint** — `merchant_name`/`merchant_phone` now send `""` not `null` for admin-created shipments (column is `NOT NULL DEFAULT ''`).
2. **Pricing simulator governorates empty** — `postRender()` now triggers `loadEgyptData()` when `pricingTab==="simulator"` and `EGYPT_GOV` is still empty, then re-renders once loaded.
3. **Preview As broken on desktop** — `roleSwitcher` now calls `render()` instead of `renderDashboard()` so the full page (including sidebar nav) is rebuilt for the new role.
4. **Logout button hidden on mobile** — mobile sidebar now has `height:100vh; overflow-y:auto; display:flex; flex-direction:column` so the logout footer is always reachable.
5. **Admin dashboard not responsive on mobile** — `.page` and `.card` now have `max-width:100%; overflow-x:hidden; box-sizing:border-box` in the mobile breakpoint.

**Files touched:** `app.js`, `styles.css`. No SQL changes.

## UI Regression Fix — Shipment Table Column Swap
**Migration:** none (frontend only)
**Breaking:** No.

- Fixed: Merchant and Weight columns were swapped in the shipment table. `التاجر` header was showing weight values; `الوزن` header was showing merchant names.
- Root cause: Phase 1 inserted the Weight `<td>` cell after the Merchant `<td>` cell in the data row, while the header had them in the opposite order.
- Fix: Swapped the two cells to match header order: المبلغ → الوزن → التاجر → المندوب.
- Verified: Full 11-column header/data audit — all columns correct.

## Bulk Shipment Import Module
**Migration:** `phase_import_migration.sql`
**Breaking:** No — purely additive.

### New DB tables
- `import_batches` — one record per file upload, tracks status lifecycle (pending→validating→validated→importing→done/failed/cancelled)
- `import_rows` — one record per spreadsheet row, stores raw data, parsed values, validation errors, and import result

### New permissions (7)
`import.create` · `import.view_own` · `import.view_all` · `import.cancel` · `import.reprocess` · `import.download_tpl` · `import.download_err`

### New UI
- **6-step import wizard**: Download Template → Upload File → Validate → Preview → Import → Report
- Step bar with active/done state tracking
- Drag-and-drop file upload zone
- Per-row validation error table with Arabic messages
- Live progress bar during bulk import
- Admin-only merchant selector in step 2
- History/statistics landing page with batch table

### Validation engine
Required fields · Egyptian phone format (01xxxxxxxxx) · Governorate/city lookup against EGYPT_GOV · COD/fee/weight range checks · service_type/order_type enum validation · Duplicate phone detection against existing shipments

### Extra features
- Auto-create recipients after import (opt-in checkbox)
- Auto-save addresses after import (opt-in checkbox)
- Excel template download with Arabic headers + sample row + notes
- Error report download (failed rows as Excel)
- Retry failed rows only
- Resume validated batches
- Admin can view all batches; merchant sees only own

### New App methods (14)
`loadImportBatches` · `startImportWizard` · `cancelImportWizard` · `downloadImportTemplate` · `importWizardNext` · `importWizardBack` · `handleImportFile` · `handleImportDrop` · `runImportValidation` · `runBulkImport` · `finishImport` · `cancelImport` · `retryFailedRows` · `resumeImportBatch` · `downloadErrorReport`

### New global functions
`validateImportRow()` · `normalizeImportRow()` · `generateImportTemplate()` · `parseImportFile()` · `generateShipmentCode()`

**Files touched:** `app.js`, `styles.css`, `phase_import_migration.sql`

## Phase 3 — OTP Delivery Verification (UI Complete)
**Migration:** none — uses `otp_code`, `otp_verified`, `otp_verified_at` columns from Phase 1
**Breaking:** No.

### What was added
- **viewTasks()**: Two new buttons visible only when `status === "out_for_delivery"`:
  - 📱 إرسال كود تحقق — calls `sendDeliveryOTP()` to generate + send OTP via SMS stub
  - 🔐 تأكيد بالكود — opens 6-digit PIN entry modal
  - Once verified: replaced by ✅ تم التحقق من الهوية badge
- **App.sendDeliveryOTP(shipmentCode, phone)**: Generates 6-digit OTP, stores in DB, calls `DB.sendSMS()` stub, adds timeline event, audits, shows code in toast for dev testing
- **App.openVerifyOTP(shipmentCode)**: Opens PIN modal with numeric keypad input, resend button, and "skip" option for cases where customer has no phone
- **App.confirmOTP(shipmentCode)**: Validates 6-digit entry against DB, updates local `s.otpVerified`, adds timeline + audit on success, tracks up to 3 failed attempts before locking
- **CSS**: `.otp-verified-badge`, `.otp-send-btn`, `.otp-verify-btn`, `.btn-full`, `.btn-ghost`

### Dev/testing note
`DB.sendSMS()` is still a `console.log` stub. The OTP code is shown in the success toast during development. To go live: replace only the body of `DB.sendSMS()` with a real provider API call. No other code changes needed.

## Phase 3 — Signature Capture (Canvas POD)
**Migration:** none — uses `signature_url` column from Phase 1
**Breaking:** No.

### What was added
- **DB.uploadSignature(shipmentCode, blob)** — uploads PNG blob to `pod-images` bucket with `sig_` prefix, returns public URL
- **viewTasks()** — new "✍️ توقيع العميل" button alongside POD photo. Shows "✍️ تم التوقيع" badge once captured.
- **App.openSignatureCapture(shipmentCode)** — opens modal with 440×200 canvas, customer name + shipment code header, placeholder text, clear button
- **App._initSignatureCanvas()** — wires mouse + touch events with DPI scaling (scaleX/scaleY). Touch events use `passive:false` to prevent page scroll during signing.
- **App._clearSignatureCanvas()** — clears canvas, restores placeholder
- **App.saveSignature(shipmentCode)** — validates canvas is not blank, converts to PNG blob via `canvas.toBlob()`, uploads, updates `signature_url` in DB + local state, adds timeline event `signature_captured`, audits `SIGNATURE_CAPTURED`
- **Detail panel** — signature and POD photo displayed side-by-side when both present
- **CSS** — `#sigCanvas { touch-action:none; cursor:crosshair }` to prevent scroll conflict on mobile

## Phase 9 — Reporting & Analytics
**Migration:** none — all data from existing tables
**Breaking:** No.

### New helper functions (global)
- `getReportRange(range)` — converts period key to `{start,end}` Date objects
- `filterByRange(list,range,field)` — filters shipment array by date range
- `buildDailyChart(list,range)` — builds day-keyed data for bar charts
- `renderBarChart(data,valueKey,color,labelFn)` — renders inline SVG-free CSS bar chart

### viewReports() — fully replaced with 5-tab analytics view
- **Period picker** — Today / 7 days / This month / 3 months / This year
- **Tab 1 نظرة عامة** — 6 KPI cards, delivery/return rate progress bars, status distribution, service type breakdown, top 8 governorates
- **Tab 2 اتجاهات** — daily bar charts for shipments created / delivered / returned; period stats (peak day, daily averages)
- **Tab 3 المناديب** — courier performance table: total, delivered, returned, color-coded delivery rate bar (green ≥80%, yellow ≥60%, red <60%), COD collected, fees earned. Excel export.
- **Tab 4 التجار** — (admin only) merchant performance table with net COD calculation. Excel export.
- **Tab 5 مالي** — 6 financial KPIs, detailed financial summary table with business logic explanations, top 10 governorates by COD revenue

### New App methods (6)
- `setReportsTab(tab)` — switch tab, re-render
- `setReportRange(range)` — switch period, re-render
- `exportReportExcel()` — full shipment list as Excel (14 columns), audited
- `exportReportPDF()` — summary + courier breakdown as PDF via jsPDF
- `exportCourierReport()` — courier performance as Excel
- `exportMerchantReport()` — merchant performance as Excel

### AppState fields added
- `reportsTab:"overview"` — active reports tab
- `reportRange:"month"` — active period filter

## Phase 4 — Realtime Operations Dashboard
**Migration:** none — extends existing Supabase Realtime infrastructure
**Breaking:** No.

### Enhanced startRealtime()
- Now subscribes to 3 channels: shipments INSERT, shipments UPDATE, notifications INSERT
- Tracks `AppState.rtConnected` from Supabase subscription status callback
- UPDATE handler only logs to activity feed when `status` field actually changes (not every field update)
- Activity feed capped at 50 events (FIFO — oldest dropped)
- `AppState.rtEventCount` incremented on every event; shown as badge in topbar
- RT status dot updates in-place via `getElementById("rtStatusDot")` without full re-render

### New topbar element — RT status dot
- Green pulse = connected (SUBSCRIBED) · Red = disconnected
- Shows event count badge when > 0
- Hidden text collapses on mobile

### New view: viewLiveOps()
- Route: `liveops` · Admin nav tab: العمليات المباشرة
- **Connection banner** — shows RT connection state with visual indicator
- **Today's KPIs (6)** — shipments created, delivered, returned, currently out for delivery, active couriers, needs attention count
- **Shipment pipeline** — 8 status rows with live counts and mini progress bars; clickable to filter shipments view
- **Courier status board** — two sections: Active (have out_for_delivery shipments) with count, Idle (available for assignment)
- **Live activity feed** — scrollable FIFO log of RT events (new shipment, status changes); timestamps via fmtTime(); empty state with radar icon
- **Needs attention** — auto-shown when suspended or rescheduled shipments > 0; displays shipTable of affected shipments

### New App methods
- `App.resetRtCounter()` — resets rtEventCount to 0
- `App.clearActivityFeed()` — clears the activity feed array

## SMS Provider Integration
**Migration:** none
**Breaking:** No — stub behaviour unchanged until `SMS_CONFIG.provider` is changed.

### SMS_CONFIG block (top of app.js, line ~11)
New `const SMS_CONFIG` object with full configuration for three providers:
- `"stub"` — default, console.log only, zero setup needed
- `"twilio"` — Account SID + Auth Token + From number; uses Basic auth + form-encoded POST
- `"vonage"` — API key + secret + from name; JSON POST to Nexmo REST API
- `"http_gateway"` — fully generic; endpoint + credentials + sender ID; configurable success detection field/value for any Egyptian provider (ConnectMisr, Unifonic, Myfa7el, etc.)

### DB.sendSMS() — real multi-provider implementation
- Normalises Egyptian phone numbers to E.164 (`01xxxxxxxxx` → `+20xxxxxxxxxx`)
- Reads `SMS_CONFIG.provider` and routes to the correct implementation
- Throws a descriptive error on provider API failures (shown in toast to courier)
- Unknown provider throws `"Unknown SMS provider: ..."` — never silently swallows config mistakes

### Admin settings modal (App.openSmsSettings())
- Accessible via "إعداد مزود SMS" button on admin overview (shown only when provider = stub)
- Shows provider-specific field sets with helpful links to provider dashboards
- Live test SMS button — sends "النخبة للشحن السريع: هذه رسالة اختبار" to any phone number
- Result shown inline in the modal (green success / red error)
- Security note: settings apply to current session only; for permanent config, edit `SMS_CONFIG` in `app.js`
- Audits: `SMS_PROVIDER_CHANGED` and `SMS_TEST` events logged

### To activate a real provider
1. Open `app.js` and find `const SMS_CONFIG` near the top
2. Set `provider: "twilio"` (or `"vonage"` or `"http_gateway"`)
3. Fill in your provider credentials in the matching block
4. Save and deploy — zero other changes needed

## Live Ops Stabilization Sprint
**Migration:** none
**Breaking:** No.

### Root causes fixed
1. **Pipeline zeros** — `postRender()` had no liveops hook; added `App.refreshLiveOpsData()` call. Pipeline now shows submitted+draft in one row and refreshes shipments from DB on every visit.
2. **Courier board empty** — was filtering wrong array (`AppState.users` with `{name}` shape). Rewrote to use `AppState.couriers` (`{full_name}` shape) + built a `courierWorkload` map joining `AppState.shipments` by `courierId`. Each active courier card now shows assigned total, out-for-delivery, picked-up counts.
3. **Activity feed empty** — feed only populated by future RT events, never by history. `refreshLiveOpsData()` now pre-loads last 30 `shipment_timeline` rows from DB when feed is empty, mapping each to the feed icon/text/badge format.

### New: `App.refreshLiveOpsData(showToast?)`
- Reloads `AppState.shipments` + `AppState.couriers` from DB
- Pre-populates activity feed from `shipment_timeline` (last 30 events) if feed is empty
- Called automatically by `postRender()` on every liveops view
- Also exposed as manual "🔄 تحديث" button in the connection banner

## Live Ops Stabilization Sprint #2
**Migration:** none
**Breaking:** No.

### Fix 1 — RT connection status (4 states)
- Replaced `AppState.rtConnected:boolean` with `AppState.rtStatus:string`
- Added `rtStatusConfig(status)` helper: SUBSCRIBED→🟢, TIMED_OUT→🟡, CLOSED→🔴, CHANNEL_ERROR→🔴, default→🟡
- Subscribe callback now stores the full Supabase status string and updates dot+text in-place
- Both topbar RT indicator and liveops banner use `rtStatusConfig()` consistently

### Fix 2 — Courier board
- Removed binary Active/Idle split that caused misleading "no active couriers" message
- All couriers shown in single scrollable list with workload badges
- Each courier card: green=Busy (has active shipments), gray=Available (no active shipments)
- Summary counts at top: total / busy / available
- Workload details per busy courier: total assigned / out-for-delivery / picked-up / in-transit
- Added honest disclaimer that status reflects shipment assignment, not physical presence
- KPIs updated: "مناديب مشغولون" + "متاحون للتعيين" instead of single "نشطون"

## Enhanced Shipment Tracking Page
**Migration:** none — pure frontend enhancement
**Breaking:** No.

### What was added to viewTrack()

**Empty / search state:**
- Prominent code input field (auto-focus, submit on Enter, monospace font)
- Not-found message shows the searched code
- Clean empty state for fresh visits

**Hero banner (dynamic color):**
- Green for delivered, red for returned, gray for cancelled, yellow for problem states, brand for in-progress
- Monospace shipment code with letter-spacing
- "Copy tracking link" button using `navigator.clipboard` API

**Progress stepper:**
- Hidden and replaced with a clear red banner for returned/cancelled shipments
- Current step highlighted in brand color
- Horizontally scrollable on mobile (min-width: 560px)

**Shipment details card:**
- COD amount shown prominently (18px, bold, green)
- Estimated delivery date (if set)
- Weight
- Notes
- OTP verified + Signature badges shown on delivered shipments

**POD + Signature section:**
- Both images shown side-by-side
- Click to open full-size in new tab

**Event timeline:**
- `TL_ICON` map for event type → emoji (created/picked_up/delivered/otp_verified/signature_captured/etc.)
- Lazy-loaded spinner while fetching timeline from DB

**Share section:**
- WhatsApp deep link: `wa.me/?text=<shipmentCode>\n<trackUrl>`
- Tracking URL displayed for manual copy
- "Track another shipment" button

## User Profile & Settings
**Migration:** none — uses existing `profiles` table and `db.auth.updateUser()`
**Breaking:** No.

### Profile card in viewAccounts (all roles)
- Added to the top of every role's accounts view (customer, courier, merchant, admin)
- Shows: avatar initials, full name, email, phone, role badge
- Two action buttons: "تعديل الملف" and "تغيير كلمة المرور"

### App.openEditProfile() + App.saveProfile()
- Modal with name and phone fields; email is read-only (disabled input)
- Phone validation: Egyptian format 01xxxxxxxxx
- Updates `profiles.full_name` + `profiles.phone` via `db.from("profiles").update()`
- Updates `AppState.user.name` + `AppState.user.phone` immediately after save
- Audits `PROFILE_UPDATE` event
- try/catch/finally pattern with button lock

### App.openChangePassword() + App.changePassword()
- Modal with new password + confirm fields
- Validation: min 8 chars, must match
- Calls `db.auth.updateUser({ password })` — Supabase handles bcrypt hashing server-side
- Submit on Enter key
- Audits `PASSWORD_CHANGE` event

## Notifications System Overhaul
**Migration:** none — uses existing `notifications` table
**Breaking:** No — same table, same API, improved mapping and UI.

### loadNotifications() — fixed field mapping
- Now maps: `id`, `title`, `type`, `referenceId`, `recipientRole`, `createdAt`
- Reads `n.body||n.message||n.text` (robust to column naming variations)
- Limit increased from 20 to 30

### renderNotifPanel() — enhanced panel
- `TYPE_ICON` map: info/success/warning/error/shipment → emoji
- Title shown when present (bold, above body text)
- Unread dot (blue circle) per unread notification
- Unread count badge in panel header
- "قراءة الكل" (Mark all read) button when unread > 0
- Max 20 shown with overflow count
- Each notification clickable → marks read + navigates to shipment if `referenceId` starts with "ANE-"

### toggleNotif event handler — persists read state to DB
- On panel open: all visible unread IDs collected, `is_read=true` written to DB (fire-and-forget)

### clearNotif event handler — marks read instead of hard DELETE
- Previously called `.delete()` on all notifications (destructive, irreversible)
- Now calls `.update({is_read:true})` — preserves notification history, just clears the panel

### New App methods
- `App.markNotifRead(id, referenceId)` — marks one notification read in DB and local state; navigates to shipment if referenceId is an ANE code
- `App.markAllNotifsRead()` — marks all unread as read, updates badge in-place
- `App.broadcastNotification()` — admin modal to send a system notification to a role group (admin/merchant/courier/customer/all) with type and optional title
- `App._sendBroadcast()` — internal handler for the broadcast modal save button

### Admin overview — broadcast button
- "📢 إشعار جماعي" button always shown in admin overview header
- When SMS is in stub mode: shown alongside the SMS settings button

## Merchant Dashboard Enhancement + Recipient Quick-Fill
**Migration:** none
**Breaking:** No.

### Merchant Overview (viewOverview merchant branch)
- **Quick-action bar** at top: شحنة جديدة / طلب استلام / العملاء / حسابي
- **6 KPIs**: total shipments, delivered (+ rate), returned, in-progress, today's new, balance due
- **Financial summary card**: COD collected / delivery fees / return fees / net payable + settlement request button
- **Status breakdown card**: clickable status rows → navigate to filtered shipments view
- **Pending pickup requests**: shown as warning card when pickups are waiting
- **Recent shipments table**: last 8 shipments

### Recipient Quick-Fill in Shipment Creation Modal
- **Search field** appears above customer data fields when merchant has saved recipients
- Searches by name or phone with minimum 2-character threshold
- Shows up to 8 suggestions with avatar initials, name, phone, and governorate
- Selecting a suggestion fills: customer name, phone, phone2, governorate, city, street
- Triggers `change` event on governorate selector to update city dropdown and fee calculation

## Bulk Shipment Actions
**Migration:** none
**Breaking:** No — `shipTable()` still exists for non-shipments views (liveops needs-attention, merchant overview). `shipTableBulk()` is used only in `viewShipments`.

### New global functions
- `bulkToolbar(total)` — renders a branded action bar when shipments are selected: count display, select-all, deselect-all, status change dropdown, courier assign dropdown, Excel export button. Returns `""` when nothing selected.
- `shipTableBulk(list)` — shipTable variant with per-row checkboxes and header select-all checkbox. Selected rows highlighted in brand-light background.

### viewShipments() updated
- Uses `shipTableBulk(visible())` instead of `shipTable(visible())`
- Prepends `bulkToolbar(visible().length)` above the table

### AppState.selectedShipments
- New `Set()` field tracking selected shipment IDs
- Cleared automatically when any filter changes (statusFilter, serviceFilter, orderFilter)

### New App methods
- `bulkToggleOne(id, checked)` — add/remove one ID from selection
- `bulkTogglePage(ids, checked)` — select/deselect all IDs on current page
- `bulkSelectAll()` — select all currently visible (filtered) shipments
- `bulkUpdateStatus(status)` — confirm → loop: `updateShipment + addTimeline` per ID → audit `BULK_STATUS_UPDATE` → clear selection
- `bulkAssignCourier(courierId, courierName)` — confirm → loop: assign courier per ID → audit `BULK_ASSIGN_COURIER` → clear selection
- `bulkExport()` — export selected shipments (or all visible if none selected) as Excel; audits `BULK_EXPORT`

## Advanced Search & Filter System
**Migration:** none — pure frontend
**Breaking:** No.

### visible() — extended with 7 new filters
New filter fields applied on top of existing status/service/order filters:
- `dateFrom` / `dateTo` — creation date range (inclusive both ends)
- `amountMin` / `amountMax` — COD amount range
- `courierId` — exact courier match (admin only)
- `merchantId` — exact merchant match (admin only)
- `governorate` — partial text match on governorate
Full-text search also extended to include `merchantName`, `courierName`, `barcode`.

### advancedFilterPanel() — collapsible filter UI
- Toggle button in shipments view (highlighted when filters are active)
- "نشط" badge on toggle button when any advanced filter is set
- Result count shown: "X شحنة من Y إجمالي" when filters are active
- Date range pickers, amount range inputs, governorate text input
- Courier dropdown (admin only) from `AppState.couriers`
- Merchant dropdown (admin only) from `AppState.allMerchants`
- Collapses automatically when navigating to another tab

### Filter Presets (admin only, stored in localStorage)
- Save current filter set with a name (up to 10 presets, FIFO)
- Load preset: restores all filter fields and opens advanced panel
- Delete preset from the presets modal
- Stored under key `nukhba_filter_presets` in localStorage

### New App methods (7)
`toggleAdvancedFilter` · `applyAdvancedFilter` · `clearAdvancedFilter` ·
`saveFilterPreset` · `showFilterPresets` · `loadFilterPreset(idx)` · `deleteFilterPreset(idx)`

## Progress Report Bug Sprint — 4 Fixes
**Migration:** none
**Breaking:** No.

### Bug #22 — manualTrack() fixed
Reads `$("trackCodeInput")` when present (tracking page), falls back to `prompt()` for other contexts. Now also searches `AppState.shipments` first before navigating via URL — instant result for logged-in users.

### Bug #23 — Import row status update fixed
`runBulkImport()` now updates `import_rows.status` by `(batch_id, row_number)` instead of a client-side `.id` that was always `undefined`. Both success ("imported" + shipment_code) and failure ("failed" + error_message) paths fixed. Updates are fire-and-forget.

### Bug #24 — LiveOps refresh throttled
`postRender()` now only triggers `App.refreshLiveOpsData()` if ≥10 seconds since last refresh (`AppState._liveopsLastRefresh`). Manual refresh button bypasses throttle. Prevents cascading DB calls on burst RT events.

### Bug #25 — Notification read_at removed
Removed `read_at:new Date().toISOString()` from all 4 notification `.update()` calls. Column doesn't exist in migration SQL. `is_read:true` still written correctly.

### PROJECT_STATE.md rewritten
Completely rewrote `PROJECT_STATE.md` to reflect actual July 2026 state: 8,619 lines, 21 tables, 19 views, 14 nav tabs, all phases shipped + 8 additional features. Previous version was 40+ sessions out of date.

## Customer Portal
**Migration:** none — uses existing `profiles`, `shipments`, `notifications` tables
**Breaking:** No — purely additive new views + nav extension.

### New view functions
- `viewCustomerOverview()` — welcome banner with customer name/phone, 4 KPIs (total/in-progress/delivered/today), active shipments list with status icons, track-by-code shortcut input
- `viewCustomerShipments()` — full shipment history with status tab pills (all/قيد التوصيل/مُسلَّم/مرتجع), clickable rows → navigate to tracking page, COD amount displayed

### Customer nav extended
- Before: `["track","accounts"]`
- After: `["overview","cshipments","track","accounts"]`
- `cshipments` is a dedicated nav key (not the admin `shipments`) → routes to `viewCustomerShipments()`

### loadShipments() — role-based DB filter
- **Customer:** `.eq("customer_phone", phone)` — only their shipments fetched from DB
- **Courier:** `.eq("courier_id", user.id)` — only assigned shipments
- **Merchant:** `.eq("merchant_id", user.id)` — only their shipments
- **Admin/ops:** all shipments (limit 500)
- Previously: ALL shipments fetched for all roles, then filtered client-side

### visible() — customer early-return removed
- Previously: `if(role==="customer") return []` — customers saw nothing
- Now: returns all loaded shipments (already DB-scoped by loadShipments)

### Login & boot paths updated
- Customer role now calls `AppState.shipments = await DB.loadShipments()` after login and on session restore
- Shipments are DB-filtered by phone — only the customer's own shipments loaded

### Post-register redirect fixed
- Previously routed to `"track"` after registration
- Now routes to `"overview"` → `viewCustomerOverview()` for a proper welcome screen

### Architecture note
Customer data model: shipments are linked to customers by `customer_phone` field, not by `customer_id` (customers can track without an account via the public URL). Authenticated customers see all shipments matching their registered phone number.

## Auto-Dispatch Engine (P1 Enterprise Roadmap)
**Migration:** `phase_dispatch_migration.sql` — run before deploying app.js
**Breaking:** No — new nav tab, new tables, no changes to existing logic.

### New DB objects (migration)
- `dispatch_rules` table — rule definitions with priority ordering, matching conditions, assignment strategy
- `courier_configs` table — per-courier capacity, zone tags, service capabilities, availability toggle
- `dispatch_log` table — append-only record of every dispatch decision
- `get_courier_load_today(courier_id)` — SQL function for capacity check (called inside engine)
- `auto_assign_shipment(shipment_code)` — PL/pgSQL dispatch engine: evaluates rules in priority order, assigns courier, writes to dispatch_log, returns JSON result
- `auto_assign_batch(codes[])` — batch wrapper: calls engine per code, returns summary stats
- 5 new permission codes: `dispatch.view_rules`, `dispatch.manage_rules`, `dispatch.run`, `dispatch.view_log`, `dispatch.manage_configs`

### 4 assignment strategies (server-side in PL/pgSQL)
- `specific_courier` — assign to one named courier if under capacity
- `zone_pool` — assign to least-loaded courier in a zone (matched by zone_tag)
- `least_loaded` — assign to whichever eligible courier has fewest active shipments today
- `best_performer` — assign to courier with highest 30-day delivery rate

### Admin nav — new tab "التوزيع التلقائي" (15th tab)
### viewDispatch() — 4-tab dispatch management UI
- **قواعد التوزيع** — rule list with priority, matching conditions, strategy, enable/disable toggle, edit/delete
- **إعداد المناديب** — courier config table (capacity, zone tags, service capabilities, availability), auto-configure all button
- **معاينة** — client-side simulation of dispatch results before committing (shows which courier would be assigned and why)
- **سجل التوزيع** — full dispatch log with rule name and strategy per decision

### New DB methods (8)
`loadDispatchRules` · `saveDispatchRule` · `deleteDispatchRule` · `loadCourierConfigs` · `saveCourierConfig` · `runAutoDispatch` · `runBatchDispatch` · `loadDispatchLog`

### New App methods (13)
`setDispatchTab` · `loadDispatchData` · `openDispatchRuleModal` · `saveDispatchRule` · `deleteDispatchRule` · `toggleDispatchRule` · `openCourierConfigModal` · `saveCourierConfig` · `toggleCourierAvailability` · `autoCreateCourierConfigs` · `runDispatchPreview` · `confirmDispatch` · `runDispatchAll`

## P2 — Driver Location Tracking
**Migration:** `phase_driver_location_migration.sql` — run before deploying
**Breaking:** No — purely additive.

### New DB objects (migration)
- `driver_locations` table — one row per courier, upserted on each GPS update (lat, lng, accuracy, speed, heading, battery, is_online, last_seen_at)
- `driver_location_history` table — append-only trail (sampled on every update, indexed by courier + time)
- `update_driver_location()` — upserts latest position + appends to history
- `mark_driver_offline()` — sets is_online=false when courier closes app
- 4 permissions: `location.view_all`, `location.view_own`, `location.broadcast`, `location.history`

### New App methods (9)
- `startLocationBroadcast()` — calls `navigator.geolocation.watchPosition`, sends updates via `DB.updateMyLocation()`, stores in `AppState.driverLocations`, registers beforeunload cleanup
- `stopLocationBroadcast()` — clears watchPosition, calls `DB.markMyselfOffline()`
- `toggleLocationBroadcast()` — start/stop toggle
- `showCourierHistory(courierId, name)` — loads last 8h trail, opens modal with Leaflet polyline map
- `_renderHistoryMap(trail)` — draws trail + start/end markers on Leaflet map
- `initLiveOpsMap()` — loads Leaflet dynamically if needed, then renders
- `_renderLiveOpsMap()` — renders all online couriers as avatar markers with speed/battery/time popups and "عرض المسار" button
- `_ensureLeaflet(callback)` — loads Leaflet CSS+JS from CDN if not present, fires callback when ready

### viewTasks() — courier GPS broadcast banner
- Green/gray banner at top of courier task list showing broadcast status
- "تشغيل البث" / "إيقاف البث" toggle button
- Shown in both empty-state and task-list views

### viewLiveOps() — live map panel
- New map card below the 3-column grid: `id="liveOpsMap"`, height 300px
- Shows all online couriers as circular avatar markers (initials + brand color)
- Marker popups: name, speed, battery, last-seen time, "عرض المسار" button
- Refresh button (re-renders markers from AppState)
- Online courier count displayed in card header
- Map initialised via postRender: `DB.loadDriverLocations()` → `AppState.driverLocations` → `setTimeout(App.initLiveOpsMap, 50)`

### Leaflet integration
- Loaded dynamically from CDN (unpkg.com/leaflet@1.9.4) — not bundled
- Only loaded when liveops map or history map is actually rendered
- Duplicate map instance prevention via `_leaflet_id` check + `remove()`
- Default center: Cairo (30.0444, 31.2357) when no couriers are online

## P3 — SLA Monitoring & Alerts
**Migration:** `phase_sla_migration.sql` — run before deploying
**Breaking:** No — purely additive.

### New DB objects
- `sla_configs` — SLA target definitions: delivery hours, warning hours, optional per-merchant and per-service-type scoping. Global config (merchant_id NULL) applies to all; merchant-specific takes priority.
- `sla_breaches` — append-only breach log: shipment_id (FK to shipments.id), breach_type (delivery/warning), target_hours, actual_hours, status (open/acknowledged/resolved)
- `check_sla_breaches()` — SQL function: scans active shipments, applies most-specific matching SLA config, returns new breach rows (deduplicates via NOT EXISTS), does not INSERT (app layer handles that)
- `get_sla_summary()` — returns JSON counts: open_breaches, open_warnings, acknowledged, resolved_today, total_open
- Default global SLA config: 48h delivery, 4h warning (inserted only if none exists)
- 4 permissions: `sla.view`, `sla.manage`, `sla.acknowledge`, `sla.resolve`

### Admin nav — new tab "مستوى الخدمة SLA" (16th tab, after reports)

### viewSLA() — 4-tab SLA management UI
- **الخروقات** — open delivery breaches table with acknowledge/resolve actions, "فحص الآن" button
- **تحذيرات** — early warnings (shipments approaching SLA limit)
- **السجل** — acknowledged + resolved breach history
- **الإعدادات** — SLA config CRUD: label, target hours, warn hours, service type filter, merchant filter, active toggle

### Admin overview — SLA breach banner
- Red alert banner appears at top of admin overview when open delivery breaches exist
- Shows count + "عرض التفاصيل" button navigating directly to SLA tab

### New DB methods (8)
`loadSLAConfigs` · `saveSLAConfig` · `deleteSLAConfig` · `loadSLABreaches` · `runSLACheck` · `acknowledgeSLABreach` · `resolveSLABreach` · `getSLASummary`

### New App methods (9)
`setSLATab` · `loadSLAData` · `runSLACheck` · `acknowledgeSLABreach` · `resolveSLABreach` · `openSLAConfigModal` · `saveSLAConfig` · `deleteSLAConfig` · `toggleSLAConfig`