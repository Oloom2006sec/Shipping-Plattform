// ═══════════════════════════════════════════════════════════
// AL-NUKHBA EXPRESS — app.js v4
// Features: RLS-ready, Audit Log, Registration, Second Phone,
//           Clickable Cards, User Management, Push Notifications
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = "https://urktddxiyzwsilddamci.supabase.co";
const SUPABASE_KEY = "sb_publishable_-0wKJXXI18TuHK7pe-dKYw_HWyjH79u";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Global data ─────────────────────────────────────────
let users         = [];
let shipments     = [];
let notifications = [];

// ─── Status meta ──────────────────────────────────────────
const statusMeta = {
  created:          { label:"Shipment Created",    ar:"تم إنشاء الشحنة",  tone:"info"    },
  received:         { label:"Received",            ar:"تم استلام الشحنة", tone:"warning" },
  warehouse:        { label:"In Warehouse",        ar:"في المخزن",         tone:"warning" },
  hub:              { label:"Hub Sorting",         ar:"مركز الفرز",        tone:"primary" },
  out_for_delivery: { label:"Out for Delivery",    ar:"خرجت للتسليم",     tone:"primary" },
  delivered:        { label:"Delivered",           ar:"تم التسليم",        tone:"success" },
  returned:         { label:"Returned",            ar:"مرتجع",             tone:"danger"  }
};

// ─── Nav per role ─────────────────────────────────────────
const navByRole = {
  admin:    ["overview","shipments","tasks","accounts","reports","users","audit","track"],
  merchant: ["overview","shipments","accounts"],
  courier:  ["tasks","accounts"],
  customer: ["track","accounts"]
};

const labels = {
  overview:"الرئيسية", shipments:"الشحنات", tasks:"المهام",
  accounts:"الحساب",  reports:"التقارير", users:"المستخدمين",
  audit:"سجل النشاط", track:"تتبع"
};

// ─── RBAC ─────────────────────────────────────────────────
const permissions = {
  admin:    ["create_shipment","edit_shipment","delete_shipment","assign_courier",
             "view_reports","manage_users","export_excel","change_status","view_all",
             "print_shipment","view_audit","manage_roles","suspend_user"],
  merchant: ["create_shipment","view_own","track","view_accounts","print_shipment","change_status"],
  courier:  ["view_assigned","change_status","upload_pod","navigation"],
  customer: ["track","register"]
};

function can(p) { return !!permissions[state.user?.role]?.includes(p); }

// ─── State ────────────────────────────────────────────────
let state = {
  user:             JSON.parse(localStorage.getItem("nukhba_session") || "null"),
  view:             "overview",
  query:            "",
  statusFilter:     "all",
  selectedShipment: null,
  authMode:         "login",
  userFilter:       "",
  auditFilter:      ""
};

// ─── Helpers ──────────────────────────────────────────────
const money = v => new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(v||0);
const now   = () => new Date().toLocaleString("ar-EG");

function escapeHtml(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
                  .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function icon(name) {
  const d = {
    box:    "M20.5 7.3 12 2.5 3.5 7.3 12 12.1l8.5-4.8ZM3.5 7.3v9.4L12 21.5v-9.4L3.5 7.3Zm17 0L12 12.1v9.4l8.5-4.8V7.3Z",
    truck:  "M3 7h11v9H3V7Zm11 3h4l3 4v2h-7v-6ZM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    user:   "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0H5Z",
    wallet: "M4 6h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Zm13 7h4v-2h-4a2 2 0 0 0 0 4h4v-2h-4Z",
    search: "M10 4a6 6 0 1 0 3.7 10.7l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4Z",
    plus:   "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
    chart:  "M4 19V5h2v14H4Zm7 0V9h2v10h-2Zm7 0V3h2v16h-2Z",
    logout: "M5 4h8v2H7v12h6v2H5V4Zm10.5 4.5L20 13l-4.5 4.5-1.4-1.4 2.1-2.1H10v-2h6.2l-2.1-2.1 1.4-1.4Z",
    bell:   "M12 2a7 7 0 0 1 7 7v4l2 2v1H3v-1l2-2V9a7 7 0 0 1 7-7Zm0 20a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2Z",
    edit:   "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z",
    trash:  "M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z",
    shield: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4Z",
    log:    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm4 18H6V4h7v5h5v11ZM8 15h8v2H8zm0-4h8v2H8z"
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px;fill:currentColor;flex-shrink:0;"><path d="${d[name]||d.box}"/></svg>`;
}

function roleName(r) {
  return {admin:"إدارة",merchant:"تاجر",courier:"مندوب",customer:"عميل"}[r]||r;
}

function roleColor(r) {
  return {admin:"danger",merchant:"success",courier:"primary",customer:"info"}[r]||"info";
}

function setState(patch) { state={...state,...patch}; render(); }

// ─── Toast notifications ───────────────────────────────────
function showToast(msg, type="success") {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  document.body.appendChild(t);
  setTimeout(()=>t.classList.add("show"), 10);
  setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.remove(),300); }, 3500);
}

// ─── Audit Log ────────────────────────────────────────────
async function addAuditLog(action, targetId="", details="") {
  if (!state.user) return;
  try {
    await db.from("audit_logs").insert([{
      user_id:   state.user.id,
      username:  state.user.name,
      role:      state.user.role,
      action,
      target_id: String(targetId),
      details,
      created_at: new Date().toISOString()
    }]);
  } catch(e) { console.warn("Audit log failed:", e.message); }
}

// ─── Role from profile ────────────────────────────────────
async function getRoleFromProfile(userId) {
  try {
    const {data,error} = await db.from("profiles").select("role,full_name,phone").eq("id",userId).single();
    if (error||!data) return null;
    return data;
  } catch(e) { return null; }
}

function determineRole(email) {
  if (!email) return "customer";
  const e = email.toLowerCase();
  if (e.startsWith("admin"))    return "admin";
  if (e.startsWith("merchant")) return "merchant";
  if (e.startsWith("courier"))  return "courier";
  return "customer";
}

// ─── Visible shipments ────────────────────────────────────
function visibleShipments() {
  let list = [...shipments];
  const role = state.user?.role;
  const uid  = state.user?.id;
  if (role==="courier")  list = list.filter(s=>s.courierId===uid);
  if (role==="merchant") list = list.filter(s=>s.merchantId===uid);
  if (role==="customer") list = [];   // customer uses track only
  return list.filter(s=>{
    const txt = `${s.id} ${s.customerName} ${s.customerPhone} ${s.customerPhone2||""} ${s.address}`.toLowerCase();
    return txt.includes(state.query.trim().toLowerCase()) &&
           (state.statusFilter==="all"||s.status===state.statusFilter);
  });
}

function statCards(list) {
  return [
    { label:"كل الشحنات",     value:list.length,                                          icon:"box",    filter:"all"              },
    { label:"خارج للتسليم",   value:list.filter(s=>s.status==="out_for_delivery").length,  icon:"truck",  filter:"out_for_delivery"  },
    { label:"تم التسليم",     value:list.filter(s=>s.status==="delivered").length,         icon:"chart",  filter:"delivered"         },
    { label:"مرتجعات",        value:list.filter(s=>s.status==="returned").length,           icon:"box",    filter:"returned"          }
  ];
}

// ══════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ══════════════════════════════════════════════════════════
async function requestPushPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission==="default") {
    await Notification.requestPermission();
  }
}

function sendPushNotification(title, body, icon="/icon.svg") {
  if (Notification.permission!=="granted") return;
  try {
    new Notification(title, { body, icon, badge:"/icon.svg", dir:"rtl" });
  } catch(e) {}
}

// ── Real-time Supabase subscription ───────────────────────
let realtimeChannel = null;

function startRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = db.channel("shipments-changes")
    .on("postgres_changes", { event:"INSERT", schema:"public", table:"shipments" }, payload=>{
      const s = mapShipment(payload.new);
      shipments.unshift(s);
      addNotification(`New shipment: ${s.id} — ${s.customerName}`, "admin");
      if (state.user?.role==="admin") {
        sendPushNotification("📦 New Shipment", `${s.id} — ${s.customerName}`);
        render();
      }
    })
    .on("postgres_changes", { event:"UPDATE", schema:"public", table:"shipments" }, payload=>{
      const idx = shipments.findIndex(s=>s.id===payload.new.shipment_code);
      if (idx>=0) { shipments[idx]={...shipments[idx],...mapShipment(payload.new)}; render(); }
    })
    .subscribe();
}

function mapShipment(item) {
  return {
    id:             item.shipment_code,
    merchantId:     item.merchant_id,
    merchantName:   item.merchant_name||"",
    merchantPhone:  item.merchant_phone||"",
    courierId:      item.courier_id||null,
    customerName:   item.customer_name||"",
    customerPhone:  item.customer_phone||"",
    customerPhone2: item.customer_phone2||"",
    address:        item.address||"",
    status:         item.status||"created",
    amount:         item.amount||0,
    deliveryFee:    item.delivery_fee||60,
    eta:            item.eta||"",
    notes:          item.notes||"",
    podUrl:         item.pod_url||null,
    createdAt:      item.created_at ? new Date(item.created_at).toLocaleDateString("ar-EG") : ""
  };
}

