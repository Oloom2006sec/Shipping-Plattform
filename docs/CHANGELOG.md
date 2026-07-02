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
