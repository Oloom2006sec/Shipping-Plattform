# CODING_CONVENTIONS.md
**Al-Nukhba Express — Coding Conventions**
These conventions are grounded in bugs that actually happened, not theoretical best practices.

---

## 1. JavaScript Conventions

### Naming

| Pattern | Convention | Example |
|---|---|---|
| View functions | `view` + PascalCase | `viewShipments()`, `viewBranches()` |
| DB read methods | `load` + PascalCase | `loadBranches()`, `loadMerchantBalance()` |
| DB write methods | verb + noun | `createShipment()`, `addAudit()`, `updateShipment()` |
| App action methods | verb + noun | `addBranch()`, `deleteUser()`, `requestSettlement()` |
| AppState lazy-load flags | `_` prefix + `Loaded` suffix | `_branchDataLoaded`, `_pricingDataLoaded` |
| Async DB stubs | same name as real method | `sendSMS()` is a stub — replace body only, not name |

### App method pattern (mandatory for all write actions)

Every `App.*` method that writes to the database or changes meaningful state MUST follow this exact pattern:

```js
async someAction(id) {
  // 1. Find local state
  const item = AppState.items.find(x => x.id === id);
  if (!item) return;

  // 2. Lock the button immediately
  const btn = document.querySelector(`[onclick*="someAction('${id}')"]`);
  if (btn) { btn.disabled = true; btn.textContent = "…"; }

  try {
    // 3. Write to DB
    const { error } = await db.from("table").update({...}).eq("id", id);
    if (error) throw error;

    // 4. Audit (fire-and-forget — do not await)
    DB.addAudit("ACTION_NAME", id, `Details by ${AppState.user.name}`, "entity_type");

    // 5. Update local state
    item.field = newValue;

    // 6. User feedback
    toast("✅ Success message");

  } catch (err) {
    toast("خطأ: " + err.message, "error");
  } finally {
    // 7. Always re-enable button and re-render — even on failure
    if (btn) btn.disabled = false;
    rerenderContent();
  }
}
```

Skipping `try/catch/finally` caused KNOWN_BUGS.md #3 and #4. This pattern is not optional.

### Lazy-load guard pattern (mandatory)

**NEVER use array length as a load guard:**
```js
// ❌ WRONG — causes infinite loop if DB returns empty array
if (AppState.view === "branches" && !AppState.branches.length) {
  App.loadBranchData(); // → calls rerenderContent() → calls postRender() → loops forever
}
```

**ALWAYS use a one-time boolean flag:**
```js
// ✅ CORRECT — fires exactly once regardless of what DB returns
if (AppState.view === "branches" && !AppState._branchDataLoaded) {
  AppState._branchDataLoaded = true;  // set BEFORE the async call
  App.loadBranchData();
}
```

This caused KNOWN_BUGS.md #8 (3,000+ requests). See also APP_ARCHITECTURE.md §2.

### Async / await conventions

