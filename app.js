
const SUPABASE_URL = "https://urktddxiyzwsilddamci.supabase.co";

const SUPABASE_KEY = "sb_publishable_-0wKJXXI18TuHK7pe-dKYw_HWyjH79u";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let users = JSON.parse(
  localStorage.getItem(
    "nukhba_users"
  )
) || [

  {
    id: "u1",
    name: "أحمد الشرقاوي",
    role: "merchant",
    phone: "01000000001",
    password: "123456",
    balance: 18450
  },

  {
    id: "u2",
    name: "منى علي",
    role: "courier",
    phone: "01000000002",
    password: "123456",
    balance: 3250
  },

  {
    id: "u3",
    name: "كريم محمود",
    role: "customer",
    phone: "01000000003",
    password: "123456",
    balance: 0
  },

  {
    id: "u4",
    name: "مدير التشغيل",
    role: "admin",
    phone: "01000000000",
    password: "123456",
    balance: 0
  }

];

let shipments = [
  {
    id: "NE-20419",
    merchantId: "u1",
    courierId: null,
    customerId: "u3",
    customerName: "كريم محمود",
    customerPhone: "01000000003",
    address: "مدينة نصر، القاهرة",
    status: "out_for_delivery",
    amount: 850,
    deliveryFee: 65,
    createdAt: "2026-05-06",
    eta: "اليوم 7:30 م",
    notes: "اتصال قبل الوصول",
    timeline: [
      ["تم إنشاء الطلب", "2026-05-06 10:15 ص"],
      ["استلام من التاجر", "2026-05-06 3:40 م"],
      ["في المخزن", "2026-05-06 8:05 م"],
      ["خرج للتسليم", "2026-05-07 11:20 ص"]
    ]
    
  },
  {
    id: "NE-20420",
    merchantId: "u1",
    courierId: null,
    customerId: "u3",
    customerName: "سارة ناصر",
    customerPhone: "01055512111",
    address: "الهرم، الجيزة",
    status: "delivered",
    amount: 1250,
    deliveryFee: 75,
    createdAt: "2026-05-05",
    eta: "تم التسليم",
    notes: "دفع نقدي",
    timeline: [
      ["تم إنشاء الطلب", "2026-05-05 9:15 ص"],
      ["استلام من التاجر", "2026-05-05 12:10 م"],
      ["خرج للتسليم", "2026-05-06 10:00 ص"],
      ["تم التسليم", "2026-05-06 2:25 م"]
    ]
  },
  {
    id: "NE-20421",
    merchantId: "u1",
    courierId: null,
    customerId: null,
    customerName: "محمد سمير",
    customerPhone: "01122245454",
    address: "طنطا، الغربية",
    status: "warehouse",
    amount: 420,
    deliveryFee: 55,
    createdAt: "2026-05-07",
    eta: "غدًا",
    notes: "قابل للكسر",
    timeline: [
      ["تم إنشاء الطلب", "2026-05-07 9:45 ص"],
      ["في المخزن", "2026-05-07 1:10 م"]
    ]
  },
  {
    id: "NE-20422",
    merchantId: "u1",
    courierId: null,
    customerId: null,
    customerName: "هبة مصطفى",
    customerPhone: "01233377788",
    address: "الإسكندرية، سموحة",
    status: "returned",
    amount: 690,
    deliveryFee: 60,
    createdAt: "2026-05-04",
    eta: "راجع للتاجر",
    notes: "العميل غير متاح",
    timeline: [
      ["تم إنشاء الطلب", "2026-05-04 1:00 م"],
      ["خرج للتسليم", "2026-05-05 12:30 م"],
      ["محاولة تسليم فاشلة", "2026-05-05 5:40 م"],
      ["راجع للتاجر", "2026-05-06 10:20 ص"]
    ]
  }
];
let notifications = [];
const statusMeta = {

  created: {
    label: "تم إنشاء الشحنة",
    tone: "info"
  },

  received: {
    label: "تم استلام الشحنة",
    tone: "warning"
  },
warehouse: {
  label: "في المخزن",
  tone: "warning"
},
  hub: {
    label: "وصلت لمركز الفرز",
    tone: "primary"
  },

  out_for_delivery: {
    label: "خرجت للتسليم",
    tone: "primary"
  },

  delivered: {
    label: "تم التسليم",
    tone: "success"
  }

};

const navByRole = {
  admin: [
  "overview",
  "shipments",
  "tasks",
  "accounts",
  "reports",
  "users",
  "track"
  
],
  merchant: ["overview", "shipments", "accounts"],
  courier: ["overview", "tasks", "accounts"],
  customer: ["track", "accounts"]
};

const labels = {
  overview: "الرئيسية",
  shipments: "الشحنات",
  tasks: "المهام",
  accounts: "الحساب",
  reports: "التقارير",
  users: "المستخدمين",
  track: "تتبع"
};
const permissions = {

  admin: [
    "create_shipment",
    "edit_shipment",
    "delete_shipment",
    "assign_courier",
    "view_reports",
    "manage_users",
    "export_excel",
    "change_status",
    "view_all"
  ],

  merchant: [
    "create_shipment",
    "view_own",
    "track",
    "view_accounts"
  ],

  courier: [
    "view_assigned",
    "change_status",
    "upload_pod",
    "navigation"
  ],

  customer: [
    "track"
  ]

};
function can(permission) {

  return permissions[
    state.user?.role
  ]?.includes(permission);

}
let state = {
  user: JSON.parse(localStorage.getItem("AL NUKHBA EXPRESS_user") || "null"),
  view: "overview",
  query: "",
  statusFilter: "all",
  selectedShipment: "NE-20419"
};

