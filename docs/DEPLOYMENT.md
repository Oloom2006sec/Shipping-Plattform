# DEPLOYMENT.md
**Al-Nukhba Express — Deployment Guide**
Stack: Vanilla JS + Supabase + Static hosting

---

## 1. Repository Structure

```
Shipping-Plattform/
├── index.html          single shell — never changes between deployments
├── app.js              all application logic (~5,200 lines)
├── styles.css          all styling (~1,070 lines)
├── cities.json         Egypt governorates/cities dataset (static)
└── docs/               project documentation (this folder)
```

**Local path:** `C:\Users\AMY\shipping-platform\Shipping-Plattform`
**Live URL:** `https://oloom2006sec.github.io/Shipping-Plattform/`
**Supabase project:** `urktddxiyzwsilddamci` (London region)
**Supabase dashboard:** `https://supabase.com/dashboard/project/urktddxiyzwsilddamci`

---

## 2. Standard Deployment Workflow

Every deployment is two independent steps — SQL first, frontend second, in that order. Never deploy frontend before confirming SQL migration succeeded.

### Step A — Run SQL migration (if the phase includes one)

1. Go to: `https://supabase.com/dashboard/project/urktddxiyzwsilddamci/sql/new`
2. Paste the migration file contents
3. Click **Run**
4. Confirm the verification `SELECT` statements at the end return expected results
5. If any error appears, the `BEGIN/COMMIT` transaction wrapper rolls back everything — no partial state

SQL migrations are idempotent by convention (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). Re-running a migration that already ran is safe.

### Step B — Deploy frontend

```bash
cd C:\Users\AMY\shipping-platform\Shipping-Plattform

# Verify you're on the main branch
git status

# Stage only the files that changed
git add app.js styles.css

# Commit with a descriptive message
git commit -m "feat: Phase X — description"
# or for bug fixes:
git commit -m "fix: description of what was fixed"

# Push to GitHub Pages
git push
```

GitHub Pages deploys automatically within ~30 seconds of a push. Hard-refresh the browser (`Ctrl+Shift+R`) after deployment to clear cached JS/CSS.

### Step C — Post-deployment verification

1. **Clear localStorage:** F12 → Application → Local Storage → select site → Clear All
2. **Log in fresh** as each affected role
3. **Open DevTools Console** — should be clean (no errors, no stray `console.log`)
4. Run in console to confirm permissions loaded from DB:
   ```js
   Array.from(AppPerms).sort()
   // Should return full list of permission codes
   ```
5. Verify the specific features changed in this deployment work as expected

---

## 3. Migration Files Reference

| File | Phase | Contents |
|---|---|---|
| `migration_production.sql` | Phase 0 | Foundation schema: profiles, RBAC, shipments, timeline, audit |
| `phase1_migration.sql` | Phase 1 | Shipment lifecycle: 13 statuses, physical fields, POD fields |
| `phase2a_migration.sql` | Phase 2A | Merchant portal: addresses, recipients, products, ledger, settlements, pickup_requests |
| `phase2b_migration.sql` | Phase 2B | Finance: driver_transactions, invoices, expenses, cod_reconciliation |
| `phase2c_migration.sql` | Phase 2C | Pricing: pricing_zones, pricing_rules, calculate_shipping_fee() |
| `phase2d_migration.sql` | Phase 2D | Branches/warehouses: branches, warehouses, shipment_branch_log |

**Important:** Migrations must be applied in phase order. Phase 2D references FKs created in Phase 0 (profiles) and Phase 1 (shipments) — applying out of order will fail.

---

## 4. Environment Setup (new machine)

```bash
# 1. Clone the repository
git clone https://github.com/oloom2006sec/Shipping-Plattform.git
cd Shipping-Plattform

# 2. No npm install required — zero build dependencies
# app.js imports Supabase from a CDN link in index.html

# 3. Supabase credentials are in app.js (lines ~1-10)
# SUPABASE_URL and SUPABASE_ANON_KEY are public-safe values
# (RLS policies protect the data, not client-side key hiding)
```

No `.env` file, no build step, no package.json dependencies for the app itself. The only external dependencies are loaded via CDN in `index.html`:
- Supabase JS client
- SheetJS (xlsx export)
- jsPDF (PDF generation)
- Html5-QRcode (QR scanner)

---

## 5. Supabase Configuration

### Storage
- Bucket: `shipment-pods` — stores proof-of-delivery images
- Access: authenticated users only
- File types: `image/jpeg`, `image/png`, `image/webp`
- Max size: 5MB

### Realtime
Enabled on the `shipments` table. Admin users subscribe on login via `startRealtime()`. No configuration needed — uses Supabase's default channel setup.

### Auth settings (already configured)
- Email/password auth enabled
- No email confirmation required (disabled for internal platform use)
- JWT expiry: default Supabase setting

---

## 6. Backup Procedure

### Database backup
Supabase provides automatic daily backups (Pro plan). For manual backups:
1. Go to `https://supabase.com/dashboard/project/urktddxiyzwsilddamci/database/backups`
2. Click **Create backup** before any major migration

### Code backup
Git is the backup. Every deployment is a commit. Never work directly on `main` for risky changes — create a branch:
```bash
git checkout -b phase-X-feature-name
# ... make changes ...
git push origin phase-X-feature-name
# merge to main only after testing
git checkout main
git merge phase-X-feature-name
git push
```

---

## 7. Rollback Procedure

### Frontend rollback
```bash
# Find the last good commit
git log --oneline -10

# Revert to a specific commit
git revert <commit-hash>
git push
```

### Database rollback
There is no automated DB rollback. Before any destructive migration (rare — most migrations are additive):
1. Create a manual backup (see §6)
2. Write a corresponding "down" migration manually if needed
3. Phase 0–2D migrations are all purely additive (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) — they cannot be "rolled back" by re-running the file, but they also cannot cause data loss by themselves

---

## 8. Common Deployment Mistakes

| Mistake | Consequence | Prevention |
|---|---|---|
| Deploying `app.js` before running SQL migration | New DB methods fail with "relation does not exist" | Always SQL first |
| Not clearing localStorage after deploy | Session carries old `AppState` structure, may cause subtle bugs | Always clear storage after schema-changing deploys |
| Forgetting `styles.css` when fixing a CSS bug | Fix is in the repo but not live | `git add app.js styles.css` together |
| Pushing to a feature branch instead of main | GitHub Pages only serves `main` | Confirm `git branch` shows `main` before pushing |
