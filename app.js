const users = [
  { id: "u1", name: "أحمد الشرقاوي", role: "merchant", phone: "01000000001", password: "123456", balance: 18450 },
  { id: "u2", name: "منى علي", role: "courier", phone: "01000000002", password: "123456", balance: 3250 },
  { id: "u3", name: "كريم محمود", role: "customer", phone: "01000000003", password: "123456", balance: 0 },
  { id: "u4", name: "مدير التشغيل", role: "admin", phone: "01000000000", password: "123456", balance: 0 }
];

const shipments = [
  {
    id: "NE-20419",
    merchantId: "u1",
    courierId: "u2",
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
    courierId: "u2",
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
    courierId: "u2",
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

const statusMeta = {
  created: { label: "طلب جديد", tone: "info" },
  picked: { label: "تم الاستلام", tone: "info" },
  warehouse: { label: "في المخزن", tone: "warning" },
  out_for_delivery: { label: "خارج للتسليم", tone: "primary" },
  delivered: { label: "تم التسليم", tone: "success" },
  returned: { label: "مرتجع", tone: "danger" }
};

const navByRole = {
  admin: ["overview", "shipments", "accounts", "reports"],
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
  track: "تتبع"
};

let state = {
  user: JSON.parse(localStorage.getItem("_user") || "null"),
  view: "overview",
  query: "",
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
  const user = state.user;
  const list = shipments.filter((shipment) => {
    if (!user || user.role === "admin") return true;
    if (user.role === "merchant") return shipment.merchantId === user.id;
    if (user.role === "courier") return shipment.courierId === user.id;
    return shipment.customerId === user.id || shipment.customerPhone === user.phone || shipment.id === state.selectedShipment;
  });
  return list.filter((shipment) => {
    const text = `${shipment.id} ${shipment.customerName} ${shipment.customerPhone} ${shipment.address}`.toLowerCase();
    return text.includes(state.query.trim().toLowerCase());
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
        <p>نظام واحد للتاجر والمندوب والعميل: تتبع، حسابات، تحصيل، وتشغيل يومي بسيط.</p>
        <form id="loginForm" class="login-form">
          <label>رقم الموبايل
            <input name="phone" inputmode="tel" value="01000000001" autocomplete="username" />
          </label>
          <label>كلمة المرور
            <input name="password" type="password" value="123456" autocomplete="current-password" />
          </label>
          <button class="primary-btn" type="submit">${icon("user")} دخول</button>
        </form>
        <div class="demo-users">
          <button data-demo="01000000000">إدارة</button>
          <button data-demo="01000000001">تاجر</button>
          <button data-demo="01000000002">مندوب</button>
          <button data-demo="01000000003">عميل</button>
        </div>
      </section>
      <section class="app-preview" aria-label="ملخص تشغيل">
        <div class="preview-top">
          <span>تحديث مباشر</span>
          <strong>96%</strong>
        </div>
        <div class="route-line"></div>
        <div class="preview-card"><b>WS-20419</b><span>خارج للتسليم</span></div>
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
          <div><strong>وصلة</strong><span>لوحة الشحن</span></div>
        </div>
        <nav>
          ${views.map((view) => `<button class="${state.view === view ? "active" : ""}" data-view="${view}">${labels[view]}</button>`).join("")}
        </nav>
        <button class="ghost-btn logout" id="logoutBtn">${icon("logout")} خروج</button>
      </aside>
      <main class="content">
        <header class="topbar">
          <div>
            <span class="eyebrow">${roleName(state.user.role)}</span>
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
          ${state.user.role !== "customer" ? `<button class="primary-btn compact" id="newShipmentBtn">${icon("plus")} شحنة جديدة</button>` : ""}
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
      </div>
    </section>
  `;
}

function shipmentTable(list) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>الشحنة</th><th>العميل</th><th>العنوان</th><th>الحالة</th><th>المبلغ</th><th></th></tr></thead>
        <tbody>
          ${list.map((shipment) => `
            <tr>
              <td><b>${shipment.id}</b><span>${shipment.createdAt}</span></td>
              <td>${shipment.customerName}<span>${shipment.customerPhone}</span></td>
              <td>${shipment.address}</td>
              <td><span class="badge ${statusMeta[shipment.status].tone}">${statusMeta[shipment.status].label}</span></td>
              <td>${money(shipment.amount)}</td>
              <td><button class="link-btn" data-open="${shipment.id}">عرض</button></td>
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
        <button class="primary-btn compact" id="newShipmentBtn">${icon("plus")} إضافة</button>
      </div>
      ${shipmentTable(visibleShipments())}
    </section>
    ${detailsPanel(shipments.find((shipment) => shipment.id === state.selectedShipment) || visibleShipments()[0])}
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
            <a class="ghost-btn" href="tel:${shipment.customerPhone}">اتصال</a>
            <button class="primary-btn compact" data-deliver="${shipment.id}">تم التسليم</button>
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
      <ol class="timeline">
        ${shipment.timeline.map((item) => `<li><b>${item[0]}</b><span>${item[1]}</span></li>`).join("")}
      </ol>
    </section>
  `;
}

function trackView() {
  const shipment = shipments.find((item) => item.id === state.selectedShipment) || visibleShipments()[0];
  return `
    <section class="track-hero">
      <div>
        <span class="eyebrow">تتبع الشحنة</span>
        <h2>${shipment.id}</h2>
        <p>${shipment.customerName} - ${shipment.address}</p>
      </div>
      <span class="badge ${statusMeta[shipment.status].tone}">${statusMeta[shipment.status].label}</span>
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

function renderView() {
  if (state.view === "shipments") return shipmentsView();
  if (state.view === "tasks") return tasksView();
  if (state.view === "accounts") return accountsView();
  if (state.view === "reports") return reportsView();
  if (state.view === "track") return trackView();
  return overview();
}

function render() {
  const app = document.querySelector("#app");
  app.innerHTML = state.user ? shell(renderView()) : loginScreen();
  bindEvents();
}

function bindEvents() {
  document.querySelector("#loginForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const user = users.find((item) => item.phone === data.get("phone") && item.password === data.get("password"));
    if (!user) {
      event.currentTarget.classList.add("shake");
      setTimeout(() => event.currentTarget.classList.remove("shake"), 400);
      return;
    }
    localStorage.setItem("AL NUKHBA EXPRESS_user", JSON.stringify(user));
    setState({ user, view: user.role === "customer" ? "track" : "overview" });
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

  document.querySelectorAll("[data-deliver]").forEach((button) => {
    button.addEventListener("click", () => {
      const shipment = shipments.find((item) => item.id === button.dataset.deliver);
      shipment.status = "delivered";
      shipment.eta = "تم التسليم الآن";
      shipment.timeline.push(["تم التسليم", new Date().toLocaleString("ar-EG")]);
      render();
    });
  });

  document.querySelector("#newShipmentBtn")?.addEventListener("click", () => {
    alert("في النسخة المتصلة بقاعدة بيانات سيتم فتح نموذج إضافة شحنة. النموذج جاهز كخطوة التطوير التالية.");
  });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();
