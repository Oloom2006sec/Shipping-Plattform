// ══════════════════════════════════════════════════
// AL-NUKHBA EXPRESS — app.js
// ══════════════════════════════════════════════════

const SUPABASE_URL = "https://urktddxiyzwsilddamci.supabase.co";
const SUPABASE_KEY = "sb_publishable_-0wKJXXI18TuHK7pe-dKYw_HWyjH79u";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Local demo users (UI only — Auth في Supabase) ───
let users = JSON.parse(localStorage.getItem("nukhba_users")) || [
  { id: "u1", name: "أحمد الشرقاوي", role: "merchant", phone: "01000000001", balance: 18450 },
  { id: "u2", name: "منى علي",        role: "courier",  phone: "01000000002", balance: 3250  },
  { id: "u3", name: "كريم محمود",     role: "customer", phone: "01000000003", balance: 0     },
  { id: "u4", name: "مدير التشغيل",   role: "admin",    phone: "01000000000", balance: 0     }
];

let shipments     = [];
let notifications = [];

// ─── Status meta ─────────────────────────────────
const statusMeta = {
  created:          { label: "تم إنشاء الشحنة",  tone: "info"    },
  received:         { label: "تم استلام الشحنة", tone: "warning" },
  warehouse:        { label: "في المخزن",          tone: "warning" },
  hub:              { label: "مركز الفرز",         tone: "primary" },
  out_for_delivery: { label: "خرجت للتسليم",      tone: "primary" },
  delivered:        { label: "تم التسليم",         tone: "success" },
  returned:         { label: "مرتجع",              tone: "danger"  }
};

// ─── Nav per role ────────────────────────────────
const navByRole = {
  admin:    ["overview","shipments","tasks","accounts","reports","users","track"],
  merchant: ["overview","shipments","accounts"],
  courier:  ["overview","tasks","accounts"],
  customer: ["track","accounts"]
};

const labels = {
  overview:"الرئيسية", shipments:"الشحنات", tasks:"المهام",
  accounts:"الحساب",  reports:"التقارير", users:"المستخدمين", track:"تتبع"
};

// ─── RBAC ────────────────────────────────────────
const permissions = {
  admin:    ["create_shipment","edit_shipment","delete_shipment","assign_courier",
             "view_reports","manage_users","export_excel","change_status","view_all","print_shipment"],
  merchant: ["create_shipment","view_own","track","view_accounts","print_shipment"],
  courier:  ["view_assigned","change_status","upload_pod","navigation"],
  customer: ["track"]
};

function can(p) { return !!permissions[state.user?.role]?.includes(p); }

// ─── State ───────────────────────────────────────
let state = {
  user:             JSON.parse(localStorage.getItem("nukhba_session") || "null"),
  view:             "overview",
  query:            "",
  statusFilter:     "all",
  selectedShipment: null
};

// ─── Helpers ─────────────────────────────────────
const money = v => new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(v);

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
    bell:   "M12 2a7 7 0 0 1 7 7v4l2 2v1H3v-1l2-2V9a7 7 0 0 1 7-7Zm0 20a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2Z"
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d[name]}"/></svg>`;
}

function roleName(r) {
  return {admin:"إدارة",merchant:"تاجر",courier:"مندوب",customer:"عميل"}[r] || r;
}

function setState(patch) { state = {...state,...patch}; render(); }

function determineRole(email) {
  if (!email) return "customer";
  const e = email.toLowerCase();
  if (e.startsWith("admin"))    return "admin";
  if (e.startsWith("merchant")) return "merchant";
  if (e.startsWith("courier"))  return "courier";
  return "customer";
}

// ─── Visible shipments ───────────────────────────
function visibleShipments() {
  let list = [...shipments];
  if (state.user?.role === "courier")  list = list.filter(s => s.courierId === state.user?.id);
  if (state.user?.role === "merchant") list = list.filter(s => s.merchantId === state.user?.id);
  return list.filter(s => {
    const txt = `${s.id} ${s.customerName} ${s.customerPhone} ${s.address}`.toLowerCase();
    return txt.includes(state.query.trim().toLowerCase()) &&
           (state.statusFilter === "all" || s.status === state.statusFilter);
  });
}

function stats(list) {
  return [
    { label:"كل الشحنات",    value:list.length,                                                              icon:"box"    },
    { label:"خارج للتسليم",  value:list.filter(s=>s.status==="out_for_delivery").length,                    icon:"truck"  },
    { label:"تم التسليم",    value:list.filter(s=>s.status==="delivered").length,                           icon:"chart"  },
    { label:"إجمالي المبالغ",value:money(list.reduce((sum,s)=>sum+(s.amount||0),0)),                        icon:"wallet" }
  ];
}

// ══════════════════════════════════════════════════
// VIEWS
// ══════════════════════════════════════════════════

function loginScreen() {
  return `
    <main class="login-shell">
      <section class="login-panel">
        <div class="brand-mark">${icon("truck")}</div>
        <h1>النخبة للشحن السريع</h1>
        <p>منصة متكاملة لإدارة الشحن والتوصيل والتتبع.</p>
        <form id="loginForm" class="login-form">
          <label>البريد الإلكتروني
            <input name="email" type="email" value="merchant@nukhba.com" autocomplete="username"/>
          </label>
          <label>كلمة المرور
            <input name="password" type="password" value="123456" autocomplete="current-password"/>
          </label>
          <div id="loginError" class="login-error" style="display:none;color:#c0392b;font-size:13px;margin-top:4px;"></div>
          <button class="primary-btn" type="submit">${icon("user")} دخول</button>
        </form>
        <div class="demo-users">
          <button data-demo="admin@nukhba.com">إدارة</button>
          <button data-demo="merchant@nukhba.com">تاجر</button>
          <button data-demo="courier@nukhba.com">مندوب</button>
          <button data-demo="customer@nukhba.com">عميل</button>
        </div>
      </section>
      <section class="app-preview" aria-label="ملخص">
        <div class="preview-top"><span>تحديث مباشر</span><strong>96%</strong></div>
        <div class="route-line"></div>
        <div class="preview-card"><b>ANE-54558</b><span>خارج للتسليم</span></div>
        <div class="preview-card"><b>تحصيل اليوم</b><span>${money(2100)}</span></div>
      </section>
    </main>`;
}