// ══════════════════════════════════════════════════════════
// AUTH SCREENS
// ══════════════════════════════════════════════════════════
function loginScreen() {
  const isReg = state.authMode==="register";
  return `
    <main class="login-shell">
      <section class="login-panel">
        <div class="brand-mark">${icon("truck")}</div>
        <h1>النخبة للشحن السريع</h1>
        <p>منصة متكاملة لإدارة الشحن والتوصيل والتتبع.</p>
        ${isReg ? registerForm() : loginForm()}
        <div class="auth-switch">
          ${isReg
            ? `Already have an account? <button class="link-btn" id="switchAuth">Sign In</button>`
            : `New customer? <button class="link-btn" id="switchAuth">Create Account</button>`}
        </div>
      </section>
      <section class="app-preview">
        <div class="preview-top"><span>Live Updates</span><strong>96%</strong></div>
        <div class="route-line"></div>
        <div class="preview-card"><b>ANE-54558</b><span>Out for Delivery</span></div>
        <div class="preview-card"><b>Today's Collection</b><span>${money(2100)}</span></div>
      </section>
    </main>`;
}

function loginForm() {
  return `
    <form id="loginForm" class="login-form">
      <label>Email<input name="email" type="email" value="merchant@nukhba.com" autocomplete="username"/></label>
      <label>Password<input name="password" type="password" value="123456" autocomplete="current-password"/></label>
      <div id="loginError" style="display:none;color:#c0392b;font-size:13px;margin-top:4px;"></div>
      <button class="primary-btn" type="submit">${icon("user")} Sign In</button>
    </form>
    <p style="font-size:12px;color:#aaa;text-align:center;margin-top:8px;">Demo password: 123456</p>
    <div class="demo-users">
      <button data-demo="admin@nukhba.com">Admin</button>
      <button data-demo="merchant@nukhba.com">Merchant</button>
      <button data-demo="courier@nukhba.com">Courier</button>
    </div>`;
}

function registerForm() {
  return `
    <form id="registerForm" class="login-form">
      <label>Full Name<input name="fullname" type="text" placeholder="Your full name" autocomplete="name"/></label>
      <label>Email<input name="email" type="email" placeholder="your@email.com" autocomplete="username"/></label>
      <label>Phone<input name="phone" type="tel" placeholder="01xxxxxxxxx"/></label>
      <label>Role
        <select name="role">
          <option value="customer">Customer — Track my shipments</option>
          <option value="merchant">Merchant — I send shipments</option>
          <option value="courier">Courier — I deliver shipments</option>
        </select>
      </label>
      <label>Password<input name="password" type="password" placeholder="Min 6 characters" autocomplete="new-password"/></label>
      <label>Confirm Password<input name="confirm" type="password" placeholder="Repeat password" autocomplete="new-password"/></label>
      <div id="regError" style="display:none;color:#c0392b;font-size:13px;margin-top:4px;"></div>
      <button class="primary-btn" type="submit">${icon("user")} Create Account</button>
    </form>`;
}

// ══════════════════════════════════════════════════════════
// SHELL
// ══════════════════════════════════════════════════════════
function shell(content) {
  const views  = navByRole[state.user.role];
  const unread = notifications.filter(n=>!n.read).length;
  return state.user.role==="admin"
    ? adminShell(content, views, unread)
    : simpleShell(content, views, unread);
}

function adminShell(content, views, unread) {
  return `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark small">${icon("truck")}</div>
          <div><strong>النخبة للشحن السريع</strong><span>Admin Panel</span></div>
        </div>
        <nav>
          ${views.map(v=>`
            <button class="${state.view===v?"active":""}" data-view="${v}">
              ${v==="audit"?icon("log"):v==="users"?icon("user"):v==="shipments"?icon("box"):v==="reports"?icon("chart"):icon("truck")}
              ${labels[v]}
            </button>`).join("")}
        </nav>
        <div class="sidebar-footer">
          <select id="roleSwitcher" class="role-switcher" title="Preview as role">
            <option value="">👁 Preview as...</option>
            <option value="admin">Admin</option>
            <option value="merchant">Merchant</option>
            <option value="courier">Courier</option>
            <option value="customer">Customer</option>
          </select>
          <button class="ghost-btn logout" id="logoutBtn">${icon("logout")} Logout</button>
        </div>
      </aside>
      <main class="content">
        <header class="topbar">
          <div>
            <span class="eyebrow">System Administrator</span>
            <h2>Welcome, ${escapeHtml(state.user.name?.split(" ")[0]||"Admin")}</h2>
          </div>
          ${topbarRight(unread)}
        </header>
        ${notifPanel()}
        ${content}
      </main>
    </div>`;
}

function simpleShell(content, views, unread) {
  const displayName = state.user.name?.length>14
    ? state.user.name.split(" ")[0] : state.user.name;
  return `
    <div class="simple-layout">
      <header class="simple-topbar">
        <div class="brand-inline">
          ${icon("truck")}
          <strong>النخبة للشحن السريع</strong>
        </div>
        <div class="topbar-user">
          <span class="badge ${roleColor(state.user.role)}">${roleName(state.user.role)}</span>
          <span class="user-name">${escapeHtml(displayName)}</span>
          ${topbarRight(unread)}
          <button class="icon-btn" id="logoutBtn" title="Logout">${icon("logout")}</button>
        </div>
      </header>
      <nav class="tab-nav">
        ${views.map(v=>`<button class="${state.view===v?"active":""}" data-view="${v}">${labels[v]}</button>`).join("")}
      </nav>
      ${notifPanel()}
      <main class="tab-content">${content}</main>
    </div>`;
}

function topbarRight(unread) {
  return `
    <div style="display:flex;gap:10px;align-items:center;">
      <button class="ghost-btn notif-btn" id="toggleNotif" title="Notifications">
        ${icon("bell")}
        ${unread>0?`<span class="notif-badge">${unread}</span>`:""}
      </button>
      <div class="search-box">
        ${icon("search")}
        <input id="searchInput" value="${escapeHtml(state.query)}" placeholder="Search..."/>
      </div>
    </div>`;
}

function notifPanel() {
  return `
    <div id="notifPanel" class="notif-panel" style="display:none;">
      <div class="notif-header">
        <h4>Notifications</h4>
        <button class="link-btn" id="clearNotif">Clear All</button>
      </div>
      ${notifications.length
        ? notifications.slice(0,10).map(n=>`
            <div class="notification-item ${n.read?"":"unread"}">
              <span>${escapeHtml(n.text)}</span>
              <small>${escapeHtml(n.time)}</small>
            </div>`).join("")
        : `<p style="padding:1rem;color:#888;text-align:center;">No notifications</p>`}
    </div>`;
}

// ══════════════════════════════════════════════════════════
// VIEWS
// ══════════════════════════════════════════════════════════

// ─── Overview ─────────────────────────────────────────────
function overview() {
  const list = visibleShipments();
  return `
    <section class="stats-grid">
      ${statCards(list).map(c=>`
        <article class="stat clickable-card" onclick="setStatusFilter('${c.filter}')" title="Click to filter">
          <div>${icon(c.icon)}</div>
          <span>${c.label}</span>
          <strong>${c.value}</strong>
          <small class="card-hint">Click to view →</small>
        </article>`).join("")}
    </section>
    <section class="work-grid">
      <div class="panel wide">
        <div class="section-head">
          <h3>Latest Shipments
            ${state.statusFilter!=="all"
              ? `<span class="badge info" style="font-size:11px;margin-right:8px;">${statusMeta[state.statusFilter]?.ar||state.statusFilter} <button onclick="setStatusFilter('all')" style="background:none;border:none;cursor:pointer;color:inherit;">✕</button></span>`
              : ""}
          </h3>
          <div style="display:flex;gap:8px;">
            <button class="ghost-btn" id="openScanner">📷 Scan QR</button>
            ${can("create_shipment")?`<button class="primary-btn compact" id="newShipmentBtn">${icon("plus")} New Shipment</button>`:""}
          </div>
        </div>
        ${shipmentTable(state.statusFilter==="all"?list.slice(0,8):list)}
      </div>
      <div class="panel">
        <h3>Operations Overview</h3>
        <div class="alert-list">
          <div class="alert-item clickable-card" onclick="setStatusFilter('created')">
            <b>${list.filter(s=>s.status==="created").length}</b>
            <span>Pending Pickup</span>
          </div>
          <div class="alert-item clickable-card" onclick="setStatusFilter('returned')">
            <b>${list.filter(s=>s.status==="returned").length}</b>
            <span>Returns</span>
          </div>
          <div class="alert-item clickable-card" onclick="setStatusFilter('delivered')">
            <b>${list.filter(s=>s.status==="delivered").length}</b>
            <span>Delivered Today</span>
          </div>
        </div>
        <div class="chart-box" style="margin-top:16px;"><canvas id="statusChart"></canvas></div>
      </div>
    </section>`;
}