function money(value) {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(value);
}

function icon(name) {
  const icons = {
    box: "M20.5 7.3 12 2.5 3.5 7.3 12 12.1l8.5-4.8ZM3.5 7.3v9.4L12 21.5v-9.4L3.5 7.3Zm17 0L12 12.1v9.4l8.5-4.8V7.3Z",
    truck: "M3 7h11v9H3V7Zm11 3h4l3 4v2h-7v-6ZM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0H5Z",
    wallet: "M4 6h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Zm13 7h4v-2h-4a2 2 0 0 0 0 4h4v-2h-4Z",
    search: "M10 4a6 6 0 1 0 3.7 10.7l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4Z",
    plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
    chart: "M4 19V5h2v14H4Zm7 0V9h2v10h-2Zm7 0V3h2v16h-2Z",
    logout: "M5 4h8v2H7v12h6v2H5V4Zm10.5 4.5L20 13l-4.5 4.5-1.4-1.4 2.1-2.1H10v-2h6.2l-2.1-2.1 1.4-1.4Z"
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]}"/></svg>`;
}

function roleName(role) {
  return { admin: "إدارة", merchant: "تاجر", courier: "مندوب", customer: "عميل" }[role];
}

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

function visibleShipments() {

  let list = [...shipments];
  if (
  state.user?.role === "courier"
) {
console.log(
  "USER ID:",
  state.user.id
);

console.log(
  "SHIPMENTS:",
  list
);
  list = list.filter(
    shipment =>
      shipment.courierId ===
state.user?.id
  );
}

  return list.filter((shipment) => {

    const text =
      `
        ${shipment.id}
        ${shipment.customerName}
        ${shipment.customerPhone}
        ${shipment.address}
      `.toLowerCase();

    const matchesSearch =
      text.includes(
        state.query
          .trim()
          .toLowerCase()
      );

    const matchesStatus =
      state.statusFilter === "all"
        ? true
        : shipment.status === state.statusFilter;

    return (
      matchesSearch &&
      matchesStatus
    );

  });

}

function stats(list) {
  return [
    { label: "كل الشحنات", value: list.length, icon: "box" },
    { label: "خارج للتسليم", value: list.filter((s) => s.status === "out_for_delivery").length, icon: "truck" },
    { label: "تم التسليم", value: list.filter((s) => s.status === "delivered").length, icon: "chart" },
    { label: "المستحق", value: money(list.reduce((sum, s) => sum + (s.status === "delivered" ? s.amount - s.deliveryFee : 0), 0)), icon: "wallet" }
  ];
}

function loginScreen() {
  return `
    <main class="login-shell">
      <section class="login-panel">
        <div class="brand-mark">${icon("truck")}</div>
        <h1>النخبة للشحن السريع</h1>
        <p>منصة ذكية متكاملة لإدارة الشحن والتوصيل والتتبع والتحصيل بأعلى كفاءة.</p>
        <form id="loginForm" class="login-form">
          <label>البريد الإلكتروني
            <input name="phone" type="email" inputmode="tel" value="merchant@nukhba.com" autocomplete="username" />
          </label>
          <label>كلمة المرور
            <input name="password" type="password" value="123456" autocomplete="current-password" />
          </label>
          <button class="primary-btn" type="submit">${icon("user")} دخول</button>
        </form>
        <div class="demo-users">
  <button data-demo="admin@nukhba.com">إدارة</button>
  <button data-demo="merchant@nukhba.com">تاجر</button>
  <button data-demo="courier@nukhba.com">مندوب</button>
  <button data-demo="customer@nukhba.com">عميل</button>
</div>
      </section>
      <section class="app-preview" aria-label="ملخص تشغيل">
        <div class="preview-top">
          <span>تحديث مباشر</span>
          <strong>96%</strong>
        </div>
        <div class="route-line"></div>
        <div class="preview-card"><b>ANE-20419</b><span>خارج للتسليم</span></div>
        <div class="preview-card"><b>تحصيل اليوم</b><span>${money(2100)}</span></div>
      </section>
    </main>
  `;
}

function shell(content) {
  const views = navByRole[state.user.role];
  return `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark small">${icon("truck")}</div>
          <div><strong>النخبة للشحن السريع</strong><span>لوحة الشحن</span></div>
        </div>
        <nav>
          ${views.map((view) => `<button class="${state.view === view ? "active" : ""}" data-view="${view}">${labels[view]}</button>`).join("")}
        </nav>
        <button class="ghost-btn logout" id="logoutBtn">${icon("logout")} خروج</button>
      </aside>
      <main class="content">
        <header class="topbar">
          <div>
            <span class="eyebrow">${state.user.role === "admin" ? `

<select
  id="roleSwitcher"
  class="role-switcher"
>

  <option value="">
    تبديل الواجهة
  </option>

  <option value="admin">
    Admin
  </option>

  <option value="merchant">
    Merchant
  </option>

  <option value="courier">
    Courier
  </option>

  <option value="customer">
    Customer
  </option>

</select>

` : ""}${roleName(state.user.role)}</span>
            <h2>أهلاً، ${state.user.name}</h2>
          </div>
          <div class="search-box">
            ${icon("search")}
            <input id="searchInput" value="${state.query}" placeholder="ابحث برقم الشحنة أو العميل" />
          </div>
        </header>
        ${content}
      </main>
    </div>
  `;
}

