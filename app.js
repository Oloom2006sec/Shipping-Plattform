// ═══════════════════════════════════════════════════════════
// AL-NUKHBA EXPRESS — app.js v5
// Production-ready | Auth-guarded | Professional UI
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = "https://urktddxiyzwsilddamci.supabase.co";
const SUPABASE_KEY = "sb_publishable_-0wKJXXI18TuHK7pe-dKYw_HWyjH79u";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Global state ─────────────────────────────────────────
let users         = [];
let shipments     = [];
let notifications = [];
let realtimeChannel = null;

// ─── App state machine ────────────────────────────────────
let state = {
  page:             "home",       // home | auth | dashboard
  authMode:         "login",      // login | register
  user:             null,
  view:             "overview",
  query:            "",
  statusFilter:     "all",
  selectedShipment: null,
  userFilter:       "",
  auditFilter:      "",
  loading:          false
};

// ─── Status definitions ───────────────────────────────────
const STATUS = {
  created:          { label:"تم إنشاء الشحنة",  en:"Created",          tone:"info"    },
  received:         { label:"تم استلام الشحنة", en:"Received",         tone:"warning" },
  warehouse:        { label:"في المخزن",         en:"In Warehouse",     tone:"warning" },
  hub:              { label:"مركز الفرز",        en:"Hub Sorting",      tone:"primary" },
  out_for_delivery: { label:"خرجت للتسليم",     en:"Out for Delivery", tone:"primary" },
  delivered:        { label:"تم التسليم",        en:"Delivered",        tone:"success" },
  returned:         { label:"مرتجع",             en:"Returned",         tone:"danger"  }
};

// ─── Navigation ───────────────────────────────────────────
const NAV = {
  admin:    [{id:"overview",label:"الرئيسية",icon:"chart"},{id:"shipments",label:"الشحنات",icon:"box"},
             {id:"tasks",label:"المهام",icon:"truck"},{id:"accounts",label:"الحساب",icon:"wallet"},
             {id:"reports",label:"التقارير",icon:"chart"},{id:"users",label:"المستخدمين",icon:"user"},
             {id:"audit",label:"سجل النشاط",icon:"shield"},{id:"track",label:"تتبع",icon:"search"}],
  merchant: [{id:"overview",label:"الرئيسية",icon:"chart"},{id:"shipments",label:"الشحنات",icon:"box"},
             {id:"accounts",label:"الحساب",icon:"wallet"}],
  courier:  [{id:"tasks",label:"مهامي",icon:"truck"},{id:"accounts",label:"الحساب",icon:"wallet"}],
  customer: [{id:"track",label:"تتبع شحنة",icon:"search"},{id:"accounts",label:"حسابي",icon:"wallet"}]
};

// ─── RBAC ─────────────────────────────────────────────────
const PERMS = {
  admin:    ["create_shipment","edit_shipment","delete_shipment","assign_courier","view_reports",
             "manage_users","export_excel","change_status","view_all","print_shipment","view_audit",
             "manage_roles","suspend_user"],
  merchant: ["create_shipment","view_own","track","view_accounts","print_shipment","change_status"],
  courier:  ["view_assigned","change_status","upload_pod","navigation"],
  customer: ["track"]
};

function can(p) { return !!PERMS[state.user?.role]?.includes(p); }

// ─── Helpers ──────────────────────────────────────────────
const money = v => new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(v||0);

function esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
                  .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

const ICONS = {
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
  log:    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm4 18H6V4h7v5h5v11ZM8 15h8v2H8zm0-4h8v2H8z",
  menu:   "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"
};

function icon(name, size=18) {
  return `<svg viewBox="0 0 24 24" style="width:${size}px;height:${size}px;fill:currentColor;flex-shrink:0;"><path d="${ICONS[name]||ICONS.box}"/></svg>`;
}

function roleName(r) { return {admin:"إدارة",merchant:"تاجر",courier:"مندوب",customer:"عميل"}[r]||r; }
function roleColor(r){ return {admin:"danger",merchant:"success",courier:"primary",customer:"info"}[r]||"info"; }

// ─── Toast ────────────────────────────────────────────────
function toast(msg, type="success") {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=>{ requestAnimationFrame(()=>t.classList.add("show")); });
  setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.remove(),350); }, 3500);
}

// ─── Auth guard ───────────────────────────────────────────
function getSession() {
  try { return JSON.parse(localStorage.getItem("nukhba_v5")||"null"); } catch(e) { return null; }
}
function saveSession(user) {
  localStorage.setItem("nukhba_v5", JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem("nukhba_v5");
  localStorage.removeItem("nukhba_session"); // clear old key too
}

// ─── Role from Supabase profiles ──────────────────────────
async function getProfile(uid) {
  try {
    const {data} = await db.from("profiles").select("role,full_name,phone,suspended").eq("id",uid).single();
    return data;
  } catch(e) { return null; }
}

function fallbackRole(email) {
  if (!email) return "customer";
  const e = email.toLowerCase();
  if (e.startsWith("admin"))    return "admin";
  if (e.startsWith("merchant")) return "merchant";
  if (e.startsWith("courier"))  return "courier";
  return "customer";
}

// ─── Audit ────────────────────────────────────────────────
async function audit(action, targetId="", details="") {
  if (!state.user) return;
  try {
    await db.from("audit_logs").insert([{
      user_id:  state.user.id,
      username: state.user.name,
      role:     state.user.role,
      action, target_id:String(targetId), details
    }]);
  } catch(e) { console.warn("Audit:", e.message); }
}

// ─── Push notifications ───────────────────────────────────
async function askPush() {
  if (!("Notification" in window) || Notification.permission!=="default") return;
  await Notification.requestPermission();
}
function push(title, body) {
  if (Notification.permission!=="granted") return;
  try { new Notification(title, {body, dir:"rtl", icon:"./icon.svg"}); } catch(e) {}
}

// ─── Real-time ────────────────────────────────────────────
function startRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = db.channel("rt")
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"shipments"}, p=>{
      const s = mapRow(p.new);
      shipments.unshift(s);
      addNotif(`شحنة جديدة: ${s.id} — ${s.customerName}`,"admin");
      push("📦 شحنة جديدة", s.id+" — "+s.customerName);
      if(state.user?.role==="admin") render();
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"shipments"}, p=>{
      const idx = shipments.findIndex(s=>s.id===p.new.shipment_code);
      if(idx>=0){ shipments[idx]={...shipments[idx],...mapRow(p.new)}; render(); }
    })
    .subscribe();
}

// ─── Map DB row → shipment object ─────────────────────────
function mapRow(item) {
  return {
    id:             item.shipment_code,
    merchantId:     item.merchant_id||null,
    merchantName:   item.merchant_name||"",
    merchantPhone:  item.merchant_phone||"",
    courierId:      item.courier_id||null,
    customerName:   item.customer_name||"",
    customerPhone:  item.customer_phone||"",
    customerPhone2: item.customer_phone2||"",
    address:        item.address||"",
    status:         item.status||"created",
    amount:         Number(item.amount)||0,
    deliveryFee:    Number(item.delivery_fee)||60,
    eta:            item.eta||"",
    notes:          item.notes||"",
    podUrl:         item.pod_url||null,
    createdAt:      item.created_at ? new Date(item.created_at).toLocaleDateString("ar-EG") : ""
  };
}

// ─── Visible shipments ────────────────────────────────────
function visible() {
  let list = [...shipments];
  const {role, id:uid} = state.user||{};
  if (role==="courier")  list = list.filter(s=>s.courierId===uid);
  if (role==="merchant") list = list.filter(s=>s.merchantId===uid);
  if (role==="customer") return []; // customer uses track page only
  return list.filter(s=>{
    const txt = `${s.id} ${s.customerName} ${s.customerPhone} ${s.customerPhone2} ${s.address}`.toLowerCase();
    return txt.includes(state.query.trim().toLowerCase()) &&
           (state.statusFilter==="all" || s.status===state.statusFilter);
  });
}

