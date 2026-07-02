# TODO.md
**Al-Nukhba Express — Remaining Work**
Last updated: after stabilization sprint

---

## Immediate (resume Phase 3)

### OTP Delivery Verification
**Status:** Backend DB methods written, courier UI not built yet.
**What exists:**
- `otp_code`, `otp_verified`, `otp_verified_at` columns on `shipments` (Phase 1)
- `DB.sendSMS()` — provider-abstraction stub (console.log only)
- `DB.generateAndSendOTP()` — generates 6-digit code, stores in DB, calls sendSMS
- `DB.verifyOTP()` — compares entered code against stored, sets `otp_verified=true`

**What needs building:**
1. Courier tasks view — add "📱 إرسال كود تحقق" button (visible when `status === "out_for_delivery"`)
2. Courier tasks view — add "🔐 تأكيد بالكود" button that opens a 6-digit PIN entry modal
3. Verify modal — on success: mark shipment delivered + `otp_verified=true`, audit, toast
4. Verify modal — on failure: show "الكود غير صحيح" with retry counter (max 3 attempts)
5. Admin shipment detail — show OTP verification status badge (column already shows `otpVerified`)
6. Wire in a real SMS provider in `DB.sendSMS()` when provider is decided

**SMS provider options:** Twilio, Vonage, local Egyptian gateways (Mobily, ConnectMisr). The swap requires changing only the body of `DB.sendSMS()` — no other code changes.

---

## Phase 3 Remaining (after OTP)

### Signature Capture
- Canvas-based signature pad in the courier delivery confirmation flow
- `signature_url` column already exists on `shipments`
- Upload signature image to Supabase Storage alongside POD photo

### Offline Support
- Service Worker that intercepts status-update and POD-upload requests
- IndexedDB queue for actions taken without network
- Sync queue on reconnect
- **Scope warning:** This is a significant architecture addition — plan as a dedicated sub-sprint

---

## Phase 4 — Realtime Operations Dashboard

- Live map showing active couriers and their assigned shipments
- Live shipment status board (auto-refreshing without F5)
- `driver_locations` table added but no UI yet (table schema defined in Phase 2D planning)
- Needs: driver location reporting from courier's device, admin map view

---

## Phase 5 / 9 — Advanced Reporting & Analytics

- Period-based reporting (daily / weekly / monthly range picker)
- Courier performance leaderboard (deliveries, return rate, COD accuracy)
- Merchant performance ranking (volume, return rate, COD value)
- Return rate trend charts over time
- PDF report export (jsPDF is already imported)
- All data already exists — this is a query + visualization sprint only

---

## Phase 7 — SMS/WhatsApp Integration (real provider)

- Wire `DB.sendSMS()` to a real provider (no schema or logic changes needed)
- WhatsApp Business API for shipment status notifications
- Both are purely config/integration tasks once a provider is selected

---

## Phase 8 — Multi-Tenant SaaS Activation

**Schema is 100% ready.** Every table has `tenant_id uuid DEFAULT NULL`.
Steps to activate:
1. Create `tenants` table
2. Seed first tenant (Al-Nukhba itself)
3. Populate `tenant_id` on all existing rows via a one-time migration
4. Add `tenant_id = current_tenant()` checks to RLS policies
5. Build tenant-switching/onboarding UI (invite new courier company etc.)

**Application code changes:** Only the RLS policies and a tenant context-setting mechanism are needed. Permission system and all view code are tenant-agnostic already.

---

## Technical Debt / Quality

| Item | Priority | Notes |
|---|---|---|
| `editBranch()` and `editWarehouse()` don't reload Egypt data | Low | If these modals ever add governorate selection, they'll need `await loadEgyptData()` |
| `loadAuditLogs()` vs `loadAudit()` method naming inconsistency | Low | Two methods, different names, do similar things — consolidate |
| No global `onclick` error handler for missing `App.*` methods | Low | Buttons calling undefined methods fail silently (see KNOWN_BUGS.md #7) |
| No automated test suite | Low | All verification is currently manual or script-based grep checks |
| `fmtTime()` referenced in `viewMyWallet()` and `viewFinance()` — confirm it's defined | Medium | Verify `fmtTime` global helper exists and is not shadowed |
| `EGYPT_GOV_LOADED` flag — reset mechanism for when `cities.json` needs refresh | Low | Currently once-per-session; a version-check mechanism would be cleaner |