// ─── Shipment Table ────────────────────────────────────────
function shipmentTable(list) {
  if (!list.length) return `<p style="padding:1.5rem;color:#888;text-align:center;">No shipments found</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Shipment</th><th>Customer</th><th>Phone</th>
            <th>Address</th><th>Status</th><th>Amount</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(s=>`
            <tr>
              <td><b>${escapeHtml(s.id)}</b><br><small style="color:#999">${escapeHtml(s.createdAt)}</small></td>
              <td>${escapeHtml(s.customerName)}</td>
              <td>
                <a href="tel:${escapeHtml(s.customerPhone)}" class="phone-link">📞 ${escapeHtml(s.customerPhone)}</a>
                ${s.customerPhone2?`<br><a href="tel:${escapeHtml(s.customerPhone2)}" class="phone-link">📞 ${escapeHtml(s.customerPhone2)}</a>`:""}
              </td>
              <td style="max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.address)}</td>
              <td><span class="badge ${statusMeta[s.status]?.tone||"info"}">${statusMeta[s.status]?.ar||s.status}</span></td>
              <td>${money(s.amount)}</td>
              <td>
                <div class="shipment-actions">
                  <button class="link-btn" data-open="${escapeHtml(s.id)}">View</button>
                  ${can("print_shipment")?`<button class="link-btn" onclick="printShipment('${escapeHtml(s.id)}')">Print</button>`:""}
                  <canvas id="qr-${escapeHtml(s.id)}" style="width:44px;height:44px;"></canvas>
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// ─── Shipments View ────────────────────────────────────────
function shipmentsView() {
  const selected = shipments.find(s=>s.id===state.selectedShipment)||visibleShipments()[0]||null;
  return `
    <section class="panel">
      <div class="section-head">
        <h3>Shipment Management</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="ghost-btn" onclick="manualTrackShipment()">📦 Track</button>
          ${can("export_excel")?`<button class="ghost-btn" onclick="exportShipmentsExcel()">📊 Excel</button>`:""}
          ${can("create_shipment")?`<button class="primary-btn compact" id="newShipmentBtn">${icon("plus")} Add</button>`:""}
        </div>
      </div>
      <div class="filter-row" style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap;">
        ${["all","created","received","warehouse","hub","out_for_delivery","delivered","returned"].map(st=>`
          <button onclick="setStatusFilter('${st}')" class="ghost-btn ${state.statusFilter===st?"active":""}">
            ${st==="all"?"All":statusMeta[st]?.ar||st}
          </button>`).join("")}
      </div>
      ${shipmentTable(visibleShipments())}
    </section>
    ${selected?detailsPanel(selected):""}`;
}

// ─── Tasks View ────────────────────────────────────────────
function tasksView() {
  const list = visibleShipments().filter(s=>s.status!=="delivered"&&s.status!=="returned");
  if (!list.length) return `
    <section class="panel" style="text-align:center;padding:3rem;">
      <div style="font-size:3rem;">✅</div>
      <h3>No pending tasks</h3>
      <p style="color:#888;">All shipments delivered or not assigned yet</p>
    </section>`;
  return `
    <section class="task-list">
      ${list.map(s=>`
        <article class="task-card">
          <div class="task-card-header">
            <span class="badge ${statusMeta[s.status]?.tone||"info"}">${statusMeta[s.status]?.ar||s.status}</span>
            <b>${escapeHtml(s.id)}</b>
          </div>
          <h3>${escapeHtml(s.customerName)}</h3>
          <p>📍 ${escapeHtml(s.address)}</p>
          <p>
            <a href="tel:${escapeHtml(s.customerPhone)}" class="phone-link">📞 ${escapeHtml(s.customerPhone)}</a>
            ${s.customerPhone2?`&nbsp;&nbsp;<a href="tel:${escapeHtml(s.customerPhone2)}" class="phone-link">📞 ${escapeHtml(s.customerPhone2)}</a>`:""}
          </p>
          <p>💰 ${money(s.amount)}</p>
          <div class="task-actions">
            <a class="ghost-btn" href="tel:${escapeHtml(s.customerPhone)}">📞 Call</a>
            <a class="ghost-btn" target="_blank"
               href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}">
              🗺 Navigate
            </a>
            ${can("upload_pod")?`
              <label class="ghost-btn" style="cursor:pointer;">
                📷 Upload POD
                <input type="file" id="pod-${escapeHtml(s.id)}" accept="image/*" style="display:none"
                       onchange="uploadPOD('${escapeHtml(s.id)}','pod-${escapeHtml(s.id)}')"/>
              </label>`:""}
            ${can("change_status")?`
              <button class="primary-btn compact"
                      onclick="updateShipmentStatus('${escapeHtml(s.id)}','delivered')">✅ Delivered</button>
              <button class="ghost-btn" style="color:#c0392b"
                      onclick="updateShipmentStatus('${escapeHtml(s.id)}','returned')">↩ Return</button>`:""}
          </div>
          ${s.podUrl?`<img src="${escapeHtml(s.podUrl)}" style="width:100%;max-width:200px;border-radius:8px;margin-top:8px;"/>`:""}
        </article>`).join("")}
    </section>`;
}

// ─── Details Panel ─────────────────────────────────────────
function detailsPanel(s) {
  if (!s) return "";
  const meta    = statusMeta[s.status]||{ar:s.status,tone:"info"};
  const couriers = users.filter(u=>u.role==="courier");
  const steps   = ["created","received","warehouse","hub","out_for_delivery","delivered"];
  const curIdx  = steps.indexOf(s.status);
  return `
    <section class="panel details">
      <div class="section-head">
        <h3>${escapeHtml(s.id)}</h3>
        <span class="badge ${meta.tone}">${meta.ar}</span>
      </div>
      <div class="detail-grid">
        <div><span>Customer</span><b>${escapeHtml(s.customerName)}</b></div>
        <div><span>Phone 1</span>
          <b><a href="tel:${escapeHtml(s.customerPhone)}" class="phone-link">📞 ${escapeHtml(s.customerPhone)}</a></b>
        </div>
        ${s.customerPhone2?`
        <div><span>Phone 2</span>
          <b><a href="tel:${escapeHtml(s.customerPhone2)}" class="phone-link">📞 ${escapeHtml(s.customerPhone2)}</a></b>
        </div>`:""}
        <div><span>Address</span><b>${escapeHtml(s.address)}</b></div>
        <div><span>ETA</span><b>${escapeHtml(s.eta)||"Pending"}</b></div>
        <div><span>Order Value</span><b>${money(s.amount)}</b></div>
        <div><span>Delivery Fee</span><b>${money(s.deliveryFee)}</b></div>
        ${s.merchantName?`<div><span>Merchant</span><b>${escapeHtml(s.merchantName)}</b></div>`:""}
        ${s.merchantPhone?`<div><span>Merchant Phone</span>
          <b><a href="tel:${escapeHtml(s.merchantPhone)}" class="phone-link">📞 ${escapeHtml(s.merchantPhone)}</a></b>
        </div>`:""}
        ${s.notes?`<div style="grid-column:1/-1"><span>Notes</span><b>${escapeHtml(s.notes)}</b></div>`:""}
      </div>

      ${can("assign_courier")?`
        <div class="assign-box">
          <select id="assignCourier">
            <option value="">Select Courier</option>
            ${couriers.map(c=>`
              <option value="${escapeHtml(c.id)}" ${s.courierId===c.id?"selected":""}>
                ${escapeHtml(c.name)}
              </option>`).join("")}
          </select>
          <button class="ghost-btn" onclick="assignCourier('${escapeHtml(s.id)}')">Assign</button>
        </div>`:""}

      ${can("change_status")?`
        <div class="status-actions">
          ${["received","warehouse","hub","out_for_delivery"].map(st=>`
            <button onclick="updateShipmentStatus('${escapeHtml(s.id)}','${st}')" class="ghost-btn">
              ${statusMeta[st].ar}
            </button>`).join("")}
          <button onclick="updateShipmentStatus('${escapeHtml(s.id)}','delivered')"
                  class="primary-btn compact">✅ Delivered</button>
          <button onclick="updateShipmentStatus('${escapeHtml(s.id)}','returned')"
                  class="ghost-btn" style="color:#c0392b">↩ Return</button>
        </div>`:""}

      ${can("upload_pod")?`
        <div class="pod-upload">
          <label class="ghost-btn" style="cursor:pointer;">
            📷 Upload Proof of Delivery
            <input type="file" id="podImage" accept="image/*" style="display:none"
                   onchange="uploadPOD('${escapeHtml(s.id)}','podImage')"/>
          </label>
        </div>`:""}

      ${s.podUrl?`
        <div class="pod-preview">
          <h4>Proof of Delivery</h4>
          <img src="${escapeHtml(s.podUrl)}" style="width:220px;border-radius:12px;margin-top:8px;display:block;"/>
        </div>`:""}

      <div class="tracking-progress">
        ${steps.map((step,i)=>`
          <div class="progress-step">
            <div class="progress-circle ${i<=curIdx?"done":""}">${i<=curIdx?"✓":i+1}</div>
            <span>${statusMeta[step]?.ar||step}</span>
          </div>
          ${i<steps.length-1?`<div class="progress-line ${i<curIdx?"done":""}"></div>`:""}`
        ).join("")}
      </div>

      <div class="timeline" id="timeline-${escapeHtml(s.id)}">
        <h4>Shipment Log</h4>
        <p style="color:#888;font-size:13px;">Loading...</p>
      </div>
    </section>`;
}