function shell(content) {
  const views = navByRole[state.user.role];
  const unread = notifications.filter(n => !n.read).length;
  return `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark small">${icon("truck")}</div>
          <div><strong>النخبة للشحن السريع</strong><span>لوحة الشحن</span></div>
        </div>
        <nav>
          ${views.map(v=>`<button class="${state.view===v?"active":""}" data-view="${v}">${labels[v]}</button>`).join("")}
        </nav>
        <button class="ghost-btn logout" id="logoutBtn">${icon("logout")} خروج</button>
      </aside>
      <main class="content">
        <header class="topbar">
          <div>
            ${state.user.role==="admin" ? `
              <select id="roleSwitcher" class="role-switcher">
                <option value="">تبديل الواجهة</option>
                <option value="admin">Admin</option>
                <option value="merchant">Merchant</option>
                <option value="courier">Courier</option>
                <option value="customer">Customer</option>
              </select>` : `<span class="eyebrow">${roleName(state.user.role)}</span>`}
            <h2>أهلاً، ${escapeHtml(state.user.name)}</h2>
          </div>
          <div style="display:flex;gap:12px;align-items:center;">
            <button class="ghost-btn notif-btn" id="toggleNotif" title="الإشعارات">
              ${icon("bell")}
              ${unread>0?`<span class="notif-badge">${unread}</span>`:""}
            </button>
            <div class="search-box">
              ${icon("search")}
              <input id="searchInput" value="${escapeHtml(state.query)}" placeholder="ابحث برقم الشحنة أو العميل"/>
            </div>
          </div>
        </header>
        <div id="notifPanel" class="notif-panel" style="display:none;">
          <div class="notif-header">
            <h4>الإشعارات</h4>
            <button class="link-btn" id="clearNotif">مسح الكل</button>
          </div>
          ${notifications.length
            ? notifications.slice(0,10).map(n=>`
                <div class="notification-item ${n.read?"":"unread"}">
                  <span>${escapeHtml(n.text)}</span>
                  <small>${escapeHtml(n.time)}</small>
                </div>`).join("")
            : `<p style="padding:1rem;color:#888;text-align:center;">لا توجد إشعارات</p>`}
        </div>
        ${content}
      </main>
    </div>`;
}

// ─── Overview ────────────────────────────────────
function overview() {
  const list = visibleShipments();
  return `
    <section class="stats-grid">
      ${stats(list).map(item=>`
        <article class="stat">
          <div>${icon(item.icon)}</div>
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </article>`).join("")}
    </section>
    <section class="work-grid">
      <div class="panel wide">
        <div class="section-head">
          <h3>آخر الشحنات</h3>
          <div style="display:flex;gap:8px;">
            <button class="ghost-btn" id="openScanner">📷 Scan QR</button>
            ${can("create_shipment")?`<button class="primary-btn compact" id="newShipmentBtn">${icon("plus")} شحنة جديدة</button>`:""}
          </div>
        </div>
        ${shipmentTable(list.slice(0,6))}
      </div>
      <div class="panel">
        <h3>تنبيهات التشغيل</h3>
        <div class="alert-list">
          <div><b>${list.filter(s=>s.status==="created").length}</b><span>شحنات جديدة</span></div>
          <div><b>${list.filter(s=>s.status==="returned").length}</b><span>مرتجعات</span></div>
          <div><b>${list.filter(s=>s.status==="delivered").length}</b><span>تم تسليمها</span></div>
        </div>
        <section class="panel charts-panel" style="margin-top:16px;">
          <div class="chart-box"><canvas id="statusChart"></canvas></div>
        </section>
      </div>
    </section>`;
}

