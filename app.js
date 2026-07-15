// ═══════════════════════════════════════════════════════════
// AL-NUKHBA EXPRESS — app.js v6
// Clean Architecture · Fixed FK · Real Couriers · Pro UI
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = "https://urktddxiyzwsilddamci.supabase.co";
const SUPABASE_KEY = "sb_publishable_-0wKJXXI18TuHK7pe-dKYw_HWyjH79u";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── CONFIG ────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// SMS PROVIDER CONFIGURATION
// Set SMS_PROVIDER to one of: "twilio" | "vonage" | "http_gateway" | "stub"
// Fill in the credentials for your chosen provider.
// Only DB.sendSMS() reads this block — no other code changes needed.
// ══════════════════════════════════════════════════════════════
const SMS_CONFIG = {
  // ── Active provider ──────────────────────────────────────
  // Change this to "twilio", "vonage", or "http_gateway" when ready.
  provider: "stub",

  // ── Twilio ───────────────────────────────────────────────
  // Sign up at https://twilio.com — free trial available
  twilio: {
    accountSid:  "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",  // Settings > Account SID
    authToken:   "your_auth_token_here",                // Settings > Auth Token
    fromNumber:  "+1234567890",                         // Your Twilio phone number
    // API endpoint (do not change)
    endpoint: (sid) => `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
  },

  // ── Vonage (Nexmo) ───────────────────────────────────────
  // Sign up at https://dashboard.nexmo.com
  vonage: {
    apiKey:     "xxxxxxxx",           // API Settings > API key
    apiSecret:  "xxxxxxxxxxxxxxxx",   // API Settings > API secret
    fromName:   "AlNukhba",          // Sender name (max 11 chars, Arabic not supported)
    endpoint:   "https://rest.nexmo.com/sms/json",
  },

  // ── Generic HTTP Gateway ─────────────────────────────────
  // For local Egyptian providers: ConnectMisr, Unifonic, Myfa7el, etc.
  // Check your provider's API docs and fill in the fields below.
  http_gateway: {
    endpoint:   "https://api.yourprovider.com/send",   // Provider API URL
    method:     "POST",                                 // POST or GET
    // Request body fields — map to your provider's parameter names:
    params: {
      username:  "your_username",
      password:  "your_password",
      from:      "AlNukhba",       // Sender ID registered with provider
      // "to" and "text" are injected automatically from the call
    },
    // Response: provider returns success if this field is truthy
    successField: "status",        // e.g. "status", "result", "code"
    successValue: "success",       // e.g. "success", "0", "OK", 200
  },
};

const STATUS_MAP = {
  draft:            { label:"مسودة",             badge:"badge-gray",    step:0  },
  submitted:        { label:"تم الإرسال",        badge:"badge-info",    step:1  },
  pickup_requested: { label:"طلب استلام",        badge:"badge-info",    step:2  },
  picked_up:        { label:"تم الاستلام",       badge:"badge-warning", step:3  },
  at_warehouse:     { label:"في المستودع",       badge:"badge-warning", step:4  },
  in_transit:       { label:"في الطريق",         badge:"badge-brand",   step:5  },
  at_branch:        { label:"في الفرع",          badge:"badge-brand",   step:6  },
  out_for_delivery: { label:"خرجت للتسليم",      badge:"badge-brand",   step:7  },
  delivered:        { label:"تم التسليم",        badge:"badge-success", step:8  },
  returned:         { label:"مرتجع",             badge:"badge-danger",  step:-1 },
  rescheduled:      { label:"إعادة جدولة",       badge:"badge-warning", step:-1 },
  cancelled:        { label:"ملغية",             badge:"badge-gray",    step:-1 },
  suspended:        { label:"موقوفة",            badge:"badge-danger",  step:-1 },
  // Legacy aliases
  created:          { label:"تم إنشاء الشحنة",  badge:"badge-info",    step:1  },
  received:         { label:"تم الاستلام",       badge:"badge-warning", step:3  },
  warehouse:        { label:"في المخزن",         badge:"badge-warning", step:4  },
  hub:              { label:"مركز الفرز",        badge:"badge-brand",   step:6  },
};

const SERVICE_MAP = {
  door_to_door: { label:"توصيل للباب",     icon:"🚪" },
  drop_off:     { label:"إيداع في الفرع",  icon:"📦" },
  pickup:       { label:"استلام من الفرع", icon:"🏪" },
};

const ORDER_TYPE_MAP = {
  express:   { label:"سريع",   badge:"badge-danger",  icon:"⚡" },
  standard:  { label:"عادي",   badge:"badge-info",    icon:"📦" },
  scheduled: { label:"مجدول",  badge:"badge-warning", icon:"📅" },
};

const STATUS_STEPS = [
  "submitted","pickup_requested","picked_up",
  "at_warehouse","in_transit","at_branch",
  "out_for_delivery","delivered"
];

// STATUS_STEPS defined above in STATUS_MAP block

const ROLE_MAP = {
  admin:    { label:"إدارة",  badge:"badge-danger",  nav:["overview","shipments","tasks","accounts","finance","pricing","branches","liveops","reports","users","merchants","import","audit","track"] },
  merchant: { label:"تاجر",  badge:"badge-success", nav:["overview","shipments","addresses","recipients","products","pickup","import","accounts"] },
  courier:  { label:"مندوب", badge:"badge-brand",   nav:["tasks","accounts"] },
  customer: { label:"عميل",  badge:"badge-info",    nav:["track","accounts"] }
};

const NAV_LABELS = {
  overview:"الرئيسية", shipments:"الشحنات", tasks:"مهامي",
  accounts:"الحساب",   reports:"التقارير",  users:"المستخدمين",
  audit:"سجل النشاط",  track:"تتبع",
  merchants:"التجار",  finance:"المالية",  pricing:"الأسعار",  branches:"الفروع",  import:"الاستيراد",  liveops:"العمليات المباشرة",
  addresses:"دفتر العناوين", recipients:"العملاء",
  products:"المنتجات",       pickup:"طلبات الاستلام"
};

// Live permission set — loaded from DB on login via get_user_permissions(uid)
// Fallback used only if DB call fails (e.g. network error on first load)
const PERMS_FALLBACK = {
  admin:    ["shipments.view_all","shipments.create","shipments.edit","shipments.delete",
             "shipments.cancel","shipments.change_status","shipments.assign_courier",
             "shipments.print","shipments.export","shipments.upload_pod","shipments.view_internal",
             "finance.view","finance.export","finance.settle","finance.manage",
             "users.view","users.create","users.edit","users.delete","users.suspend","users.assign_roles",
             "roles.view","roles.create","roles.edit","roles.delete",
             "reports.view","reports.courier_perf","reports.merchant_perf","reports.financial","reports.operational",
             "tracking.public","navigation.maps","audit.view","settings.view","settings.manage"],
  merchant: ["shipments.view_own","shipments.create","shipments.print","shipments.export",
             "finance.view","finance.settle","reports.view","reports.merchant_perf","tracking.public"],
  courier:  ["shipments.view_assigned","shipments.change_status","shipments.upload_pod",
             "navigation.maps","tracking.public","finance.view"],
  customer: ["tracking.public"]
};

// Active permission set (populated from DB on login)
const AppPerms = new Set();

async function loadUserPermissions(userId) {
  // Guest users get no permissions — skip DB call
  if (!userId || userId === "guest") {
    AppPerms.clear();
    (PERMS_FALLBACK.customer).forEach(p => AppPerms.add(p));
    return false;
  }
  try {
    const { data, error } = await db.rpc("get_user_permissions", { p_user_id: userId });
    if (error) throw error;
    const perms = Array.isArray(data) ? data : [];
    if (perms.length === 0) throw new Error("empty permissions returned from DB");
    AppPerms.clear();
    perms.forEach(p => AppPerms.add(p.code));
    console.log("[Auth] Permissions loaded from DB:", AppPerms.size, "for user", userId);
    return true;
  } catch(e) {
    console.warn("[Auth] loadUserPermissions fallback:", e.message);
    AppPerms.clear();
    const role = AppState.user?.primary_role || AppState.user?.role || "customer";
    (PERMS_FALLBACK[role] || PERMS_FALLBACK.customer).forEach(p => AppPerms.add(p));
    console.log("[Auth] Using fallback permissions:", AppPerms.size, "for role:", role);
    return false;
  }
}

// Full Egypt governorates/cities dataset — loaded from cities.json
// EGYPT_GOV is populated on first modal open via loadEgyptData()
let EGYPT_GOV = {};
let EGYPT_GOV_LOADED = false;

async function loadEgyptData() {
  if (EGYPT_GOV_LOADED) return;

  try {
    const res = await fetch("./cities.json");
    const data = await res.json();

    const rows = data[2]?.data || [];

    const GOV_MAP = {
      "1":"القاهرة",
      "2":"الجيزة",
      "3":"الإسكندرية",
      "4":"الدقهلية",
      "5":"البحر الأحمر",
      "6":"البحيرة",
      "7":"الفيوم",
      "8":"الغربية",
      "9":"الإسماعيلية",
      "10":"المنوفية",
      "11":"المنيا",
      "12":"القليوبية",
      "13":"الوادي الجديد",
      "14":"السويس",
      "15":"أسوان",
      "16":"أسيوط",
      "17":"بني سويف",
      "18":"بورسعيد",
      "19":"دمياط",
      "20":"الشرقية",
      "21":"جنوب سيناء",
      "22":"كفر الشيخ",
      "23":"مطروح",
      "24":"الأقصر",
      "25":"قنا",
      "26":"شمال سيناء",
      "27":"سوهاج"
    };

    const gov = {};

    rows.forEach(r => {
      const g = GOV_MAP[r.governorate_id];
      const c = r.city_name_ar;

      if (!g || !c) return;

      if (!gov[g]) gov[g] = [];

      if (!gov[g].includes(c))
        gov[g].push(c);
    });

    Object.keys(gov).forEach(g => gov[g].sort());

    EGYPT_GOV = gov;
    EGYPT_GOV_LOADED = true;

    console.log(
      "[Cities] Loaded",
      Object.keys(gov).length,
      "governorates",
      rows.length,
      "cities"
    );

  } catch (e) {
    console.error(e);
  }
}

// ── STATE ─────────────────────────────────────────────────
const AppState = {
  page:"home", authMode:"login", user:null, view:"overview",
  query:"", statusFilter:"all", serviceFilter:"", orderFilter:"",
  selectedShipment:null,
  userFilter:"", auditFilter:"",
  shipments:[], users:[], couriers:[], notifications:[],
  realtimeChannel:null,
  // Phase 2A — merchant portal (own data)
  merchantAddresses:[], merchantRecipients:[], merchantProducts:[],
  pickupRequests:[], merchantBalance:0,
  // Admin merchant management
  allMerchants:[], selectedMerchantId:"", adminMerchantTab:"shipments",
  // Phase 2B finance
  financeTab:"overview", financeRange:"today",
  driverWallet:[], codReconciliation:[], expenses:[],
  // Phase 2C pricing
  pricingZones:[], pricingRules:[], pricingTab:"rules",
  lastFeeCalc:null,
  // Phase 2D branches & warehouses
  branches:[], warehouses:[], branchTab:"branches",
  selectedBranchId:"",
  // Phase 3: driver self-service wallet
  myWalletBalance:0, myWalletTxns:[],
  // Bulk import wizard
  importBatches:[], importWizard:null, _importDataLoaded:false,
  // Phase 9 reports
  reportsTab:"overview", reportRange:"month", reportCourier:"", reportMerchant:"",
  // Phase 4 live ops
  liveActivityFeed:[], rtConnected:false, rtEventCount:0,
};

// ── UTILS ─────────────────────────────────────────────────
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

const money = v =>
  new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(v||0);

const pct = (a,b) => b>0 ? Math.round((a/b)*100) : 0;

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ar-EG",{year:"numeric",month:"short",day:"numeric"});
}
function fmtTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ar-EG");
}
function initials(name) {
  if (!name) return "؟";
  const p = name.trim().split(" ");
  return p.length>=2 ? p[0][0]+p[1][0] : p[0][0];
}

const ICONS = {
  box:     "M20.5 7.3 12 2.5 3.5 7.3 12 12.1l8.5-4.8ZM3.5 7.3v9.4L12 21.5v-9.4L3.5 7.3Zm17 0L12 12.1v9.4l8.5-4.8V7.3Z",
  truck:   "M3 7h11v9H3V7Zm11 3h4l3 4v2h-7v-6ZM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  user:    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0H5Z",
  users:   "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3Zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z",
  wallet:  "M4 6h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Zm13 7h4v-2h-4a2 2 0 0 0 0 4h4v-2h-4Z",
  search:  "M10 4a6 6 0 1 0 3.7 10.7l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4Z",
  plus:    "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
  chart:   "M4 19V5h2v14H4Zm7 0V9h2v10h-2Zm7 0V3h2v16h-2Z",
  logout:  "M5 4h8v2H7v12h6v2H5V4Zm10.5 4.5L20 13l-4.5 4.5-1.4-1.4 2.1-2.1H10v-2h6.2l-2.1-2.1 1.4-1.4Z",
  bell:    "M12 2a7 7 0 0 1 7 7v4l2 2v1H3v-1l2-2V9a7 7 0 0 1 7-7Zm0 20a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2Z",
  edit:    "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z",
  trash:   "M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z",
  shield:  "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4Z",
  log:     "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm4 18H6V4h7v5h5v11ZM8 15h8v2H8zm0-4h8v2H8z",
  menu:    "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z",
  close:   "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  phone:   "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2Z",
  map:     "M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z",
  qr:      "M3 11V3h8v8H3Zm2-6v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 21v-8h8v8H3Zm2-6v4h4v-4H5Zm13 0h-2v-2h2v2Zm0 4h-2v-2h2v2Zm2 2h-2v-2h2v2Zm0-4h-2v-2h2v2Zm-4-4h-2v-2h2v2Zm4 0h-2v-2h2v2Z",
  pkg:     "M17 4H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-3 9h-2v2H8v-2H6v-2h2V9h4v2h2v2z",
  refresh: "M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
};

function icon(name, size=16) {
  const d = ICONS[name]||ICONS.box;
  return `<svg viewBox="0 0 24 24" style="width:${size}px;height:${size}px;fill:currentColor;flex-shrink:0;"><path d="${d}"/></svg>`;
}

// Permission code aliases — maps legacy UI checks to new DB codes.
// Add new aliases here when new permissions are created in the DB.
const PERM_ALIAS = {
  // Legacy → new DB code
  "create_shipment":  "shipments.create",
  "edit_shipment":    "shipments.edit",
  "delete_shipment":  "shipments.delete",
  "assign_courier":   "shipments.assign_courier",
  "change_status":    "shipments.change_status",
  "upload_pod":       "shipments.upload_pod",
  "print_shipment":   "shipments.print",
  "export_excel":     "shipments.export",
  "view_all":         "shipments.view_all",
  "view_own":         "shipments.view_own",
  "view_assigned":    "shipments.view_assigned",
  "view_internal":    "shipments.view_internal",
  "manage_users":     "users.view",
  "view_reports":     "reports.view",
  "view_audit":       "audit.view",
  "navigation":       "navigation.maps",
  "track":            "tracking.public",
  "view_accounts":    "finance.view",
};

function can(p) {
  if (!AppState.user) return false;
  // Resolve alias if provided (legacy code path)
  const resolved = PERM_ALIAS[p] || p;
  // Check live DB permission set first
  if (AppPerms.size > 0) return AppPerms.has(resolved);
  // Fallback: check hardcoded set for primary role
  const role = AppState.user.primary_role || (AppState.user.primary_role||AppState.user.role) || "customer";
  const fallback = PERMS_FALLBACK[role] || [];
  return fallback.includes(resolved) || fallback.includes(p);
}

// ── TOAST ─────────────────────────────────────────────────
function ensureToastWrap() {
  let w=document.querySelector(".toast-wrap");
  if(!w){w=document.createElement("div");w.className="toast-wrap";document.body.appendChild(w);}
  return w;
}
function toast(msg, type="success", duration=3500) {
  const wrap=ensureToastWrap();
  const el=document.createElement("div");
  el.className=`toast toast-${type}`;
  el.textContent=msg;
  wrap.appendChild(el);
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add("show")));
  setTimeout(()=>{el.classList.remove("show");setTimeout(()=>el.remove(),350);},duration);
}

// ── SESSION ───────────────────────────────────────────────
function getSession()   { try{return JSON.parse(localStorage.getItem("nukhba_v6")||"null");}catch(e){return null;} }
function saveSession(u) { localStorage.setItem("nukhba_v6",JSON.stringify(u)); }
function clearSession() { ["nukhba_v6","nukhba_v5","nukhba_session"].forEach(k=>localStorage.removeItem(k)); }

// ── DATABASE SERVICES ─────────────────────────────────────
const DB = {
  async getProfile(uid) {
    try {
      const { data, error } = await db.from("profiles")
        .select("id,full_name,email,phone,primary_role,is_active,is_suspended,is_deleted")
        .eq("id", uid).single();
      if (error) throw error;
      return data;
    } catch(e) { return null; }
  },
  async loadShipments() {
    const{data,error}=await db.from("shipments").select("*").order("created_at",{ascending:false});
    if(error)throw error;
    return data.map(mapRow);
  },
  async loadCouriers() {
    const { data, error } = await db.from("profiles")
      .select("id,full_name,phone,email,primary_role,is_active")
      .eq("primary_role","courier")
      .eq("is_active", true)
      .eq("is_deleted", false)
      .order("full_name");
    if (error) {
      console.warn("loadCouriers:", error.message);
      return [];
    }
    const result = data || [];
    console.log("[Couriers] Loaded:", result.length);
    return result;
  },
  async loadUsers() {
    const{data,error}=await db.from("profiles").select("*").eq("is_deleted",false).order("created_at",{ascending:false});
    if(error){console.warn("loadUsers:",error.message);return[];}
    return(data||[]).map(u=>({
      id:u.id,name:u.full_name||"—",email:u.email||"—",phone:u.phone||"—",
      role:u.primary_role||"customer",isActive:u.is_active!==false,
      is_suspended:u.is_suspended||false,suspended:u.is_suspended||false,
      createdAt:fmtDate(u.created_at),balance:0
    }));
  },
  async loadNotifications(role) {
    if(role==="customer")return[];
    let q=db.from("notifications").select("*").order("created_at",{ascending:false}).limit(20);
    if(role==="courier")       q=q.eq("recipient_role","courier");
    else if(role==="merchant") q=q.in("recipient_role",["merchant","admin"]);
    const{data}=await q;
    return(data||[]).map(n=>({
      text:n.body||n.text||"",
      role:n.recipient_role||n.role||"admin",
      time:fmtTime(n.created_at),
      isRead:n.is_read||false
    }));
  },
  async createShipment(data) {
    const{error}=await db.from("shipments").insert([data]);
    if(error)throw error;
  },
  async updateShipment(code,patch) {
    const{error}=await db.from("shipments").update({...patch,updated_at:new Date().toISOString()}).eq("shipment_code",code);
    if(error)throw error;
  },
  async addTimeline(code,event,actorName="",actorRole="",eventType="status_change") {
    try{await db.from("shipment_timeline").insert([{
      shipment_code:code, event, event_type:eventType,
      actor_id:AppState.user?.id||null,
      actor_name:actorName, actor_role:actorRole
    }]);}
    catch(e){console.warn("timeline:",e.message);}
  },
  async loadTimeline(code) {
    const{data}=await db.from("shipment_timeline")
      .select("*").eq("shipment_code",code).order("created_at",{ascending:true});
    return data||[];
  },
  async addNotification(body,recipientRole="admin",referenceId="",type="info") {
    try{await db.from("notifications").insert([{
      body, recipient_role:recipientRole,
      reference_id:referenceId, type
    }]);}
    catch(e){console.warn("notif:",e.message);}
  },
  async addAudit(action, entityId="", details="", entityType="shipment") {
    if (!AppState.user) return;
    try {
      await db.from("audit_logs").insert([{
        actor_id:    AppState.user.id,
        actor_name:  AppState.user.name,
        actor_role:  AppState.user.primary_role || (AppState.user.primary_role||AppState.user.role),
        action,
        entity_type: entityType,
        entity_id:   String(entityId),
        details
      }]);
    } catch(e) { console.warn("audit:", e.message); }
  },
  async loadAuditLogs(filter="") {
    const{data,error}=await db.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(300);
    if(error)throw error;
    const logs=data||[];
    if(!filter)return logs;
    const f=filter.toLowerCase();
    return logs.filter(l=>`${l.actor_name} ${l.action} ${l.entity_id} ${l.actor_role} ${l.details}`.toLowerCase().includes(f));
  },
  // ── Phase 2A: Merchant Portal ─────────────────────────────
  // ── Admin: load all merchants list ──────────────────────────
  // ── Phase 2B: Financial ─────────────────────────────────────
  async loadDriverTransactions(driverId) {
    const { data, error } = await db.from("driver_transactions")
      .select("*").eq("driver_id", driverId)
      .order("created_at",{ascending:false}).limit(100);
    if (error) { console.warn("loadDriverTransactions:", error.message); return []; }
    return data || [];
  },

  // ── Phase 3: OTP delivery verification ───────────────────
  // ── SMS abstraction layer ─────────────────────────────────
  // Reads SMS_CONFIG.provider — swap provider there, no code changes here.
  // All providers normalise the phone number to E.164 (+20xxxxxxxxxx for Egypt).
  async sendSMS(phone, message) {
    // Normalise Egyptian phone number to E.164 format
    const normalised = phone.replace(/\s+/g,"").replace(/^0/,"+20").replace(/^(\+?20)/,"+20");

    const cfg = SMS_CONFIG;

    // ── Stub (dev/test mode) ──────────────────────────────
    if (!cfg.provider || cfg.provider === "stub") {
      console.log(`[SMS STUB → ${normalised}]: ${message}`);
      return { success: true, provider: "stub", to: normalised };
    }

    // ── Twilio ────────────────────────────────────────────
    if (cfg.provider === "twilio") {
      const t   = cfg.twilio;
      const creds = btoa(`${t.accountSid}:${t.authToken}`);
      const body  = new URLSearchParams({
        To:   normalised,
        From: t.fromNumber,
        Body: message,
      });
      const res = await fetch(t.endpoint(t.accountSid), {
        method:  "POST",
        headers: {
          "Authorization": `Basic ${creds}`,
          "Content-Type":  "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("Twilio SMS error:", data);
        throw new Error(data.message || "Twilio send failed");
      }
      console.log(`[SMS via Twilio → ${normalised}] SID: ${data.sid}`);
      return { success: true, provider: "twilio", sid: data.sid, to: normalised };
    }

    // ── Vonage ────────────────────────────────────────────
    if (cfg.provider === "vonage") {
      const v = cfg.vonage;
      const res = await fetch(v.endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key:    v.apiKey,
          api_secret: v.apiSecret,
          from:       v.fromName,
          to:         normalised.replace("+",""),  // Vonage uses without +
          text:       message,
        }),
      });
      const data = await res.json();
      const msg  = data.messages?.[0];
      if (!msg || msg.status !== "0") {
        console.error("Vonage SMS error:", msg);
        throw new Error(msg?.["error-text"] || "Vonage send failed");
      }
      console.log(`[SMS via Vonage → ${normalised}] MsgID: ${msg["message-id"]}`);
      return { success: true, provider: "vonage", messageId: msg["message-id"], to: normalised };
    }

    // ── Generic HTTP Gateway (ConnectMisr / Unifonic / etc.) ──
    if (cfg.provider === "http_gateway") {
      const g = cfg.http_gateway;
      const payload = {
        ...g.params,
        to:   normalised,
        text: message,
      };
      const res = await fetch(g.endpoint, {
        method:  g.method || "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      const isOk = g.successField
        ? String(data[g.successField]) === String(g.successValue)
        : res.ok;
      if (!isOk) {
        console.error("HTTP Gateway SMS error:", data);
        throw new Error(JSON.stringify(data));
      }
      console.log(`[SMS via HTTP Gateway → ${normalised}]`);
      return { success: true, provider: "http_gateway", to: normalised };
    }

    throw new Error(`Unknown SMS provider: "${cfg.provider}"`);
  },

  async generateAndSendOTP(shipmentCode, customerPhone) {
    const otp = String(Math.floor(100000 + Math.random()*900000)); // 6-digit
    const { error } = await db.from("shipments")
      .update({ otp_code: otp, otp_verified: false })
      .eq("shipment_code", shipmentCode);
    if (error) { console.warn("generateAndSendOTP:", error.message); return null; }
    await DB.sendSMS(customerPhone,
      `النخبة للشحن السريع: كود التحقق لتسليم شحنتك ${shipmentCode} هو ${otp}`);
    return otp;
  },

  async verifyOTP(shipmentCode, enteredCode) {
    const { data, error } = await db.from("shipments")
      .select("otp_code").eq("shipment_code", shipmentCode).single();
    if (error) { console.warn("verifyOTP:", error.message); return false; }
    const isValid = data?.otp_code && data.otp_code === enteredCode.trim();
    if (isValid) {
      await db.from("shipments").update({
        otp_verified: true,
        otp_verified_at: new Date().toISOString(),
      }).eq("shipment_code", shipmentCode);
    }
    return isValid;
  },

  async loadDriverBalance(driverId) {
    const { data, error } = await db.rpc("get_driver_balance",{p_driver_id:driverId});
    if (error) { console.warn("loadDriverBalance:", error.message); return 0; }
    return Number(data)||0;
  },

  async loadInvoices(merchantId) {
    let q = db.from("invoices").select("*").order("created_at",{ascending:false});
    if (merchantId) q = q.eq("merchant_id", merchantId);
    const { data, error } = await q.limit(100);
    if (error) { console.warn("loadInvoices:", error.message); return []; }
    return data || [];
  },

  async loadExpenses(category) {
    let q = db.from("expenses").select("*").order("expense_date",{ascending:false}).limit(200);
    if (category) q = q.eq("category", category);
    const { data, error } = await q;
    if (error) { console.warn("loadExpenses:", error.message); return []; }
    return data || [];
  },

  async loadCodReconciliation(driverId, date) {
    let q = db.from("cod_reconciliation").select("*").order("reconcile_date",{ascending:false});
    if (driverId) q = q.eq("driver_id", driverId);
    if (date)     q = q.eq("reconcile_date", date);
    const { data, error } = await q.limit(100);
    if (error) { console.warn("loadCodReconciliation:", error.message); return []; }
    return data || [];
  },

  async getFinancialSummary(start, end) {
    const { data, error } = await db.rpc("get_financial_summary",
      { p_start:start, p_end:end });
    if (error) { console.warn("getFinancialSummary:", error.message); return {}; }
    const result = {};
    (data||[]).forEach(r => { result[r.metric] = Number(r.value)||0; });
    return result;
  },

  // ── Phase 2C: Pricing Engine ─────────────────────────────
  async loadPricingZones() {
    const { data, error } = await db.from("pricing_zones")
      .select("*").eq("is_active", true).order("sort_order");
    if (error) { console.warn("loadPricingZones:", error.message); return []; }
    return data || [];
  },

  async loadPricingRules(merchantId) {
    let q = db.from("pricing_rules")
      .select(`*, pricing_zones(name,code)`)
      .eq("is_active", true)
      .order("priority", { ascending: false });
    if (merchantId) q = q.or(`merchant_id.eq.${merchantId},merchant_id.is.null`);
    const { data, error } = await q.limit(200);
    if (error) { console.warn("loadPricingRules:", error.message); return []; }
    return data || [];
  },

  async calculateFee(merchantId, governorate, serviceType, orderType, weight) {
    const { data, error } = await db.rpc("calculate_shipping_fee", {
      p_merchant_id:  merchantId  || null,
      p_governorate:  governorate || "",
      p_service_type: serviceType || "door_to_door",
      p_order_type:   orderType   || "standard",
      p_weight:       weight      || 0,
    });
    if (error) { console.warn("calculateFee:", error.message); return null; }
    return (data && data.length > 0) ? data[0] : null;
  },

  // ── Phase 2D: Branches & Warehouses ──────────────────────
  async loadBranches() {
    const { data, error } = await db.from("branches")
      .select("*").eq("is_deleted",false).order("name");
    if (error) { console.warn("loadBranches:", error.message); return []; }
    return data || [];
  },

  async loadWarehouses() {
    const { data, error } = await db.from("warehouses")
      .select("*").eq("is_deleted",false).order("name");
    if (error) { console.warn("loadWarehouses:", error.message); return []; }
    return data || [];
  },

  async loadBranchLog(shipmentCode) {
    const { data, error } = await db.from("shipment_branch_log")
      .select("*").eq("shipment_code",shipmentCode)
      .order("created_at",{ascending:true});
    if (error) { console.warn("loadBranchLog:", error.message); return []; }
    return data || [];
  },

  async getBranchMetrics(branchId, start, end) {
    const { data, error } = await db.rpc("get_branch_metrics",
      { p_branch_id:branchId, p_start:start, p_end:end });
    if (error) { console.warn("getBranchMetrics:", error.message); return {}; }
    const result = {};
    (data||[]).forEach(r => { result[r.metric] = Number(r.value)||0; });
    return result;
  },

  // ── Bulk Import ─────────────────────────────────────────────
  async loadImportBatches(merchantId) {
    let q = db.from("import_batches")
      .select("*").order("created_at",{ascending:false}).limit(100);
    if (merchantId) q = q.eq("merchant_id", merchantId);
    const { data, error } = await q;
    if (error) { console.warn("loadImportBatches:", error.message); return []; }
    return data || [];
  },

  async loadImportRows(batchId, statusFilter) {
    let q = db.from("import_rows").select("*")
      .eq("batch_id", batchId).order("row_number");
    if (statusFilter) q = q.eq("status", statusFilter);
    const { data, error } = await q.limit(500);
    if (error) { console.warn("loadImportRows:", error.message); return []; }
    return data || [];
  },

  async createImportBatch(payload) {
    const { data, error } = await db.from("import_batches")
      .insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  async updateImportBatch(id, patch) {
    const { error } = await db.from("import_batches")
      .update({...patch, updated_at: new Date().toISOString()}).eq("id", id);
    if (error) throw error;
  },

  async insertImportRows(rows) {
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await db.from("import_rows").insert(rows.slice(i, i+CHUNK));
      if (error) throw error;
    }
  },

  async updateImportRow(id, patch) {
    const { error } = await db.from("import_rows")
      .update({...patch, updated_at: new Date().toISOString()}).eq("id", id);
    if (error) throw error;
  },

  async loadAllMerchants() {
    const { data, error } = await db.from("profiles")
      .select("id,full_name,email,phone,primary_role,is_active,is_suspended,created_at")
      .eq("primary_role","merchant")
      .eq("is_deleted",false)
      .order("full_name");
    if (error) { console.warn("loadAllMerchants:", error.message); return []; }
    return data || [];
  },

  async loadAdminMerchantAddresses(merchantId) {
    const { data, error } = await db.from("merchant_addresses")
      .select("*").eq("merchant_id", merchantId)
      .order("is_default", { ascending:false });
    if (error) { console.warn("loadAdminMerchantAddresses:", error.message); return []; }
    return data || [];
  },

  async loadAdminMerchantRecipients(merchantId) {
    const { data, error } = await db.from("merchant_recipients")
      .select("*").eq("merchant_id", merchantId)
      .eq("is_deleted",false).order("order_count", { ascending:false });
    if (error) { console.warn("loadAdminMerchantRecipients:", error.message); return []; }
    return data || [];
  },

  async loadAdminMerchantProducts(merchantId) {
    const { data, error } = await db.from("merchant_products")
      .select("*").eq("merchant_id", merchantId)
      .eq("is_deleted",false).order("name");
    if (error) { console.warn("loadAdminMerchantProducts:", error.message); return []; }
    return data || [];
  },

  async loadAdminPickupRequests(merchantId) {
    let q = db.from("pickup_requests").select("*").order("created_at",{ascending:false});
    if (merchantId) q = q.eq("merchant_id", merchantId);
    const { data, error } = await q.limit(200);
    if (error) { console.warn("loadAdminPickupRequests:", error.message); return []; }
    return data || [];
  },

  async loadAdminSettlements(merchantId) {
    let q = db.from("settlements").select("*").order("created_at",{ascending:false});
    if (merchantId) q = q.eq("merchant_id", merchantId);
    const { data, error } = await q.limit(200);
    if (error) { console.warn("loadAdminSettlements:", error.message); return []; }
    return data || [];
  },

  async loadAdminLedger(merchantId) {
    const { data, error } = await db.from("merchant_ledger")
      .select("*").eq("merchant_id", merchantId)
      .order("created_at",{ascending:false}).limit(200);
    if (error) { console.warn("loadAdminLedger:", error.message); return []; }
    return data || [];
  },

  async loadMerchantAddresses(merchantId) {
    const { data, error } = await db.from("merchant_addresses")
      .select("*").eq("merchant_id", merchantId)
      .eq("is_active", true).order("is_default", { ascending:false });
    if (error) { console.warn("loadMerchantAddresses:", error.message); return []; }
    return data || [];
  },

  async loadMerchantRecipients(merchantId, query="") {
    let q = db.from("merchant_recipients")
      .select("*").eq("merchant_id", merchantId)
      .eq("is_deleted", false).order("order_count", { ascending:false });
    if (query) q = q.ilike("name", `%${query}%`);
    const { data, error } = await q.limit(100);
    if (error) { console.warn("loadMerchantRecipients:", error.message); return []; }
    return data || [];
  },

  async loadMerchantProducts(merchantId) {
    const { data, error } = await db.from("merchant_products")
      .select("*").eq("merchant_id", merchantId)
      .eq("is_deleted", false).eq("is_active", true)
      .order("name");
    if (error) { console.warn("loadMerchantProducts:", error.message); return []; }
    return data || [];
  },

  async loadMerchantLedger(merchantId) {
    const { data, error } = await db.from("merchant_ledger")
      .select("*").eq("merchant_id", merchantId)
      .order("created_at", { ascending:false }).limit(100);
    if (error) { console.warn("loadMerchantLedger:", error.message); return []; }
    return data || [];
  },

  async loadMerchantBalance(merchantId) {
    const { data, error } = await db.rpc("get_merchant_balance",
      { p_merchant_id: merchantId });
    if (error) { console.warn("loadMerchantBalance:", error.message); return 0; }
    return Number(data) || 0;
  },

  async loadSettlements(merchantId) {
    const { data, error } = await db.from("settlements")
      .select("*").eq("merchant_id", merchantId)
      .order("created_at", { ascending:false });
    if (error) { console.warn("loadSettlements:", error.message); return []; }
    return data || [];
  },

  async loadPickupRequests(merchantId) {
    const { data, error } = await db.from("pickup_requests")
      .select("*").eq("merchant_id", merchantId)
      .order("created_at", { ascending:false });
    if (error) { console.warn("loadPickupRequests:", error.message); return []; }
    return data || [];
  },

  async uploadPOD(shipmentCode,file) {
    const ext=file.name.split(".").pop()||"jpg";
    const path=`pod_${shipmentCode}_${Date.now()}.${ext}`;
    const{error:upErr}=await db.storage.from("pod-images").upload(path,file,{upsert:true});
    if(upErr)throw upErr;
    const{data}=db.storage.from("pod-images").getPublicUrl(path);
    return data.publicUrl;
  },

  async uploadSignature(shipmentCode, blob) {
    const path = `sig_${shipmentCode}_${Date.now()}.png`;
    const { error } = await db.storage.from("pod-images").upload(path, blob, {
      upsert: true, contentType: "image/png"
    });
    if (error) throw error;
    const { data } = db.storage.from("pod-images").getPublicUrl(path);
    return data.publicUrl;
  }
};

function mapRow(r) {
  return {
    // Identity
    id:             r.shipment_code,
    // Merchant
    merchantId:     r.merchant_id    || null,
    merchantName:   r.merchant_name  || "",
    merchantPhone:  r.merchant_phone || "",
    // Courier
    courierId:      r.courier_id   || null,
    courierName:    r.courier_name || "",
    // Customer
    customerName:   r.customer_name   || "",
    customerPhone:  r.customer_phone  || "",
    customerPhone2: r.customer_phone2 || "",
    // Address
    address:        r.address_full || r.address || "",
    governorate:    r.governorate  || "",
    city:           r.city         || "",
    street:         r.street       || "",
    building:       r.building     || "",
    floor:          r.floor        || "",
    apartment:      r.apartment    || "",
    // Financials
    amount:         Number(r.amount)       || 0,
    deliveryFee:    Number(r.delivery_fee) || 60,
    returnFee:      Number(r.return_fee)   || 0,
    // Phase 1: service & order type
    serviceType:    r.service_type || "door_to_door",
    orderType:      r.order_type   || "standard",
    scheduledAt:    r.scheduled_at || null,
    // Phase 1: physical
    weight:         r.weight   != null ? Number(r.weight)   : null,
    quantity:       r.quantity != null ? Number(r.quantity)  : 1,
    width:          r.width    != null ? Number(r.width)     : null,
    height:         r.height   != null ? Number(r.height)    : null,
    depth:          r.depth    != null ? Number(r.depth)     : null,
    barcode:        r.barcode  || null,
    // Phase 1: return fee
    returnFee:      Number(r.return_fee) || 0,
    // Status
    status:           r.status || "submitted",
    eta:              r.eta    || "",
    attempts:         r.delivery_attempts || r.attempts || 0,
    rescheduleCount:  r.reschedule_count  || 0,
    rescheduleReason: r.reschedule_reason || "",
    // Proof
    podUrl:       r.pod_url       || null,
    signatureUrl: r.signature_url || null,
    otpVerified:  r.otp_verified  || false,
    // Notes
    notes:         r.notes          || "",
    internalNotes: r.internal_notes || "",
    // Branch / warehouse
    branchCode:    r.branch_code    || "",
    warehouseCode: r.warehouse_code || "",
    // Metadata
    createdBy:   r.created_by  || null,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
    deliveredAt: r.delivered_at || null,
    returnedAt:  r.returned_at  || null,
  };
}

// ── VISIBLE SHIPMENTS ─────────────────────────────────────
function visible() {
  let list=[...AppState.shipments];
  const{id:uid}=AppState.user||{};
  const role=AppState.user?.primary_role||AppState.user?.role||"customer";
  if(role==="courier") list=list.filter(s=>s.courierId===uid);
  if(role==="merchant")list=list.filter(s=>s.merchantId===uid);
  if(role==="customer")return[];
  const q=AppState.query.trim().toLowerCase();
  return list.filter(s=>{
    const txt=`${s.id} ${s.customerName} ${s.customerPhone} ${s.customerPhone2} ${s.address} ${s.governorate}`.toLowerCase();
    const matchQ       = !q || txt.includes(q);
    const matchStatus  = AppState.statusFilter==="all"  || s.status===AppState.statusFilter;
    const matchService = !AppState.serviceFilter || s.serviceType===AppState.serviceFilter;
    const matchOrder   = !AppState.orderFilter   || s.orderType===AppState.orderFilter;
    return matchQ && matchStatus && matchService && matchOrder;
  });
}

// ── REALTIME ──────────────────────────────────────────────
function startRealtime() {
  if(AppState.realtimeChannel) return;

  AppState.realtimeChannel = db.channel("rt_v6")
    // Shipments — new shipment created
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"shipments"}, p=>{
      const s = mapRow(p.new);
      AppState.shipments.unshift(s);
      AppState.liveActivityFeed.unshift({
        type:"new_shipment", icon:"📦", time:new Date().toISOString(),
        text:`شحنة جديدة: ${s.id} — ${s.customerName}`,
        badge:"badge-brand",
      });
      if(AppState.liveActivityFeed.length>50) AppState.liveActivityFeed.pop();
      AppState.rtEventCount++;
      DB.addNotification(`شحنة جديدة: ${s.id} — ${s.customerName}`,"admin");
      if((AppState.user?.primary_role||AppState.user?.role)==="admin") rerenderContent();
    })
    // Shipments — status updated
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"shipments"}, p=>{
      const idx = AppState.shipments.findIndex(s=>s.id===p.new.shipment_code);
      const updated = mapRow(p.new);
      if(idx>=0) AppState.shipments[idx]={...AppState.shipments[idx],...updated};
      // Only log status-change events to the feed (not every field update)
      const oldStatus = idx>=0 ? AppState.shipments[idx].status : null;
      if(p.new.status && p.new.status!==p.old?.status) {
        const statusLabel = STATUS_MAP[p.new.status]?.label||p.new.status;
        AppState.liveActivityFeed.unshift({
          type:"status_change", icon:"🔄", time:new Date().toISOString(),
          text:`${p.new.shipment_code}: ${statusLabel}`,
          badge:STATUS_MAP[p.new.status]?.badge||"badge-gray",
        });
        if(AppState.liveActivityFeed.length>50) AppState.liveActivityFeed.pop();
        AppState.rtEventCount++;
      }
      if((AppState.user?.primary_role||AppState.user?.role)==="admin") rerenderContent();
    })
    // Notifications — new notification for admin
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications"}, p=>{
      if(p.new.recipient_role==="admin"||p.new.recipient_id===AppState.user?.id) {
        AppState.notifications.unshift({
          id:p.new.id, message:p.new.message, type:p.new.type||"info",
          isRead:false, createdAt:p.new.created_at,
        });
        AppState.rtEventCount++;
        rerenderContent();
      }
    })
    .subscribe(status=>{
      AppState.rtConnected = status==="SUBSCRIBED";
      // Update connection indicator without full re-render
      const dot = document.getElementById("rtStatusDot");
      if(dot) {
        dot.style.background = AppState.rtConnected ? "var(--success)" : "var(--danger)";
        dot.title = AppState.rtConnected ? "متصل — تحديثات فورية نشطة" : "غير متصل";
      }
    });
}

// ── SESSION ───────────────────────────────────────────────
function clearSession() { ["nukhba_v6","nukhba_v5","nukhba_session"].forEach(k=>localStorage.removeItem(k)); }

// ══════════════════════════════════════════════════════════
// HOMEPAGE
// ══════════════════════════════════════════════════════════
function renderHomepage() {
  const govOpts=Object.keys(EGYPT_GOV).map(g=>`<option value="${g}">${g}</option>`).join("");
  document.querySelector("#app").innerHTML=`
  <div class="hp">
    <nav class="hp-nav">
      <div class="hp-nav-brand">${icon("truck",28)}<span>النخبة للشحن السريع</span></div>
      <div class="hp-nav-links">
        <a href="#services">خدماتنا</a>
        <a href="#hp-track">تتبع</a>
        <a href="#" id="navLogin" class="hp-nav-cta">دخول</a>
      </div>
    </nav>
    <section class="hp-hero">
      <div class="hp-hero-grid">
        <div>
          <div class="hp-hero-badge">🚀 أسرع خدمة شحن في مصر</div>
          <h1>شحن <em>سريع وموثوق</em><br/>في كل مكان</h1>
          <p>منصة لوجستية متكاملة تربط التجار بالمناديب والعملاء بأعلى كفاءة.</p>
          <div class="hp-hero-btns">
            <button class="btn-white" id="heroRegister">ابدأ مجاناً</button>
            <button class="btn-ghost-white" id="heroLogin">تسجيل الدخول</button>
          </div>
          <div class="hp-track-box">
            <label>📦 تتبع شحنتك الآن</label>
            <div class="hp-track-row">
              <input id="heroTrackInput" placeholder="أدخل رقم الشحنة..."/>
              <button id="heroTrackBtn">تتبع</button>
            </div>
          </div>
        </div>
        <div class="hp-hero-visual">
          <div class="hp-mock-stat">
            <div class="ms-label">نتابع شحنتك</div>
            <div class="ms-val">لحظة بلحظة</div>
            <div class="hp-mock-badge">📍 تتبع مباشر</div>
          </div>
          <div class="hp-mock-stat">
            <div class="ms-label">توصيل سريع</div>
            <div class="ms-val">خلال 24-48 ساعة</div>
            <div class="hp-mock-badge">🚚 في كل مصر</div>
          </div>
          <div class="hp-mock-stat">
            <div class="ms-label">تحصيل آمن</div>
            <div class="ms-val">ودفع موثوق</div>
            <div class="hp-mock-badge">💰 مضمون 100%</div>
          </div>
        </div>
      </div>
    </section>
    <div class="hp-stats">
      <div class="hp-stat"><div class="hp-stat-num">+10K</div><div class="hp-stat-lbl">شحنة مسلمة</div></div>
      <div class="hp-stat"><div class="hp-stat-num">+500</div><div class="hp-stat-lbl">تاجر موثوق</div></div>
      <div class="hp-stat"><div class="hp-stat-num">98%</div><div class="hp-stat-lbl">رضا العملاء</div></div>
      <div class="hp-stat"><div class="hp-stat-num">24/7</div><div class="hp-stat-lbl">دعم مستمر</div></div>
    </div>
    <div class="hp-section-alt" id="services">
      <div class="hp-section" style="padding-block:64px;">
        <p class="hp-label">خدماتنا</p>
        <h2 class="hp-title">كل ما تحتاجه لإدارة شحناتك</h2>
        <div class="hp-services">
          <div class="hp-service"><div class="hp-service-icon">${icon("truck",20)}</div><h3>توصيل سريع</h3><p>خلال 24-48 ساعة في جميع أنحاء مصر مع تتبع مباشر.</p></div>
          <div class="hp-service"><div class="hp-service-icon">${icon("search",20)}</div><h3>تتبع فوري</h3><p>تتبع شحنتك لحظة بلحظة عبر رقم الشحنة أو QR.</p></div>
          <div class="hp-service"><div class="hp-service-icon">${icon("wallet",20)}</div><h3>تحصيل الكاش</h3><p>نحصل المبلغ ونحوله لك مع تقارير مالية شفافة.</p></div>
          <div class="hp-service"><div class="hp-service-icon">${icon("shield",20)}</div><h3>أمان وضمان</h3><p>شحناتك محمية مع سجل تفصيلي لكل حدث.</p></div>
        </div>
      </div>
    </div>
    <section class="hp-section" id="hp-track">
      <div style="max-width:500px;margin:0 auto;text-align:center;">
        <p class="hp-label">تتبع مجاني</p>
        <h2 class="hp-title">اعرف مكان شحنتك الآن</h2>
        <div style="display:flex;gap:10px;margin-top:24px;">
          <input id="secTrackInput" placeholder="أدخل رقم الشحنة..."
            style="flex:1;padding:12px 16px;border-radius:10px;border:1.5px solid var(--gray-300);font-size:15px;"/>
          <button id="secTrackBtn" class="btn btn-primary btn-lg">🔍 تتبع</button>
        </div>
      </div>
    </section>
    <section class="hp-cta">
      <h2>ابدأ رحلتك مع النخبة اليوم</h2>
      <p>انضم لآلاف التجار والمناديب الذين يثقون بنا</p>
      <div class="hp-cta-btns">
        <button class="btn-white" id="ctaRegister">إنشاء حساب مجاناً</button>
        <button class="btn-ghost-white" id="ctaLogin">تسجيل الدخول</button>
      </div>
    </section>
    <footer class="hp-footer">
      <div class="hp-footer-grid">
        <div>
          <div class="hp-footer-brand">${icon("truck",22)}<strong>النخبة للشحن السريع</strong></div>
          <p class="hp-footer-desc">منصة لوجستية متكاملة لإدارة الشحن والتوصيل في مصر.</p>
        </div>
        <div class="hp-footer-col"><h4>روابط</h4>
          <a href="#services">خدماتنا</a><a href="#hp-track">تتبع شحنة</a>
        </div>
        <div class="hp-footer-col"><h4>الحسابات</h4>
          <a href="#" id="footerLogin">تسجيل الدخول</a>
          <a href="#" id="footerRegister">إنشاء حساب</a>
        </div>
        <div class="hp-footer-col"><h4>تواصل</h4>
          <a href="tel:+201061004311">📞 01061004311</a>
          <a href="tel:+201007736244">📞 01007736244</a>
          <a href="https://wa.me/201061004311" target="_blank">💬 واتساب</a>
          <a href="https://wa.me/201007736244" target="_blank">💬 واتساب</a>
        </div>
      </div>
      <div class="hp-footer-bottom">© 2025 النخبة للشحن السريع</div>
    </footer>
    <a href="https://wa.me/201061004311" target="_blank" class="wa-btn">💬</a>
    <a href="https://wa.me/201007736244" target="_blank" class="wa-btn">💬</a>
  </div>`;

  const goL=()=>{AppState.page="auth";AppState.authMode="login";render();};
  const goR=()=>{AppState.page="auth";AppState.authMode="register";render();};
  const doT=(inputId)=>{const v=$(inputId)?.value.trim();if(v)location.href=`${location.origin}${location.pathname}?track=${encodeURIComponent(v)}`;else toast("أدخل رقم الشحنة","warning");};

  $("navLogin")?.addEventListener("click",e=>{e.preventDefault();goL();});
  $("heroLogin")?.addEventListener("click",goL);
  $("heroRegister")?.addEventListener("click",goR);
  $("ctaLogin")?.addEventListener("click",goL);
  $("ctaRegister")?.addEventListener("click",goR);
  $("footerLogin")?.addEventListener("click",e=>{e.preventDefault();goL();});
  $("footerRegister")?.addEventListener("click",e=>{e.preventDefault();goR();});
  $("heroTrackBtn")?.addEventListener("click",()=>doT("heroTrackInput"));
  $("secTrackBtn")?.addEventListener("click",()=>doT("secTrackInput"));
  $("heroTrackInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")doT("heroTrackInput");});
}

// ══════════════════════════════════════════════════════════
// AUTH PAGE
// ══════════════════════════════════════════════════════════
function renderAuth() {
  const isLogin=AppState.authMode==="login";
  document.querySelector("#app").innerHTML=`
  <div class="auth-wrap">
    <div class="auth-left">
      <div class="auth-card">
        <div class="auth-brand">${icon("truck",32)}<span>النخبة للشحن السريع</span></div>
        ${isLogin?`
          <h2 class="auth-title">تسجيل الدخول</h2>
          <p class="auth-sub">أدخل بياناتك للوصول إلى حسابك</p>
          <form id="loginForm">
            <div class="field"><label>البريد الإلكتروني</label><input name="email" type="email" placeholder="your@email.com" autocomplete="username" required/></div>
            <div class="field"><label>كلمة المرور</label><input name="password" type="password" placeholder="••••••••" autocomplete="current-password" required/></div>
            <div id="loginErr" class="auth-error"></div>
            <button type="submit" class="btn btn-primary btn-full btn-lg">${icon("user")} دخول</button>
          </form>
          <div class="auth-switch">عميل جديد؟ <button class="text-link" id="toReg">إنشاء حساب</button></div>
        `:`
          <h2 class="auth-title">إنشاء حساب عميل</h2>
          <p class="auth-sub">أنشئ حسابك لتتبع شحناتك</p>
          <div class="auth-info">ℹ️ حسابات التجار والمناديب تُنشأ من قِبَل الإدارة فقط.</div>
          <form id="registerForm">
            <div class="field"><label>الاسم الكامل *</label><input name="fullname" type="text" required/></div>
            <div class="field"><label>البريد الإلكتروني *</label><input name="email" type="email" required/></div>
            <div class="field"><label>رقم الهاتف</label><input name="phone" type="tel"/></div>
            <div class="field"><label>كلمة المرور *</label><input name="password" type="password" placeholder="6 أحرف على الأقل" required/></div>
            <div class="field"><label>تأكيد كلمة المرور *</label><input name="confirm" type="password" required/></div>
            <div id="regErr" class="auth-error"></div>
            <button type="submit" class="btn btn-primary btn-full btn-lg">${icon("user")} إنشاء الحساب</button>
          </form>
          <div class="auth-switch">لديك حساب؟ <button class="text-link" id="toLogin">تسجيل الدخول</button></div>
        `}
        <div class="auth-back"><button class="text-link" id="backHome">← الرئيسية</button></div>
      </div>
    </div>
  </div>`;

  $("toReg")?.addEventListener("click",()=>{AppState.authMode="register";render();});
  $("toLogin")?.addEventListener("click",()=>{AppState.authMode="login";render();});
  $("backHome")?.addEventListener("click",()=>{AppState.page="home";render();});
  $("loginForm")?.addEventListener("submit",handleLogin);
  $("registerForm")?.addEventListener("submit",handleRegister);
}

async function handleLogin(e) {
  e.preventDefault();
  const fd  = new FormData(e.currentTarget);
  const btn = e.currentTarget.querySelector("button[type=submit]");
  const err = $("loginErr");
  err.style.display = "none";
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> جاري الدخول...`;

  try {
    // Step 1: authenticate
    const { data, error } = await db.auth.signInWithPassword({
      email:    fd.get("email").trim(),
      password: fd.get("password")
    });
    if (error) throw error;

    // Step 2: load profile — primary_role is the production column
    const profile = await DB.getProfile(data.user.id);

    if (profile?.is_suspended) {
      await db.auth.signOut();
      throw new Error("هذا الحساب موقوف. تواصل مع الإدارة.");
    }
    if (profile?.is_deleted) {
      await db.auth.signOut();
      throw new Error("هذا الحساب غير موجود. تواصل مع الإدارة.");
    }

    // Step 3: resolve role from primary_role (production schema)
    const role  = profile?.primary_role || "customer";
    const name  = profile?.full_name    || data.user.email.split("@")[0];
    const phone = profile?.phone        || "";

    // Step 4: set state — primary_role on both fields for full compat
    const user = {
      id:           data.user.id,
      name,
      role,           // kept for legacy UI checks
      primary_role:  role,
      email:         data.user.email,
      phone,
      balance:       0
    };
    AppState.user = user;
    AppState.page = "dashboard";
    AppState.view = role === "customer" ? "track"
                  : role === "courier"  ? "tasks"
                  : role === "merchant" ? "shipments"
                  : "overview";

    // Step 5: load permissions + all data in parallel
    //         render() must NOT be called until this resolves
    const [, ships, notifs, users, couriers] = await Promise.all([
      loadUserPermissions(data.user.id),            // fills AppPerms
      DB.loadShipments().catch(() => []),
      DB.loadNotifications(role).catch(() => []),
      (role === "admin" || role === "merchant")
        ? DB.loadUsers().catch(() => [])
        : Promise.resolve([]),
      DB.loadCouriers().catch(() => [])
    ]);

    // Step 6: commit all data to state atomically
    AppState.shipments     = ships;
    AppState.notifications = notifs;
    AppState.users         = users;
    AppState.couriers      = couriers;

    // Step 7: persist session AFTER permissions are confirmed
    saveSession(user);

    // Step 8: start realtime BEFORE render (so first render shows live count)
    if (role === "admin") {
      startRealtime();
      const [merchants, branches, warehouses] = await Promise.all([
        DB.loadAllMerchants(),
        DB.loadBranches(),
        DB.loadWarehouses(),
      ]);
      AppState.allMerchants      = merchants;
      AppState.branches          = branches;
      AppState.warehouses        = warehouses;
      AppState._branchDataLoaded = true;
    }
    if (role === "merchant") await App.loadMerchantData();
    if (role === "courier")  await App.loadMyWallet();

    // Step 9: audit (fire-and-forget, do not await — avoid delaying render)
    DB.addAudit("LOGIN", data.user.id, `role:${role} perms:${AppPerms.size}`, "auth");

    // Step 10: single render — everything is ready
    render();
    toast(`أهلاً ${name}!`);

  } catch(err2) {
    err.style.display = "block";
    err.textContent   = err2.message.includes("Invalid")
      ? "بيانات الدخول غير صحيحة. تحقق من البريد وكلمة المرور."
      : err2.message;
    btn.disabled = false;
    btn.innerHTML = `${icon("user")} دخول`;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const fullname=fd.get("fullname").trim(),email=fd.get("email").trim();
  const phone=fd.get("phone").trim(),password=fd.get("password"),confirm=fd.get("confirm");
  const err=$("regErr");const btn=e.currentTarget.querySelector("button[type=submit]");
  err.style.display="none";
  if(!fullname||!email||!password){err.style.display="block";err.textContent="يرجى تعبئة جميع الحقول";return;}
  if(password!==confirm){err.style.display="block";err.textContent="كلمة المرور غير متطابقة";return;}
  if(password.length<6){err.style.display="block";err.textContent="كلمة المرور 6 أحرف على الأقل";return;}
  btn.disabled=true;btn.innerHTML=`<span class="spinner"></span> جاري الإنشاء...`;
  try {
    const{data,error}=await db.auth.signUp({email,password,options:{data:{full_name:fullname,phone}}});
    if(error)throw error;
    await db.from("profiles").upsert([{id:data.user.id,full_name:fullname,email,phone,primary_role:"customer",is_active:true}]);
    const user = {
      id: data.user.id, name: fullname,
      role: "customer", primary_role: "customer",
      email, phone, balance: 0
    };
    saveSession(user);
    AppState.user = user;
    AppState.page = "dashboard";
    AppState.view = "track";
    await loadUserPermissions(data.user.id);
    render();
    toast(`مرحباً ${fullname}! تم إنشاء حسابك`);
  } catch(err2) {
    err.style.display="block";
    err.textContent=err2.message?.includes("already")?"البريد مسجل بالفعل":"خطأ: "+err2.message;
    btn.disabled=false;btn.innerHTML=`${icon("user")} إنشاء الحساب`;
  }
}

// ══════════════════════════════════════════════════════════
// DASHBOARD SHELL
// ══════════════════════════════════════════════════════════
function renderDashboard() {
  const u       = AppState.user;
  const _role   = u.primary_role || u.role || "customer";
  const navKeys = ROLE_MAP[_role]?.nav || [];
  const unread  = AppState.notifications.filter(n => !n.isRead).length;

  if (_role === "admin") {
    renderAdminShell(navKeys, unread);
  } else {
    renderSimpleShell(navKeys, unread);
  }

  bindDashboardEvents();
  postRender();
}

function renderAdminShell(navKeys,unread) {
  const u=AppState.user;
  document.querySelector("#app").innerHTML=`
  <div class="dash">
    <div class="sb-overlay" id="sbOverlay"></div>
    <aside class="sidebar" id="sidebar">
      <div class="sb-brand">${icon("truck",22)}<div class="sb-brand-text"><strong>النخبة</strong><span>لوحة التحكم</span></div></div>
      <nav class="sb-nav">
        <div class="sb-section-label">القائمة</div>
        ${navKeys.map(k=>`
          <button class="sb-item ${AppState.view===k?"active":""}" data-view="${k}">
            ${icon(k==="users"?"users":k==="audit"?"shield":k==="shipments"?"box":k==="tasks"?"truck":k==="reports"?"chart":k==="accounts"?"wallet":k==="track"?"search":"chart",15)}
            ${NAV_LABELS[k]}
          </button>`).join("")}
      </nav>
      <div class="sb-footer">
        <select id="roleSwitcher" class="sb-preview"><option value="">👁 Preview as...</option>
          <option value="admin">Admin</option><option value="merchant">Merchant</option>
          <option value="courier">Courier</option><option value="customer">Customer</option>
        </select>
        <div class="sb-user">
          <div class="sb-user-avatar">${initials(u.name)}</div>
          <div><div class="sb-user-name">${esc(u.name?.split(" ")[0])}</div><div class="sb-user-role">${ROLE_MAP[u.primary_role||u.role]?.label}</div></div>
        </div>
        <button class="sb-logout" id="logoutBtn">${icon("logout",14)} خروج</button>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div style="display:flex;align-items:center;gap:12px;">
          <button class="menu-toggle" id="menuToggle">${icon("menu",18)}</button>
          <div class="topbar-title"><div class="eyebrow">Admin</div><h2>أهلاً، ${esc(u.name?.split(" ")[0]||"Admin")}</h2></div>
        </div>
        <div class="topbar-actions">
          <div class="rt-status" title="${AppState.rtConnected?"متصل — تحديثات فورية نشطة":"غير متصل"}">
            <span id="rtStatusDot" style="display:inline-block;width:8px;height:8px;border-radius:50%;
              background:${AppState.rtConnected?"var(--success)":"var(--danger)"};
              box-shadow:0 0 0 2px ${AppState.rtConnected?"rgba(34,197,94,.25)":"rgba(239,68,68,.25)"};
              transition:background .3s;"></span>
            <span style="font-size:11px;color:var(--gray-500);">${AppState.rtConnected?"مباشر":"غير متصل"}</span>
            ${AppState.rtEventCount>0?`<span class="badge badge-brand" style="font-size:10px;padding:1px 6px;">${AppState.rtEventCount}</span>`:""}
          </div>
          <div class="notif-btn-wrap">
            <button class="btn-icon" id="toggleNotif">${icon("bell")}${unread>0?`<span class="notif-count">${unread}</span>`:""}</button>
            ${renderNotifPanel()}
          </div>
          <div class="search-wrap">${icon("search",14)}<input id="searchInput" value="${esc(AppState.query)}" placeholder="بحث..."/></div>
        </div>
      </header>
      <div class="page" id="viewContent">${renderView()}</div>
    </main>
  </div>`;
}

function renderSimpleShell(navKeys,unread) {
  const u=AppState.user;
  const short=u.name?.length>14?u.name.split(" ")[0]:u.name;
  document.querySelector("#app").innerHTML=`
  <div class="simple-shell">
    <header class="simple-topbar">
      <div class="simple-brand">${icon("truck",20)}<span>النخبة للشحن السريع</span></div>
      <div class="simple-user">
        <span class="badge ${ROLE_MAP[u.primary_role||u.role]?.badge}">${ROLE_MAP[u.primary_role||u.role]?.label}</span>
        <span class="user-name">${esc(short)}</span>
        <div class="notif-btn-wrap">
          <button class="btn-icon" id="toggleNotif">${icon("bell")}${unread>0?`<span class="notif-count">${unread}</span>`:""}</button>
          ${renderNotifPanel()}
        </div>
        <div class="search-wrap" style="width:140px;">${icon("search",13)}<input id="searchInput" value="${esc(AppState.query)}" placeholder="بحث..."/></div>
        <button class="btn-icon" id="logoutBtn" title="خروج">${icon("logout")}</button>
      </div>
    </header>
    <nav class="tab-nav">
      ${navKeys.map(k=>`<button class="tab-btn ${AppState.view===k?"active":""}" data-view="${k}">${NAV_LABELS[k]}</button>`).join("")}
    </nav>
    <div class="tab-body" id="viewContent">${renderView()}</div>
  </div>`;
}

function renderNotifPanel() {
  const n=AppState.notifications;
  return`<div id="notifDropdown" class="notif-dropdown">
    <div class="notif-header"><span>الإشعارات</span><button class="text-link" id="clearNotif">مسح</button></div>
    ${!n.length?`<div class="notif-item"><div class="ni-text" style="color:var(--gray-400);">لا توجد إشعارات</div></div>`
      :n.slice(0,10).map(x=>`<div class="notif-item ${x.isRead?"":"unread"}"><div class="ni-text">${esc(x.text)}</div><div class="ni-time">${esc(x.time)}</div></div>`).join("")}
  </div>`;
}

function renderView() {
  switch(AppState.view) {
    case"shipments":  return viewShipments();
    case"tasks":      return viewTasks();
    case"accounts":   return viewAccounts();
    case"reports":    return viewReports();
    case"track":      return viewTrack();
    case"users":      return viewUsers();
    case"merchants":  return viewAdminMerchants();
    case"finance":    return viewFinance();
    case"pricing":    return viewPricing();
    case"branches":   return viewBranches();
    case"audit":      return viewAudit();
    // Phase 2A
    case"addresses":  return viewAddresses();
    case"recipients": return viewRecipients();
    case"products":   return viewProducts();
    case"pickup":     return viewPickupRequests();
    case"import":     return viewImport();
    case"liveops":    return viewLiveOps();
    default:          return viewOverview();
  }
}

function rerenderContent() {
  const vc = $("viewContent");
  if (!vc) { render(); return; }
  vc.innerHTML = renderView();
  // Bind only content-level events (not shell-level which are already bound)
  bindContentEvents();
  postRender();
}

// Content-level events — safe to re-bind on every rerenderContent
function bindContentEvents() {
  // [data-open] — shipment detail
  $$("[data-open]").forEach(btn => {
    btn.addEventListener("click", () => {
      AppState.selectedShipment = btn.dataset.open;
      rerenderContent();
    });
  });
  // Filter buttons (onclick= in HTML, no binding needed)
  // New shipment button
  $("newShipBtn")?.addEventListener("click", () => Modals.newShipment());
  $("addUserBtn")?.addEventListener("click", Modals.addUser);
  $("openScanner")?.addEventListener("click", Modals.scanner);
  // Search inputs
  const si = $("searchInput");
  if (si) {
    let t;
    si.addEventListener("input", e => {
      clearTimeout(t);
      t = setTimeout(() => { AppState.query = e.target.value; rerenderContent(); si.focus(); }, 250);
    });
  }
  const ui = $("userSearch");
  if (ui) {
    let t;
    ui.addEventListener("input", e => {
      clearTimeout(t);
      t = setTimeout(() => { AppState.userFilter = e.target.value; rerenderContent(); ui.focus(); }, 250);
    });
  }
  const ai = $("auditSearch");
  if (ai) {
    let t;
    ai.addEventListener("input", e => {
      clearTimeout(t);
      t = setTimeout(() => { AppState.auditFilter = e.target.value; App.loadAudit(); }, 300);
    });
  }
}

function render() {
  const params=new URLSearchParams(window.location.search);
  const trackId=params.get("track");
  if(trackId){
    AppState.selectedShipment=trackId;AppState.view="track";
    if(!AppState.user)AppState.user={role:"customer",primary_role:"customer",id:"guest",name:"زائر"};
  }
  if(!AppState.user){AppState.page==="auth"?renderAuth():renderHomepage();}
  else{renderDashboard();}
}

function postRender() {
  setTimeout(renderChart,200);
  setTimeout(()=>{
    visible().forEach(s=>{
      const c=document.getElementById(`qr-${s.id}`);if(!c)return;
      try{QRCode.toCanvas(c,`${location.origin}${location.pathname}?track=${s.id}`,{width:36,margin:1});}catch(e){}
    });
  },200);
  const sel=AppState.shipments.find(s=>s.id===AppState.selectedShipment);
  if(sel)loadTimeline(sel.id);
  if(AppState.view==="audit")App.loadAudit();
  if(AppState.view==="finance"){
    const tab=AppState.financeTab||"overview";
    if(tab!=="overview")setTimeout(()=>App._loadFinanceTabData(tab),100);
  }
  if(AppState.view==="pricing" && !AppState._pricingDataLoaded){
    AppState._pricingDataLoaded = true;
    App.loadPricingData();
  }
  if(AppState.view==="pricing" && AppState.pricingTab==="simulator" && !Object.keys(EGYPT_GOV).length){
    loadEgyptData().then(()=>rerenderContent());
  }
  if(AppState.view==="branches" && !AppState._branchDataLoaded){
    AppState._branchDataLoaded = true;
    App.loadBranchData();
  }
  if(AppState.view==="import" && !AppState._importDataLoaded){
    AppState._importDataLoaded = true;
    App.loadImportBatches();
  }
}

function renderChart() {
  const canvas=document.getElementById("statusChart");if(!canvas)return;
  const old=Chart.getChart(canvas);if(old)old.destroy();
  const vl=visible();
  new Chart(canvas,{type:"doughnut",
    data:{labels:["تم التسليم","مرتجع","خرج للتسليم","في المخزن","جديد"],
      datasets:[{data:[
        vl.filter(s=>s.status==="delivered").length,vl.filter(s=>s.status==="returned").length,
        vl.filter(s=>s.status==="out_for_delivery").length,vl.filter(s=>s.status==="warehouse").length,
        vl.filter(s=>s.status==="created").length],
        backgroundColor:["#16a34a","#dc2626","#7c3aed","#d97706","#2563eb"],borderWidth:2,borderColor:"#fff"}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:"bottom",labels:{font:{size:11},padding:10,usePointStyle:true}}}}});
}

// ══════════════════════════════════════════════════════════
// VIEWS
// ══════════════════════════════════════════════════════════

// ── KPI Card helper ───────────────────────────────────────
function kpi(label,value,iconName,color,bg,filter=null,delta=null) {
  const click=filter?`onclick="App.setFilter('${filter}')" style="cursor:pointer;"` : "";
  return `<div class="kpi" ${click} style="--kpi-color:${color};--kpi-bg:${bg};">
    <div class="kpi-icon">${icon(iconName,18)}</div>
    <div class="kpi-value">${esc(String(value))}</div>
    <div class="kpi-label">${label}</div>
    ${delta?`<div class="kpi-delta up">${delta}</div>`:""}
    ${filter?`<div class="kpi-hint">عرض التفاصيل ←</div>`:""}
  </div>`;
}

function alertRow(label,count,filter,color) {
  return `<div onclick="App.setFilter('${filter}')"
    style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;
    background:var(--gray-50);border-radius:var(--radius);cursor:pointer;border:1px solid var(--gray-200);transition:all .15s;"
    onmouseover="this.style.borderColor='${color}'" onmouseout="this.style.borderColor='var(--gray-200)'">
    <span style="font-size:13px;font-weight:500;">${label}</span>
    <b style="font-size:18px;font-weight:800;color:${color};">${count}</b>
  </div>`;
}

// ── OVERVIEW ──────────────────────────────────────────────
function viewOverview() {
  const list=visible();
  const total=list.length;
  const onWay=list.filter(s=>s.status==="out_for_delivery").length;
  const done=list.filter(s=>s.status==="delivered").length;
  const ret=list.filter(s=>s.status==="returned").length;
  const pending=list.filter(s=>s.status==="created").length;

  if((AppState.user.primary_role||AppState.user.role)==="merchant") {
    const bal=list.filter(s=>s.status==="delivered").reduce((a,s)=>a+(s.amount-s.deliveryFee),0);
    return `
      <div class="kpi-grid">
        ${kpi("شحناتي",total,"box","var(--brand)","var(--brand-light)","all")}
        ${kpi("تم التسليم",done,"chart","var(--success)","var(--success-bg)","delivered",pct(done,total)+"%")}
        ${kpi("مرتجعات",ret,"refresh","var(--danger)","var(--danger-bg)","returned")}
        ${kpi("الرصيد المستحق",money(bal),"wallet","var(--info)","var(--info-bg)")}
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("box")} شحناتي الأخيرة</h3>
          ${can("create_shipment")?`<button class="btn btn-primary btn-sm" id="newShipBtn">${icon("plus",13)} شحنة جديدة</button>`:""}
        </div>
        ${shipTable(list.slice(0,10))}
      </div>`;
  }

  return `
    ${SMS_CONFIG.provider==="stub"?`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:var(--radius);
      background:var(--warning-bg);border:1px solid var(--warning-border);margin-bottom:16px;font-size:13px;">
      📱 <span>مزود SMS في وضع الاختبار — الرسائل لا تُرسل فعلياً.</span>
      <button class="btn btn-secondary btn-sm" style="margin-right:auto;" onclick="App.openSmsSettings()">إعداد مزود SMS</button>
    </div>`:""}
    <div class="kpi-grid">
      ${kpi("إجمالي الشحنات",total,"box","var(--brand)","var(--brand-light)","all")}
      ${kpi("تنتظر الاستلام",pending,"qr","var(--warning)","var(--warning-bg)","created")}
      ${kpi("خارج للتسليم",onWay,"truck","var(--purple)","var(--purple-bg)","out_for_delivery")}
      ${kpi("تم التسليم",done,"chart","var(--success)","var(--success-bg)","delivered",pct(done,total)+"%")}
      ${kpi("مرتجعات",ret,"refresh","var(--danger)","var(--danger-bg)","returned")}
    </div>
    <div class="overview-grid">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("box")} آخر الشحنات
            ${AppState.statusFilter!=="all"?`<span class="badge badge-brand" style="font-size:11px;margin-right:8px;">
              ${STATUS_MAP[AppState.statusFilter]?.label}
              <button onclick="App.setFilter('all')" style="background:none;border:none;cursor:pointer;padding:0 2px;font-size:12px;">✕</button>
            </span>`:""}
          </h3>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm" id="openScanner">${icon("qr",13)} QR</button>
            ${can("create_shipment")?`<button class="btn btn-primary btn-sm" id="newShipBtn">${icon("plus",13)} شحنة جديدة</button>`:""}
          </div>
        </div>
        ${shipTable(AppState.statusFilter==="all"?list.slice(0,8):list)}
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="card">
          <h3 class="card-title" style="margin-bottom:14px;">${icon("chart")} التوزيع</h3>
          <div style="height:190px;"><canvas id="statusChart"></canvas></div>
        </div>
        <div class="card">
          <h3 class="card-title" style="margin-bottom:12px;">⚡ تنبيهات</h3>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${alertRow("تنتظر الاستلام",pending,"created","var(--warning)")}
            ${alertRow("خارج للتسليم",onWay,"out_for_delivery","var(--brand)")}
            ${alertRow("مرتجعات",ret,"returned","var(--danger)")}
          </div>
        </div>
      </div>
    </div>`;
}

// ── SHIP TABLE ────────────────────────────────────────────
function shipTable(list) {
  if(!list.length) return `
    <div class="empty">
      <div class="empty-icon">📦</div>
      <h3>لا توجد شحنات</h3>
      <p>${AppState.statusFilter!=="all"?"لا توجد شحنات بهذا الفلتر":"لم تُضف شحنات بعد"}</p>
      ${AppState.statusFilter!=="all"?`<button class="btn btn-secondary btn-sm" onclick="App.setFilter('all')">إظهار الكل</button>`:""}
    </div>`;

  return `<div class="table-wrap"><table>
    <thead><tr><th>الكود</th><th>الخدمة</th><th>العميل</th><th>الهاتف</th><th>المنطقة</th><th>الحالة</th><th>المبلغ</th><th>الوزن</th><th>التاجر</th><th>المندوب</th><th>إجراءات</th></tr></thead>
    <tbody>
      ${list.map(s=>`<tr>
        <td>
          <div class="td-mono">${esc(s.id)}</div>
          <div style="font-size:10px;color:var(--gray-400);margin-top:2px;">${fmtDate(s.createdAt)}</div>
          ${s.barcode ? `<div style="font-size:10px;color:var(--gray-500);">🔲 ${esc(s.barcode)}</div>` : ""}
        </td>
        <td>
          <div>${SERVICE_MAP[s.serviceType]?.icon||""} <span style="font-size:11px;">${SERVICE_MAP[s.serviceType]?.label||""}</span></div>
          <span class="badge ${ORDER_TYPE_MAP[s.orderType]?.badge||"badge-gray"}" style="font-size:10px;margin-top:3px;">${ORDER_TYPE_MAP[s.orderType]?.icon||""} ${ORDER_TYPE_MAP[s.orderType]?.label||""}</span>
        </td>
        <td class="td-primary">${esc(s.customerName)}</td>
        <td class="td-phone">
          <a href="tel:${esc(s.customerPhone)}">${esc(s.customerPhone)}</a>
          ${s.customerPhone2?`<br/><a href="tel:${esc(s.customerPhone2)}" style="font-size:11px;color:var(--gray-500);">${esc(s.customerPhone2)}</a>`:""}
        </td>
        <td style="font-size:12px;">${esc(s.governorate||s.address?.split("-")[0]||"—")}</td>
        <td><span class="badge ${STATUS_MAP[s.status]?.badge||"badge-gray"}">${STATUS_MAP[s.status]?.label||s.status}</span></td>
        <td style="font-weight:600;">${money(s.amount)}</td>
        <td style="font-size:12px;color:var(--gray-500);">${s.weight?s.weight+"كجم":"—"}</td>
        <td style="font-size:12px;color:var(--gray-600);">${s.merchantName?esc(s.merchantName):'<span style="color:var(--gray-300);">—</span>'}</td>
        <td style="font-size:12px;color:var(--gray-600);">${s.courierName?esc(s.courierName):'<span style="color:var(--gray-300);">—</span>'}</td>
        <td>
          <div class="td-actions">
            <button class="btn btn-secondary btn-sm" data-open="${esc(s.id)}">عرض</button>
            ${can("print_shipment")?`<button class="btn-icon" onclick="App.print('${esc(s.id)}')" title="طباعة">${icon("pkg",13)}</button>`:""}
            <canvas id="qr-${esc(s.id)}" style="width:34px;height:34px;"></canvas>
          </div>
        </td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}

// ── SHIPMENTS VIEW ────────────────────────────────────────
function viewShipments() {
  const sel=AppState.shipments.find(s=>s.id===AppState.selectedShipment)||visible()[0]||null;
  return `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <h3 class="card-title">${icon("box")} إدارة الشحنات</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="App.manualTrack()">📦 تتبع</button>
          ${can("export_excel")?`<button class="btn btn-secondary btn-sm" onclick="App.exportExcel()">📊 Excel</button>`:""}
          ${can("create_shipment")?`<button class="btn btn-primary btn-sm" id="newShipBtn">${icon("plus",13)} إضافة</button>`:""}
        </div>
      </div>
      <div class="filter-bar" style="margin-bottom:8px;">
        ${["all","submitted","pickup_requested","picked_up","at_warehouse","in_transit","at_branch","out_for_delivery","delivered","returned","rescheduled","cancelled","suspended"].map(st=>`
          <button class="filter-btn ${AppState.statusFilter===st?"active":""}" onclick="App.setFilter('${st}')">
            ${st==="all"?"الكل":STATUS_MAP[st]?.label||st}
          </button>`).join("")}
      </div>
      <div class="filter-bar" style="margin-bottom:14px;">
        <button class="filter-btn ${!AppState.serviceFilter?"active":""}" onclick="App.setServiceFilter('')">كل الخدمات</button>
        ${Object.entries(SERVICE_MAP).map(([k,v])=>`<button class="filter-btn ${AppState.serviceFilter===k?"active":""}" onclick="App.setServiceFilter('${k}')">${v.icon} ${v.label}</button>`).join("")}
        <span style="margin:0 8px;color:var(--gray-300);">|</span>
        <button class="filter-btn ${!AppState.orderFilter?"active":""}" onclick="App.setOrderFilter('')">كل الأنواع</button>
        ${Object.entries(ORDER_TYPE_MAP).map(([k,v])=>`<button class="filter-btn ${AppState.orderFilter===k?"active":""}" onclick="App.setOrderFilter('${k}')">${v.icon} ${v.label}</button>`).join("")}
      </div>
      ${shipTable(visible())}
    </div>
    ${sel?detailPanel(sel):""}`;
}

// ── DETAIL PANEL ──────────────────────────────────────────
function detailPanel(s) {
  const meta=STATUS_MAP[s.status]||{label:s.status,badge:"badge-gray"};
  const steps=STATUS_STEPS;const curIdx=steps.indexOf(s.status);
  return `
    <div class="card" id="detailPanel">
      <div class="card-header">
        <div><div class="td-mono" style="font-size:16px;font-weight:700;">${esc(s.id)}</div>
          <div style="font-size:12px;color:var(--gray-400);margin-top:3px;">أُنشئت ${fmtDate(s.createdAt)}</div></div>
        <span class="badge ${meta.badge}">${meta.label}</span>
      </div>
      <div class="prog-track" style="margin-bottom:20px;">
        ${steps.map((st,i)=>`
          <div class="prog-step">
            <div class="prog-circle ${i<curIdx?"done":i===curIdx?"curr":""}">${i<=curIdx?"✓":i+1}</div>
            <span>${STATUS_MAP[st]?.label||st}</span>
          </div>
          ${i<steps.length-1?`<div class="prog-line ${i<curIdx?"done":""}"></div>`:""}`).join("")}
      </div>
      <div class="detail-grid">
        <div class="detail-field"><div class="df-label">العميل</div><div class="df-value">${esc(s.customerName)}</div></div>
        <div class="detail-field"><div class="df-label">الهاتف الأول</div><div class="df-value"><a href="tel:${esc(s.customerPhone)}" style="color:var(--brand);">📞 ${esc(s.customerPhone)}</a></div></div>
        ${s.customerPhone2?`<div class="detail-field"><div class="df-label">الهاتف الثاني</div><div class="df-value"><a href="tel:${esc(s.customerPhone2)}" style="color:var(--brand);">📞 ${esc(s.customerPhone2)}</a></div></div>`:""}
        <div class="detail-field"><div class="df-label">العنوان</div><div class="df-value">${esc(s.governorate?`${s.governorate} / ${s.city} — ${s.street}`:s.address)}</div></div>
        <div class="detail-field"><div class="df-label">قيمة الطلب</div><div class="df-value">${money(s.amount)}</div></div>
        <div class="detail-field"><div class="df-label">رسوم الشحن</div><div class="df-value">${money(s.deliveryFee)}</div></div>
        <div class="detail-field"><div class="df-label">موعد التسليم</div><div class="df-value">${esc(s.eta)||"قيد التجهيز"}</div></div>
        <div class="detail-field"><div class="df-label">محاولات التوصيل</div><div class="df-value">${s.attempts}</div></div>
        ${s.merchantName?`<div class="detail-field"><div class="df-label">التاجر</div><div class="df-value">${esc(s.merchantName)}</div></div>`:""}
        <div class="detail-field"><div class="df-label">المندوب</div><div class="df-value">${esc(s.courierName)||`<span style="color:var(--gray-400);">غير معين</span>`}</div></div>
        ${s.notes?`<div class="detail-field" style="grid-column:1/-1"><div class="df-label">ملاحظات</div><div class="df-value">${esc(s.notes)}</div></div>`:""}
        ${s.internalNotes && can("shipments.view_internal")?`<div class="detail-field" style="grid-column:1/-1;border:1px solid var(--warning-border);background:var(--warning-bg);"><div class="df-label" style="color:var(--warning);">ملاحظات داخلية</div><div class="df-value">${esc(s.internalNotes)}</div></div>`:""}
      </div>
      <!-- Phase 1: Service, order type, physical details -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:16px;padding:14px;background:var(--gray-50);border-radius:var(--radius);border:1px solid var(--gray-200);">
        <div><div class="df-label">نوع الخدمة</div><div style="font-size:14px;font-weight:600;">${SERVICE_MAP[s.serviceType]?.icon||""} ${SERVICE_MAP[s.serviceType]?.label||s.serviceType}</div></div>
        <div><div class="df-label">نوع الطلب</div><div><span class="badge ${ORDER_TYPE_MAP[s.orderType]?.badge||"badge-gray"}">${ORDER_TYPE_MAP[s.orderType]?.icon||""} ${ORDER_TYPE_MAP[s.orderType]?.label||s.orderType}</span></div></div>
        ${s.weight?`<div><div class="df-label">الوزن</div><div style="font-size:14px;font-weight:600;">${s.weight} كجم</div></div>`:""}
        ${s.quantity>1?`<div><div class="df-label">الكمية</div><div style="font-size:14px;font-weight:600;">${s.quantity} قطعة</div></div>`:""}
        ${s.width?`<div><div class="df-label">الأبعاد</div><div style="font-size:13px;font-weight:600;">${s.width}×${s.height}×${s.depth} سم</div></div>`:""}
        ${s.returnFee?`<div><div class="df-label">رسوم الإرجاع</div><div style="font-size:14px;font-weight:600;color:var(--danger);">${money(s.returnFee)}</div></div>`:""}
        ${s.barcode?`<div><div class="df-label">باركود</div><div style="font-size:13px;font-family:monospace;">🔲 ${esc(s.barcode)}</div></div>`:""}
        ${s.branchCode?`<div><div class="df-label">الفرع</div><div style="font-size:13px;font-weight:600;">${esc(s.branchCode)}</div></div>`:""}
        ${s.rescheduleCount>0?`<div><div class="df-label">مرات الإعادة</div><div style="font-size:14px;font-weight:600;color:var(--warning);">${s.rescheduleCount} مرة</div></div>`:""}
        ${s.scheduledAt?`<div><div class="df-label">موعد التسليم المجدول</div><div style="font-size:13px;font-weight:600;">${fmtDate(s.scheduledAt)}</div></div>`:""}
        ${s.otpVerified?`<div><div class="df-label">OTP</div><div style="font-size:13px;color:var(--success);">✅ تم التحقق</div></div>`:""}
      </div>
      ${can("assign_courier")?`
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">
          <select id="courierSelect" style="flex:1;min-width:180px;padding:9px 12px;border-radius:var(--radius);border:1.5px solid var(--gray-300);font-size:13px;">
            <option value="">-- اختر المندوب --</option>
            ${AppState.couriers.map(c=>`<option value="${esc(c.id)}" data-name="${esc(c.full_name)}" ${s.courierId===c.id?"selected":""}>${esc(c.full_name)}${c.phone?` — ${esc(c.phone)}`:""}</option>`).join("")}
          </select>
          <button class="btn btn-secondary btn-sm" onclick="App.assignCourier('${esc(s.id)}')">${icon("users",13)} تعيين</button>
        </div>`:""}
      ${can("change_status")?`
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
          ${["submitted","pickup_requested","picked_up","at_warehouse","in_transit","at_branch","out_for_delivery"].map(st=>`
            <button class="btn btn-secondary btn-sm" onclick="App.updateStatus('${esc(s.id)}','${st}')">${STATUS_MAP[st]?.label||st}</button>`).join("")}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
          <button class="btn btn-primary btn-sm" onclick="App.updateStatus('${esc(s.id)}','delivered')">✅ تم التسليم</button>
          <button class="btn btn-sm" style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger-border);"
            onclick="App.updateStatus('${esc(s.id)}','returned')">↩ مرتجع</button>
          <button class="btn btn-sm" style="background:var(--warning-bg);color:var(--warning);border:1px solid var(--warning-border);"
            onclick="App.rescheduleShipment('${esc(s.id)}')">📅 إعادة جدولة</button>
          ${can("shipments.suspend")?`<button class="btn btn-sm" style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger-border);"
            onclick="App.suspendShipment('${esc(s.id)}')">⏸ إيقاف</button>`:""}
        </div>`:""}
      ${can("upload_pod")?`
        <label class="btn btn-secondary btn-sm" style="cursor:pointer;width:fit-content;margin-bottom:16px;">
          📷 رفع إثبات التسليم
          <input type="file" id="podFileInput" accept="image/*" style="display:none"
            onchange="App.uploadPOD('${esc(s.id)}','podFileInput')"/>
        </label>`:""}
      ${s.podUrl?`<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">إثبات التسليم</div>
        <img src="${esc(s.podUrl)}" style="width:180px;border-radius:var(--radius);border:2px solid var(--gray-200);"/></div>`:""}
      <div class="timeline" id="tlBox-${esc(s.id)}">
        <h4>${icon("log",13)} سجل الشحنة</h4>
        <div class="page-loader"><span class="spinner"></span></div>
      </div>
    </div>`;
}

// ── TASKS VIEW ────────────────────────────────────────────
function viewTasks() {
  const list=visible().filter(s=>!["delivered","returned","cancelled"].includes(s.status));
  if(!list.length) return `<div class="empty"><div class="empty-icon">✅</div><h3>لا توجد مهام معلقة</h3><p>كل الشحنات تم تسليمها أو لم يتم تعيينك بعد</p></div>`;
  return `<div style="display:flex;flex-direction:column;gap:14px;">
    ${list.map(s=>`
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <span class="badge ${STATUS_MAP[s.status]?.badge||"badge-gray"}">${STATUS_MAP[s.status]?.label||s.status}</span>
              <span class="td-mono">${esc(s.id)}</span>
            </div>
            <div style="font-size:16px;font-weight:700;margin-bottom:4px;">${esc(s.customerName)}</div>
            <div style="font-size:13px;color:var(--gray-500);margin-bottom:4px;">📍 ${esc(s.governorate?`${s.governorate} — ${s.city}`:s.address)}</div>
            <div style="margin-bottom:4px;">
              <a href="tel:${esc(s.customerPhone)}" style="color:var(--brand);font-weight:600;font-size:13px;">📞 ${esc(s.customerPhone)}</a>
              ${s.customerPhone2?` &nbsp;<a href="tel:${esc(s.customerPhone2)}" style="color:var(--gray-500);font-size:12px;">📞 ${esc(s.customerPhone2)}</a>`:""}
            </div>
            <div style="font-size:14px;font-weight:700;color:var(--brand-dark);">💰 ${money(s.amount)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
            <a class="btn btn-secondary btn-sm" href="tel:${esc(s.customerPhone)}">📞 اتصال</a>
            <a class="btn btn-secondary btn-sm" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}" target="_blank">🗺 ملاحة</a>
            ${can("upload_pod")?`<label class="btn btn-secondary btn-sm" style="cursor:pointer;">📷 إثبات
              <input type="file" id="pod-${esc(s.id)}" accept="image/*" style="display:none" onchange="App.uploadPOD('${esc(s.id)}','pod-${esc(s.id)}')"/></label>
              ${s.signatureUrl
                ? `<span class="otp-verified-badge">✍️ تم التوقيع</span>`
                : `<button class="btn btn-secondary btn-sm" onclick="App.openSignatureCapture('${esc(s.id)}')">✍️ توقيع العميل</button>`}
            `:""}            ${s.status==="out_for_delivery"?`
              ${s.otpVerified
                ? `<div class="otp-verified-badge">✅ تم التحقق من الهوية</div>`
                : `<button class="btn btn-secondary btn-sm otp-send-btn" onclick="App.sendDeliveryOTP('${esc(s.id)}','${esc(s.customerPhone)}')">
                    📱 إرسال كود تحقق
                  </button>
                  <button class="btn btn-secondary btn-sm otp-verify-btn" onclick="App.openVerifyOTP('${esc(s.id)}')">
                    🔐 تأكيد بالكود
                  </button>`}
            `:""}
            ${can("change_status")?`
              <button class="btn btn-primary btn-sm" onclick="App.updateStatus('${esc(s.id)}','delivered')">✅ تم التسليم</button>
              <button class="btn btn-sm" style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger-border);"
                onclick="App.updateStatus('${esc(s.id)}','returned')">↩ مرتجع</button>`:""}
          </div>
        </div>
        ${s.podUrl?`<img src="${esc(s.podUrl)}" style="width:120px;border-radius:var(--radius);border:2px solid var(--gray-200);margin-top:10px;"/>`:""}
      </div>`).join("")}
  </div>`;
}

// ── TRACK VIEW ────────────────────────────────────────────
function viewTrack() {
  const s=AppState.shipments.find(x=>x.id===AppState.selectedShipment);
  if(!s) return `<div class="empty" style="padding:80px 20px;">
    <div class="empty-icon">📦</div>
    <h3>${AppState.selectedShipment?"الشحنة غير موجودة":"تتبع شحنتك"}</h3>
    <p>${AppState.selectedShipment?"تأكد من رقم الشحنة":"أدخل رقم الشحنة الذي أرسله لك التاجر"}</p>
    <button class="btn btn-primary" onclick="App.manualTrack()" style="margin-top:8px;">🔍 تتبع شحنة</button>
  </div>`;
  const meta=STATUS_MAP[s.status]||{label:s.status,badge:"badge-gray"};
  const steps=STATUS_STEPS;const curIdx=steps.indexOf(s.status);
  return `
    <div class="track-hero">
      <div><div class="th-eyebrow">تتبع الشحنة</div><div class="th-id">${esc(s.id)}</div>
        <div class="th-sub">${esc(s.customerName)} · ${esc(s.governorate||s.address?.slice(0,30))}</div></div>
      <span class="badge ${meta.badge}" style="font-size:13px;padding:5px 14px;">${meta.label}</span>
    </div>
    <div class="card">
      <div class="prog-track">
        ${steps.map((st,i)=>`
          <div class="prog-step">
            <div class="prog-circle ${i<curIdx?"done":i===curIdx?"curr":""}">${i<=curIdx?"✓":i+1}</div>
            <span>${STATUS_MAP[st]?.label||st}</span>
          </div>
          ${i<steps.length-1?`<div class="prog-line ${i<curIdx?"done":""}"></div>`:""}`).join("")}
      </div>
      <div class="detail-grid" style="margin-top:16px;">
        <div class="detail-field"><div class="df-label">العميل</div><div class="df-value">${esc(s.customerName)}</div></div>
        <div class="detail-field"><div class="df-label">الهاتف</div><div class="df-value"><a href="tel:${esc(s.customerPhone)}" style="color:var(--brand);">📞 ${esc(s.customerPhone)}</a></div></div>
        <div class="detail-field"><div class="df-label">العنوان</div><div class="df-value">${esc(s.governorate?`${s.governorate} / ${s.city}`:s.address)}</div></div>
        <div class="detail-field"><div class="df-label">موعد التسليم</div><div class="df-value">${esc(s.eta)||"قيد التجهيز"}</div></div>
      </div>
      ${s.podUrl||s.signatureUrl?`<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;">
        ${s.podUrl?`<div><div style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;margin-bottom:6px;">📷 إثبات التسليم</div>
          <img src="${esc(s.podUrl)}" style="width:150px;border-radius:var(--radius);border:2px solid var(--gray-200);"/></div>`:""}
        ${s.signatureUrl?`<div><div style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;margin-bottom:6px;">✍️ توقيع العميل</div>
          <img src="${esc(s.signatureUrl)}" style="width:150px;border-radius:var(--radius);border:2px solid var(--gray-200);background:#fff;"/></div>`:""}
      </div>`:""}
      <div class="timeline" id="tlBox-${esc(s.id)}" style="margin-top:20px;">
        <h4>${icon("log",13)} سجل الأحداث</h4>
        <div class="page-loader"><span class="spinner"></span></div>
      </div>
    </div>`;
}

// ── ACCOUNTS VIEW ─────────────────────────────────────────
function viewAccounts() {
  const role = AppState.user.primary_role||AppState.user.role;

  if (role === "customer") return `<div class="empty">
    <div class="empty-icon">📦</div><h3>تتبع شحنتك</h3>
    <p>أدخل رقم الشحنة لمعرفة حالتها</p>
    <button class="btn btn-primary" onclick="App.manualTrack()">🔍 تتبع شحنة</button>
  </div>`;

  // Courier: real wallet view from driver_transactions
  if (role === "courier") return viewMyWallet();

  // Merchant / Admin: existing COD account view
  const list=visible();
  const del=list.filter(s=>s.status==="delivered");
  const ret=list.filter(s=>s.status==="returned");
  const rev=del.reduce((a,s)=>a+(s.amount||0),0);
  const fee=del.reduce((a,s)=>a+(s.deliveryFee||0),0);
  const retFee=ret.reduce((a,s)=>a+(s.returnFee||0),0);
  const isMerchant=role==="merchant";
  const bal=isMerchant?AppState.merchantBalance:(rev-fee-retFee);
  return `
    <div class="acct-header">
      <div>
        <div class="ah-label">الرصيد المستحق</div>
        <div class="ah-val">${money(bal)}</div>
      </div>
      ${isMerchant?`<button class="btn btn-secondary btn-sm"
        style="background:rgba(255,255,255,.15);color:#fff;border-color:rgba(255,255,255,.4);"
        onclick="App.requestSettlement()">طلب تسوية</button>`:""}
    </div>
    ${isMerchant&&AppState.merchantBalance>0?`
      <div class="card" style="margin-bottom:16px;border-right:4px solid var(--success);">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div>
            <div style="font-size:12px;color:var(--gray-500);font-weight:600;">رصيد COD المتاح</div>
            <div style="font-size:24px;font-weight:800;color:var(--success);">${money(AppState.merchantBalance)}</div>
          </div>
          <button class="btn btn-primary" onclick="App.requestSettlement()">طلب تسوية</button>
        </div>
      </div>`:""}
    <div class="kpi-grid" style="margin-bottom:20px;">
      ${kpi("تحصيلات",money(rev),"wallet","var(--success)","var(--success-bg)")}
      ${kpi("رسوم الشحن",money(fee),"truck","var(--danger)","var(--danger-bg)")}
      ${isMerchant?kpi("رسوم إرجاع",money(retFee),"refresh","var(--warning)","var(--warning-bg)"):""}
      ${kpi("الصافي",money(rev-fee-retFee),"chart","var(--brand)","var(--brand-light)")}
    </div>
    <div class="card">
      <h3 class="card-title" style="margin-bottom:14px;">${icon("chart")} كشف الحساب — الشحنات المسلمة</h3>
      ${shipTable(del)}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// PHASE 3: DRIVER SELF-SERVICE WALLET VIEW
// ══════════════════════════════════════════════════════════════
function viewMyWallet() {
  const bal  = AppState.myWalletBalance;
  const txns = AppState.myWalletTxns;
  const TYPE_LABELS = {
    delivery_fee:"رسوم تسليم", cod_collected:"تحصيل COD",
    cod_submitted:"تسليم COD", bonus:"مكافأة",
    deduction:"خصم",          advance:"سلفة",
    settlement:"تسوية",
  };

  const todayStr = new Date().toDateString();
  const todayTxns = txns.filter(t=>new Date(t.created_at).toDateString()===todayStr);
  const todayEarned = todayTxns.filter(t=>t.amount>0).reduce((a,t)=>a+t.amount,0);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
  const weekTxns = txns.filter(t=>new Date(t.created_at)>=weekAgo);
  const weekEarned = weekTxns.filter(t=>t.amount>0).reduce((a,t)=>a+t.amount,0);

  return `
    <div class="acct-header">
      <div>
        <div class="ah-label">رصيد المحفظة</div>
        <div class="ah-val">${money(bal)}</div>
      </div>
      <button class="btn btn-secondary btn-sm"
        style="background:rgba(255,255,255,.15);color:#fff;border-color:rgba(255,255,255,.4);"
        onclick="App.refreshMyWallet()">${icon("refresh",13)} تحديث</button>
    </div>
    <div class="kpi-grid" style="margin-bottom:20px;">
      ${kpi("أرباح اليوم",money(todayEarned),"wallet","var(--success)","var(--success-bg)")}
      ${kpi("أرباح الأسبوع",money(weekEarned),"chart","var(--brand)","var(--brand-light)")}
      ${kpi("عدد الحركات",txns.length,"box","var(--info)","var(--info-bg)")}
    </div>
    <div class="card">
      <h3 class="card-title" style="margin-bottom:14px;">${icon("log")} سجل المحفظة</h3>
      ${!txns.length
        ? `<div class="empty"><div class="empty-icon">💰</div><h3>لا توجد حركات بعد</h3>
            <p>ستظهر هنا أرباحك من التسليمات وأي مكافآت أو خصومات</p></div>`
        : `<div class="table-wrap"><table>
            <thead><tr><th>التاريخ</th><th>النوع</th><th>الشحنة</th><th>المبلغ</th><th>الرصيد بعدها</th></tr></thead>
            <tbody>
              ${txns.map(t=>`<tr>
                <td style="font-size:11px;color:var(--gray-400);white-space:nowrap;">${fmtTime(t.created_at)}</td>
                <td><span class="badge ${t.amount>0?"badge-success":"badge-danger"}">${TYPE_LABELS[t.type]||t.type}</span></td>
                <td class="td-mono" style="font-size:11px;">${t.shipment_code||"—"}</td>
                <td style="font-weight:700;color:${t.amount>0?"var(--success)":"var(--danger)"};">${t.amount>0?"+":""}${money(t.amount)}</td>
                <td style="font-weight:600;">${money(t.balance_after)}</td>
              </tr>`).join("")}
            </tbody>
          </table></div>`}
    </div>`;
}

// ── REPORTS VIEW ──────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// PHASE 9 — REPORTING & ANALYTICS HELPERS
// ─────────────────────────────────────────────────────────────
function getReportRange(range) {
  const now=new Date(), end=new Date(now), start=new Date(now);
  end.setHours(23,59,59,999);
  if      (range==="today")   { start.setHours(0,0,0,0); }
  else if (range==="week")    { start.setDate(now.getDate()-6); start.setHours(0,0,0,0); }
  else if (range==="month")   { start.setDate(1); start.setHours(0,0,0,0); }
  else if (range==="quarter") { start.setMonth(now.getMonth()-2,1); start.setHours(0,0,0,0); }
  else if (range==="year")    { start.setMonth(0,1); start.setHours(0,0,0,0); }
  return {start,end};
}

function filterByRange(list,range,field) {
  const {start,end}=getReportRange(range);
  return list.filter(s=>{ const d=new Date(s[field]||s.createdAt||0); return d>=start&&d<=end; });
}

function buildDailyChart(list,range) {
  const days=range==="today"?1:range==="week"?7:range==="month"?30:range==="quarter"?90:365;
  const buckets={};
  for (let i=days-1;i>=0;i--) {
    const d=new Date(); d.setDate(d.getDate()-i);
    const key=d.toISOString().split("T")[0];
    buckets[key]={delivered:0,returned:0,created:0};
  }
  list.forEach(s=>{
    const ck=(s.createdAt||"").split("T")[0];
    if(buckets[ck]) buckets[ck].created++;
    if(s.status==="delivered"){const dk=(s.deliveredAt||s.createdAt||"").split("T")[0];if(buckets[dk])buckets[dk].delivered++;}
    if(s.status==="returned") {const rk=(s.returnedAt||s.createdAt||"").split("T")[0]; if(buckets[rk])buckets[rk].returned++;}
  });
  return Object.entries(buckets).map(([date,v])=>({date,...v}));
}

function renderBarChart(data,valueKey,color,labelFn) {
  const max=Math.max(...data.map(d=>d[valueKey]),1);
  const show=data.length<=14?data:data.filter((_,i)=>i%Math.ceil(data.length/14)===0||i===data.length-1);
  return `<div style="display:flex;align-items:flex-end;gap:3px;height:90px;padding:0 4px;">
    ${show.map(d=>{
      const h=Math.max(Math.round((d[valueKey]/max)*72),2);
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;">
        <div style="font-size:9px;color:var(--gray-500);">${d[valueKey]||""}</div>
        <div style="width:100%;background:${color};border-radius:2px 2px 0 0;height:${h}px;" title="${labelFn(d)}"></div>
        <div style="font-size:9px;color:var(--gray-400);white-space:nowrap;overflow:hidden;max-width:28px;">${(d.date||"").slice(5)}</div>
      </div>`;
    }).join("")}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// MAIN VIEW FUNCTION
// ─────────────────────────────────────────────────────────────
function viewReports() {
  const role      = AppState.user.primary_role||AppState.user.role;
  const isAdmin   = role==="admin";
  const tab       = AppState.reportsTab||"overview";
  const range     = AppState.reportRange||"month";
  const allShips  = AppState.shipments;
  const list      = filterByRange(allShips,range,"createdAt");
  const delivered = list.filter(s=>s.status==="delivered");
  const returned  = list.filter(s=>s.status==="returned");
  const pending   = list.filter(s=>!["delivered","returned","cancelled"].includes(s.status));
  const total     = list.length||1;
  const cod       = delivered.reduce((a,s)=>a+(s.amount||0),0);
  const fees      = delivered.reduce((a,s)=>a+(s.deliveryFee||0),0);
  const retFees   = returned.reduce((a,s)=>a+(s.returnFee||0),0);
  const revenue   = fees+retFees;

  const RANGE_OPTS=[{v:"today",l:"اليوم"},{v:"week",l:"7 أيام"},{v:"month",l:"هذا الشهر"},{v:"quarter",l:"3 أشهر"},{v:"year",l:"هذا العام"}];
  const TABS=[
    {id:"overview",label:"نظرة عامة"},{id:"trends",label:"اتجاهات"},
    {id:"couriers",label:"المناديب"},
    ...(isAdmin?[{id:"merchants",label:"التجار"}]:[]),
    {id:"financial",label:"مالي"},
  ];

  const rangeBar=`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
    <span style="font-size:13px;font-weight:600;color:var(--gray-600);">الفترة:</span>
    ${RANGE_OPTS.map(o=>`<button class="filter-btn ${range===o.v?"active":""}" onclick="App.setReportRange('${o.v}')">${o.l}</button>`).join("")}
    <div style="margin-right:auto;display:flex;gap:6px;">
      ${can("export_excel")?`<button class="btn btn-secondary btn-sm" onclick="App.exportReportExcel()">📊 Excel</button>`:""}
      ${can("export_excel")?`<button class="btn btn-secondary btn-sm" onclick="App.exportReportPDF()">📄 PDF</button>`:""}
    </div>
  </div>`;

  const tabBar=`<div style="display:flex;gap:0;overflow-x:auto;border-bottom:1px solid var(--gray-200);margin-bottom:20px;">
    ${TABS.map(t=>`<button onclick="App.setReportsTab('${t.id}')"
      style="padding:10px 18px;border:none;background:none;font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer;
        border-bottom:2px solid ${tab===t.id?"var(--brand)":"transparent"};
        color:${tab===t.id?"var(--brand)":"var(--gray-500)"};">${t.label}</button>`).join("")}
  </div>`;

  let content="";

  // ── OVERVIEW ──────────────────────────────────────────────
  if (tab==="overview") {
    const delivRate=Math.round(delivered.length/total*100);
    const retRate  =Math.round(returned.length/total*100);
    content=`
      <div class="kpi-grid" style="margin-bottom:20px;">
        ${kpi("إجمالي الشحنات",list.length,"box","var(--brand)","var(--brand-light)")}
        ${kpi("تم التسليم",delivered.length,"chart","var(--success)","var(--success-bg)")}
        ${kpi("مرتجع",returned.length,"refresh","var(--danger)","var(--danger-bg)")}
        ${kpi("قيد التنفيذ",pending.length,"truck","var(--warning)","var(--warning-bg)")}
        ${kpi("إجمالي COD",money(cod),"wallet","var(--success)","var(--success-bg)")}
        ${kpi("صافي الإيرادات",money(revenue),"chart","var(--brand)","var(--brand-light)")}
      </div>
      <div class="grid-2col" style="gap:16px;margin-bottom:16px;">
        <div class="card">
          <h3 class="card-title" style="margin-bottom:16px;">${icon("chart")} معدلات الأداء</h3>
          ${[["معدل التسليم",delivRate+"%","var(--success)",delivRate],["معدل الإرجاع",retRate+"%","var(--danger)",retRate]]
            .map(([l,v,c,p])=>`<div style="margin-bottom:14px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="font-size:13px;">${l}</span><span style="font-weight:700;color:${c};">${v}</span>
              </div>
              <div style="background:var(--gray-100);border-radius:99px;height:8px;overflow:hidden;">
                <div style="background:${c};height:100%;border-radius:99px;width:${Math.min(p,100)}%;transition:width .4s;"></div>
              </div>
            </div>`).join("")}
          <div style="padding-top:12px;border-top:1px solid var(--gray-100);">
            ${[
              ["متوسط COD",money(delivered.length?Math.round(cod/delivered.length):0)],
              ["متوسط الرسوم",money(delivered.length?Math.round(fees/delivered.length):0)],
              ["صافي الإيرادات",money(revenue)],
              ["صافي COD للتجار",money(cod-fees-retFees)],
            ].map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gray-50);">
              <span style="font-size:12px;color:var(--gray-600);">${l}</span>
              <span style="font-weight:600;">${v}</span>
            </div>`).join("")}
          </div>
        </div>
        <div class="card">
          <h3 class="card-title" style="margin-bottom:16px;">${icon("box")} توزيع الحالات</h3>
          ${Object.entries(STATUS_MAP)
            .filter(([k])=>["submitted","out_for_delivery","delivered","returned","cancelled","rescheduled","suspended"].includes(k))
            .map(([k,v])=>{ const cnt=list.filter(s=>s.status===k).length; const p=Math.round(cnt/total*100);
              return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span class="badge ${v.badge||"badge-gray"}" style="width:90px;text-align:center;font-size:10px;">${v.label}</span>
                <div style="flex:1;background:var(--gray-100);border-radius:99px;height:6px;overflow:hidden;">
                  <div style="background:var(--brand);height:100%;border-radius:99px;width:${p}%;"></div>
                </div>
                <span style="font-size:12px;font-weight:600;min-width:24px;">${cnt}</span>
                <span style="font-size:11px;color:var(--gray-400);min-width:30px;">${p}%</span>
              </div>`;}).join("")}
        </div>
      </div>
      <div class="grid-2col" style="gap:16px;">
        <div class="card">
          <h3 class="card-title" style="margin-bottom:12px;">${icon("truck")} توزيع الخدمات</h3>
          ${Object.entries(SERVICE_MAP).map(([k,v])=>{ const cnt=list.filter(s=>s.serviceType===k).length;
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);">
              <span style="font-size:13px;">${v.icon} ${v.label}</span>
              <span style="font-weight:700;">${cnt} <span style="font-size:11px;color:var(--gray-400);">${Math.round(cnt/total*100)}%</span></span>
            </div>`;}).join("")}
        </div>
        <div class="card">
          <h3 class="card-title" style="margin-bottom:12px;">${icon("map")} أعلى المحافظات</h3>
          ${Object.entries(list.reduce((a,s)=>{a[s.governorate||"غير محدد"]=(a[s.governorate||"غير محدد"]||0)+1;return a;},{}))
            .sort((a,b)=>b[1]-a[1]).slice(0,8)
            .map(([g,c])=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gray-100);">
              <span style="font-size:13px;">${esc(g)}</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="background:var(--gray-200);border-radius:99px;height:5px;width:50px;overflow:hidden;">
                  <div style="background:var(--brand);height:100%;width:${Math.round(c/total*100)}%;"></div>
                </div>
                <span style="font-weight:600;font-size:12px;">${c}</span>
              </div>
            </div>`).join("")}
        </div>
      </div>`;
  }

  // ── TRENDS ────────────────────────────────────────────────
  else if (tab==="trends") {
    const chartData=buildDailyChart(list,range);
    content=`
      <div class="card" style="margin-bottom:16px;">
        <h3 class="card-title" style="margin-bottom:12px;">${icon("chart")} شحنات يومية — ${RANGE_OPTS.find(o=>o.v===range)?.l||range}</h3>
        ${renderBarChart(chartData,"created","var(--brand)",d=>d.date+": "+d.created+" شحنة")}
      </div>
      <div class="grid-2col" style="gap:16px;margin-bottom:16px;">
        <div class="card">
          <h3 class="card-title" style="margin-bottom:12px;">${icon("chart")} تسليمات يومية</h3>
          ${renderBarChart(chartData,"delivered","var(--success)",d=>d.date+": "+d.delivered)}
        </div>
        <div class="card">
          <h3 class="card-title" style="margin-bottom:12px;">${icon("refresh")} مرتجعات يومية</h3>
          ${renderBarChart(chartData,"returned","var(--danger)",d=>d.date+": "+d.returned)}
        </div>
      </div>
      <div class="card">
        <h3 class="card-title" style="margin-bottom:16px;">${icon("box")} إحصائيات الفترة</h3>
        <div class="kpi-grid">
          ${kpi("أعلى يوم إنشاء",Math.max(...chartData.map(d=>d.created),0),"box","var(--brand)","var(--brand-light)")}
          ${kpi("أعلى يوم تسليم",Math.max(...chartData.map(d=>d.delivered),0),"chart","var(--success)","var(--success-bg)")}
          ${kpi("متوسط يومي للإنشاء",Math.round(list.length/Math.max(chartData.length,1)),"truck","var(--info)","var(--info-bg)")}
          ${kpi("متوسط يومي للتسليم",Math.round(delivered.length/Math.max(chartData.length,1)),"chart","var(--success)","var(--success-bg)")}
        </div>
      </div>`;
  }

  // ── COURIERS ──────────────────────────────────────────────
  else if (tab==="couriers") {
    const cm={};
    list.forEach(s=>{
      if(!s.courierId)return;
      const k=s.courierId;
      if(!cm[k])cm[k]={name:s.courierName||"—",total:0,delivered:0,returned:0,cod:0,fees:0};
      cm[k].total++;
      if(s.status==="delivered"){cm[k].delivered++;cm[k].cod+=s.amount||0;cm[k].fees+=s.deliveryFee||0;}
      if(s.status==="returned") cm[k].returned++;
    });
    const couriers=Object.entries(cm)
      .map(([id,v])=>({id,...v,rate:v.total?Math.round(v.delivered/v.total*100):0}))
      .sort((a,b)=>b.delivered-a.delivered);
    content=`
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("truck")} أداء المناديب</h3>
          ${can("export_excel")?`<button class="btn btn-secondary btn-sm" onclick="App.exportCourierReport()">📊 تصدير</button>`:""}
        </div>
        ${!couriers.length?`<div class="empty"><div class="empty-icon">🚚</div><h3>لا بيانات للفترة المحددة</h3></div>`:`
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>المندوب</th><th>إجمالي</th><th>تسليم</th><th>إرجاع</th><th>معدل التسليم</th><th>COD</th><th>الرسوم</th></tr></thead>
          <tbody>
            ${couriers.map((c,i)=>`<tr>
              <td style="font-weight:700;color:var(--gray-400);">${i+1}</td>
              <td><div style="display:flex;align-items:center;gap:8px;">
                <div style="width:28px;height:28px;border-radius:50%;background:var(--brand-light);color:var(--brand-dark);
                  display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${initials(c.name)}</div>
                <b>${esc(c.name)}</b></div></td>
              <td style="font-weight:600;">${c.total}</td>
              <td style="color:var(--success);font-weight:600;">${c.delivered}</td>
              <td style="color:var(--danger);font-weight:600;">${c.returned}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;">
                  <div style="background:var(--gray-100);border-radius:99px;height:6px;width:50px;overflow:hidden;">
                    <div style="background:${c.rate>=80?"var(--success)":c.rate>=60?"var(--warning)":"var(--danger)"};height:100%;border-radius:99px;width:${c.rate}%;"></div>
                  </div>
                  <span style="font-size:12px;font-weight:700;color:${c.rate>=80?"var(--success)":c.rate>=60?"var(--warning)":"var(--danger)"};">${c.rate}%</span>
                </div>
              </td>
              <td style="font-weight:600;">${money(c.cod)}</td>
              <td style="color:var(--brand);font-weight:600;">${money(c.fees)}</td>
            </tr>`).join("")}
          </tbody>
        </table></div>`}
      </div>`;
  }

  // ── MERCHANTS (admin only) ────────────────────────────────
  else if (tab==="merchants"&&isAdmin) {
    const mm={};
    list.forEach(s=>{
      if(!s.merchantId)return;
      const k=s.merchantId;
      if(!mm[k])mm[k]={name:s.merchantName||"—",total:0,delivered:0,returned:0,cod:0,fees:0,retFees:0};
      mm[k].total++;
      if(s.status==="delivered"){mm[k].delivered++;mm[k].cod+=s.amount||0;mm[k].fees+=s.deliveryFee||0;}
      if(s.status==="returned") {mm[k].returned++;mm[k].retFees+=s.returnFee||0;}
    });
    const merchants=Object.entries(mm)
      .map(([id,v])=>({id,...v,rate:v.total?Math.round(v.delivered/v.total*100):0,net:v.cod-v.fees-v.retFees}))
      .sort((a,b)=>b.total-a.total);
    content=`
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("users")} أداء التجار</h3>
          ${can("export_excel")?`<button class="btn btn-secondary btn-sm" onclick="App.exportMerchantReport()">📊 تصدير</button>`:""}
        </div>
        ${!merchants.length?`<div class="empty"><div class="empty-icon">🏢</div><h3>لا بيانات للفترة المحددة</h3></div>`:`
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>التاجر</th><th>إجمالي</th><th>تسليم</th><th>إرجاع</th><th>معدل</th><th>COD</th><th>الرسوم</th><th>صافي</th></tr></thead>
          <tbody>
            ${merchants.map((m,i)=>`<tr>
              <td style="font-weight:700;color:var(--gray-400);">${i+1}</td>
              <td><div style="display:flex;align-items:center;gap:8px;">
                <div style="width:28px;height:28px;border-radius:50%;background:var(--success-bg);color:var(--success);
                  display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${initials(m.name)}</div>
                <b>${esc(m.name)}</b></div></td>
              <td style="font-weight:600;">${m.total}</td>
              <td style="color:var(--success);font-weight:600;">${m.delivered}</td>
              <td style="color:var(--danger);font-weight:600;">${m.returned}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;">
                  <div style="background:var(--gray-100);border-radius:99px;height:6px;width:50px;overflow:hidden;">
                    <div style="background:${m.rate>=80?"var(--success)":m.rate>=60?"var(--warning)":"var(--danger)"};height:100%;border-radius:99px;width:${m.rate}%;"></div>
                  </div>
                  <span style="font-size:12px;font-weight:700;">${m.rate}%</span>
                </div>
              </td>
              <td style="font-weight:600;">${money(m.cod)}</td>
              <td style="font-size:12px;color:var(--danger);">${money(m.fees+m.retFees)}</td>
              <td style="font-weight:700;color:${m.net>=0?"var(--success)":"var(--danger)"};">${money(m.net)}</td>
            </tr>`).join("")}
          </tbody>
        </table></div>`}
      </div>`;
  }

  // ── FINANCIAL ─────────────────────────────────────────────
  else if (tab==="financial") {
    content=`
      <div class="kpi-grid" style="margin-bottom:16px;">
        ${kpi("إجمالي COD",money(cod),"wallet","var(--success)","var(--success-bg)")}
        ${kpi("رسوم الشحن",money(fees),"chart","var(--brand)","var(--brand-light)")}
        ${kpi("رسوم الإرجاع",money(retFees),"refresh","var(--danger)","var(--danger-bg)")}
        ${kpi("صافي الإيرادات",money(revenue),"wallet","var(--info)","var(--info-bg)")}
        ${kpi("صافي COD للتجار",money(cod-fees-retFees),"chart","var(--brand)","var(--brand-light)")}
        ${kpi("متوسط COD",money(delivered.length?Math.round(cod/delivered.length):0),"box","var(--warning)","var(--warning-bg)")}
      </div>
      <div class="card" style="margin-bottom:16px;">
        <h3 class="card-title" style="margin-bottom:16px;">${icon("chart")} ملخص مالي مفصل</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>البند</th><th>القيمة</th><th>الملاحظة</th></tr></thead>
          <tbody>
            ${[
              ["إجمالي COD المحصل",money(cod),"من العملاء للشحنات المسلمة"],
              ["رسوم الشحن المستحقة",money(fees),"تُخصم من COD للتاجر"],
              ["رسوم الإرجاع",money(retFees),"للشحنات المرتجعة"],
              ["إجمالي إيرادات الشركة",money(revenue),"رسوم الشحن + رسوم الإرجاع"],
              ["صافي COD للتجار",money(cod-fees-retFees),"المبلغ الواجب تسويته"],
              ["معدل الاسترداد",Math.round(retFees/(revenue||1)*100)+"%","رسوم الإرجاع من إجمالي الرسوم"],
            ].map(([l,v,n])=>`<tr>
              <td style="font-weight:600;">${l}</td>
              <td style="font-weight:700;font-size:15px;">${v}</td>
              <td style="font-size:12px;color:var(--gray-500);">${n}</td>
            </tr>`).join("")}
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <h3 class="card-title" style="margin-bottom:16px;">${icon("chart")} أعلى المحافظات بالإيرادات</h3>
        ${Object.entries(delivered.reduce((a,s)=>{const g=s.governorate||"غير محدد";if(!a[g])a[g]={cod:0,count:0};a[g].cod+=s.amount||0;a[g].count++;return a;},{}))
          .sort((a,b)=>b[1].cod-a[1].cod).slice(0,10)
          .map(([g,v],i)=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-100);">
            <span style="font-weight:700;color:var(--gray-400);min-width:20px;">${i+1}</span>
            <span style="font-size:13px;flex:1;">${esc(g)}</span>
            <span style="font-size:12px;color:var(--gray-500);">${v.count} شحنة</span>
            <span style="font-weight:700;color:var(--success);">${money(v.cod)}</span>
          </div>`).join("")}
      </div>`;
  }

  return `<div id="reportsRoot">${rangeBar}${tabBar}${content}</div>`;
}

// ── USERS VIEW
function viewUsers() {
  if(!can("manage_users")) return `<div class="empty"><h3>غير مصرح</h3></div>`;
  const f=(AppState.userFilter||"").toLowerCase();
  const filtered=AppState.users.filter(u=>`${u.name} ${u.email} ${u.phone} ${u.role||u.primary_role}`.toLowerCase().includes(f));
  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">${icon("users")} إدارة المستخدمين</h3>
        <button class="btn btn-primary btn-sm" id="addUserBtn">${icon("plus",13)} مستخدم جديد</button>
      </div>
      <div style="margin-bottom:14px;"><input id="userSearch" value="${esc(AppState.userFilter)}"
        placeholder="ابحث بالاسم أو البريد أو الدور..."
        style="width:100%;padding:9px 14px;border-radius:var(--radius);border:1.5px solid var(--gray-300);font-size:13px;"/></div>
      <div class="table-wrap"><table>
        <thead><tr><th>الاسم</th><th>الدور</th><th>البريد</th><th>الهاتف</th><th>تاريخ الإنشاء</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${!filtered.length?`<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-400);">لا يوجد مستخدمون</td></tr>`
            :filtered.map(u=>`<tr class="${u.is_suspended?"muted":""}">
              <td><div style="display:flex;align-items:center;gap:8px;">
                <div style="width:28px;height:28px;border-radius:50%;background:var(--brand-light);color:var(--brand-dark);
                  display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${initials(u.name)}</div>
                <b>${esc(u.name)}</b></div></td>
              <td><span class="badge ${ROLE_MAP[u.primary_role||u.role]?.badge||"badge-gray"}">${ROLE_MAP[u.primary_role||u.role]?.label||u.role}</span></td>
              <td style="font-size:12px;">${esc(u.email)}</td>
              <td style="font-size:12px;">${esc(u.phone||"—")}</td>
              <td style="font-size:11px;color:var(--gray-400);">${esc(u.createdAt)}</td>
              <td><span class="badge ${u.is_suspended?"badge-danger":"badge-success"}">${u.is_suspended?"موقوف":"نشط"}</span></td>
              <td><div class="td-actions">
                <button class="btn-icon" onclick="App.editUser('${esc(u.id)}')" title="تعديل">${icon("edit",13)}</button>
                <button class="btn-icon" onclick="App.toggleUser('${esc(u.id)}')" title="${u.is_suspended?"تفعيل":"إيقاف"}">${u.is_suspended?"✅":"🚫"}</button>
                <button class="btn-icon" onclick="App.deleteUser('${esc(u.id)}')" title="حذف" style="color:var(--danger);">${icon("trash",13)}</button>
              </div></td>
            </tr>`).join("")}
        </tbody>
      </table></div>
    </div>`;
}

// ── AUDIT VIEW ────────────────────────────────────────────
function viewAudit() {
  if(!can("view_audit")) return `<div class="empty"><h3>غير مصرح</h3></div>`;
  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">${icon("shield")} سجل النشاط</h3>
        <button class="btn btn-secondary btn-sm" onclick="App.loadAudit()">${icon("refresh",13)} تحديث</button>
      </div>
      <div style="margin-bottom:14px;"><input id="auditSearch" value="${esc(AppState.auditFilter)}"
        placeholder="ابحث بالمستخدم أو الإجراء..."
        style="width:100%;padding:9px 14px;border-radius:var(--radius);border:1.5px solid var(--gray-300);font-size:13px;"/></div>
      <div id="auditContent"><div class="page-loader"><span class="spinner"></span> جاري تحميل السجل...</div></div>
    </div>`;
}

// ══════════════════════════════════════════════════════════
// BIND EVENTS
// ══════════════════════════════════════════════════════════
function bindDashboardEvents() {
  $$("[data-view]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      AppState.view=btn.dataset.view;
      AppState.statusFilter="all";
      // rerenderContent() only replaces #viewContent — it never
      // touches the sidebar, so the active class must be synced here.
      $$("[data-view]").forEach(b=>{
        b.classList.toggle("active", b.dataset.view===AppState.view);
      });
      rerenderContent();
    });
  });
  $("roleSwitcher")?.addEventListener("change", async e => {
    const r = e.target.value;
    if (!r) return;

    // Store original admin identity for restoring later
    const isPreview = r !== "admin";
    if (!AppState._originalRole) AppState._originalRole = "admin";

    // Update both role fields for full compatibility
    AppState.user.role         = r;
    AppState.user.primary_role = r;

    // Set appropriate default view for the previewed role
    AppState.view         = r === "customer" ? "track" : r === "courier" ? "tasks" : r === "merchant" ? "shipments" : "overview";
    AppState.statusFilter = "all";
    AppState.query        = "";

    // Reload permissions using fallback (no DB call for preview)
    AppPerms.clear();
    (PERMS_FALLBACK[r] || PERMS_FALLBACK.customer).forEach(p => AppPerms.add(p));

    // Full re-render — render() rebuilds entire page including sidebar nav for the new role
    render();
  });
  $("logoutBtn")?.addEventListener("click",async()=>{
    await DB.addAudit("LOGOUT","","User logged out","auth");
    await db.auth.signOut();
    clearSession();
    AppPerms.clear();
    if(AppState.realtimeChannel){db.removeChannel(AppState.realtimeChannel);AppState.realtimeChannel=null;}
    AppState.user=null;AppState.shipments=[];AppState.users=[];AppState.couriers=[];
    AppState.notifications=[];AppState.page="home";
    render();toast("تم تسجيل الخروج","info");
  });
  // Search inputs handled by bindContentEvents() on each rerenderContent
  // Content-level events handled by bindContentEvents() — called from rerenderContent()
  $("toggleNotif")?.addEventListener("click",()=>{
    const d=$("notifDropdown");if(!d)return;
    const open=d.style.display==="block";
    d.style.display=open?"none":"block";
    if(!open){AppState.notifications.forEach(n=>n.isRead=true);document.querySelector(".notif-count")?.remove();}
  });
  $("clearNotif")?.addEventListener("click",async()=>{
    AppState.notifications=[];
    try{await db.from("notifications").delete().neq("id","00000000-0000-0000-0000-000000000000");}catch(e){}
    rerenderContent();
  });
  $("menuToggle")?.addEventListener("click",()=>{
    $("sidebar")?.classList.toggle("open");$("sbOverlay")?.classList.toggle("active");
  });
  $("sbOverlay")?.addEventListener("click",()=>{
    $("sidebar")?.classList.remove("open");$("sbOverlay")?.classList.remove("active");
  });
}

// ══════════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════════
const Modals={
  open(html){
    const w=document.createElement("div");w.className="modal-wrap";w.id="modalWrap";
    w.innerHTML=html;document.body.appendChild(w);
    w.addEventListener("click",e=>{if(e.target===w)Modals.close();});return w;
  },
  close(){document.querySelector("#modalWrap")?.remove();},

  scanner(){
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>📷 مسح QR</h3><button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div id="qrReader"></div>
        <button class="btn btn-secondary" style="width:100%;margin-top:12px;" id="manualQR">إدخال كود يدوياً</button>
      </div>
    </div>`);
    $("manualQR").onclick=()=>{Modals.close();App.manualTrack();};
    let scanner;
    try{
      scanner=new Html5Qrcode("qrReader");
      scanner.start({facingMode:"environment"},{fps:10,qrbox:250},
        t=>{scanner.stop();Modals.close();location.href=t;}).catch(()=>{});
    }catch(e){}
    const orig=Modals.close.bind(Modals);
    Modals.close=async()=>{try{if(scanner)await scanner.stop();}catch(e){}orig();Modals.close=orig;};
  },

  async newShipment(){
    // Reload couriers fresh + load full cities dataset
    const [freshCouriers] = await Promise.all([DB.loadCouriers(), loadEgyptData()]);
    AppState.couriers = freshCouriers;
    const couriers = AppState.couriers;
    const autoCode = `ANE-${Date.now().toString().slice(-6)}`;
    Modals.open(`<div class="modal modal-xl">
      <div class="modal-header">
        <h3>${icon("pkg",18)} شحنة جديدة</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button>
      </div>
      <div class="modal-body">
        <div class="form-section-label">بيانات الشحنة</div>
        <div class="form-row">
          <div class="field"><label>كود الشحنة *</label><input id="fCode" value="${autoCode}" style="font-weight:700;font-family:monospace;"/></div>
          <div class="field"><label>قيمة الطلب (ج.م) *</label><input id="fAmount" type="number" min="0" placeholder="0"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>رسوم الشحن (ج.م)</label><input id="fFee" type="number" value="60" min="0"/></div>
          <div class="field"><label>رسوم الإرجاع (ج.م)</label><input id="fReturnFee" type="number" value="0" min="0"/></div>
        </div>
        <div id="fFeeHint" style="font-size:11px;color:var(--brand);background:var(--brand-light);
          border-radius:var(--radius);padding:6px 12px;margin-bottom:4px;display:block;"></div>
        <div class="form-row">
          <div class="field"><label>موعد التسليم</label><input id="fEta" placeholder="مثال: خلال 48 ساعة"/></div>
          <div class="field"><label>باركود (اختياري)</label><input id="fBarcode" placeholder="رقم الباركود"/></div>
        </div>
        <div class="form-section-label">نوع الخدمة والطلب</div>
        <div class="form-row">
          <div class="field"><label>نوع الخدمة *</label>
            <select id="fServiceType">
              <option value="door_to_door">🚪 توصيل للباب</option>
              <option value="drop_off">📦 إيداع في الفرع</option>
              <option value="pickup">🏪 استلام من الفرع</option>
            </select>
          </div>
          <div class="field"><label>نوع الطلب *</label>
            <select id="fOrderType">
              <option value="standard">📦 عادي</option>
              <option value="express">⚡ سريع</option>
              <option value="scheduled">📅 مجدول</option>
            </select>
          </div>
        </div>
        <div id="fScheduledRow" class="form-row single" style="display:none;">
          <div class="field"><label>تاريخ التسليم المجدول</label><input id="fScheduledAt" type="datetime-local"/></div>
        </div>
        ${AppState.branches.length?`
        <div class="form-row">
          <div class="field"><label>الفرع (اختياري)</label>
            <select id="fBranch">
              <option value="">-- بدون تحديد --</option>
              ${AppState.branches.map(b=>`<option value="${esc(b.id)}" data-name="${esc(b.name)}">${esc(b.name)} (${esc(b.code)})</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>المستودع (اختياري)</label>
            <select id="fWarehouse">
              <option value="">-- بدون تحديد --</option>
              ${AppState.warehouses.map(w=>`<option value="${esc(w.id)}" data-name="${esc(w.name)}">${esc(w.name)} (${esc(w.code)})</option>`).join("")}
            </select>
          </div>
        </div>`:""}
        <div class="form-section-label">المواصفات الفيزيائية (اختياري)</div>
        <div class="form-row three">
          <div class="field"><label>الوزن (كجم)</label><input id="fWeight" type="number" step="0.1" min="0" placeholder="0.0"/></div>
          <div class="field"><label>الكمية</label><input id="fQty" type="number" value="1" min="1"/></div>
          <div class="field"><label>الأبعاد (سم)</label>
            <div style="display:flex;gap:4px;">
              <input id="fWidth"  type="number" step="0.1" min="0" placeholder="ع" style="width:33%"/>
              <input id="fHeight" type="number" step="0.1" min="0" placeholder="ط" style="width:33%"/>
              <input id="fDepth"  type="number" step="0.1" min="0" placeholder="ا" style="width:33%"/>
            </div>
          </div>
        </div>
        <div class="form-section-label">بيانات العميل</div>
        <div class="form-row">
          <div class="field"><label>اسم العميل *</label><input id="fCustName"/></div>
          <div class="field"><label>الهاتف الأول *</label><input id="fPhone" type="tel" placeholder="01xxxxxxxxx"/></div>
        </div>
        <div class="form-row single">
          <div class="field"><label>الهاتف الثاني (اختياري)</label><input id="fPhone2" type="tel" placeholder="01xxxxxxxxx"/></div>
        </div>
        <div class="form-section-label">العنوان</div>
        <div class="form-row">
          <div class="field"><label>المحافظة *</label><select id="fGov"><option value="">جاري التحميل...</option></select></div>
          <div class="field"><label>المدينة / المركز</label><select id="fCity"><option value="">اختر المدينة</option></select></div>
        </div>
        <div class="form-row three">
          <div class="field"><label>الشارع</label><input id="fStreet"/></div>
          <div class="field"><label>العمارة</label><input id="fBuild"/></div>
          <div class="field"><label>الدور / الشقة</label><input id="fFloor"/></div>
        </div>
        ${couriers.length?`
        <div class="form-section-label">تعيين مندوب (اختياري)</div>
        <div class="form-row single">
          <div class="field"><label>المندوب</label>
            <select id="fCourier">
              <option value="">-- بدون تعيين --</option>
              ${couriers.map(c=>`<option value="${esc(c.id)}" data-name="${esc(c.full_name)}">${esc(c.full_name)}${c.phone?` — ${esc(c.phone)}`:""}</option>`).join("")}
            </select>
          </div>
        </div>`:""}
        <div class="form-section-label">ملاحظات</div>
        <div class="form-row single">
          <div class="field"><textarea id="fNotes" rows="2" placeholder="ملاحظات إضافية..." style="resize:vertical;"></textarea></div>
        </div>
        <div id="shipErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveShipBtn">${icon("plus",14)} حفظ الشحنة</button>
      </div>
    </div>`);

    // Populate governorate dropdown after loading full dataset
    await loadEgyptData();
    const govOpts2 = Object.keys(EGYPT_GOV).sort()
      .map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join("");
    $("fGov").innerHTML = `<option value="">اختر المحافظة</option>` + govOpts2;

    // Show/hide scheduled date field
    // Auto-calculate fee when key fields change
    const recalcFee = async () => {
      const gov = $("fGov")?.value;
      const svc = $("fServiceType")?.value || "door_to_door";
      const ord = $("fOrderType")?.value   || "standard";
      const wgt = Number($("fWeight")?.value) || 0;
      if (!gov) return;
      const result = await DB.calculateFee(
        (AppState.user.primary_role||AppState.user.role)==="merchant" ? AppState.user.id : null,
        gov, svc, ord, wgt
      );
      const hint = $("fFeeHint");
      if (result && result.delivery_fee != null) {
        if ($("fFee"))       $("fFee").value       = result.delivery_fee;
        if ($("fReturnFee")) $("fReturnFee").value  = result.return_fee || 0;
        if (hint) hint.textContent = `✓ سعر تلقائي: ${result.zone_name||""} — ${result.matched_on||""}`;
      } else {
        if (hint) hint.textContent = "ℹ️ لا توجد قاعدة سعر — يُستخدم السعر الافتراضي";
      }
    };

    $("fOrderType")?.addEventListener("change", e => {
      const row = $("fScheduledRow");
      if (row) row.style.display = e.target.value === "scheduled" ? "" : "none";
      recalcFee();
    });

    $("fGov").addEventListener("change", e => {
      const cities = (EGYPT_GOV[e.target.value] || []);
      $("fCity").innerHTML = `<option value="">اختر المدينة / المركز</option>` +
        cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
      recalcFee();
    });

    $("fServiceType")?.addEventListener("change", recalcFee);
    $("fWeight")?.addEventListener("change", recalcFee);

    $("saveShipBtn").addEventListener("click",async()=>{
      const code=$("fCode")?.value.trim(),cName=$("fCustName")?.value.trim();
      const cPhone=$("fPhone")?.value.trim(),cPhone2=$("fPhone2")?.value.trim();
      const amount=Number($("fAmount")?.value)||0,fee=Number($("fFee")?.value)||60;
      const eta=$("fEta")?.value.trim(),gov=$("fGov")?.value,city=$("fCity")?.value;
      const street=$("fStreet")?.value.trim(),build=$("fBuild")?.value.trim(),floor=$("fFloor")?.value.trim();
      const notes=$("fNotes")?.value.trim();
      const sel=$("fCourier");
      const courierId=sel?.value||null,courierName=courierId?(sel.options[sel.selectedIndex]?.dataset.name||""):"";
      const errEl=$("shipErr");const btn=$("saveShipBtn");
      errEl.style.display="none";
      if(!code||!cName||!cPhone||!amount){errEl.style.display="block";errEl.textContent="الحقول المطلوبة: الكود، اسم العميل، الهاتف، القيمة";return;}
      if(!gov){errEl.style.display="block";errEl.textContent="يرجى اختيار المحافظة";return;}
      // Read Phase 1 fields
      const serviceType = $("fServiceType")?.value || "door_to_door";
      const orderType   = $("fOrderType")?.value   || "standard";
      const scheduledAt = $("fScheduledAt")?.value  || null;
      const returnFee   = Number($("fReturnFee")?.value) || 0;
      const barcode     = $("fBarcode")?.value?.trim() || null;
      const weight      = $("fWeight")?.value  ? Number($("fWeight").value)  : null;
      const qty         = $("fQty")?.value     ? Number($("fQty").value)     : 1;
      const width       = $("fWidth")?.value   ? Number($("fWidth").value)   : null;
      const height      = $("fHeight")?.value  ? Number($("fHeight").value)  : null;
      const depth       = $("fDepth")?.value   ? Number($("fDepth").value)   : null;

      btn.disabled=true; btn.innerHTML=`<span class="spinner"></span> جاري الحفظ...`;
      try {
        const { data:{ session } } = await db.auth.getSession();
        const uid        = session?.user?.id || AppState.user?.id || null;
        const isMerchant = (AppState.user.primary_role||AppState.user.role) === "merchant";
        await DB.createShipment({
          shipment_code:   code,
          customer_name:   cName,
          customer_phone:  cPhone,
          customer_phone2: cPhone2 || null,
          // Address
          governorate: gov,
          city:        city   || null,
          street:      street || null,
          building:    build  || null,
          floor:       floor  || null,
          apartment:   null,
          // Financials
          amount:       amount,
          delivery_fee: fee,
          return_fee:   returnFee,
          // Phase 1: service & order
          service_type: serviceType,
          order_type:   orderType,
          scheduled_at: scheduledAt || null,
          // Phase 1: physical
          weight:   weight,
          quantity: qty,
          width:    width,
          height:   height,
          depth:    depth,
          barcode:  barcode,
          branch_id:    $("fBranch")?.value||null,
          warehouse_id: $("fWarehouse")?.value||null,
          // Status — start as submitted
          status: "submitted",
          eta:    eta || null,
          notes:  notes || null,
          // Merchant — merchant_name/phone are NOT NULL DEFAULT '' in DB
          // send "" for admin-created shipments, never null (violates constraint)
          merchant_id:    isMerchant ? uid : null,
          merchant_name:  isMerchant ? (AppState.user.name  || "") : "",
          merchant_phone: isMerchant ? (AppState.user.phone || "") : "",
          // Courier
          courier_id:   courierId || null,
          courier_name: courierName || null,
          // Metadata
          created_by: uid,
        });
        await DB.addTimeline(code,"تم إنشاء الشحنة",AppState.user.name,(AppState.user.primary_role||AppState.user.role));
        await DB.addNotification(`شحنة جديدة: ${code} — ${cName}`,"admin",code,"shipment");
        await DB.addAudit("CREATE_SHIPMENT",code,`By ${AppState.user.name} for ${cName}`);
        Modals.close();
        // Reload shipments to get the DB-computed address_full
        AppState.shipments = await DB.loadShipments();
        // Realtime subscription will also pick this up for admin
        rerenderContent();
        toast(`✅ تم إضافة الشحنة ${code}`);
      } catch(err) {
        errEl.style.display="block";
        errEl.textContent=err.message?.includes("23505")?"كود الشحنة موجود بالفعل":"خطأ: "+err.message;
        btn.disabled=false;btn.innerHTML=`${icon("plus",14)} حفظ الشحنة`;
      }
    });
  },

  addUser(){
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>${icon("user",18)} مستخدم جديد</h3><button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="field"><label>الاسم الكامل *</label><input id="uName"/></div>
        <div class="field"><label>البريد الإلكتروني *</label><input id="uEmail" type="email"/></div>
        <div class="field"><label>كلمة المرور *</label><input id="uPass" type="password"/></div>
        <div class="field"><label>الهاتف</label><input id="uPhone" type="tel"/></div>
        <div class="field"><label>الدور</label>
          <select id="uRole">
            <option value="merchant">تاجر</option><option value="courier">مندوب</option>
            <option value="customer">عميل</option><option value="admin">إدارة</option>
          </select>
        </div>
        <div id="uErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveUserBtn">حفظ</button>
      </div>
    </div>`);
    $("saveUserBtn").addEventListener("click",async()=>{
      const name=$("uName").value.trim(),email=$("uEmail").value.trim();
      const pass=$("uPass").value,phone=$("uPhone").value.trim(),role=$("uRole").value;
      const errEl=$("uErr"),btn=$("saveUserBtn");
      errEl.style.display="none";
      if(!name||!email||!pass){errEl.style.display="block";errEl.textContent="يرجى تعبئة الحقول المطلوبة";return;}
      if(pass.length<6){errEl.style.display="block";errEl.textContent="كلمة المرور 6 أحرف على الأقل";return;}
      btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        const{data,error}=await db.auth.signUp({email,password:pass,options:{data:{full_name:name,role,phone}}});
        if(error)throw error;
        await db.from("profiles").upsert([{id:data.user.id,full_name:name,email,phone,primary_role:role,is_active:true}]);
        await DB.addAudit("CREATE_USER",data.user.id,`Admin created ${role}: ${email}`);
        AppState.users.push({id:data.user.id,name,email,phone,role,isActive:true,suspended:false,createdAt:fmtDate(new Date()),balance:0});
        Modals.close();rerenderContent();
        toast(`✅ تم إنشاء ${name} كـ ${ROLE_MAP[role]?.label}`);
      }catch(err){
        errEl.style.display="block";
        errEl.textContent=err.message?.includes("already")?"البريد مسجل بالفعل":"خطأ: "+err.message;
        btn.disabled=false;btn.textContent="حفظ";
      }
    });
  }
};

// ══════════════════════════════════════════════════════════
// APP GLOBAL FUNCTIONS
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// PHASE 2D — BRANCH & WAREHOUSE MANAGEMENT VIEW
// ══════════════════════════════════════════════════════════════

function viewBranches() {
  const tab        = AppState.branchTab || "branches";
  const branches    = AppState.branches;
  const warehouses  = AppState.warehouses;

  const TABS = [
    { id:"branches",   label:"الفروع",     icon:"map"   },
    { id:"warehouses", label:"المستودعات", icon:"pkg"   },
  ];

  const tabBar = `
    <div style="display:flex;gap:0;overflow-x:auto;border-bottom:1px solid var(--gray-200);margin-bottom:20px;">
      ${TABS.map(t=>`
        <button onclick="App.setBranchTab('${t.id}')"
          style="padding:12px 18px;border:none;background:none;font-size:13px;font-weight:500;
            white-space:nowrap;cursor:pointer;
            border-bottom:2px solid ${tab===t.id?"var(--brand)":"transparent"};
            color:${tab===t.id?"var(--brand)":"var(--gray-500)"};">
          ${t.label}
        </button>`).join("")}
    </div>`;

  let content = "";

  if (tab === "branches") {
    content = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("map")} الفروع (${branches.length})</h3>
          ${can("branches.create")?`<button class="btn btn-primary btn-sm" onclick="App.addBranch()">${icon("plus",13)} إضافة فرع</button>`:""}
        </div>
        ${!branches.length
          ? `<div class="empty"><div class="empty-icon">🏢</div><h3>لا توجد فروع</h3>
              <p>أضف فروعك لتنظيم عمليات التوصيل</p>
              ${can("branches.create")?`<button class="btn btn-primary" onclick="App.addBranch()">إضافة فرع</button>`:""}
            </div>`
          : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;">
              ${branches.map(b=>`
                <div class="card" style="border:1px solid var(--gray-200);padding:16px;">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                    <div>
                      <div style="font-size:15px;font-weight:700;">${esc(b.name)}</div>
                      <div class="td-mono" style="font-size:11px;color:var(--gray-400);">${esc(b.code)}</div>
                    </div>
                    <span class="badge ${b.is_active?"badge-success":"badge-gray"}">${b.is_active?"نشط":"غير نشط"}</span>
                  </div>
                  <div style="font-size:13px;color:var(--gray-600);margin-bottom:10px;line-height:1.6;">
                    📍 ${esc(b.governorate)} ${b.city?"/ "+esc(b.city):""}
                    ${b.address?`<br/>${esc(b.address)}`:""}
                    ${b.phone?`<br/>📞 ${esc(b.phone)}`:""}
                  </div>
                  <div style="font-size:12px;color:var(--gray-500);margin-bottom:12px;">
                    ${b.manager_name?`👤 المدير: ${esc(b.manager_name)}`:`<span style="color:var(--gray-400);">لا يوجد مدير معين</span>`}
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="btn btn-secondary btn-sm" onclick="App.viewBranchMetrics('${esc(b.id)}','${esc(b.name)}')">📊 الأداء</button>
                    ${can("branches.edit")?`<button class="btn btn-secondary btn-sm" onclick="App.editBranch('${esc(b.id)}')">${icon("edit",13)} تعديل</button>`:""}
                    ${can("branches.delete")?`<button class="btn btn-secondary btn-sm" style="color:var(--danger);" onclick="App.deleteBranch('${esc(b.id)}')">حذف</button>`:""}
                  </div>
                </div>`).join("")}
            </div>`}
      </div>`;

  } else if (tab === "warehouses") {
    content = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("pkg")} المستودعات (${warehouses.length})</h3>
          ${can("warehouses.create")?`<button class="btn btn-primary btn-sm" onclick="App.addWarehouse()">${icon("plus",13)} إضافة مستودع</button>`:""}
        </div>
        ${!warehouses.length
          ? `<div class="empty"><div class="empty-icon">🏭</div><h3>لا توجد مستودعات</h3>
              ${can("warehouses.create")?`<button class="btn btn-primary" onclick="App.addWarehouse()">إضافة مستودع</button>`:""}
            </div>`
          : `<div class="table-wrap"><table>
              <thead><tr><th>المستودع</th><th>الفرع</th><th>المنطقة</th><th>المدير</th><th>السعة</th><th>إجراءات</th></tr></thead>
              <tbody>
                ${warehouses.map(w=>`<tr>
                  <td><div class="td-mono" style="font-size:11px;color:var(--gray-400);">${esc(w.code)}</div><b>${esc(w.name)}</b></td>
                  <td style="font-size:12px;">${w.branch_name?esc(w.branch_name):`<span style="color:var(--gray-400);">غير مرتبط</span>`}</td>
                  <td style="font-size:12px;">${esc(w.governorate)} ${w.city?"/"+esc(w.city):""}</td>
                  <td style="font-size:12px;">${w.manager_name?esc(w.manager_name):"—"}</td>
                  <td>
                    ${w.capacity
                      ? `<span class="badge ${(w.current_load/w.capacity)>0.8?"badge-danger":"badge-brand"}">${w.current_load||0}/${w.capacity}</span>`
                      : `<span style="color:var(--gray-400);font-size:12px;">غير محدد</span>`}
                  </td>
                  <td>
                    <div class="td-actions">
                      ${can("warehouses.edit")?`<button class="btn-icon" onclick="App.editWarehouse('${esc(w.id)}')">${icon("edit",13)}</button>`:""}
                      ${can("warehouses.delete")?`<button class="btn-icon" style="color:var(--danger);" onclick="App.deleteWarehouse('${esc(w.id)}')">${icon("trash",13)}</button>`:""}
                    </div>
                  </td>
                </tr>`).join("")}
              </tbody>
            </table></div>`}
      </div>`;
  }

  return `<div>${tabBar}${content}</div>`;
}

// ══════════════════════════════════════════════════════════════
// PHASE 2C — PRICING ENGINE VIEW
// ══════════════════════════════════════════════════════════════

function viewPricing() {
  const tab   = AppState.pricingTab || "rules";
  const zones = AppState.pricingZones;
  const rules = AppState.pricingRules;

  const TABS = [
    { id:"rules",     label:"قواعد الأسعار",  icon:"chart"  },
    { id:"zones",     label:"مناطق التوصيل",  icon:"map"    },
    { id:"simulator", label:"حاسبة الشحن",    icon:"search" },
  ];

  const tabBar = `
    <div style="display:flex;gap:0;overflow-x:auto;border-bottom:1px solid var(--gray-200);margin-bottom:20px;">
      ${TABS.map(t=>`
        <button onclick="App.setPricingTab('${t.id}')"
          style="padding:12px 18px;border:none;background:none;font-size:13px;font-weight:500;
            white-space:nowrap;cursor:pointer;
            border-bottom:2px solid ${tab===t.id?"var(--brand)":"transparent"};
            color:${tab===t.id?"var(--brand)":"var(--gray-500)"};">
          ${t.label}
        </button>`).join("")}
    </div>`;

  const SVC_LABELS  = { door_to_door:"توصيل للباب", drop_off:"إيداع", pickup:"استلام" };
  const ORD_LABELS  = { express:"سريع", standard:"عادي", scheduled:"مجدول" };

  let content = "";

  if (tab === "rules") {
    content = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("chart")} قواعد التسعير (${rules.length})</h3>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="App.loadPricingData()">${icon("refresh",13)} تحديث</button>
            ${can("pricing.manage")?`<button class="btn btn-primary btn-sm" onclick="App.addPricingRule()">${icon("plus",13)} إضافة قاعدة</button>`:""}
          </div>
        </div>
        ${!rules.length
          ? `<div class="empty"><div class="empty-icon">💰</div><h3>لا توجد قواعد تسعير</h3>
              <p>أضف قواعد الأسعار لكل منطقة وخدمة</p>
              ${can("pricing.manage")?`<button class="btn btn-primary" onclick="App.addPricingRule()">إضافة قاعدة</button>`:""}
            </div>`
          : `<div class="table-wrap"><table>
              <thead><tr>
                <th>المنطقة</th><th>الخدمة</th><th>نوع الطلب</th>
                <th>الوزن (كجم)</th><th>رسوم أساسية</th><th>لكل كجم</th>
                <th>رسوم الإرجاع</th><th>رسوم السرعة</th><th>الأولوية</th>
                <th>التاجر</th><th>إجراءات</th>
              </tr></thead>
              <tbody>
                ${rules.map(r=>`<tr>
                  <td>
                    ${r.pricing_zones
                      ? `<span class="badge badge-brand" style="font-size:11px;">${esc(r.pricing_zones.name)}</span>`
                      : `<span style="color:var(--gray-400);font-size:12px;">كل المناطق</span>`}
                  </td>
                  <td style="font-size:12px;">${r.service_type?SVC_LABELS[r.service_type]||r.service_type:`<span style="color:var(--gray-400);">الكل</span>`}</td>
                  <td style="font-size:12px;">${r.order_type?ORD_LABELS[r.order_type]||r.order_type:`<span style="color:var(--gray-400);">الكل</span>`}</td>
                  <td style="font-size:12px;">
                    ${r.weight_from||0} — ${r.weight_to?r.weight_to+"kg":"∞"}
                  </td>
                  <td style="font-weight:700;color:var(--brand);">${money(r.base_fee)}</td>
                  <td style="font-size:12px;">${r.per_kg_fee?money(r.per_kg_fee)+"/ كجم":"—"}</td>
                  <td style="font-size:12px;color:var(--danger);">${money(r.return_fee)}</td>
                  <td style="font-size:12px;">${r.express_surcharge?(r.express_surcharge*100).toFixed(0)+"%":"—"}</td>
                  <td><span class="badge ${r.priority>=10?"badge-brand":"badge-gray"}" style="font-size:11px;">${r.priority}</span></td>
                  <td style="font-size:12px;">${r.merchant_id
                    ? `<span class="badge badge-success" style="font-size:10px;">خاص</span>`
                    : `<span style="color:var(--gray-400);">عام</span>`}</td>
                  <td>
                    ${can("pricing.manage")?`
                      <div class="td-actions">
                        <button class="btn-icon" onclick="App.editPricingRule('${esc(r.id)}')">${icon("edit",13)}</button>
                        <button class="btn-icon" style="color:var(--danger);" onclick="App.deletePricingRule('${esc(r.id)}')">${icon("trash",13)}</button>
                      </div>`:"—"}
                  </td>
                </tr>`).join("")}
              </tbody>
            </table></div>`}
      </div>`;

  } else if (tab === "zones") {
    content = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("map")} مناطق التوصيل (${zones.length})</h3>
          ${can("pricing.manage_zones")?`<button class="btn btn-primary btn-sm" onclick="App.addPricingZone()">${icon("plus",13)} إضافة منطقة</button>`:""}
        </div>
        ${!zones.length
          ? `<div class="empty"><div class="empty-icon">🗺️</div><h3>لا توجد مناطق</h3></div>`
          : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;">
              ${zones.map(z=>`
                <div class="card" style="border:1px solid var(--gray-200);padding:16px;">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                    <div>
                      <div style="font-size:15px;font-weight:700;">${esc(z.name)}</div>
                      <div class="td-mono" style="font-size:11px;color:var(--gray-400);">${esc(z.code)}</div>
                    </div>
                    <span class="badge badge-brand">${(z.governorates||[]).length} محافظة</span>
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">
                    ${(z.governorates||[]).map(g=>`
                      <span style="background:var(--gray-100);padding:2px 8px;border-radius:99px;font-size:11px;">${esc(g)}</span>
                    `).join("")}
                  </div>
                  ${can("pricing.manage_zones")?`
                    <div style="display:flex;gap:6px;">
                      <button class="btn btn-secondary btn-sm" onclick="App.editPricingZone('${esc(z.id)}')">${icon("edit",13)} تعديل</button>
                    </div>`:""}
                </div>`).join("")}
            </div>`}
      </div>`;

  } else if (tab === "simulator") {
    const calc = AppState.lastFeeCalc;
    content = `
      <div class="grid-2col" style="gap:20px;">
        <div class="card">
          <h3 class="card-title" style="margin-bottom:16px;">${icon("search")} حاسبة رسوم الشحن</h3>
          <div class="field"><label>المحافظة</label>
            <select id="simGov">
              <option value="">اختر المحافظة</option>
              ${Object.keys(EGYPT_GOV).sort().map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join("")}
            </select>
          </div>
          <div class="form-row">
            <div class="field"><label>نوع الخدمة</label>
              <select id="simSvc">
                <option value="door_to_door">توصيل للباب</option>
                <option value="drop_off">إيداع في الفرع</option>
                <option value="pickup">استلام من الفرع</option>
              </select>
            </div>
            <div class="field"><label>نوع الطلب</label>
              <select id="simOrd">
                <option value="standard">عادي</option>
                <option value="express">سريع</option>
                <option value="scheduled">مجدول</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="field"><label>الوزن (كجم)</label>
              <input id="simWeight" type="number" step="0.1" min="0" value="1" placeholder="0.0"/>
            </div>
            <div class="field"><label>التاجر (اختياري)</label>
              <select id="simMerchant">
                <option value="">— سعر عام —</option>
                ${AppState.allMerchants.map(m=>`<option value="${esc(m.id)}">${esc(m.full_name)}</option>`).join("")}
              </select>
            </div>
          </div>
          <button class="btn btn-primary btn-full" onclick="App.simulateFee()" style="margin-top:8px;">
            ${icon("search",14)} احسب الرسوم
          </button>
        </div>

        <div class="card" style="${calc?"border-right:4px solid var(--brand)":""}">
          <h3 class="card-title" style="margin-bottom:16px;">💰 النتيجة</h3>
          ${!calc
            ? `<div class="empty" style="padding:40px 20px;">
                <div class="empty-icon">🧮</div>
                <h3 style="font-size:14px;">أدخل البيانات واضغط احسب</h3>
              </div>`
            : calc.delivery_fee == null
              ? `<div style="background:var(--warning-bg);border:1px solid var(--warning-border);border-radius:var(--radius);padding:16px;">
                  <div style="font-weight:700;color:var(--warning);margin-bottom:6px;">⚠️ لا توجد قاعدة تسعير</div>
                  <div style="font-size:13px;color:var(--gray-600);">لا يوجد سعر محدد لهذه المنطقة/الخدمة. يُستخدم السعر الافتراضي (60 ج.م).</div>
                </div>`
              : `<div style="display:flex;flex-direction:column;gap:12px;">
                  <div style="background:var(--brand-light);border-radius:var(--radius);padding:16px;text-align:center;">
                    <div style="font-size:12px;color:var(--gray-500);margin-bottom:4px;">رسوم الشحن</div>
                    <div style="font-size:32px;font-weight:800;color:var(--brand-dark);">${money(calc.delivery_fee)}</div>
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div style="background:var(--danger-bg);border-radius:var(--radius);padding:12px;text-align:center;">
                      <div style="font-size:11px;color:var(--gray-500);margin-bottom:2px;">رسوم الإرجاع</div>
                      <div style="font-size:18px;font-weight:700;color:var(--danger);">${money(calc.return_fee||0)}</div>
                    </div>
                    <div style="background:var(--gray-50);border-radius:var(--radius);padding:12px;text-align:center;">
                      <div style="font-size:11px;color:var(--gray-500);margin-bottom:2px;">المنطقة</div>
                      <div style="font-size:13px;font-weight:700;">${esc(calc.zone_name||"غير محددة")}</div>
                    </div>
                  </div>
                  <div style="font-size:11px;color:var(--gray-400);background:var(--gray-50);border-radius:var(--radius);padding:10px;">
                    <b>القاعدة المطبقة:</b> ${esc(calc.matched_on||"—")}
                  </div>
                </div>`}
        </div>
      </div>`;
  }

  return `<div>${tabBar}${content}</div>`;
}

// ══════════════════════════════════════════════════════════════
// PHASE 2B — FINANCIAL MANAGEMENT VIEW
// ══════════════════════════════════════════════════════════════

function viewFinance() {
  const tab = AppState.financeTab || "overview";
  const TABS = [
    { id:"overview",     label:"نظرة عامة",       icon:"chart"  },
    { id:"drivers",      label:"محافظ المناديب",   icon:"truck"  },
    { id:"cod",          label:"مطابقة COD",       icon:"wallet" },
    { id:"settlements",  label:"التسويات",         icon:"chart"  },
    { id:"invoices",     label:"الفواتير",         icon:"log"    },
    { id:"expenses",     label:"المصروفات",        icon:"refresh"},
  ];

  const tabBar = `
    <div style="display:flex;gap:0;overflow-x:auto;border-bottom:1px solid var(--gray-200);margin-bottom:20px;background:#fff;border-radius:var(--radius-lg) var(--radius-lg) 0 0;padding:0 4px;">
      ${TABS.map(t=>`
        <button onclick="App.setFinanceTab('${t.id}')"
          style="padding:12px 18px;border:none;background:none;font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer;
            border-bottom:2px solid ${tab===t.id?"var(--brand)":"transparent"};
            color:${tab===t.id?"var(--brand)":"var(--gray-500)"};">
          ${t.label}
        </button>`).join("")}
    </div>`;

  let content = "";

  if (tab === "overview") {
    const list       = AppState.shipments.filter(s=>!s.isDeleted);
    const delivered  = list.filter(s=>s.status==="delivered");
    const returned   = list.filter(s=>s.status==="returned");
    const todayStr   = new Date().toDateString();
    const today      = list.filter(s=>s.createdAt&&new Date(s.createdAt).toDateString()===todayStr);
    const todayDel   = delivered.filter(s=>s.deliveredAt&&new Date(s.deliveredAt).toDateString()===todayStr);
    const cod        = delivered.reduce((a,s)=>a+(s.amount||0),0);
    const fees       = delivered.reduce((a,s)=>a+(s.deliveryFee||0),0);
    const retFees    = returned.reduce((a,s)=>a+(s.returnFee||0),0);
    const revenue    = fees + retFees;
    const todayCod   = todayDel.reduce((a,s)=>a+(s.amount||0),0);
    const todayFees  = todayDel.reduce((a,s)=>a+(s.deliveryFee||0),0);

    // Build daily chart data (last 7 days)
    const days = [];
    for (let i=6;i>=0;i--) {
      const d=new Date(); d.setDate(d.getDate()-i);
      const ds=d.toDateString();
      const dd=delivered.filter(s=>s.deliveredAt&&new Date(s.deliveredAt).toDateString()===ds);
      days.push({
        label:d.toLocaleDateString("ar-EG",{weekday:"short",day:"numeric"}),
        cod:dd.reduce((a,s)=>a+(s.amount||0),0),
        fee:dd.reduce((a,s)=>a+(s.deliveryFee||0),0),
        count:dd.length
      });
    }
    const maxCod = Math.max(...days.map(d=>d.cod),1);

    content = `
      <div class="kpi-grid">
        ${kpi("إجمالي التحصيلات",money(cod),"wallet","var(--success)","var(--success-bg)")}
        ${kpi("إجمالي الرسوم",money(revenue),"chart","var(--brand)","var(--brand-light)")}
        ${kpi("رسوم الإرجاع",money(retFees),"refresh","var(--danger)","var(--danger-bg)")}
        ${kpi("تحصيلات اليوم",money(todayCod),"wallet","var(--info)","var(--info-bg)")}
        ${kpi("رسوم اليوم",money(todayFees),"chart","var(--purple)","var(--purple-bg)")}
        ${kpi("شحنات اليوم",today.length,"box","var(--warning)","var(--warning-bg)")}
      </div>
      <div class="card" style="margin-bottom:16px;">
        <h3 class="card-title" style="margin-bottom:16px;">${icon("chart")} التحصيلات - آخر 7 أيام</h3>
        <div style="display:flex;gap:6px;align-items:flex-end;height:140px;padding:0 8px;">
          ${days.map(d=>`
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
              <div style="font-size:10px;color:var(--gray-500);font-weight:600;">${d.count}</div>
              <div style="width:100%;background:var(--brand);border-radius:3px 3px 0 0;min-height:4px;
                height:${Math.max((d.cod/maxCod)*110,4)}px;transition:height .3s;"
                title="${money(d.cod)}"></div>
              <div style="font-size:10px;color:var(--gray-400);text-align:center;">${d.label}</div>
            </div>`).join("")}
        </div>
      </div>
      <div class="grid-2col">
        <div class="card">
          <h3 class="card-title" style="margin-bottom:14px;">💰 ملخص مالي</h3>
          ${[
            ["إجمالي COD المحصل",   money(cod),     "var(--success)"],
            ["رسوم الشحن المستحقة", money(fees),    "var(--brand)"],
            ["رسوم الإرجاع",        money(retFees), "var(--danger)"],
            ["صافي الإيرادات",      money(revenue), "var(--info)"],
          ].map(([l,v,c])=>`
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--gray-100);">
              <span style="font-size:13px;color:var(--gray-600);">${l}</span>
              <span style="font-weight:700;color:${c};">${v}</span>
            </div>`).join("")}
        </div>
        <div class="card">
          <h3 class="card-title" style="margin-bottom:14px;">📊 معدلات الأداء</h3>
          ${[
            ["معدل التسليم",  Math.round(delivered.length/(list.length||1)*100)+"%", "var(--success)"],
            ["معدل الإرجاع",  Math.round(returned.length/(list.length||1)*100)+"%",  "var(--danger)"],
            ["إجمالي الشحنات",list.length,   "var(--brand)"],
            ["تم التسليم",    delivered.length,"var(--success)"],
            ["مرتجع",         returned.length, "var(--danger)"],
          ].map(([l,v,c])=>`
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--gray-100);">
              <span style="font-size:13px;color:var(--gray-600);">${l}</span>
              <span style="font-weight:700;color:${c};">${v}</span>
            </div>`).join("")}
        </div>
      </div>`;

  } else if (tab === "drivers") {
    const couriers = AppState.users.filter(u=>(u.role||u.primary_role)==="courier");
    content = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("truck")} محافظ المناديب</h3>
          <button class="btn btn-primary btn-sm" onclick="App.addDriverTransaction()">
            ${icon("plus",13)} إضافة حركة
          </button>
        </div>
        ${!couriers.length?`<div class="empty"><div class="empty-icon">🚚</div><h3>لا يوجد مناديب</h3></div>`
          :`<div class="table-wrap"><table>
            <thead><tr><th>المندوب</th><th>الهاتف</th><th>الحالة</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${couriers.map(c=>`<tr>
                <td><div style="display:flex;align-items:center;gap:8px;">
                  <div style="width:28px;height:28px;border-radius:50%;background:var(--brand-light);color:var(--brand-dark);
                    display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${initials(c.name)}</div>
                  <b>${esc(c.name)}</b></div></td>
                <td style="font-size:12px;">${esc(c.phone||"—")}</td>
                <td><span class="badge ${c.suspended?"badge-danger":"badge-success"}">${c.suspended?"موقوف":"نشط"}</span></td>
                <td>
                  <button class="btn btn-primary btn-sm" onclick="App.viewDriverWallet('${esc(c.id)}','${esc(c.name)}')">
                    ${icon("wallet",13)} المحفظة
                  </button>
                </td>
              </tr>`).join("")}
            </tbody>
          </table></div>`}
      </div>`;

  } else if (tab === "cod") {
    content = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("wallet")} مطابقة COD اليومية</h3>
          <button class="btn btn-primary btn-sm" onclick="App.newCodReconciliation()">
            ${icon("plus",13)} مطابقة جديدة
          </button>
        </div>
        <div id="codReconContent">
          <div class="page-loader"><span class="spinner"></span> جاري التحميل...</div>
        </div>
      </div>`;

  } else if (tab === "settlements") {
    content = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("chart")} كل طلبات التسوية</h3>
          <div style="display:flex;gap:8px;">
            ${["all","pending","approved","paid","rejected"].map(s=>`
              <button class="filter-btn ${!AppState.settleFilter&&s==="all"||AppState.settleFilter===s?"active":""}"
                onclick="App.setSettleFilter('${s==="all"?"":s}')">
                ${s==="all"?"الكل":s==="pending"?"بانتظار":s==="approved"?"موافق":s==="paid"?"مدفوع":"مرفوض"}
              </button>`).join("")}
          </div>
        </div>
        <div id="settleContent">
          <div class="page-loader"><span class="spinner"></span> جاري التحميل...</div>
        </div>
      </div>`;

  } else if (tab === "invoices") {
    content = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("log")} الفواتير</h3>
          <button class="btn btn-primary btn-sm" onclick="App.generateInvoice()">
            ${icon("plus",13)} إنشاء فاتورة
          </button>
        </div>
        <div id="invoiceContent">
          <div class="page-loader"><span class="spinner"></span> جاري التحميل...</div>
        </div>
      </div>`;

  } else if (tab === "expenses") {
    content = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("refresh")} المصروفات التشغيلية</h3>
          <button class="btn btn-primary btn-sm" onclick="App.addExpense()">
            ${icon("plus",13)} إضافة مصروف
          </button>
        </div>
        <div class="filter-bar" style="margin-bottom:14px;">
          ${["","driver","branch","office","fuel","maintenance","other"].map(c=>`
            <button class="filter-btn ${AppState.expenseCategory===c?"active":""}"
              onclick="App.setExpenseCategory('${c}')">
              ${c===""?"الكل":c==="driver"?"مندوب":c==="branch"?"فرع":c==="office"?"مكتب":c==="fuel"?"وقود":c==="maintenance"?"صيانة":"أخرى"}
            </button>`).join("")}
        </div>
        <div id="expenseContent">
          <div class="page-loader"><span class="spinner"></span> جاري التحميل...</div>
        </div>
      </div>`;
  }

  return `<div>${tabBar}${content}</div>`;
}

// ══════════════════════════════════════════════════════════════
// ADMIN MERCHANT MANAGEMENT VIEW
// ══════════════════════════════════════════════════════════════

function viewAdminMerchants() {
  const merchants  = AppState.allMerchants;
  const selId      = AppState.selectedMerchantId;
  const selMerch   = merchants.find(m=>m.id===selId);
  const tab        = AppState.adminMerchantTab;

  const merchantList = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <h3 class="card-title">${icon("users")} التجار (${merchants.length})</h3>
        <div class="search-wrap" style="width:200px;">
          ${icon("search",14)}
          <input id="merchantSearchInput" placeholder="بحث..."
            value="${esc(AppState.userFilter)}"
            oninput="App.filterMerchants(this.value)"/>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>التاجر</th><th>البريد</th><th>الهاتف</th><th>تاريخ الانضمام</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            ${!merchants.length
              ? `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400);">لا يوجد تجار</td></tr>`
              : merchants.filter(m=>{
                  const f=(AppState.userFilter||"").toLowerCase();
                  return !f || (m.full_name+m.email+m.phone).toLowerCase().includes(f);
                }).map(m=>`
                <tr style="${m.id===selId?"background:var(--brand-light);":""}">
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <div style="width:28px;height:28px;border-radius:50%;background:var(--brand-light);color:var(--brand-dark);
                        display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">
                        ${initials(m.full_name)}
                      </div>
                      <b>${esc(m.full_name)}</b>
                    </div>
                  </td>
                  <td style="font-size:12px;">${esc(m.email||"—")}</td>
                  <td style="font-size:12px;">${esc(m.phone||"—")}</td>
                  <td style="font-size:11px;color:var(--gray-400);">${fmtDate(m.created_at)}</td>
                  <td><span class="badge ${m.is_suspended?"badge-danger":"badge-success"}">${m.is_suspended?"موقوف":"نشط"}</span></td>
                  <td>
                    <button class="btn btn-primary btn-sm" onclick="App.selectMerchant('${esc(m.id)}')">
                      ${m.id===selId?"✓ محدد":"عرض"}
                    </button>
                  </td>
                </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;

  if (!selId || !selMerch) {
    return merchantList + `
      <div class="empty" style="padding:60px;">
        <div class="empty-icon">🏢</div>
        <h3>اختر تاجراً لعرض بياناته</h3>
        <p>اضغط على "عرض" بجانب أي تاجر لعرض عناوينه وعملاؤه ومنتجاته وطلباته</p>
      </div>`;
  }

  // Merchant detail tabs
  const TABS = [
    { id:"shipments",  label:"الشحنات",       icon:"box"    },
    { id:"addresses",  label:"العناوين",       icon:"map"    },
    { id:"recipients", label:"العملاء",        icon:"users"  },
    { id:"products",   label:"المنتجات",       icon:"pkg"    },
    { id:"pickup",     label:"طلبات الاستلام", icon:"truck"  },
    { id:"ledger",     label:"الحساب",         icon:"wallet" },
    { id:"settlements",label:"التسويات",       icon:"chart"  },
  ];

  const tabBar = `
    <div style="display:flex;gap:0;overflow-x:auto;border-bottom:1px solid var(--gray-200);margin-bottom:16px;">
      ${TABS.map(t=>`
        <button onclick="App.setAdminMerchantTab('${t.id}')"
          style="padding:10px 16px;border:none;background:none;font-size:13px;font-weight:500;white-space:nowrap;
            border-bottom:2px solid ${tab===t.id?"var(--brand)":"transparent"};
            color:${tab===t.id?"var(--brand)":"var(--gray-500)"};cursor:pointer;">
          ${t.label}
        </button>`).join("")}
    </div>`;

  const merchantHeader = `
    <div class="card" style="margin-bottom:16px;border-right:4px solid var(--brand);">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:48px;height:48px;border-radius:50%;background:var(--brand-light);color:var(--brand-dark);
            display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;">
            ${initials(selMerch.full_name)}
          </div>
          <div>
            <div style="font-size:18px;font-weight:800;">${esc(selMerch.full_name)}</div>
            <div style="font-size:13px;color:var(--gray-500);">${esc(selMerch.email||"")} ${selMerch.phone?"· "+esc(selMerch.phone):""}</div>
            <div style="margin-top:4px;">
              <span class="badge ${selMerch.is_suspended?"badge-danger":"badge-success"}">${selMerch.is_suspended?"موقوف":"نشط"}</span>
              <span style="font-size:11px;color:var(--gray-400);margin-right:8px;">انضم ${fmtDate(selMerch.created_at)}</span>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="App.toggleUser('${esc(selMerch.id)}')">
            ${selMerch.is_suspended?"✅ تفعيل":"🚫 إيقاف"}
          </button>
          <button class="btn btn-secondary btn-sm" onclick="App.editUser('${esc(selMerch.id)}')">${icon("edit",13)} تعديل</button>
        </div>
      </div>
    </div>`;

  // Tab content
  let tabContent = "";
  const d = AppState._adminMerchantData || {};

  if (tab === "shipments") {
    const merchantShipments = AppState.shipments.filter(s=>s.merchantId===selId);
    tabContent = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("box")} شحنات ${esc(selMerch.full_name)} (${merchantShipments.length})</h3>
          ${can("export_excel")?`<button class="btn btn-secondary btn-sm" onclick="App.exportMerchantShipments('${esc(selId)}')">${icon("chart",13)} Excel</button>`:""}
        </div>
        ${shipTable(merchantShipments.slice(0,50))}
      </div>`;

  } else if (tab === "addresses") {
    const addrs = d.addresses||[];
    tabContent = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("map")} عناوين التاجر (${addrs.length})</h3>
        </div>
        ${!addrs.length?`<div class="empty"><div class="empty-icon">📍</div><h3>لا توجد عناوين</h3></div>`
          :`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
            ${addrs.map(a=>`
              <div class="card" style="border:1px solid var(--gray-200);padding:14px;">
                ${a.is_default?`<span class="badge badge-brand" style="font-size:10px;">افتراضي</span><br/>`:""}
                <div style="font-weight:700;margin-bottom:4px;">${esc(a.label)}</div>
                <div><span class="badge ${a.type==="pickup"?"badge-success":a.type==="warehouse"?"badge-warning":"badge-info"}" style="font-size:10px;">
                  ${a.type==="pickup"?"📦 استلام":a.type==="warehouse"?"🏭 مستودع":a.type==="branch"?"🏪 فرع":"📍 أخرى"}
                </span></div>
                <div style="font-size:12px;color:var(--gray-600);margin-top:6px;line-height:1.6;">
                  ${esc(a.governorate)} / ${esc(a.city)}
                  ${a.street?`<br/>${esc(a.street)}`:""}
                  ${a.contact_name?`<br/>📞 ${esc(a.contact_name)}`:""}
                </div>
                <div style="display:flex;gap:6px;margin-top:10px;">
                  <button class="btn btn-secondary btn-sm" style="color:var(--danger);"
                    onclick="App.adminDeleteAddress('${esc(a.id)}','${esc(selId)}')">حذف</button>
                </div>
              </div>`).join("")}
          </div>`}
      </div>`;

  } else if (tab === "recipients") {
    const recs = d.recipients||[];
    tabContent = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("users")} عملاء التاجر (${recs.length})</h3>
        </div>
        ${!recs.length?`<div class="empty"><div class="empty-icon">👥</div><h3>لا يوجد عملاء</h3></div>`
          :`<div class="table-wrap"><table>
            <thead><tr><th>الاسم</th><th>الهاتف</th><th>المنطقة</th><th>الشحنات</th><th>آخر طلب</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${recs.map(r=>`<tr>
                <td class="td-primary">${esc(r.name)}</td>
                <td class="td-phone"><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></td>
                <td style="font-size:12px;">${esc(r.governorate)} ${r.city?"/"+esc(r.city):""}</td>
                <td><span class="badge badge-brand">${r.order_count||0}</span></td>
                <td style="font-size:11px;color:var(--gray-400);">${r.last_order_at?fmtDate(r.last_order_at):"—"}</td>
                <td>
                  <button class="btn-icon" style="color:var(--danger);" onclick="App.adminDeleteRecipient('${esc(r.id)}','${esc(selId)}')">${icon("trash",13)}</button>
                </td>
              </tr>`).join("")}
            </tbody>
          </table></div>`}
      </div>`;

  } else if (tab === "products") {
    const prods = d.products||[];
    tabContent = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("box")} منتجات التاجر (${prods.length})</h3>
        </div>
        ${!prods.length?`<div class="empty"><div class="empty-icon">🛍️</div><h3>لا توجد منتجات</h3></div>`
          :`<div class="table-wrap"><table>
            <thead><tr><th>المنتج</th><th>SKU</th><th>الباركود</th><th>السعر</th><th>الوزن</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${prods.map(p=>`<tr>
                <td><div style="display:flex;align-items:center;gap:8px;">
                  ${p.image_url?`<img src="${esc(p.image_url)}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;"/>`
                    :`<div style="width:32px;height:32px;background:var(--gray-100);border-radius:4px;display:flex;align-items:center;justify-content:center;">🛍️</div>`}
                  <b>${esc(p.name)}</b></div></td>
                <td class="td-mono" style="font-size:11px;">${p.sku?esc(p.sku):"—"}</td>
                <td class="td-mono" style="font-size:11px;">${p.barcode?esc(p.barcode):"—"}</td>
                <td style="font-weight:600;">${p.price?money(p.price):"—"}</td>
                <td style="font-size:12px;">${p.weight?p.weight+"كجم":"—"}</td>
                <td>
                  <button class="btn-icon" style="color:var(--danger);" onclick="App.adminDeleteProduct('${esc(p.id)}','${esc(selId)}')">${icon("trash",13)}</button>
                </td>
              </tr>`).join("")}
            </tbody>
          </table></div>`}
      </div>`;

  } else if (tab === "pickup") {
    const reqs = d.pickupRequests||[];
    const STATUS_PICKUP = {
      pending:   {label:"بانتظار التعيين",badge:"badge-warning"},
      assigned:  {label:"تم التعيين",    badge:"badge-brand"},
      picked_up: {label:"تم الاستلام",   badge:"badge-success"},
      cancelled: {label:"ملغي",          badge:"badge-gray"},
    };
    tabContent = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("truck")} طلبات الاستلام (${reqs.length})</h3>
        </div>
        ${!reqs.length?`<div class="empty"><div class="empty-icon">🚚</div><h3>لا توجد طلبات</h3></div>`
          :`<div class="table-wrap"><table>
            <thead><tr><th>#</th><th>الحالة</th><th>الشحنات</th><th>الموعد</th><th>المندوب</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${reqs.map(r=>`<tr>
                <td class="td-mono" style="font-size:11px;">${r.id.slice(-6)}</td>
                <td><span class="badge ${STATUS_PICKUP[r.status]?.badge||"badge-gray"}">${STATUS_PICKUP[r.status]?.label||r.status}</span></td>
                <td style="font-weight:600;">${r.shipment_count}</td>
                <td style="font-size:12px;">${r.scheduled_at?fmtDate(r.scheduled_at):"أسرع وقت"}</td>
                <td style="font-size:12px;">${r.courier_name?esc(r.courier_name):"—"}</td>
                <td>
                  ${r.status==="pending"?`
                    <div style="display:flex;gap:6px;">
                      <select id="courier_${esc(r.id)}" style="padding:5px 8px;border-radius:var(--radius);border:1.5px solid var(--gray-300);font-size:12px;">
                        <option value="">اختر مندوب</option>
                        ${AppState.couriers.map(c=>`<option value="${esc(c.id)}" data-name="${esc(c.full_name)}">${esc(c.full_name)}</option>`).join("")}
                      </select>
                      <button class="btn btn-primary btn-sm" onclick="App.adminAssignPickup('${esc(r.id)}','${esc(selId)}')">تعيين</button>
                      <button class="btn btn-secondary btn-sm" style="color:var(--danger);"
                        onclick="App.adminCancelPickup('${esc(r.id)}','${esc(selId)}')">إلغاء</button>
                    </div>`
                  :r.status==="assigned"?`<button class="btn btn-primary btn-sm" onclick="App.adminMarkPickedUp('${esc(r.id)}','${esc(selId)}')">✅ تم الاستلام</button>`
                  :"—"}
                </td>
              </tr>`).join("")}
            </tbody>
          </table></div>`}
      </div>`;

  } else if (tab === "ledger") {
    const entries = d.ledger||[];
    const TYPE_LABELS = {
      cod_collected:"تحصيل COD", delivery_fee:"رسوم شحن",
      return_fee:"رسوم إرجاع",  settlement:"تسوية",
      adjustment:"تعديل",       refund:"استرداد",
    };
    tabContent = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("wallet")} سجل الحساب (${entries.length} حركة)</h3>
          <button class="btn btn-primary btn-sm" onclick="App.adminAddLedgerEntry('${esc(selId)}')">+ إضافة حركة</button>
        </div>
        ${!entries.length?`<div class="empty"><div class="empty-icon">📒</div><h3>لا توجد حركات</h3></div>`
          :`<div class="table-wrap"><table>
            <thead><tr><th>التاريخ</th><th>النوع</th><th>الشحنة</th><th>المبلغ</th><th>الرصيد بعدها</th><th>الوصف</th></tr></thead>
            <tbody>
              ${entries.map(e=>`<tr>
                <td style="font-size:11px;color:var(--gray-400);white-space:nowrap;">${fmtTime(e.created_at)}</td>
                <td><span class="badge ${e.amount>0?"badge-success":"badge-danger"}">${TYPE_LABELS[e.type]||e.type}</span></td>
                <td class="td-mono" style="font-size:11px;">${e.shipment_code||"—"}</td>
                <td style="font-weight:700;color:${e.amount>0?"var(--success)":"var(--danger)"};">${e.amount>0?"+":""}${money(e.amount)}</td>
                <td style="font-weight:600;">${money(e.balance_after)}</td>
                <td style="font-size:12px;color:var(--gray-500);">${esc(e.description||"—")}</td>
              </tr>`).join("")}
            </tbody>
          </table></div>`}
      </div>`;

  } else if (tab === "settlements") {
    const setts = d.settlements||[];
    const SETT_STATUS = {
      pending:  {label:"بانتظار الموافقة",badge:"badge-warning"},
      approved: {label:"موافق عليه",      badge:"badge-brand"},
      paid:     {label:"تم الصرف",        badge:"badge-success"},
      rejected: {label:"مرفوض",           badge:"badge-danger"},
    };
    tabContent = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${icon("chart")} طلبات التسوية (${setts.length})</h3>
        </div>
        ${!setts.length?`<div class="empty"><div class="empty-icon">💰</div><h3>لا توجد طلبات تسوية</h3></div>`
          :`<div class="table-wrap"><table>
            <thead><tr><th>التاريخ</th><th>المبلغ</th><th>الحالة</th><th>طريقة الدفع</th><th>المرجع</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${setts.map(s=>`<tr>
                <td style="font-size:11px;color:var(--gray-400);">${fmtDate(s.created_at)}</td>
                <td style="font-weight:700;font-size:15px;">${money(s.amount)}</td>
                <td><span class="badge ${SETT_STATUS[s.status]?.badge||"badge-gray"}">${SETT_STATUS[s.status]?.label||s.status}</span></td>
                <td style="font-size:12px;">${esc(s.payment_method||"—")}</td>
                <td class="td-mono" style="font-size:11px;">${esc(s.payment_ref||"—")}</td>
                <td>
                  ${s.status==="pending"?`
                    <div style="display:flex;gap:6px;">
                      <button class="btn btn-primary btn-sm" onclick="App.approveSettlement('${esc(s.id)}','${esc(selId)}')">✅ موافقة</button>
                      <button class="btn btn-secondary btn-sm" style="color:var(--danger);"
                        onclick="App.rejectSettlement('${esc(s.id)}','${esc(selId)}')">رفض</button>
                    </div>`
                  :s.status==="approved"?`<button class="btn btn-primary btn-sm" onclick="App.markSettlementPaid('${esc(s.id)}','${esc(selId)}')">💰 تم الصرف</button>`
                  :"—"}
                </td>
              </tr>`).join("")}
            </tbody>
          </table></div>`}
      </div>`;
  }

  return merchantList + merchantHeader + tabBar + tabContent;
}

// ══════════════════════════════════════════════════════════════
// PHASE 2A VIEW FUNCTIONS
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// BULK IMPORT — 6-STEP WIZARD + VALIDATION ENGINE
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// PHASE 4 — LIVE OPERATIONS DASHBOARD
// ══════════════════════════════════════════════════════════════
function viewLiveOps() {
  const ships   = AppState.shipments;
  const couriers= AppState.users.filter(u=>(u.role||u.primary_role)==="courier"&&!u.is_suspended&&!u.suspended);
  const feed    = AppState.liveActivityFeed;

  // Live shipment counts by status
  const outForDelivery = ships.filter(s=>s.status==="out_for_delivery");
  const atWarehouse    = ships.filter(s=>s.status==="at_warehouse");
  const atBranch       = ships.filter(s=>s.status==="at_branch");
  const inTransit      = ships.filter(s=>s.status==="in_transit");
  const pickedUp       = ships.filter(s=>s.status==="picked_up");
  const pickupPending  = ships.filter(s=>s.status==="pickup_requested");
  const suspended      = ships.filter(s=>s.status==="suspended");
  const rescheduled    = ships.filter(s=>s.status==="rescheduled");

  // Today's stats
  const todayStr   = new Date().toDateString();
  const todayShips = ships.filter(s=>s.createdAt&&new Date(s.createdAt).toDateString()===todayStr);
  const todayDel   = ships.filter(s=>s.status==="delivered"&&s.deliveredAt&&new Date(s.deliveredAt).toDateString()===todayStr);
  const todayRet   = ships.filter(s=>s.status==="returned"&&new Date(s.createdAt||0).toDateString()===todayStr);

  // Couriers currently active (have shipments out_for_delivery)
  const activeCourierIds = new Set(outForDelivery.map(s=>s.courierId).filter(Boolean));
  const activeCouriers   = couriers.filter(c=>activeCourierIds.has(c.id));
  const idleCouriers     = couriers.filter(c=>!activeCourierIds.has(c.id));

  return `<div>
    <!-- Connection status banner -->
    <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:var(--radius);
      background:${AppState.rtConnected?"var(--success-bg)":"var(--warning-bg)"};
      border:1px solid ${AppState.rtConnected?"var(--success-border,#bbf7d0)":"var(--warning-border)"};
      margin-bottom:20px;font-size:13px;">
      <span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;
        background:${AppState.rtConnected?"var(--success)":"var(--warning)"};
        box-shadow:0 0 0 3px ${AppState.rtConnected?"rgba(34,197,94,.2)":"rgba(234,179,8,.2)"};"></span>
      <span style="font-weight:600;">${AppState.rtConnected?"🟢 متصل — التحديثات الفورية نشطة":"🟡 جاري الاتصال..."}</span>
      <span style="color:var(--gray-500);margin-right:auto;">${AppState.rtEventCount} حدث منذ آخر تحديث</span>
      <button class="btn btn-secondary btn-sm" onclick="App.resetRtCounter()">إعادة ضبط العداد</button>
    </div>

    <!-- Today KPIs -->
    <div class="kpi-grid" style="margin-bottom:20px;">
      ${kpi("شحنات اليوم",todayShips.length,"box","var(--brand)","var(--brand-light)")}
      ${kpi("تسليمات اليوم",todayDel.length,"chart","var(--success)","var(--success-bg)")}
      ${kpi("مرتجعات اليوم",todayRet.length,"refresh","var(--danger)","var(--danger-bg)")}
      ${kpi("خارج للتسليم الآن",outForDelivery.length,"truck","var(--purple,#7c3aed)","var(--purple-bg,#ede9fe)")}
      ${kpi("مناديب نشطون",activeCouriers.length,"users","var(--success)","var(--success-bg)")}
      ${kpi("تحتاج مراجعة",suspended.length+rescheduled.length,"log","var(--warning)","var(--warning-bg)")}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 340px;gap:16px;">

      <!-- Live pipeline -->
      <div class="card">
        <h3 class="card-title" style="margin-bottom:14px;">${icon("truck")} خط سير الشحنات (الآن)</h3>
        ${[
          ["طلب استلام",pickupPending.length,"badge-warning","pickup_requested"],
          ["تم الاستلام",pickedUp.length,"badge-brand","picked_up"],
          ["في التنقل",inTransit.length,"badge-brand","in_transit"],
          ["في المستودع",atWarehouse.length,"badge-brand","at_warehouse"],
          ["في الفرع",atBranch.length,"badge-brand","at_branch"],
          ["خارج للتسليم",outForDelivery.length,"badge-success","out_for_delivery"],
          ["موقوف",suspended.length,"badge-danger","suspended"],
          ["إعادة جدولة",rescheduled.length,"badge-warning","rescheduled"],
        ].map(([label,count,badge,status])=>`
          <div style="display:flex;align-items:center;justify-content:space-between;
            padding:9px 12px;border-radius:var(--radius);margin-bottom:6px;cursor:pointer;
            background:${count>0?"var(--gray-50)":"transparent"};
            border:1px solid ${count>0?"var(--gray-200)":"transparent"};"
            onclick="App.setFilter('${status}');AppState.view='shipments';rerenderContent();">
            <span style="font-size:13px;">${label}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              ${count>0?`<div style="background:var(--gray-200);border-radius:99px;height:5px;width:80px;overflow:hidden;">
                <div style="background:var(--brand);height:100%;border-radius:99px;
                  width:${Math.min(Math.round(count/(ships.length||1)*100*3),100)}%;"></div>
              </div>`:""}
              <span class="badge ${count>0?badge:"badge-gray"}">${count}</span>
            </div>
          </div>`).join("")}
      </div>

      <!-- Courier status board -->
      <div class="card">
        <h3 class="card-title" style="margin-bottom:14px;">${icon("users")} لوحة المناديب</h3>
        ${!couriers.length?`<div class="empty"><div class="empty-icon">🚚</div><h3>لا يوجد مناديب</h3></div>`:`
          <div style="margin-bottom:10px;">
            <div style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;margin-bottom:6px;">
              نشط (${activeCouriers.length})
            </div>
            ${activeCouriers.length?activeCouriers.map(c=>{
              const myShips = outForDelivery.filter(s=>s.courierId===c.id);
              return `<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:var(--radius);
                background:var(--success-bg);border:1px solid var(--success-border,#bbf7d0);margin-bottom:6px;">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--success);color:#fff;
                  display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">
                  ${initials(c.name)}</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(c.name)}</div>
                  <div style="font-size:11px;color:var(--gray-500);">${myShips.length} شحنة نشطة</div>
                </div>
                <span class="badge badge-success">${myShips.length}</span>
              </div>`;
            }).join(""):`<div style="font-size:12px;color:var(--gray-400);padding:8px;">لا يوجد مناديب نشطون الآن</div>`}
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;margin-bottom:6px;">
              متاح (${idleCouriers.length})
            </div>
            ${idleCouriers.slice(0,5).map(c=>`
              <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:var(--radius);
                background:var(--gray-50);border:1px solid var(--gray-200);margin-bottom:6px;">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--gray-300);color:#fff;
                  display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">
                  ${initials(c.name)}</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:13px;">${esc(c.name)}</div>
                  <div style="font-size:11px;color:var(--gray-400);">متاح للتعيين</div>
                </div>
                <span class="badge badge-gray">متاح</span>
              </div>`).join("")}
            ${idleCouriers.length>5?`<div style="font-size:12px;color:var(--gray-400);text-align:center;padding:4px;">+ ${idleCouriers.length-5} آخرين</div>`:""}
          </div>`}
      </div>

      <!-- Live activity feed -->
      <div class="card">
        <div class="card-header" style="margin-bottom:12px;">
          <h3 class="card-title">${icon("log")} النشاط المباشر</h3>
          <button class="btn-icon" onclick="App.clearActivityFeed()" title="مسح السجل"
            style="font-size:12px;color:var(--gray-400);">✕</button>
        </div>
        <div style="max-height:420px;overflow-y:auto;">
          ${!feed.length?`
            <div style="text-align:center;padding:32px 16px;color:var(--gray-400);">
              <div style="font-size:24px;margin-bottom:8px;">📡</div>
              <div style="font-size:13px;">في انتظار الأحداث المباشرة...</div>
              <div style="font-size:11px;margin-top:4px;">ستظهر الشحنات والتغييرات هنا تلقائياً</div>
            </div>`
          : feed.map(f=>`
            <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-100);">
              <span style="font-size:16px;flex-shrink:0;">${f.icon}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;line-height:1.4;">${esc(f.text)}</div>
                <div style="font-size:10px;color:var(--gray-400);margin-top:2px;">${fmtTime(f.time)}</div>
              </div>
              <span class="badge ${f.badge||"badge-gray"}" style="font-size:10px;flex-shrink:0;align-self:flex-start;"></span>
            </div>`).join("")}
        </div>
      </div>
    </div>

    <!-- Needs attention section -->
    ${(suspended.length+rescheduled.length)>0?`
    <div class="card" style="margin-top:16px;border-right:4px solid var(--warning);">
      <h3 class="card-title" style="margin-bottom:14px;">⚠️ تحتاج مراجعة</h3>
      <div class="table-wrap">
        ${shipTable([...suspended,...rescheduled].slice(0,10))}
      </div>
    </div>`:""}
  </div>`;
}

const IMPORT_REQUIRED      = ["customer_name","customer_phone","governorate","amount"];
const IMPORT_SERVICE_TYPES = ["door_to_door","drop_off","pickup"];
const IMPORT_ORDER_TYPES   = ["express","standard","scheduled"];

function validateImportRow(r, rowNum, gov) {
  const errors = [];
  IMPORT_REQUIRED.forEach(f => {
    if (!r[f] || String(r[f]).trim()==="") errors.push({field:f, message:"حقل مطلوب"});
  });
  if (r.customer_phone && !/^01[0-9]{9}$/.test(String(r.customer_phone).replace(/\s/g,"")))
    errors.push({field:"customer_phone", message:"رقم هاتف غير صحيح (11 رقم يبدأ بـ 01)"});
  if (r.customer_phone2 && r.customer_phone2.trim() && !/^01[0-9]{9}$/.test(String(r.customer_phone2).replace(/\s/g,"")))
    errors.push({field:"customer_phone2", message:"هاتف ثاني غير صحيح"});
  if (r.governorate && gov && !gov[r.governorate])
    errors.push({field:"governorate", message:"محافظة غير معروفة: "+r.governorate});
  if (r.city && r.governorate && gov && gov[r.governorate] && !gov[r.governorate].includes(r.city))
    errors.push({field:"city", message:"مدينة غير معروفة في "+r.governorate});
  if (r.amount!==undefined && r.amount!=="") {
    const a=Number(r.amount); if(isNaN(a)||a<0) errors.push({field:"amount", message:"مبلغ COD غير صحيح"});
  }
  if (r.delivery_fee!==undefined && r.delivery_fee!=="") {
    const f=Number(r.delivery_fee); if(isNaN(f)||f<0) errors.push({field:"delivery_fee", message:"رسوم شحن غير صحيحة"});
  }
  if (r.weight!==undefined && r.weight!=="") {
    const w=Number(r.weight); if(isNaN(w)||w<0||w>999) errors.push({field:"weight", message:"وزن غير صحيح (0-999)"});
  }
  if (r.service_type && !IMPORT_SERVICE_TYPES.includes(r.service_type))
    errors.push({field:"service_type", message:"نوع خدمة غير صحيح: "+IMPORT_SERVICE_TYPES.join("/")});
  if (r.order_type && !IMPORT_ORDER_TYPES.includes(r.order_type))
    errors.push({field:"order_type", message:"نوع طلب غير صحيح: "+IMPORT_ORDER_TYPES.join("/")});
  return errors;
}

const COL_MAP = {
  "اسم العميل":"customer_name","اسم العميل*":"customer_name","customer_name":"customer_name",
  "هاتف العميل":"customer_phone","هاتف العميل*":"customer_phone","customer_phone":"customer_phone",
  "هاتف ثاني":"customer_phone2","customer_phone2":"customer_phone2",
  "المحافظة":"governorate","المحافظة*":"governorate","governorate":"governorate",
  "المدينة":"city","city":"city","الشارع":"street","street":"street",
  "المبنى":"building","building":"building",
  "مبلغ COD":"amount","مبلغ COD*":"amount","amount":"amount",
  "رسوم الشحن":"delivery_fee","delivery_fee":"delivery_fee",
  "رسوم الإرجاع":"return_fee","return_fee":"return_fee",
  "نوع الخدمة":"service_type","service_type":"service_type",
  "نوع الطلب":"order_type","order_type":"order_type",
  "الوزن (كجم)":"weight","weight":"weight","باركود":"barcode","barcode":"barcode",
  "ملاحظات":"notes","notes":"notes",
};

function normalizeImportRow(raw) {
  const out = {};
  Object.entries(raw).forEach(([k,v]) => {
    const mapped = COL_MAP[k.trim()] || COL_MAP[k.trim().toLowerCase()];
    if (mapped) out[mapped] = String(v).trim();
  });
  return out;
}

function generateImportTemplate() {
  const headers = [["اسم العميل*","هاتف العميل*","هاتف ثاني","المحافظة*","المدينة","الشارع","المبنى",
    "مبلغ COD*","رسوم الشحن","رسوم الإرجاع","نوع الخدمة","نوع الطلب","الوزن (كجم)","باركود","ملاحظات"]];
  const sample  = [["محمد أحمد","01012345678","","القاهرة","مدينة نصر","شارع النصر","عمارة 5",
    "500","60","30","door_to_door","standard","1.5","","شحنة تجريبية"]];
  const notes   = [["* مطلوب | نوع الخدمة: door_to_door/drop_off/pickup | نوع الطلب: standard/express/scheduled"]];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([...headers,...sample,[],...notes]);
  ws["!cols"] = headers[0].map((_,i)=>({wch:i<2?20:i<6?15:12}));
  XLSX.utils.book_append_sheet(wb,ws,"شحنات");
  XLSX.writeFile(wb,"نموذج_استيراد_النخبة.xlsx");
}

async function parseImportFile(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(new Uint8Array(e.target.result),{type:"array"});
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws,{defval:""});
        resolve(rows);
      } catch(err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("فشل قراءة الملف"));
    reader.readAsArrayBuffer(file);
  });
}

async function generateShipmentCode() {
  const prefix = "ANE";
  const ts     = Date.now().toString(36).toUpperCase();
  const rand   = Math.random().toString(36).slice(2,5).toUpperCase();
  return prefix + "-" + ts + rand;
}

function viewImport() {
  const role    = AppState.user.primary_role||AppState.user.role;
  const isAdmin = role==="admin";
  const wiz     = AppState.importWizard;
  const batches = AppState.importBatches;
  const step    = wiz ? wiz.step : 0;

  const STEPS = [
    {n:1,label:"تحميل النموذج"},{n:2,label:"رفع الملف"},
    {n:3,label:"التحقق"},{n:4,label:"المعاينة"},
    {n:5,label:"الاستيراد"},{n:6,label:"التقرير"},
  ];

  const stepBar = `<div class="import-steps">
    ${STEPS.map(s=>`
      <div class="import-step ${step===s.n?"active":step>s.n?"done":""}">
        <div class="import-step-num">${step>s.n?"✓":s.n}</div>
        <div class="import-step-label">${s.label}</div>
      </div>${s.n<6?'<div class="import-step-line"></div>':""}`).join("")}
  </div>`;

  // ── Landing / History (step 0) ──────────────────────────────
  if (!wiz || step===0) {
    const SB = {pending:"badge-gray",validating:"badge-warning",validated:"badge-brand",
                importing:"badge-warning",done:"badge-success",failed:"badge-danger",cancelled:"badge-gray"};
    const SL = {pending:"بانتظار",validating:"جاري التحقق",validated:"جاهز",
                importing:"جاري الاستيراد",done:"مكتمل",failed:"فشل",cancelled:"ملغي"};
    return `
      <div class="card" style="margin-bottom:16px;">
        <div class="card-header">
          <h3 class="card-title">${icon("box")} استيراد شحنات بالجملة</h3>
          <button class="btn btn-primary" onclick="App.startImportWizard()">${icon("plus",13)} استيراد جديد</button>
        </div>
        <div class="kpi-grid" style="margin-bottom:20px;">
          ${kpi("إجمالي الدفعات",batches.length,"box","var(--brand)","var(--brand-light)")}
          ${kpi("مكتملة",batches.filter(b=>b.status==="done").length,"chart","var(--success)","var(--success-bg)")}
          ${kpi("فاشلة",batches.filter(b=>b.status==="failed").length,"refresh","var(--danger)","var(--danger-bg)")}
          ${kpi("شحنات مستوردة",batches.reduce((a,b)=>a+(b.imported_rows||0),0),"truck","var(--info)","var(--info-bg)")}
        </div>
        ${!batches.length?`<div class="empty">
          <div class="empty-icon">📦</div><h3>لا توجد دفعات استيراد</h3>
          <p>ابدأ باستيراد شحناتك من ملف Excel أو CSV</p>
          <button class="btn btn-primary" onclick="App.startImportWizard()">بدء الاستيراد</button>
        </div>`:`
        <div class="table-wrap"><table>
          <thead><tr>
            <th>رقم الدفعة</th>${isAdmin?"<th>التاجر</th>":""}
            <th>الملف</th><th>الإجمالي</th><th>صالح</th>
            <th>أخطاء</th><th>مستورد</th><th>الحالة</th><th>التاريخ</th><th>إجراءات</th>
          </tr></thead>
          <tbody>
            ${batches.map(b=>`<tr>
              <td class="td-mono" style="font-size:11px;">${b.id.slice(-8).toUpperCase()}</td>
              ${isAdmin?`<td style="font-size:12px;">${esc(b.merchant_name||"—")}</td>`:""}
              <td style="font-size:12px;">${esc(b.filename)}</td>
              <td style="font-weight:600;">${b.total_rows}</td>
              <td style="color:var(--success);font-weight:600;">${b.valid_rows}</td>
              <td style="color:var(--danger);font-weight:600;">${b.invalid_rows}</td>
              <td style="color:var(--brand);font-weight:600;">${b.imported_rows}</td>
              <td><span class="badge ${SB[b.status]||"badge-gray"}">${SL[b.status]||b.status}</span></td>
              <td style="font-size:11px;color:var(--gray-400);">${fmtDate(b.created_at)}</td>
              <td><div class="td-actions">
                ${b.status==="validated"?`<button class="btn btn-primary btn-sm" onclick="App.resumeImportBatch('${esc(b.id)}')">استيراد</button>`:""}
                ${(b.failed_rows>0&&b.status==="done")?`
                  <button class="btn btn-secondary btn-sm" onclick="App.retryFailedRows('${esc(b.id)}')">إعادة</button>
                  <button class="btn btn-secondary btn-sm" onclick="App.downloadErrorReport('${esc(b.id)}')">↓ أخطاء</button>`:""}
                ${["pending","validating","validated"].includes(b.status)&&can("import.cancel")?`
                  <button class="btn btn-secondary btn-sm" style="color:var(--danger);" onclick="App.cancelImport('${esc(b.id)}')">إلغاء</button>`:""}
              </div></td>
            </tr>`).join("")}
          </tbody>
        </table></div>`}
      </div>`;
  }

  // ── Step 1: Download template ──────────────────────────────
  if (step===1) return `${stepBar}
    <div class="card">
      <h3 class="card-title" style="margin-bottom:20px;">${icon("box")} الخطوة 1: تحميل نموذج Excel</h3>
      <div style="background:var(--brand-light);border-radius:var(--radius-lg);padding:24px;margin-bottom:20px;">
        <div style="font-weight:700;color:var(--brand-dark);margin-bottom:12px;">📋 النموذج يحتوي على:</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
          ${["اسم العميل *","هاتف العميل *","هاتف ثاني","المحافظة *","المدينة","الشارع والمبنى",
             "مبلغ COD *","رسوم الشحن","رسوم الإرجاع","نوع الخدمة","نوع الطلب","الوزن والباركود"]
            .map(f=>`<div>✓ ${f}</div>`).join("")}
        </div>
      </div>
      <div style="background:var(--warning-bg);border:1px solid var(--warning-border);border-radius:var(--radius);padding:14px;margin-bottom:20px;font-size:13px;">
        ⚠️ <b>ملاحظات:</b> الحقول المميزة بـ * مطلوبة · نوع الخدمة: door_to_door/drop_off/pickup ·
        نوع الطلب: standard/express/scheduled · الهاتف 11 رقم يبدأ بـ 01 · احذف صف الملاحظات قبل الرفع
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <button class="btn btn-primary" style="padding:12px 24px;" onclick="App.downloadImportTemplate()">⬇️ تحميل النموذج</button>
        <button class="btn btn-secondary" style="padding:12px 24px;" onclick="App.importWizardNext()">التالي ←</button>
        <button class="btn btn-secondary" onclick="App.cancelImportWizard()">إلغاء</button>
      </div>
    </div>`;

  // ── Step 2: Upload ─────────────────────────────────────────
  if (step===2) return `${stepBar}
    <div class="card">
      <h3 class="card-title" style="margin-bottom:20px;">${icon("box")} الخطوة 2: رفع الملف</h3>
      ${isAdmin?`<div class="field" style="margin-bottom:16px;">
        <label style="font-weight:600;display:block;margin-bottom:6px;">التاجر المستهدف *</label>
        <select id="importMerchantSel" style="width:100%;padding:10px;border-radius:var(--radius);border:1.5px solid var(--gray-300);">
          <option value="">-- اختر التاجر --</option>
          ${AppState.allMerchants.map(m=>`<option value="${esc(m.id)}" data-name="${esc(m.full_name)}"
            ${wiz&&wiz.merchantId===m.id?"selected":""}>${esc(m.full_name)}</option>`).join("")}
        </select>
      </div>`:""}
      <div class="import-dropzone" id="importDropzone"
        onclick="$('importFileInput').click()"
        ondragover="event.preventDefault();this.classList.add('dragover')"
        ondragleave="this.classList.remove('dragover')"
        ondrop="event.preventDefault();this.classList.remove('dragover');App.handleImportDrop(event)">
        <div style="font-size:40px;margin-bottom:12px;">📂</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:6px;">اسحب الملف هنا أو انقر للاختيار</div>
        <div style="font-size:12px;color:var(--gray-400);">يُقبل: .xlsx · .xls · .csv · الحد الأقصى 5MB</div>
        <input type="file" id="importFileInput" accept=".xlsx,.xls,.csv" style="display:none"
          onchange="App.handleImportFile(this.files[0])"/>
      </div>
      ${wiz&&wiz.file?`
        <div style="background:var(--success-bg);border-radius:var(--radius);padding:14px;margin-top:16px;display:flex;align-items:center;gap:12px;">
          <span style="font-size:20px;">✅</span>
          <div><div style="font-weight:600;">${esc(wiz.file.name)}</div>
            <div style="font-size:12px;color:var(--gray-500);">${(wiz.file.size/1024).toFixed(1)} KB</div></div>
          <button class="btn btn-primary" style="margin-right:auto;" onclick="App.importWizardNext()">التالي: التحقق ←</button>
        </div>`:""}
      <div style="margin-top:16px;display:flex;gap:10px;">
        <button class="btn btn-secondary" onclick="App.importWizardBack()">← العودة</button>
        <button class="btn btn-secondary" onclick="App.cancelImportWizard()">إلغاء</button>
      </div>
    </div>`;

  // ── Step 3: Validation results ─────────────────────────────
  if (step===3) {
    const rows    = wiz.validatedRows||[];
    const valid   = rows.filter(r=>r.is_valid&&!r.is_duplicate);
    const invalid = rows.filter(r=>!r.is_valid);
    const dups    = rows.filter(r=>r.is_duplicate);
    return `${stepBar}
      <div class="card">
        <h3 class="card-title" style="margin-bottom:16px;">${icon("chart")} الخطوة 3: نتائج التحقق</h3>
        <div class="kpi-grid" style="margin-bottom:20px;">
          ${kpi("إجمالي الصفوف",rows.length,"box","var(--brand)","var(--brand-light)")}
          ${kpi("صالح",valid.length,"chart","var(--success)","var(--success-bg)")}
          ${kpi("أخطاء",invalid.length,"refresh","var(--danger)","var(--danger-bg)")}
          ${kpi("مكرر",dups.length,"log","var(--warning)","var(--warning-bg)")}
        </div>
        ${invalid.length?`
          <div style="margin-bottom:16px;">
            <div style="font-weight:600;color:var(--danger);margin-bottom:8px;">❌ صفوف بها أخطاء</div>
            <div class="table-wrap"><table>
              <thead><tr><th>الصف</th><th>اسم العميل</th><th>الهاتف</th><th>الأخطاء</th></tr></thead>
              <tbody>
                ${invalid.slice(0,50).map(r=>`<tr>
                  <td class="td-mono">${r.row_number}</td>
                  <td>${esc(r.customer_name||"—")}</td>
                  <td>${esc(r.customer_phone||"—")}</td>
                  <td style="color:var(--danger);font-size:12px;">
                    ${(r.validation_errors||[]).map(e=>esc(e.field)+": "+esc(e.message)).join(" · ")}
                  </td>
                </tr>`).join("")}
                ${invalid.length>50?`<tr><td colspan="4" style="text-align:center;color:var(--gray-400);">+ ${invalid.length-50} صف آخر</td></tr>`:""}
              </tbody>
            </table></div>
          </div>`:""}
        ${dups.length?`
          <div style="background:var(--warning-bg);border:1px solid var(--warning-border);border-radius:var(--radius);padding:12px;margin-bottom:16px;font-size:13px;">
            ⚠️ <b>${dups.length}</b> صف مكرر (موجود في الشحنات أو في هذا الملف) — سيتم تخطيه
          </div>`:""}
        ${valid.length?`
          <div style="background:var(--success-bg);border-radius:var(--radius);padding:14px;margin-bottom:16px;font-size:13px;">
            ✅ يمكن استيراد <b>${valid.length}</b> شحنة
          </div>`:`
          <div style="background:var(--danger-bg);border-radius:var(--radius);padding:14px;margin-bottom:16px;font-size:13px;">
            لا توجد صفوف صالحة — يرجى تصحيح الملف وإعادة الرفع
          </div>`}
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${invalid.length?`<button class="btn btn-secondary" onclick="App.downloadErrorReport(null,true)">⬇️ تقرير الأخطاء</button>`:""}
          ${valid.length?`<button class="btn btn-primary" onclick="App.importWizardNext()">التالي: المعاينة ←</button>`:""}
          <button class="btn btn-secondary" onclick="App.importWizardBack()">← العودة</button>
          <button class="btn btn-secondary" onclick="App.cancelImportWizard()">إلغاء</button>
        </div>
      </div>`;
  }

  // ── Step 4: Preview ────────────────────────────────────────
  if (step===4) {
    const rows = (wiz.validatedRows||[]).filter(r=>r.is_valid&&!r.is_duplicate);
    return `${stepBar}
      <div class="card">
        <h3 class="card-title" style="margin-bottom:16px;">${icon("truck")} الخطوة 4: معاينة الشحنات</h3>
        <div style="background:var(--info-bg,#eff6ff);border-radius:var(--radius);padding:14px;margin-bottom:16px;font-size:13px;">
          سيتم استيراد <b>${rows.length}</b> شحنة. راجع البيانات قبل المتابعة.
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-weight:600;margin-bottom:10px;">خيارات الإنشاء التلقائي:</div>
          <div style="display:flex;gap:20px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
              <input type="checkbox" ${wiz.autoRecipients?"checked":""} onchange="AppState.importWizard.autoRecipients=this.checked"/>
              إضافة عملاء جدد تلقائياً
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
              <input type="checkbox" ${wiz.autoAddresses?"checked":""} onchange="AppState.importWizard.autoAddresses=this.checked"/>
              حفظ عناوين جديدة تلقائياً
            </label>
          </div>
        </div>
        <div class="table-wrap" style="max-height:380px;overflow-y:auto;margin-bottom:16px;">
          <table>
            <thead><tr><th>#</th><th>العميل</th><th>الهاتف</th><th>المحافظة</th><th>COD</th><th>الخدمة</th><th>الوزن</th></tr></thead>
            <tbody>
              ${rows.slice(0,200).map(r=>`<tr>
                <td class="td-mono" style="font-size:11px;">${r.row_number}</td>
                <td>${esc(r.customer_name||"—")}</td>
                <td class="td-phone">${esc(r.customer_phone||"—")}</td>
                <td style="font-size:12px;">${esc(r.governorate||"—")}</td>
                <td style="font-weight:600;">${money(Number(r.amount)||0)}</td>
                <td style="font-size:11px;">${esc(r.service_type||"door_to_door")}</td>
                <td style="font-size:12px;">${r.weight?r.weight+"كجم":"—"}</td>
              </tr>`).join("")}
              ${rows.length>200?`<tr><td colspan="7" style="text-align:center;color:var(--gray-400);">+ ${rows.length-200} شحنة أخرى</td></tr>`:""}
            </tbody>
          </table>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary" style="padding:12px 24px;" onclick="App.importWizardNext()">
            🚀 بدء الاستيراد (${rows.length} شحنة)
          </button>
          <button class="btn btn-secondary" onclick="App.importWizardBack()">← العودة</button>
          <button class="btn btn-secondary" onclick="App.cancelImportWizard()">إلغاء</button>
        </div>
      </div>`;
  }

  // ── Step 5: Importing (progress) ──────────────────────────
  if (step===5) {
    const prog = wiz.progress||{done:0,total:0,failed:0};
    const pct  = prog.total>0 ? Math.round(prog.done/prog.total*100) : 0;
    return `${stepBar}
      <div class="card" style="text-align:center;padding:40px;">
        <div style="font-size:40px;margin-bottom:16px;">🚀</div>
        <h3 style="margin-bottom:20px;">جاري استيراد الشحنات...</h3>
        <div style="background:var(--gray-100);border-radius:99px;height:12px;margin:0 auto 16px;max-width:400px;overflow:hidden;">
          <div id="importProgressBar" style="background:var(--brand);height:100%;border-radius:99px;transition:width .3s;width:${pct}%;"></div>
        </div>
        <div id="importProgressText" style="font-size:14px;color:var(--gray-600);margin-bottom:8px;">
          ${prog.done} / ${prog.total} شحنة
        </div>
        ${prog.failed>0?`<div style="color:var(--danger);font-size:13px;">${prog.failed} فشلت</div>`:""}
        ${pct>=100?`<button class="btn btn-primary" style="margin-top:20px;" onclick="App.importWizardNext()">عرض التقرير ←</button>`:""}
      </div>`;
  }

  // ── Step 6: Report ─────────────────────────────────────────
  if (step===6) {
    const prog = wiz.progress||{done:0,total:0,failed:0,skipped:0};
    return `${stepBar}
      <div class="card">
        <h3 class="card-title" style="margin-bottom:20px;">📊 الخطوة 6: تقرير الاستيراد</h3>
        <div class="kpi-grid" style="margin-bottom:20px;">
          ${kpi("إجمالي الصفوف",prog.total,"box","var(--brand)","var(--brand-light)")}
          ${kpi("تم الاستيراد",prog.done,"chart","var(--success)","var(--success-bg)")}
          ${kpi("فشل",prog.failed,"refresh","var(--danger)","var(--danger-bg)")}
          ${kpi("تخطي",prog.skipped,"log","var(--warning)","var(--warning-bg)")}
        </div>
        ${prog.done>0?`<div style="background:var(--success-bg);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
          ✅ تم استيراد <b>${prog.done}</b> شحنة بنجاح
        </div>`:""}
        ${prog.failed>0?`<div style="background:var(--danger-bg);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
          ❌ فشل <b>${prog.failed}</b> شحنة
        </div>`:""}
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${prog.failed>0&&wiz.batch?`
            <button class="btn btn-secondary" onclick="App.retryFailedRows('${esc(wiz.batch.id)}')">🔄 إعادة المحاولة</button>
            <button class="btn btn-secondary" onclick="App.downloadErrorReport('${esc(wiz.batch.id)}')">⬇️ تقرير الأخطاء</button>`:""}
          <button class="btn btn-primary" onclick="App.finishImport()">✅ إنهاء</button>
        </div>
      </div>`;
  }

  return `<div class="empty"><div class="empty-icon">📦</div><h3>جاري التحميل...</h3></div>`;
}

function viewAddresses() {
  const addrs = AppState.merchantAddresses;
  const uid   = AppState.user.id;
  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">${icon("map")} دفتر العناوين</h3>
        <button class="btn btn-primary btn-sm" onclick="App.addAddress()">
          ${icon("plus",13)} إضافة عنوان
        </button>
      </div>
      ${!addrs.length ? `<div class="empty">
          <div class="empty-icon">📍</div>
          <h3>لا توجد عناوين محفوظة</h3>
          <p>أضف عناوين الاستلام والمخازن والفروع الخاصة بك</p>
          <button class="btn btn-primary" onclick="App.addAddress()">إضافة عنوان</button>
        </div>` :
        `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;">
          ${addrs.map(a => `
            <div class="card" style="position:relative;border:1px solid var(--gray-200);${a.is_default?"border-right:3px solid var(--brand);":""}" >
              ${a.is_default?`<span class="badge badge-brand" style="position:absolute;top:12px;left:12px;font-size:10px;">افتراضي</span>`:""}
              <div style="font-size:15px;font-weight:700;margin-bottom:6px;">${esc(a.label)}</div>
              <div style="margin-bottom:8px;">
                <span class="badge ${a.type==="pickup"?"badge-success":a.type==="warehouse"?"badge-warning":"badge-info"}" style="font-size:11px;">
                  ${a.type==="pickup"?"📦 استلام":a.type==="warehouse"?"🏭 مستودع":a.type==="branch"?"🏪 فرع":"📍 أخرى"}
                </span>
              </div>
              <div style="font-size:13px;color:var(--gray-600);line-height:1.6;">
                ${esc(a.governorate)} / ${esc(a.city)}
                ${a.street?`<br/>${esc(a.street)}`:""}
                ${a.contact_name?`<br/>📞 ${esc(a.contact_name)} ${a.contact_phone?- " "+esc(a.contact_phone):""}`:""}
              </div>
              <div style="display:flex;gap:8px;margin-top:12px;">
                <button class="btn btn-secondary btn-sm" onclick="App.editAddress('${esc(a.id)}')">${icon("edit",13)} تعديل</button>
                ${!a.is_default?`<button class="btn btn-secondary btn-sm" onclick="App.setDefaultAddress('${esc(a.id)}')">تعيين كافتراضي</button>`:""}
                <button class="btn btn-secondary btn-sm" style="color:var(--danger);" onclick="App.deleteAddress('${esc(a.id)}')">حذف</button>
              </div>
            </div>`).join("")}
        </div>`}
    </div>`;
}

function viewRecipients() {
  const recs = AppState.merchantRecipients;
  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">${icon("users")} قاعدة العملاء</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="App.addRecipient()">${icon("plus",13)} إضافة عميل</button>
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <input id="recipientSearch" placeholder="ابحث بالاسم أو الهاتف..."
          style="width:100%;padding:9px 14px;border-radius:var(--radius);border:1.5px solid var(--gray-300);font-size:13px;"
          oninput="App.searchRecipients(this.value)"/>
      </div>
      ${!recs.length ? `<div class="empty">
          <div class="empty-icon">👥</div>
          <h3>لا يوجد عملاء محفوظون</h3>
          <p>أضف عملاءك لتسريع إنشاء الشحنات</p>
          <button class="btn btn-primary" onclick="App.addRecipient()">إضافة عميل</button>
        </div>` :
        `<div class="table-wrap"><table>
          <thead><tr><th>الاسم</th><th>الهاتف</th><th>المنطقة</th><th>الشحنات</th><th>إجراءات</th></tr></thead>
          <tbody>
            ${recs.map(r => `<tr>
              <td class="td-primary">${esc(r.name)}</td>
              <td class="td-phone"><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>
                ${r.phone2?`<br/><a href="tel:${esc(r.phone2)}" style="font-size:11px;color:var(--gray-500);">${esc(r.phone2)}</a>`:""}
              </td>
              <td style="font-size:12px;">${esc(r.governorate)} ${r.city?"/"+esc(r.city):""}</td>
              <td><span class="badge badge-brand">${r.order_count||0} شحنة</span></td>
              <td>
                <div class="td-actions">
                  <button class="btn btn-primary btn-sm" onclick="App.shipToRecipient('${esc(r.id)}')">+ شحنة</button>
                  <button class="btn-icon" onclick="App.editRecipient('${esc(r.id)}')">${icon("edit",13)}</button>
                  <button class="btn-icon" style="color:var(--danger);" onclick="App.deleteRecipient('${esc(r.id)}')">${icon("trash",13)}</button>
                </div>
              </td>
            </tr>`).join("")}
          </tbody>
        </table></div>`}
    </div>`;
}

function viewProducts() {
  const prods = AppState.merchantProducts;
  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">${icon("box")} كتالوج المنتجات</h3>
        <button class="btn btn-primary btn-sm" onclick="App.addProduct()">${icon("plus",13)} إضافة منتج</button>
      </div>
      ${!prods.length ? `<div class="empty">
          <div class="empty-icon">🛍️</div>
          <h3>لا توجد منتجات</h3>
          <p>أضف منتجاتك لتسريع إنشاء الشحنات تلقائياً</p>
          <button class="btn btn-primary" onclick="App.addProduct()">إضافة منتج</button>
        </div>` :
        `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;">
          ${prods.map(p => `
            <div class="card" style="border:1px solid var(--gray-200);padding:16px;">
              ${p.image_url?`<img src="${esc(p.image_url)}" style="width:100%;height:120px;object-fit:cover;border-radius:var(--radius);margin-bottom:10px;"/>`
                :`<div style="width:100%;height:80px;background:var(--gray-100);border-radius:var(--radius);margin-bottom:10px;display:flex;align-items:center;justify-content:center;font-size:32px;">🛍️</div>`}
              <div style="font-weight:700;margin-bottom:4px;">${esc(p.name)}</div>
              ${p.sku?`<div style="font-size:11px;color:var(--gray-500);font-family:monospace;">SKU: ${esc(p.sku)}</div>`:""}
              ${p.price?`<div style="font-size:14px;font-weight:700;color:var(--brand);margin-top:6px;">${money(p.price)}</div>`:""}
              ${p.weight?`<div style="font-size:11px;color:var(--gray-500);">${p.weight} كجم</div>`:""}
              <div style="display:flex;gap:6px;margin-top:10px;">
                <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="App.editProduct('${esc(p.id)}')">تعديل</button>
                <button class="btn-icon" style="color:var(--danger);" onclick="App.deleteProduct('${esc(p.id)}')">${icon("trash",13)}</button>
              </div>
            </div>`).join("")}
        </div>`}
    </div>`;
}

function viewPickupRequests() {
  const reqs = AppState.pickupRequests;
  const STATUS_PICKUP = {
    pending:    { label:"بانتظار التعيين", badge:"badge-warning" },
    assigned:   { label:"تم تعيين مندوب", badge:"badge-brand"   },
    picked_up:  { label:"تم الاستلام",    badge:"badge-success" },
    cancelled:  { label:"ملغي",           badge:"badge-gray"    },
  };
  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">${icon("truck")} طلبات الاستلام</h3>
        <button class="btn btn-primary btn-sm" onclick="App.newPickupRequest()">${icon("plus",13)} طلب استلام</button>
      </div>
      ${!reqs.length ? `<div class="empty">
          <div class="empty-icon">🚚</div>
          <h3>لا توجد طلبات استلام</h3>
          <p>اطلب من المندوب الحضور لاستلام شحناتك</p>
          <button class="btn btn-primary" onclick="App.newPickupRequest()">طلب استلام جديد</button>
        </div>` :
        `<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>الحالة</th><th>العنوان</th><th>عدد الشحنات</th><th>الموعد</th><th>المندوب</th><th>إجراءات</th></tr></thead>
          <tbody>
            ${reqs.map(r => `<tr>
              <td class="td-mono" style="font-size:11px;">${r.id.slice(-6)}</td>
              <td><span class="badge ${STATUS_PICKUP[r.status]?.badge||"badge-gray"}">${STATUS_PICKUP[r.status]?.label||r.status}</span></td>
              <td style="font-size:12px;">عنوان محفوظ</td>
              <td style="font-weight:600;">${r.shipment_count} شحنة</td>
              <td style="font-size:12px;">${r.scheduled_at?fmtDate(r.scheduled_at):"أسرع وقت ممكن"}</td>
              <td style="font-size:12px;">${r.courier_name?esc(r.courier_name):`<span style="color:var(--gray-400);">—</span>`}</td>
              <td>
                ${r.status==="pending"?`<button class="btn btn-secondary btn-sm" style="color:var(--danger);" onclick="App.cancelPickupRequest('${esc(r.id)}')">إلغاء</button>`:""}
              </td>
            </tr>`).join("")}
          </tbody>
        </table></div>`}
    </div>`;
}

const App={
  setFilter(f)       { AppState.statusFilter  = f; rerenderContent(); },

  // ── Phase 2C: Pricing ─────────────────────────────────────
  // ── Phase 2D: Branches & Warehouses ──────────────────────
  // ── Phase 3: driver self-service wallet ──────────────────
  // ══════════════════════════════════════════════════════════════
  // BULK IMPORT — App Methods
  // ══════════════════════════════════════════════════════════════

  async loadImportBatches() {
    const role = AppState.user.primary_role||AppState.user.role;
    const mid  = role==="merchant" ? AppState.user.id : null;
    AppState.importBatches = await DB.loadImportBatches(mid);
  },

  async startImportWizard() {
    await loadEgyptData();
    AppState.importWizard = {
      step:1, file:null, rawRows:[], validatedRows:[],
      merchantId: (AppState.user.primary_role||AppState.user.role)==="merchant" ? AppState.user.id : "",
      merchantName: (AppState.user.primary_role||AppState.user.role)==="merchant" ? AppState.user.name : "",
      autoRecipients:false, autoAddresses:false,
      progress:{done:0,total:0,failed:0,skipped:0}, batch:null,
    };
    rerenderContent();
  },

  cancelImportWizard() {
    if (!confirm("إلغاء الاستيراد الحالي؟")) return;
    AppState.importWizard = null;
    rerenderContent();
  },

  downloadImportTemplate() {
    generateImportTemplate();
    DB.addAudit("DOWNLOAD_IMPORT_TEMPLATE","",
      "By "+AppState.user.name,"import");
  },

  importWizardNext() {
    if (!AppState.importWizard) return;
    const wiz = AppState.importWizard;
    // Step 2 → 3: trigger validation
    if (wiz.step===2) { App.runImportValidation(); return; }
    // Step 4 → 5: trigger actual import
    if (wiz.step===4) { wiz.step=5; rerenderContent(); App.runBulkImport(); return; }
    wiz.step++;
    rerenderContent();
  },

  importWizardBack() {
    if (!AppState.importWizard) return;
    const wiz = AppState.importWizard;
    if (wiz.step<=1) { App.cancelImportWizard(); return; }
    wiz.step--;
    // Going back to step 2 clears file so user re-picks
    if (wiz.step===2) { wiz.file=null; wiz.rawRows=[]; wiz.validatedRows=[]; }
    rerenderContent();
  },

  handleImportFile(file) {
    if (!file) return;
    if (file.size > 5*1024*1024) { toast("الملف كبير جداً (الحد 5MB)","error"); return; }
    const wiz = AppState.importWizard;
    if (!wiz) return;
    // Admin must select merchant first
    const isAdmin = (AppState.user.primary_role||AppState.user.role)==="admin";
    if (isAdmin) {
      const sel = $("importMerchantSel");
      if (!sel||!sel.value) { toast("يرجى اختيار التاجر أولاً","warning"); return; }
      wiz.merchantId   = sel.value;
      wiz.merchantName = sel.options[sel.selectedIndex]?.dataset.name||"";
    }
    wiz.file = file;
    rerenderContent();
  },

  handleImportDrop(event) {
    const file = event.dataTransfer?.files?.[0];
    if (file) App.handleImportFile(file);
  },

  async runImportValidation() {
    const wiz = AppState.importWizard;
    if (!wiz||!wiz.file) { toast("يرجى رفع ملف أولاً","warning"); return; }
    if (!wiz.merchantId) { toast("يرجى اختيار التاجر أولاً","warning"); return; }
    try {
      toast("جاري التحقق من البيانات...","info");
      // Parse file
      const rawRows = await parseImportFile(wiz.file);
      if (!rawRows.length) { toast("الملف فارغ أو تنسيقه غير صحيح","error"); return; }

      // Load existing shipment phones to detect duplicates
      const existingPhones = new Set(AppState.shipments.map(s=>s.customerPhone));

      // Normalize + validate each row
      const validated = rawRows.map((raw, idx) => {
        const r   = normalizeImportRow(raw);
        const errs = validateImportRow(r, idx+2, EGYPT_GOV);
        const isDup = r.customer_phone&&existingPhones.has(r.customer_phone.replace(/s/g,""));
        return {
          row_number:        idx+2,
          raw_data:          raw,
          customer_name:     r.customer_name||"",
          customer_phone:    (r.customer_phone||"").replace(/s/g,""),
          customer_phone2:   (r.customer_phone2||"").replace(/s/g,"")||null,
          governorate:       r.governorate||"",
          city:              r.city||"",
          street:            r.street||null,
          building:          r.building||null,
          amount:            r.amount!==""?Number(r.amount):null,
          delivery_fee:      r.delivery_fee!==""?Number(r.delivery_fee):null,
          return_fee:        r.return_fee!==""?Number(r.return_fee):0,
          service_type:      r.service_type||"door_to_door",
          order_type:        r.order_type||"standard",
          weight:            r.weight!==""&&r.weight!==undefined?Number(r.weight):null,
          barcode:           r.barcode||null,
          notes:             r.notes||null,
          is_valid:          errs.length===0,
          is_duplicate:      isDup&&errs.length===0,
          validation_errors: errs,
          status:            "pending",
        };
      });

      wiz.rawRows       = rawRows;
      wiz.validatedRows = validated;
      wiz.step          = 3;
      rerenderContent();

    } catch(err) {
      toast("خطأ أثناء قراءة الملف: "+err.message,"error");
    }
  },

  async runBulkImport() {
    const wiz = AppState.importWizard;
    if (!wiz) return;

    const validRows = (wiz.validatedRows||[]).filter(r=>r.is_valid&&!r.is_duplicate);
    if (!validRows.length) { toast("لا توجد صفوف صالحة","warning"); return; }

    wiz.progress = { done:0, total:validRows.length, failed:0, skipped:0 };

    try {
      // Create batch record in DB
      const batch = await DB.createImportBatch({
        merchant_id:      wiz.merchantId,
        merchant_name:    wiz.merchantName||"",
        created_by:       AppState.user.id,
        created_by_role:  AppState.user.primary_role||AppState.user.role,
        filename:         wiz.file.name,
        file_row_count:   wiz.rawRows.length,
        total_rows:       (wiz.validatedRows||[]).length,
        valid_rows:       validRows.length,
        invalid_rows:     (wiz.validatedRows||[]).filter(r=>!r.is_valid).length,
        duplicate_rows:   (wiz.validatedRows||[]).filter(r=>r.is_duplicate).length,
        auto_create_recipients: wiz.autoRecipients||false,
        auto_save_addresses:    wiz.autoAddresses||false,
        status:           "importing",
        started_at:       new Date().toISOString(),
      });
      wiz.batch = batch;

      // Insert all rows into import_rows
      const rowPayloads = (wiz.validatedRows||[]).map(r=>({
        batch_id:          batch.id,
        row_number:        r.row_number,
        raw_data:          r.raw_data,
        customer_name:     r.customer_name,
        customer_phone:    r.customer_phone,
        customer_phone2:   r.customer_phone2,
        governorate:       r.governorate,
        city:              r.city,
        street:            r.street,
        building:          r.building,
        amount:            r.amount,
        delivery_fee:      r.delivery_fee,
        return_fee:        r.return_fee||0,
        service_type:      r.service_type,
        order_type:        r.order_type,
        weight:            r.weight,
        barcode:           r.barcode,
        notes:             r.notes,
        is_valid:          r.is_valid,
        is_duplicate:      r.is_duplicate,
        validation_errors: r.validation_errors||[],
        status:            r.is_duplicate?"duplicate":r.is_valid?"pending":"failed",
      }));
      await DB.insertImportRows(rowPayloads);

      // Import valid rows one by one (with progress updates)
      const uid  = AppState.user.id;
      const CHUNK = 10;
      for (let i=0; i<validRows.length; i++) {
        const r = validRows[i];
        try {
          const code = await generateShipmentCode();
          await DB.createShipment({
            shipment_code:  code,
            merchant_id:    wiz.merchantId,
            merchant_name:  wiz.merchantName||"",
            merchant_phone: "",
            customer_name:  r.customer_name,
            customer_phone: r.customer_phone,
            customer_phone2:r.customer_phone2||null,
            governorate:    r.governorate,
            city:           r.city||"",
            street:         r.street||null,
            building:       r.building||null,
            floor:          null,
            apartment:      null,
            amount:         r.amount||0,
            delivery_fee:   r.delivery_fee||0,
            return_fee:     r.return_fee||0,
            service_type:   r.service_type||"door_to_door",
            order_type:     r.order_type||"standard",
            weight:         r.weight||null,
            barcode:        r.barcode||null,
            notes:          r.notes||null,
            status:         "submitted",
            created_by:     uid,
          });

          // Auto-create recipient if enabled
          if (wiz.autoRecipients && r.customer_name && r.customer_phone) {
            db.from("merchant_recipients").insert([{
              merchant_id: wiz.merchantId,
              name:        r.customer_name,
              phone:       r.customer_phone,
              phone2:      r.customer_phone2||null,
              governorate: r.governorate||"",
              city:        r.city||"",
              street:      r.street||null,
            }]).then(()=>{}).catch(()=>{});
          }

          // Auto-save address if enabled and has enough info
          if (wiz.autoAddresses && r.governorate && r.street) {
            db.from("merchant_addresses").insert([{
              merchant_id:  wiz.merchantId,
              label:        r.customer_name+" - "+r.governorate,
              type:         "other",
              governorate:  r.governorate,
              city:         r.city||"",
              street:       r.street||null,
              building:     r.building||null,
            }]).then(()=>{}).catch(()=>{});
          }

          // Update import row status
          await DB.updateImportRow(rowPayloads[i+wiz.progress.done-wiz.progress.done]?.id||"",
            {status:"imported", shipment_code:code});

          wiz.progress.done++;
        } catch(rowErr) {
          wiz.progress.failed++;
          console.warn("Import row failed:",rowErr.message);
        }

        // Update progress bar every 10 rows
        if (i%CHUNK===0||i===validRows.length-1) {
          const bar  = $("importProgressBar");
          const txt  = $("importProgressText");
          const p    = wiz.progress;
          const pct  = Math.round(p.done/p.total*100);
          if (bar) bar.style.width = pct+"%";
          if (txt) txt.textContent = p.done+" / "+p.total+" شحنة";
          await new Promise(r=>setTimeout(r,0)); // yield to UI
        }
      }

      // Finalize batch
      await DB.updateImportBatch(batch.id, {
        status:        wiz.progress.failed===validRows.length?"failed":"done",
        imported_rows: wiz.progress.done,
        failed_rows:   wiz.progress.failed,
        skipped_rows:  (wiz.validatedRows||[]).filter(r=>r.is_duplicate).length,
        completed_at:  new Date().toISOString(),
      });

      await DB.addAudit("BULK_IMPORT",batch.id,
        "Merchant: "+wiz.merchantName+" | Total: "+wiz.progress.total+
        " | Imported: "+wiz.progress.done+" | Failed: "+wiz.progress.failed+
        " | By: "+AppState.user.name,"import");

      wiz.step = 6;
      rerenderContent();

    } catch(err) {
      toast("خطأ أثناء الاستيراد: "+err.message,"error");
      if (wiz.batch) {
        await DB.updateImportBatch(wiz.batch.id,{status:"failed"}).catch(()=>{});
      }
    }
  },

  async finishImport() {
    AppState.importWizard = null;
    await App.loadImportBatches();
    // Reload shipments to show new ones
    AppState.shipments = await DB.loadShipments();
    rerenderContent();
    toast("✅ تم إنهاء الاستيراد بنجاح");
  },

  async cancelImport(batchId) {
    if (!confirm("إلغاء دفعة الاستيراد هذه؟")) return;
    await DB.updateImportBatch(batchId, {
      status:"cancelled",
      cancelled_at:new Date().toISOString(),
      cancelled_by:AppState.user.id,
    });
    await DB.addAudit("CANCEL_IMPORT",batchId,
      "By "+AppState.user.name,"import");
    await App.loadImportBatches();
    rerenderContent();
    toast("تم إلغاء الدفعة","info");
  },

  async retryFailedRows(batchId) {
    const rows = await DB.loadImportRows(batchId,"failed");
    if (!rows.length) { toast("لا توجد صفوف فاشلة","info"); return; }
    const batch = AppState.importBatches.find(b=>b.id===batchId);
    if (!batch) return;

    // Re-open wizard at step 4 with failed rows as validated rows
    AppState.importWizard = {
      step:4,
      file:{name:batch.filename, size:0},
      rawRows:[], validatedRows: rows.map(r=>({
        ...r,
        is_valid:true, is_duplicate:false, validation_errors:[],
      })),
      merchantId:   batch.merchant_id,
      merchantName: batch.merchant_name,
      autoRecipients:batch.auto_create_recipients||false,
      autoAddresses: batch.auto_save_addresses||false,
      progress:{done:0,total:rows.length,failed:0,skipped:0},
      batch: null,
    };
    rerenderContent();
    toast("يمكنك الآن إعادة استيراد الصفوف الفاشلة","info");
  },

  async resumeImportBatch(batchId) {
    const batch = AppState.importBatches.find(b=>b.id===batchId);
    if (!batch) return;
    const rows = await DB.loadImportRows(batchId,"pending");
    AppState.importWizard = {
      step:4,
      file:{name:batch.filename,size:0},
      rawRows:[], validatedRows:rows.map(r=>({...r,is_valid:true,is_duplicate:false})),
      merchantId:batch.merchant_id, merchantName:batch.merchant_name,
      autoRecipients:false, autoAddresses:false,
      progress:{done:0,total:rows.length,failed:0,skipped:0}, batch,
    };
    rerenderContent();
  },

  async downloadErrorReport(batchId, fromWizard) {
    let errorRows = [];
    if (fromWizard && AppState.importWizard) {
      errorRows = (AppState.importWizard.validatedRows||[]).filter(r=>!r.is_valid);
    } else if (batchId) {
      const rows = await DB.loadImportRows(batchId);
      errorRows = rows.filter(r=>r.status==="failed"||!r.is_valid);
    }
    if (!errorRows.length) { toast("لا توجد أخطاء لتحميلها","info"); return; }
    const data = errorRows.map(r=>({
      "الصف":           r.row_number,
      "اسم العميل":     r.customer_name||"",
      "الهاتف":         r.customer_phone||"",
      "المحافظة":       r.governorate||"",
      "المبلغ":         r.amount||"",
      "الأخطاء":        (r.validation_errors||[]).map(e=>e.field+": "+e.message).join(" | "),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb,ws,"أخطاء الاستيراد");
    XLSX.writeFile(wb,"تقرير_أخطاء_الاستيراد.xlsx");
    toast("✅ تم تحميل تقرير الأخطاء");
  },

  async loadMyWallet() {
    const uid = AppState.user.id;
    const [bal, txns] = await Promise.all([
      DB.loadDriverBalance(uid),
      DB.loadDriverTransactions(uid),
    ]);
    AppState.myWalletBalance = bal;
    AppState.myWalletTxns    = txns;
  },

  async refreshMyWallet() {
    await App.loadMyWallet();
    rerenderContent();
    toast("✅ تم تحديث المحفظة");
  },

  setBranchTab(tab) {
    AppState.branchTab = tab;
    rerenderContent();
  },

  async loadBranchData() {
    const [branches, warehouses] = await Promise.all([
      DB.loadBranches(), DB.loadWarehouses()
    ]);
    AppState.branches   = branches;
    AppState.warehouses = warehouses;
    rerenderContent();
  },

  async addBranch() {
    await loadEgyptData();
    const govOpts=Object.keys(EGYPT_GOV).sort().map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join("");
    const managers=AppState.users.filter(u=>(u.role||u.primary_role)==="branch_manager"||(u.role||u.primary_role)==="admin");
    Modals.open(`<div class="modal modal-lg">
      <div class="modal-header"><h3>${icon("map",18)} إضافة فرع</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="field"><label>اسم الفرع *</label><input id="brName" placeholder="فرع المعادي"/></div>
          <div class="field"><label>كود الفرع *</label><input id="brCode" placeholder="CAI-01" style="font-family:monospace;text-transform:uppercase;"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>المحافظة *</label><select id="brGov"><option value="">اختر</option>${govOpts}</select></div>
          <div class="field"><label>المدينة</label><select id="brCity"><option value="">اختر</option></select></div>
        </div>
        <div class="field"><label>العنوان</label><input id="brAddress"/></div>
        <div class="form-row">
          <div class="field"><label>الهاتف</label><input id="brPhone" type="tel"/></div>
          <div class="field"><label>السعة (شحنات نشطة)</label><input id="brCapacity" type="number" min="0"/></div>
        </div>
        <div class="field"><label>مدير الفرع (اختياري)</label>
          <select id="brManager">
            <option value="">-- بدون تحديد --</option>
            ${managers.map(m=>`<option value="${esc(m.id)}" data-name="${esc(m.name)}">${esc(m.name)}</option>`).join("")}
          </select>
        </div>
        <div id="brErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveBrBtn">حفظ الفرع</button>
      </div>
    </div>`);
    $("brGov")?.addEventListener("change",e=>{
      const cities=(EGYPT_GOV[e.target.value]||[]);
      $("brCity").innerHTML=`<option value="">اختر</option>`+cities.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
    });
    $("saveBrBtn")?.addEventListener("click",async()=>{
      const name=$("brName")?.value.trim(),code=$("brCode")?.value.trim().toUpperCase();
      const gov=$("brGov")?.value;
      const errEl=$("brErr");errEl.style.display="none";
      if(!name||!code||!gov){errEl.style.display="block";errEl.textContent="الاسم والكود والمحافظة مطلوبة";return;}
      const btn=$("saveBrBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        const mgrSel=$("brManager");
        const{error}=await db.from("branches").insert([{
          name,code,governorate:gov,city:$("brCity")?.value||"",
          address:$("brAddress")?.value.trim()||null,
          phone:$("brPhone")?.value.trim()||null,
          capacity:$("brCapacity")?.value?Number($("brCapacity").value):null,
          manager_id:mgrSel?.value||null,
          manager_name:mgrSel?.value?(mgrSel.options[mgrSel.selectedIndex]?.dataset.name||""):"",
          created_by:AppState.user.id,
        }]);
        if(error)throw error;
        await DB.addAudit("ADD_BRANCH","",`${name} (${code}) by ${AppState.user.name}`,"setting");
        Modals.close();await App.loadBranchData();
        toast(`✅ تم إضافة فرع ${name}`);
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+(err.message.includes("23505")?"كود الفرع موجود بالفعل":err.message);btn.disabled=false;btn.textContent="حفظ";}
    });
  },

  async editBranch(id){
    const b=AppState.branches.find(x=>x.id===id);if(!b)return;
    const managers=AppState.users.filter(u=>(u.role||u.primary_role)==="branch_manager"||(u.role||u.primary_role)==="admin");
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>✏️ تعديل: ${esc(b.name)}</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="field"><label>اسم الفرع</label><input id="ebrName" value="${esc(b.name)}"/></div>
        <div class="field"><label>الهاتف</label><input id="ebrPhone" value="${esc(b.phone||"")}"/></div>
        <div class="field"><label>الحالة</label>
          <select id="ebrActive">
            <option value="true" ${b.is_active?"selected":""}>نشط</option>
            <option value="false" ${!b.is_active?"selected":""}>غير نشط</option>
          </select></div>
        <div class="field"><label>مدير الفرع</label>
          <select id="ebrManager">
            <option value="">-- بدون تحديد --</option>
            ${managers.map(m=>`<option value="${esc(m.id)}" data-name="${esc(m.name)}" ${b.manager_id===m.id?"selected":""}>${esc(m.name)}</option>`).join("")}
          </select></div>
        <div id="ebrErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveEbrBtn">حفظ</button>
      </div>
    </div>`);
    $("saveEbrBtn")?.addEventListener("click",async()=>{
      const name=$("ebrName")?.value.trim();
      const mgrSel=$("ebrManager");
      const errEl=$("ebrErr");errEl.style.display="none";
      if(!name){errEl.style.display="block";errEl.textContent="الاسم مطلوب";return;}
      const btn=$("saveEbrBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      const{error}=await db.from("branches").update({
        name,phone:$("ebrPhone")?.value.trim()||null,
        is_active:$("ebrActive")?.value==="true",
        manager_id:mgrSel?.value||null,
        manager_name:mgrSel?.value?(mgrSel.options[mgrSel.selectedIndex]?.dataset.name||""):"",
      }).eq("id",id);
      if(error){errEl.style.display="block";errEl.textContent="خطأ: "+error.message;btn.disabled=false;btn.textContent="حفظ";return;}
      Modals.close();await App.loadBranchData();toast(`✅ تم تحديث ${name}`);
    });
  },

  async deleteBranch(id){
    if(!confirm("حذف هذا الفرع؟"))return;
    const{error}=await db.from("branches").update({
      is_deleted:true,deleted_at:new Date().toISOString(),deleted_by:AppState.user.id
    }).eq("id",id);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await DB.addAudit("DELETE_BRANCH",id,`By ${AppState.user.name}`,"setting");
    await App.loadBranchData();toast("تم حذف الفرع","info");
  },

  async viewBranchMetrics(branchId, branchName){
    const today=new Date().toISOString().split("T")[0];
    const monthAgo=new Date();monthAgo.setDate(monthAgo.getDate()-30);
    const startStr=monthAgo.toISOString().split("T")[0];
    const m=await DB.getBranchMetrics(branchId,startStr,today);
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>📊 أداء: ${esc(branchName)}</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div style="font-size:12px;color:var(--gray-500);margin-bottom:14px;">آخر 30 يوم</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div style="background:var(--info-bg);border-radius:var(--radius);padding:16px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:var(--info);">${m.total_received||0}</div>
            <div style="font-size:12px;color:var(--gray-500);margin-top:4px;">وارد</div>
          </div>
          <div style="background:var(--success-bg);border-radius:var(--radius);padding:16px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:var(--success);">${m.total_dispatched||0}</div>
            <div style="font-size:12px;color:var(--gray-500);margin-top:4px;">صادر</div>
          </div>
          <div style="background:var(--warning-bg);border-radius:var(--radius);padding:16px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:var(--warning);">${m.active_shipments||0}</div>
            <div style="font-size:12px;color:var(--gray-500);margin-top:4px;">نشط حالياً</div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إغلاق</button>
      </div>
    </div>`);
  },

  async addWarehouse(){
    await loadEgyptData();
    const govOpts=Object.keys(EGYPT_GOV).sort().map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join("");
    const branches=AppState.branches;
    Modals.open(`<div class="modal modal-lg">
      <div class="modal-header"><h3>${icon("pkg",18)} إضافة مستودع</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="field"><label>اسم المستودع *</label><input id="whName"/></div>
          <div class="field"><label>كود المستودع *</label><input id="whCode" style="font-family:monospace;text-transform:uppercase;"/></div>
        </div>
        <div class="field"><label>الفرع المرتبط (اختياري)</label>
          <select id="whBranch">
            <option value="">-- بدون ربط --</option>
            ${branches.map(b=>`<option value="${esc(b.id)}" data-name="${esc(b.name)}">${esc(b.name)}</option>`).join("")}
          </select></div>
        <div class="form-row">
          <div class="field"><label>المحافظة *</label><select id="whGov"><option value="">اختر</option>${govOpts}</select></div>
          <div class="field"><label>السعة (وحدات تخزين)</label><input id="whCapacity" type="number" min="0"/></div>
        </div>
        <div id="whErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveWhBtn">حفظ</button>
      </div>
    </div>`);
    $("saveWhBtn")?.addEventListener("click",async()=>{
      const name=$("whName")?.value.trim(),code=$("whCode")?.value.trim().toUpperCase();
      const gov=$("whGov")?.value;
      const errEl=$("whErr");errEl.style.display="none";
      if(!name||!code||!gov){errEl.style.display="block";errEl.textContent="الاسم والكود والمحافظة مطلوبة";return;}
      const btn=$("saveWhBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        const brSel=$("whBranch");
        const{error}=await db.from("warehouses").insert([{
          name,code,governorate:gov,
          branch_id:brSel?.value||null,
          branch_name:brSel?.value?(brSel.options[brSel.selectedIndex]?.dataset.name||""):"",
          capacity:$("whCapacity")?.value?Number($("whCapacity").value):null,
          created_by:AppState.user.id,
        }]);
        if(error)throw error;
        Modals.close();await App.loadBranchData();
        toast(`✅ تم إضافة مستودع ${name}`);
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+(err.message.includes("23505")?"كود المستودع موجود بالفعل":err.message);btn.disabled=false;btn.textContent="حفظ";}
    });
  },

  async editWarehouse(id){
    const w=AppState.warehouses.find(x=>x.id===id);if(!w)return;
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>✏️ تعديل: ${esc(w.name)}</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="field"><label>اسم المستودع</label><input id="ewhName" value="${esc(w.name)}"/></div>
        <div class="field"><label>السعة</label><input id="ewhCapacity" type="number" value="${w.capacity||""}"/></div>
        <div id="ewhErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveEwhBtn">حفظ</button>
      </div>
    </div>`);
    $("saveEwhBtn")?.addEventListener("click",async()=>{
      const name=$("ewhName")?.value.trim();
      const errEl=$("ewhErr");errEl.style.display="none";
      if(!name){errEl.style.display="block";errEl.textContent="الاسم مطلوب";return;}
      const btn=$("saveEwhBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      const{error}=await db.from("warehouses").update({
        name,capacity:$("ewhCapacity")?.value?Number($("ewhCapacity").value):null,
      }).eq("id",id);
      if(error){errEl.style.display="block";errEl.textContent="خطأ: "+error.message;btn.disabled=false;btn.textContent="حفظ";return;}
      Modals.close();await App.loadBranchData();toast(`✅ تم تحديث ${name}`);
    });
  },

  async deleteWarehouse(id){
    if(!confirm("حذف هذا المستودع؟"))return;
    const{error}=await db.from("warehouses").update({is_deleted:true,deleted_at:new Date().toISOString()}).eq("id",id);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await App.loadBranchData();toast("تم حذف المستودع","info");
  },

  setPricingTab(tab) {
    AppState.pricingTab = tab;
    rerenderContent();
  },

  async loadPricingData() {
    const [zones, rules] = await Promise.all([
      DB.loadPricingZones(),
      DB.loadPricingRules(null),
    ]);
    AppState.pricingZones = zones;
    AppState.pricingRules = rules;
    rerenderContent();
  },

  async simulateFee() {
    const gov     = $("simGov")?.value;
    const svc     = $("simSvc")?.value || "door_to_door";
    const ord     = $("simOrd")?.value || "standard";
    const weight  = Number($("simWeight")?.value) || 0;
    const merchant= $("simMerchant")?.value || null;
    if (!gov) { toast("اختر المحافظة أولاً","warning"); return; }
    const result = await DB.calculateFee(merchant, gov, svc, ord, weight);
    AppState.lastFeeCalc = result || { delivery_fee: null };
    rerenderContent();
  },

  async addPricingRule() {
    const zones    = AppState.pricingZones;
    const merchants= AppState.allMerchants;
    const SVC = [{v:"",l:"كل الخدمات"},{v:"door_to_door",l:"توصيل للباب"},{v:"drop_off",l:"إيداع"},{v:"pickup",l:"استلام"}];
    const ORD = [{v:"",l:"كل الأنواع"},{v:"standard",l:"عادي"},{v:"express",l:"سريع"},{v:"scheduled",l:"مجدول"}];
    Modals.open(`<div class="modal modal-lg">
      <div class="modal-header"><h3>${icon("chart",18)} إضافة قاعدة تسعير</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-section-label">النطاق (اتركها فارغة للتطبيق على الكل)</div>
        <div class="form-row">
          <div class="field"><label>المنطقة</label>
            <select id="prZone">
              <option value="">كل المناطق</option>
              ${zones.map(z=>`<option value="${esc(z.id)}">${esc(z.name)}</option>`).join("")}
            </select></div>
          <div class="field"><label>التاجر (لسعر خاص)</label>
            <select id="prMerchant">
              <option value="">كل التجار</option>
              ${merchants.map(m=>`<option value="${esc(m.id)}">${esc(m.full_name)}</option>`).join("")}
            </select></div>
        </div>
        <div class="form-row">
          <div class="field"><label>نوع الخدمة</label>
            <select id="prSvc">${SVC.map(s=>`<option value="${s.v}">${s.l}</option>`).join("")}</select></div>
          <div class="field"><label>نوع الطلب</label>
            <select id="prOrd">${ORD.map(o=>`<option value="${o.v}">${o.l}</option>`).join("")}</select></div>
        </div>
        <div class="form-section-label">نطاق الوزن (اتركها فارغة للتطبيق على كل الأوزان)</div>
        <div class="form-row">
          <div class="field"><label>من (كجم)</label><input id="prWFrom" type="number" step="0.1" value="0" min="0"/></div>
          <div class="field"><label>إلى (كجم) — فارغ = بلا حد</label><input id="prWTo" type="number" step="0.1" min="0"/></div>
        </div>
        <div class="form-section-label">التسعير</div>
        <div class="form-row three">
          <div class="field"><label>رسوم أساسية (ج.م) *</label><input id="prBase" type="number" step="0.01" min="0" value="60"/></div>
          <div class="field"><label>لكل كجم إضافي (ج.م)</label><input id="prPerKg" type="number" step="0.01" min="0" value="0"/></div>
          <div class="field"><label>رسوم الإرجاع (ج.م)</label><input id="prReturn" type="number" step="0.01" min="0" value="30"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>رسوم إضافية للسريع (%)</label><input id="prExpress" type="number" step="1" min="0" max="100" value="30" placeholder="30 = 30%"/></div>
          <div class="field"><label>الأولوية (أعلى = يُطبق أولاً)</label><input id="prPriority" type="number" value="10" min="0"/></div>
        </div>
        <div class="field"><label>ملاحظات</label><input id="prNotes"/></div>
        <div id="prErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="savePrBtn">حفظ القاعدة</button>
      </div>
    </div>`);
    $("savePrBtn")?.addEventListener("click", async()=>{
      const base=Number($("prBase")?.value);
      const errEl=$("prErr");errEl.style.display="none";
      if(!base&&base!==0){errEl.style.display="block";errEl.textContent="الرسوم الأساسية مطلوبة";return;}
      const btn=$("savePrBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        const{error}=await db.from("pricing_rules").insert([{
          zone_id:          $("prZone")?.value||null,
          merchant_id:      $("prMerchant")?.value||null,
          service_type:     $("prSvc")?.value||null,
          order_type:       $("prOrd")?.value||null,
          weight_from:      Number($("prWFrom")?.value)||0,
          weight_to:        $("prWTo")?.value?Number($("prWTo").value):null,
          base_fee:         base,
          per_kg_fee:       Number($("prPerKg")?.value)||0,
          return_fee:       Number($("prReturn")?.value)||0,
          express_surcharge:(Number($("prExpress")?.value)||0)/100,
          priority:         Number($("prPriority")?.value)||10,
          notes:            $("prNotes")?.value.trim()||null,
          created_by:       AppState.user.id,
        }]);
        if(error)throw error;
        await DB.addAudit("ADD_PRICING_RULE","",
          `Base:${base} by ${AppState.user.name}`,"setting");
        Modals.close();await App.loadPricingData();
        toast("✅ تم إضافة قاعدة التسعير");
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+err.message;btn.disabled=false;btn.textContent="حفظ";}
    });
  },

  async editPricingRule(id){
    const r = AppState.pricingRules.find(x=>x.id===id);
    if (!r) { toast("القاعدة غير موجودة، جرّب التحديث","error"); return; }
    const zones    = AppState.pricingZones;
    const merchants= AppState.allMerchants;
    const SVC = [{v:"",l:"كل الخدمات"},{v:"door_to_door",l:"توصيل للباب"},{v:"drop_off",l:"إيداع"},{v:"pickup",l:"استلام"}];
    const ORD = [{v:"",l:"كل الأنواع"},{v:"standard",l:"عادي"},{v:"express",l:"سريع"},{v:"scheduled",l:"مجدول"}];
    Modals.open(`<div class="modal modal-lg">
      <div class="modal-header"><h3>${icon("chart",18)} تعديل قاعدة تسعير</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-section-label">النطاق (اتركها فارغة للتطبيق على الكل)</div>
        <div class="form-row">
          <div class="field"><label>المنطقة</label>
            <select id="eprZone">
              <option value="">كل المناطق</option>
              ${zones.map(z=>`<option value="${esc(z.id)}" ${r.zone_id===z.id?"selected":""}>${esc(z.name)}</option>`).join("")}
            </select></div>
          <div class="field"><label>التاجر (لسعر خاص)</label>
            <select id="eprMerchant">
              <option value="">كل التجار</option>
              ${merchants.map(m=>`<option value="${esc(m.id)}" ${r.merchant_id===m.id?"selected":""}>${esc(m.full_name)}</option>`).join("")}
            </select></div>
        </div>
        <div class="form-row">
          <div class="field"><label>نوع الخدمة</label>
            <select id="eprSvc">${SVC.map(s=>`<option value="${s.v}" ${r.service_type===s.v?"selected":""}>${s.l}</option>`).join("")}</select></div>
          <div class="field"><label>نوع الطلب</label>
            <select id="eprOrd">${ORD.map(o=>`<option value="${o.v}" ${r.order_type===o.v?"selected":""}>${o.l}</option>`).join("")}</select></div>
        </div>
        <div class="form-section-label">نطاق الوزن (اتركها فارغة للتطبيق على كل الأوزان)</div>
        <div class="form-row">
          <div class="field"><label>من (كجم)</label><input id="eprWFrom" type="number" step="0.1" value="${r.weight_from||0}" min="0"/></div>
          <div class="field"><label>إلى (كجم) — فارغ = بلا حد</label><input id="eprWTo" type="number" step="0.1" value="${r.weight_to??""}" min="0"/></div>
        </div>
        <div class="form-section-label">التسعير</div>
        <div class="form-row three">
          <div class="field"><label>رسوم أساسية (ج.م) *</label><input id="eprBase" type="number" step="0.01" min="0" value="${r.base_fee}"/></div>
          <div class="field"><label>لكل كجم إضافي (ج.م)</label><input id="eprPerKg" type="number" step="0.01" min="0" value="${r.per_kg_fee||0}"/></div>
          <div class="field"><label>رسوم الإرجاع (ج.م)</label><input id="eprReturn" type="number" step="0.01" min="0" value="${r.return_fee||0}"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>رسوم إضافية للسريع (%)</label><input id="eprExpress" type="number" step="1" min="0" max="100" value="${Math.round((r.express_surcharge||0)*100)}"/></div>
          <div class="field"><label>الأولوية (أعلى = يُطبق أولاً)</label><input id="eprPriority" type="number" value="${r.priority||10}" min="0"/></div>
        </div>
        <div class="field"><label>ملاحظات</label><input id="eprNotes" value="${esc(r.notes||"")}"/></div>
        <div id="eprErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveEprBtn">حفظ التعديلات</button>
      </div>
    </div>`);
    $("saveEprBtn")?.addEventListener("click", async()=>{
      const base=Number($("eprBase")?.value);
      const errEl=$("eprErr");errEl.style.display="none";
      if(!base&&base!==0){errEl.style.display="block";errEl.textContent="الرسوم الأساسية مطلوبة";return;}
      const btn=$("saveEprBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        const{error}=await db.from("pricing_rules").update({
          zone_id:          $("eprZone")?.value||null,
          merchant_id:      $("eprMerchant")?.value||null,
          service_type:     $("eprSvc")?.value||null,
          order_type:       $("eprOrd")?.value||null,
          weight_from:      Number($("eprWFrom")?.value)||0,
          weight_to:        $("eprWTo")?.value?Number($("eprWTo").value):null,
          base_fee:         base,
          per_kg_fee:       Number($("eprPerKg")?.value)||0,
          return_fee:       Number($("eprReturn")?.value)||0,
          express_surcharge:(Number($("eprExpress")?.value)||0)/100,
          priority:         Number($("eprPriority")?.value)||10,
          notes:            $("eprNotes")?.value.trim()||null,
        }).eq("id",id);
        if(error)throw error;
        await DB.addAudit("EDIT_PRICING_RULE",id,
          `Base:${base} by ${AppState.user.name}`,"setting");
        Modals.close();await App.loadPricingData();
        toast("✅ تم تحديث قاعدة التسعير");
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+err.message;btn.disabled=false;btn.textContent="حفظ التعديلات";}
    });
  },

  async deletePricingRule(id){
    if(!confirm("حذف هذه القاعدة؟"))return;
    const{error}=await db.from("pricing_rules").update({is_active:false}).eq("id",id);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await DB.addAudit("DELETE_PRICING_RULE",id,`By ${AppState.user.name}`,"setting");
    await App.loadPricingData();toast("تم الحذف","info");
  },

  async addPricingZone(){
    const govOpts=Object.keys(EGYPT_GOV).sort().map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join("");
    Modals.open(`<div class="modal modal-lg">
      <div class="modal-header"><h3>${icon("map",18)} إضافة منطقة توصيل</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="field"><label>اسم المنطقة *</label><input id="pzName" placeholder="مثال: القاهرة الكبرى"/></div>
          <div class="field"><label>كود المنطقة *</label><input id="pzCode" placeholder="CAIRO" style="font-family:monospace;text-transform:uppercase;"/></div>
        </div>
        <div class="field"><label>المحافظات (اختر كل المحافظات في هذه المنطقة)</label>
          <select id="pzGovs" multiple style="height:160px;padding:8px;border-radius:var(--radius);border:1.5px solid var(--gray-300);width:100%;">
            ${govOpts}
          </select>
          <div style="font-size:11px;color:var(--gray-500);margin-top:4px;">Ctrl+Click لاختيار أكثر من محافظة</div>
        </div>
        <div id="pzErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="savePzBtn">حفظ المنطقة</button>
      </div>
    </div>`);
    $("savePzBtn")?.addEventListener("click",async()=>{
      const name=$("pzName")?.value.trim(),code=$("pzCode")?.value.trim().toUpperCase();
      const govs=Array.from($("pzGovs")?.selectedOptions||[]).map(o=>o.value);
      const errEl=$("pzErr");errEl.style.display="none";
      if(!name||!code||!govs.length){errEl.style.display="block";errEl.textContent="الاسم والكود والمحافظات مطلوبة";return;}
      const btn=$("savePzBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        const{error}=await db.from("pricing_zones").insert([{name,code,governorates:govs}]);
        if(error)throw error;
        Modals.close();await App.loadPricingData();
        toast(`✅ تم إضافة منطقة ${name}`);
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+err.message;btn.disabled=false;btn.textContent="حفظ";}
    });
  },

  async editPricingZone(id){
    const z=AppState.pricingZones.find(x=>x.id===id);if(!z)return;
    const govOpts=Object.keys(EGYPT_GOV).sort().map(g=>
      `<option value="${esc(g)}" ${(z.governorates||[]).includes(g)?"selected":""}>${esc(g)}</option>`).join("");
    Modals.open(`<div class="modal modal-lg">
      <div class="modal-header"><h3>${icon("map",18)} تعديل منطقة: ${esc(z.name)}</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="field"><label>اسم المنطقة *</label><input id="pzName2" value="${esc(z.name)}"/></div>
          <div class="field"><label>كود المنطقة</label><input id="pzCode2" value="${esc(z.code)}" disabled style="font-family:monospace;opacity:.6;"/></div>
        </div>
        <div class="field"><label>المحافظات</label>
          <select id="pzGovs2" multiple style="height:160px;padding:8px;border-radius:var(--radius);border:1.5px solid var(--gray-300);width:100%;">
            ${govOpts}
          </select>
        </div>
        <div id="pzErr2" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="savePz2Btn">حفظ التعديلات</button>
      </div>
    </div>`);
    $("savePz2Btn")?.addEventListener("click",async()=>{
      const name=$("pzName2")?.value.trim();
      const govs=Array.from($("pzGovs2")?.selectedOptions||[]).map(o=>o.value);
      const errEl=$("pzErr2");errEl.style.display="none";
      if(!name||!govs.length){errEl.style.display="block";errEl.textContent="الاسم والمحافظات مطلوبة";return;}
      const btn=$("savePz2Btn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      const{error}=await db.from("pricing_zones").update({name,governorates:govs}).eq("id",id);
      if(error){errEl.style.display="block";errEl.textContent="خطأ: "+error.message;btn.disabled=false;btn.textContent="حفظ";return;}
      Modals.close();await App.loadPricingData();toast(`✅ تم تحديث ${name}`);
    });
  },
  setServiceFilter(f){ AppState.serviceFilter = f; rerenderContent(); },
  setOrderFilter(f)  { AppState.orderFilter   = f; rerenderContent(); },

  // ── Phase 2B: Finance ────────────────────────────────────
  // ── Phase 9: Reports & Analytics ─────────────────────────────
  // ── SMS Provider ─────────────────────────────────────────────
  openSmsSettings() {
    const cfg      = SMS_CONFIG;
    const provider = cfg.provider || "stub";
    const PROVIDERS = [
      {v:"stub",         l:"🔧 وضع الاختبار (console.log فقط)"},
      {v:"twilio",       l:"📱 Twilio"},
      {v:"vonage",       l:"📱 Vonage (Nexmo)"},
      {v:"http_gateway", l:"📱 HTTP Gateway (ConnectMisr / Unifonic / أخرى)"},
    ];

    Modals.open(`<div class="modal modal-lg">
      <div class="modal-header">
        <h3>📱 إعدادات مزود SMS</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label style="font-weight:600;display:block;margin-bottom:8px;">المزود النشط</label>
          <select id="smsProviderSel" style="width:100%;padding:10px;border-radius:var(--radius);border:1.5px solid var(--gray-300);"
            onchange="App._toggleSmsProviderFields(this.value)">
            ${PROVIDERS.map(p=>`<option value="${p.v}" ${provider===p.v?"selected":""}>${p.l}</option>`).join("")}
          </select>
        </div>

        <div id="smsTwilioFields" style="display:${provider==="twilio"?"block":"none"}">
          <div style="background:var(--info-bg,#eff6ff);border-radius:var(--radius);padding:12px;margin-bottom:12px;font-size:12px;">
            احصل على Account SID و Auth Token من <a href="https://console.twilio.com" target="_blank" style="color:var(--brand);">console.twilio.com</a>
          </div>
          <div class="form-row">
            <div class="field"><label>Account SID</label><input id="smsTwilioSid" placeholder="ACxxxxxxx" value="${cfg.twilio?.accountSid||""}"/></div>
            <div class="field"><label>Auth Token</label><input id="smsTwilioToken" type="password" placeholder="••••••••" value="${cfg.twilio?.authToken||""}"/></div>
          </div>
          <div class="field"><label>رقم Twilio (E.164)</label><input id="smsTwilioFrom" placeholder="+1234567890" value="${cfg.twilio?.fromNumber||""}"/></div>
        </div>

        <div id="smsVonageFields" style="display:${provider==="vonage"?"block":"none"}">
          <div style="background:var(--info-bg,#eff6ff);border-radius:var(--radius);padding:12px;margin-bottom:12px;font-size:12px;">
            احصل على API Key و Secret من <a href="https://dashboard.nexmo.com" target="_blank" style="color:var(--brand);">dashboard.nexmo.com</a>
          </div>
          <div class="form-row">
            <div class="field"><label>API Key</label><input id="smsVonageKey" placeholder="xxxxxxxx" value="${cfg.vonage?.apiKey||""}"/></div>
            <div class="field"><label>API Secret</label><input id="smsVonageSecret" type="password" placeholder="••••••••" value="${cfg.vonage?.apiSecret||""}"/></div>
          </div>
          <div class="field"><label>اسم المرسل (max 11 حرف)</label><input id="smsVonageFrom" placeholder="AlNukhba" maxlength="11" value="${cfg.vonage?.fromName||"AlNukhba"}"/></div>
        </div>

        <div id="smsGatewayFields" style="display:${provider==="http_gateway"?"block":"none"}">
          <div class="field"><label>رابط API الخاص بالمزود</label><input id="smsGwEndpoint" placeholder="https://api.yourprovider.com/send" value="${cfg.http_gateway?.endpoint||""}"/></div>
          <div class="form-row">
            <div class="field"><label>اسم المستخدم</label><input id="smsGwUser" value="${cfg.http_gateway?.params?.username||""}"/></div>
            <div class="field"><label>كلمة المرور</label><input id="smsGwPass" type="password" value="${cfg.http_gateway?.params?.password||""}"/></div>
          </div>
          <div class="field"><label>Sender ID</label><input id="smsGwFrom" placeholder="AlNukhba" value="${cfg.http_gateway?.params?.from||"AlNukhba"}"/></div>
        </div>

        <div style="border-top:1px solid var(--gray-200);padding-top:16px;margin-top:16px;">
          <div class="field">
            <label style="font-weight:600;">اختبار الإرسال</label>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <input id="smsTestPhone" placeholder="01012345678" style="flex:1;padding:8px;border-radius:var(--radius);border:1.5px solid var(--gray-300);"/>
              <button class="btn btn-secondary" onclick="App.testSMS()">📤 إرسال اختباري</button>
            </div>
          </div>
          <div id="smsTestResult" style="display:none;margin-top:8px;padding:10px;border-radius:var(--radius);font-size:13px;"></div>
        </div>

        <div style="background:var(--warning-bg);border:1px solid var(--warning-border);border-radius:var(--radius);padding:12px;margin-top:12px;font-size:12px;">
          ⚠️ <b>ملاحظة أمنية:</b> يتم حفظ الإعدادات في ذاكرة المتصفح فقط (لا يتم تخزينها في Supabase).
          للاستخدام الدائم، ضع الإعدادات في <code>SMS_CONFIG</code> في أول ملف <code>app.js</code>.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إغلاق</button>
        <button class="btn btn-primary" onclick="App.saveSmsSettings()">💾 تطبيق الإعدادات</button>
      </div>
    </div>`);
  },

  _toggleSmsProviderFields(provider) {
    ["smsTwilioFields","smsVonageFields","smsGatewayFields"]
      .forEach(id=>{ const el=$(id); if(el) el.style.display="none"; });
    const map = {twilio:"smsTwilioFields",vonage:"smsVonageFields",http_gateway:"smsGatewayFields"};
    if (map[provider]) { const el=$(map[provider]); if(el) el.style.display="block"; }
  },

  saveSmsSettings() {
    const provider = $("smsProviderSel")?.value || "stub";
    SMS_CONFIG.provider = provider;

    if (provider === "twilio") {
      SMS_CONFIG.twilio.accountSid  = $("smsTwilioSid")?.value  || SMS_CONFIG.twilio.accountSid;
      SMS_CONFIG.twilio.authToken   = $("smsTwilioToken")?.value || SMS_CONFIG.twilio.authToken;
      SMS_CONFIG.twilio.fromNumber  = $("smsTwilioFrom")?.value  || SMS_CONFIG.twilio.fromNumber;
    }
    if (provider === "vonage") {
      SMS_CONFIG.vonage.apiKey    = $("smsVonageKey")?.value    || SMS_CONFIG.vonage.apiKey;
      SMS_CONFIG.vonage.apiSecret = $("smsVonageSecret")?.value || SMS_CONFIG.vonage.apiSecret;
      SMS_CONFIG.vonage.fromName  = $("smsVonageFrom")?.value   || SMS_CONFIG.vonage.fromName;
    }
    if (provider === "http_gateway") {
      SMS_CONFIG.http_gateway.endpoint        = $("smsGwEndpoint")?.value || SMS_CONFIG.http_gateway.endpoint;
      SMS_CONFIG.http_gateway.params.username = $("smsGwUser")?.value     || SMS_CONFIG.http_gateway.params.username;
      SMS_CONFIG.http_gateway.params.password = $("smsGwPass")?.value     || SMS_CONFIG.http_gateway.params.password;
      SMS_CONFIG.http_gateway.params.from     = $("smsGwFrom")?.value     || SMS_CONFIG.http_gateway.params.from;
    }

    const PROVIDER_LABEL = {stub:"وضع الاختبار",twilio:"Twilio",vonage:"Vonage",http_gateway:"HTTP Gateway"};
    toast(`✅ تم تطبيق إعدادات SMS — المزود: ${PROVIDER_LABEL[provider]||provider}`);
    Modals.close();
    DB.addAudit("SMS_PROVIDER_CHANGED","",`Provider set to: ${provider} by ${AppState.user.name}`,"setting");
  },

  async testSMS() {
    const phone    = $("smsTestPhone")?.value?.trim();
    const resultEl = $("smsTestResult");
    if (!phone) { toast("أدخل رقم هاتف للاختبار","warning"); return; }

    if (resultEl) {
      resultEl.style.display = "block";
      resultEl.style.background = "var(--gray-100)";
      resultEl.textContent = "⏳ جاري الإرسال...";
    }

    try {
      const result = await DB.sendSMS(phone, "النخبة للشحن السريع: هذه رسالة اختبار. SMS يعمل بنجاح ✅");
      if (resultEl) {
        resultEl.style.background = "var(--success-bg)";
        resultEl.innerHTML = `✅ تم الإرسال بنجاح عبر <b>${result.provider}</b> إلى ${result.to}`;
      }
      await DB.addAudit("SMS_TEST","",`Test SMS sent to ${phone} via ${result.provider} by ${AppState.user.name}`,"setting");
    } catch(err) {
      if (resultEl) {
        resultEl.style.background = "var(--danger-bg)";
        resultEl.innerHTML = `❌ فشل الإرسال: ${esc(err.message)}`;
      }
    }
  },

  // ── Phase 4: Live Operations ──────────────────────────────────
  resetRtCounter() {
    AppState.rtEventCount = 0;
    rerenderContent();
  },

  clearActivityFeed() {
    AppState.liveActivityFeed = [];
    rerenderContent();
  },

  setReportsTab(tab) {
    AppState.reportsTab = tab;
    rerenderContent();
  },

  setReportRange(range) {
    AppState.reportRange = range;
    rerenderContent();
  },

  exportReportExcel() {
    const range   = AppState.reportRange||"month";
    const list    = filterByRange(AppState.shipments, range, "createdAt");
    const RANGE_LABEL = {today:"اليوم",week:"7_أيام",month:"هذا_الشهر",quarter:"3_أشهر",year:"هذا_العام"};

    const data = list.map(s=>({
      "كود الشحنة":       s.id,
      "اسم العميل":       s.customerName,
      "الهاتف":           s.customerPhone,
      "المحافظة":         s.governorate,
      "الحالة":           STATUS_MAP[s.status]?.label||s.status,
      "نوع الخدمة":       SERVICE_MAP[s.serviceType]?.label||s.serviceType||"—",
      "نوع الطلب":        ORDER_TYPE_MAP[s.orderType]?.label||s.orderType||"—",
      "مبلغ COD":         s.amount||0,
      "رسوم الشحن":       s.deliveryFee||0,
      "رسوم الإرجاع":    s.returnFee||0,
      "الوزن (كجم)":     s.weight||"",
      "التاجر":           s.merchantName||"—",
      "المندوب":          s.courierName||"—",
      "تاريخ الإنشاء":   fmtDate(s.createdAt),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "التقرير");
    XLSX.writeFile(wb, `تقرير_النخبة_${RANGE_LABEL[range]||range}.xlsx`);
    DB.addAudit("EXPORT_REPORT","",`Range:${range} Rows:${data.length} By:${AppState.user.name}`,"export");
    toast(`✅ تم تصدير ${data.length} شحنة`);
  },

  exportReportPDF() {
    const range   = AppState.reportRange||"month";
    const list    = filterByRange(AppState.shipments, range, "createdAt");
    const delivered = list.filter(s=>s.status==="delivered");
    const returned  = list.filter(s=>s.status==="returned");
    const cod       = delivered.reduce((a,s)=>a+(s.amount||0),0);
    const fees      = delivered.reduce((a,s)=>a+(s.deliveryFee||0),0);
    const retFees   = returned.reduce((a,s)=>a+(s.returnFee||0),0);
    const RANGE_LABEL = {today:"اليوم",week:"آخر 7 أيام",month:"هذا الشهر",quarter:"آخر 3 أشهر",year:"هذا العام"};

    // Generate PDF using jsPDF
    if (typeof jsPDF === "undefined" && typeof window.jsPDF === "undefined") {
      toast("مكتبة PDF غير محملة — يرجى تصدير Excel بدلاً","warning");
      return;
    }
    const jsPDFLib = window.jsPDF || jsPDF;
    const doc = new jsPDFLib({ orientation:"portrait", unit:"mm", format:"a4" });

    // RTL header
    doc.setFont("helvetica","bold");
    doc.setFontSize(18);
    doc.text("Al-Nukhba Express", 105, 20, {align:"center"});
    doc.setFontSize(12);
    doc.setFont("helvetica","normal");
    doc.text("Shipment Report — "+( RANGE_LABEL[range]||range), 105, 28, {align:"center"});
    doc.text("Generated: "+new Date().toLocaleDateString("en"), 105, 34, {align:"center"});

    // Summary table
    doc.setFontSize(10);
    let y = 45;
    const rows = [
      ["Total Shipments", list.length],
      ["Delivered", delivered.length],
      ["Returned", returned.length],
      ["Pending", list.length-delivered.length-returned.length],
      ["Delivery Rate", Math.round(delivered.length/(list.length||1)*100)+"%"],
      ["Return Rate",   Math.round(returned.length/(list.length||1)*100)+"%"],
      ["Total COD Collected", money(cod)+" EGP"],
      ["Delivery Fees Revenue", money(fees)+" EGP"],
      ["Return Fees Revenue", money(retFees)+" EGP"],
      ["Net Revenue", money(fees+retFees)+" EGP"],
      ["Net COD Payable to Merchants", money(cod-fees-retFees)+" EGP"],
    ];

    rows.forEach(([label, value])=>{
      doc.setFont("helvetica","bold"); doc.text(label+":", 20, y);
      doc.setFont("helvetica","normal"); doc.text(String(value), 100, y);
      y+=7;
    });

    // Courier breakdown
    y += 5;
    doc.setFont("helvetica","bold"); doc.setFontSize(11);
    doc.text("Courier Performance", 20, y); y+=6;
    doc.setFontSize(9); doc.setFont("helvetica","normal");
    const cm={};
    list.forEach(s=>{
      if(!s.courierId) return;
      if(!cm[s.courierId])cm[s.courierId]={name:s.courierName||"—",total:0,delivered:0};
      cm[s.courierId].total++;
      if(s.status==="delivered") cm[s.courierId].delivered++;
    });
    Object.values(cm).sort((a,b)=>b.delivered-a.delivered).forEach(c=>{
      doc.text(`${c.name}: ${c.delivered}/${c.total} (${Math.round(c.delivered/c.total*100)}%)`, 25, y);
      y+=5; if(y>270){doc.addPage();y=20;}
    });

    doc.save(`report_${range}_${Date.now()}.pdf`);
    DB.addAudit("EXPORT_REPORT_PDF","",`Range:${range} By:${AppState.user.name}`,"export");
    toast("✅ تم تصدير التقرير PDF");
  },

  exportCourierReport() {
    const range = AppState.reportRange||"month";
    const list  = filterByRange(AppState.shipments, range, "createdAt");
    const cm={};
    list.forEach(s=>{
      if(!s.courierId)return;
      const k=s.courierId;
      if(!cm[k])cm[k]={name:s.courierName||"—",total:0,delivered:0,returned:0,cod:0,fees:0};
      cm[k].total++;
      if(s.status==="delivered"){cm[k].delivered++;cm[k].cod+=s.amount||0;cm[k].fees+=s.deliveryFee||0;}
      if(s.status==="returned") cm[k].returned++;
    });
    const data = Object.values(cm).sort((a,b)=>b.delivered-a.delivered).map((c,i)=>({
      "#":                i+1,
      "المندوب":          c.name,
      "إجمالي":           c.total,
      "تسليم":            c.delivered,
      "إرجاع":            c.returned,
      "معدل التسليم":     Math.round(c.delivered/(c.total||1)*100)+"%",
      "COD محصل":         c.cod,
      "رسوم مكتسبة":      c.fees,
    }));
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb,ws,"أداء المناديب");
    XLSX.writeFile(wb,`تقرير_المناديب_${range}.xlsx`);
    toast(`✅ تم تصدير تقرير ${data.length} مندوب`);
  },

  exportMerchantReport() {
    const range = AppState.reportRange||"month";
    const list  = filterByRange(AppState.shipments, range, "createdAt");
    const mm={};
    list.forEach(s=>{
      if(!s.merchantId)return;
      const k=s.merchantId;
      if(!mm[k])mm[k]={name:s.merchantName||"—",total:0,delivered:0,returned:0,cod:0,fees:0,retFees:0};
      mm[k].total++;
      if(s.status==="delivered"){mm[k].delivered++;mm[k].cod+=s.amount||0;mm[k].fees+=s.deliveryFee||0;}
      if(s.status==="returned") {mm[k].returned++;mm[k].retFees+=s.returnFee||0;}
    });
    const data = Object.values(mm).sort((a,b)=>b.total-a.total).map((m,i)=>({
      "#":             i+1,
      "التاجر":        m.name,
      "إجمالي":        m.total,
      "تسليم":         m.delivered,
      "إرجاع":         m.returned,
      "معدل التسليم":  Math.round(m.delivered/(m.total||1)*100)+"%",
      "COD":           m.cod,
      "الرسوم":        m.fees+m.retFees,
      "صافي للتاجر":   m.cod-m.fees-m.retFees,
    }));
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb,ws,"أداء التجار");
    XLSX.writeFile(wb,`تقرير_التجار_${range}.xlsx`);
    toast(`✅ تم تصدير تقرير ${data.length} تاجر`);
  },

  setFinanceTab(tab) {
    AppState.financeTab = tab;
    rerenderContent();
    // Lazy-load tab data
    setTimeout(() => App._loadFinanceTabData(tab), 50);
  },

  async _loadFinanceTabData(tab) {
    if (tab === "cod") {
      const data = await DB.loadCodReconciliation();
      const el = $("codReconContent"); if (!el) return;
      const STATUS = {
        pending:  {label:"بانتظار المطابقة",badge:"badge-warning"},
        submitted:{label:"تم التسليم",     badge:"badge-brand"},
        verified: {label:"تم التحقق",      badge:"badge-success"},
        flagged:  {label:"يحتاج مراجعة",  badge:"badge-danger"},
      };
      el.innerHTML = !data.length
        ? `<div class="empty"><div class="empty-icon">📋</div><h3>لا توجد سجلات مطابقة</h3></div>`
        : `<div class="table-wrap"><table>
            <thead><tr><th>المندوب</th><th>التاريخ</th><th>المحصل</th><th>المسلم</th><th>الفرق</th><th>الشحنات</th><th>الحالة</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${data.map(r=>`<tr>
                <td class="td-primary">${esc(AppState.users.find(u=>u.id===r.driver_id)?.name||"—")}</td>
                <td style="font-size:12px;">${fmtDate(r.reconcile_date)}</td>
                <td style="font-weight:600;color:var(--success);">${money(r.cod_collected)}</td>
                <td style="font-weight:600;">${money(r.cod_submitted)}</td>
                <td style="font-weight:700;color:${r.cod_difference>0?"var(--danger)":"var(--success)"};">${r.cod_difference>0?"+":""}${money(r.cod_difference)}</td>
                <td>${r.shipment_count}</td>
                <td><span class="badge ${STATUS[r.status]?.badge||"badge-gray"}">${STATUS[r.status]?.label||r.status}</span></td>
                <td>
                  ${r.status==="pending"?`<button class="btn btn-primary btn-sm" onclick="App.verifyCodRecon('${esc(r.id)}')">✅ تحقق</button>`:"—"}
                  ${r.cod_difference>0&&r.status!=="verified"?`<button class="btn btn-secondary btn-sm" style="color:var(--danger);" onclick="App.flagCodRecon('${esc(r.id)}')">⚠️ إشارة</button>`:""}
                </td>
              </tr>`).join("")}
            </tbody>
          </table></div>`;
    }

    if (tab === "settlements") {
      const f    = AppState.settleFilter||"";
      const data = await DB.loadAdminSettlements(null);
      const filtered = f ? data.filter(s=>s.status===f) : data;
      const el   = $("settleContent"); if (!el) return;
      const SETT = {
        pending: {label:"بانتظار",badge:"badge-warning"},
        approved:{label:"موافق", badge:"badge-brand"},
        paid:    {label:"مدفوع", badge:"badge-success"},
        rejected:{label:"مرفوض",badge:"badge-danger"},
      };
      const pending = data.filter(s=>s.status==="pending");
      el.innerHTML = `
        ${pending.length?`<div style="background:var(--warning-bg);border:1px solid var(--warning-border);border-radius:var(--radius);padding:12px 16px;margin-bottom:14px;">
          ⚠️ يوجد <b>${pending.length}</b> طلب تسوية بانتظار الموافقة
        </div>`:""}
        ${!filtered.length?`<div class="empty"><div class="empty-icon">💰</div><h3>لا توجد طلبات</h3></div>`
          :`<div class="table-wrap"><table>
            <thead><tr><th>التاريخ</th><th>التاجر</th><th>المبلغ</th><th>الحالة</th><th>المرجع</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${filtered.map(s=>`<tr>
                <td style="font-size:11px;color:var(--gray-400);">${fmtDate(s.created_at)}</td>
                <td class="td-primary">${esc(AppState.allMerchants.find(m=>m.id===s.merchant_id)?.full_name||"—")}</td>
                <td style="font-weight:700;font-size:15px;">${money(s.amount)}</td>
                <td><span class="badge ${SETT[s.status]?.badge||"badge-gray"}">${SETT[s.status]?.label||s.status}</span></td>
                <td class="td-mono" style="font-size:11px;">${esc(s.payment_ref||"—")}</td>
                <td>
                  ${s.status==="pending"?`
                    <div style="display:flex;gap:6px;">
                      <button class="btn btn-primary btn-sm" onclick="App.approveSettlement('${esc(s.id)}','${esc(s.merchant_id)}')">✅ موافقة</button>
                      <button class="btn btn-secondary btn-sm" style="color:var(--danger);" onclick="App.rejectSettlement('${esc(s.id)}','${esc(s.merchant_id)}')">رفض</button>
                    </div>`
                  :s.status==="approved"?`<button class="btn btn-primary btn-sm" onclick="App.markSettlementPaid('${esc(s.id)}','${esc(s.merchant_id)}')">💰 صرف</button>`
                  :"—"}
                </td>
              </tr>`).join("")}
            </tbody>
          </table></div>`}`;
    }

    if (tab === "invoices") {
      const data = await DB.loadInvoices(null);
      const el   = $("invoiceContent"); if (!el) return;
      const INV = {draft:{label:"مسودة",badge:"badge-gray"},sent:{label:"مرسلة",badge:"badge-info"},
                   paid:{label:"مدفوعة",badge:"badge-success"},cancelled:{label:"ملغية",badge:"badge-danger"}};
      el.innerHTML = !data.length
        ? `<div class="empty"><div class="empty-icon">📄</div><h3>لا توجد فواتير</h3></div>`
        : `<div class="table-wrap"><table>
            <thead><tr><th>رقم الفاتورة</th><th>التاجر</th><th>الفترة</th><th>الشحنات</th><th>المبلغ الصافي</th><th>الحالة</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${data.map(inv=>`<tr>
                <td class="td-mono">${esc(inv.invoice_number)}</td>
                <td class="td-primary">${esc(AppState.allMerchants.find(m=>m.id===inv.merchant_id)?.full_name||"—")}</td>
                <td style="font-size:12px;">${fmtDate(inv.period_start)} → ${fmtDate(inv.period_end)}</td>
                <td>${inv.shipment_count}</td>
                <td style="font-weight:700;">${money(inv.net_payable)}</td>
                <td><span class="badge ${INV[inv.status]?.badge||"badge-gray"}">${INV[inv.status]?.label||inv.status}</span></td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="App.exportInvoiceExcel('${esc(inv.id)}')">📊</button>
                  ${inv.status==="draft"?`<button class="btn btn-primary btn-sm" onclick="App.markInvoicePaid('${esc(inv.id)}')">💰 مدفوعة</button>`:""}
                </td>
              </tr>`).join("")}
            </tbody>
          </table></div>`;
    }

    if (tab === "expenses") {
      const cat  = AppState.expenseCategory||"";
      const data = await DB.loadExpenses(cat||null);
      const el   = $("expenseContent"); if (!el) return;
      const total = data.reduce((a,e)=>a+(e.amount||0),0);
      const CAT   = {driver:"مندوب",branch:"فرع",office:"مكتب",fuel:"وقود",maintenance:"صيانة",other:"أخرى"};
      el.innerHTML = `
        <div style="background:var(--danger-bg);border:1px solid var(--danger-border);border-radius:var(--radius);padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;">
          <span style="font-size:13px;font-weight:600;color:var(--danger);">إجمالي المصروفات${cat?" ("+CAT[cat]+")":""}</span>
          <span style="font-size:18px;font-weight:800;color:var(--danger);">${money(total)}</span>
        </div>
        ${!data.length?`<div class="empty"><div class="empty-icon">💸</div><h3>لا توجد مصروفات</h3></div>`
          :`<div class="table-wrap"><table>
            <thead><tr><th>التاريخ</th><th>الفئة</th><th>المبلغ</th><th>الوصف</th><th>المرجع</th></tr></thead>
            <tbody>
              ${data.map(e=>`<tr>
                <td style="font-size:12px;">${fmtDate(e.expense_date)}</td>
                <td><span class="badge badge-gray" style="font-size:11px;">${CAT[e.category]||e.category}</span></td>
                <td style="font-weight:700;color:var(--danger);">${money(e.amount)}</td>
                <td style="font-size:12px;">${esc(e.description)}</td>
                <td style="font-size:12px;color:var(--gray-500);">${esc(e.reference_name||"—")}</td>
              </tr>`).join("")}
            </tbody>
          </table></div>`}`;
    }
  },

  setSettleFilter(f) {
    AppState.settleFilter = f;
    App._loadFinanceTabData("settlements");
  },

  setExpenseCategory(c) {
    AppState.expenseCategory = c;
    App._loadFinanceTabData("expenses");
  },

  // ── Driver wallet ─────────────────────────────────────────
  async viewDriverWallet(driverId, driverName) {
    const [txns, bal] = await Promise.all([
      DB.loadDriverTransactions(driverId),
      DB.loadDriverBalance(driverId),
    ]);
    const TYPE_LABELS = {
      delivery_fee:"رسوم تسليم", cod_collected:"تحصيل COD",
      cod_submitted:"تسليم COD", bonus:"مكافأة",
      deduction:"خصم",          advance:"سلفة",
      settlement:"تسوية",
    };
    Modals.open(`<div class="modal modal-lg">
      <div class="modal-header">
        <h3>${icon("wallet",18)} محفظة: ${esc(driverName)}</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button>
      </div>
      <div class="modal-body">
        <div style="background:linear-gradient(135deg,var(--brand-dark),var(--brand));border-radius:var(--radius-lg);
          padding:20px;color:#fff;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:12px;opacity:.75;margin-bottom:4px;">الرصيد الحالي</div>
            <div style="font-size:28px;font-weight:800;">${money(bal)}</div>
          </div>
          <button class="btn btn-secondary btn-sm"
            style="background:rgba(255,255,255,.15);color:#fff;border-color:rgba(255,255,255,.3);"
            onclick="App.addDriverWalletEntry('${esc(driverId)}','${esc(driverName)}')">
            + إضافة حركة
          </button>
        </div>
        ${!txns.length?`<div class="empty"><div class="empty-icon">📋</div><h3>لا توجد حركات</h3></div>`
          :`<div class="table-wrap"><table>
            <thead><tr><th>التاريخ</th><th>النوع</th><th>الشحنة</th><th>المبلغ</th><th>الرصيد</th></tr></thead>
            <tbody>
              ${txns.map(t=>`<tr>
                <td style="font-size:11px;color:var(--gray-400);">${fmtTime(t.created_at)}</td>
                <td><span class="badge ${t.amount>0?"badge-success":"badge-danger"}">${TYPE_LABELS[t.type]||t.type}</span></td>
                <td class="td-mono" style="font-size:11px;">${t.shipment_code||"—"}</td>
                <td style="font-weight:700;color:${t.amount>0?"var(--success)":"var(--danger)"};">${t.amount>0?"+":""}${money(t.amount)}</td>
                <td style="font-weight:600;">${money(t.balance_after)}</td>
              </tr>`).join("")}
            </tbody>
          </table></div>`}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إغلاق</button>
      </div>
    </div>`);
  },

  async addDriverWalletEntry(driverId, driverName) {
    const TYPE_LABELS={delivery_fee:"رسوم تسليم",cod_collected:"تحصيل COD",
      cod_submitted:"تسليم COD",bonus:"مكافأة",deduction:"خصم",settlement:"تسوية"};
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>+ حركة محفظة: ${esc(driverName)}</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="field"><label>النوع *</label>
          <select id="dtType">
            ${Object.entries(TYPE_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}
          </select></div>
        <div class="form-row">
          <div class="field"><label>المبلغ * (موجب/سالب)</label><input id="dtAmount" type="number" step="0.01"/></div>
          <div class="field"><label>كود الشحنة (اختياري)</label><input id="dtCode"/></div>
        </div>
        <div class="field"><label>الوصف</label><input id="dtDesc"/></div>
        <div id="dtErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveDtBtn">حفظ</button>
      </div>
    </div>`);
    $("saveDtBtn")?.addEventListener("click", async()=>{
      const type=$("dtType")?.value,amount=Number($("dtAmount")?.value);
      const errEl=$("dtErr");errEl.style.display="none";
      if(!amount){errEl.style.display="block";errEl.textContent="المبلغ مطلوب";return;}
      const btn=$("saveDtBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        const bal=await DB.loadDriverBalance(driverId);
        const{error}=await db.from("driver_transactions").insert([{
          driver_id:driverId,type,amount,
          balance_after:bal+amount,
          description:$("dtDesc")?.value.trim()||null,
          shipment_code:$("dtCode")?.value.trim()||null,
          created_by:AppState.user.id,
        }]);
        if(error)throw error;
        await DB.addAudit("DRIVER_WALLET_ENTRY",driverId,
          `Type:${type} Amount:${amount} By:${AppState.user.name}`,"shipment");
        Modals.close();
        toast(`✅ تم إضافة ${amount>0?"+":""}${money(amount)} لمحفظة ${driverName}`);
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+err.message;btn.disabled=false;btn.textContent="حفظ";}
    });
  },

  async addDriverTransaction() {
    const couriers=AppState.users.filter(u=>(u.role||u.primary_role)==="courier");
    if(!couriers.length){toast("لا يوجد مناديب","warning");return;}
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>+ حركة مندوب</h3><button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="field"><label>المندوب *</label>
          <select id="dtDriver">
            ${couriers.map(c=>`<option value="${esc(c.id)}" data-name="${esc(c.name)}">${esc(c.name)}</option>`).join("")}
          </select></div>
        <div class="field"><label>النوع</label>
          <select id="dtType2">
            <option value="delivery_fee">رسوم تسليم</option>
            <option value="bonus">مكافأة</option>
            <option value="deduction">خصم</option>
            <option value="settlement">تسوية</option>
          </select></div>
        <div class="form-row">
          <div class="field"><label>المبلغ *</label><input id="dtAmount2" type="number" step="0.01"/></div>
          <div class="field"><label>الوصف</label><input id="dtDesc2"/></div>
        </div>
        <div id="dtErr2" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveDt2Btn">حفظ</button>
      </div>
    </div>`);
    $("saveDt2Btn")?.addEventListener("click", async()=>{
      const sel=$("dtDriver"),driverId=sel?.value,driverName=sel?.options[sel.selectedIndex]?.dataset.name||"";
      const type=$("dtType2")?.value,amount=Number($("dtAmount2")?.value);
      const errEl=$("dtErr2");errEl.style.display="none";
      if(!driverId||!amount){errEl.style.display="block";errEl.textContent="جميع الحقول مطلوبة";return;}
      const btn=$("saveDt2Btn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        const bal=await DB.loadDriverBalance(driverId);
        const{error}=await db.from("driver_transactions").insert([{
          driver_id:driverId,type,amount,balance_after:bal+amount,
          description:$("dtDesc2")?.value.trim()||null,created_by:AppState.user.id,
        }]);
        if(error)throw error;
        Modals.close();toast(`✅ تم تسجيل الحركة لـ ${driverName}`);
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+err.message;btn.disabled=false;btn.textContent="حفظ";}
    });
  },

  // ── COD Reconciliation ────────────────────────────────────
  async newCodReconciliation() {
    const couriers=AppState.users.filter(u=>(u.role||u.primary_role)==="courier");
    const today=new Date().toISOString().split("T")[0];
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>📋 مطابقة COD</h3><button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="field"><label>المندوب *</label>
            <select id="crDriver">
              ${couriers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}
            </select></div>
          <div class="field"><label>التاريخ</label><input id="crDate" type="date" value="${today}"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>إجمالي المحصل</label><input id="crCollected" type="number" step="0.01" min="0"/></div>
          <div class="field"><label>إجمالي المسلم للشركة</label><input id="crSubmitted" type="number" step="0.01" min="0"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>عدد الشحنات</label><input id="crCount" type="number" min="0"/></div>
          <div class="field"><label>ملاحظات</label><input id="crNotes"/></div>
        </div>
        <div id="crErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveCrBtn">حفظ</button>
      </div>
    </div>`);
    $("saveCrBtn")?.addEventListener("click", async()=>{
      const driverId=$("crDriver")?.value,date=$("crDate")?.value;
      const collected=Number($("crCollected")?.value)||0;
      const submitted=Number($("crSubmitted")?.value)||0;
      const errEl=$("crErr");errEl.style.display="none";
      if(!driverId||!date){errEl.style.display="block";errEl.textContent="المندوب والتاريخ مطلوبان";return;}
      const btn=$("saveCrBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        const{error}=await db.from("cod_reconciliation").upsert([{
          driver_id:driverId,reconcile_date:date,
          cod_collected:collected,cod_submitted:submitted,
          shipment_count:Number($("crCount")?.value)||0,
          notes:$("crNotes")?.value.trim()||null,
          status:collected===submitted?"submitted":"pending",
        }],{onConflict:"driver_id,reconcile_date"});
        if(error)throw error;
        Modals.close();App._loadFinanceTabData("cod");
        toast("✅ تم حفظ المطابقة");
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+err.message;btn.disabled=false;btn.textContent="حفظ";}
    });
  },

  async verifyCodRecon(id) {
    const{error}=await db.from("cod_reconciliation").update({
      status:"verified",verified_by:AppState.user.id,verified_at:new Date().toISOString()
    }).eq("id",id);
    if(error){toast("خطأ: "+error.message,"error");return;}
    App._loadFinanceTabData("cod");toast("✅ تم التحقق من المطابقة");
  },

  async flagCodRecon(id) {
    const{error}=await db.from("cod_reconciliation").update({status:"flagged"}).eq("id",id);
    if(error){toast("خطأ: "+error.message,"error");return;}
    App._loadFinanceTabData("cod");toast("تم وضع إشارة على السجل","warning");
  },

  // ── Expenses ──────────────────────────────────────────────
  async addExpense() {
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>💸 إضافة مصروف</h3><button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="field"><label>الفئة *</label>
            <select id="expCat">
              <option value="driver">مندوب</option><option value="branch">فرع</option>
              <option value="office">مكتب</option><option value="fuel">وقود</option>
              <option value="maintenance">صيانة</option><option value="other">أخرى</option>
            </select></div>
          <div class="field"><label>المبلغ *</label><input id="expAmount" type="number" step="0.01" min="0"/></div>
        </div>
        <div class="field"><label>الوصف *</label><input id="expDesc"/></div>
        <div class="form-row">
          <div class="field"><label>المرجع (اسم المندوب/الفرع)</label><input id="expRef"/></div>
          <div class="field"><label>التاريخ</label><input id="expDate" type="date" value="${new Date().toISOString().split("T")[0]}"/></div>
        </div>
        <div id="expErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveExpBtn">حفظ</button>
      </div>
    </div>`);
    $("saveExpBtn")?.addEventListener("click", async()=>{
      const cat=$("expCat")?.value,amount=Number($("expAmount")?.value);
      const desc=$("expDesc")?.value.trim(),date=$("expDate")?.value;
      const errEl=$("expErr");errEl.style.display="none";
      if(!cat||!amount||!desc){errEl.style.display="block";errEl.textContent="الفئة والمبلغ والوصف مطلوبة";return;}
      const btn=$("saveExpBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        const{error}=await db.from("expenses").insert([{
          category:cat,amount,description:desc,
          reference_name:$("expRef")?.value.trim()||null,
          expense_date:date,created_by:AppState.user.id,
        }]);
        if(error)throw error;
        await DB.addAudit("ADD_EXPENSE","",`${cat}: ${money(amount)} - ${desc} by ${AppState.user.name}`,"shipment");
        Modals.close();App._loadFinanceTabData("expenses");
        toast(`✅ تم تسجيل مصروف ${money(amount)}`);
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+err.message;btn.disabled=false;btn.textContent="حفظ";}
    });
  },

  // ── Invoices ──────────────────────────────────────────────
  async generateInvoice() {
    await DB.loadAllMerchants().then(m=>AppState.allMerchants=m);
    const merchants=AppState.allMerchants;
    const today=new Date().toISOString().split("T")[0];
    const firstOfMonth=new Date(); firstOfMonth.setDate(1);
    const startDef=firstOfMonth.toISOString().split("T")[0];
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>📄 إنشاء فاتورة</h3><button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="field"><label>التاجر *</label>
          <select id="invMerch">
            <option value="">اختر التاجر</option>
            ${merchants.map(m=>`<option value="${esc(m.id)}">${esc(m.full_name)}</option>`).join("")}
          </select></div>
        <div class="form-row">
          <div class="field"><label>من تاريخ *</label><input id="invStart" type="date" value="${startDef}"/></div>
          <div class="field"><label>إلى تاريخ *</label><input id="invEnd" type="date" value="${today}"/></div>
        </div>
        <div class="field"><label>ملاحظات</label><textarea id="invNotes" rows="2" style="resize:vertical;"></textarea></div>
        <div id="invErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveInvBtn">إنشاء الفاتورة</button>
      </div>
    </div>`);
    $("saveInvBtn")?.addEventListener("click", async()=>{
      const merchantId=$("invMerch")?.value;
      const start=$("invStart")?.value,end=$("invEnd")?.value;
      const errEl=$("invErr");errEl.style.display="none";
      if(!merchantId||!start||!end){errEl.style.display="block";errEl.textContent="جميع الحقول مطلوبة";return;}
      const btn=$("saveInvBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        // Calculate from shipments
        const mShips=AppState.shipments.filter(s=>s.merchantId===merchantId&&
          s.createdAt&&s.createdAt.split("T")[0]>=start&&s.createdAt.split("T")[0]<=end);
        const delivered=mShips.filter(s=>s.status==="delivered");
        const returned=mShips.filter(s=>s.status==="returned");
        const codTotal=delivered.reduce((a,s)=>a+(s.amount||0),0);
        const feesTotal=delivered.reduce((a,s)=>a+(s.deliveryFee||0),0);
        const retFees=returned.reduce((a,s)=>a+(s.returnFee||0),0);
        const netPayable=codTotal-feesTotal-retFees;
        // Get next invoice number via RPC
        const{data:invNum}=await db.rpc("next_invoice_number");
        const{error}=await db.from("invoices").insert([{
          invoice_number:invNum||("INV-"+Date.now()),
          merchant_id:merchantId,
          period_start:start,period_end:end,
          shipment_count:mShips.length,
          delivered_count:delivered.length,
          returned_count:returned.length,
          cod_total:codTotal,
          fees_total:feesTotal,
          return_fees:retFees,
          net_payable:netPayable,
          status:"draft",
          notes:$("invNotes")?.value.trim()||null,
          created_by:AppState.user.id,
        }]);
        if(error)throw error;
        await DB.addAudit("CREATE_INVOICE",merchantId,
          `Invoice for ${merchants.find(m=>m.id===merchantId)?.full_name}, ${money(netPayable)} net`,"shipment");
        Modals.close();App._loadFinanceTabData("invoices");
        toast(`✅ تم إنشاء الفاتورة — صافي: ${money(netPayable)}`);
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+err.message;btn.disabled=false;btn.textContent="إنشاء";}
    });
  },

  async markInvoicePaid(invoiceId){
    const{error}=await db.from("invoices").update({status:"paid",paid_at:new Date().toISOString()}).eq("id",invoiceId);
    if(error){toast("خطأ: "+error.message,"error");return;}
    App._loadFinanceTabData("invoices");toast("✅ تم تسجيل الفاتورة كمدفوعة");
  },

  // ── Phase 2A: Settlement ──────────────────────────────────
  // ── Admin: Merchant Management ───────────────────────────
  filterMerchants(q) {
    AppState.userFilter = q;
    rerenderContent();
    $("merchantSearchInput")?.focus();
  },

  async selectMerchant(id) {
    AppState.selectedMerchantId = id;
    AppState.adminMerchantTab   = "shipments";
    AppState._adminMerchantData = {};
    rerenderContent();
    // Load all merchant data in parallel
    const [addresses, recipients, products, pickupRequests, ledger, settlements] = await Promise.all([
      DB.loadAdminMerchantAddresses(id),
      DB.loadAdminMerchantRecipients(id),
      DB.loadAdminMerchantProducts(id),
      DB.loadAdminPickupRequests(id),
      DB.loadAdminLedger(id),
      DB.loadAdminSettlements(id),
    ]);
    AppState._adminMerchantData = { addresses, recipients, products, pickupRequests, ledger, settlements };
    rerenderContent();
  },

  setAdminMerchantTab(tab) {
    AppState.adminMerchantTab = tab;
    rerenderContent();
  },

  exportMerchantShipments(merchantId) {
    const list = AppState.shipments.filter(s=>s.merchantId===merchantId);
    const m    = AppState.allMerchants.find(x=>x.id===merchantId);
    const data = list.map(s=>({
      "الكود":s.id, "العميل":s.customerName, "الهاتف":s.customerPhone,
      "المحافظة":s.governorate, "الحالة":STATUS_MAP[s.status]?.label||s.status,
      "المبلغ":s.amount, "رسوم الشحن":s.deliveryFee, "رسوم الإرجاع":s.returnFee||0,
      "المندوب":s.courierName||"", "تاريخ الإنشاء":fmtDate(s.createdAt),
    }));
    const ws=XLSX.utils.json_to_sheet(data);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Shipments");
    XLSX.writeFile(wb,`merchant_${(m?.full_name||merchantId).replace(/s/g,"_")}.xlsx`);
    DB.addAudit("EXPORT_MERCHANT_SHIPMENTS",merchantId,
      `Admin ${AppState.user.name} exported shipments for ${m?.full_name}`,"export");
  },

  // Admin address management
  async adminDeleteAddress(addressId, merchantId) {
    if (!confirm("حذف هذا العنوان؟")) return;
    const{error}=await db.from("merchant_addresses").update({is_active:false}).eq("id",addressId);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await DB.addAudit("DELETE_MERCHANT_ADDRESS",addressId,
      `By admin ${AppState.user.name}`,"shipment");
    await App.selectMerchant(merchantId);
    toast("تم حذف العنوان","info");
  },

  // Admin recipient management
  async adminDeleteRecipient(recipientId, merchantId) {
    if (!confirm("حذف هذا العميل؟")) return;
    const{error}=await db.from("merchant_recipients").update({is_deleted:true}).eq("id",recipientId);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await DB.addAudit("DELETE_MERCHANT_RECIPIENT",recipientId,
      `By admin ${AppState.user.name}`,"shipment");
    await App.selectMerchant(merchantId);
    toast("تم الحذف","info");
  },

  // Admin product management
  async adminDeleteProduct(productId, merchantId) {
    if (!confirm("حذف هذا المنتج؟")) return;
    const{error}=await db.from("merchant_products").update({is_deleted:true}).eq("id",productId);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await DB.addAudit("DELETE_MERCHANT_PRODUCT",productId,
      `By admin ${AppState.user.name}`,"shipment");
    await App.selectMerchant(merchantId);
    toast("تم الحذف","info");
  },

  // Admin pickup request management
  async adminAssignPickup(requestId, merchantId) {
    const sel = $(`#courier_${requestId}`);
    const courierId   = sel?.value;
    const courierName = sel?.options[sel.selectedIndex]?.dataset.name||"";
    if (!courierId) { toast("اختر مندوباً","warning"); return; }
    const{error}=await db.from("pickup_requests").update({
      courier_id:courierId, courier_name:courierName, status:"assigned"
    }).eq("id",requestId);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await DB.addAudit("ASSIGN_PICKUP_REQUEST",requestId,
      `Assigned ${courierName} by admin ${AppState.user.name}`,"shipment");
    await App.selectMerchant(merchantId);
    toast(`✅ تم تعيين ${courierName}`);
  },

  async adminMarkPickedUp(requestId, merchantId) {
    const{error}=await db.from("pickup_requests").update({
      status:"picked_up", picked_up_at:new Date().toISOString()
    }).eq("id",requestId);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await DB.addAudit("PICKUP_COMPLETED",requestId,
      `By admin ${AppState.user.name}`,"shipment");
    await App.selectMerchant(merchantId);
    toast("✅ تم تأكيد الاستلام");
  },

  async adminCancelPickup(requestId, merchantId) {
    if (!confirm("إلغاء طلب الاستلام؟")) return;
    const{error}=await db.from("pickup_requests").update({status:"cancelled"}).eq("id",requestId);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await App.selectMerchant(merchantId);
    toast("تم الإلغاء","info");
  },

  // Admin ledger management
  async adminAddLedgerEntry(merchantId) {
    const TYPE_LABELS={cod_collected:"تحصيل COD",delivery_fee:"رسوم شحن",
      return_fee:"رسوم إرجاع",settlement:"تسوية",adjustment:"تعديل",refund:"استرداد"};
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>${icon("wallet",18)} إضافة حركة للحساب</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="field"><label>النوع *</label>
          <select id="lType">
            ${Object.entries(TYPE_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}
          </select></div>
        <div class="form-row">
          <div class="field"><label>المبلغ * (موجب = إضافة، سالب = خصم)</label>
            <input id="lAmount" type="number" step="0.01" placeholder="0.00"/></div>
          <div class="field"><label>كود الشحنة (اختياري)</label>
            <input id="lShipCode" placeholder="ANE-123"/></div>
        </div>
        <div class="field"><label>الوصف</label><input id="lDesc"/></div>
        <div id="lErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveLedgerBtn">حفظ</button>
      </div>
    </div>`);
    $("saveLedgerBtn")?.addEventListener("click", async()=>{
      const type=$("lType")?.value;
      const amount=Number($("lAmount")?.value);
      const errEl=$("lErr");errEl.style.display="none";
      if(!amount){errEl.style.display="block";errEl.textContent="المبلغ مطلوب";return;}
      const btn=$("saveLedgerBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try {
        // Get current balance
        const currentBal = await DB.loadMerchantBalance(merchantId);
        const newBal     = currentBal + amount;
        const{error}=await db.from("merchant_ledger").insert([{
          merchant_id:   merchantId,
          type,
          amount,
          balance_after: newBal,
          description:   $("lDesc")?.value.trim()||null,
          shipment_code: $("lShipCode")?.value.trim()||null,
          created_by:    AppState.user.id,
        }]);
        if(error)throw error;
        await DB.addAudit("ADMIN_LEDGER_ENTRY",merchantId,
          `Type: ${type}, Amount: ${amount}, By: ${AppState.user.name}`,"shipment");
        Modals.close();
        await App.selectMerchant(merchantId);
        toast(`✅ تم إضافة حركة ${amount>0?"+":""}${money(amount)}`);
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+err.message;btn.disabled=false;btn.textContent="حفظ";}
    });
  },

  // Admin settlement management
  async approveSettlement(settlementId, merchantId) {
    const{error}=await db.from("settlements").update({
      status:"approved", processed_by:AppState.user.id,
      processed_at:new Date().toISOString()
    }).eq("id",settlementId);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await DB.addAudit("APPROVE_SETTLEMENT",settlementId,
      `Approved by ${AppState.user.name}`,"shipment");
    await App.selectMerchant(merchantId);
    toast("✅ تمت الموافقة على طلب التسوية");
  },

  async rejectSettlement(settlementId, merchantId) {
    const reason = prompt("سبب الرفض:");
    if (!reason) return;
    const{error}=await db.from("settlements").update({
      status:"rejected", rejection_reason:reason,
      processed_by:AppState.user.id, processed_at:new Date().toISOString()
    }).eq("id",settlementId);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await DB.addAudit("REJECT_SETTLEMENT",settlementId,
      `Rejected by ${AppState.user.name}: ${reason}`,"shipment");
    await App.selectMerchant(merchantId);
    toast("تم رفض طلب التسوية","warning");
  },

  async markSettlementPaid(settlementId, merchantId) {
    const ref = prompt("رقم مرجع الدفع (اختياري):");
    if (ref === null) return;
    const{error}=await db.from("settlements").update({
      status:"paid", payment_ref:ref||null,
      processed_by:AppState.user.id, processed_at:new Date().toISOString()
    }).eq("id",settlementId);
    if(error){toast("خطأ: "+error.message,"error");return;}
    // Record settlement in ledger
    const sett = (AppState._adminMerchantData?.settlements||[]).find(s=>s.id===settlementId);
    if (sett) {
      const bal = await DB.loadMerchantBalance(merchantId);
      await db.from("merchant_ledger").insert([{
        merchant_id:merchantId, type:"settlement",
        amount:-Math.abs(sett.amount), balance_after:bal-Math.abs(sett.amount),
        description:`تسوية #${settlementId.slice(-6)}`, reference_id:settlementId,
        created_by:AppState.user.id,
      }]);
    }
    await DB.addAudit("MARK_SETTLEMENT_PAID",settlementId,
      `Paid by ${AppState.user.name}, ref: ${ref||"N/A"}`,"shipment");
    await App.selectMerchant(merchantId);
    toast(`✅ تم صرف التسوية${ref?" - مرجع: "+ref:""}`);
  },

  async requestSettlement() {
    const bal = AppState.merchantBalance;
    if (bal <= 0) { toast("لا يوجد رصيد متاح للتسوية","warning"); return; }
    const amount = prompt(`الرصيد المتاح: ${money(bal)}\nالمبلغ المطلوب تحصيله:`);
    if (!amount || isNaN(Number(amount))) return;
    const req = Number(amount);
    if (req <= 0 || req > bal) { toast("مبلغ غير صحيح","error"); return; }
    try {
      const { error } = await db.from("settlements").insert([{
        merchant_id:    AppState.user.id,
        amount:         req,
        status:         "pending",
        payment_method: "bank_transfer",
      }]);
      if (error) throw error;
      await DB.addAudit("REQUEST_SETTLEMENT", AppState.user.id,
        `Merchant ${AppState.user.name} requested settlement of ${money(req)}`, "shipment");
      toast(`✅ تم إرسال طلب التسوية بمبلغ ${money(req)}`);
    } catch(err) { toast("خطأ: "+err.message,"error"); }
  },

  // ── Phase 2A: Address Book ────────────────────────────────
  async loadMerchantData() {
    const uid = AppState.user.id;
    const [addrs, recs, prods, reqs, bal] = await Promise.all([
      DB.loadMerchantAddresses(uid),
      DB.loadMerchantRecipients(uid),
      DB.loadMerchantProducts(uid),
      DB.loadPickupRequests(uid),
      DB.loadMerchantBalance(uid),
    ]);
    AppState.merchantAddresses  = addrs;
    AppState.merchantRecipients = recs;
    AppState.merchantProducts   = prods;
    AppState.pickupRequests     = reqs;
    AppState.merchantBalance    = bal;
  },

  async addAddress() {
    const govOpts = Object.keys(EGYPT_GOV).sort()
      .map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join("");
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>📍 إضافة عنوان</h3><button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="field"><label>اسم العنوان *</label><input id="aLabel" placeholder="مثال: المخزن الرئيسي"/></div>
        <div class="form-row">
          <div class="field"><label>النوع</label>
            <select id="aType">
              <option value="pickup">📦 نقطة استلام</option>
              <option value="warehouse">🏭 مستودع</option>
              <option value="branch">🏪 فرع</option>
              <option value="other">📍 أخرى</option>
            </select>
          </div>
          <div class="field"><label>المحافظة *</label><select id="aGov"><option value="">اختر</option>${govOpts}</select></div>
        </div>
        <div class="form-row">
          <div class="field"><label>المدينة</label><select id="aCity"><option value="">اختر المدينة</option></select></div>
          <div class="field"><label>الشارع</label><input id="aStreet"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>اسم جهة الاتصال</label><input id="aContact"/></div>
          <div class="field"><label>هاتف جهة الاتصال</label><input id="aPhone" type="tel"/></div>
        </div>
        <div class="field"><label><input type="checkbox" id="aDefault"/> تعيين كعنوان افتراضي</label></div>
        <div id="aErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveAddrBtn">حفظ</button>
      </div>
    </div>`);
    $("aGov")?.addEventListener("change", e => {
      const cities = (EGYPT_GOV[e.target.value]||[]);
      $("aCity").innerHTML = `<option value="">اختر المدينة</option>`+cities.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
    });
    $("saveAddrBtn")?.addEventListener("click", async () => {
      const label = $("aLabel")?.value.trim();
      const gov   = $("aGov")?.value;
      const errEl = $("aErr"); errEl.style.display="none";
      if (!label||!gov) { errEl.style.display="block"; errEl.textContent="الاسم والمحافظة مطلوبان"; return; }
      const btn = $("saveAddrBtn"); btn.disabled=true; btn.innerHTML=`<span class="spinner"></span>`;
      try {
        const { error } = await db.from("merchant_addresses").insert([{
          merchant_id:   AppState.user.id,
          label,
          type:          $("aType")?.value||"pickup",
          governorate:   gov,
          city:          $("aCity")?.value||"",
          street:        $("aStreet")?.value.trim()||null,
          contact_name:  $("aContact")?.value.trim()||null,
          contact_phone: $("aPhone")?.value.trim()||null,
          is_default:    $("aDefault")?.checked||false,
        }]);
        if (error) throw error;
        await App.loadMerchantData();
        Modals.close(); rerenderContent();
        toast("✅ تم إضافة العنوان");
      } catch(err) { errEl.style.display="block"; errEl.textContent="خطأ: "+err.message; btn.disabled=false; btn.textContent="حفظ"; }
    });
  },

  async setDefaultAddress(id) {
    const uid = AppState.user.id;
    await db.from("merchant_addresses").update({is_default:false}).eq("merchant_id",uid);
    await db.from("merchant_addresses").update({is_default:true}).eq("id",id);
    await App.loadMerchantData(); rerenderContent();
    toast("تم تعيين العنوان الافتراضي");
  },

  async deleteAddress(id) {
    if (!confirm("حذف هذا العنوان؟")) return;
    const { error } = await db.from("merchant_addresses").update({is_active:false}).eq("id",id);
    if (error) { toast("خطأ: "+error.message,"error"); return; }
    await App.loadMerchantData(); rerenderContent();
    toast("تم حذف العنوان","info");
  },

  // ── Phase 2A: Recipients ──────────────────────────────────
  async searchRecipients(q) {
    const uid = AppState.user.id;
    AppState.merchantRecipients = await DB.loadMerchantRecipients(uid, q);
    rerenderContent();
    $("recipientSearch")?.focus();
  },

  async addRecipient() {
    const govOpts = Object.keys(EGYPT_GOV).sort().map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join("");
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>👤 إضافة عميل</h3><button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="field"><label>الاسم *</label><input id="rName"/></div>
          <div class="field"><label>الهاتف *</label><input id="rPhone" type="tel"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>هاتف ثاني</label><input id="rPhone2" type="tel"/></div>
          <div class="field"><label>المحافظة</label><select id="rGov"><option value="">اختر</option>${govOpts}</select></div>
        </div>
        <div class="form-row">
          <div class="field"><label>المدينة</label><select id="rCity"><option value="">اختر</option></select></div>
          <div class="field"><label>الشارع</label><input id="rStreet"/></div>
        </div>
        <div class="field"><label>ملاحظات</label><input id="rNotes"/></div>
        <div id="rErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveRecBtn">حفظ</button>
      </div>
    </div>`);
    $("rGov")?.addEventListener("change", e => {
      const cities=(EGYPT_GOV[e.target.value]||[]);
      $("rCity").innerHTML=`<option value="">اختر</option>`+cities.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
    });
    $("saveRecBtn")?.addEventListener("click", async () => {
      const name=$("rName")?.value.trim(), phone=$("rPhone")?.value.trim();
      const errEl=$("rErr"); errEl.style.display="none";
      if (!name||!phone){errEl.style.display="block";errEl.textContent="الاسم والهاتف مطلوبان";return;}
      const btn=$("saveRecBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try {
        const{error}=await db.from("merchant_recipients").insert([{
          merchant_id:AppState.user.id,name,phone,
          phone2:$("rPhone2")?.value.trim()||null,
          governorate:$("rGov")?.value||"",
          city:$("rCity")?.value||"",
          street:$("rStreet")?.value.trim()||null,
          notes:$("rNotes")?.value.trim()||null,
        }]);
        if(error)throw error;
        await App.loadMerchantData();Modals.close();rerenderContent();
        toast("✅ تم إضافة العميل");
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+err.message;btn.disabled=false;btn.textContent="حفظ";}
    });
  },

  async deleteRecipient(id) {
    if (!confirm("حذف هذا العميل؟")) return;
    const{error}=await db.from("merchant_recipients").update({is_deleted:true}).eq("id",id);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await App.loadMerchantData();rerenderContent();toast("تم الحذف","info");
  },

  async shipToRecipient(id) {
    const r = AppState.merchantRecipients.find(x=>x.id===id);
    if (!r) return;
    await loadEgyptData();
    AppState.view="shipments";
    rerenderContent();
    await Modals.newShipment();
    // Pre-fill recipient data
    setTimeout(()=>{
      if($("fCustName")) $("fCustName").value = r.name;
      if($("fPhone"))    $("fPhone").value    = r.phone;
      if($("fPhone2"))   $("fPhone2").value   = r.phone2||"";
      const govSel = $("fGov");
      if(govSel&&r.governorate){
        govSel.value = r.governorate;
        govSel.dispatchEvent(new Event("change"));
        setTimeout(()=>{ if($("fCity")&&r.city) $("fCity").value=r.city; },100);
      }
      if($("fStreet")) $("fStreet").value = r.street||"";
    },300);
  },

  // ── Phase 2A: Products ────────────────────────────────────
  async addProduct() {
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>🛍️ إضافة منتج</h3><button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="field"><label>اسم المنتج *</label><input id="pName"/></div>
          <div class="field"><label>SKU</label><input id="pSku" placeholder="رمز المنتج"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>السعر (ج.م)</label><input id="pPrice" type="number" step="0.01" min="0"/></div>
          <div class="field"><label>الوزن (كجم)</label><input id="pWeight" type="number" step="0.1" min="0"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>باركود</label><input id="pBarcode"/></div>
          <div class="field"><label>رابط الصورة</label><input id="pImage" placeholder="https://..."/></div>
        </div>
        <div class="field"><label>الوصف</label><textarea id="pDesc" rows="2" style="resize:vertical;"></textarea></div>
        <div id="pErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveProdBtn">حفظ</button>
      </div>
    </div>`);
    $("saveProdBtn")?.addEventListener("click", async()=>{
      const name=$("pName")?.value.trim();
      const errEl=$("pErr");errEl.style.display="none";
      if(!name){errEl.style.display="block";errEl.textContent="اسم المنتج مطلوب";return;}
      const btn=$("saveProdBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        const{error}=await db.from("merchant_products").insert([{
          merchant_id:AppState.user.id,name,
          sku:$("pSku")?.value.trim()||null,
          price:$("pPrice")?.value?Number($("pPrice").value):null,
          weight:$("pWeight")?.value?Number($("pWeight").value):null,
          barcode:$("pBarcode")?.value.trim()||null,
          image_url:$("pImage")?.value.trim()||null,
          description:$("pDesc")?.value.trim()||null,
        }]);
        if(error)throw error;
        await App.loadMerchantData();Modals.close();rerenderContent();
        toast("✅ تم إضافة المنتج");
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+err.message;btn.disabled=false;btn.textContent="حفظ";}
    });
  },

  async deleteProduct(id){
    if(!confirm("حذف هذا المنتج؟"))return;
    const{error}=await db.from("merchant_products").update({is_deleted:true}).eq("id",id);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await App.loadMerchantData();rerenderContent();toast("تم الحذف","info");
  },

  // ── Phase 2A: Pickup Requests ─────────────────────────────
  async newPickupRequest(){
    await App.loadMerchantData();
    const addrs=AppState.merchantAddresses;
    const couriers=AppState.couriers;
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>🚚 طلب استلام</h3><button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="field"><label>عنوان الاستلام</label>
          <select id="prAddr">
            <option value="">-- اختر عنواناً --</option>
            ${addrs.map(a=>`<option value="${esc(a.id)}">${esc(a.label)} — ${esc(a.governorate)}${a.is_default?" ⭐":""}</option>`).join("")}
          </select>
        </div>
        <div class="form-row">
          <div class="field"><label>عدد الشحنات المتوقع</label><input id="prCount" type="number" value="1" min="1"/></div>
          <div class="field"><label>الموعد المفضل (اختياري)</label><input id="prDate" type="datetime-local"/></div>
        </div>
        <div class="field"><label>ملاحظات للمندوب</label><textarea id="prNotes" rows="2" style="resize:vertical;"></textarea></div>
        <div id="prErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="savePickupBtn">إرسال الطلب</button>
      </div>
    </div>`);
    $("savePickupBtn")?.addEventListener("click",async()=>{
      const addrId=$("prAddr")?.value;
      const count=Number($("prCount")?.value)||1;
      const date=$("prDate")?.value||null;
      const notes=$("prNotes")?.value.trim()||null;
      const errEl=$("prErr");errEl.style.display="none";
      const btn=$("savePickupBtn");btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      try{
        const{error}=await db.from("pickup_requests").insert([{
          merchant_id:AppState.user.id,
          address_id:addrId||null,
          status:"pending",
          shipment_count:count,
          scheduled_at:date||null,
          notes,
        }]);
        if(error)throw error;
        await DB.addAudit("CREATE_PICKUP_REQUEST",AppState.user.id,
          `Merchant ${AppState.user.name} requested pickup of ${count} shipments`,"shipment");
        await App.loadMerchantData();Modals.close();rerenderContent();
        toast("✅ تم إرسال طلب الاستلام");
      }catch(err){errEl.style.display="block";errEl.textContent="خطأ: "+err.message;btn.disabled=false;btn.textContent="إرسال الطلب";}
    });
  },

  async cancelPickupRequest(id){
    if(!confirm("إلغاء هذا الطلب؟"))return;
    const{error}=await db.from("pickup_requests").update({status:"cancelled"}).eq("id",id);
    if(error){toast("خطأ: "+error.message,"error");return;}
    await App.loadMerchantData();rerenderContent();toast("تم إلغاء الطلب","info");
  },
  setServiceFilter(f){ AppState.serviceFilter = f; rerenderContent(); },
  setOrderFilter(f)  { AppState.orderFilter   = f; rerenderContent(); },
  manualTrack(){const c=prompt("أدخل رقم الشحنة:");if(c)location.href=`${location.origin}${location.pathname}?track=${encodeURIComponent(c.trim())}`;},

  async updateStatus(id,status){
    const s=AppState.shipments.find(x=>x.id===id);if(!s)return;
    s.status=status;if(status==="delivered")s.eta="تم التسليم";
    try{
      await DB.updateShipment(id,{status,eta:s.eta});
      await DB.addTimeline(id,STATUS_MAP[status]?.label||status,AppState.user.name,(AppState.user.primary_role||AppState.user.role));
      await DB.addNotification(`شحنة ${id} → ${STATUS_MAP[status]?.label}`,"admin",id);
      await DB.addAudit("UPDATE_STATUS",id,`→ ${status} by ${AppState.user.name}`);
      if(status==="delivered"||status==="returned"){
        if(confirm("إرسال إشعار واتساب للعميل؟")){
          const msg=`مرحباً ${s.customerName}\n\nشحنتك: ${s.id}\nالحالة: ${STATUS_MAP[status]?.label}\n\nالنخبة للشحن السريع`;
          window.open(`https://wa.me/2${s.customerPhone}?text=${encodeURIComponent(msg)}`);
        }
      }
      rerenderContent();toast(`تم تحديث الشحنة ${id}`);
    }catch(err){toast("خطأ في التحديث: "+err.message,"error");}
  },

  async assignCourier(id){
    const sel=$("courierSelect");if(!sel)return;
    const courierId=sel.value,courierName=sel.options[sel.selectedIndex]?.text||"";
    if(!courierId){toast("اختر مندوباً أولاً","warning");return;}
    const s=AppState.shipments.find(x=>x.id===id);if(!s)return;
    try{
      const cleanName=courierName.split("—")[0].trim();
      await DB.updateShipment(id,{courier_id:courierId,courier_name:cleanName});
      s.courierId=courierId;s.courierName=cleanName;
      await DB.addTimeline(id,`تعيين المندوب: ${cleanName}`,AppState.user.name,(AppState.user.primary_role||AppState.user.role));
      await DB.addNotification(`مندوب ${cleanName} معين لشحنة ${id}`,"courier",id,"shipment");
      await DB.addAudit("ASSIGN_COURIER",id,`${cleanName} → ${id}`);
      rerenderContent();toast(`✅ تم تعيين ${cleanName}`);
    }catch(err){toast("خطأ في التعيين: "+err.message,"error");}
  },

  async uploadPOD(id,inputId){
    const file=document.querySelector(`#${CSS.escape(inputId)}`)?.files[0];if(!file)return;
    if(file.size>5*1024*1024){toast("الحد الأقصى للصورة 5MB","warning");return;}
    try{
      const url=await DB.uploadPOD(id,file);
      await DB.updateShipment(id,{pod_url:url,pod_uploaded_at:new Date().toISOString(),pod_uploaded_by:AppState.user?.id||null});
      const s=AppState.shipments.find(x=>x.id===id);if(s)s.podUrl=url;
      await DB.addTimeline(id,"رفع إثبات التسليم",AppState.user.name,(AppState.user.primary_role||AppState.user.role));
      await DB.addAudit("UPLOAD_POD",id,`By ${AppState.user.name}`);
      rerenderContent();toast("✅ تم رفع إثبات التسليم");
    }catch(err){toast("فشل الرفع: "+err.message,"error");}
  },

  // ── Phase 3: Signature Capture ──────────────────────────────
  openSignatureCapture(shipmentCode) {
    const s = AppState.shipments.find(x => x.id === shipmentCode);
    if (!s) return;
    Modals.open(`<div class="modal" style="max-width:480px;">
      <div class="modal-header">
        <h3>✍️ توقيع العميل</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button>
      </div>
      <div class="modal-body" style="padding-bottom:8px;">
        <div style="font-size:13px;color:var(--gray-600);margin-bottom:10px;text-align:center;">
          ${esc(s.customerName)} · ${esc(s.id)}
        </div>
        <div style="position:relative;border:2px solid var(--gray-300);border-radius:var(--radius);
          background:#fff;touch-action:none;cursor:crosshair;">
          <canvas id="sigCanvas" width="436" height="200"
            style="display:block;width:100%;height:200px;border-radius:var(--radius);">
          </canvas>
          <div id="sigPlaceholder" style="position:absolute;inset:0;display:flex;align-items:center;
            justify-content:center;color:var(--gray-300);font-size:13px;pointer-events:none;">
            وقّع هنا بإصبعك أو الماوس
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;">
          <button class="btn btn-secondary btn-sm" onclick="App._clearSignatureCanvas()">مسح</button>
          <span style="font-size:11px;color:var(--gray-400);">ارسم التوقيع داخل الإطار</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button id="saveSigBtn" class="btn btn-primary" onclick="App.saveSignature('${esc(shipmentCode)}')">
          💾 حفظ التوقيع
        </button>
      </div>
    </div>`);

    // Wire up canvas drawing after modal renders
    setTimeout(() => App._initSignatureCanvas(), 50);
  },

  _initSignatureCanvas() {
    const canvas = document.getElementById("sigCanvas");
    if (!canvas) return;
    const ctx    = canvas.getContext("2d");
    let drawing  = false;
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      const src = e.touches ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * scaleX,
        y: (src.clientY - rect.top)  * scaleY,
      };
    }
    function start(e) {
      e.preventDefault();
      drawing = true;
      const p = getPos(e);
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      const ph = document.getElementById("sigPlaceholder");
      if (ph) ph.style.display = "none";
    }
    function draw(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    function stop(e) { e.preventDefault(); drawing = false; }

    canvas.addEventListener("mousedown",  start);
    canvas.addEventListener("mousemove",  draw);
    canvas.addEventListener("mouseup",    stop);
    canvas.addEventListener("mouseleave", stop);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove",  draw,  { passive: false });
    canvas.addEventListener("touchend",   stop,  { passive: false });
  },

  _clearSignatureCanvas() {
    const canvas = document.getElementById("sigCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ph = document.getElementById("sigPlaceholder");
    if (ph) ph.style.display = "flex";
  },

  async saveSignature(shipmentCode) {
    const canvas = document.getElementById("sigCanvas");
    if (!canvas) return;

    // Check canvas is not blank
    const ctx  = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasContent = data.some((v, i) => i % 4 !== 3 && v !== 0);
    if (!hasContent) {
      toast("يرجى رسم التوقيع أولاً", "warning");
      return;
    }

    const btn = document.getElementById("saveSigBtn");
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> جاري الحفظ...`; }

    try {
      // Convert canvas to blob
      const blob = await new Promise(resolve =>
        canvas.toBlob(resolve, "image/png", 0.9)
      );

      const url = await DB.uploadSignature(shipmentCode, blob);

      await DB.updateShipment(shipmentCode, {
        signature_url: url,
        pod_uploaded_at:  new Date().toISOString(),
        pod_uploaded_by:  AppState.user?.id || null,
      });

      // Update local state
      const s = AppState.shipments.find(x => x.id === shipmentCode);
      if (s) s.signatureUrl = url;

      await DB.addTimeline(shipmentCode,
        "تم أخذ توقيع العميل",
        AppState.user.name,
        AppState.user.primary_role || AppState.user.role,
        "signature_captured");

      await DB.addAudit("SIGNATURE_CAPTURED", shipmentCode,
        `Signature captured by ${AppState.user.name}`, "shipment");

      Modals.close();
      rerenderContent();
      toast("✅ تم حفظ التوقيع بنجاح");
    } catch(err) {
      toast("فشل حفظ التوقيع: " + err.message, "error");
      if (btn) { btn.disabled = false; btn.textContent = "💾 حفظ التوقيع"; }
    }
  },

  // ── Phase 3: OTP Delivery Verification ───────────────────────
  async sendDeliveryOTP(shipmentCode, customerPhone) {
    const btn = document.querySelector(`[onclick*="sendDeliveryOTP('${shipmentCode}'"]`);
    if (btn) { btn.disabled=true; btn.innerHTML=`<span class="spinner"></span>`; }
    try {
      if (!customerPhone) throw new Error("لا يوجد رقم هاتف للعميل");
      const otp = await DB.generateAndSendOTP(shipmentCode, customerPhone);
      if (!otp) throw new Error("فشل توليد الكود");
      await DB.addTimeline(shipmentCode,
        `تم إرسال كود التحقق إلى ${customerPhone}`,
        AppState.user.name,
        AppState.user.primary_role||AppState.user.role,
        "otp_sent");
      await DB.addAudit("OTP_SENT", shipmentCode,
        `OTP sent to ${customerPhone} by ${AppState.user.name}`, "shipment");
      // In production: customer receives SMS. In dev: show code to courier.
      toast(`✅ تم إرسال الكود — للاختبار: ${otp}`, "success");
    } catch(err) {
      toast("فشل الإرسال: " + err.message, "error");
    } finally {
      if (btn) { btn.disabled=false; btn.innerHTML="📱 إرسال كود تحقق"; }
    }
  },

  openVerifyOTP(shipmentCode) {
    const s = AppState.shipments.find(x => x.id === shipmentCode);
    if (!s) return;
    Modals.open(`<div class="modal" style="max-width:360px;">
      <div class="modal-header">
        <h3>🔐 تأكيد استلام الشحنة</h3>
        <button class="btn-icon" onclick="Modals.close()">${icon("close")}</button>
      </div>
      <div class="modal-body">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:14px;color:var(--gray-600);margin-bottom:6px;">الشحنة</div>
          <div style="font-size:16px;font-weight:700;font-family:monospace;">${esc(shipmentCode)}</div>
          <div style="font-size:13px;color:var(--gray-500);margin-top:4px;">${esc(s.customerName)}</div>
        </div>
        <div class="field">
          <label style="font-weight:600;display:block;margin-bottom:8px;text-align:center;">
            اطلب من العميل الكود الذي وصله على هاتفه
          </label>
          <input id="otpInput" type="text" inputmode="numeric" maxlength="6"
            placeholder="× × × × × ×"
            style="text-align:center;letter-spacing:12px;font-size:28px;font-weight:700;
              font-family:monospace;padding:16px;border-radius:var(--radius);
              border:2px solid var(--gray-300);width:100%;box-sizing:border-box;"
            oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,6);
              if(this.value.length===6) $('confirmOtpBtn').focus();"
          />
        </div>
        <div id="otpError" style="display:none;color:var(--danger);font-size:13px;
          text-align:center;margin-top:8px;font-weight:600;"></div>
        <div id="otpAttempts" style="font-size:11px;color:var(--gray-400);text-align:center;margin-top:6px;"></div>
      </div>
      <div class="modal-footer" style="flex-direction:column;gap:10px;">
        <button id="confirmOtpBtn" class="btn btn-primary btn-full"
          onclick="App.confirmOTP('${esc(shipmentCode)}')">
          تأكيد الكود
        </button>
        <button class="btn btn-secondary btn-full"
          onclick="App.sendDeliveryOTP('${esc(shipmentCode)}','${esc(s.customerPhone)}');$('otpInput').value='';$('otpError').style.display='none';">
          إعادة إرسال الكود
        </button>
        <button class="btn-ghost" onclick="Modals.close()" style="font-size:13px;color:var(--gray-500);">
          تسليم بدون كود
        </button>
      </div>
    </div>`);
    setTimeout(()=>$("otpInput")?.focus(), 100);
  },

  async confirmOTP(shipmentCode) {
    const entered = $("otpInput")?.value?.trim();
    const errEl   = $("otpError");
    const attEl   = $("otpAttempts");
    const btn     = $("confirmOtpBtn");

    if (!entered || entered.length !== 6) {
      errEl.style.display="block";
      errEl.textContent="يرجى إدخال الكود المكون من 6 أرقام";
      return;
    }

    btn.disabled=true; btn.innerHTML=`<span class="spinner"></span> جاري التحقق...`;
    errEl.style.display="none";

    try {
      const isValid = await DB.verifyOTP(shipmentCode, entered);

      if (isValid) {
        // Update local state immediately
        const s = AppState.shipments.find(x=>x.id===shipmentCode);
        if (s) s.otpVerified = true;

        await DB.addTimeline(shipmentCode,
          "تم التحقق من هوية العميل بالكود",
          AppState.user.name,
          AppState.user.primary_role||AppState.user.role,
          "otp_verified");
        await DB.addAudit("OTP_VERIFIED", shipmentCode,
          `OTP verified by courier ${AppState.user.name}`, "shipment");

        Modals.close();
        rerenderContent();
        toast("✅ تم التحقق من هوية العميل — يمكنك الآن تسليم الشحنة", "success");
      } else {
        // Track failed attempts
        const prev = parseInt(attEl.dataset.attempts||"0") + 1;
        attEl.dataset.attempts = prev;
        errEl.style.display="block";
        errEl.textContent = "❌ الكود غير صحيح";
        attEl.textContent = `محاولة ${prev} من 3`;
        $("otpInput").value="";
        $("otpInput").focus();

        if (prev >= 3) {
          btn.disabled=true;
          errEl.textContent="تم تجاوز الحد الأقصى للمحاولات. أعد إرسال الكود.";
          attEl.textContent="";
        } else {
          btn.disabled=false;
          btn.textContent="تأكيد الكود";
        }
      }
    } catch(err) {
      errEl.style.display="block";
      errEl.textContent="خطأ: " + err.message;
      btn.disabled=false;
      btn.textContent="تأكيد الكود";
    }
  },

  async rescheduleShipment(id) {
    const s = AppState.shipments.find(x => x.id === id);
    if (!s) return;
    const reason  = prompt("سبب إعادة الجدولة (اختياري):");
    if (reason === null) return;
    try {
      await DB.updateShipment(id, { status:"rescheduled", reschedule_reason:reason||null });
      s.status = "rescheduled"; s.rescheduleCount = (s.rescheduleCount||0)+1;
      await DB.addTimeline(id, "إعادة جدولة"+(reason?": "+reason:""),
        AppState.user.name, AppState.user.primary_role||AppState.user.role, "rescheduled");
      await DB.addAudit("RESCHEDULE_SHIPMENT", id,
        "Rescheduled by "+AppState.user.name+(reason?": "+reason:""), "shipment");
      rerenderContent(); toast("تم إعادة جدولة الشحنة", "info");
    } catch(err) { toast("خطأ: "+err.message,"error"); }
  },

  async suspendShipment(id) {
    const s = AppState.shipments.find(x => x.id === id);
    if (!s) return;
    const reason = prompt("سبب الإيقاف:");
    if (!reason) return;
    try {
      await DB.updateShipment(id, { status:"suspended", suspension_reason:reason });
      s.status = "suspended";
      await DB.addTimeline(id, "إيقاف: "+reason,
        AppState.user.name, AppState.user.primary_role||AppState.user.role, "suspended");
      await DB.addAudit("SUSPEND_SHIPMENT", id,
        "Suspended by "+AppState.user.name+": "+reason, "shipment");
      rerenderContent(); toast("تم إيقاف الشحنة","warning");
    } catch(err) { toast("خطأ: "+err.message,"error"); }
  },

  exportExcel(){
    if(!can("export_excel")){toast("غير مصرح","error");return;}
    const data=visible().map(s=>({
      "الكود":           s.id,
      "العميل":          s.customerName,
      "الهاتف":          s.customerPhone,
      "هاتف 2":          s.customerPhone2||"",
      "المحافظة":        s.governorate,
      "المدينة":         s.city,
      "العنوان":         s.address,
      "الحالة":          STATUS_MAP[s.status]?.label||s.status,
      "نوع الخدمة":      SERVICE_MAP[s.serviceType]?.label||s.serviceType,
      "نوع الطلب":       ORDER_TYPE_MAP[s.orderType]?.label||s.orderType,
      "المبلغ":          s.amount,
      "رسوم الشحن":      s.deliveryFee,
      "رسوم الإرجاع":    s.returnFee||0,
      "الوزن (كجم)":     s.weight||"",
      "الكمية":          s.quantity||1,
      "باركود":          s.barcode||"",
      "التاجر":          s.merchantName||"",
      "المندوب":         s.courierName||"",
      "تاريخ الإنشاء":  fmtDate(s.createdAt),
      "تاريخ التسليم":  s.deliveredAt ? fmtDate(s.deliveredAt) : "",
      "محاولات التوصيل": s.attempts||0,
      "مرات الإعادة":   s.rescheduleCount||0,
    }));
    const ws=XLSX.utils.json_to_sheet(data);
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Shipments");
    XLSX.writeFile(wb,`nukhba_${new Date().toLocaleDateString("en-GB").replace(/\//g,"-")}.xlsx`);
    DB.addAudit("EXPORT_EXCEL","",`${data.length} rows`);
  },

  async print(id){
    if(!can("print_shipment")){toast("غير مصرح","error");return;}
    const s=AppState.shipments.find(x=>x.id===id);if(!s)return;
    const el=document.createElement("div");
    el.style.cssText="width:680px;padding:28px;background:#fff;direction:rtl;font-family:Arial;position:fixed;top:-9999px;left:0;";
    el.innerHTML=`<div style="border:2px solid #0d9488;padding:22px;border-radius:12px;">
      <h1 style="text-align:center;color:#0f766e;margin-bottom:18px;">النخبة للشحن السريع</h1>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;">
        <div style="font-size:14px;line-height:2.2;">
          <p><b>رقم الشحنة:</b> ${esc(s.id)}</p>
          <p><b>العميل:</b> ${esc(s.customerName)}</p>
          <p><b>الهاتف:</b> ${esc(s.customerPhone)}</p>
          ${s.customerPhone2?`<p><b>هاتف 2:</b> ${esc(s.customerPhone2)}</p>`:""}
          <p><b>المبلغ:</b> ${s.amount} ج.م</p>
          <p><b>رسوم الشحن:</b> ${s.deliveryFee} ج.م</p>
          <p><b>العنوان:</b> ${esc(s.address||s.address_full)}</p>
          ${s.merchantName?`<p><b>التاجر:</b> ${esc(s.merchantName)}</p>`:""}
        </div>
        <canvas id="pQR"></canvas>
      </div>
    </div>`;
    document.body.appendChild(el);
    await QRCode.toCanvas(document.querySelector("#pQR"),`${location.origin}${location.pathname}?track=${s.id}`,{width:140});
    const canvas=await html2canvas(el);
    const{jsPDF}=window.jspdf;
    const pdf=new jsPDF("p","mm","a4");
    pdf.addImage(canvas.toDataURL("image/png"),"PNG",10,10,190,130);
    pdf.save(`${s.id}.pdf`);
    el.remove();DB.addAudit("PRINT_SHIPMENT",s.id,`By ${AppState.user.name}`);
  },

  editUser(id){
    const u=AppState.users.find(x=>x.id===id);if(!u)return;
    Modals.open(`<div class="modal">
      <div class="modal-header"><h3>✏️ تعديل المستخدم</h3><button class="btn-icon" onclick="Modals.close()">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="field"><label>الاسم</label><input id="euName" value="${esc(u.name)}"/></div>
        <div class="field"><label>الهاتف</label><input id="euPhone" value="${esc(u.phone||"")}"/></div>
        <div class="field"><label>الدور</label>
          <select id="euRole">${["admin","merchant","courier","customer"].map(r=>`<option value="${r}" ${u.role===r?"selected":""}>${ROLE_MAP[r]?.label}</option>`).join("")}</select>
        </div>
        <div id="euErr" class="form-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modals.close()">إلغاء</button>
        <button class="btn btn-primary" id="saveEU">حفظ التغييرات</button>
      </div>
    </div>`);
    $("saveEU").addEventListener("click",async()=>{
      const name=$("euName").value.trim(),phone=$("euPhone").value.trim(),role=$("euRole").value;
      const errEl=$("euErr"),btn=$("saveEU");
      if(!name){errEl.style.display="block";errEl.textContent="الاسم مطلوب";return;}
      btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>`;
      const{error}=await db.from("profiles").update({full_name:name,phone,primary_role:role}).eq("id",id);
      if(error){errEl.style.display="block";errEl.textContent="خطأ: "+error.message;btn.disabled=false;btn.textContent="حفظ";return;}
      await DB.addAudit("EDIT_USER",id,`name=${name},role=${role}`);
      const idx=AppState.users.findIndex(x=>x.id===id);
      if(idx>=0)AppState.users[idx]={...AppState.users[idx],name,phone,role};
      Modals.close();rerenderContent();toast(`✅ تم تحديث ${name}`);
    });
  },

  async toggleUser(id) {
    const u = AppState.users.find(x => x.id === id);
    if (!u) return;
    const ns  = !(u.is_suspended || u.suspended);
    const btn = document.querySelector(`[onclick*="toggleUser('${id}')"]`);
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      const patch = ns
        ? { is_suspended: true,  suspended_at: new Date().toISOString(), suspended_by: AppState.user?.id || null }
        : { is_suspended: false, suspended_at: null, suspended_by: null };
      const { error } = await db.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
      // Update both field names so any older render path stays consistent
      u.is_suspended = ns;
      u.suspended    = ns;
      await DB.addAudit(
        ns ? "SUSPEND_USER" : "ACTIVATE_USER", id,
        `Target: ${u.name} | Email: ${u.email} | Role: ${u.role} | By: ${AppState.user.name}`,
        "user"
      );
      toast(`${ns ? "تم إيقاف" : "تم تفعيل"} ${u.name}`, ns ? "warning" : "success");
    } catch(err) {
      toast("فشل التحديث: " + err.message, "error");
    } finally {
      if (btn) btn.disabled = false;
      rerenderContent();
    }
  },

  async deleteUser(id) {
    const u = AppState.users.find(x => x.id === id);
    if (!u) return;
    if (!confirm(`حذف ${u.name}؟ سيتم إخفاؤه من القوائم مع الحفاظ على السجلات التاريخية.`)) return;
    const btn = document.querySelector(`[onclick*="deleteUser('${id}')"]`);
    if (btn) { btn.disabled = true; btn.innerHTML = "…"; }
    try {
      // SOFT DELETE ONLY — hard DELETE on profiles violates
      // shipment_timeline.actor_id FK constraint for any user
      // who ever appeared in a shipment's timeline.
      const { error } = await db.from("profiles").update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: AppState.user?.id || null
      }).eq("id", id);
      if (error) throw error;
      await DB.addAudit(
        "SOFT_DELETE_USER", id,
        `Target: ${u.name} | Email: ${u.email} | Role: ${u.role} | By: ${AppState.user.name}`,
        "user"
      );
      AppState.users = AppState.users.filter(x => x.id !== id);
      toast(`تم حذف ${u.name}`, "info");
    } catch(err) {
      toast("فشل الحذف: " + err.message, "error");
    } finally {
      if (btn) btn.disabled = false;
      rerenderContent();
    }
  },

  async loadAudit(){
    const el=$("auditContent");if(!el)return;
    el.innerHTML=`<div class="page-loader"><span class="spinner"></span></div>`;
    try{
      const logs=await DB.loadAuditLogs(AppState.auditFilter);
      if(!logs.length){el.innerHTML=`<div class="empty"><div class="empty-icon">📋</div><h3>لا يوجد سجل بعد</h3></div>`;return;}
      el.innerHTML=`<div class="table-wrap"><table>
        <thead><tr><th>الوقت</th><th>المستخدم</th><th>الدور</th><th>الإجراء</th><th>الهدف</th><th>التفاصيل</th></tr></thead>
        <tbody>
          ${logs.map(l=>`<tr>
            <td style="font-size:11px;color:var(--gray-400);white-space:nowrap;">${fmtTime(l.created_at)}</td>
            <td class="td-primary">${esc(l.actor_name||"—")}</td>
            <td><span class="badge ${ROLE_MAP[l.actor_role]?.badge||"badge-gray"}">${ROLE_MAP[l.actor_role]?.label||l.actor_role||"—"}</span></td>
            <td><span class="action-chip">${esc(l.action)}</span></td>
            <td class="td-mono">${esc(l.entity_id||"—")}</td>
            <td style="font-size:12px;color:var(--gray-500);">${esc(l.details||"—")}</td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
    }catch(err){el.innerHTML=`<p style="color:var(--danger);padding:1rem;">تعذر تحميل السجل: ${err.message}</p>`;}
  }
};

// ══════════════════════════════════════════════════════════
// TIMELINE LOADER
// ══════════════════════════════════════════════════════════
async function loadTimeline(shipmentCode){
  const el=document.querySelector(`#tlBox-${shipmentCode}`);if(!el)return;
  try{
    const items=await DB.loadTimeline(shipmentCode);
    if(!items.length){el.innerHTML=`<h4>${icon("log",13)} سجل الشحنة</h4><p style="color:var(--gray-400);font-size:13px;margin-top:8px;">لا يوجد سجل بعد</p>`;return;}
    el.innerHTML=`<h4>${icon("log",13)} سجل الشحنة</h4>
      <div class="tl-list">
        ${items.map((e,i)=>`<div class="tl-item">
          <div class="tl-dot ${i<items.length-1?"past":""}"></div>
          <div class="tl-content">
            <b>${esc(e.event)}</b>
            <small>${fmtTime(e.created_at)}</small>
            ${e.actor_name?`<div class="tl-actor">${esc(e.actor_name)} (${esc(e.actor_role)})</div>`:""}
          </div>
        </div>`).join("")}
      </div>`;
  }catch(err){el.innerHTML=`<h4>${icon("log",13)} سجل الشحنة</h4><p style="color:var(--danger);font-size:13px;">تعذر التحميل</p>`;}
}

// ══════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════
if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});

(async()=>{
  const params=new URLSearchParams(window.location.search);
  const trackId=params.get("track");
  if(trackId){
    AppState.selectedShipment=trackId;AppState.view="track";
    AppState.user={role:"customer",primary_role:"customer",id:"guest",name:"زائر"};
    AppState.shipments=await DB.loadShipments().catch(()=>[]);
    render();return;
  }
  const session=getSession();
  if(session?.id){
    const{data:{session:supa}}=await db.auth.getSession();
    if(supa?.user?.id===session.id){
      const profile = await DB.getProfile(session.id);
      if (profile?.is_suspended || profile?.is_deleted) {
        clearSession();
        AppState.page = "auth";
        AppState.authMode = "login";
        render();
        toast("هذا الحساب موقوف أو غير موجود. تواصل مع الإدارة.", "error");
        return;
      }
      // primary_role is the production column name
      // Resolve role from primary_role (production schema column)
      const role = profile?.primary_role
                || session.primary_role
                || session.role
                || "customer";

      AppState.user = {
        ...session,
        role,           // kept for legacy compatibility
        primary_role:  role,
        name:          profile?.full_name || session.name,
        phone:         profile?.phone     || session.phone || ""
      };
      AppState.page = "dashboard";
      AppState.view = role === "customer" ? "track"
                    : role === "courier"  ? "tasks"
                    : role === "merchant" ? "shipments"
                    : "overview";

      // Load permissions + all data in parallel — render AFTER all settle
      const [, ships, notifs, users, couriers] = await Promise.all([
        loadUserPermissions(session.id),       // fills AppPerms before render
        DB.loadShipments().catch(()=>[]),
        DB.loadNotifications(role).catch(()=>[]),
        (role === "admin" || role === "merchant")
          ? DB.loadUsers().catch(()=>[])
          : Promise.resolve([]),
        DB.loadCouriers().catch(()=>[])
      ]);

      // Commit atomically
      AppState.shipments     = ships;
      AppState.notifications = notifs;
      AppState.users         = users;
      AppState.couriers      = couriers;

      // Persist refreshed session
      saveSession(AppState.user);

      if (role === "admin") {
        startRealtime();
        const [merchants, branches, warehouses] = await Promise.all([
          DB.loadAllMerchants(),
          DB.loadBranches(),
          DB.loadWarehouses(),
        ]);
        AppState.allMerchants = merchants;
        AppState.branches     = branches;
        AppState.warehouses   = warehouses;
        // Mark as loaded so postRender()'s lazy-load guards don't
        // redundantly re-fetch the moment the user opens those tabs.
        AppState._branchDataLoaded = true;
      }
      if (role === "merchant") await App.loadMerchantData();
      if (role === "courier")  await App.loadMyWallet();

      // Single render — everything ready
      render();
      return;
    }
    clearSession();
  }
  AppState.shipments=await DB.loadShipments().catch(()=>[]);
  AppState.page="home";render();
})();
