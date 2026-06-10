// ═══════════════════════════════════════════════════════════
// AL-NUKHBA EXPRESS — app.js v6
// Clean Architecture · Fixed FK · Real Couriers · Pro UI
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = "https://urktddxiyzwsilddamci.supabase.co";
const SUPABASE_KEY = "sb_publishable_-0wKJXXI18TuHK7pe-dKYw_HWyjH79u";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── CONFIG ────────────────────────────────────────────────
const STATUS_MAP = {
  created:          { label:"تم إنشاء الشحنة",  badge:"badge-info",    step:0 },
  received:         { label:"تم الاستلام",       badge:"badge-warning", step:1 },
  warehouse:        { label:"في المخزن",         badge:"badge-warning", step:2 },
  hub:              { label:"مركز الفرز",        badge:"badge-brand",   step:3 },
  out_for_delivery: { label:"خرجت للتسليم",      badge:"badge-brand",   step:4 },
  delivered:        { label:"تم التسليم",        badge:"badge-success", step:5 },
  returned:         { label:"مرتجع",             badge:"badge-danger",  step:6 },
  cancelled:        { label:"ملغية",             badge:"badge-gray",    step:-1 }
};

const STATUS_STEPS = ["created","received","warehouse","hub","out_for_delivery","delivered"];

const ROLE_MAP = {
  admin:    { label:"إدارة",  badge:"badge-danger",  nav:["overview","shipments","tasks","accounts","reports","users","audit","track"] },
  merchant: { label:"تاجر",  badge:"badge-success", nav:["overview","shipments","accounts"] },
  courier:  { label:"مندوب", badge:"badge-brand",   nav:["tasks","accounts"] },
  customer: { label:"عميل",  badge:"badge-info",    nav:["track","accounts"] }
};

