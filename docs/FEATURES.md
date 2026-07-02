# FEATURES.md
**Al-Nukhba Express — Feature Inventory**
Status legend: ✅ Complete & stable · 🟡 Partial · ⏳ Planned · 🐛 Known issue (see KNOWN_BUGS.md)

---

## Authentication & Session

| Feature | Status | Dependencies | Files |
|---|---|---|---|
| Email/password login | ✅ | Supabase Auth | `app.js`: `renderAuth()`, login handler |
| Session restore on page load | ✅ | `localStorage` session token | `app.js`: boot IIFE |
| Role-based dashboard shell | ✅ | `ROLE_MAP`, `profiles.primary_role` | `app.js`: `renderDashboard()`, `renderAdminShell()`, `renderSimpleShell()` |
| Public shipment tracking (no auth) | ✅ | `?track=CODE` URL param | `app.js`: `render()`, `viewTrack()` |

## RBAC / Permissions

| Feature | Status | Dependencies | Files |
|---|---|---|---|
| DB-driven role/permission model | ✅ | `roles`, `permissions`, `role_permissions`, `profile_roles` | `migration_production.sql` |
| 10 seeded roles | ✅ | — | `migration_production.sql` |
| 96 seeded permission codes | ✅ | — | all migration files |
| `get_user_permissions()` resolution | ✅ | `has_permission()`, `get_user_permissions()` DB functions | `migration_production.sql` |
| Client-side `can(code)` gate | ✅ | `PERM_ALIAS` legacy mapping | `app.js` |
| Multi-tenant readiness (`tenant_id` everywhere) | 🟡 | dormant, no UI yet | all tables |

## Shipment Management

| Feature | Status | Dependencies | Files |
|---|---|---|---|
| Create shipment | ✅ | `createShipment()`, address auto-compute | `app.js`: `App.newShipment()` |
| 13-status lifecycle | ✅ | `shipments_on_update()` trigger | `phase1_migration.sql` |
| Append-only timeline per shipment | ✅ | `shipment_timeline`, `addTimeline()` | both layers |
| Service type / order type classification | ✅ | `service_type`, `order_type` columns | `phase1_migration.sql` |
| Physical attributes (weight/dims/barcode) | ✅ | Phase 1 columns | `phase1_migration.sql` |
| Computed address (`address_full`) | ✅ | Postgres `GENERATED ALWAYS AS` | `migration_production.sql` |
| Courier assignment | ✅ | `loadCouriers()`, `assignCourier()` | `app.js` |
| Status update with reasons (reschedule/suspend) | ✅ | `rescheduleShipment()`, `suspendShipment()` | `app.js` |
| Proof of delivery — photo upload | ✅ | Supabase Storage bucket | `app.js`: `uploadPOD()` |
| Proof of delivery — signature | ⏳ Planned | `signature_url` column exists, no UI | Phase 3 (paused) |
| OTP delivery verification | 🟡 Backend only | `otp_code`/`otp_verified` columns + `sendSMS()`/`generateAndSendOTP()`/`verifyOTP()` DB methods exist; **no courier-facing UI yet** | Phase 3 (paused mid-implementation) |
| Excel export | ✅ | SheetJS | `app.js`: `exportExcel()` |
| Barcode/QR generation | ✅ | `barcode` field, QR via `qrcode` lib | `app.js`: `postRender()` |
| Shipment branch routing log | ✅ | `shipment_branch_log` (append-only) | `phase2d_migration.sql` |

## Merchant Portal

| Feature | Status | Dependencies | Files |
|---|---|---|---|
| Saved pickup/warehouse/branch addresses | ✅ | `merchant_addresses` | `phase2a_migration.sql`, `viewAddresses()` |
| Recipient/customer database | ✅ | `merchant_recipients` | `viewRecipients()` |
| Product catalog | ✅ | `merchant_products` | `viewProducts()` |
| Pickup request workflow | ✅ | `pickup_requests` | `viewPickupRequests()` |
| Merchant COD balance & ledger | ✅ | `merchant_ledger` (append-only), `get_merchant_balance()` | `viewAccounts()` |
| Settlement requests | ✅ | `settlements` | `App.requestSettlement()` |

## Admin Merchant Management