// ─── Shipment Table ──────────────────────────────
function shipmentTable(list) {
  if (!list.length) return `<p style="padding:1rem;color:#888">لا توجد شحنات</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>الشحنة</th><th>العميل</th><th>العنوان</th><th>الحالة</th><th>المبلغ</th><th>الإجراءات</th></tr>
        </thead>
        <tbody>
          ${list.map(s=>`
            <tr>
              <td><b>${escapeHtml(s.id)}</b><br><small>${escapeHtml(s.createdAt)}</small></td>
              <td>${escapeHtml(s.customerName)}<br><small>${escapeHtml(s.customerPhone)}</small></td>
              <td>${escapeHtml(s.address)}</td>
              <td><span class="badge ${statusMeta[s.status]?.tone||"info"}">${statusMeta[s.status]?.label||s.status}</span></td>
              <td>${money(s.amount)}</td>
              <td>
                <div class="shipment-actions">
                  <button class="link-btn" data-open="${escapeHtml(s.id)}">عرض</button>
                  ${can("print_shipment")?`<button class="link-btn" onclick="printShipment('${escapeHtml(s.id)}')">طباعة</button>`:""}
                  <div class="qr-box"><canvas id="qr-${escapeHtml(s.id)}"></canvas></div>
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// ─── Shipments View ──────────────────────────────
function shipmentsView() {
  const selected = shipments.find(s=>s.id===state.selectedShipment) || visibleShipments()[0] || null;
  return `
    <section class="panel">
      <div class="section-head">
        <h3>إدارة الشحنات</h3>
        <div class="filter-row">
          ${["all","created","received","warehouse","hub","out_for_delivery","delivered","returned"].map(st=>`
            <button onclick="setStatusFilter('${st}')" class="ghost-btn ${state.statusFilter===st?"active":""}">
              ${st==="all"?"الكل":statusMeta[st]?.label||st}
            </button>`).join("")}
        </div>
        <div style="display:flex;gap:10px;">
          <button class="ghost-btn" onclick="manualTrackShipment()">📦 تتبع</button>
          ${can("export_excel")?`<button class="ghost-btn" onclick="exportShipmentsExcel()">📊 Excel</button>`:""}
          ${can("create_shipment")?`<button class="primary-btn compact" id="newShipmentBtn">${icon("plus")} إضافة</button>`:""}
        </div>
      </div>
      ${shipmentTable(visibleShipments())}
    </section>
    ${selected?detailsPanel(selected):""}`;
}

// ─── Tasks View ──────────────────────────────────
function tasksView() {
  const list = visibleShipments().filter(s=>s.status!=="delivered"&&s.status!=="returned");
  if (!list.length) return `<section class="panel"><p style="padding:1rem">لا توجد مهام حالية</p></section>`;
  return `
    <section class="task-list">
      ${list.map(s=>`
        <article class="task-card">
          <div>
            <span class="badge ${statusMeta[s.status]?.tone||"info"}">${statusMeta[s.status]?.label||s.status}</span>
            <h3>${escapeHtml(s.customerName)}</h3>
            <p>${escapeHtml(s.address)}</p>
            <small>${escapeHtml(s.customerPhone)}</small>
          </div>
          <div class="task-actions">
            <a class="ghost-btn" href="tel:${escapeHtml(s.customerPhone)}">📞 اتصال</a>
            <a class="ghost-btn" target="_blank"
               href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}">
              🗺 ملاحة
            </a>
            ${can("upload_pod")?`
              <label class="ghost-btn" style="cursor:pointer;">
                📷 رفع إثبات
                <input type="file" id="pod-${escapeHtml(s.id)}" accept="image/*" style="display:none"
                       onchange="uploadPOD('${escapeHtml(s.id)}','pod-${escapeHtml(s.id)}')"/>
              </label>`:""
            }
            ${can("change_status")?`
              <button class="primary-btn compact" onclick="updateShipmentStatus('${escapeHtml(s.id)}','delivered')">
                ✅ تم التسليم
              </button>
              <button class="ghost-btn" style="color:#c0392b"
                      onclick="updateShipmentStatus('${escapeHtml(s.id)}','returned')">
                ↩ مرتجع
              </button>`:""
            }
          </div>
          ${s.podUrl?`<img src="${escapeHtml(s.podUrl)}" style="width:100%;max-width:200px;border-radius:8px;margin-top:8px;"/>`:""
          }
        </article>`).join("")}
    </section>`;
}

// ─── Details Panel ───────────────────────────────
function detailsPanel(s) {
  if (!s) return "";
  const meta = statusMeta[s.status]||{label:s.status,tone:"info"};
  const couriers = users.filter(u=>u.role==="courier");
  const steps = ["created","received","warehouse","hub","out_for_delivery","delivered"];
  const currentIdx = steps.indexOf(s.status);

  return `
    <section class="panel details">
      <div class="section-head">
        <h3>${escapeHtml(s.id)}</h3>
        <span class="badge ${meta.tone}">${meta.label}</span>
      </div>

      <div class="detail-grid">
        <div><span>العميل</span><b>${escapeHtml(s.customerName)}</b></div>
        <div><span>الهاتف</span><b>${escapeHtml(s.customerPhone)}</b></div>
        <div><span>العنوان</span><b>${escapeHtml(s.address)}</b></div>
        <div><span>موعد التسليم</span><b>${escapeHtml(s.eta)||"قيد التجهيز"}</b></div>
        <div><span>قيمة الطلب</span><b>${money(s.amount)}</b></div>
        <div><span>رسوم الشحن</span><b>${money(s.deliveryFee)}</b></div>
        ${s.notes?`<div style="grid-column:1/-1"><span>ملاحظات</span><b>${escapeHtml(s.notes)}</b></div>`:""}
      </div>

      ${can("assign_courier")?`
        <div class="assign-box">
          <select id="assignCourier">
            <option value="">اختر مندوب</option>
            ${couriers.map(c=>`<option value="${escapeHtml(c.id)}" ${s.courierId===c.id?"selected":""}>${escapeHtml(c.name)}</option>`).join("")}
          </select>
          <button class="ghost-btn" onclick="assignCourier('${escapeHtml(s.id)}')">تعيين</button>
        </div>`:""}

      ${can("change_status")?`
        <div class="status-actions">
          ${["received","warehouse","hub","out_for_delivery"].map(st=>`
            <button onclick="updateShipmentStatus('${escapeHtml(s.id)}','${st}')" class="ghost-btn">
              ${statusMeta[st].label}
            </button>`).join("")}
          <button onclick="updateShipmentStatus('${escapeHtml(s.id)}','delivered')" class="primary-btn compact">✅ تم التسليم</button>
          <button onclick="updateShipmentStatus('${escapeHtml(s.id)}','returned')"  class="ghost-btn" style="color:#c0392b">↩ مرتجع</button>
        </div>`:""}

      ${can("upload_pod")?`
        <div class="pod-upload">
          <label class="ghost-btn" style="cursor:pointer;">
            📷 رفع إثبات التسليم
            <input type="file" id="podImage" accept="image/*" style="display:none"
                   onchange="uploadPOD('${escapeHtml(s.id)}','podImage')"/>
          </label>
        </div>`:""}

      ${s.podUrl?`
        <div class="pod-preview">
          <h4>إثبات التسليم</h4>
          <img src="${escapeHtml(s.podUrl)}" style="width:220px;border-radius:12px;margin-top:8px;"/>
        </div>`:""}

      <div class="tracking-progress">
        ${steps.map((step,i)=>`
          <div class="progress-step">
            <div class="progress-circle ${i<=currentIdx?"done":""}">${i<=currentIdx?"✓":i+1}</div>
            <span>${statusMeta[step]?.label||step}</span>
          </div>
          ${i<steps.length-1?`<div class="progress-line ${i<currentIdx?"done":""}"></div>`:""}`
        ).join("")}
      </div>

      <div class="timeline" id="timeline-${escapeHtml(s.id)}">
        <h4>سجل الشحنة</h4>
        <p style="color:#888;font-size:13px">جاري التحميل...</p>
      </div>
    </section>`;
}