// ─── Track View ────────────────────────────────────────────
function trackView() {
  const s = shipments.find(x=>x.id===state.selectedShipment);
  if (!s) return `
    <section class="panel" style="text-align:center;padding:3rem 2rem;">
      <div style="font-size:4rem;">📦</div>
      <h2>${state.selectedShipment?"Shipment Not Found":"Track Your Shipment"}</h2>
      <p style="color:#888;margin:1rem 0;font-size:15px;">
        ${state.selectedShipment?"Check the shipment code and try again":"Enter the shipment code sent to you by the merchant"}
      </p>
      <button class="primary-btn" style="font-size:16px;padding:14px 32px;"
              onclick="manualTrackShipment()">🔍 Track Shipment</button>
    </section>`;

  const meta   = statusMeta[s.status]||{ar:s.status,tone:"info"};
  const steps  = ["created","received","warehouse","hub","out_for_delivery","delivered"];
  const curIdx = steps.indexOf(s.status);
  return `
    <section class="track-hero">
      <div>
        <span class="eyebrow">Shipment Tracking</span>
        <h2>${escapeHtml(s.id)}</h2>
        <p>${escapeHtml(s.customerName)} — ${escapeHtml(s.address)}</p>
      </div>
      <span class="badge ${meta.tone}" style="font-size:14px;padding:8px 16px;">${meta.ar}</span>
    </section>
    <section class="panel" style="margin-top:16px;">
      <h4 style="margin-bottom:16px;">Shipment Route</h4>
      <div class="tracking-progress">
        ${steps.map((step,i)=>`
          <div class="progress-step">
            <div class="progress-circle ${i<=curIdx?"done":""}">${i<=curIdx?"✓":i+1}</div>
            <span>${statusMeta[step]?.ar||step}</span>
          </div>
          ${i<steps.length-1?`<div class="progress-line ${i<curIdx?"done":""}"></div>`:""}`
        ).join("")}
      </div>
      <div class="detail-grid" style="margin-top:20px;">
        <div><span>Customer</span><b>${escapeHtml(s.customerName)}</b></div>
        <div><span>Phone</span>
          <b><a href="tel:${escapeHtml(s.customerPhone)}" class="phone-link">📞 ${escapeHtml(s.customerPhone)}</a></b>
        </div>
        ${s.customerPhone2?`<div><span>Phone 2</span>
          <b><a href="tel:${escapeHtml(s.customerPhone2)}" class="phone-link">📞 ${escapeHtml(s.customerPhone2)}</a></b>
        </div>`:""}
        <div><span>Address</span><b>${escapeHtml(s.address)}</b></div>
        <div><span>ETA</span><b>${escapeHtml(s.eta)||"Pending"}</b></div>
      </div>
      ${s.podUrl?`
        <div style="margin-top:16px;">
          <h4>Proof of Delivery</h4>
          <img src="${escapeHtml(s.podUrl)}" style="width:220px;border-radius:12px;margin-top:8px;display:block;"/>
        </div>`:""}
      <div class="timeline" id="timeline-${escapeHtml(s.id)}" style="margin-top:20px;">
        <h4>Event Log</h4>
        <p style="color:#888;font-size:13px;">Loading...</p>
      </div>
    </section>`;
}

// ─── Accounts View ─────────────────────────────────────────
function accountsView() {
  if (state.user.role==="customer") return `
    <section class="panel" style="text-align:center;padding:2rem;">
      <div style="font-size:3rem;">📦</div>
      <h3>Track Your Shipment</h3>
      <p style="color:#888;margin:1rem 0;">Enter your shipment code to check its status</p>
      <button class="primary-btn" onclick="manualTrackShipment()">🔍 Track Shipment</button>
    </section>`;

  const list      = visibleShipments();
  const delivered = list.filter(s=>s.status==="delivered");
  const revenue   = delivered.reduce((a,s)=>a+(s.amount||0),0);
  const fees      = delivered.reduce((a,s)=>a+(s.deliveryFee||0),0);
  const payable   = state.user.role==="courier"
    ? delivered.length*25 : revenue-fees;
  return `
    <section class="account-band">
      <div><span>Current Balance</span><strong>${money(payable)}</strong></div>
      <button class="primary-btn compact">Request Settlement</button>
    </section>
    <section class="stats-grid two">
      <article class="stat"><div>${icon("wallet")}</div><span>Collections</span><strong>${money(revenue)}</strong></article>
      <article class="stat"><div>${icon("truck")}</div><span>Delivery Fees</span><strong>${money(fees)}</strong></article>
    </section>
    <section class="panel">
      <h3>Account Statement — Delivered Shipments</h3>
      ${shipmentTable(delivered)}
    </section>`;
}

// ─── Reports View ──────────────────────────────────────────
function reportsView() {
  const list  = visibleShipments();
  const total = list.length||1;
  return `
    <section class="stats-grid">
      ${Object.keys(statusMeta).map(st=>`
        <article class="stat mini clickable-card" onclick="setStatusFilter('${st}');setState({view:'shipments'})">
          <span class="badge ${statusMeta[st].tone}">${statusMeta[st].ar}</span>
          <strong>${list.filter(s=>s.status===st).length}</strong>
        </article>`).join("")}
    </section>
    <section class="panel">
      <h3>Performance KPIs</h3>
      <div class="feature-list">
        <div>Total Shipments: <b>${list.length}</b></div>
        <div>Delivery Rate: <b>${Math.round(list.filter(s=>s.status==="delivered").length/total*100)}%</b></div>
        <div>Return Rate: <b>${Math.round(list.filter(s=>s.status==="returned").length/total*100)}%</b></div>
        <div>Total Revenue: <b>${money(list.reduce((a,s)=>a+(s.amount||0),0))}</b></div>
        <div>Total Fees: <b>${money(list.reduce((a,s)=>a+(s.deliveryFee||0),0))}</b></div>
        <div>Net Payable: <b>${money(list.filter(s=>s.status==="delivered").reduce((a,s)=>a+(s.amount-s.deliveryFee),0))}</b></div>
      </div>
    </section>`;
}

// ─── Users View ────────────────────────────────────────────
function usersView() {
  if (!can("manage_users")) return `<section class="panel"><h3>Access Denied</h3></section>`;
  const filtered = users.filter(u=>{
    const txt = `${u.name} ${u.email} ${u.phone||""} ${u.role}`.toLowerCase();
    return txt.includes(state.userFilter.toLowerCase());
  });
  return `
    <section class="panel">
      <div class="section-head">
        <h3>User Management</h3>
        <button class="primary-btn compact" id="addUserBtn">${icon("plus")} New User</button>
      </div>
      <div style="margin-bottom:12px;">
        <input id="userSearchInput" value="${escapeHtml(state.userFilter)}"
               placeholder="Search users by name, email, role..."
               style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border,#ddd);"/>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Role</th><th>Email</th>
              <th>Phone</th><th>Created</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length===0
              ? `<tr><td colspan="7" style="text-align:center;color:#888;padding:1.5rem;">No users found</td></tr>`
              : filtered.map(u=>`
                <tr class="${u.suspended?"suspended-row":""}">
                  <td><b>${escapeHtml(u.name||"—")}</b></td>
                  <td><span class="badge ${roleColor(u.role)}">${roleName(u.role)}</span></td>
                  <td>${escapeHtml(u.email||"—")}</td>
                  <td>${escapeHtml(u.phone||"—")}</td>
                  <td style="font-size:12px;color:#999;">${escapeHtml(u.createdAt||"—")}</td>
                  <td>
                    <span class="badge ${u.suspended?"danger":"success"}">
                      ${u.suspended?"Suspended":"Active"}
                    </span>
                  </td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      <button class="ghost-btn compact" onclick="openEditUserModal('${escapeHtml(u.id)}')">${icon("edit")}</button>
                      <button class="ghost-btn compact" onclick="toggleSuspendUser('${escapeHtml(u.id)}')">
                        ${u.suspended?"✅":"🚫"}
                      </button>
                      <button class="ghost-btn compact" style="color:#c0392b" onclick="deleteUser('${escapeHtml(u.id)}')">${icon("trash")}</button>
                    </div>
                  </td>
                </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
}

