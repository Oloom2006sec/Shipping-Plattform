# DATABASE_SCHEMA.md
**Al-Nukhba Express — Supabase / Postgres Schema**
Last updated: after Phase 2D + stabilization sprint
19 tables · 14 functions · 14 triggers · 34 RLS policies

---

## Multi-tenancy convention

Every core table carries `tenant_id uuid DEFAULT NULL`. The platform is single-tenant today (all rows have `tenant_id = NULL`). Activating multi-tenancy later requires no schema change — only populating `tenant_id` and adding `tenant_id = current_tenant()` filters to RLS policies.

---

## 1. Core Identity & RBAC

### `profiles`
One row per Supabase Auth user. The application-level identity table.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | = `auth.users.id`, `ON DELETE CASCADE` |
| tenant_id | uuid | multi-tenancy hook |
| full_name | text | NOT NULL, non-empty check |
| email | text | NOT NULL |
| phone, avatar_url | text | |
| primary_role | text | NOT NULL, CHECK in 10 roles (fast-path role; authoritative permissions come from RBAC tables) |
| is_active | boolean | default true |
| is_suspended | boolean | default false |
| suspended_at, suspended_by, suspension_note | | set together by `toggleUser()` |
| is_deleted | boolean | default false — **soft delete only, never hard DELETE** |
| deleted_at, deleted_by | | |
| last_login_at, notes | | |
| created_at, updated_at | timestamptz | `updated_at` auto-maintained by `trg_profiles_updated_at` |