// ─── Track View ──────────────────────────────────
function trackView() {
  const s = shipments.find(x=>x.id===state.selectedShipment);
  if (!s) return `
    <section class="panel" style="text-align:center;padding:2rem;">
      <h3>الشحنة غير موجودة</h3>
      <p style="color:#888;margin:1rem 0;">تأكد من رقم الشحنة</p>
      <button class="primary-btn" onclick="manualTrackShipment()">تتبع شحنة أخرى</button>
    </section>`;
  return `
    <section class="track-hero">
      <div>
        <span class="eyebrow">تتبع الشحنة</span>
        <h2>${escapeHtml(s.id)}</h2>
        <p>${escapeHtml(s.customerName)} — ${escapeHtml(s.address)}</p>
      </div>
      <span class="badge ${statusMeta[s.status]?.tone||"info"}">${statusMeta[s.status]?.label||s.status}</span>
    </section>
    ${detailsPanel(s)}`;
}

// ─── Accounts View ───────────────────────────────
function accountsView() {
  if (state.user.role==="customer") return `
    <section class="panel" style="text-align:center;padding:2rem;">
      <h3>حسابي</h3>
      <p style="color:#888;margin:1rem 0;">تتبع شحنتك برقم الشحنة</p>
      <button class="primary-btn" onclick="manualTrackShipment()">📦 تتبع شحنة</button>
    </section>`;

  const list      = visibleShipments();
  const delivered = list.filter(s=>s.status==="delivered");
  const revenue   = delivered.reduce((sum,s)=>sum+(s.amount||0),0);
  const fees      = delivered.reduce((sum,s)=>sum+(s.deliveryFee||0),0);
  const payable   = state.user.role==="courier"
    ? delivered.length*25+(state.user.balance||0)
    : revenue-fees+(state.user.balance||0);

  return `
    <section class="account-band">
      <div><span>الرصيد الحالي</span><strong>${money(payable)}</strong></div>
      <button class="primary-btn compact">طلب تسوية</button>
    </section>
    <section class="stats-grid two">
      <article class="stat"><div>${icon("wallet")}</div><span>تحصيلات</span><strong>${money(revenue)}</strong></article>
      <article class="stat"><div>${icon("truck")}</div><span>رسوم شحن</span><strong>${money(fees)}</strong></article>
    </section>
    <section class="panel">
      <h3>كشف الحساب</h3>
      ${shipmentTable(delivered)}
    </section>`;
}

// ─── Reports View ────────────────────────────────
function reportsView() {
  const list = visibleShipments();
  const total = list.length || 1;
  return `
    <section class="stats-grid">
      ${Object.keys(statusMeta).map(st=>`
        <article class="stat mini">
          <span>${statusMeta[st].label}</span>
          <strong>${list.filter(s=>s.status===st).length}</strong>
        </article>`).join("")}
    </section>
    <section class="panel">
      <h3>تقارير الأداء</h3>
      <div class="feature-list">
        <div>إجمالي الشحنات: <b>${list.length}</b></div>
        <div>نسبة التسليم: <b>${Math.round(list.filter(s=>s.status==="delivered").length/total*100)}%</b></div>
        <div>نسبة المرتجع: <b>${Math.round(list.filter(s=>s.status==="returned").length/total*100)}%</b></div>
        <div>إجمالي المبالغ: <b>${money(list.reduce((s,x)=>s+(x.amount||0),0))}</b></div>
      </div>
    </section>`;
}

