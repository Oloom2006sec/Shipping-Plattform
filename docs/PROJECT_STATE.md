# PROJECT_STATE.md
**Al-Nukhba Express — Enterprise Logistics Platform**
Last updated: after progress report audit + 3-bug fix sprint (July 2026)

---

## 1. Project Overview

Al-Nukhba Express is a full-scale enterprise logistics SaaS platform serving four user roles — Admin, Merchant, Courier, Customer — plus six dormant operational roles ready for activation. The platform is RTL-first (Arabic UI), feature-complete across all originally planned phases, plus eight additional feature sprints beyond the original roadmap.

---

## 2. Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (SPA, no framework)                             │
│  app.js (8,619 lines) · styles.css (1,332 lines)         │
└─────────────────────┬───────────────────────────────────┘
                      │ Supabase JS client
┌─────────────────────▼───────────────────────────────────┐
│  Supabase (Postgres + Auth + Storage + Realtime + RLS)   │
│  21 tables · 14 functions · 14 triggers · 34 RLS policies│
└─────────────────────────────────────────────────────────┘
```

No build step. No bundler. No framework. One HTML shell, one `app.js`, one `styles.css`.

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES2020+), template-literal HTML |
| Styling | Plain CSS3, RTL, mobile-first |
| Backend | Supabase (Postgres 15, RLS, Realtime) |
| Auth | Supabase Auth + custom `profiles` table |
| Storage | Supabase Storage (`pod-images` bucket) |
| Permissions | DB-driven RBAC (10 roles, 96 permissions) |
| Hosting | GitHub Pages (static) |

---

## 4. Completed Phases (All shipped)

| Phase | Name | Status | Notes |
|---|---|---|---|
| 0 | Production schema foundation | ✅ | profiles, RBAC, shipments, audit |
| 1 | Shipment lifecycle (13 statuses) | ✅ | physical fields, OTP columns |
| 2A | Merchant Portal | ✅ | addresses, recipients, products, pickups, ledger |
| 2A-Admin | Admin Merchant Management | ✅ | cross-merchant browser |
| 2B | Financial Management | ✅ | driver wallets, COD recon, invoices, expenses |
| 2C | Pricing Engine | ✅ | zones, rules, auto-calculate, simulator |
| 2D | Branch & Warehouse Management | ✅ | |
| 3 | Driver Ecosystem | ✅ | wallet view, OTP, signature capture |
| Import | Bulk Shipment Import | ✅ | 6-step wizard, validation, error reports |
| 9 | Reporting & Analytics | ✅ | 5-tab, period picker, charts, PDF+Excel |
| 4 | Realtime Operations Dashboard | ✅ | live pipeline, courier board, activity feed |
| — | SMS Provider Integration | ✅ (code) | Twilio/Vonage/HTTP gateway (stub until configured) |
| — | Enhanced Tracking Page | ✅ | hero banner, stepper, WhatsApp share |
| — | User Profile & Settings | ✅ | edit name/phone, change password |
| — | Notifications Overhaul | ✅ | type icons, mark-read, broadcast |
| — | Merchant Dashboard Enhanced | ✅ | 6 KPIs, financial card, quick actions |
| — | Bulk Shipment Actions | ✅ | multi-select, bulk status, bulk courier assign |
| — | Advanced Search & Filter | ✅ | 7 filters, saved presets |
| — | Shipping Label Print | ✅ | thermal/A5/A4, QR code, new window |
| — | Recipient Quick-Fill | ✅ | search in shipment creation modal |

---

## 5. Current Phase

**Stabilization complete.** Platform is feature-complete. Bug fixes applied per progress report:
- ✅ `manualTrack()` — now reads `trackCodeInput` field, falls back to `prompt()`, searches loaded shipments first
- ✅ Import row status update — now uses `batch_id + row_number` instead of missing client-side UUID
- ✅ LiveOps refresh throttle — 10-second minimum between auto-refreshes in `postRender()`
- ✅ Notifications `read_at` — removed write to potentially non-existent column

---

## 6. Pending Work (from TODO.md)

| Item | Effort | Blocker |
|---|---|---|
| Wire real SMS provider | Config only | Business decision (which provider) |
| Customer Portal (auth + history) | 1 sprint | None — all infra exists |
| Multi-tenant activation | 2 sprints | Business decision |
| Driver location map | 1 sprint | Courier geolocation reporting needed |
| PWA / offline support | 2–3 sprints | Significant architecture addition |
| SMS credentials → Edge Function | 0.5 sprint | Security hardening |
| WhatsApp Business API | 0.5 sprint | After SMS provider is chosen |

---

## 7. Key Numbers (ground truth from code audit July 2026)

| Metric | Value |
|---|---|
| `app.js` lines | 8,619 |
| `styles.css` lines | 1,332 |
| SQL migration files | 7 (2,829 lines total) |
| DB tables | 21 |
| DB functions | 14 |
| DB triggers | 14 |
| RLS policies | 34 |
| Permission codes | 96 |
| Roles | 10 |
| Admin nav tabs | 14 |
| View functions | 19 |
| App methods | ~120 |
| DB methods | ~55 |
| AppState fields | ~45 |
| Known bugs tracked | 22 (21 fixed, 1 partial) |
| Architectural decisions documented | 11 |