function overview() {
  const list = visibleShipments();
  return `
    <section class="stats-grid">
      ${stats(list).map((item) => `
        <article class="stat">
          <div>${icon(item.icon)}</div>
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </article>
      `).join("")}
    </section>
    <section class="work-grid">
      <div class="panel wide">
        <div class="section-head">
          <h3>آخر الشحنات</h3>
          <button
  class="ghost-btn"
  id="openScanner"
>
  📷 Scan QR
</button>
          ${can("create_shipment") ? `<button class="primary-btn compact" id="newShipmentBtn">${icon("plus")} شحنة جديدة</button>` : ""}
        </div>
        ${shipmentTable(list.slice(0, 6))}
      </div>
      <div class="panel">
        <h3>تنبيهات التشغيل</h3>
        <div class="alert-list">
          <div><b>2</b><span>شحنات تحتاج تأكيد عنوان</span></div>
          <div><b>1</b><span>مرتجع ينتظر مراجعة التاجر</span></div>
          <div><b>4</b><span>تحصيلات جاهزة للمراجعة</span></div>
        </div>
        <div class="notifications-card">

  <h3>
    🔔 الإشعارات
  </h3>

  ${
    notifications.length
      ? notifications
          .slice(0,5)
          .map(
            n => `
              <div
                class="notification-item"
              >

                <strong>
                  ${n.text}
                </strong>

                <small>
                  ${n.time}
                </small>

              </div>
            `
          )
          .join("")
      : `
        <p>
          لا توجد إشعارات
        </p>
      `
  }

</div>
      </div>
      <section class="panel charts-panel">

  <div class="chart-box">
    <canvas id="statusChart"></canvas>
  </div>

</section>
    </section>
  `;
}

function shipmentTable(list) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>الشحنة</th>
            <th>العميل</th>
            <th>العنوان</th>
            <th>الحالة</th>
            <th>المبلغ</th>
            <th>الإجراءات</th>
          </tr>
        </thead>

        <tbody>

          ${list.map((shipment) => `

            <tr>

              <td>
                <b>${shipment.id}</b>
                <span>${shipment.createdAt}</span>
              </td>

              <td>
                ${shipment.customerName}
                <span>${shipment.customerPhone}</span>
              </td>

              <td>
                ${shipment.address}
              </td>

              <td>
                <span class="badge ${statusMeta[shipment.status].tone}">
                  ${statusMeta[shipment.status].label}
                </span>
              </td>

              <td>
                ${money(shipment.amount)}
              </td>

              <td>

                <div class="shipment-actions">

                  <button
                    class="link-btn"
                    data-open="${shipment.id}"
                  >
                    عرض
                  </button>

                  <button
                    class="link-btn"
                    onclick="printShipment('${shipment.id}')"
                  >
                    طباعة
                  </button>

                  <div class="qr-box">
                    <canvas id="qr-${shipment.id}"></canvas>
                  </div>

                </div>

              </td>

            </tr>

          `).join("")}

        </tbody>
      </table>
    </div>
  `;
}

function shipmentsView(title = "إدارة الشحنات") {

  return `

    <section class="panel">

      <div class="section-head">

        <h3>${title}</h3>
         <div class="filter-row">

  <button
    onclick="setStatusFilter('all')"
    class="ghost-btn"
  >
    الكل
  </button>

  <button
    onclick="setStatusFilter('created')"
    class="ghost-btn"
  >
    جديد
  </button>

  <button
    onclick="setStatusFilter('warehouse')"
    class="ghost-btn"
  >
    المخزن
  </button>

  <button
    onclick="setStatusFilter('out_for_delivery')"
    class="ghost-btn"
  >
    خرج للتسليم
  </button>

  <button
    onclick="setStatusFilter('delivered')"
    class="ghost-btn"
  >
    تم التسليم
  </button>

  <button
    onclick="setStatusFilter('returned')"
    class="ghost-btn"
  >
    مرتجع
  </button>

</div>

        <div
  style="
    display:flex;
    gap:10px;
  "
>

  <button
    class="ghost-btn"
    onclick="manualTrackShipment()"
  >
    📦 تتبع شحنة
  </button>

  <button
    class="ghost-btn"
    onclick="exportShipmentsExcel()"
  >
    📊 تصدير Excel
  </button>

  <button
    class="primary-btn compact"
    id="newShipmentBtn"
  >
    ${icon("plus")} إضافة
  </button>

