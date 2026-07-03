# DECISIONS.md
**Al-Nukhba Express — Architectural Decision Log**
Every significant technical decision made during this project, with rationale, alternatives considered, and future impact.

---

## Decision-001
**Use Vanilla JavaScript instead of a framework (React/Vue/Angular)**
Date: Project inception

**Problem:** What frontend technology to build the platform on?

**Decision:** Vanilla JS with template-literal HTML rendering. Single `app.js` file, no build step.

**Reason:**
- Zero build process — no Webpack, Vite, or npm pipeline to configure or maintain
- Direct GitHub Pages deployment — push a `.js` file, it's live in 30 seconds
- No dependency version drift — no `package.json`, no `node_modules`, no CVE alerts
- Easier for a single developer to hold the entire mental model in their head
- Template literals produce readable HTML without JSX compilation

**Alternatives considered:**
- React — rejected due to build step, JSX compiler, and deployment complexity
- Vue — rejected for same reasons as React
- Angular — too heavy for a single-developer project at this stage

**Pros:**
- Near-zero infrastructure to maintain
- Any text editor works, no IDE plugins required
- The entire application is two files — audit them completely in one reading

**Cons:**
- No virtual DOM — every re-render replaces full `innerHTML` (acceptable at current scale)
- `app.js` will grow large (currently 5,200+ lines)
- No component reuse system — helper functions (`kpi()`, `shipTable()`) fill this role but are less structured
- Harder to split across multiple developers without naming collisions

**Future impact:** If the platform grows to 10+ developers, a migration to a component framework will become worthwhile. The current architecture is designed to be readable enough that such a migration is feasible — each `view*()` function maps cleanly to a component.

**Related files:** `app.js`, `styles.css`

---

## Decision-002
**Use Supabase instead of a custom backend**
Date: Project inception

**Problem:** What backend/database platform to use?

**Decision:** Supabase (Postgres + Auth + Storage + Realtime + RLS).

**Reason:**
- Ships a production Postgres database with no self-hosting required
- Row Level Security (RLS) moves access control to the database layer — no API server needed
- Supabase Auth handles email/password, sessions, and JWT refresh out of the box
- Supabase Storage solves POD (proof of delivery) image hosting without S3 setup
- Supabase Realtime enables live shipment updates with a single subscription call
- The free/pro tier is sufficient for current scale

**Alternatives considered:**
- Firebase — rejected due to NoSQL limitations for relational logistics data
- Custom Express/Node backend — rejected because it would require deploying and maintaining a server
- PocketBase — considered but has smaller ecosystem and less mature Postgres support

**Pros:**
- Full Postgres — all SQL features, triggers, computed columns, RLS, custom functions
- No backend server to host, scale, or patch
- Client-side Supabase JS SDK is small and stable

**Cons:**
- Vendor lock-in — Supabase-specific SQL functions and RLS syntax
- The Supabase JS client is exposed in the frontend (mitigated by RLS, not by key hiding)
- Free-tier row and storage limits will eventually require a paid plan

**Future impact:** The database schema is portable standard Postgres — if Supabase is ever replaced, the SQL migrations run on any Postgres instance. The JS client calls would need updating but the data layer is clean.

**Related files:** `migration_production.sql`, all phase migration files

---

## Decision-003
**Soft delete instead of hard DELETE on all tables (especially `profiles`)**
Date: Phase 0 schema design

**Problem:** How to handle user and record deletion while preserving historical data integrity?

**Decision:** Never `DELETE` rows from `profiles`. All deletions set `is_deleted=true`, `deleted_at`, `deleted_by`.

**Reason:**
- `shipment_timeline.actor_id` references `profiles(id)`. Any user who ever appeared in a shipment's timeline cannot be hard-deleted without violating this FK constraint.
- Audit records must remain intact — deleting the actor from `profiles` would corrupt the audit trail.
- Historical shipment data must remain attributable to the merchant/courier who created it.
- Regulatory/compliance expectation: COD and financial records must be traceable.