// ─── Users View ──────────────────────────────────
function usersView() {
  if (!can("manage_users")) return `<section class="panel"><h3>غير مصرح</h3></section>`;
  return `
    <section class="panel">
      <div class="section-head">
        <h3>إدارة المستخدمين</h3>
        <button class="primary-btn compact" id="addUserBtn">${icon("plus")} مستخدم جديد</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>الاسم</th><th>الدور</th><th>الهاتف</th><th>الإجراءات</th></tr></thead>
          <tbody>
            ${users.map(u=>`
              <tr>
                <td>${escapeHtml(u.name)}</td>
                <td>${roleName(u.role)}</td>
                <td>${escapeHtml(u.phone)}</td>
                <td><button class="link-btn" onclick="deleteUser('${escapeHtml(u.id)}')">حذف</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderView() {
  const v = state.view;
  if (v==="shipments") return shipmentsView();
  if (v==="tasks")     return tasksView();
  if (v==="accounts")  return accountsView();
  if (v==="reports")   return reportsView();
  if (v==="track")     return trackView();
  if (v==="users")     return usersView();
  return overview();
}

// ══════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════
function render() {
  const params  = new URLSearchParams(window.location.search);
  const trackId = params.get("track");
  if (trackId) { state.selectedShipment=trackId; state.view="track"; if (!state.user) state.user={role:"customer",id:"guest",name:"عميل"}; }

  const app = document.querySelector("#app");
  if (!app) return;

  if (trackId || state.user) {
    app.innerHTML = state.user ? shell(renderView()) : loginScreen();
  } else {
    app.innerHTML = loginScreen();
  }

  bindEvents();

  // ─── Lazy load timeline after render ───
  const selectedShipment = shipments.find(s=>s.id===state.selectedShipment);
  if (selectedShipment) {
    loadTimeline(selectedShipment.id);
  }

  // ─── Chart ───
  setTimeout(()=>{
    const canvas = document.getElementById("statusChart");
    if (!canvas) return;
    const old = Chart.getChart(canvas);
    if (old) old.destroy();
    new Chart(canvas,{
      type:"doughnut",
      data:{
        labels:["تم التسليم","مرتجع","خرج للتسليم","في المخزن","جديد"],
        datasets:[{
          data:[
            shipments.filter(s=>s.status==="delivered").length,
            shipments.filter(s=>s.status==="returned").length,
            shipments.filter(s=>s.status==="out_for_delivery").length,
            shipments.filter(s=>s.status==="warehouse").length,
            shipments.filter(s=>s.status==="created").length,
          ],
          backgroundColor:["#22c55e","#ef4444","#3b82f6","#f59e0b","#a855f7"]
        }]
      },
      options:{responsive:true,plugins:{legend:{position:"bottom"}}}
    });
  },200);

  // ─── QR Codes ───
  setTimeout(()=>{
    visibleShipments().forEach(s=>{
      const c = document.getElementById(`qr-${s.id}`);
      if (!c) return;
      QRCode.toCanvas(c,`${location.origin}${location.pathname}?track=${s.id}`,{width:70});
    });
  },100);
}

// ══════════════════════════════════════════════════
// BIND EVENTS
// ══════════════════════════════════════════════════
function bindEvents() {

  // ── Login ──
  document.querySelector("#loginForm")?.addEventListener("submit", e=>{
    e.preventDefault();
    const fd       = new FormData(e.currentTarget);
    const email    = fd.get("email");
    const password = fd.get("password");
    const errEl    = document.querySelector("#loginError");
    const btn      = e.currentTarget.querySelector("button[type=submit]");
    btn.disabled=true; btn.textContent="جاري الدخول...";

    db.auth.signInWithPassword({email,password}).then(({data,error})=>{
      btn.disabled=false; btn.innerHTML=`${icon("user")} دخول`;
      if (error) {
        if (errEl){errEl.style.display="block";errEl.textContent="بيانات الدخول غير صحيحة";}
        e.currentTarget.classList.add("shake");
        setTimeout(()=>e.currentTarget.classList.remove("shake"),400);
        return;
      }
      const role = determineRole(data.user.email);
      const user = { id:data.user.id, name:data.user.email.split("@")[0], role, phone:data.user.email, balance:0 };
      localStorage.setItem("nukhba_session", JSON.stringify(user));
      setState({user, view: role==="customer"?"track":"overview"});
    });
  });

  // ── Demo buttons ──
  document.querySelectorAll("[data-demo]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelector("[name='email']").value    = btn.dataset.demo;
      document.querySelector("[name='password']").value = "123456";
    });
  });

  // ── Nav ──
  document.querySelectorAll("[data-view]").forEach(btn=>{
    btn.addEventListener("click",()=>setState({view:btn.dataset.view}));
  });

  // ── Role switcher ──
  document.querySelector("#roleSwitcher")?.addEventListener("change",e=>{
    const role=e.target.value; if(!role) return;
    state.user.role=role; state.view=role==="customer"?"track":"overview"; render();
  });

  // ── Logout ──
  document.querySelector("#logoutBtn")?.addEventListener("click",()=>{
    db.auth.signOut();
    localStorage.removeItem("nukhba_session");
    setState({user:null,view:"overview",query:""});
  });

  // ── Search debounced ──
  const si = document.querySelector("#searchInput");
  if (si) {
    let t;
    si.addEventListener("input",e=>{
      clearTimeout(t);
      t=setTimeout(()=>{state.query=e.target.value;render();document.querySelector("#searchInput")?.focus();},250);
    });
  }

  // ── Open detail ──
  document.querySelectorAll("[data-open]").forEach(btn=>{
    btn.addEventListener("click",()=>setState({selectedShipment:btn.dataset.open}));
  });

  // ── Deliver button ──
  document.querySelectorAll("[data-deliver]").forEach(btn=>{
    btn.addEventListener("click",()=>updateShipmentStatus(btn.dataset.deliver,"delivered"));
  });

  // ── New shipment ──
  document.querySelector("#newShipmentBtn")?.addEventListener("click", openNewShipmentModal);

  // ── Add user ──
  document.querySelector("#addUserBtn")?.addEventListener("click", openAddUserModal);

  // ── Scanner ──
  document.querySelector("#openScanner")?.addEventListener("click", openQRScanner);

  // ── Notifications toggle ──
  document.querySelector("#toggleNotif")?.addEventListener("click",()=>{
    const panel = document.querySelector("#notifPanel");
    if (!panel) return;
    const isOpen = panel.style.display!=="none";
    panel.style.display = isOpen?"none":"block";
    if (!isOpen) {
      notifications.forEach(n=>n.read=true);
      document.querySelector(".notif-badge")?.remove();
    }
  });

  // ── Clear notifications ──
  document.querySelector("#clearNotif")?.addEventListener("click",async()=>{
    notifications=[];
    await db.from("notifications").delete().neq("id","00000000-0000-0000-0000-000000000000");
    render();
  });
}