// ─── Audit Log View ────────────────────────────────────────
function auditView() {
  if (!can("view_audit")) return `<section class="panel"><h3>Access Denied</h3></section>`;
  return `
    <section class="panel">
      <div class="section-head">
        <h3>${icon("shield")} Audit Log</h3>
        <button class="ghost-btn" onclick="loadAuditLogs()">🔄 Refresh</button>
      </div>
      <div style="margin-bottom:12px;">
        <input id="auditSearchInput" value="${escapeHtml(state.auditFilter)}"
               placeholder="Search by user, action, shipment..."
               style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border,#ddd);"/>
      </div>
      <div id="auditTableContainer">
        <p style="text-align:center;color:#888;padding:2rem;">Loading audit logs...</p>
      </div>
    </section>`;
}

function renderAuditTable(logs) {
  const container = document.querySelector("#auditTableContainer");
  if (!container) return;
  if (!logs.length) {
    container.innerHTML=`<p style="text-align:center;color:#888;padding:2rem;">No audit logs found</p>`;
    return;
  }
  const filtered = logs.filter(l=>{
    const txt=`${l.username} ${l.action} ${l.target_id} ${l.role} ${l.details}`.toLowerCase();
    return txt.includes(state.auditFilter.toLowerCase());
  });
  container.innerHTML=`
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Target</th><th>Details</th></tr>
        </thead>
        <tbody>
          ${filtered.map(l=>`
            <tr>
              <td style="font-size:12px;color:#999;white-space:nowrap;">
                ${new Date(l.created_at).toLocaleString("ar-EG")}
              </td>
              <td><b>${escapeHtml(l.username||"—")}</b></td>
              <td><span class="badge ${roleColor(l.role)}">${roleName(l.role)}</span></td>
              <td><span class="audit-action">${escapeHtml(l.action)}</span></td>
              <td><code style="font-size:12px;">${escapeHtml(l.target_id||"—")}</code></td>
              <td style="font-size:12px;color:#666;">${escapeHtml(l.details||"—")}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function renderView() {
  const v = state.view;
  if (v==="shipments") return shipmentsView();
  if (v==="tasks")     return tasksView();
  if (v==="accounts")  return accountsView();
  if (v==="reports")   return reportsView();
  if (v==="track")     return trackView();
  if (v==="users")     return usersView();
  if (v==="audit")     return auditView();
  return overview();
}

// ══════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════
function render() {
  const params  = new URLSearchParams(window.location.search);
  const trackId = params.get("track");
  if (trackId) {
    state.selectedShipment=trackId; state.view="track";
    if (!state.user) state.user={role:"customer",id:"guest",name:"Guest"};
  }
  const app = document.querySelector("#app");
  if (!app) return;
  app.innerHTML = state.user ? shell(renderView()) : loginScreen();
  bindEvents();

  // lazy load timeline
  const sel = shipments.find(s=>s.id===state.selectedShipment);
  if (sel) loadTimeline(sel.id);

  // lazy load audit logs
  if (state.view==="audit") loadAuditLogs();

  // Chart
  setTimeout(()=>{
    const canvas = document.getElementById("statusChart");
    if (!canvas) return;
    const old = Chart.getChart(canvas);
    if (old) old.destroy();
    const vl = visibleShipments();
    new Chart(canvas,{
      type:"doughnut",
      data:{
        labels:["Delivered","Returned","Out for Delivery","In Warehouse","New"],
        datasets:[{
          data:[
            vl.filter(s=>s.status==="delivered").length,
            vl.filter(s=>s.status==="returned").length,
            vl.filter(s=>s.status==="out_for_delivery").length,
            vl.filter(s=>s.status==="warehouse").length,
            vl.filter(s=>s.status==="created").length,
          ],
          backgroundColor:["#22c55e","#ef4444","#3b82f6","#f59e0b","#a855f7"]
        }]
      },
      options:{responsive:true,plugins:{legend:{position:"bottom"}}}
    });
  },200);

  // QR codes
  setTimeout(()=>{
    visibleShipments().forEach(s=>{
      const c=document.getElementById(`qr-${s.id}`);
      if(!c) return;
      try { QRCode.toCanvas(c,`${location.origin}${location.pathname}?track=${s.id}`,{width:44}); } catch(e){}
    });
  },150);
}

// ══════════════════════════════════════════════════════════
// BIND EVENTS
// ══════════════════════════════════════════════════════════
function bindEvents() {

  // ── Login ──
  document.querySelector("#loginForm")?.addEventListener("submit", async e=>{
    e.preventDefault();
    const fd  = new FormData(e.currentTarget);
    const btn = e.currentTarget.querySelector("button[type=submit]");
    const err = document.querySelector("#loginError");
    btn.disabled=true; btn.textContent="Signing in...";

    const {data,error}=await db.auth.signInWithPassword({
      email:fd.get("email"), password:fd.get("password")
    });

    btn.disabled=false; btn.innerHTML=`${icon("user")} Sign In`;

    if (error) {
      if(err){err.style.display="block";err.textContent="Invalid email or password";}
      return;
    }

    const profile = await getRoleFromProfile(data.user.id);
    const role    = profile?.role||determineRole(data.user.email);
    const name    = profile?.full_name||data.user.user_metadata?.full_name||data.user.email.split("@")[0];
    const phone   = profile?.phone||"";

    const user = { id:data.user.id, name, role, email:data.user.email, phone, balance:0 };
    localStorage.setItem("nukhba_session",JSON.stringify(user));

    await addAuditLog("LOGIN", data.user.id, `Logged in as ${role}`);
    await requestPushPermission();
    if (role==="admin") { await loadUsers(); startRealtime(); }

    const startView = role==="customer"?"track":role==="courier"?"tasks":role==="merchant"?"shipments":"overview";
    setState({user, view:startView});
  });

  // ── Register ──
  document.querySelector("#registerForm")?.addEventListener("submit", async e=>{
    e.preventDefault();
    const fd      = new FormData(e.currentTarget);
    const fullname= fd.get("fullname").trim();
    const email   = fd.get("email").trim();
    const phone   = fd.get("phone").trim();
    const role    = fd.get("role")||"customer";
    const password= fd.get("password");
    const confirm = fd.get("confirm");
    const err     = document.querySelector("#regError");
    const btn     = e.currentTarget.querySelector("button[type=submit]");

    if (!fullname||!email||!password) { err.style.display="block";err.textContent="Please fill all required fields";return; }
    if (password!==confirm)           { err.style.display="block";err.textContent="Passwords do not match";return; }
    if (password.length<6)            { err.style.display="block";err.textContent="Password must be at least 6 characters";return; }

    btn.disabled=true; btn.textContent="Creating account...";

    const {data,error}=await db.auth.signUp({
      email, password, options:{data:{full_name:fullname,role,phone}}
    });

    btn.disabled=false; btn.innerHTML=`${icon("user")} Create Account`;
    if (error) { err.style.display="block";err.textContent="Error: "+error.message;return; }

    // Save to profiles
    await db.from("profiles").upsert([{
      id:data.user.id, full_name:fullname, email, phone, role
    }]);

    await addAuditLog("REGISTER", data.user.id, `New ${role} registered: ${email}`);

    const user={id:data.user.id,name:fullname,role,email,phone,balance:0};
    localStorage.setItem("nukhba_session",JSON.stringify(user));
    const startView = role==="customer"?"track":role==="courier"?"tasks":"shipments";
    setState({user, view:startView, authMode:"login"});
    showToast(`Welcome, ${fullname}! Account created successfully.`);
  });

  // ── Switch login/register ──
  document.querySelector("#switchAuth")?.addEventListener("click",()=>{
    setState({authMode:state.authMode==="login"?"register":"login"});
  });

  // ── Demo buttons ──
  document.querySelectorAll("[data-demo]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const e=document.querySelector("[name='email']");
      const p=document.querySelector("[name='password']");
      if(e) e.value=btn.dataset.demo;
      if(p) p.value="123456";
    });
  });

  // ── Nav ──
  document.querySelectorAll("[data-view]").forEach(btn=>{
    btn.addEventListener("click",()=>setState({view:btn.dataset.view}));
  });

  // ── Role switcher ──
  document.querySelector("#roleSwitcher")?.addEventListener("change",e=>{
    const role=e.target.value; if(!role) return;
    state.user.role=role;
    state.view=role==="customer"?"track":role==="courier"?"tasks":"overview";
    render();
  });

  // ── Logout ──
  document.querySelector("#logoutBtn")?.addEventListener("click",async()=>{
    await addAuditLog("LOGOUT","","User logged out");
    db.auth.signOut();
    localStorage.removeItem("nukhba_session");
    if(realtimeChannel){ db.removeChannel(realtimeChannel); realtimeChannel=null; }
    setState({user:null,view:"overview",query:"",authMode:"login"});
  });

  // ── Search ──
  const si=document.querySelector("#searchInput");
  if(si){ let t; si.addEventListener("input",e=>{ clearTimeout(t); t=setTimeout(()=>{state.query=e.target.value;render();document.querySelector("#searchInput")?.focus();},250); }); }

  // ── User search ──
  const ui=document.querySelector("#userSearchInput");
  if(ui){ let t; ui.addEventListener("input",e=>{ clearTimeout(t); t=setTimeout(()=>{state.userFilter=e.target.value;render();document.querySelector("#userSearchInput")?.focus();},250); }); }

  // ── Audit search ──
  const ai=document.querySelector("#auditSearchInput");
  if(ai){ let t; ai.addEventListener("input",e=>{ clearTimeout(t); t=setTimeout(()=>{state.auditFilter=e.target.value;loadAuditLogs();},300); }); }

  // ── Open detail ──
  document.querySelectorAll("[data-open]").forEach(btn=>{
    btn.addEventListener("click",()=>setState({selectedShipment:btn.dataset.open}));
  });

  // ── New shipment ──
  document.querySelector("#newShipmentBtn")?.addEventListener("click",openNewShipmentModal);

  // ── Add user ──
  document.querySelector("#addUserBtn")?.addEventListener("click",openAddUserModal);

  // ── Scanner ──
  document.querySelector("#openScanner")?.addEventListener("click",openQRScanner);

  // ── Notifications ──
  document.querySelector("#toggleNotif")?.addEventListener("click",()=>{
    const panel=document.querySelector("#notifPanel");
    if(!panel) return;
    const open=panel.style.display!=="none";
    panel.style.display=open?"none":"block";
    if(!open){ notifications.forEach(n=>n.read=true); document.querySelector(".notif-badge")?.remove(); }
  });

  document.querySelector("#clearNotif")?.addEventListener("click",async()=>{
    notifications=[];
    try{ await db.from("notifications").delete().neq("id","00000000-0000-0000-0000-000000000000"); }catch(e){}
    render();
  });
}