</div>
      </div>

      ${shipmentTable(visibleShipments())}

    </section>

    ${detailsPanel(
      shipments.find(
        (shipment) =>
          shipment.id === state.selectedShipment
      ) || visibleShipments()[0]
    )}

  `;
}

function tasksView() {
  const list = visibleShipments().filter((shipment) => shipment.status !== "delivered");
  return `
    <section class="task-list">
      ${list.map((shipment) => `
        <article class="task-card">
          <div>
            <span class="badge ${statusMeta[shipment.status].tone}">${statusMeta[shipment.status].label}</span>
            <h3>${shipment.customerName}</h3>
            <p>${shipment.address}</p>
          </div>
          <div class="task-actions">

  <a
    class="ghost-btn"
    href="tel:${shipment.customerPhone}"
  >
    اتصال
  </a>
<a
  class="ghost-btn"
  target="_blank"
  href="
https://www.google.com/maps/dir/?api=1&destination=
${encodeURIComponent(shipment.address)}
  "
>
  🚚 ابدأ الملاحة
</a>
</a>
  <input
    type="file"
    id="pod-${shipment.id}"
    accept="image/*"
  />

  <button
    class="ghost-btn"
    onclick="uploadPOD('${shipment.id}','pod-${shipment.id}')"
  >
    رفع إثبات
  </button>

  <button
    class="primary-btn compact"
    data-deliver="${shipment.id}"
  >
    تم التسليم
  </button>

</div>
        </article>
      `).join("")}
    </section>
  `;
}

function detailsPanel(shipment) {
  if (!shipment) return "";
  return `
    <section class="panel details">
      <div class="section-head">
        <h3>${shipment.id}</h3>
        <span class="badge ${statusMeta[shipment.status].tone}">${statusMeta[shipment.status].label}</span>
      </div>
      <div class="detail-grid">
        <div><span>العميل</span><b>${shipment.customerName}</b></div>
        <div><span>الهاتف</span><b>${shipment.customerPhone}</b></div>
        <div><span>العنوان</span><b>${shipment.address}</b></div>
        <div><span>الوصول المتوقع</span><b>${shipment.eta}</b></div>
        <div><span>قيمة الطلب</span><b>${money(shipment.amount)}</b></div>
        <div><span>رسوم الشحن</span><b>${money(shipment.deliveryFee)}</b></div>
      </div>
      <div class="assign-box">

  <select id="assignCourier">

    <option value="">
      اختر مندوب
    </option>

    <option value="f8805493-c40e-450f-a5d7-9b18842d7016">
  المندوب الرئيسي
</option>

  </select>

  <button
    class="ghost-btn"
    onclick="assignCourier('${shipment.id}')"
  >
    تعيين
  </button>

</div>
${state.user?.role === "courier" ? `

<div class="pod-upload">

  <input
    type="file"
    id="podImage"
    accept="image/*"
  />

  <button
    class="ghost-btn"
    onclick="uploadPOD('${shipment.id}')"
  >
    رفع إثبات التسليم
  </button>

</div>

` : ""}
      <div class="status-actions">

  <button
    onclick="updateShipmentStatus('${shipment.id}','received')"
    class="ghost-btn"
  >
    تم الاستلام
  </button>

  <button
    onclick="updateShipmentStatus('${shipment.id}','hub')"
    class="ghost-btn"
  >
    مركز الفرز
  </button>

  <button
    onclick="updateShipmentStatus('${shipment.id}','out_for_delivery')"
    class="ghost-btn"
  >
    خرج للتسليم
  </button>

  <button
    onclick="updateShipmentStatus('${shipment.id}','delivered')"
    class="primary-btn compact"
  >
    تم التسليم
  </button>

</div>
${shipment.podImage ? `

  <div class="pod-preview">

    <h4>إثبات التسليم</h4>

    <img
      src="${shipment.podImage}"
      style="
        width:220px;
        border-radius:12px;
        margin-top:10px;
      "
    />

  </div>

` : ""}
      <div class="tracking-progress">

  ${[
    "created",
    "received",
    "hub",
    "out_for_delivery",
    "delivered"
  ].map((step, index, arr) => {

    const currentIndex =
      arr.indexOf(shipment.status);

    const done =
      index <= currentIndex;

    return `

      <div class="progress-step">

        <div
          class="
            progress-circle
            ${done ? "done" : ""}
          "
        >
          ${done ? "✓" : ""}
        </div>

        <span>
          ${statusMeta[step].label}
        </span>

      </div>

      ${
        index < arr.length - 1
        ? `
          <div
            class="
              progress-line
              ${index < currentIndex ? "done" : ""}
            "
          ></div>
        `
        : ""
      }

    `;

  }).join("")}