// ══════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════
function openQRScanner() {
  const modal = document.createElement("div");
  modal.className="shipment-modal";
  modal.innerHTML=`
    <div class="shipment-modal-box">
      <h2>QR Scanner</h2>
      <div id="reader"></div>
      <button id="manualTrackBtn" class="ghost-btn">إدخال كود يدوي</button>
      <button id="closeScanner"   class="ghost-btn">إغلاق</button>
    </div>`;
  document.body.appendChild(modal);

  document.querySelector("#manualTrackBtn").onclick=()=>{
    const code=prompt("أدخل كود الشحنة"); if(code) location.href=`${location.origin}${location.pathname}?track=${code}`;
  };

  let scanner;
  try {
    scanner=new Html5Qrcode("reader");
    scanner.start({facingMode:"environment"},{fps:10,qrbox:250},txt=>{scanner.stop();modal.remove();location.href=txt;}).catch(()=>{});
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
      <h2>إضافة شحنة جديدة</h2>
      <div class="form-grid">
        <input id="shipmentName"      placeholder="اسم الشحنة (وصف)"/>
        <input id="shipmentCodeInput" placeholder="كود الشحنة (مثال: ANE-001)"/>
        <input id="customerName"      placeholder="اسم العميل"/>
        <input id="customerPhone"     placeholder="رقم الموبايل"/>
        <input id="shipmentAmount"    type="number" placeholder="قيمة الشحنة (جنيه)"/>
        <input id="deliveryFeeInput"  type="number" placeholder="رسوم الشحن" value="60"/>
        <select id="governorate"><option value="">جاري تحميل المحافظات...</option></select>
        <select id="center"><option value="">اختر المركز</option></select>
        <input id="street"    placeholder="اسم الشارع"/>
        <input id="building"  placeholder="رقم العمارة"/>
        <input id="floor"     placeholder="رقم الدور"/>
        <input id="apartment" placeholder="رقم الشقة"/>
      </div>
      <textarea id="notes" placeholder="ملاحظات إضافية" style="width:100%;margin-top:8px;padding:8px;border-radius:8px;border:1px solid #ddd;"></textarea>
      <div class="modal-actions">
        <button id="saveShipment" class="primary-btn">💾 حفظ الشحنة</button>
        <button id="closeModal"   class="ghost-btn">إلغاء</button>
      </div>
      <div id="saveError" style="color:#c0392b;font-size:13px;margin-top:8px;display:none;"></div>
    </div>`;
  document.body.appendChild(modal);

  fetch("./cities.json").then(r=>r.json()).then(data=>{
    window.egyptData=data[2].data;
    const govNames={1:"القاهرة",2:"الجيزة",3:"الإسكندرية",4:"الدقهلية",5:"البحر الأحمر",6:"البحيرة",7:"الفيوم",8:"الغربية",9:"الإسماعيلية",10:"المنوفية",11:"المنيا",12:"القليوبية",13:"الوادي الجديد",14:"السويس",15:"أسوان",16:"أسيوط",17:"بني سويف",18:"بورسعيد",19:"دمياط",20:"الشرقية",21:"جنوب سيناء",22:"كفر الشيخ"};
    document.querySelector("#governorate").innerHTML=`<option value="">اختر المحافظة</option>${Object.entries(govNames).map(([id,name])=>`<option value="${id}">${name}</option>`).join("")}`;
  }).catch(()=>{ document.querySelector("#governorate").innerHTML=`<option value="">تعذر التحميل</option>`; });

  document.querySelector("#governorate").addEventListener("change",e=>{
    const cities=(window.egyptData||[]).filter(x=>x.governorate_id==e.target.value);
    document.querySelector("#center").innerHTML=`<option value="">اختر المركز</option>${cities.map(c=>`<option value="${c.city_name_ar}">${c.city_name_ar}</option>`).join("")}`;
  });

  document.querySelector("#closeModal").onclick=()=>modal.remove();

  document.querySelector("#saveShipment").onclick=async()=>{
    const name      = document.querySelector("#shipmentName").value.trim();
    const code      = document.querySelector("#shipmentCodeInput").value.trim();
    const custName  = document.querySelector("#customerName").value.trim();
    const custPhone = document.querySelector("#customerPhone").value.trim();
    const amount    = Number(document.querySelector("#shipmentAmount").value)||0;
    const fee       = Number(document.querySelector("#deliveryFeeInput").value)||60;
    const center    = document.querySelector("#center").value;
    const street    = document.querySelector("#street").value.trim();
    const building  = document.querySelector("#building").value.trim();
    const floor     = document.querySelector("#floor").value.trim();
    const apartment = document.querySelector("#apartment").value.trim();
    const notes     = document.querySelector("#notes").value.trim();
    const errEl     = document.querySelector("#saveError");

    if (!code||!custName||!custPhone) {
      errEl.style.display="block"; errEl.textContent="أكمل البيانات المطلوبة (الكود، اسم العميل، الهاتف)"; return;
    }

    const address=`${center?center+' - ':""}شارع ${street} - عمارة ${building} - دور ${floor} - شقة ${apartment}`;
    const btn=document.querySelector("#saveShipment");
    btn.disabled=true; btn.textContent="جاري الحفظ...";

    const {error}=await db.from("shipments").insert([{
      shipment_code:  code,
      customer_name:  custName,
      customer_phone: custPhone,
      address,
      amount,
      delivery_fee:   fee,
      status:         "created",
      eta:            "قيد التجهيز",
      merchant_id:    state.user.role==="merchant"?state.user.id:null,
      notes:          `${name?'اسم الشحنة: '+name+'\n':''}${notes}`
    }]);

    if (error) {
      errEl.style.display="block"; errEl.textContent="خطأ: "+error.message;
      btn.disabled=false; btn.textContent="💾 حفظ الشحنة"; return;
    }

    // إضافة timeline entry
    await addTimelineEntry(code,"تم إنشاء الشحنة");
    // إضافة notification
    await addNotification(`شحنة جديدة: ${code} للعميل ${custName}`,"admin");

    modal.remove();
    await loadShipments();
    alert("✅ تم إضافة الشحنة بنجاح");
  };
}

function openAddUserModal() {
  const modal=document.createElement("div");
  modal.className="shipment-modal";
  modal.innerHTML=`
    <div class="shipment-modal-box">
      <h2>مستخدم جديد</h2>
      <input id="newUserName"     placeholder="الاسم الكامل" style="width:100%;margin:6px 0;padding:8px;border-radius:8px;border:1px solid #ddd;"/>
      <input id="newUserPhone"    placeholder="الهاتف أو الاسم قبل @nukhba.com" style="width:100%;margin:6px 0;padding:8px;border-radius:8px;border:1px solid #ddd;"/>
      <input id="newUserPassword" placeholder="كلمة المرور" type="password" style="width:100%;margin:6px 0;padding:8px;border-radius:8px;border:1px solid #ddd;"/>
      <select id="newUserRole" style="width:100%;margin:6px 0;padding:8px;border-radius:8px;border:1px solid #ddd;">
        <option value="merchant">تاجر</option>
        <option value="courier">مندوب</option>
        <option value="customer">عميل</option>
        <option value="admin">إدارة</option>
      </select>
      <div id="userSaveError" style="color:#c0392b;font-size:13px;margin-top:4px;display:none;"></div>
      <div class="modal-actions">
        <button id="saveUserBtn"    class="primary-btn">حفظ</button>
        <button id="closeUserModal" class="ghost-btn">إلغاء</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.querySelector("#closeUserModal").onclick=()=>modal.remove();

  document.querySelector("#saveUserBtn").onclick=async()=>{
    const name     = document.querySelector("#newUserName").value.trim();
    const phone    = document.querySelector("#newUserPhone").value.trim();
    const password = document.querySelector("#newUserPassword").value;
    const role     = document.querySelector("#newUserRole").value;
    const errEl    = document.querySelector("#userSaveError");

    if (!name||!phone||!password) { errEl.style.display="block"; errEl.textContent="أكمل جميع البيانات"; return; }
    if (password.length<6)        { errEl.style.display="block"; errEl.textContent="كلمة المرور 6 أحرف على الأقل"; return; }

    const email=`${phone}@nukhba.com`;
    const btn=document.querySelector("#saveUserBtn");
    btn.disabled=true; btn.textContent="جاري الإنشاء...";

    const {data,error}=await db.auth.signUp({email,password});
    if (error) { errEl.style.display="block"; errEl.textContent="خطأ: "+error.message; btn.disabled=false; btn.textContent="حفظ"; return; }

    const newUser={id:data?.user?.id||crypto.randomUUID(),name,phone,role,balance:0};
    users.push(newUser);
    localStorage.setItem("nukhba_users",JSON.stringify(users));

    modal.remove(); render();
    alert(`✅ تم إنشاء المستخدم\nEmail: ${email}`);
  };
}

// ══════════════════════════════════════════════════
// SUPABASE — Timeline & Notifications
// ══════════════════════════════════════════════════
async function addTimelineEntry(shipmentCode, event) {
  try {
    await db.from("shipment_timeline").insert([{ shipment_code: shipmentCode, event }]);
  } catch(e) { console.warn("timeline insert failed:", e); }
}

async function loadTimeline(shipmentCode) {
  const el = document.querySelector(`#timeline-${shipmentCode}`);
  if (!el) return;
  try {
    const {data,error} = await db.from("shipment_timeline")
      .select("*")
      .eq("shipment_code", shipmentCode)
      .order("created_at", {ascending: true});
    if (error) throw error;
    if (!data||!data.length) { el.innerHTML=`<h4>سجل الشحنة</h4><p style="color:#888;font-size:13px">لا يوجد سجل بعد</p>`; return; }
    el.innerHTML=`
      <h4>سجل الشحنة</h4>
      ${data.map(entry=>`
        <div class="timeline-item">
          <span class="tl-dot"></span>
          <div>
            <b>${escapeHtml(entry.event)}</b>
            <small>${new Date(entry.created_at).toLocaleString("ar-EG")}</small>
          </div>
        </div>`).join("")}`;
  } catch(e) { el.innerHTML=`<h4>سجل الشحنة</h4><p style="color:#888;font-size:13px">تعذر تحميل السجل</p>`; }
}

async function addNotification(text, role="admin") {
  try {
    await db.from("notifications").insert([{text,role}]);
    notifications.unshift({text, role, time:new Date().toLocaleTimeString("ar-EG"), read:false});
  } catch(e) { console.warn("notification insert failed:", e); }
}

async function loadNotifications() {
  try {
    const {data} = await db.from("notifications")
      .select("*").order("created_at",{ascending:false}).limit(20);
    if (data) {
      notifications = data.map(n=>({
        text:n.text, role:n.role,
        time:new Date(n.created_at).toLocaleTimeString("ar-EG"),
        read:false
      }));
    }
  } catch(e) { console.warn("load notifications failed:", e); }
}

// ══════════════════════════════════════════════════
// GLOBAL FUNCTIONS
// ══════════════════════════════════════════════════
window.manualTrackShipment = () => {
  const code=prompt("أدخل كود الشحنة"); if(code) location.href=`${location.origin}${location.pathname}?track=${code}`;
};

window.updateShipmentStatus = async (id, status) => {
  const s=shipments.find(x=>x.id===id); if(!s) return;
  s.status=status;
  if(status==="delivered") s.eta="تم التسليم";

  // حفظ في Supabase
  const {error}=await db.from("shipments").update({status, eta:s.eta}).eq("shipment_code",id);
  if(error){console.error("update status error:",error);alert("خطأ في التحديث: "+error.message);return;}

  // سجل Timeline في Supabase
  await addTimelineEntry(id, statusMeta[status]?.label||status);

  // إشعار في Supabase
  await addNotification(`تم تحديث شحنة ${id} إلى: ${statusMeta[status]?.label||status}`, state.user?.role||"admin");

  // WhatsApp — اختياري فقط عند التسليم
  if (status==="delivered"||status==="returned") {
    const msg=`مرحبًا ${s.customerName}\n\nشحنتك رقم: ${s.id}\nالحالة: ${statusMeta[status]?.label||status}\n\nشركة النخبة للشحن السريع`;
    if(confirm("إرسال إشعار واتساب للعميل؟")) window.open(`https://wa.me/2${s.customerPhone}?text=${encodeURIComponent(msg)}`);
  }

  render();
};

window.assignCourier = async (id) => {
  const courierId=document.querySelector("#assignCourier")?.value;
  if(!courierId){alert("اختر مندوب أولاً");return;}
  const s=shipments.find(x=>x.id===id); if(!s) return;
  s.courierId=courierId;

  const {error}=await db.from("shipments").update({courier_id:courierId}).eq("shipment_code",id);
  if(error){console.error("assign courier error:",error);alert("تعذر حفظ التعيين: "+error.message);return;}

  const courierName=users.find(u=>u.id===courierId)?.name||courierId;
  await addTimelineEntry(id,`تم تعيين المندوب: ${courierName}`);
  await addNotification(`تم تعيين ${courierName} لشحنة ${id}`,"admin");

  alert("✅ تم تعيين المندوب");
  render();
};

window.uploadPOD = async (id, inputId) => {
  const file=document.querySelector(`#${inputId}`)?.files[0];
  if(!file){alert("اختر صورة أولاً");return;}
  if(file.size>5*1024*1024){alert("حجم الصورة كبير جداً. الحد الأقصى 5MB");return;}

  const btn = document.querySelector(`[onclick*="${id}"]`);
  if(btn){btn.textContent="جاري الرفع...";}

  try {
    // رفع الصورة لـ Supabase Storage
    const fileName=`pod_${id}_${Date.now()}.${file.name.split('.').pop()}`;
    const {data:uploadData, error:uploadError}=await db.storage.from("pod-images").upload(fileName,file,{upsert:true});

    if(uploadError) throw uploadError;

    // جلب الـ public URL
    const {data:urlData}=db.storage.from("pod-images").getPublicUrl(fileName);
    const publicUrl=urlData.publicUrl;

    // تحديث الشحنة في Supabase بالـ URL
    const {error:updateError}=await db.from("shipments").update({pod_url:publicUrl}).eq("shipment_code",id);
    if(updateError) throw updateError;

    // تحديث الـ local state
    const s=shipments.find(x=>x.id===id);
    if(s) s.podUrl=publicUrl;

    await addTimelineEntry(id,"تم رفع إثبات التسليم");
    await addNotification(`تم رفع إثبات تسليم شحنة ${id}`,"admin");

    alert("✅ تم رفع الصورة بنجاح وحفظها في السحابة");
    render();
  } catch(err) {
    console.error("POD upload error:",err);
    alert("خطأ في رفع الصورة: "+err.message);
    if(btn){btn.textContent="📷 رفع إثبات";}
  }
};

window.setStatusFilter = status => { state.statusFilter=status; render(); };

window.exportShipmentsExcel = () => {
  if(!can("export_excel")){alert("غير مصرح");return;}
  const data=visibleShipments().map(s=>({
    "رقم الشحنة":     s.id,
    "العميل":          s.customerName,
    "الهاتف":          s.customerPhone,
    "العنوان":         s.address,
    "الحالة":          statusMeta[s.status]?.label||s.status,
    "المبلغ (جنيه)":  s.amount,
    "رسوم الشحن":     s.deliveryFee,
    "موعد التسليم":   s.eta,
    "إثبات التسليم":  s.podUrl||"لا يوجد"
  }));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Shipments");
  XLSX.writeFile(wb,`nukhba_${new Date().toLocaleDateString("en-GB").replace(/\//g,"-")}.xlsx`);
};

window.deleteUser = id => {
  if(!confirm("هل تريد حذف هذا المستخدم؟")) return;
  users=users.filter(u=>u.id!==id);
  localStorage.setItem("nukhba_users",JSON.stringify(users));
  render();
};

window.printShipment = async id => {
  if(!can("print_shipment")){alert("غير مصرح");return;}
  const s=shipments.find(x=>x.id===id); if(!s) return;
  const label=document.createElement("div");
  label.style.cssText="width:700px;padding:30px;background:#fff;direction:rtl;font-family:Arial;position:fixed;top:-9999px;left:0;";
  label.innerHTML=`
    <div style="border:2px solid #000;padding:20px;border-radius:14px;">
      <h1 style="text-align:center;margin-bottom:20px;">النخبة إكسبريس</h1>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <p><b>رقم الشحنة:</b> ${escapeHtml(s.id)}</p>
          <p><b>العميل:</b> ${escapeHtml(s.customerName)}</p>
          <p><b>الهاتف:</b> ${escapeHtml(s.customerPhone)}</p>
          <p><b>المبلغ:</b> ${s.amount} جنيه</p>
          <p><b>رسوم الشحن:</b> ${s.deliveryFee} جنيه</p>
          <p><b>العنوان:</b> ${escapeHtml(s.address)}</p>
        </div>
        <canvas id="printQR"></canvas>
      </div>
    </div>`;
  document.body.appendChild(label);
  await QRCode.toCanvas(document.querySelector("#printQR"),`${location.origin}${location.pathname}?track=${s.id}`,{width:150});
  const canvas=await html2canvas(label);
  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF("p","mm","a4");
  pdf.addImage(canvas.toDataURL("image/png"),"PNG",10,10,190,120);
  pdf.save(`${s.id}.pdf`);
  label.remove();
};

// ══════════════════════════════════════════════════
// LOAD DATA
// ══════════════════════════════════════════════════
async function loadShipments() {
  try {
    const {data,error}=await db.from("shipments").select("*").order("created_at",{ascending:false});
    if(error) throw error;

    shipments=data.map(item=>({
      id:            item.shipment_code,
      merchantId:    item.merchant_id,
      courierId:     item.courier_id||null,
      customerName:  item.customer_name||"",
      customerPhone: item.customer_phone||"",
      address:       item.address||"",
      status:        item.status||"created",
      amount:        item.amount||0,
      deliveryFee:   item.delivery_fee||60,
      eta:           item.eta||"",
      notes:         item.notes||"",
      podUrl:        item.pod_url||null,
      createdAt:     item.created_at?new Date(item.created_at).toLocaleDateString("ar-EG"):"",
    }));

    if(!state.selectedShipment&&shipments.length) state.selectedShipment=shipments[0].id;
    render();
  } catch(err) {
    console.error("loadShipments error:",err);
    const app=document.querySelector("#app");
    if(app&&state.user){
      const bar=document.createElement("div");
      bar.style.cssText="background:#fef2f2;color:#991b1b;padding:10px 16px;font-size:13px;text-align:center;";
      bar.textContent="تعذر تحميل الشحنات. تحقق من الاتصال وأعد تحميل الصفحة.";
      app.prepend(bar);
    }
    render();
  }
}

// ─── PWA ─────────────────────────────────────────
if("serviceWorker"in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

// ─── START ───────────────────────────────────────
(async()=>{
  await loadNotifications();
  await loadShipments();
})();
