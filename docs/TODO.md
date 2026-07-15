# TODO.md
**Al-Nukhba Express — Remaining Work**
Last updated: after SMS provider integration + tech debt fixes

---

## Status: Platform Complete

All originally planned phases have shipped. The items below represent optional hardening, future phases, and known trade-offs.

---

## Priority 1 — Activate When Ready

### Wire real SMS provider
**Status:** Code complete. One config change required.
**Action:** Open `app.js` → find `const SMS_CONFIG` (~line 11) → set `provider: "twilio"` (or `"vonage"` / `"http_gateway"`) → fill credentials → deploy.
No other code changes. Admin can also do this temporarily via the SMS settings modal in the admin overview.

### Multi-tenant SaaS activation
**Status:** Schema 100% ready. Every table has `tenant_id uuid DEFAULT NULL`.
**Steps needed:**
1. Populate `tenant_id` on all existing rows (one SQL `UPDATE` per table)
2. Add `tenant_id = current_tenant()` filter to all RLS policies
3. Build tenant onboarding UI (invite a new company, assign roles)
4. Add tenant switcher to admin header

---

## Priority 2 — Security Hardening

### Move SMS credentials to Supabase Edge Function
**Why:** Current approach stores API keys in `app.js` (visible in GitHub repo).
**Fix:** Create a Supabase Edge Function that accepts `{phone, message}` and calls the SMS provider with server-side credentials. Update `DB.sendSMS()` to POST to that function instead. The `DB.sendSMS(phone, message)` interface stays identical.
**Effort:** ~2 hours.

### RLS tightening for production
Currently all RLS policies use permissive `FOR ALL USING (true)` — access is controlled at the application layer (RBAC via `can()`). This is intentional for the single-tenant phase but should be tightened before multi-tenant activation to ensure tenant data isolation at the database level.

---

## Priority 3 — Optional Future Phases

### WhatsApp Business API integration
Shipment status notifications via WhatsApp. Structure is identical to SMS — add a `"whatsapp"` branch in `DB.sendSMS()` or create a separate `DB.sendWhatsApp()` using the same abstraction pattern.

### Driver location tracking (Phase 4 extension)
Real-time courier position on a map. Requires:
- `driver_locations` table (lat, lng, accuracy, courier_id, timestamp)
- Courier app sending location updates (or a PWA with geolocation)
- Admin map view in `viewLiveOps()` using a mapping library (Leaflet/MapLibre)

### PWA / offline support
- Service Worker that queues status updates and POD uploads when offline
- IndexedDB sync queue
- Significant architecture addition — plan as a dedicated sprint

### Advanced shipment tracking page
Public-facing tracking page enhancement: full timeline with icons, estimated delivery window, signature/POD image display.

---

## Known Trade-offs (Not Bugs — By Design)

| Item | Decision | Reference |
|---|---|---|
| SMS credentials in app.js | Accepted for now; Edge Function proxy deferred | Decision-011 |
| Permissive RLS policies | Intentional for single-tenant; tighten at multi-tenant activation | Decision-006 |
| No automated test suite | Manual verification via grep-based audits; add Jest if team grows | — |
| app.js monolith (~7,000 lines) | Vanilla JS decision; modularise if multiple developers join | Decision-001 |
| `EGYPT_GOV_LOADED` session-only | Cities.json loaded once per session — no version-check mechanism | — |