</div>
    </section>
  `;
}

function trackView() {

  const shipment =
    shipments.find(
      (item) =>
        item.id === state.selectedShipment
    );
  if (!shipment) {
    return `
      <section class="panel">
        <h3>لا توجد شحنات حالياً</h3>
        <p>لم يتم ربط أي شحنة بهذا الحساب بعد.</p>
      </section>
    `;
  }

  return `
    <section class="track-hero">
      <div>
        <span class="eyebrow">تتبع الشحنة</span>
        <h2>${shipment.id}</h2>
        <p>${shipment.customerName} - ${shipment.address}</p>
      </div>
      <span class="badge ${statusMeta[shipment.status].tone}">
        ${statusMeta[shipment.status].label}
      </span>
    </section>
    ${detailsPanel(shipment)}
  `;
}

function accountsView() {
  const list = visibleShipments();
  const delivered = list.filter((shipment) => shipment.status === "delivered");
  const revenue = delivered.reduce((sum, shipment) => sum + shipment.amount, 0);
  const fees = delivered.reduce((sum, shipment) => sum + shipment.deliveryFee, 0);
  const payable = state.user.role === "courier" ? delivered.length * 25 + state.user.balance : revenue - fees + state.user.balance;
  return `
    <section class="account-band">
      <div>
        <span>الرصيد الحالي</span>
        <strong>${money(payable)}</strong>
      </div>
      <button class="primary-btn compact">طلب تسوية</button>
    </section>
    <section class="stats-grid two">
      <article class="stat"><div>${icon("wallet")}</div><span>تحصيلات</span><strong>${money(revenue)}</strong></article>
      <article class="stat"><div>${icon("truck")}</div><span>رسوم شحن</span><strong>${money(fees)}</strong></article>
    </section>
    <section class="panel">
      <h3>كشف الحساب</h3>
      ${shipmentTable(delivered)}
    </section>
  `;
}

function reportsView() {
  const list = visibleShipments();
  return `
    <section class="stats-grid">
      ${Object.keys(statusMeta).map((status) => `
        <article class="stat mini"><span>${statusMeta[status].label}</span><strong>${list.filter((s) => s.status === status).length}</strong></article>
      `).join("")}
    </section>
    <section class="panel">
      <h3>اقتراحات احترافية للنسخة النهائية</h3>
      <div class="feature-list">
        <div>رسائل واتساب تلقائية عند تغيير حالة الشحنة.</div>
        <div>خريطة خطوط سير للمندوبين وتوزيع تلقائي حسب المنطقة.</div>
        <div>طباعة بوليصة شحن وملصق QR لكل طلب.</div>
        <div>ربط دفع إلكتروني وتحويلات لحسابات التجار.</div>
      </div>
    </section>
  `;
}
function usersView() {

  if (!can("manage_users")) {

    return `
      <section class="panel">
        <h3>
          غير مصرح
        </h3>
      </section>
    `;
  }

  return `

    <section class="panel">

      <div class="section-head">

        <h3>
          إدارة المستخدمين
        </h3>

        <button
          class="primary-btn compact"
          id="addUserBtn"
        >
          ${icon("plus")}
          مستخدم جديد
        </button>

      </div>

      <div class="table-wrap">

        <table>

          <thead>

            <tr>
              <th>الاسم</th>
              <th>الدور</th>
              <th>الهاتف</th>
              <th>الإجراءات</th>
            </tr>

          </thead>

          <tbody>

            ${users.map(user => `

              <tr>

                <td>
                  ${user.name}
                </td>

                <td>
                  ${roleName(user.role)}
                </td>

                <td>
                  ${user.phone}
                </td>

                <td>

                  <button
                    class="link-btn"
                    onclick="deleteUser('${user.id}')"
                  >
                    حذف
                  </button>

                </td>

              </tr>

            `).join("")}

          </tbody>

        </table>

      </div>

    </section>

  `;
}
function renderView() {
  if (state.view === "shipments") return shipmentsView();
  if (state.view === "tasks") return tasksView();
  if (state.view === "accounts") return accountsView();
  if (state.view === "reports") return reportsView();
  if (state.view === "track") return trackView();
  if (state.view === "users")
  return usersView();
  return overview();
}

function render() {
const params =
  new URLSearchParams(
    window.location.search
  );

const trackId =
  params.get("track");

if (trackId) {

  state.selectedShipment =
    trackId;

  state.view = "track";

  state.user = {
    role: "customer",
    id: "guest",
    name: "عميل"
  };
}

  const app = document.querySelector("#app");

  app.innerHTML =
    trackId
  ? renderView()
  : (
      state.user
        ? shell(renderView())
        : loginScreen()
    );

  bindEvents();
  setTimeout(() => {

  const canvas =
    document.getElementById(
      "statusChart"
    );

  if (!canvas) return;

  const oldChart =
    Chart.getChart(canvas);

  if (oldChart) {
    oldChart.destroy();
  }

  const delivered =
    shipments.filter(
      s => s.status === "delivered"
    ).length;

  const returned =
    shipments.filter(
      s => s.status === "returned"
    ).length;

  const out =
    shipments.filter(
      s =>
        s.status ===
        "out_for_delivery"
    ).length;

  new Chart(canvas, {

    type: "doughnut",

    data: {

      labels: [
        "تم التسليم",
        "مرتجع",
        "خرج للتسليم"
      ],

      datasets: [{

        data: [
          delivered,
          returned,
          out
        ],

        backgroundColor: [
          "#22c55e",
          "#ef4444",
          "#3b82f6"
        ]

      }]
    },

    options: {

      responsive: true,

      plugins: {

        legend: {
          position: "bottom"
        }

      }

    }

  });

}, 200);
  setTimeout(() => {

    visibleShipments().forEach((shipment) => {

      const qrCanvas =
        document.getElementById(`qr-${shipment.id}`);

      if (!qrCanvas) return;

      const trackingUrl =
        `${window.location.origin}?track=${shipment.id}`;

      QRCode.toCanvas(
        qrCanvas,
        trackingUrl,
        {
          width: 70
        }
      );

    });

  }, 100);
}
async function printShipment(id) {

  const shipment =
    shipments.find(s => s.id === id);

  if (!shipment) return;

  const label =
    document.createElement("div");

  label.style.width = "700px";

  label.style.padding = "30px";

  label.style.background = "#fff";

  label.style.direction = "rtl";

  label.style.fontFamily =
    "Arial";

  label.innerHTML = `

    <div
      style="
        border:2px solid #000;
        padding:20px;
        border-radius:14px;
      "
    >

      <h1
        style="
          text-align:center;
          margin-bottom:20px;
        "
      >
        النخبة إكسبريس
      </h1>

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
        "
      >

        <div>

          <p>
            <b>رقم الشحنة:</b>
            ${shipment.id}
          </p>

          <p>
            <b>العميل:</b>
            ${shipment.customerName}
          </p>

          <p>
            <b>الهاتف:</b>
            ${shipment.customerPhone}
          </p>

          <p>
            <b>المبلغ:</b>
            ${shipment.amount} جنيه
          </p>

          <p>
            <b>العنوان:</b>
            ${shipment.address}
          </p>

        </div>

        <canvas id="printQR"></canvas>

      </div>

    </div>
  `;

  document.body.appendChild(label);

  await QRCode.toCanvas(
    document.querySelector("#printQR"),
    `${window.location.origin}?track=${shipment.id}`,
    {
      width: 150
    }
  );

  const canvas =
    await html2canvas(label);

  const imgData =
    canvas.toDataURL("image/png");

  const { jsPDF } = window.jspdf;

  const pdf =
    new jsPDF("p", "mm", "a4");

  pdf.addImage(
    imgData,
    "PNG",
    10,
    10,
    190,
    120
  );

  pdf.save(`${shipment.id}.pdf`);

  label.remove();
}
function bindEvents() {
  document.querySelector("#loginForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = data.get("phone");
const password = data.get("password");

supabaseClient.auth
  .signInWithPassword({
    email,
    password
  })
  .then(({ data: authData, error }) => {
    if (error) {
      document.querySelector("#loginForm")?.classList.add("shake");

setTimeout(() => {
  document.querySelector("#loginForm")?.classList.remove("shake");
}, 400);
      alert("بيانات الدخول غير صحيحة");
      return;
     

document.querySelector("#openScanner")
  ?.addEventListener("click", async () => {

    try {

      const modal =
        document.createElement("div");

      modal.className =
        "shipment-modal";

      modal.innerHTML = `
        <div class="shipment-modal-box">

          <h2>QR Scanner</h2>

          <div id="reader"></div>

          <button
            id="manualTrack"
            class="primary-btn"
          >
            إدخال كود يدوي
          </button>

          <button
            id="closeScanner"
            class="ghost-btn"
          >
            إغلاق
          </button>

        </div>
      `;

      document.body.appendChild(modal);

      document.querySelector("#manualTrack")
        .onclick = () => {

          const code =
            prompt("أدخل كود الشحنة");

          if (code) {

            window.location.href =
              `${window.location.origin}?track=${code}`;
          }
        };

      const scanner =
        new Html5Qrcode("reader");

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: 250
        },
        (decodedText) => {

          scanner.stop();

          modal.remove();

          window.location.href =
            decodedText;
        }
      );

      document.querySelector("#closeScanner")
        .onclick = async () => {

          await scanner.stop();

          modal.remove();
        };

    } catch (err) {

      const code =
        prompt("أدخل كود الشحنة");

      if (code) {

        window.location.href =
          `${window.location.origin}?track=${code}`;
      }
    }

  });
    }

    const email = authData.user.email;

    let role = "customer";

    if (email.includes("admin")) role = "admin";
    else if (email.includes("merchant")) role = "merchant";
    else if (email.includes("courier")) role = "courier";

    const user = {
     id: authData.user.id,
      name: email.split("@")[0],
      role,
      phone: email,
      balance: 0
      
    };

    localStorage.setItem("AL NUKHBA EXPRESS_user", JSON.stringify(user));

    setState({
      user,
      view: role === "customer" ? "track" : "overview"
    });
  });
  });

  document.querySelectorAll("[data-demo]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("[name='phone']").value = button.dataset.demo;
      document.querySelector("[name='password']").value = "123456";
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setState({ view: button.dataset.view }));
  });
document.querySelector(
  "#roleSwitcher"
)?.addEventListener(
  "change",
  (e) => {

    const role =
      e.target.value;

    if (!role) return;

    state.user.role =
      role;

    state.view =
      role === "customer"
        ? "track"
        : "overview";

    render();
});
  document.querySelector("#logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("AL NUKHBA EXPRESS_user");
    setState({ user: null, view: "overview", query: "" });
  });

  document.querySelector("#searchInput")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
    document.querySelector("#searchInput")?.focus();
  });

  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => setState({ selectedShipment: button.dataset.open, view: state.user.role === "customer" ? "track" : state.view }));
  });

  document.querySelectorAll("[data-deliver]")
  .forEach((button) => {

    button.addEventListener(
      "click",
      async () => {

        const shipment =
          shipments.find(
            item =>
              item.id ===
              button.dataset.deliver
          );

        if (!shipment) return;

        shipment.status =
          "delivered";

        shipment.eta =
          "تم التسليم الآن";

        shipment.timeline.push([
          "تم التسليم",
          new Date()
            .toLocaleString("ar-EG")
        ]);

        await supabaseClient
          .from("shipments")
          .update({
            status: "delivered",
            eta: "تم التسليم الآن"
          })
          .eq(
            "shipment_code",
            shipment.id
          );

        await loadShipments();

      }
    );

});

  document.querySelector("#newShipmentBtn")?.addEventListener("click", () => {
  const modal = document.createElement("div");

  modal.className = "shipment-modal";

  modal.innerHTML = `
  <div class="shipment-modal-box large">
    <h2>إضافة شحنة جديدة</h2>

    <div class="form-grid">

      <input id="shipmentName" placeholder="اسم الشحنة" />

      <input id="shipmentCodeInput" placeholder="كود الشحنة" />

      <input id="customerName" placeholder="اسم العميل" />

      <input id="customerPhone" placeholder="رقم الموبايل" />

      <input id="shipmentAmount" type="number" placeholder="قيمة الشحنة" />

      <select id="governorate">
  <option value="">جاري تحميل المحافظات...</option>