**Alternatives considered:**
- Hard DELETE with `ON DELETE SET NULL` on all FKs — rejected because it makes historical records anonymous and unauditable
- Hard DELETE with cascading deletes — rejected because it would destroy shipment history
- Archiving to a separate table — rejected as over-engineering for the current scale

**Pros:**
- Full audit trail preserved forever
- No FK violations possible
- Deleted users simply disappear from `loadUsers()` (which filters `is_deleted=false`)
- Reversible if deletion was a mistake

**Cons:**
- The `profiles` table grows without bound (acceptable — user accounts are low-volume)
- Every `loadUsers()` call MUST include `.eq("is_deleted", false)` — forgetting this is a real regression risk (happened twice, see KNOWN_BUGS.md #3, #4)

**Future impact:** This decision is permanent. Any new table that references `profiles(id)` inherits this constraint and must document it.

**Related files:** `app.js` (`loadUsers`, `deleteUser`), `migration_production.sql`

---

## Decision-004
**Append-only tables for audit/timeline/financial ledgers**
Date: Phase 0 / Phase 2A / Phase 2B

**Problem:** How to ensure financial and audit records can never be tampered with?

**Decision:** Certain tables are designated append-only at the database layer via RLS policies that have `SELECT` and `INSERT` policies but no `UPDATE` or `DELETE` policies.

**Append-only tables:**
- `shipment_timeline` — delivery event log
- `audit_logs` — system-wide action log
- `merchant_ledger` — COD/fee/settlement ledger
- `driver_transactions` — courier wallet ledger
- `shipment_branch_log` — physical routing log

**Reason:**
- Financial records must be immutable — the ledger's running balance (`balance_after`) depends on all prior entries being permanent
- Audit records are meaningless if they can be deleted
- The DB layer enforcement is more reliable than application-layer enforcement — even a bug in `app.js` cannot accidentally UPDATE or DELETE these rows

**Alternatives considered:**
- Application-layer enforcement only (`if (isAuditTable) throw`) — rejected because bugs bypass it
- Postgres RULE (`CREATE OR REPLACE RULE ... DO INSTEAD NOTHING`) — used as a belt-and-suspenders backup alongside RLS
- Separate "archive" database — rejected as over-engineering

**Pros:**
- Tamper-proof at database level regardless of application bugs
- Simple to reason about — these tables only ever grow

**Cons:**
- Cannot correct a wrong ledger entry — must add a corrective entry (standard double-entry accounting pattern)
- Cannot correct a wrong audit entry — must live with it and add a subsequent note

**Future impact:** Any new financial or compliance table should default to append-only. The pattern (`SELECT + INSERT` RLS, `DO INSTEAD NOTHING` RULE) is documented and reusable.

**Related files:** All phase migration files

---

## Decision-005
**DB-driven RBAC instead of hardcoded role checks**
Date: Phase 0 schema design

**Problem:** How to control feature access as the platform grows to more roles and permissions?

**Decision:** Full database-driven RBAC: `roles → role_permissions → permissions`, resolved via `get_user_permissions(uid)` DB function on every login.

**Reason:**
- Hardcoded checks like `if (role === "admin")` cannot evolve without code deploys
- With 10 roles and 96 permissions, hardcoding would become unmanageable
- A new operator role (e.g. "Area Supervisor") can be granted permissions via SQL without touching `app.js`
- `AppPerms` Set (loaded at login) provides O(1) permission checks throughout the session

**Alternatives considered:**
- Hardcoded role arrays per feature — rejected because adding a role requires code changes
- JWT-embedded permissions — rejected because permission changes would require re-login to take effect; with DB lookup they take effect immediately on next login

**Pros:**
- Adding a new role: 2 SQL `INSERT` statements
- Revoking a permission from a role: 1 SQL `DELETE` statement
- No `app.js` change needed for permission model evolution

**Cons:**
- One extra DB call on every login (`get_user_permissions`)
- If the DB call fails, the app falls back to hardcoded `PERMS_FALLBACK` — a degraded-mode safety net

**Future impact:** When multi-tenancy activates, the `roles` table has `tenant_id` — each tenant can have custom roles and permissions without modifying the global defaults.

**Related files:** `migration_production.sql`, `app.js` (`can()`, `loadUserPermissions()`, `AppPerms`)

---

## Decision-006
**Multi-tenancy pre-positioning without activation**
Date: Phase 0 schema design

**Problem:** Should the platform be built as single-tenant (one logistics company) or multi-tenant SaaS from day one?

**Decision:** Pre-position for multi-tenancy (add `tenant_id uuid DEFAULT NULL` to every table) but do not activate it. Ship as single-tenant, activate later when there's a business need.

**Reason:**
- Building full multi-tenancy from day one would triple the complexity of every query and every RLS policy
- Adding `tenant_id` to every table costs nothing now and avoids a painful migration later
- The RBAC system, pricing engine, and branch management are all designed tenant-aware

**Alternatives considered:**
- Full multi-tenant from day one — rejected due to development cost and complexity with a single-tenant initial customer
- Single-tenant with no multi-tenant path — rejected because it would require a full rewrite when SaaS is needed
- Separate databases per tenant — rejected due to Supabase management overhead

**Pros:**
- Zero migration cost when multi-tenancy is activated
- All tables already have the column; only RLS policies and a tenant-context mechanism need to change

**Cons:**
- `tenant_id` is `NULL` everywhere for now — queries must handle NULL correctly (they do, via `DEFAULT NULL`)

**Future impact:** See TODO.md § "Phase 8 — Multi-Tenant SaaS Activation" for the exact 5 steps needed.

**Related files:** All migration files, `migration_production.sql`

---

## Decision-007
**Single global `AppState` object instead of distributed state**
Date: Phase 0 application design

**Problem:** How to manage application state across 5,200 lines of code?

**Decision:** One global `const AppState = {...}` object. All UI reads from it; all DB writes update it after confirming success.

**Reason:**
- No framework means no built-in state management (Redux, Vuex, Pinia)
- A single object is easy to inspect in DevTools (`AppState` in console)
- Template-literal rendering makes a "re-render from state" model natural
- Prevents the class of bug where two separate state sources disagree

**Alternatives considered:**
- Multiple module-level variables — rejected because sharing state between functions becomes implicit
- localStorage as primary state — rejected because async reads complicate render flow
- Event bus pattern — rejected as unnecessary complexity for this scale

**Pros:**
- Full application state visible in one `console.log(AppState)` call
- Easy to reason about data flow — all state mutations are explicit assignments
- Easy to reset state on logout (`AppState.user = null` etc.)

**Cons:**
- As the platform grows, `AppState` grows — currently 35 fields across 8 phase blocks
- No type safety — any code can mutate any field (convention enforced by documentation, not tooling)

**Future impact:** If the codebase splits across multiple files (web workers, separate modules), `AppState` will need to become a shared-memory construct or be replaced by a proper state store.

**Related files:** `app.js` (lines ~30–70), APP_ARCHITECTURE.md §2

---

## Decision-008
**Boolean load flags instead of array-length guards for lazy loading**
Date: Stabilization sprint (after Phase 2D regression)

**Problem:** How to trigger lazy data loading (e.g. when a user opens the Branches tab for the first time) without causing infinite loops?

**Decision:** Use a dedicated boolean flag (`AppState._branchDataLoaded`) instead of checking `!AppState.branches.length`.

**Reason:**
- The array-length pattern creates an infinite loop when the DB returns an empty array (RLS denial, zero rows, network error). The guard stays `true` forever → `loadBranchData()` → `rerenderContent()` → `postRender()` → loops.
- This caused 3,000+ requests in production (KNOWN_BUGS.md #8).
- A boolean flag is set synchronously to `true` before the async call starts, so no DB result can ever cause a second trigger.

**Alternatives considered:**
- Debouncing the load call — rejected because it only delays the problem, doesn't solve it
- Checking `AppState.view !== previousView` — rejected because it requires storing previous view
- Loading all data eagerly on login — partially adopted (merchants, branches, warehouses now loaded on admin login) but lazy loading is still needed for tabs like Pricing and Finance sub-tabs

**Pros:**
- Exactly one load per tab per session, regardless of DB result
- Zero performance cost
- Simple to implement and read

**Cons:**
- If the data changes while the user is on the tab, they need to manually refresh (a `loadXData()` button handles this)
- Requires resetting the flag when data is intentionally refreshed (not needed currently — manual reload calls the function directly, bypassing `postRender`)

**Related files:** `app.js` (`postRender()`, `AppState._branchDataLoaded`, `AppState._pricingDataLoaded`), KNOWN_BUGS.md #8

---

## Decision-009
**SMS provider abstraction — stub-first, real provider later**
Date: Phase 3

**Problem:** OTP delivery verification requires sending SMS to customers. Which provider to use, and how to structure the code?

**Decision:** Build a `DB.sendSMS(phone, message)` abstraction function first, implement it as a `console.log` stub. The real provider is wired in by replacing only the body of this one function.

**Reason:**
- The OTP flow logic (generate → store → send → verify) can be built and tested completely without a real SMS provider
- During development, admins can read the OTP from the browser console or a visible field
- Swapping providers (Twilio → Vonage → local Egyptian gateway) requires changing exactly one function body — no other code changes

**Alternatives considered:**
- Supabase Edge Functions for SMS — viable, but adds another deployment artifact to maintain
- Direct provider API call from app.js — same result but no abstraction; provider change requires hunting through code
- Build the real SMS integration first — rejected because it blocks OTP UI development on a business decision (which provider)

**Pros:**
- OTP feature is fully functional for testing and admin-assisted delivery without SMS costs
- Provider selection is a business decision decoupled from a code decision

**Cons:**
- `console.log` in production looks unprofessional if not replaced promptly
- Customers don't receive the code until a real provider is wired in

**Future impact:** When a provider is chosen, one function body changes. SMS provider options: Twilio, Vonage, ConnectMisr (Egyptian), Mobily. All require an API key stored securely (not in `app.js` — should go in a Supabase Edge Function or environment variable).

**Related files:** `app.js` (`DB.sendSMS()`, `DB.generateAndSendOTP()`, `DB.verifyOTP()`), TODO.md

---

## Decision-010
**CSS classes for layout instead of inline styles**
Date: Stabilization sprint (after Phase 2 regression)

**Problem:** Dashboard layouts were breaking on mobile even though `@media` rules existed in `styles.css`.

**Decision:** All grid-layout containers MUST use named CSS classes (`.overview-grid`, `.grid-2col`), never raw `style="display:grid;grid-template-columns:..."` inline attributes.

**Reason:**
- Inline styles have higher CSS specificity than any external stylesheet rule, including `!important` on a class selector in some contexts.
- A `@media (max-width: 768px) { .overview-grid { grid-template-columns: 1fr } }` rule is completely ignored if the element has `style="grid-template-columns:1fr 340px"`.
- This caused the mobile dashboard regression (KNOWN_BUGS.md #1) which affected real users.

**Alternatives considered:**
- Keeping inline styles but using `!important` in every media query — technically works but brittle; relies on specificity knowledge that future developers may not have
- CSS custom properties for column counts — overly clever for no benefit

**Pros:**
- Media queries work correctly and predictably
- Layout variants are defined once in `styles.css` and reused across views
- Future responsive changes happen in one file

**Cons:**
- Minor discipline required — must remember to define the class before using it
- New developers must know to look in `styles.css` for layout, not `app.js`

**Related files:** `styles.css` (`.overview-grid`, `.grid-2col`), `app.js` (views using these classes), KNOWN_BUGS.md #1

---

## How to add a new decision

Copy this template and append it to this file:

```markdown
## Decision-XXX
**One-line title**
Date: YYYY-MM-DD

**Problem:** What problem needed solving?

**Decision:** What was decided?

**Reason:**
- Bullet point reasons

**Alternatives considered:**
- Alternative A — why rejected
- Alternative B — why rejected

**Pros:**
- ...

**Cons:**
- ...

**Future impact:** What does this mean for future development?

**Related files:** Which files implement or enforce this decision?
```