| Feature | Status | Dependencies | Files |
|---|---|---|---|
| Cross-merchant data browser | ✅ | `loadAllMerchants()` + per-merchant admin loaders | `viewAdminMerchants()` |
| Settlement approve/reject/pay | ✅ | `settlements.status` workflow | `App.approveSettlement()` etc. |

## Financial Management

| Feature | Status | Dependencies | Files |
|---|---|---|---|
| Driver wallet ledger (admin-managed) | ✅ | `driver_transactions` (append-only) | `phase2b_migration.sql` |
| Driver self-service wallet view | ✅ | `loadMyWallet()`, `viewMyWallet()` | Phase 3 |
| COD reconciliation (collected vs submitted) | ✅ | `cod_reconciliation` | `viewFinance()` → COD tab |
| Invoice generation | ✅ | `invoices`, `next_invoice_number()` | `App.generateInvoice()` |
| Expense tracking | ✅ | `expenses` | `App.addExpense()` |
| Financial summary reports | ✅ | `get_financial_summary()` | `viewFinance()` → overview tab |

## Pricing Engine

| Feature | Status | Dependencies | Files |
|---|---|---|---|
| Delivery zones (governorate grouping) | ✅ | `pricing_zones` | `phase2c_migration.sql` |
| Tiered pricing rules (zone/service/order/weight/merchant) | ✅ | `pricing_rules`, priority ordering | `viewPricing()` → rules tab |
| Server-side fee calculation | ✅ | `calculate_shipping_fee()` | `App.simulateFee()`, used at shipment creation |
| Pricing simulator UI | ✅ | — | `viewPricing()` → simulator tab |
| Rule edit modal | ✅ (fixed) | — | `App.editPricingRule()` — was missing, added in stabilization sprint |

## Branch & Warehouse Management

| Feature | Status | Dependencies | Files |
|---|---|---|---|
| Branch CRUD + manager assignment | ✅ | `branches` | `viewBranches()` |
| Warehouse CRUD + branch linkage | ✅ | `warehouses` | `viewBranches()` |
| Branch performance metrics | ✅ | `get_branch_metrics()` | `App.viewBranchMetrics()` |
| Warehouse load/utilization | ✅ | `get_warehouse_load()` | (function exists, surfaced in warehouse cards) |

## User Management

| Feature | Status | Dependencies | Files |
|---|---|---|---|
| User list (admin) | ✅ | `loadUsers()` — must filter `is_deleted=false` | `viewUsers()` |
| Suspend/activate user | ✅ (fixed) | `toggleUser()` with `try/catch/finally` | regressed and re-fixed in stabilization sprint |
| Soft-delete user | ✅ (fixed) | `deleteUser()` — never hard DELETE | regressed and re-fixed in stabilization sprint |
| Edit user | ✅ | — | `viewUsers()` |

## Audit & Compliance

| Feature | Status | Dependencies | Files |
|---|---|---|---|
| System-wide audit log | ✅ | `audit_logs`, `addAudit()` | every destructive action calls this |
| Audit log viewer | ✅ | — | `viewAudit()` |

## Notifications

| Feature | Status | Dependencies | Files |
|---|---|---|---|
| In-app notifications | ✅ | `notifications` table | header bell icon |
| Realtime shipment updates (admin) | ✅ | Supabase Realtime channel | `startRealtime()` |
| SMS sending (abstraction layer) | 🟡 Stub only | `DB.sendSMS()` logs to console, no real provider wired | Phase 3, needs provider decision |
| WhatsApp integration | ⏳ Planned | — | Phase 7 (roadmap) |

## Responsive / Mobile

| Feature | Status | Dependencies | Files |
|---|---|---|---|
| Mobile dashboard layout | ✅ (fixed) | `.overview-grid`, `.grid-2col` CSS classes | regressed (inline styles bypassing media queries) and re-fixed |
| Sidebar collapse on mobile | ✅ | `menu-toggle`, `sbOverlay` | `bindDashboardEvents()` |
| Active sidebar tab indicator | ✅ (fixed) | manual class sync on nav click | regressed and re-fixed |

---

## Summary counts

- ✅ Fully complete features: 44
- 🟡 Partial/stub features: 3 (multi-tenant UI, OTP courier UI, SMS provider)
- ⏳ Planned, not started: 3 (signature capture, WhatsApp integration, full multi-tenant activation)