</select>

      <select id="center">
  <option value="">اختر المركز</option>
</select>

      <input id="street" placeholder="اسم الشارع" />

      <input id="building" placeholder="رقم العمارة" />

      <input id="floor" placeholder="رقم الدور" />

      <input id="apartment" placeholder="رقم الشقة" />

    </div>

    <textarea id="notes" placeholder="ملاحظات إضافية"></textarea>

    <div class="modal-actions">
      <button id="saveShipment" class="primary-btn">
        حفظ الشحنة
      </button>

      <button id="closeModal" class="ghost-btn">
        إلغاء
      </button>
    </div>
  </div>
`;

  document.body.appendChild(modal);
  async function loadGovernorates() {

  const response = await fetch("./cities.json");

  const data = await response.json();

  window.egyptData = data[2].data;

  const governoratesNames = {
    1: "القاهرة",
    2: "الجيزة",
    3: "الإسكندرية",
    4: "الدقهلية",
    5: "البحر الأحمر",
    6: "البحيرة",
    7: "الفيوم",
    8: "الغربية",
    9: "الإسماعيلية",
    10: "المنوفية",
    11: "المنيا",
    12: "القليوبية",
    13: "الوادي الجديد",
    14: "السويس",
    15: "أسوان",
    16: "أسيوط",
    17: "بني سويف",
    18: "بورسعيد",
    19: "دمياط",
    20: "الشرقية",
    21: "جنوب سيناء",
    22: "كفر الشيخ"
  };

  document.querySelector("#governorate").innerHTML =
    `
      <option value="">اختر المحافظة</option>

      ${Object.entries(governoratesNames).map(
        ([id, name]) =>
          `<option value="${id}">
            ${name}
          </option>`
      ).join("")}
    `;
}

loadGovernorates();
document.querySelector("#governorate")
  .addEventListener("change", async (e) => {

    const governorateId =
      e.target.value;

    const cities =
      window.egyptData.filter(
        item =>
          item.governorate_id == governorateId
      );

    document.querySelector("#center").innerHTML =
      `
        <option value="">اختر المركز</option>

        ${cities.map(
          (city) =>
            `<option value="${city.city_name_ar}">
              ${city.city_name_ar}
            </option>`
        ).join("")}
      `;
  });
  document.querySelector("#closeModal").onclick = () => {
    modal.remove();
  };

  document.querySelector("#saveShipment").onclick = async () => {
    const shipmentName =
  document.querySelector("#shipmentName").value;

const shipmentCodeInput =
  document.querySelector("#shipmentCodeInput").value;

const customerName =
  document.querySelector("#customerName").value;

const customerPhone =
  document.querySelector("#customerPhone").value;

const amount =
  Number(document.querySelector("#shipmentAmount").value);

const governorate =
  document.querySelector("#governorate").value;

const center =
  document.querySelector("#center").value;

const street =
  document.querySelector("#street").value;

const building =
  document.querySelector("#building").value;

const floor =
  document.querySelector("#floor").value;

const apartment =
  document.querySelector("#apartment").value;

const notes =
  document.querySelector("#notes").value;

const address = `
${governorate} - ${center}
شارع ${street}
عمارة ${building}
الدور ${floor}
شقة ${apartment}
`;

if (
  !shipmentName ||
  !shipmentCodeInput ||
  !customerName ||
  !customerPhone
) {
  alert("أكمل البيانات المطلوبة");
  return;
}

    const shipmentCode = shipmentCodeInput;

    const { error } = await supabaseClient
      .from("shipments")
      .insert([
        {
          shipment_code: shipmentCode,
          customer_name: customerName,
          customer_phone: customerPhone,
          address,
          amount,
          delivery_fee: 60,
          status: "created",
          eta: "قيد التجهيز",
          notes: `