// ═══════════════════════════════════════════════════════════
// HOMEPAGE (public landing page)
// ═══════════════════════════════════════════════════════════
function homePage() {
  return `
  <div class="homepage">
    <!-- Navbar -->
    <nav class="home-nav">
      <div class="nav-brand">
        ${icon("truck",32)}
        <span>النخبة للشحن السريع</span>
      </div>
      <div class="nav-links">
        <a href="#services">خدماتنا</a>
        <a href="#features">المميزات</a>
        <a href="#track-section">تتبع شحنة</a>
        <a href="#contact">تواصل معنا</a>
        <a href="#" id="navLoginBtn" class="nav-cta">تسجيل الدخول</a>
      </div>
      <button class="menu-toggle" id="mobileMenuBtn">${icon("menu")}</button>
    </nav>

    <!-- Hero -->
    <section class="home-hero">
      <div class="hero-content">
        <div class="hero-badge">🚀 <span>أسرع خدمة شحن في مصر</span></div>
        <h1>شحن سريع وموثوق<br/><span>في كل مكان</span></h1>
        <p>منصة لوجستية متكاملة تربط التجار بالمناديب والعملاء بأعلى كفاءة وشفافية.</p>
        <div class="hero-actions">
          <button class="btn-hero-primary" id="heroRegisterBtn">ابدأ الآن مجاناً</button>
          <button class="btn-hero-ghost" id="heroTrackBtn">تتبع شحنتي</button>
        </div>
        <div class="hero-track-box">
          <h3>📦 تتبع شحنتك الآن</h3>
          <div class="track-input-row">
            <input id="heroTrackInput" placeholder="أدخل رقم الشحنة..." type="text"/>
            <button id="heroTrackSubmit">تتبع</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Stats -->
    <div class="home-stats">
      <div class="home-stat"><div class="stat-num">+10K</div><div class="stat-lbl">شحنة تم تسليمها</div></div>
      <div class="home-stat"><div class="stat-num">+500</div><div class="stat-lbl">تاجر موثوق</div></div>
      <div class="home-stat"><div class="stat-num">98%</div><div class="stat-lbl">نسبة رضا العملاء</div></div>
      <div class="home-stat"><div class="stat-num">24/7</div><div class="stat-lbl">دعم مستمر</div></div>
    </div>

    <!-- Services -->
    <section class="home-section" id="services">
      <p class="section-label">خدماتنا</p>
      <h2 class="section-title">كل ما تحتاجه لإدارة شحناتك</h2>
      <p class="section-sub">من إنشاء الشحنة حتى التسليم النهائي، كل شيء في مكان واحد.</p>
      <div class="services-grid">
        <div class="service-card">
          <div class="service-icon">${icon("truck",24)}</div>
          <h3>توصيل سريع</h3>
          <p>توصيل خلال 24-48 ساعة في جميع أنحاء مصر مع تتبع مباشر لكل شحنة.</p>
        </div>
        <div class="service-card">
          <div class="service-icon">${icon("search",24)}</div>
          <h3>تتبع فوري</h3>
          <p>تتبع شحنتك لحظة بلحظة عبر رقم الشحنة أو رمز QR في أي وقت.</p>
        </div>
        <div class="service-card">
          <div class="service-icon">${icon("wallet",24)}</div>
          <h3>تحصيل الكاش</h3>
          <p>نحصل المبلغ من العميل ونحوله لك مع تقارير مالية شفافة.</p>
        </div>
        <div class="service-card">
          <div class="service-icon">${icon("shield",24)}</div>
          <h3>أمان وضمان</h3>
          <p>شحناتك محمية بالكامل مع سجل تفصيلي لكل حدث.</p>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="home-section alt" id="features">
      <div class="features-grid">
        <div>
          <p class="section-label">لماذا النخبة؟</p>
          <h2 class="section-title">منصة متكاملة للتجار والمناديب</h2>
          <div class="feature-list-items">
            <div class="feature-item">
              <div class="feature-dot">📊</div>
              <div><h4>لوحة تحكم متقدمة</h4><p>إحصائيات ومؤشرات أداء تفصيلية لكل حساب.</p></div>
            </div>
            <div class="feature-item">
              <div class="feature-dot">🔔</div>
              <div><h4>إشعارات فورية</h4><p>واتساب وإشعارات المتصفح عند كل تحديث.</p></div>
            </div>
            <div class="feature-item">
              <div class="feature-dot">📱</div>
              <div><h4>متوافق مع الموبايل</h4><p>تجربة سلسة على جميع الأجهزة.</p></div>
            </div>
            <div class="feature-item">
              <div class="feature-dot">📈</div>
              <div><h4>تقارير وتصدير Excel</h4><p>تصدير جميع بياناتك بضغطة واحدة.</p></div>
            </div>
          </div>
        </div>
        <div class="features-visual">
          <div class="mock-card">
            <div class="mc-label">شحنات اليوم</div>
            <div class="mc-val">48 شحنة</div>
            <div class="mc-badge">+12% عن أمس</div>
          </div>
          <div class="mock-card">
            <div class="mc-label">ANE-54558</div>
            <div class="mc-val">محمد أحمد</div>
            <div class="mc-badge">🚚 خرجت للتسليم</div>
          </div>
          <div class="mock-card">
            <div class="mc-label">تحصيلات اليوم</div>
            <div class="mc-val">24,500 ج.م</div>
            <div class="mc-badge">✅ 38 تم التسليم</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Track section -->
    <section class="home-section" id="track-section" style="background:var(--primary-light);">
      <div style="max-width:560px;margin:0 auto;text-align:center;">
        <p class="section-label">تتبع مجاني</p>
        <h2 class="section-title">تعرف على مكان شحنتك الآن</h2>
        <div style="display:flex;gap:10px;margin-top:24px;">
          <input id="sectionTrackInput" placeholder="أدخل رقم الشحنة..."
                 style="flex:1;padding:12px 16px;border-radius:var(--radius);border:1.5px solid var(--line);font-size:15px;"/>
          <button id="sectionTrackBtn" class="primary-btn" style="padding:12px 24px;font-size:15px;">🔍 تتبع</button>
        </div>
      </div>
    </section>

    <!-- Testimonials -->
    <section class="home-section alt">
      <p class="section-label">آراء العملاء</p>
      <h2 class="section-title">ماذا يقول عملاؤنا</h2>
      <div class="testimonials-grid">
        <div class="testimonial-card">
          <div class="stars">★★★★★</div>
          <p>"النخبة غيّرت طريقة إدارة شحناتي. لوحة التحكم رائعة والتتبع فوري."</p>
          <div class="author"><div class="avatar">أ</div><div class="author-info"><div class="name">أحمد السيد</div><div class="role">تاجر إلكتروني</div></div></div>
        </div>
        <div class="testimonial-card">
          <div class="stars">★★★★★</div>
          <p>"كمندوب توصيل، التطبيق سهّل عملي جداً. الملاحة والتحديثات كلها في مكان واحد."</p>
          <div class="author"><div class="avatar">م</div><div class="author-info"><div class="name">محمد خالد</div><div class="role">مندوب توصيل</div></div></div>
        </div>
        <div class="testimonial-card">
          <div class="stars">★★★★★</div>
          <p>"أتابع شحناتي بسهولة وأستلمها في الوقت المحدد. خدمة ممتازة."</p>
          <div class="author"><div class="avatar">س</div><div class="author-info"><div class="name">سارة مصطفى</div><div class="role">عميلة</div></div></div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="home-cta">
      <h2>ابدأ رحلتك مع النخبة اليوم</h2>
      <p>انضم لآلاف التجار والمناديب الذين يثقون بنا</p>
      <div class="cta-actions">
        <button class="btn-hero-primary" id="ctaRegisterBtn">إنشاء حساب مجاناً</button>
        <button class="btn-hero-ghost" id="ctaLoginBtn">تسجيل الدخول</button>
      </div>
    </section>

    <!-- Footer -->
    <footer class="home-footer" id="contact">
      <div class="footer-grid">
        <div>
          <div class="footer-brand">${icon("truck",28)}<strong>النخبة للشحن السريع</strong></div>
          <p class="footer-desc">منصة لوجستية متكاملة لإدارة الشحن والتوصيل والتتبع في مصر.</p>
        </div>
        <div class="footer-col">
          <h4>روابط سريعة</h4>
          <a href="#services">خدماتنا</a>
          <a href="#features">المميزات</a>
          <a href="#track-section">تتبع شحنة</a>
        </div>
        <div class="footer-col">
          <h4>الحسابات</h4>
          <a href="#" id="footerLoginLink">تسجيل الدخول</a>
          <a href="#" id="footerRegisterLink">إنشاء حساب</a>
        </div>
        <div class="footer-col">
          <h4>تواصل معنا</h4>
          <a href="tel:+201061004311">📞 01061004311</a>
          <a href="https://wa.me/201061004311" target="_blank">💬 واتساب</a>
          <a href="mailto:info@nukhba.com">✉️ info@nukhba.com</a>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2025 النخبة للشحن السريع. جميع الحقوق محفوظة.</p>
      </div>
    </footer>

    <!-- WhatsApp float -->
    <a href="https://wa.me/201061004311" target="_blank" class="wa-float" title="تواصل عبر واتساب">💬</a>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// AUTH PAGE
// ═══════════════════════════════════════════════════════════
function authPage() {
  return `
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-brand">
        ${icon("truck",36)}
        <span>النخبة للشحن السريع</span>
      </div>

      ${state.authMode==="login" ? loginForm() : registerForm()}

      <div class="auth-switch">
        ${state.authMode==="login"
          ? `عميل جديد؟ <button class="link-btn" id="switchAuth">إنشاء حساب</button>
             &nbsp;|&nbsp; <a href="#" id="backToHome" class="link-btn">الرئيسية</a>`
          : `لديك حساب؟ <button class="link-btn" id="switchAuth">تسجيل الدخول</button>
             &nbsp;|&nbsp; <a href="#" id="backToHome" class="link-btn">الرئيسية</a>`}
      </div>
    </div>
  </div>`;
}

function loginForm() {
  return `
    <h2>تسجيل الدخول</h2>
    <p class="auth-subtitle">أدخل بياناتك للدخول إلى حسابك</p>
    <form id="loginForm" class="auth-form">
      <div class="form-field">
        <label>البريد الإلكتروني</label>
        <input name="email" type="email" placeholder="your@email.com" autocomplete="username" required/>
      </div>
      <div class="form-field">
        <label>كلمة المرور</label>
        <input name="password" type="password" placeholder="••••••••" autocomplete="current-password" required/>
      </div>
      <div id="loginError" class="auth-error"></div>
      <button class="primary-btn full" type="submit">${icon("user")} دخول</button>
    </form>`;
}

function registerForm() {
  return `
    <h2>إنشاء حساب عميل</h2>
    <p class="auth-subtitle">أنشئ حسابك لتتبع شحناتك بسهولة</p>
    <form id="registerForm" class="auth-form">
      <div class="form-field">
        <label>الاسم الكامل</label>
        <input name="fullname" type="text" placeholder="محمد أحمد" required/>
      </div>
      <div class="form-field">
        <label>البريد الإلكتروني</label>
        <input name="email" type="email" placeholder="your@email.com" required/>
      </div>
      <div class="form-field">
        <label>رقم الهاتف</label>
        <input name="phone" type="tel" placeholder="01xxxxxxxxx"/>
      </div>
      <div class="form-field">
        <label>كلمة المرور</label>
        <input name="password" type="password" placeholder="6 أحرف على الأقل" required/>
      </div>
      <div class="form-field">
        <label>تأكيد كلمة المرور</label>
        <input name="confirm" type="password" placeholder="أعد كلمة المرور" required/>
      </div>
      <p style="font-size:12px;color:var(--muted);background:var(--bg);padding:10px;border-radius:var(--radius);">
        ℹ️ يتم إنشاء حسابات التجار والمناديب من قِبَل الإدارة فقط.
      </p>
      <div id="regError" class="auth-error"></div>
      <button class="primary-btn full" type="submit">${icon("user")} إنشاء الحساب</button>
    </form>`;
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD SHELL
// ═══════════════════════════════════════════════════════════
function dashboardPage() {
  const nav    = NAV[state.user.role]||[];
  const unread = notifications.filter(n=>!n.read).length;
  const content= renderView();

  if (state.user.role==="admin") {
    return `
    <div class="layout">
      <div class="sidebar-overlay" id="sidebarOverlay"></div>
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          ${icon("truck",28)}
          <div><strong>النخبة</strong><span>لوحة التحكم</span></div>
        </div>
        <nav>
          ${nav.map(v=>`
            <button class="${state.view===v.id?"active":""}" data-view="${v.id}">
              ${icon(v.icon,16)} ${v.label}
            </button>`).join("")}
        </nav>
        <div class="sidebar-footer">
          <select id="roleSwitcher" class="role-switcher">
            <option value="">👁 Preview as...</option>
            <option value="admin">Admin</option>
            <option value="merchant">Merchant</option>
            <option value="courier">Courier</option>
            <option value="customer">Customer</option>
          </select>
          <button class="logout-btn" id="logoutBtn">${icon("logout",16)} تسجيل الخروج</button>
        </div>
      </aside>
      <main class="content">
        <header class="topbar">
          <div class="topbar-left" style="display:flex;align-items:center;gap:12px;">
            <button class="menu-toggle" id="menuToggle">${icon("menu")}</button>
            <div>
              <div class="eyebrow">مدير النظام</div>
              <h2>أهلاً، ${esc(state.user.name?.split(" ")[0]||"Admin")}</h2>
            </div>
          </div>
          <div class="topbar-right">
            ${topbarRight(unread)}
          </div>
        </header>
        ${notifDropdown()}
        <div class="page-body">${content}</div>
      </main>
    </div>`;
  }

  // Simple layout for merchant / courier / customer
  const displayName = state.user.name?.length>14 ? state.user.name.split(" ")[0] : state.user.name;
  return `
    <div class="simple-layout">
      <header class="simple-topbar">
        <div class="brand-inline">
          ${icon("truck",24)} <span>النخبة للشحن السريع</span>
        </div>
        <div class="topbar-user">
          <span class="badge ${roleColor(state.user.role)}">${roleName(state.user.role)}</span>
          <span class="user-name">${esc(displayName)}</span>
          ${topbarRight(unread)}
          <button class="icon-btn" id="logoutBtn" title="خروج">${icon("logout")}</button>
        </div>
      </header>
      ${notifDropdown()}
      <nav class="tab-nav">
        ${nav.map(v=>`<button class="${state.view===v.id?"active":""}" data-view="${v.id}">${v.label}</button>`).join("")}
      </nav>
      <div class="tab-content">${content}</div>
    </div>`;
}

function topbarRight(unread) {
  return `
    <button class="notif-btn" id="toggleNotif">
      ${icon("bell")}
      ${unread>0?`<span class="notif-badge">${unread}</span>`:""}
    </button>
    <div class="search-box">
      ${icon("search")}
      <input id="searchInput" value="${esc(state.query)}" placeholder="بحث..."/>
    </div>`;
}

function notifDropdown() {
  return `
    <div id="notifPanel" class="notif-panel" style="display:none;">
      <div class="notif-header">
        <h4>الإشعارات</h4>
        <button class="link-btn" id="clearNotif">مسح الكل</button>
      </div>
      ${notifications.length
        ? notifications.slice(0,10).map(n=>`
            <div class="notification-item ${n.read?"":"unread"}">
              <span>${esc(n.text)}</span>
              <small>${esc(n.time)}</small>
            </div>`).join("")
        : `<p style="padding:1rem;color:var(--muted);text-align:center;font-size:13px;">لا توجد إشعارات</p>`}
    </div>`;
}

// ═══════════════════════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════════════════════
function overviewView() {
  const list = visible();
  const cards = [
    {label:"كل الشحنات",    value:list.length,                                         icon:"box",   filter:"all",              color:"var(--primary)"},
    {label:"خارج للتسليم", value:list.filter(s=>s.status==="out_for_delivery").length,  icon:"truck", filter:"out_for_delivery", color:"var(--info)"},
    {label:"تم التسليم",   value:list.filter(s=>s.status==="delivered").length,         icon:"chart", filter:"delivered",        color:"var(--success)"},
    {label:"مرتجعات",      value:list.filter(s=>s.status==="returned").length,          icon:"box",   filter:"returned",         color:"var(--danger)"}
  ];
  return `
    <div class="stats-grid">
      ${cards.map(c=>`
        <article class="stat clickable-card" onclick="window.setFilter('${c.filter}')">
          <div style="color:${c.color}">${icon(c.icon,20)}</div>
          <span>${c.label}</span>
          <strong style="color:${c.color}">${c.value}</strong>
          <small class="card-hint">عرض التفاصيل →</small>
        </article>`).join("")}
    </div>
    <div class="work-grid">
      <div>
        <div class="panel">
          <div class="section-head">
            <h3>${icon("box")} آخر الشحنات
              ${state.statusFilter!=="all"
                ? `<span class="badge info" style="margin-right:8px;">${STATUS[state.statusFilter]?.label||state.statusFilter}
                    <button onclick="window.setFilter('all')" style="background:none;border:none;cursor:pointer;font-size:12px;margin-right:4px;">✕</button>
                   </span>`:""}
            </h3>
            <div style="display:flex;gap:8px;">
              <button class="ghost-btn" id="openScanner">📷 QR</button>
              ${can("create_shipment")?`<button class="primary-btn compact" id="newShipmentBtn">${icon("plus")} شحنة جديدة</button>`:""}
            </div>
          </div>
          ${shipTable(state.statusFilter==="all"?list.slice(0,8):list)}
        </div>
      </div>
      <div>
        <div class="panel">
          <h3 style="margin-bottom:16px;">${icon("chart")} نظرة سريعة</h3>
          <div class="alert-list">
            <div class="alert-item clickable-card" onclick="window.setFilter('created')">
              <b>${list.filter(s=>s.status==="created").length}</b>
              <span>تنتظر الاستلام</span>
            </div>
            <div class="alert-item clickable-card" onclick="window.setFilter('out_for_delivery')">
              <b>${list.filter(s=>s.status==="out_for_delivery").length}</b>
              <span>في الطريق</span>
            </div>
            <div class="alert-item clickable-card" onclick="window.setFilter('returned')">
              <b>${list.filter(s=>s.status==="returned").length}</b>
              <span>مرتجع</span>
            </div>
          </div>
          <div class="chart-box" style="margin-top:20px;"><canvas id="statusChart"></canvas></div>
        </div>
      </div>
    </div>`;
}

function shipTable(list) {
  if (!list.length) return `
    <div class="empty-state">
      <div class="empty-icon">📦</div>
      <h3>لا توجد شحنات</h3>
      <p>لم يتم العثور على شحنات مطابقة للفلتر الحالي</p>
      ${state.statusFilter!=="all"?`<button class="ghost-btn" onclick="window.setFilter('all')">إظهار الكل</button>`:""}
    </div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>الشحنة</th><th>العميل</th><th>الهاتف</th>
            <th>الحالة</th><th>المبلغ</th><th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(s=>`
            <tr>
              <td><b>${esc(s.id)}</b><br/><small style="color:var(--muted)">${esc(s.createdAt)}</small></td>
              <td style="font-weight:600;">${esc(s.customerName)}</td>
              <td>
                <a href="tel:${esc(s.customerPhone)}" class="phone-link">📞 ${esc(s.customerPhone)}</a>
                ${s.customerPhone2?`<br/><a href="tel:${esc(s.customerPhone2)}" class="phone-link">📞 ${esc(s.customerPhone2)}</a>`:""}
              </td>
              <td><span class="badge ${STATUS[s.status]?.tone||"info"}">${STATUS[s.status]?.label||s.status}</span></td>
              <td>${money(s.amount)}</td>
              <td>
                <div class="shipment-actions">
                  <button class="link-btn" data-open="${esc(s.id)}">عرض</button>
                  ${can("print_shipment")?`<button class="link-btn" onclick="window.printShipment('${esc(s.id)}')">طباعة</button>`:""}
                  <canvas id="qr-${esc(s.id)}" style="width:40px;height:40px;"></canvas>
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function shipmentsView() {
  const sel = shipments.find(s=>s.id===state.selectedShipment)||visible()[0]||null;
  return `
    <div class="panel">
      <div class="section-head">
        <h3>${icon("box")} إدارة الشحنات</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="ghost-btn" onclick="window.manualTrack()">📦 تتبع</button>
          ${can("export_excel")?`<button class="ghost-btn" onclick="window.exportExcel()">📊 Excel</button>`:""}
          ${can("create_shipment")?`<button class="primary-btn compact" id="newShipmentBtn">${icon("plus")} إضافة</button>`:""}
        </div>
      </div>
      <div class="filter-row" style="margin-bottom:14px;">
        ${["all","created","received","warehouse","hub","out_for_delivery","delivered","returned"].map(st=>`
          <button onclick="window.setFilter('${st}')" class="ghost-btn ${state.statusFilter===st?"active":""}">
            ${st==="all"?"الكل":STATUS[st]?.label||st}
          </button>`).join("")}
      </div>
      ${shipTable(visible())}
    </div>
    ${sel?detailPanel(sel):""}`;
}

function tasksView() {
  const list = visible().filter(s=>s.status!=="delivered"&&s.status!=="returned");
  if (!list.length) return `
    <div class="empty-state">
      <div class="empty-icon">✅</div>
      <h3>لا توجد مهام حالية</h3>
      <p>كل الشحنات تم تسليمها أو لم يتم تعيينك بعد</p>
    </div>`;
  return `
    <div class="task-list">
      ${list.map(s=>`
        <div class="task-card">
          <div class="task-card-header">
            <span class="badge ${STATUS[s.status]?.tone||"info"}">${STATUS[s.status]?.label||s.status}</span>
            <b>${esc(s.id)}</b>
          </div>
          <h3>${esc(s.customerName)}</h3>
          <p>📍 ${esc(s.address)}</p>
          <p>
            <a href="tel:${esc(s.customerPhone)}" class="phone-link">📞 ${esc(s.customerPhone)}</a>
            ${s.customerPhone2?`&nbsp; <a href="tel:${esc(s.customerPhone2)}" class="phone-link">📞 ${esc(s.customerPhone2)}</a>`:""}
          </p>
          <p>💰 ${money(s.amount)}</p>
          <div class="task-actions">
            <a class="ghost-btn" href="tel:${esc(s.customerPhone)}">📞 اتصال</a>
            <a class="ghost-btn" target="_blank"
               href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}">
               🗺 ملاحة</a>
            ${can("upload_pod")?`
              <label class="ghost-btn" style="cursor:pointer;">
                📷 إثبات التسليم
                <input type="file" id="pod-${esc(s.id)}" accept="image/*" style="display:none"
                       onchange="window.uploadPOD('${esc(s.id)}','pod-${esc(s.id)}')"/>
              </label>`:""}
            ${can("change_status")?`
              <button class="primary-btn compact"
                      onclick="window.updateStatus('${esc(s.id)}','delivered')">✅ تم التسليم</button>
              <button class="ghost-btn" style="color:var(--danger)"
                      onclick="window.updateStatus('${esc(s.id)}','returned')">↩ مرتجع</button>`:""}
          </div>
          ${s.podUrl?`<img src="${esc(s.podUrl)}" style="width:100%;max-width:200px;border-radius:8px;margin-top:10px;"/>`:""}
        </div>`).join("")}
    </div>`;
}

function detailPanel(s) {
  if (!s) return "";
  const meta   = STATUS[s.status]||{label:s.status,tone:"info"};
  const couriers= users.filter(u=>u.role==="courier");
  const steps  = ["created","received","warehouse","hub","out_for_delivery","delivered"];
  const curIdx = steps.indexOf(s.status);
  return `
    <div class="panel details">
      <div class="section-head">
        <h3>${esc(s.id)}</h3>
        <span class="badge ${meta.tone}">${meta.label}</span>
      </div>
      <div class="detail-grid">
        <div><span>العميل</span><b>${esc(s.customerName)}</b></div>
        <div><span>الهاتف الأول</span><b><a href="tel:${esc(s.customerPhone)}" class="phone-link">📞 ${esc(s.customerPhone)}</a></b></div>
        ${s.customerPhone2?`<div><span>الهاتف الثاني</span><b><a href="tel:${esc(s.customerPhone2)}" class="phone-link">📞 ${esc(s.customerPhone2)}</a></b></div>`:""}
        <div><span>العنوان</span><b>${esc(s.address)}</b></div>
        <div><span>موعد التسليم</span><b>${esc(s.eta)||"قيد التجهيز"}</b></div>
        <div><span>قيمة الطلب</span><b>${money(s.amount)}</b></div>
        <div><span>رسوم الشحن</span><b>${money(s.deliveryFee)}</b></div>
        ${s.merchantName?`<div><span>التاجر</span><b>${esc(s.merchantName)}</b></div>`:""}
        ${s.merchantPhone?`<div><span>هاتف التاجر</span><b><a href="tel:${esc(s.merchantPhone)}" class="phone-link">📞 ${esc(s.merchantPhone)}</a></b></div>`:""}
        ${s.notes?`<div style="grid-column:1/-1"><span>ملاحظات</span><b>${esc(s.notes)}</b></div>`:""}
      </div>

      ${can("assign_courier")?`
        <div class="assign-box">
          <select id="assignCourier">
            <option value="">اختر مندوب</option>
            ${couriers.map(c=>`<option value="${esc(c.id)}" ${s.courierId===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}
          </select>
          <button class="ghost-btn" onclick="window.assignCourier('${esc(s.id)}')">تعيين</button>
        </div>`:""}

      ${can("change_status")?`
        <div class="status-actions">
          ${["received","warehouse","hub","out_for_delivery"].map(st=>`
            <button onclick="window.updateStatus('${esc(s.id)}','${st}')" class="ghost-btn">${STATUS[st].label}</button>`).join("")}
          <button onclick="window.updateStatus('${esc(s.id)}','delivered')" class="primary-btn compact">✅ تم التسليم</button>
          <button onclick="window.updateStatus('${esc(s.id)}','returned')"  class="ghost-btn" style="color:var(--danger)">↩ مرتجع</button>
        </div>`:""}

      ${can("upload_pod")?`
        <div class="pod-upload">
          <label class="ghost-btn" style="cursor:pointer;">
            📷 رفع إثبات التسليم
            <input type="file" id="podImage" accept="image/*" style="display:none"
                   onchange="window.uploadPOD('${esc(s.id)}','podImage')"/>
          </label>
        </div>`:""}

      ${s.podUrl?`<div class="pod-preview" style="margin-bottom:16px;">
        <h4 style="font-size:13px;margin-bottom:8px;">إثبات التسليم</h4>
        <img src="${esc(s.podUrl)}" style="width:200px;border-radius:10px;border:2px solid var(--line);"/>
      </div>`:""}

      <div class="tracking-progress">
        ${steps.map((step,i)=>`
          <div class="progress-step">
            <div class="progress-circle ${i<=curIdx?"done":""}">${i<=curIdx?"✓":i+1}</div>
            <span>${STATUS[step]?.label||step}</span>
          </div>
          ${i<steps.length-1?`<div class="progress-line ${i<curIdx?"done":""}"></div>`:""}`
        ).join("")}
      </div>

      <div class="timeline" id="timeline-${esc(s.id)}">
        <h4>سجل الشحنة</h4>
        <div class="loading-overlay"><div class="spinner"></div> جاري التحميل...</div>
      </div>
    </div>`;
}

function trackView() {
  const s = shipments.find(x=>x.id===state.selectedShipment);
  if (!s) return `
    <div class="empty-state" style="padding:80px 20px;">
      <div class="empty-icon">📦</div>
      <h3>${state.selectedShipment?"الشحنة غير موجودة":"تتبع شحنتك"}</h3>
      <p>${state.selectedShipment?"تأكد من رقم الشحنة وحاول مرة أخرى":"أدخل رقم الشحنة الذي أرسله لك التاجر"}</p>
      <button class="primary-btn" onclick="window.manualTrack()" style="margin-top:8px;">🔍 تتبع شحنة</button>
    </div>`;

  const meta   = STATUS[s.status]||{label:s.status,tone:"info"};
  const steps  = ["created","received","warehouse","hub","out_for_delivery","delivered"];
  const curIdx = steps.indexOf(s.status);
  return `
    <div class="track-hero">
      <div>
        <div class="eyebrow">تتبع الشحنة</div>
        <h2>${esc(s.id)}</h2>
        <p>${esc(s.customerName)} — ${esc(s.address)}</p>
      </div>
      <span class="badge ${meta.tone}" style="font-size:14px;padding:10px 18px;">${meta.label}</span>
    </div>
    <div class="panel">
      <div class="tracking-progress" style="margin:0 0 24px;">
        ${steps.map((step,i)=>`
          <div class="progress-step">
            <div class="progress-circle ${i<=curIdx?"done":""}">${i<=curIdx?"✓":i+1}</div>
            <span>${STATUS[step]?.label||step}</span>
          </div>
          ${i<steps.length-1?`<div class="progress-line ${i<curIdx?"done":""}"></div>`:""}`
        ).join("")}
      </div>
      <div class="detail-grid">
        <div><span>العميل</span><b>${esc(s.customerName)}</b></div>
        <div><span>الهاتف</span><b><a href="tel:${esc(s.customerPhone)}" class="phone-link">📞 ${esc(s.customerPhone)}</a></b></div>
        ${s.customerPhone2?`<div><span>هاتف ثاني</span><b><a href="tel:${esc(s.customerPhone2)}" class="phone-link">📞 ${esc(s.customerPhone2)}</a></b></div>`:""}
        <div><span>العنوان</span><b>${esc(s.address)}</b></div>
        <div><span>موعد التسليم</span><b>${esc(s.eta)||"قيد التجهيز"}</b></div>
      </div>
      ${s.podUrl?`<div style="margin-top:16px;"><h4 style="font-size:13px;margin-bottom:8px;">إثبات التسليم</h4>
        <img src="${esc(s.podUrl)}" style="width:200px;border-radius:10px;border:2px solid var(--line);"/></div>`:""}
      <div class="timeline" id="timeline-${esc(s.id)}" style="margin-top:20px;">
        <h4>سجل الأحداث</h4>
        <div class="loading-overlay"><div class="spinner"></div></div>
      </div>
    </div>`;
}

function accountsView() {
  if (state.user.role==="customer") return `
    <div class="empty-state" style="padding:80px 20px;">
      <div class="empty-icon">📦</div>
      <h3>تتبع شحنتك</h3>
      <p>أدخل رقم الشحنة لمعرفة حالتها</p>
      <button class="primary-btn" onclick="window.manualTrack()">🔍 تتبع شحنة</button>
    </div>`;

  const list      = visible();
  const delivered = list.filter(s=>s.status==="delivered");
  const revenue   = delivered.reduce((a,s)=>a+(s.amount||0),0);
  const fees      = delivered.reduce((a,s)=>a+(s.deliveryFee||0),0);
  const payable   = state.user.role==="courier" ? delivered.length*25 : revenue-fees;

  return `
    <div class="account-band">
      <div><span>الرصيد الحالي</span><strong>${money(payable)}</strong></div>
      <button class="btn-hero-ghost" style="border-color:rgba(255,255,255,.4);">طلب تسوية</button>
    </div>
    <div class="stats-grid two" style="margin-bottom:20px;">
      <div class="stat">${icon("wallet")} <span>تحصيلات</span><strong>${money(revenue)}</strong></div>
      <div class="stat">${icon("truck")} <span>رسوم شحن</span><strong>${money(fees)}</strong></div>
    </div>
    <div class="panel">
      <h3 style="margin-bottom:16px;">كشف الحساب — الشحنات المسلمة</h3>
      ${shipTable(delivered)}
    </div>`;
}

function reportsView() {
  const list  = visible();
  const total = list.length||1;
  return `
    <div class="stats-grid">
      ${Object.entries(STATUS).map(([k,v])=>`
        <div class="stat mini clickable-card" onclick="window.goTo('shipments','${k}')">
          <span class="badge ${v.tone}">${v.label}</span>
          <strong>${list.filter(s=>s.status===k).length}</strong>
        </div>`).join("")}
    </div>
    <div class="panel">
      <h3 style="margin-bottom:16px;">مؤشرات الأداء</h3>
      <div class="feature-list">
        <div><span>إجمالي الشحنات</span><b>${list.length}</b></div>
        <div><span>نسبة التسليم</span><b>${Math.round(list.filter(s=>s.status==="delivered").length/total*100)}%</b></div>
        <div><span>نسبة المرتجع</span><b>${Math.round(list.filter(s=>s.status==="returned").length/total*100)}%</b></div>
        <div><span>إجمالي المبالغ</span><b>${money(list.reduce((a,s)=>a+(s.amount||0),0))}</b></div>
        <div><span>إجمالي الرسوم</span><b>${money(list.reduce((a,s)=>a+(s.deliveryFee||0),0))}</b></div>
        <div><span>صافي المستحق</span><b>${money(list.filter(s=>s.status==="delivered").reduce((a,s)=>a+(s.amount-s.deliveryFee),0))}</b></div>
      </div>
    </div>`;
}

function usersView() {
  if (!can("manage_users")) return `<div class="empty-state"><h3>غير مصرح</h3></div>`;
  const filtered = users.filter(u=>{
    const txt=`${u.name} ${u.email} ${u.phone||""} ${u.role}`.toLowerCase();
    return txt.includes((state.userFilter||"").toLowerCase());
  });
  return `
    <div class="panel">
      <div class="section-head">
        <h3>${icon("user")} إدارة المستخدمين</h3>
        <button class="primary-btn compact" id="addUserBtn">${icon("plus")} مستخدم جديد</button>
      </div>
      <div style="margin-bottom:14px;">
        <input id="userSearchInput" value="${esc(state.userFilter)}"
               placeholder="ابحث بالاسم أو البريد أو الدور..."
               style="width:100%;padding:9px 14px;border-radius:var(--radius);border:1.5px solid var(--line);font-size:13px;"/>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>الاسم</th><th>الدور</th><th>البريد</th><th>الهاتف</th><th>تاريخ الإنشاء</th><th>الحالة</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            ${!filtered.length
              ? `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:2rem;">لا يوجد مستخدمون</td></tr>`
              : filtered.map(u=>`
                <tr class="${u.suspended?"suspended-row":""}">
                  <td><b>${esc(u.name||"—")}</b></td>
                  <td><span class="badge ${roleColor(u.role)}">${roleName(u.role)}</span></td>
                  <td style="font-size:12px;">${esc(u.email||"—")}</td>
                  <td style="font-size:12px;">${esc(u.phone||"—")}</td>
                  <td style="font-size:11px;color:var(--muted);">${esc(u.createdAt||"—")}</td>
                  <td><span class="badge ${u.suspended?"danger":"success"}">${u.suspended?"موقوف":"نشط"}</span></td>
                  <td>
                    <div style="display:flex;gap:4px;">
                      <button class="ghost-btn compact" title="تعديل" onclick="window.editUser('${esc(u.id)}')">${icon("edit",14)}</button>
                      <button class="ghost-btn compact" title="${u.suspended?"تفعيل":"إيقاف"}"
                              onclick="window.toggleUser('${esc(u.id)}')">${u.suspended?"✅":"🚫"}</button>
                      <button class="ghost-btn compact" title="حذف" style="color:var(--danger)"
                              onclick="window.deleteUser('${esc(u.id)}')">${icon("trash",14)}</button>
                    </div>
                  </td>
                </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function auditView() {
  if (!can("view_audit")) return `<div class="empty-state"><h3>غير مصرح</h3></div>`;
  return `
    <div class="panel">
      <div class="section-head">
        <h3>${icon("shield")} سجل النشاط الكامل</h3>
        <button class="ghost-btn" onclick="window.loadAudit()">🔄 تحديث</button>
      </div>
      <div style="margin-bottom:14px;">
        <input id="auditSearchInput" value="${esc(state.auditFilter)}"
               placeholder="ابحث بالمستخدم أو الإجراء أو الشحنة..."
               style="width:100%;padding:9px 14px;border-radius:var(--radius);border:1.5px solid var(--line);font-size:13px;"/>
      </div>
      <div id="auditTable">
        <div class="loading-overlay"><div class="spinner"></div> جاري تحميل السجل...</div>
      </div>
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
  return overviewView();
}

// ═══════════════════════════════════════════════════════════
// RENDER ENGINE
// ═══════════════════════════════════════════════════════════
function render() {
  const params  = new URLSearchParams(window.location.search);
  const trackId = params.get("track");

  // Public track URL — no auth needed
  if (trackId && !state.user) {
    state.selectedShipment = trackId;
    state.view = "track";
    state.user = {role:"customer",id:"guest",name:"زائر"};
  }

  const app = document.querySelector("#app");
  if (!app) return;

  // Route to correct page
  if (!state.user) {
    // Not logged in — show home or auth
    app.innerHTML = state.page==="auth" ? authPage() : homePage();
  } else {
    // Logged in — dashboard
    app.innerHTML = dashboardPage();
  }

  bindEvents();
  postRender();
}

function postRender() {
  // Chart
  setTimeout(renderChart, 200);

  // QR codes
  setTimeout(()=>{
    visible().forEach(s=>{
      const c = document.getElementById(`qr-${s.id}`);
      if (!c) return;
      try { QRCode.toCanvas(c,`${location.origin}${location.pathname}?track=${s.id}`,{width:40}); } catch(e){}
    });
  },150);

  // Lazy load timeline
  const sel = shipments.find(s=>s.id===state.selectedShipment);
  if (sel) loadTimeline(sel.id);

  // Lazy load audit
  if (state.view==="audit") window.loadAudit();
}

function renderChart() {
  const canvas = document.getElementById("statusChart");
  if (!canvas) return;
  const old = Chart.getChart(canvas);
  if (old) old.destroy();
  const vl = visible();
  new Chart(canvas,{
    type:"doughnut",
    data:{
      labels:["تم التسليم","مرتجع","خرج للتسليم","في المخزن","جديد"],
      datasets:[{
        data:[
          vl.filter(s=>s.status==="delivered").length,
          vl.filter(s=>s.status==="returned").length,
          vl.filter(s=>s.status==="out_for_delivery").length,
          vl.filter(s=>s.status==="warehouse").length,
          vl.filter(s=>s.status==="created").length,
        ],
        backgroundColor:["#16a34a","#dc2626","#2563eb","#d97706","#7c3aed"],
        borderWidth:0
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:"bottom",labels:{font:{size:11},padding:8}}}}
  });
}

// ═══════════════════════════════════════════════════════════
// EVENT BINDING
// ═══════════════════════════════════════════════════════════
function bindEvents() {

  // ── Homepage buttons ──────────────────────────────────
  document.querySelector("#navLoginBtn")?.addEventListener("click", e=>{ e.preventDefault(); state.page="auth"; state.authMode="login"; render(); });
  document.querySelector("#heroRegisterBtn")?.addEventListener("click", ()=>{ state.page="auth"; state.authMode="register"; render(); });
  document.querySelector("#heroTrackBtn")?.addEventListener("click", ()=>{ state.page="auth"; state.authMode="login"; render(); });
  document.querySelector("#ctaRegisterBtn")?.addEventListener("click", ()=>{ state.page="auth"; state.authMode="register"; render(); });
  document.querySelector("#ctaLoginBtn")?.addEventListener("click",    ()=>{ state.page="auth"; state.authMode="login"; render(); });
  document.querySelector("#footerLoginLink")?.addEventListener("click",    e=>{ e.preventDefault(); state.page="auth"; state.authMode="login"; render(); });
  document.querySelector("#footerRegisterLink")?.addEventListener("click", e=>{ e.preventDefault(); state.page="auth"; state.authMode="register"; render(); });

  // Hero track
  document.querySelector("#heroTrackSubmit")?.addEventListener("click", ()=>{
    const code = document.querySelector("#heroTrackInput")?.value.trim();
    if (code) { state.selectedShipment=code; state.view="track"; state.user={role:"customer",id:"guest",name:"زائر"}; render(); }
  });
  document.querySelector("#sectionTrackBtn")?.addEventListener("click", ()=>{
    const code = document.querySelector("#sectionTrackInput")?.value.trim();
    if (code) { location.href=`${location.origin}${location.pathname}?track=${code}`; }
  });

  // ── Auth ──────────────────────────────────────────────
  document.querySelector("#switchAuth")?.addEventListener("click", ()=>{
    state.authMode = state.authMode==="login"?"register":"login"; render();
  });
  document.querySelector("#backToHome")?.addEventListener("click", e=>{ e.preventDefault(); state.page="home"; render(); });

  // Login form
  document.querySelector("#loginForm")?.addEventListener("submit", async e=>{
    e.preventDefault();
    const fd  = new FormData(e.currentTarget);
    const btn = e.currentTarget.querySelector("button[type=submit]");
    const err = document.querySelector("#loginError");
    btn.disabled=true; btn.textContent="جاري الدخول...";
    err.style.display="none";

    const {data,error} = await db.auth.signInWithPassword({
      email: fd.get("email"), password: fd.get("password")
    });

    btn.disabled=false; btn.innerHTML=`${icon("user")} دخول`;

    if (error) {
      err.style.display="block";
      err.textContent = "بيانات الدخول غير صحيحة. تحقق من البريد وكلمة المرور.";
      return;
    }

    // Get role from profiles table
    const profile = await getProfile(data.user.id);
    if (profile?.suspended) {
      err.style.display="block";
      err.textContent = "هذا الحساب موقوف. تواصل مع الإدارة.";
      await db.auth.signOut();
      return;
    }

    const role = profile?.role || fallbackRole(data.user.email);
    const name = profile?.full_name || data.user.user_metadata?.full_name || data.user.email.split("@")[0];
    const phone= profile?.phone || "";

    const user = { id:data.user.id, name, role, email:data.user.email, phone, balance:0 };
    saveSession(user);
    state.user = user;
    state.page = "dashboard";
    state.view = role==="customer"?"track":role==="courier"?"tasks":role==="merchant"?"shipments":"overview";

    await audit("LOGIN", data.user.id, `Logged in as ${role}`);
    await askPush();
    if (role==="admin"||role==="merchant") await loadUsers();
    if (role==="admin") startRealtime();

    render();
    toast(`أهلاً ${name}!`);
  });

  // Register form (customer only)
  document.querySelector("#registerForm")?.addEventListener("submit", async e=>{
    e.preventDefault();
    const fd      = new FormData(e.currentTarget);
    const fullname= fd.get("fullname").trim();
    const email   = fd.get("email").trim();
    const phone   = fd.get("phone").trim();
    const password= fd.get("password");
    const confirm = fd.get("confirm");
    const err     = document.querySelector("#regError");
    const btn     = e.currentTarget.querySelector("button[type=submit]");
    err.style.display="none";

    if (!fullname||!email||!password){ err.style.display="block"; err.textContent="يرجى تعبئة جميع الحقول المطلوبة"; return; }
    if (password!==confirm)           { err.style.display="block"; err.textContent="كلمة المرور غير متطابقة"; return; }
    if (password.length<6)            { err.style.display="block"; err.textContent="كلمة المرور 6 أحرف على الأقل"; return; }

    btn.disabled=true; btn.textContent="جاري الإنشاء...";

    const {data,error} = await db.auth.signUp({
      email, password, options:{data:{full_name:fullname, phone}}
    });

    btn.disabled=false; btn.innerHTML=`${icon("user")} إنشاء الحساب`;

    if (error) {
      err.style.display="block";
      err.textContent = error.message.includes("already registered")
        ? "هذا البريد الإلكتروني مسجل بالفعل" : "خطأ: "+error.message;
      return;
    }

    // Save to profiles as customer
    await db.from("profiles").upsert([{
      id: data.user.id, full_name:fullname, email, phone, role:"customer"
    }]);

    const user = {id:data.user.id, name:fullname, role:"customer", email, phone, balance:0};
    saveSession(user);
    state.user = user;
    state.page = "dashboard";
    state.view = "track";
    render();
    toast(`مرحباً ${fullname}! تم إنشاء حسابك بنجاح`);
  });

  // ── Dashboard nav ────────────────────────────────────
  document.querySelectorAll("[data-view]").forEach(btn=>{
    btn.addEventListener("click",()=>{ state.view=btn.dataset.view; state.statusFilter="all"; render(); });
  });

  // ── Role switcher (admin preview) ────────────────────
  document.querySelector("#roleSwitcher")?.addEventListener("change", e=>{
    const role=e.target.value; if(!role) return;
    state.user.role=role;
    state.view=role==="customer"?"track":role==="courier"?"tasks":"overview";
    render();
  });

  // ── Logout ───────────────────────────────────────────
  document.querySelector("#logoutBtn")?.addEventListener("click", async ()=>{
    await audit("LOGOUT","","User logged out");
    await db.auth.signOut();
    clearSession();
    if(realtimeChannel){ db.removeChannel(realtimeChannel); realtimeChannel=null; }
    state.user=null; state.page="home"; state.view="overview";
    render();
    toast("تم تسجيل الخروج","info");
  });

  // ── Search ───────────────────────────────────────────
  const si=document.querySelector("#searchInput");
  if(si){ let t; si.addEventListener("input",e=>{ clearTimeout(t); t=setTimeout(()=>{ state.query=e.target.value; render(); document.querySelector("#searchInput")?.focus(); },250); }); }

  // ── User search ──────────────────────────────────────
  const ui=document.querySelector("#userSearchInput");
  if(ui){ let t; ui.addEventListener("input",e=>{ clearTimeout(t); t=setTimeout(()=>{ state.userFilter=e.target.value; render(); document.querySelector("#userSearchInput")?.focus(); },250); }); }

  // ── Audit search ─────────────────────────────────────
  const ai=document.querySelector("#auditSearchInput");
  if(ai){ let t; ai.addEventListener("input",e=>{ clearTimeout(t); t=setTimeout(()=>{ state.auditFilter=e.target.value; window.loadAudit(); },300); }); }

  // ── Open detail ──────────────────────────────────────
  document.querySelectorAll("[data-open]").forEach(btn=>{
    btn.addEventListener("click",()=>{ state.selectedShipment=btn.dataset.open; render(); });
  });

  // ── New shipment ─────────────────────────────────────
  document.querySelector("#newShipmentBtn")?.addEventListener("click", openNewShipmentModal);

  // ── Add user ─────────────────────────────────────────
  document.querySelector("#addUserBtn")?.addEventListener("click", openAddUserModal);

  // ── QR Scanner ───────────────────────────────────────
  document.querySelector("#openScanner")?.addEventListener("click", openScanner);

  // ── Notifications ────────────────────────────────────
  document.querySelector("#toggleNotif")?.addEventListener("click", ()=>{
    const p=document.querySelector("#notifPanel"); if(!p) return;
    const open=p.style.display!=="none";
    p.style.display=open?"none":"block";
    if(!open){ notifications.forEach(n=>n.read=true); document.querySelector(".notif-badge")?.remove(); }
  });
  document.querySelector("#clearNotif")?.addEventListener("click", async ()=>{
    notifications=[];
    try{ await db.from("notifications").delete().neq("id","00000000-0000-0000-0000-000000000000"); }catch(e){}
    render();
  });

  // ── Mobile sidebar ───────────────────────────────────
  document.querySelector("#menuToggle")?.addEventListener("click",()=>{
    document.querySelector("#sidebar")?.classList.toggle("open");
    document.querySelector("#sidebarOverlay")?.classList.toggle("active");
  });
  document.querySelector("#sidebarOverlay")?.addEventListener("click",()=>{
    document.querySelector("#sidebar")?.classList.remove("open");
    document.querySelector("#sidebarOverlay")?.classList.remove("active");
  });

  // Close notif on outside click
  document.addEventListener("click", e=>{
    const panel=document.querySelector("#notifPanel");
    const btn=document.querySelector("#toggleNotif");
    if(panel&&!panel.contains(e.target)&&btn&&!btn.contains(e.target)){
      panel.style.display="none";
    }
  }, {once:true});
}

// ═══════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════
function openScanner() {
  const modal=document.createElement("div"); modal.className="shipment-modal";
  modal.innerHTML=`<div class="shipment-modal-box">
    <h2>📷 مسح QR</h2>
    <div id="reader" style="width:100%;"></div>
    <button id="manualBtn" class="ghost-btn" style="margin-top:12px;width:100%;">إدخال كود يدوياً</button>
    <div class="modal-actions"><button id="closeScanner" class="ghost-btn">إغلاق</button></div>
  </div>`;
  document.body.appendChild(modal);
  document.querySelector("#manualBtn").onclick=()=>{
    const c=prompt("أدخل رقم الشحنة:");
    if(c){ modal.remove(); location.href=`${location.origin}${location.pathname}?track=${c}`; }
  };
  let scanner;
  try {
    scanner=new Html5Qrcode("reader");
    scanner.start({facingMode:"environment"},{fps:10,qrbox:250},
      t=>{scanner.stop();modal.remove();location.href=t;}).catch(()=>{});
  }catch(e){}
  document.querySelector("#closeScanner").onclick=async()=>{
    try{if(scanner)await scanner.stop();}catch(e){} modal.remove();
  };
}

function openNewShipmentModal() {
  const modal=document.createElement("div"); modal.className="shipment-modal";
  modal.innerHTML=`<div class="shipment-modal-box large">
    <h2>📦 شحنة جديدة</h2>
    <div class="form-grid">
      <input id="fCode"    placeholder="كود الشحنة *" style="font-weight:700;"/>
      <input id="fName"    placeholder="اسم العميل *"/>
      <input id="fPhone"   placeholder="الهاتف الأول *" type="tel"/>
      <input id="fPhone2"  placeholder="الهاتف الثاني (اختياري)" type="tel"/>
      <input id="fAmount"  placeholder="قيمة الطلب (ج.م) *" type="number"/>
      <input id="fFee"     placeholder="رسوم الشحن" type="number" value="60"/>
      <select id="fGov"><option value="">جاري تحميل المحافظات...</option></select>
      <select id="fCenter"><option value="">اختر المركز</option></select>
      <input id="fStreet"  placeholder="الشارع"/>
      <input id="fBuild"   placeholder="العمارة"/>
      <input id="fFloor"   placeholder="الدور"/>
      <input id="fApt"     placeholder="الشقة"/>
    </div>
    <textarea id="fNotes" placeholder="ملاحظات إضافية"
      style="width:100%;padding:10px;border-radius:var(--radius);border:1.5px solid var(--line);
             height:60px;resize:vertical;font-size:13px;margin-top:4px;box-sizing:border-box;"></textarea>
    <div id="shipErr" style="color:var(--danger);font-size:13px;margin-top:8px;display:none;
                             background:#fef2f2;padding:8px 12px;border-radius:var(--radius);"></div>
    <div class="modal-actions">
      <button id="saveShip" class="primary-btn">💾 حفظ الشحنة</button>
      <button id="closeShip" class="ghost-btn">إلغاء</button>
    </div>
  </div>`;
  document.body.appendChild(modal);

  // Load governorates
  fetch("./cities.json").then(r=>r.json()).then(data=>{
    window._egyptData=data[2]?.data||[];
    const govs={1:"القاهرة",2:"الجيزة",3:"الإسكندرية",4:"الدقهلية",5:"البحر الأحمر",
      6:"البحيرة",7:"الفيوم",8:"الغربية",9:"الإسماعيلية",10:"المنوفية",11:"المنيا",
      12:"القليوبية",13:"الوادي الجديد",14:"السويس",15:"أسوان",16:"أسيوط",
      17:"بني سويف",18:"بورسعيد",19:"دمياط",20:"الشرقية",21:"جنوب سيناء",22:"كفر الشيخ"};
    document.querySelector("#fGov").innerHTML=
      `<option value="">اختر المحافظة</option>`+
      Object.entries(govs).map(([id,n])=>`<option value="${id}">${n}</option>`).join("");
  }).catch(()=>{ const g=document.querySelector("#fGov"); if(g) g.innerHTML=`<option value="">تعذر التحميل</option>`; });

  document.querySelector("#fGov").addEventListener("change",e=>{
    const cities=(window._egyptData||[]).filter(x=>x.governorate_id==e.target.value);
    document.querySelector("#fCenter").innerHTML=
      `<option value="">اختر المركز</option>`+
      cities.map(c=>`<option value="${c.city_name_ar}">${c.city_name_ar}</option>`).join("");
  });

  document.querySelector("#closeShip").onclick=()=>modal.remove();

  document.querySelector("#saveShip").onclick=async()=>{
    const code   = document.querySelector("#fCode").value.trim();
    const cName  = document.querySelector("#fName").value.trim();
    const cPhone = document.querySelector("#fPhone").value.trim();
    const cPhone2= document.querySelector("#fPhone2").value.trim();
    const amount = Number(document.querySelector("#fAmount").value)||0;
    const fee    = Number(document.querySelector("#fFee").value)||60;
    const center = document.querySelector("#fCenter").value;
    const street = document.querySelector("#fStreet").value.trim();
    const build  = document.querySelector("#fBuild").value.trim();
    const floor  = document.querySelector("#fFloor").value.trim();
    const apt    = document.querySelector("#fApt").value.trim();
    const notes  = document.querySelector("#fNotes").value.trim();
    const errEl  = document.querySelector("#shipErr");
    const btn    = document.querySelector("#saveShip");

    if(!code||!cName||!cPhone||!amount){
      errEl.style.display="block";
      errEl.textContent="الحقول المطلوبة: كود الشحنة، اسم العميل، الهاتف، القيمة";
      return;
    }

    const addrParts=[center,street?`شارع ${street}`:"",build?`عمارة ${build}`:"",floor?`دور ${floor}`:"",apt?`شقة ${apt}`:""];
    const address=addrParts.filter(Boolean).join(" - ");

    btn.disabled=true; btn.innerHTML=`<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> جاري الحفظ...`;

    // Determine merchant info
    const isMerchant = state.user.role==="merchant";
    const insertData = {
      shipment_code:   code,
      customer_name:   cName,
      customer_phone:  cPhone,
      customer_phone2: cPhone2||null,
      address,
      amount,
      delivery_fee:    fee,
      status:          "created",
      eta:             "قيد التجهيز",
      notes:           notes||null,
      merchant_id:     isMerchant ? state.user.id : null,
      merchant_name:   isMerchant ? state.user.name : null,
      merchant_phone:  isMerchant ? (state.user.phone||null) : null,
    };

    const {error} = await db.from("shipments").insert([insertData]);

    if (error) {
      errEl.style.display="block";
      errEl.textContent = error.code==="23505"
        ? "كود الشحنة موجود بالفعل، اختر كوداً آخر"
        : "خطأ: "+error.message;
      btn.disabled=false; btn.innerHTML="💾 حفظ الشحنة";
      return;
    }

    await addTimeline(code,"تم إنشاء الشحنة");
    await addNotif(`شحنة جديدة: ${code} — ${cName}`,"admin");
    await audit("CREATE_SHIPMENT", code, `Created by ${state.user.name} for ${cName}`);

    modal.remove();
    await loadShipments();
    toast(`✅ تم إضافة الشحنة ${code} بنجاح`);
  };
}

function openAddUserModal() {
  const modal=document.createElement("div"); modal.className="shipment-modal";
  modal.innerHTML=`<div class="shipment-modal-box">
    <h2>👤 مستخدم جديد</h2>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
      <div class="form-field"><label>الاسم الكامل *</label>
        <input id="uName" placeholder="محمد أحمد"/></div>
      <div class="form-field"><label>البريد الإلكتروني *</label>
        <input id="uEmail" type="email" placeholder="user@example.com"/></div>
      <div class="form-field"><label>كلمة المرور *</label>
        <input id="uPass" type="password" placeholder="6 أحرف على الأقل"/></div>
      <div class="form-field"><label>الهاتف</label>
        <input id="uPhone" placeholder="01xxxxxxxxx" type="tel"/></div>
      <div class="form-field"><label>الدور</label>
        <select id="uRole">
          <option value="merchant">تاجر</option>
          <option value="courier">مندوب</option>
          <option value="customer">عميل</option>
          <option value="admin">إدارة</option>
        </select>
      </div>
    </div>
    <div id="uErr" style="color:var(--danger);font-size:13px;margin-top:8px;
                          background:#fef2f2;padding:8px 12px;border-radius:var(--radius);display:none;"></div>
    <div class="modal-actions">
      <button id="saveUser" class="primary-btn">حفظ</button>
      <button id="closeUser" class="ghost-btn">إلغاء</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  document.querySelector("#closeUser").onclick=()=>modal.remove();
  document.querySelector("#saveUser").onclick=async()=>{
    const name=document.querySelector("#uName").value.trim();
    const email=document.querySelector("#uEmail").value.trim();
    const pass=document.querySelector("#uPass").value;
    const phone=document.querySelector("#uPhone").value.trim();
    const role=document.querySelector("#uRole").value;
    const errEl=document.querySelector("#uErr");
    const btn=document.querySelector("#saveUser");
    if(!name||!email||!pass){errEl.style.display="block";errEl.textContent="يرجى تعبئة الحقول المطلوبة";return;}
    if(pass.length<6){errEl.style.display="block";errEl.textContent="كلمة المرور 6 أحرف على الأقل";return;}
    btn.disabled=true;btn.textContent="جاري الإنشاء...";
    const{data,error}=await db.auth.signUp({email,password:pass,options:{data:{full_name:name,role,phone}}});
    if(error){
      errEl.style.display="block";
      errEl.textContent=error.message.includes("already")?"البريد مسجل بالفعل":"خطأ: "+error.message;
      btn.disabled=false;btn.textContent="حفظ";return;
    }
    await db.from("profiles").upsert([{id:data.user.id,full_name:name,email,phone,role}]);
    await audit("CREATE_USER",data.user.id,`Admin created ${role}: ${email}`);
    users.push({id:data.user.id,name,email,phone,role,createdAt:new Date().toLocaleDateString("ar-EG"),balance:0,suspended:false});
    modal.remove(); render();
    toast(`✅ تم إنشاء ${name} كـ ${roleName(role)}`);
  };
}

// ═══════════════════════════════════════════════════════════
// GLOBAL WINDOW FUNCTIONS
// ═══════════════════════════════════════════════════════════
window.setFilter = (f)=>{ state.statusFilter=f; render(); };
window.goTo      = (view,filter)=>{ state.view=view; state.statusFilter=filter||"all"; render(); };
window.manualTrack=()=>{
  const c=prompt("أدخل رقم الشحنة:");
  if(c) location.href=`${location.origin}${location.pathname}?track=${encodeURIComponent(c.trim())}`;
};

window.updateStatus = async (id, status) => {
  const s=shipments.find(x=>x.id===id); if(!s) return;
  s.status=status;
  if(status==="delivered") s.eta="تم التسليم";

  const{error}=await db.from("shipments").update({status,eta:s.eta}).eq("shipment_code",id);
  if(error){toast("خطأ في التحديث: "+error.message,"error");return;}

  await addTimeline(id, STATUS[status]?.label||status);
  await addNotif(`شحنة ${id} → ${STATUS[status]?.label||status}`,"admin");
  await audit("UPDATE_STATUS", id, `${status} by ${state.user?.name}`);

  if(status==="delivered"||status==="returned"){
    push(status==="delivered"?"✅ تم التسليم":"↩ مرتجع", `شحنة ${id}`);
    if(confirm("إرسال إشعار واتساب للعميل؟")){
      const msg=`مرحباً ${s.customerName}\n\nشحنتك: ${s.id}\nالحالة: ${STATUS[status]?.label}\n\nالنخبة للشحن السريع`;
      window.open(`https://wa.me/2${s.customerPhone}?text=${encodeURIComponent(msg)}`);
    }
  }
  render();
};

window.assignCourier = async (id) => {
  const courierId=document.querySelector("#assignCourier")?.value;
  if(!courierId){toast("اختر مندوباً أولاً","error");return;}
  const s=shipments.find(x=>x.id===id); if(!s) return;

  const{error}=await db.from("shipments").update({courier_id:courierId}).eq("shipment_code",id);
  if(error){toast("خطأ في التعيين: "+error.message,"error");return;}

  s.courierId=courierId;
  const cn=users.find(u=>u.id===courierId)?.name||courierId;
  await addTimeline(id,`تم تعيين المندوب: ${cn}`);
  await addNotif(`مندوب ${cn} تم تعيينه لشحنة ${id}`,"courier");
  await audit("ASSIGN_COURIER",id,`${cn} assigned to ${id}`);
  push("📦 تعيين جديد",`شحنة ${id} تم تعيينها لك`);
  toast(`✅ تم تعيين ${cn}`);
  render();
};

window.uploadPOD = async (id, inputId) => {
  const file=document.querySelector(`#${CSS.escape(inputId)}`)?.files[0];
  if(!file){toast("اختر صورة أولاً","error");return;}
  if(file.size>5*1024*1024){toast("الحد الأقصى 5MB","error");return;}
  try {
    const ext=file.name.split(".").pop()||"jpg";
    const fn=`pod_${id}_${Date.now()}.${ext}`;
    const{error:upErr}=await db.storage.from("pod-images").upload(fn,file,{upsert:true});
    if(upErr) throw upErr;
    const{data:ud}=db.storage.from("pod-images").getPublicUrl(fn);
    const{error:urr}=await db.from("shipments").update({pod_url:ud.publicUrl}).eq("shipment_code",id);
    if(urr) throw urr;
    const s=shipments.find(x=>x.id===id); if(s) s.podUrl=ud.publicUrl;
    await addTimeline(id,"تم رفع إثبات التسليم");
    await audit("UPLOAD_POD",id,`POD by ${state.user?.name}`);
    toast("✅ تم رفع إثبات التسليم");
    render();
  }catch(err){toast("فشل الرفع: "+err.message,"error");}
};

window.exportExcel = () => {
  if(!can("export_excel")){toast("غير مصرح","error");return;}
  const data=visible().map(s=>({
    "كود الشحنة":s.id,"العميل":s.customerName,"الهاتف":s.customerPhone,
    "هاتف 2":s.customerPhone2||"","العنوان":s.address,
    "الحالة":STATUS[s.status]?.label||s.status,"المبلغ":s.amount,
    "الرسوم":s.deliveryFee,"التاجر":s.merchantName||""
  }));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Shipments");
  XLSX.writeFile(wb,`nukhba_${new Date().toLocaleDateString("en-GB").replace(/\//g,"-")}.xlsx`);
  audit("EXPORT_EXCEL","",`${data.length} shipments exported`);
};

window.printShipment = async id => {
  if(!can("print_shipment")){toast("غير مصرح","error");return;}
  const s=shipments.find(x=>x.id===id); if(!s) return;
  const el=document.createElement("div");
  el.style.cssText="width:700px;padding:30px;background:#fff;direction:rtl;font-family:Arial;position:fixed;top:-9999px;left:0;z-index:-1;";
  el.innerHTML=`<div style="border:2px solid #111;padding:24px;border-radius:12px;">
    <h1 style="text-align:center;margin-bottom:20px;color:#0f766e;">النخبة للشحن السريع</h1>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;">
      <div>
        <p><b>رقم الشحنة:</b> ${esc(s.id)}</p>
        <p><b>العميل:</b> ${esc(s.customerName)}</p>
        <p><b>الهاتف:</b> ${esc(s.customerPhone)}</p>
        ${s.customerPhone2?`<p><b>هاتف 2:</b> ${esc(s.customerPhone2)}</p>`:""}
        <p><b>المبلغ:</b> ${s.amount} ج.م</p>
        <p><b>رسوم الشحن:</b> ${s.deliveryFee} ج.م</p>
        <p><b>العنوان:</b> ${esc(s.address)}</p>
        ${s.merchantName?`<p><b>التاجر:</b> ${esc(s.merchantName)}</p>`:""}
      </div>
      <canvas id="printQR"></canvas>
    </div>
  </div>`;
  document.body.appendChild(el);
  await QRCode.toCanvas(document.querySelector("#printQR"),
    `${location.origin}${location.pathname}?track=${s.id}`,{width:150});
  const canvas=await html2canvas(el);
  const{jsPDF}=window.jspdf;
  const pdf=new jsPDF("p","mm","a4");
  pdf.addImage(canvas.toDataURL("image/png"),"PNG",10,10,190,130);
  pdf.save(`${s.id}.pdf`);
  el.remove();
  audit("PRINT_SHIPMENT",s.id,`Printed by ${state.user?.name}`);
};

window.editUser = (id) => {
  const u=users.find(x=>x.id===id); if(!u) return;
  const modal=document.createElement("div"); modal.className="shipment-modal";
  modal.innerHTML=`<div class="shipment-modal-box">
    <h2>✏️ تعديل المستخدم</h2>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
      <div class="form-field"><label>الاسم</label><input id="euName" value="${esc(u.name)}"/></div>
      <div class="form-field"><label>الهاتف</label><input id="euPhone" value="${esc(u.phone||"")}"/></div>
      <div class="form-field"><label>الدور</label>
        <select id="euRole">
          ${["admin","merchant","courier","customer"].map(r=>`<option value="${r}" ${u.role===r?"selected":""}>${roleName(r)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div id="euErr" style="color:var(--danger);font-size:13px;margin-top:8px;display:none;"></div>
    <div class="modal-actions">
      <button id="saveEU" class="primary-btn">حفظ التغييرات</button>
      <button id="closeEU" class="ghost-btn">إلغاء</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  document.querySelector("#closeEU").onclick=()=>modal.remove();
  document.querySelector("#saveEU").onclick=async()=>{
    const name=document.querySelector("#euName").value.trim();
    const phone=document.querySelector("#euPhone").value.trim();
    const role=document.querySelector("#euRole").value;
    const errEl=document.querySelector("#euErr");
    const btn=document.querySelector("#saveEU");
    if(!name){errEl.style.display="block";errEl.textContent="الاسم مطلوب";return;}
    btn.disabled=true;btn.textContent="جاري الحفظ...";
    const{error}=await db.from("profiles").update({full_name:name,phone,role}).eq("id",id);
    if(error){errEl.style.display="block";errEl.textContent="خطأ: "+error.message;btn.disabled=false;btn.textContent="حفظ التغييرات";return;}
    await audit("EDIT_USER",id,`Updated: name=${name}, role=${role}`);
    const idx=users.findIndex(x=>x.id===id);
    if(idx>=0) users[idx]={...users[idx],name,phone,role};
    modal.remove(); render();
    toast(`✅ تم تحديث ${name}`);
  };
};

window.toggleUser = async (id) => {
  const u=users.find(x=>x.id===id); if(!u) return;
  const ns=!u.suspended;
  const{error}=await db.from("profiles").update({suspended:ns}).eq("id",id);
  if(error){toast("فشل التحديث","error");return;}
  u.suspended=ns;
  await audit(ns?"SUSPEND_USER":"ACTIVATE_USER",id,`${state.user?.name} ${ns?"suspended":"activated"} ${u.email}`);
  toast(`${ns?"تم إيقاف":"تم تفعيل"} ${u.name}`);
  render();
};

window.deleteUser = async (id) => {
  const u=users.find(x=>x.id===id); if(!u) return;
  if(!confirm(`حذف المستخدم ${u.name}؟ لا يمكن التراجع.`)) return;
  const{error}=await db.from("profiles").delete().eq("id",id);
  if(error){toast("فشل الحذف: "+error.message,"error");return;}
  await audit("DELETE_USER",id,`${state.user?.name} deleted ${u.email}`);
  users=users.filter(x=>x.id!==id);
  toast(`تم حذف ${u.name}`,"info");
  render();
};

window.loadAudit = async () => {
  const container=document.querySelector("#auditTable"); if(!container) return;
  try {
    const{data,error}=await db.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(200);
    if(error) throw error;
    const logs=(data||[]).filter(l=>{
      const txt=`${l.username} ${l.action} ${l.target_id} ${l.role} ${l.details}`.toLowerCase();
      return txt.includes((state.auditFilter||"").toLowerCase());
    });
    if(!logs.length){
      container.innerHTML=`<div class="empty-state"><div class="empty-icon">📋</div><h3>لا يوجد سجل بعد</h3></div>`;
      return;
    }
    container.innerHTML=`<div class="table-wrap"><table>
      <thead><tr><th>الوقت</th><th>المستخدم</th><th>الدور</th><th>الإجراء</th><th>الهدف</th><th>التفاصيل</th></tr></thead>
      <tbody>
        ${logs.map(l=>`<tr>
          <td style="font-size:11px;color:var(--muted);white-space:nowrap;">${new Date(l.created_at).toLocaleString("ar-EG")}</td>
          <td><b>${esc(l.username||"—")}</b></td>
          <td><span class="badge ${roleColor(l.role)}">${roleName(l.role)}</span></td>
          <td><span class="audit-action">${esc(l.action)}</span></td>
          <td><code style="font-size:11px;">${esc(l.target_id||"—")}</code></td>
          <td style="font-size:12px;color:var(--muted);">${esc(l.details||"—")}</td>
        </tr>`).join("")}
      </tbody>
    </table></div>`;
  }catch(e){
    container.innerHTML=`<p style="color:var(--danger);padding:1rem;">تعذر تحميل السجل: ${e.message}</p>`;
  }
};

// ═══════════════════════════════════════════════════════════
// DATA FUNCTIONS
// ═══════════════════════════════════════════════════════════
async function addTimeline(shipmentCode, event) {
  try { await db.from("shipment_timeline").insert([{shipment_code:shipmentCode,event}]); }
  catch(e){ console.warn("Timeline:",e.message); }
}

async function loadTimeline(shipmentCode) {
  const el=document.querySelector(`#timeline-${shipmentCode}`); if(!el) return;
  try {
    const{data,error}=await db.from("shipment_timeline")
      .select("*").eq("shipment_code",shipmentCode).order("created_at",{ascending:true});
    if(error) throw error;
    if(!data?.length){
      el.innerHTML=`<h4>سجل الشحنة</h4><p style="color:var(--muted);font-size:13px;">لا يوجد سجل بعد</p>`;
      return;
    }
    el.innerHTML=`<h4>سجل الشحنة</h4>${data.map(e=>`
      <div class="timeline-item">
        <span class="tl-dot"></span>
        <div><b>${esc(e.event)}</b><small>${new Date(e.created_at).toLocaleString("ar-EG")}</small></div>
      </div>`).join("")}`;
  }catch(e){
    el.innerHTML=`<h4>سجل الشحنة</h4><p style="color:var(--muted);font-size:13px;">تعذر التحميل</p>`;
  }
}

async function addNotif(text, role="admin") {
  try {
    await db.from("notifications").insert([{text,role}]);
    notifications.unshift({text,role,time:new Date().toLocaleTimeString("ar-EG"),read:false});
  }catch(e){ console.warn("Notif:",e.message); }
}

async function loadNotifications() {
  try {
    const role=state.user?.role||"customer";
    if(role==="customer"){notifications=[];return;}
    let q=db.from("notifications").select("*").order("created_at",{ascending:false}).limit(20);
    if(role==="courier")       q=q.eq("role","courier");
    else if(role==="merchant") q=q.in("role",["merchant","admin"]);
    const{data}=await q;
    if(data) notifications=data.map(n=>({text:n.text,role:n.role,time:new Date(n.created_at).toLocaleTimeString("ar-EG"),read:false}));
  }catch(e){console.warn("loadNotif:",e.message);}
}

async function loadUsers() {
  try {
    const{data,error}=await db.from("profiles").select("*").order("created_at",{ascending:false});
    if(error) throw error;
    if(data?.length) users=data.map(u=>({
      id:u.id, name:u.full_name||"—", email:u.email||"—", phone:u.phone||"—",
      role:u.role||"customer", suspended:u.suspended||false,
      createdAt:u.created_at?new Date(u.created_at).toLocaleDateString("ar-EG"):"—", balance:0
    }));
  }catch(e){console.warn("loadUsers:",e.message);}
}

async function loadShipments() {
  try {
    const{data,error}=await db.from("shipments").select("*").order("created_at",{ascending:false});
    if(error) throw error;
    shipments=data.map(mapRow);
    if(!state.selectedShipment&&shipments.length) state.selectedShipment=shipments[0].id;
    render();
  }catch(err){
    console.error("loadShipments:",err);
    const app=document.querySelector("#app");
    if(app){
      const b=document.createElement("div");
      b.style.cssText="background:#fef2f2;color:var(--danger);padding:12px;text-align:center;font-size:13px;";
      b.textContent="تعذر تحميل الشحنات — "+err.message;
      app.prepend(b);
    }
    render();
  }
}

// ═══════════════════════════════════════════════════════════
// PWA
// ═══════════════════════════════════════════════════════════
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

// ═══════════════════════════════════════════════════════════
// BOOT — check session and route correctly
// ═══════════════════════════════════════════════════════════
(async () => {
  const params  = new URLSearchParams(window.location.search);
  const trackId = params.get("track");

  // Public tracking URL — skip auth
  if (trackId) {
    state.selectedShipment = trackId;
    state.view = "track";
    state.user = {role:"customer", id:"guest", name:"زائر"};
    await loadShipments();
    return;
  }

  // Check for existing valid session
  const session = getSession();
  if (session?.id) {
    // Verify session is still valid with Supabase
    const {data:{session:supa}} = await db.auth.getSession();
    if (supa && supa.user.id === session.id) {
      // Session valid — check for suspension
      const profile = await getProfile(session.id);
      if (profile?.suspended) {
        clearSession();
        state.page="auth"; state.authMode="login";
        render();
        toast("هذا الحساب موقوف. تواصل مع الإدارة.","error");
        return;
      }
      // Refresh role from profile
      state.user = {
        ...session,
        role:  profile?.role  || session.role,
        name:  profile?.full_name || session.name,
        phone: profile?.phone || session.phone
      };
      state.page = "dashboard";
      state.view = state.user.role==="customer"?"track":
                   state.user.role==="courier"?"tasks":
                   state.user.role==="merchant"?"shipments":"overview";
      saveSession(state.user);
      await loadNotifications();
      await loadShipments();
      if (state.user.role==="admin"||state.user.role==="merchant") await loadUsers();
      if (state.user.role==="admin") startRealtime();
      await askPush();
      return;
    } else {
      clearSession();
    }
  }

  // No valid session — show homepage
  state.page = "home";
  await loadShipments(); // load for tracking widget
  render();
})();