const NAV_LABELS = {
  overview:"الرئيسية", shipments:"الشحنات", tasks:"مهامي",
  accounts:"الحساب",   reports:"التقارير",  users:"المستخدمين",
  audit:"سجل النشاط",  track:"تتبع"
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
  query:"", statusFilter:"all", selectedShipment:null,
  userFilter:"", auditFilter:"",
  shipments:[], users:[], couriers:[], notifications:[],
  realtimeChannel:null,
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
    const{data,error}=await db.from("profiles").select("*").order("created_at",{ascending:false});
    if(error){console.warn("loadUsers:",error.message);return[];}
    return(data||[]).map(u=>({
      id:u.id,name:u.full_name||"—",email:u.email||"—",phone:u.phone||"—",
      role:u.primary_role||"customer",isActive:u.is_active!==false,suspended:u.is_suspended||false,
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
  async uploadPOD(shipmentCode,file) {
    const ext=file.name.split(".").pop()||"jpg";
    const path=`pod_${shipmentCode}_${Date.now()}.${ext}`;
    const{error:upErr}=await db.storage.from("pod-images").upload(path,file,{upsert:true});
    if(upErr)throw upErr;
    const{data}=db.storage.from("pod-images").getPublicUrl(path);
    return data.publicUrl;
  }
};

function mapRow(r) {
  return {
    id:r.shipment_code, merchantId:r.merchant_id||null,
    merchantName:r.merchant_name||"", merchantPhone:r.merchant_phone||"",
    courierId:r.courier_id||null, courierName:r.courier_name||"",
    customerName:r.customer_name||"", customerPhone:r.customer_phone||"",
    customerPhone2:r.customer_phone2||"", address:r.address_full||r.address||"",
    governorate:r.governorate||"", city:r.city||"", street:r.street||"",
    building:r.building||"", floor:r.floor||"", apartment:r.apartment||"",
    amount:Number(r.amount)||0, deliveryFee:Number(r.delivery_fee)||60,
    status:r.status||"created", eta:r.eta||"", attempts:r.delivery_attempts||r.attempts||0,
    podUrl:r.pod_url||null, notes:r.notes||"",
    createdBy:r.created_by||null, createdAt:r.created_at, updatedAt:r.updated_at,
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
    return(!q||txt.includes(q))&&(AppState.statusFilter==="all"||s.status===AppState.statusFilter);
  });
}

// ── REALTIME ──────────────────────────────────────────────
function startRealtime() {
  if(AppState.realtimeChannel)return;
  AppState.realtimeChannel=db.channel("rt_v6")
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"shipments"},p=>{
      const s=mapRow(p.new);AppState.shipments.unshift(s);
      DB.addNotification(`شحنة جديدة: ${s.id} — ${s.customerName}`,"admin");
      if((AppState.user?.primary_role||AppState.user?.role)==="admin")rerenderContent();
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"shipments"},p=>{
      const idx=AppState.shipments.findIndex(s=>s.id===p.new.shipment_code);
      if(idx>=0){AppState.shipments[idx]={...AppState.shipments[idx],...mapRow(p.new)};rerenderContent();}
    })
    .subscribe();
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
    if (role === "admin") startRealtime();

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
    case"shipments":return viewShipments();
    case"tasks":    return viewTasks();
    case"accounts": return viewAccounts();
    case"reports":  return viewReports();
    case"track":    return viewTrack();
    case"users":    return viewUsers();
    case"audit":    return viewAudit();
    default:        return viewOverview();
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
    <thead><tr><th>الكود</th><th>العميل</th><th>الهاتف</th><th>المنطقة</th><th>الحالة</th><th>المبلغ</th><th>التاجر</th><th>المندوب</th><th>إجراءات</th></tr></thead>
    <tbody>
      ${list.map(s=>`<tr>
        <td><div class="td-mono">${esc(s.id)}</div><div style="font-size:11px;color:var(--gray-400);margin-top:2px;">${fmtDate(s.createdAt)}</div></td>
        <td class="td-primary">${esc(s.customerName)}</td>
        <td class="td-phone">
          <a href="tel:${esc(s.customerPhone)}">${esc(s.customerPhone)}</a>
          ${s.customerPhone2?`<br/><a href="tel:${esc(s.customerPhone2)}" style="font-size:11px;color:var(--gray-500);">${esc(s.customerPhone2)}</a>`:""}
        </td>
        <td style="font-size:12px;">${esc(s.governorate||s.address?.split("-")[0]||"—")}</td>
        <td><span class="badge ${STATUS_MAP[s.status]?.badge||"badge-gray"}">${STATUS_MAP[s.status]?.label||s.status}</span></td>
        <td style="font-weight:600;">${money(s.amount)}</td>
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
      <div class="filter-bar">
        ${["all","created","received","warehouse","hub","out_for_delivery","delivered","returned","cancelled"].map(st=>`
          <button class="filter-btn ${AppState.statusFilter===st?"active":""}" onclick="App.setFilter('${st}')">
            ${st==="all"?"الكل":STATUS_MAP[st]?.label||st}
          </button>`).join("")}
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
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
          ${["received","warehouse","hub","out_for_delivery"].map(st=>`
            <button class="btn btn-secondary btn-sm" onclick="App.updateStatus('${esc(s.id)}','${st}')">${STATUS_MAP[st].label}</button>`).join("")}
          <button class="btn btn-primary btn-sm" onclick="App.updateStatus('${esc(s.id)}','delivered')">✅ تم التسليم</button>
          <button class="btn btn-sm" style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger-border);"
            onclick="App.updateStatus('${esc(s.id)}','returned')">↩ مرتجع</button>
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
              <input type="file" id="pod-${esc(s.id)}" accept="image/*" style="display:none" onchange="App.uploadPOD('${esc(s.id)}','pod-${esc(s.id)}')"/></label>`:""}
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
      ${s.podUrl?`<div style="margin-top:12px;"><div style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;margin-bottom:8px;">إثبات التسليم</div>
        <img src="${esc(s.podUrl)}" style="width:150px;border-radius:var(--radius);border:2px solid var(--gray-200);"/></div>`:""}
      <div class="timeline" id="tlBox-${esc(s.id)}" style="margin-top:20px;">
        <h4>${icon("log",13)} سجل الأحداث</h4>
        <div class="page-loader"><span class="spinner"></span></div>
      </div>
    </div>`;
}

// ── ACCOUNTS VIEW ─────────────────────────────────────────
function viewAccounts() {
  if((AppState.user.primary_role||AppState.user.role)==="customer") return `<div class="empty">
    <div class="empty-icon">📦</div><h3>تتبع شحنتك</h3>
    <p>أدخل رقم الشحنة لمعرفة حالتها</p>
    <button class="btn btn-primary" onclick="App.manualTrack()">🔍 تتبع شحنة</button>
  </div>`;
  const list=visible(),del=list.filter(s=>s.status==="delivered");
  const rev=del.reduce((a,s)=>a+(s.amount||0),0),fee=del.reduce((a,s)=>a+(s.deliveryFee||0),0);
  const pay=(AppState.user.primary_role||AppState.user.role)==="courier"?del.length*25:rev-fee;
  return `
    <div class="acct-header">
      <div><div class="ah-label">الرصيد المستحق</div><div class="ah-val">${money(pay)}</div></div>
      <button class="btn-ghost-white" style="border-color:rgba(255,255,255,.4);">طلب تسوية</button>
    </div>
    <div class="kpi-grid" style="margin-bottom:20px;">
      ${kpi("تحصيلات",money(rev),"wallet","var(--success)","var(--success-bg)")}
      ${kpi("رسوم الشحن",money(fee),"truck","var(--danger)","var(--danger-bg)")}
      ${kpi("الصافي",money(rev-fee),"chart","var(--brand)","var(--brand-light)")}
    </div>
    <div class="card"><h3 class="card-title" style="margin-bottom:14px;">${icon("chart")} كشف الحساب</h3>${shipTable(del)}</div>`;
}

// ── REPORTS VIEW ──────────────────────────────────────────
function viewReports() {
  const list=visible(),total=list.length||1;
  return `
    <div class="kpi-grid">
      ${Object.entries(STATUS_MAP).filter(([k])=>k!=="cancelled").map(([k,v])=>kpi(v.label,list.filter(s=>s.status===k).length,"box","var(--brand)","var(--brand-light)",k)).join("")}
    </div>
    <div class="card">
      <h3 class="card-title" style="margin-bottom:16px;">${icon("chart")} مؤشرات الأداء</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
        ${[["إجمالي الشحنات",list.length],["نسبة التسليم",pct(list.filter(s=>s.status==="delivered").length,total)+"%"],
           ["نسبة المرتجع",pct(list.filter(s=>s.status==="returned").length,total)+"%"],
           ["إجمالي المبالغ",money(list.reduce((a,s)=>a+(s.amount||0),0))],
           ["إجمالي الرسوم",money(list.reduce((a,s)=>a+(s.deliveryFee||0),0))],
           ["صافي المستحق",money(list.filter(s=>s.status==="delivered").reduce((a,s)=>a+(s.amount-s.deliveryFee),0))]
          ].map(([l,v])=>`<div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius);padding:14px;">
            <div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">${l}</div>
            <div style="font-size:20px;font-weight:800;">${v}</div>
          </div>`).join("")}
      </div>
    </div>`;
}

// ── USERS VIEW ────────────────────────────────────────────
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
    btn.addEventListener("click",()=>{AppState.view=btn.dataset.view;AppState.statusFilter="all";rerenderContent();});
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

    // Full re-render — renderDashboard rebuilds shell + content
    renderDashboard();
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
          <div class="field"><label>موعد التسليم</label><input id="fEta" placeholder="مثال: خلال 48 ساعة"/></div>
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

    $("fGov").addEventListener("change", e => {
      const cities = (EGYPT_GOV[e.target.value] || []);
      $("fCity").innerHTML = `<option value="">اختر المدينة / المركز</option>` +
        cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    });

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
      // No 'address' column — schema computes address_full from parts automatically
      btn.disabled=true; btn.innerHTML=`<span class="spinner"></span> جاري الحفظ...`;
      try {
        const { data:{ session } } = await db.auth.getSession();
        const uid         = session?.user?.id || AppState.user?.id || null;
        const isMerchant  = (AppState.user.primary_role||AppState.user.role) === "merchant";
        await DB.createShipment({
          shipment_code:   code,
          customer_name:   cName,
          customer_phone:  cPhone,
          customer_phone2: cPhone2 || null,
          // Address parts — address_full is GENERATED ALWAYS in the DB
          governorate: gov,
          city:        city   || null,
          street:      street || null,
          building:    build  || null,
          floor:       floor  || null,
          apartment:   null,   // field reserved for future use
          // Financials
          amount:       amount,
          delivery_fee: fee,
          // Status
          status: "created",
          eta:    eta || null,
          notes:  notes || null,
          // Merchant (snapshot at creation time — no FK risk)
          merchant_id:    isMerchant ? uid  : null,
          merchant_name:  isMerchant ? (AppState.user.name  || "") : null,
          merchant_phone: isMerchant ? (AppState.user.phone || "") : null,
          // Courier (optional at creation)
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
const App={
  setFilter(f){AppState.statusFilter=f;rerenderContent();},
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

  exportExcel(){
    if(!can("export_excel")){toast("غير مصرح","error");return;}
    const data=visible().map(s=>({
      "الكود":s.id,"العميل":s.customerName,"الهاتف":s.customerPhone,"هاتف 2":s.customerPhone2||"",
      "المحافظة":s.governorate,"العنوان":s.address,"الحالة":STATUS_MAP[s.status]?.label||s.status,
      "المبلغ":s.amount,"الرسوم":s.deliveryFee,"التاجر":s.merchantName||"","المندوب":s.courierName||"",
      "تاريخ الإنشاء":fmtDate(s.createdAt)
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

  async toggleUser(id){
    const u=AppState.users.find(x=>x.id===id);if(!u)return;
    const ns=!u.is_suspended;
    const{error}=await db.from("profiles").update({is_suspended:ns}).eq("id",id);
    if(error){toast("فشل التحديث","error");return;}
    u.is_suspended=ns;
    await DB.addAudit(ns?"SUSPEND_USER":"ACTIVATE_USER",id,`by ${AppState.user.name}`);
    toast(`${ns?"تم إيقاف":"تم تفعيل"} ${u.name}`);rerenderContent();
  },

  async deleteUser(id){
    const u=AppState.users.find(x=>x.id===id);if(!u)return;
    if(!confirm(`حذف ${u.name}؟ لا يمكن التراجع.`))return;
    const{error}=await db.from("profiles").delete().eq("id",id);
    if(error){toast("فشل الحذف: "+error.message,"error");return;}
    await DB.addAudit("DELETE_USER",id,`by ${AppState.user.name}`);
    AppState.users=AppState.users.filter(x=>x.id!==id);
    toast(`تم حذف ${u.name}`,"info");rerenderContent();
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

      if (role === "admin") startRealtime();

      // Single render — everything ready
      render();
      return;
    }
    clearSession();
  }
  AppState.shipments=await DB.loadShipments().catch(()=>[]);
  AppState.page="home";render();
})();


$("menuToggle")?.addEventListener("click",()=>{
    console.log("MENU CLICKED");

    $("sidebar")?.classList.toggle("open");
    $("sbOverlay")?.classList.toggle("active");

    console.log(
      $("sidebar")?.className,
      $("sbOverlay")?.className
    );
});