اسم الشحنة: ${shipmentName}

${notes}
`
        }
      ]);

    if (error) {

  console.error(error);

  alert(error.message);

  return;
}

    modal.remove();

    await loadShipments();

    alert("تم إضافة الشحنة بنجاح");
  };
});
document.querySelector("#addUserBtn")
?.addEventListener("click", () => {

  const modal =
    document.createElement("div");

  modal.className =
    "shipment-modal";

  modal.innerHTML = `

    <div class="shipment-modal-box">

      <h2>
        مستخدم جديد
      </h2>

      <input
        id="newUserName"
        placeholder="الاسم"
      />

      <input
        id="newUserPhone"
        placeholder="الهاتف"
      />

      <input
        id="newUserPassword"
        placeholder="كلمة المرور"
      />

      <select id="newUserRole">

        <option value="merchant">
          تاجر
        </option>

        <option value="courier">
          مندوب
        </option>

        <option value="customer">
          عميل
        </option>

        <option value="admin">
          إدارة
        </option>

      </select>

      <div class="modal-actions">

        <button
          id="saveUserBtn"
          class="primary-btn"
        >
          حفظ
        </button>

        <button
          id="closeUserModal"
          class="ghost-btn"
        >
          إلغاء
        </button>

      </div>

    </div>
  `;

  document.body.appendChild(modal);

  document.querySelector(
    "#closeUserModal"
  ).onclick = () => {
    modal.remove();
  };

  document.querySelector(
    "#saveUserBtn"
  ).onclick = () => {

    const user = {

      id:
        crypto.randomUUID(),

      name:
        document.querySelector(
          "#newUserName"
        ).value,

      phone:
        document.querySelector(
          "#newUserPhone"
        ).value,

      password:
        document.querySelector(
          "#newUserPassword"
        ).value,

      role:
        document.querySelector(
          "#newUserRole"
        ).value,

      balance: 0

};

const generatedEmail =
  `${user.phone}@nukhba.com`;

    supabaseClient.auth.signUp({

  email:
  generatedEmail,

  password:
    user.password

}).then(async ({ data, error }) => {

  if (error) {

    alert("خطأ في إنشاء المستخدم");

    console.error(error);

    return;
  }

  user.id =
  data?.user?.id ||
  crypto.randomUUID();

  users.push(user);
localStorage.setItem(
  "nukhba_users",
  JSON.stringify(users)
);
  alert("تم إنشاء المستخدم");

  modal.remove();

  render();

});

    modal.remove();

    render();

  };

});
}
window.manualTrackShipment = function () {

  const code =
    prompt("أدخل كود الشحنة");

  if (!code) return;

  window.location.href =
    `${window.location.origin}?track=${code}`;
};
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
window.updateShipmentStatus =
  async function (id, status) {

    const shipment =
      shipments.find(
        s => s.id === id
      );

    if (!shipment) return;

    shipment.status = status;
    notifications.unshift({

  id: crypto.randomUUID(),

  text:
    `تم تحديث الشحنة ${shipment.id}
     إلى ${
       statusMeta[status]?.label
     }`,

  time:
    new Date()
      .toLocaleTimeString(),

  role:
    state.user?.role || "admin"

});

    shipment.timeline.push([
      statusMeta[status].label,
      new Date().toLocaleString("ar-EG")
    ]);

    if (status === "delivered") {
      shipment.eta = "تم التسليم";
    }
    const whatsappMessage = `
