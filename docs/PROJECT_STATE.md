# PROJECT_STATE.md
**Al-Nukhba Express — Enterprise Logistics Platform**
Last updated: after Phase 3 stabilization sprint (8-bug regression fix)

---

## 1. Project Overview

Al-Nukhba Express is a full-scale enterprise logistics management system being evolved from a simple shipment tracker into a platform comparable to Bosta, Mylerz, and Sho7na. It serves four user roles — Admin, Merchant, Courier, Customer — plus six dormant operational roles (Branch Manager, Operations Manager, Warehouse, Accountant, Customer Service, Area Supervisor) ready for activation without code changes.

The platform is RTL-first (Arabic UI), single-tenant today but pre-wired for multi-tenancy (every core table carries a nullable `tenant_id`).

## 2. Current Architecture

```
┌─────────────────────────────────────────┐
│  Browser (single-page app, no framework)  │
│  app.js (~5,200 lines) + styles.css       │
└─────────────────┬─────────────────────────┘
                  │ Supabase JS client
┌─────────────────▼─────────────────────────┐
│  Supabase (Postgres + Auth + Storage +     │
│  Realtime + RLS)                           │
│  19 tables · 14 functions · 14 triggers ·  │
│  34 RLS policies                           │
└─────────────────────────────────────────────┘
```

No build step, no bundler, no framework. One HTML shell, one `app.js`, one `styles.css`. State lives in a single in-memory `AppState` object; all persistence goes through Supabase.

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES2020+), template-literal HTML rendering |
| Styling | Plain CSS3, RTL, mobile-first breakpoints at 768px |
| Backend | Supabase (Postgres 15, Row Level Security, Realtime channels) |
| Auth | Supabase Auth (email/password), custom `profiles` table for app-level roles |
| Storage | Supabase Storage (POD images bucket) |
| Permissions | DB-driven RBAC (`roles` → `role_permissions` → `permissions`, resolved via `get_user_permissions()`) |
| Hosting | Static hosting (no SSR) |

## 4. Completed Phases

| Phase | Name | Status |
|---|---|---|
| 0 | Production schema foundation (`profiles`, `shipments`, RBAC core) | ✅ Complete |
| 1 | Shipment lifecycle expansion (13 statuses, append-only timeline) | ✅ Complete |
| 2A | Merchant Portal (addresses, recipients, products, pickup requests) | ✅ Complete |
| 2A-Admin | Admin Merchant Management (cross-merchant visibility) | ✅ Complete |
| 2B | Financial Management (driver wallets, COD reconciliation, invoices, expenses) | ✅ Complete |
| 2C | Pricing Engine (zones, rules, fee auto-calculation, simulator) | ✅ Complete |
| 2D | Branch & Warehouse Management | ✅ Complete |
| 3 (partial) | Driver self-service wallet view | ✅ Complete |
| Stabilization Sprint | 8-bug regression fix (see KNOWN_BUGS.md) | ✅ Complete |

## 5. Current Phase

**Phase 3 — Driver Ecosystem (continued)**
Driver wallet self-view shipped. Next sub-feature: **OTP delivery verification** (paused for stabilization sprint, ready to resume).

## 6. Pending Phases

| Phase | Scope |
|---|---|
| 3 (remainder) | OTP delivery verification, signature capture, offline support |
| 4 | Realtime operations dashboard (live map, live driver status) |
| 5 | Advanced reporting & analytics (PDF exports, trend charts) |
| 6 | Customer-facing tracking portal polish |
| 7 | Notification channels (SMS/WhatsApp integration — `sendSMS()` stub exists, needs real provider) |
| 8 | Multi-tenant activation (schema is ready; needs tenant-switching UI + RLS tenant filters) |

## 7. Project Roadmap (high level)

```
Foundation → Shipments → Merchant Portal → Finance → Pricing → Branches
   → Driver Wallet → [YOU ARE HERE: OTP/Signature] → Realtime Ops
   → Reporting → Multi-tenant SaaS
```

## 8. Key Numbers (ground truth, extracted from code)

- `app.js`: 5,214 lines
- `styles.css`: 1,072 lines
- Database tables: 19
- Database functions: 14
- Database triggers: 14
- RLS policies: 34
- Permission codes seeded: 96
- Roles seeded: 10
- Admin nav tabs: 12
- `view*()` render functions: 17