// ══════════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════════
function openQRScanner() {
  const modal=document.createElement("div");
  modal.className="shipment-modal";
  modal.innerHTML=`
    <div class="shipment-modal-box">
      <h2>📷 QR Scanner</h2>
      <div id="reader" style="width:100%;"></div>
      <button id="manualTrackBtn" class="ghost-btn" style="margin-top:10px;">Enter code manually</button>
      <button id="closeScanner" class="ghost-btn">Close</button>
    </div>`;
  document.body.appendChild(modal);
  document.querySelector("#manualTrackBtn").onclick=()=>{
    const code=prompt("Enter shipment code:");
    if(code) location.href=`${location.origin}${location.pathname}?track=${code}`;
  };
  let scanner;
  try {
    scanner=new Html5Qrcode("reader");
    scanner.start({facingMode:"environment"},{fps:10,qrbox:250},
      txt=>{scanner.stop();modal.remove();location.href=txt;}).catch(()=>{});
  } catch(e){}
  document.querySelector("#closeScanner").onclick=async()=>{
    try{if(scanner)await scanner.stop();}catch(e){}
    modal.remove();
  };
}

function openNewShipmentModal() {
  const modal=document.createElement("div");
  modal.className="shipment-modal";
  modal.innerHTML=`
    <div class="shipment-modal-box large">
      <h2>📦 New Shipment</h2>
      <div class="form-grid">
        <input id="shipmentCodeInput" placeholder="Shipment Code (e.g. ANE-001) *" style="font-weight:bold;"/>
        <input id="customerName"      placeholder="Customer Name *"/>
        <input id="customerPhone"     placeholder="Customer Phone 1 *" type="tel"/>
        <input id="customerPhone2"    placeholder="Customer Phone 2 (optional)" type="tel"/>
        <input id="shipmentAmount"    type="number" placeholder="Order Value (EGP) *"/>
        <input id="deliveryFeeInput"  type="number" placeholder="Delivery Fee" value="60"/>
        <select id="governorate"><option value="">Loading governorates...</option></select>
        <select id="center"><option value="">Select district</option></select>
        <input id="street"    placeholder="Street name"/>
        <input id="building"  placeholder="Building number"/>
        <input id="floor"     placeholder="Floor"/>
        <input id="apartment" placeholder="Apartment"/>
      </div>
      <textarea id="notes" placeholder="Additional notes"
                style="width:100%;margin-top:8px;padding:10px;border-radius:8px;border:1px solid var(--border,#ddd);height:60px;resize:vertical;box-sizing:border-box;"></textarea>
      <div id="saveError" style="color:#c0392b;font-size:13px;margin-top:8px;display:none;"></div>
      <div class="modal-actions">
        <button id="saveShipment" class="primary-btn">💾 Save Shipment</button>
        <button id="closeModal" class="ghost-btn">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  fetch("./cities.json").then(r=>r.json()).then(data=>{
    window.egyptData=data[2]?.data||[];
    const govNames={1:"القاهرة",2:"الجيزة",3:"الإسكندرية",4:"الدقهلية",5:"البحر الأحمر",
      6:"البحيرة",7:"الفيوم",8:"الغربية",9:"الإسماعيلية",10:"المنوفية",11:"المنيا",
      12:"القليوبية",13:"الوادي الجديد",14:"السويس",15:"أسوان",16:"أسيوط",
      17:"بني سويف",18:"بورسعيد",19:"دمياط",20:"الشرقية",21:"جنوب سيناء",22:"كفر الشيخ"};
    document.querySelector("#governorate").innerHTML=
      `<option value="">Select Governorate</option>`+
      Object.entries(govNames).map(([id,n])=>`<option value="${id}">${n}</option>`).join("");
  }).catch(()=>{ if(document.querySelector("#governorate")) document.querySelector("#governorate").innerHTML=`<option value="">Could not load</option>`; });

  document.querySelector("#governorate")?.addEventListener("change",e=>{
    const cities=(window.egyptData||[]).filter(x=>x.governorate_id==e.target.value);
    document.querySelector("#center").innerHTML=
      `<option value="">Select District</option>`+
      cities.map(c=>`<option value="${c.city_name_ar}">${c.city_name_ar}</option>`).join("");
  });

  document.querySelector("#closeModal").onclick=()=>modal.remove();

  document.querySelector("#saveShipment").onclick=async()=>{
    const code      = document.querySelector("#shipmentCodeInput").value.trim();
    const custName  = document.querySelector("#customerName").value.trim();
    const custPhone = document.querySelector("#customerPhone").value.trim();
    const custPhone2= document.querySelector("#customerPhone2").value.trim();
    const amount    = Number(document.querySelector("#shipmentAmount").value)||0;
    const fee       = Number(document.querySelector("#deliveryFeeInput").value)||60;
    const center    = document.querySelector("#center").value;
    const street    = document.querySelector("#street").value.trim();
    const building  = document.querySelector("#building").value.trim();
    const floor     = document.querySelector("#floor").value.trim();
    const apartment = document.querySelector("#apartment").value.trim();
    const notes     = document.querySelector("#notes").value.trim();
    const errEl     = document.querySelector("#saveError");
    const btn       = document.querySelector("#saveShipment");

    if (!code||!custName||!custPhone||!amount) {
      errEl.style.display="block";
      errEl.textContent="Required: Shipment Code, Customer Name, Phone, Amount";
      return;
    }

    const address=[center,street?`Street: ${street}`:"",
      building?`Bldg: ${building}`:"",floor?`Floor: ${floor}`:"",
      apartment?`Apt: ${apartment}`:""].filter(Boolean).join(" - ");

    btn.disabled=true; btn.textContent="Saving...";

    const {error}=await db.from("shipments").insert([{
      shipment_code:   code,
      customer_name:   custName,
      customer_phone:  custPhone,
      customer_phone2: custPhone2||null,
      address,
      amount,
      delivery_fee:    fee,
      status:          "created",
      eta:             "Pending",
      merchant_id:     state.user.role==="merchant"?state.user.id:null,
      merchant_name:   state.user.role==="merchant"?state.user.name:null,
      merchant_phone:  state.user.role==="merchant"?state.user.phone:null,
      notes
    }]);

    if (error) {
      errEl.style.display="block";
      errEl.textContent=error.code==="23505"?"Shipment code already exists":"Error: "+error.message;
      btn.disabled=false; btn.textContent="💾 Save Shipment";
      return;
    }

    await addTimelineEntry(code,"Shipment Created");
    await addNotification(`New shipment: ${code} — ${custName}`,"admin");
    await addAuditLog("CREATE_SHIPMENT", code, `Created by ${state.user.name} for ${custName}`);

    modal.remove();
    await loadShipments();
    showToast(`Shipment ${code} created successfully`);
  };
}

function openAddUserModal() {
  const modal=document.createElement("div");
  modal.className="shipment-modal";
  modal.innerHTML=`
    <div class="shipment-modal-box">
      <h2>👤 New User</h2>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">
        <input id="newUserName"     placeholder="Full Name *" style="padding:10px;border-radius:8px;border:1px solid var(--border,#ddd);"/>
        <input id="newUserEmail"    placeholder="Email *" type="email" style="padding:10px;border-radius:8px;border:1px solid var(--border,#ddd);"/>
        <input id="newUserPassword" placeholder="Password (min 6 chars) *" type="password" style="padding:10px;border-radius:8px;border:1px solid var(--border,#ddd);"/>
        <input id="newUserPhone"    placeholder="Phone (optional)" style="padding:10px;border-radius:8px;border:1px solid var(--border,#ddd);"/>
        <select id="newUserRole" style="padding:10px;border-radius:8px;border:1px solid var(--border,#ddd);">
          <option value="merchant">Merchant</option>
          <option value="courier">Courier</option>
          <option value="customer">Customer</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div id="userSaveError" style="color:#c0392b;font-size:13px;margin-top:8px;display:none;"></div>
      <div class="modal-actions">
        <button id="saveUserBtn" class="primary-btn">Save</button>
        <button id="closeUserModal" class="ghost-btn">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.querySelector("#closeUserModal").onclick=()=>modal.remove();
  document.querySelector("#saveUserBtn").onclick=async()=>{
    const name    =document.querySelector("#newUserName").value.trim();
    const email   =document.querySelector("#newUserEmail").value.trim();
    const password=document.querySelector("#newUserPassword").value;
    const phone   =document.querySelector("#newUserPhone").value.trim();
    const role    =document.querySelector("#newUserRole").value;
    const errEl   =document.querySelector("#userSaveError");
    const btn     =document.querySelector("#saveUserBtn");
    if(!name||!email||!password){errEl.style.display="block";errEl.textContent="Fill all required fields";return;}
    if(password.length<6){errEl.style.display="block";errEl.textContent="Password must be at least 6 characters";return;}
    btn.disabled=true;btn.textContent="Creating...";
    const{data,error}=await db.auth.signUp({email,password,options:{data:{full_name:name,role,phone}}});
    if(error){
      errEl.style.display="block";
      errEl.textContent=error.message.includes("already registered")?"Email already registered":"Error: "+error.message;
      btn.disabled=false;btn.textContent="Save";return;
    }
    const{error:profErr}=await db.from("profiles").upsert([{id:data.user.id,full_name:name,email,phone,role}]);
    if(profErr) console.warn("Profile save failed:",profErr.message);

    await addAuditLog("CREATE_USER", data.user.id, `Admin created ${role}: ${email}`);

    users.push({id:data.user.id,name,email,phone,role,createdAt:new Date().toLocaleDateString("ar-EG"),balance:0});
    modal.remove();
    render();
    showToast(`User ${name} created as ${roleName(role)}`);
  };
}