مرحبًا ${shipment.customerName}

تم تحديث حالة الشحنة:
${shipment.id}

الحالة الجديدة:
${statusMeta[status].label}

شركة النخبة للشحن السريع
`;

window.open(
  `https://wa.me/2${shipment.customerPhone}?text=${
    encodeURIComponent(
      whatsappMessage
    )
  }`
);

    await supabaseClient
      .from("shipments")
      .update({
        status,
        eta: shipment.eta
      })
      .eq("shipment_code", id);

    render();
};
window.assignCourier =
  async function (id) {

    const courierId =
      document.querySelector(
        "#assignCourier"
      ).value;

    if (!courierId) {

      alert("اختر مندوب");

      return;
    }

    const shipment =
      shipments.find(
        s => s.id === id
      );

    if (!shipment) return;

    shipment.courierId =
      courierId;
      console.log("assigned", shipment);
localStorage.setItem(
  `courier_${id}`,
  courierId
);
    alert("تم تعيين المندوب");

    render();
};
window.uploadPOD =
  async function (id, inputId) {

    const file =
      document.querySelector(
        `#${inputId}`
      )?.files[0];

    if (!file) {

      alert("اختر صورة");

      return;
    }

    const reader =
      new FileReader();

    reader.onload = function () {

      const shipment =
        shipments.find(
          s => s.id === id
        );

      if (!shipment) return;

      shipment.podImage =
        reader.result;
localStorage.setItem(
  `pod_${id}`,
  reader.result
);
      shipment.timeline.push([
        "تم رفع إثبات التسليم",
        new Date().toLocaleString("ar-EG")
      ]);

      alert("تم رفع الصورة");

      render();
    };

    reader.readAsDataURL(file);
};
window.setStatusFilter =
  function (status) {

    state.statusFilter = status;

    render();
};
async function loadShipments() {
  const { data, error } = await supabaseClient
    .from("shipments")
    .select("*");

  if (error) {
    console.error(error);
    return;
  }

  shipments = data.map((item) => ({
    id: item.shipment_code,
    merchantId: item.merchant_id,
    courierId:
  localStorage.getItem(
    `courier_${item.shipment_code}`
  ) || null,
    customerId: null,
    customerName: item.customer_name,
    customerPhone: item.customer_phone,
    address: item.address,
    status:
  item.status === "warehouse"
    ? "hub"
    : item.status,
    amount: item.amount,
    deliveryFee: item.delivery_fee,
    createdAt: item.created_at,
    eta: item.eta,
    notes: item.notes,
    podImage:
  localStorage.getItem(
    `pod_${item.shipment_code}`
  ) || null,
    timeline: [

  ["تم إنشاء الشحنة", item.created_at],

  ...(item.status === "hub"
    ? [["وصلت لمركز الفرز", item.created_at]]
    : []),

  ...(item.status === "out_for_delivery"
    ? [["خرجت للتسليم", item.created_at]]
    : []),

  ...(item.status === "delivered"
    ? [["تم التسليم", item.created_at]]
    : [])

]
  }));

  render();
}

loadShipments();
window.exportShipmentsExcel =
  function () {

    const data =
      visibleShipments().map(
        shipment => ({

          "رقم الشحنة":
            shipment.id,

          "العميل":
            shipment.customerName,

          "الهاتف":
            shipment.customerPhone,

          "العنوان":
            shipment.address,

          "الحالة":
            statusMeta[
              shipment.status
            ]?.label,

          "المبلغ":
            shipment.amount,

          "رسوم الشحن":
            shipment.deliveryFee,

          "الحالة الحالية":
            shipment.eta

        })
      );

    const worksheet =
      XLSX.utils.json_to_sheet(
        data
      );

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Shipments"
    );

    XLSX.writeFile(
      workbook,
      "shipments.xlsx"
    );
};
window.deleteUser =
  function (id) {

    const index =
      users.findIndex(
        u => u.id === id
      );

    if (index === -1) return;

    users.splice(index, 1);

    render();

};