**Why soft delete is mandatory:** `shipment_timeline.actor_id` and `audit_logs.actor_id` reference `profiles(id)`. A hard `DELETE` on a profile that ever appeared in a timeline/audit row throws an FK violation. This caused a real regression (see KNOWN_BUGS.md #4).

### `roles`
10 seeded roles: `admin`, `merchant`, `courier`, `customer`, `branch_manager`, `operations_manager`, `warehouse`, `accountant`, `customer_service`, `area_supervisor`.

| Column | Type |
|---|---|
| id | uuid PK |
| tenant_id | uuid (NULL = global role) |
| code | text |
| label, description | text |
| is_system | boolean |
| is_active | boolean |

### `permissions`
96 permission codes seeded across categories: `shipments`, `users`, `finance`, `merchant`, `pricing`, `branches`, `reports`, `audit`, `settings`.

### `role_permissions`
Join table: `role_id` ↔ `permission_id`.

### `profile_roles`
Join table: `profile_id` ↔ `role_id` (a profile can hold multiple roles).

### `tenants`
Reserved for future multi-tenant activation. Not actively used.

---

## 2. Shipments — the core entity

### `shipments`

| Group | Columns |
|---|---|
| Identity | id (uuid PK), tenant_id, shipment_code |
| Merchant | merchant_id (FK→profiles, SET NULL), merchant_name, merchant_phone (denormalized snapshot) |
| Courier | courier_id (FK→profiles, SET NULL), courier_name (denormalized snapshot) |
| Customer | customer_name, customer_phone, customer_phone2 |
| Address | governorate, city, street, building, floor, apartment, **address_full** (GENERATED ALWAYS AS, computed — never written directly) |
| Financials | amount, delivery_fee, return_fee, is_cod, cod_collected |
| Phase 1: classification | service_type (`door_to_door`/`drop_off`/`pickup`), order_type (`express`/`standard`/`scheduled`), scheduled_at |
| Phase 1: physical | weight, quantity, width, height, depth, barcode |
| Status | status (13 values, see below), status_note, eta, delivery_attempts |
| Phase 1: lifecycle timestamps | submitted_at, picked_up_at, rescheduled_at, reschedule_reason, reschedule_count, suspended_at, suspension_reason |
| Proof of delivery | pod_url, pod_uploaded_at, pod_uploaded_by, signature_url, otp_code, otp_verified, otp_verified_at |
| Notes | notes (merchant-visible), internal_notes (staff-only) |
| Phase 2D | branch_id (FK→branches), warehouse_id (FK→warehouses) — also legacy text columns branch_code/warehouse_code from Phase 1 |
| Soft delete | is_deleted, deleted_at, deleted_by |
| Audit | created_by, created_at, updated_at, delivered_at, returned_at, cancelled_at |

**Status values (13):** `draft`, `submitted`, `pickup_requested`, `picked_up`, `at_warehouse`, `in_transit`, `at_branch`, `out_for_delivery`, `delivered`, `returned`, `rescheduled`, `cancelled`, `suspended`

### `shipment_timeline`
Append-only event log. References `actor_id → profiles(id)`.

### `shipment_branch_log`
Append-only physical movement log per shipment, references `branch_id`/`warehouse_id`.

---

## 3. Merchant Portal (Phase 2A)

| Table | Purpose | Key columns |
|---|---|---|
| `merchant_addresses` | Saved pickup/warehouse/branch addresses | merchant_id, label, type, governorate, city, is_default |
| `merchant_recipients` | Customer database per merchant | merchant_id, name, phone, order_count |
| `merchant_products` | Product catalog | merchant_id, sku, barcode, weight, price, image_url |
| `merchant_ledger` | **Append-only** COD/fee ledger | merchant_id, shipment_code, type, amount, balance_after |
| `settlements` | Payout requests | merchant_id, amount, status (`pending`/`approved`/`paid`/`rejected`) |
| `pickup_requests` | Courier pickup requests | merchant_id, address_id, courier_id, status, shipment_count |

---

## 4. Financial Management (Phase 2B)

| Table | Purpose |
|---|---|
| `driver_transactions` | **Append-only** courier wallet ledger (delivery_fee, cod_collected, bonus, deduction, settlement) |
| `invoices` | Auto-numbered merchant invoices (`INV-000001` via `next_invoice_number()`) |
| `expenses` | Operational expense tracking by category |
| `cod_reconciliation` | Daily collected-vs-submitted COD per driver |

---

## 5. Pricing Engine (Phase 2C)

| Table | Purpose |
|---|---|
| `pricing_zones` | Groups governorates into delivery zones |
| `pricing_rules` | Fee rules scoped by zone/service_type/order_type/weight-tier/merchant, with priority ordering |

Fee resolution is server-side via `calculate_shipping_fee()` — never computed in JS.

---

## 6. Branches & Warehouses (Phase 2D)

| Table | Purpose |
|---|---|
| `branches` | Physical branch locations, optional manager assignment |
| `warehouses` | Storage facilities, optionally linked to a branch |

---

## 7. System Tables

| Table | Purpose |
|---|---|
| `notifications` | In-app notifications, role or user-targeted |
| `audit_logs` | System-wide audit trail (`actor_id → profiles`) |

---

## Indexes (representative — not exhaustive)

- `profiles`: index on `primary_role`, `is_suspended`, `is_deleted`
- `shipments`: index on `status`, `merchant_id`, `courier_id`, `branch_id`, `warehouse_id`, `shipment_code` (unique)
- `merchant_ledger`, `driver_transactions`: index on `(merchant_id/driver_id, created_at)` for fast running-balance queries

## Triggers (14 total)

All follow the `set_updated_at()` pattern (auto-maintains `updated_at`) plus `shipments_on_update()` for status-transition side effects (e.g. stamping `delivered_at` when status flips to `delivered`).

| Trigger | Table |
|---|---|
| trg_profiles_updated_at | profiles |
| trg_roles_updated_at | roles |
| trg_shipments_update | shipments |
| trg_merchant_addresses_updated | merchant_addresses |
| trg_merchant_recipients_updated | merchant_recipients |
| trg_merchant_products_updated | merchant_products |
| trg_settlements_updated | settlements |
| trg_pickup_requests_updated | pickup_requests |
| trg_invoices_updated | invoices |
| trg_cod_recon_updated | cod_reconciliation |
| trg_pricing_zones_updated | pricing_zones |
| trg_pricing_rules_updated | pricing_rules |
| trg_branches_updated | branches |
| trg_warehouses_updated | warehouses |

## Functions (14 total)

| Function | Purpose |
|---|---|
| `set_updated_at()` | Generic trigger function |
| `shipments_on_update()` | Stamps lifecycle timestamps on status change |
| `has_permission(uid, code)` | RBAC check |
| `get_user_permissions(uid)` | Returns full permission set for a user |
| `assign_permissions(...)` | Admin helper to bulk-assign permissions to a role |
| `get_merchant_balance(merchant_id)` | Reads latest `merchant_ledger.balance_after` |
| `get_merchant_cod_pending(merchant_id)` | Pending COD not yet settled |
| `get_driver_balance(driver_id)` | Reads latest `driver_transactions.balance_after` |
| `get_financial_summary(...)` | Aggregate financial report data |
| `calculate_shipping_fee(...)` | Pricing engine resolution (zone + rule matching) |
| `next_invoice_number()` | Auto-increments `INV-NNNNNN` |
| `get_branch_metrics(branch_id, ...)` | Branch performance stats |
| `get_warehouse_load(warehouse_id)` | Current warehouse utilization |
| `_zone(...)` | Internal helper for pricing zone resolution |

## RLS Policies (34 total)

Policy naming convention: `{table_short}_{action}`. Most tables use a permissive `{table}_all` policy (read+write) since app-level RBAC (via `has_permission()`) is the primary access gate, not row-level tenant isolation — this is intentional for the single-tenant phase and will tighten when multi-tenancy activates.

Append-only tables (`shipment_timeline`, `shipment_branch_log`, `merchant_ledger`, `driver_transactions`, `audit_logs`) use **select + insert only** policies — no update/delete policy exists, enforcing immutability at the database layer regardless of application bugs.

## Views

None currently defined. All aggregation happens via functions (`get_financial_summary`, `get_branch_metrics`) or client-side reduction over fetched rows.