window.openEditUserModal = (id) => {
  const u = users.find(x=>x.id===id); if(!u) return;
  const modal=document.createElement("div");
  modal.className="shipment-modal";
  modal.innerHTML=`
    <div class="shipment-modal-box">
      <h2>✏️ Edit User</h2>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">
        <input id="editUserName"  value="${escapeHtml(u.name)}"  placeholder="Full Name" style="padding:10px;border-radius:8px;border:1px solid var(--border,#ddd);"/>
        <input id="editUserPhone" value="${escapeHtml(u.phone||"")}" placeholder="Phone" style="padding:10px;border-radius:8px;border:1px solid var(--border,#ddd);"/>
        <select id="editUserRole" style="padding:10px;border-radius:8px;border:1px solid var(--border,#ddd);">
          ${["admin","merchant","courier","customer"].map(r=>`<option value="${r}" ${u.role===r?"selected":""}>${roleName(r)}</option>`).join("")}
        </select>
        <input id="editUserPassword" placeholder="New password (leave blank to keep)" type="password" style="padding:10px;border-radius:8px;border:1px solid var(--border,#ddd);"/>
      </div>
      <div id="editUserError" style="color:#c0392b;font-size:13px;margin-top:8px;display:none;"></div>
      <div class="modal-actions">
        <button id="saveEditUser" class="primary-btn">Save Changes</button>
        <button id="closeEditUser" class="ghost-btn">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.querySelector("#closeEditUser").onclick=()=>modal.remove();
  document.querySelector("#saveEditUser").onclick=async()=>{
    const name     =document.querySelector("#editUserName").value.trim();
    const phone    =document.querySelector("#editUserPhone").value.trim();
    const role     =document.querySelector("#editUserRole").value;
    const password =document.querySelector("#editUserPassword").value;
    const errEl    =document.querySelector("#editUserError");
    const btn      =document.querySelector("#saveEditUser");
    if(!name){errEl.style.display="block";errEl.textContent="Name is required";return;}
    btn.disabled=true;btn.textContent="Saving...";
    const{error}=await db.from("profiles").update({full_name:name,phone,role}).eq("id",id);
    if(error){errEl.style.display="block";errEl.textContent="Error: "+error.message;btn.disabled=false;btn.textContent="Save Changes";return;}
    if(password&&password.length>=6){
      // password reset requires service_role — show instruction instead
      showToast("Profile updated. To reset password, use Supabase Auth dashboard.","info");
    }
    await addAuditLog("EDIT_USER", id, `Updated profile: name=${name}, role=${role}`);
    const idx=users.findIndex(x=>x.id===id);
    if(idx>=0) users[idx]={...users[idx],name,phone,role};
    modal.remove(); render();
    showToast(`User ${name} updated`);
  };
};

// ══════════════════════════════════════════════════════════
// GLOBAL WINDOW FUNCTIONS
// ══════════════════════════════════════════════════════════
window.manualTrackShipment = () => {
  const code=prompt("Enter shipment code:");
  if(code) location.href=`${location.origin}${location.pathname}?track=${encodeURIComponent(code.trim())}`;
};

window.updateShipmentStatus = async (id, status) => {
  const s=shipments.find(x=>x.id===id); if(!s) return;
  s.status=status;
  if(status==="delivered") s.eta="Delivered";

  const{error}=await db.from("shipments").update({status,eta:s.eta}).eq("shipment_code",id);
  if(error){showToast("Update failed: "+error.message,"error");return;}

  await addTimelineEntry(id, statusMeta[status]?.ar||status);
  await addNotification(`Shipment ${id} → ${statusMeta[status]?.ar||status}`, "admin");
  await addAuditLog("UPDATE_STATUS", id, `Status changed to ${status} by ${state.user?.name}`);

  if (status==="delivered") {
    sendPushNotification("✅ Delivered", `Shipment ${id} delivered to ${s.customerName}`);
    if(confirm("Send WhatsApp notification to customer?")) {
      const msg=`مرحبًا ${s.customerName}\n\nشحنتك رقم: ${s.id}\nالحالة: ${statusMeta[status]?.ar||status}\n\nالنخبة للشحن السريع`;
      window.open(`https://wa.me/2${s.customerPhone}?text=${encodeURIComponent(msg)}`);
    }
  }
  render();
};

window.assignCourier = async (id) => {
  const courierId=document.querySelector("#assignCourier")?.value;
  if(!courierId){showToast("Please select a courier","error");return;}
  const s=shipments.find(x=>x.id===id); if(!s) return;

  const{error}=await db.from("shipments").update({courier_id:courierId}).eq("shipment_code",id);
  if(error){showToast("Assignment failed: "+error.message,"error");return;}

  s.courierId=courierId;
  const courierName=users.find(u=>u.id===courierId)?.name||courierId;
  await addTimelineEntry(id, `Assigned to courier: ${courierName}`);
  await addNotification(`Courier ${courierName} assigned to ${id}`,"courier");
  await addAuditLog("ASSIGN_COURIER", id, `Assigned ${courierName} to shipment ${id}`);

  sendPushNotification("📦 New Assignment", `Shipment ${id} assigned to you`);
  showToast(`Courier ${courierName} assigned`);
  render();
};

window.uploadPOD = async (id, inputId) => {
  const file=document.querySelector(`#${CSS.escape(inputId)}`)?.files[0];
  if(!file){showToast("Select an image first","error");return;}
  if(file.size>5*1024*1024){showToast("Max image size is 5MB","error");return;}
  try {
    const ext=file.name.split(".").pop()||"jpg";
    const fileName=`pod_${id}_${Date.now()}.${ext}`;
    const{error:upErr}=await db.storage.from("pod-images").upload(fileName,file,{upsert:true});
    if(upErr) throw upErr;
    const{data:urlData}=db.storage.from("pod-images").getPublicUrl(fileName);
    const publicUrl=urlData.publicUrl;
    const{error:updErr}=await db.from("shipments").update({pod_url:publicUrl}).eq("shipment_code",id);
    if(updErr) throw updErr;
    const s=shipments.find(x=>x.id===id);
    if(s) s.podUrl=publicUrl;
    await addTimelineEntry(id,"Proof of Delivery uploaded");
    await addAuditLog("UPLOAD_POD", id, `POD uploaded by ${state.user?.name}`);
    showToast("Proof of delivery uploaded successfully");
    render();
  } catch(err) { showToast("Upload failed: "+err.message,"error"); }
};