- Login and boot/session-restore are **two separate code paths**. Any "load data on startup" change must be made in both.
- Both paths must `await` all critical data before calling `render()`. Fire-and-forget `.then()` before `render()` causes races (KNOWN_BUGS.md #5).
- Exception: non-critical background data (e.g. audit log prefetch) may use `.then()` if its absence on first render is acceptable.

### XSS prevention

All user-supplied data interpolated into HTML template literals MUST pass through `esc()`:
```js
// ✅ correct
`<div>${esc(user.name)}</div>`

// ❌ wrong — XSS risk if user.name contains < > " '
`<div>${user.name}</div>`
```

`esc()` is a global helper that HTML-encodes the string. No exceptions for "internal-only" data.

---

## 2. Database Conventions

### Primary role vs RBAC roles

`profiles.primary_role` is a fast-path denormalized field for UI routing decisions. It must always match the user's dominant role in the `profile_roles` table. The authoritative permission set comes from `get_user_permissions(uid)`, not from `primary_role`. **Never use `role` column — `primary_role` is the production column name.**

### Soft delete policy

**NEVER hard-delete any row from `profiles`.** `shipment_timeline.actor_id` and `audit_logs.actor_id` reference `profiles(id)`. Hard delete causes a FK violation for any user who ever appeared in a timeline/audit entry. This is a real regression that happened twice (KNOWN_BUGS.md #4).

Soft delete pattern on `profiles`:
```sql
UPDATE profiles SET
  is_deleted = true,
  deleted_at = now(),
  deleted_by = <admin_user_id>
WHERE id = <target_id>;
```

`loadUsers()` MUST always include `.eq("is_deleted", false)` to exclude deleted users from the list.

The same soft-delete pattern applies to `branches`, `warehouses`, `merchant_recipients`, `merchant_products`. Only append-only audit/timeline tables have no delete at all.

### Append-only tables

The following tables are append-only — no UPDATE, no DELETE, enforced at the database level via RLS `SELECT + INSERT` only policies (no update/delete policy exists):

- `shipment_timeline`
- `shipment_branch_log`
- `audit_logs`
- `merchant_ledger`
- `driver_transactions`

Application code must never attempt to update or delete rows in these tables. The DB will silently no-op the attempt (due to the RLS rule setup) or error — either way, the intent was wrong.

### Computed columns

`shipments.address_full` is `GENERATED ALWAYS AS (...) STORED`. Never include it in `INSERT` or `UPDATE` statements — Postgres will throw an error. Let the DB compute it from `governorate`, `city`, `street`, `building`, `floor`, `apartment`.

### Multi-tenancy readiness

Every new table created during development MUST include `tenant_id uuid DEFAULT NULL` as its second column (after `id`). This is a zero-cost pre-positioning that avoids a painful migration when multi-tenancy is activated.

### Idempotent migrations

Every migration file MUST use:
- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `INSERT ... ON CONFLICT DO NOTHING`
- `CREATE OR REPLACE FUNCTION` (not `CREATE FUNCTION`)
- Wrapped in `BEGIN; ... COMMIT;`

This means every migration is safe to re-run without error or data corruption.

### Canonical field names

| Canonical name | Wrong alias (do not use) | Notes |
|---|---|---|
| `primary_role` | `role` | `role` column doesn't exist in production schema |
| `is_suspended` | `suspended` | `suspended` exists only as a JS alias for legacy compat |
| `address_full` | `address` | `address` column doesn't exist in production schema |
| `delivery_attempts` | `attempts` | JS `mapRow()` maps to `attempts` but DB column is `delivery_attempts` |

---

## 3. UI / CSS Conventions

### Never use inline grid styles

```js
// ❌ WRONG — inline styles override all media queries; mobile will break
`<div style="display:grid;grid-template-columns:1fr 340px;gap:20px;">`

// ✅ CORRECT — use a named CSS class with both desktop and mobile rules
`<div class="overview-grid">`
```

Available layout classes:
- `.overview-grid` — `1fr 340px` (main dashboard, collapses to `1fr` under 768px)
- `.grid-2col` — `1fr 1fr` (two equal columns, collapses to `1fr` under 768px)
- `.kpi-grid` — auto-fit minmax(180px,1fr), forced to `repeat(2,1fr)` under 768px
- `.form-row` — two-column form layout
- `.form-row.three` — three-column form layout

### Sidebar active class

`rerenderContent()` never touches the sidebar. The active class must be synced explicitly in the nav click handler:

```js
$$("[data-view]").forEach(b => {
  b.classList.toggle("active", b.dataset.view === AppState.view);
});
```

Any change to `bindDashboardEvents()` must preserve this sync (KNOWN_BUGS.md #2).

### Governorate dropdowns

Any modal with a governorate `<select>` MUST start with:
```js
await loadEgyptData();
```
before building the options HTML. `EGYPT_GOV` starts empty and is populated lazily — reading `Object.keys(EGYPT_GOV)` without awaiting returns `[]` (KNOWN_BUGS.md #6).

---

## 4. Audit Logging Policy

Every destructive or state-changing action MUST call `DB.addAudit()`. Format:

```js
await DB.addAudit(
  "ACTION_NAME",        // e.g. "SUSPEND_USER", "DELETE_BRANCH", "APPROVE_SETTLEMENT"
  entity_id,            // string ID of the affected entity
  `Human-readable: Target: ${name} | By: ${AppState.user.name}`,  // always include actor
  "entity_type"         // "shipment", "user", "setting", "auth", "export"
);
```

Audit calls are fire-and-forget (`DB.addAudit(...)` without `await`) — they must not block the main action or UI update. But they must be present.

Human-readable `details` strings are mandatory — "by admin" alone is insufficient. Include target name, email, role where relevant (see KNOWN_BUGS.md #3 where poor audit detail was part of the regression pattern).

---

## 5. Permission Model

Permission codes follow the pattern `category.action`:
- `shipments.view_all`, `shipments.create`, `shipments.delete`
- `finance.view`, `finance.manage`
- `merchant.view_ledger`, `merchant.approve_settle`
- `branches.view`, `branches.create`
- `pricing.manage`, `pricing.manage_zones`

Legacy UI code uses older strings like `"create_shipment"`, `"manage_users"`. These are mapped through `PERM_ALIAS` in `app.js` to their canonical DB codes. New permissions added to the DB must use the `category.action` format and should NOT be added to `PERM_ALIAS` (only legacy codes that predate Phase 0 belong there).

The `can(code)` helper resolves aliases then checks `AppPerms` (the live DB-loaded permission set). Always use `can()` — never check `AppState.user.role === "admin"` directly for feature gating.

---

## 6. AppState Conventions

- Every new feature module gets a clearly-commented block in `AppState` prefixed by phase name
- Never reuse an existing field for a different purpose in a new phase
- Fields are initialized at declaration time (not dynamically added later)
- Fields holding DB-loaded arrays are initialized as `[]`, not `null`
- Fields holding DB-loaded scalars are initialized as `0` or `""`, not `null`
- Lazy-load flags are initialized as `false` with `_` prefix (e.g. `_branchDataLoaded: false`)

---

## 7. Module-level const assignment rule (new — from KNOWN_BUGS.md #21)

**Never assign properties to `App`, `DB`, `AppState`, or any `const` object outside that object's own declaration block.**

```js
// ❌ WRONG — App is const, not hoisted. This line runs before App is declared
//            and throws: "can't access lexical declaration 'App' before initialization"
App._dummy = () => {};     // placed at module top level

// ✅ CORRECT — add the method inside the App object declaration
const App = {
  _dummy() {},             // no-op method, accessible as App._dummy()
  someOtherMethod() { ... },
};
```

This applies equally to `DB`, `AppState`, and any other module-level `const`. If you need to add a utility that references `App` from outside (e.g. from a `view*()` function), call the method via `App.methodName()` at runtime — that is fine because by the time any event fires, `const App` is already fully initialized. The problem only occurs at **parse/initialization time** (top-level statements that execute before the `const` declaration is reached).