window.setStatusFilter = s=>{ state.statusFilter=s; render(); };

window.toggleSuspendUser = async (id) => {
  const u=users.find(x=>x.id===id); if(!u) return;
  const newStatus=!u.suspended;
  const{error}=await db.from("profiles").update({suspended:newStatus}).eq("id",id);
  if(error){showToast("Failed to update user status","error");return;}
  u.suspended=newStatus;
  await addAuditLog(newStatus?"SUSPEND_USER":"ACTIVATE_USER", id, `${state.user?.name} ${newStatus?"suspended":"activated"} user ${u.email}`);
  showToast(`User ${u.name} ${newStatus?"suspended":"activated"}`);
  render();
};

window.deleteUser = async (id) => {
  const u=users.find(x=>x.id===id); if(!u) return;
  if(!confirm(`Delete user ${u.name}? This cannot be undone.`)) return;
  const{error}=await db.from("profiles").delete().eq("id",id);
  if(error){showToast("Delete failed: "+error.message,"error");return;}
  await addAuditLog("DELETE_USER", id, `${state.user?.name} deleted user ${u.email}`);
  users=users.filter(x=>x.id!==id);
  showToast(`User ${u.name} deleted`,"info");
  render();
};

window.exportShipmentsExcel = () => {
  if(!can("export_excel")){showToast("Access denied","error");return;}
  const data=visibleShipments().map(s=>({
    "Shipment Code":  s.id,
    "Customer":       s.customerName,
    "Phone 1":        s.customerPhone,
    "Phone 2":        s.customerPhone2||"",
    "Address":        s.address,
    "Status":         statusMeta[s.status]?.ar||s.status,
    "Amount (EGP)":   s.amount,
    "Delivery Fee":   s.deliveryFee,
    "ETA":            s.eta,
    "Merchant":       s.merchantName||"",
    "Merchant Phone": s.merchantPhone||"",
    "POD":            s.podUrl||"None"
  }));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Shipments");
  XLSX.writeFile(wb,`nukhba_${new Date().toLocaleDateString("en-GB").replace(/\//g,"-")}.xlsx`);
  addAuditLog("EXPORT_EXCEL","",`Exported ${data.length} shipments`);
};

window.printShipment = async id => {
  if(!can("print_shipment")){showToast("Access denied","error");return;}
  const s=shipments.find(x=>x.id===id); if(!s) return;
  const label=document.createElement("div");
  label.style.cssText="width:700px;padding:30px;background:#fff;direction:rtl;font-family:Arial;position:fixed;top:-9999px;left:0;z-index:-1;";
  label.innerHTML=`
    <div style="border:2px solid #000;padding:20px;border-radius:14px;">
      <h1 style="text-align:center;margin-bottom:20px;">النخبة إكسبريس</h1>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <p><b>رقم الشحنة:</b> ${escapeHtml(s.id)}</p>
          <p><b>العميل:</b> ${escapeHtml(s.customerName)}</p>
          <p><b>الهاتف:</b> ${escapeHtml(s.customerPhone)}</p>
          ${s.customerPhone2?`<p><b>هاتف 2:</b> ${escapeHtml(s.customerPhone2)}</p>`:""}
          <p><b>المبلغ:</b> ${s.amount} جنيه</p>
          <p><b>رسوم الشحن:</b> ${s.deliveryFee} جنيه</p>
          <p><b>العنوان:</b> ${escapeHtml(s.address)}</p>
          ${s.merchantName?`<p><b>التاجر:</b> ${escapeHtml(s.merchantName)}</p>`:""}
        </div>
        <canvas id="printQR"></canvas>
      </div>
    </div>`;
  document.body.appendChild(label);
  await QRCode.toCanvas(document.querySelector("#printQR"),
    `${location.origin}${location.pathname}?track=${s.id}`,{width:150});
  const canvas=await html2canvas(label);
  const{jsPDF}=window.jspdf;
  const pdf=new jsPDF("p","mm","a4");
  pdf.addImage(canvas.toDataURL("image/png"),"PNG",10,10,190,130);
  pdf.save(`${s.id}.pdf`);
  label.remove();
  addAuditLog("PRINT_SHIPMENT", s.id, `Label printed by ${state.user?.name}`);
};

// ══════════════════════════════════════════════════════════
// SUPABASE DATA FUNCTIONS
// ══════════════════════════════════════════════════════════
async function addTimelineEntry(shipmentCode, event) {
  try { await db.from("shipment_timeline").insert([{shipment_code:shipmentCode,event}]); }
  catch(e){ console.warn("Timeline insert failed:",e.message); }
}

async function loadTimeline(shipmentCode) {
  const el=document.querySelector(`#timeline-${shipmentCode}`);
  if(!el) return;
  try {
    const{data,error}=await db.from("shipment_timeline")
      .select("*").eq("shipment_code",shipmentCode).order("created_at",{ascending:true});
    if(error) throw error;
    if(!data?.length){
      el.innerHTML=`<h4>Shipment Log</h4><p style="color:#888;font-size:13px;">No events yet</p>`;
      return;
    }
    el.innerHTML=`
      <h4>Shipment Log</h4>
      ${data.map(e=>`
        <div class="timeline-item">
          <span class="tl-dot"></span>
          <div>
            <b>${escapeHtml(e.event)}</b>
            <small>${new Date(e.created_at).toLocaleString("ar-EG")}</small>
          </div>
        </div>`).join("")}`;
  } catch(e) {
    el.innerHTML=`<h4>Shipment Log</h4><p style="color:#888;font-size:13px;">Could not load log</p>`;
  }
}

async function addNotification(text, role="admin") {
  try {
    await db.from("notifications").insert([{text,role}]);
    notifications.unshift({text,role,time:new Date().toLocaleTimeString("ar-EG"),read:false});
  } catch(e){ console.warn("Notification insert failed:",e.message); }
}

async function loadNotifications() {
  try {
    const role=state.user?.role||"customer";
    if(role==="customer"){notifications=[];return;}
    let query=db.from("notifications").select("*").order("created_at",{ascending:false}).limit(20);
    if(role==="courier")       query=query.eq("role","courier");
    else if(role==="merchant") query=query.in("role",["merchant","admin"]);
    const{data}=await query;
    if(data) notifications=data.map(n=>({
      text:n.text,role:n.role,
      time:new Date(n.created_at).toLocaleTimeString("ar-EG"),read:false
    }));
  } catch(e){ console.warn("Load notifications failed:",e.message); }
}

async function loadUsers() {
  try {
    const{data,error}=await db.from("profiles").select("*").order("created_at",{ascending:false});
    if(error) throw error;
    if(data&&data.length) {
      users=data.map(u=>({
        id:        u.id,
        name:      u.full_name||u.email||"—",
        email:     u.email||"—",
        phone:     u.phone||"—",
        role:      u.role||"customer",
        suspended: u.suspended||false,
        createdAt: u.created_at?new Date(u.created_at).toLocaleDateString("ar-EG"):"—",
        balance:   0
      }));
    }
  } catch(e){ console.warn("loadUsers failed:",e.message); users=[]; }
}

async function loadAuditLogs() {
  try {
    let query=db.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(200);
    const{data,error}=await query;
    if(error) throw error;
    renderAuditTable(data||[]);
  } catch(e){
    const container=document.querySelector("#auditTableContainer");
    if(container) container.innerHTML=`<p style="color:#c0392b;padding:1rem;">Could not load audit logs: ${e.message}</p>`;
  }
}

async function loadShipments() {
  try {
    const{data,error}=await db.from("shipments").select("*").order("created_at",{ascending:false});
    if(error) throw error;
    shipments=data.map(mapShipment);
    if(!state.selectedShipment&&shipments.length) state.selectedShipment=shipments[0].id;
    render();
  } catch(err) {
    console.error("loadShipments error:",err);
    const app=document.querySelector("#app");
    if(app){
      const bar=document.createElement("div");
      bar.style.cssText="background:#fef2f2;color:#991b1b;padding:10px;font-size:13px;text-align:center;";
      bar.textContent="Could not load shipments — "+err.message;
      app.prepend(bar);
    }
    render();
  }
}

// ─── PWA ──────────────────────────────────────────────────
if("serviceWorker"in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

// ─── START ────────────────────────────────────────────────
(async()=>{
  await loadNotifications();
  await loadShipments();
  if(state.user?.role==="admin"){ await loadUsers(); startRealtime(); }
  await requestPushPermission();
})();
