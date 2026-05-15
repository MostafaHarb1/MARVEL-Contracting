const STORAGE_KEY = "contracting_dashboard_state_v1";

const app = document.getElementById("app");
const SECTION_KEYS = ["projects", "execution", "equipments", "settings", "accounts"];
const UNIT_OPTIONS = ["متر", "سنتيمتر", "كيلومتر", "كيلو", "جرام", "لتر", "م²", "م³", "قطعة", "طن", "وحدة"];
const PERMISSION_OPTIONS = [
  { key: "all", label: "كل الأقسام", sections: SECTION_KEYS },
  { key: "projects", label: "إدارة المشاريع فقط", sections: ["projects"] },
  { key: "execution", label: "التنفيذ فقط", sections: ["execution"] },
  { key: "equipments", label: "معدات الشركة فقط", sections: ["equipments"] },
  { key: "settings", label: "الإعدادات فقط", sections: ["settings"] },
  { key: "accounts", label: "الحسابات العامة فقط", sections: ["accounts"] },
  { key: "projects_execution", label: "المشاريع + التنفيذ", sections: ["projects", "execution"] },
  {
    key: "field_operations",
    label: "تشغيل ميداني (المشاريع + التنفيذ + المعدات)",
    sections: ["projects", "execution", "equipments"],
  },
];

const initialState = {
  session: {
    isLoggedIn: false,
    userId: null,
  },
  generalAccountsPassword: "2468",
  roles: [
    {
      id: crypto.randomUUID(),
      name: "مدير النظام",
      permissionKey: "all",
      permissions: "كل الأقسام",
    },
  ],
  systemUsers: [
    {
      id: crypto.randomUUID(),
      name: "المشرف",
      phone: "50000000",
      password: "123456",
      roleId: null,
    },
  ],
  workers: [
    {
      id: crypto.randomUUID(),
      name: "عامل افتراضي",
      jobTitle: "مشرف موقع",
      salary: 450,
      startDate: "2026-01-01",
    },
  ],
  companyEquipments: [],
  projects: [],
  executionLogs: [],
  notifications: [],
};

let state = loadState();
let ui = {
  section: "projects",
  selectedProjectId: null,
  projectTab: "boq",
  executionTab: "allItems",
  expenseTab: "petty",
  rentalSubtab: "rent",
  salarySubtab: "salaries",
  settingsTab: "roles",
  equipmentsTab: "equipments",
  mobileMenuOpen: false,
  accountsUnlocked: false,
  moneyVisible: true,
  showProjectForm: false,
};

let projectDraft = getEmptyProjectDraft();

if (!state.systemUsers.length) {
  state.systemUsers = initialState.systemUsers;
}

if (!state.roles.length) {
  state.roles = initialState.roles;
}
state.roles = state.roles.map(normalizeRole);

if (!state.workers.length) {
  state.workers = initialState.workers;
}

render();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(initialState);
    }
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(initialState),
      ...parsed,
      session: {
        ...structuredClone(initialState.session),
        ...(parsed.session || {}),
      },
      roles: (parsed.roles || []).map(normalizeRole),
      systemUsers: parsed.systemUsers || [],
      workers: parsed.workers || [],
      companyEquipments: parsed.companyEquipments || [],
      projects: (parsed.projects || []).map(normalizeProjectData),
      executionLogs: parsed.executionLogs || [],
      notifications: parsed.notifications || [],
    };
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  if (!state.session.isLoggedIn) {
    renderLogin();
    return;
  }
  renderDashboard();
}

function renderLogin() {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card">
        <img src="logo.png" alt="شعار الشركة" class="auth-logo" />
        <h1 class="auth-title">تسجيل الدخول</h1>
        <form class="form-grid" id="login-form">
          <div class="field">
            <label for="phone">رقم الهاتف الكويتي</label>
            <input id="phone" class="input" name="phone" placeholder="مثال: 50000000" required />
          </div>
          <div class="field">
            <label for="password">الرقم السري</label>
            <input id="password" class="input" name="password" type="password" required />
          </div>
          <button type="submit" class="btn btn-primary">تسجيل الدخول</button>
          <p class="muted">المستخدم الافتراضي: 50000000 - كلمة المرور: 123456</p>
          <p id="login-error" class="error"></p>
        </form>
      </section>
    </main>
  `;

  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const phone = String(form.get("phone") || "").trim();
    const password = String(form.get("password") || "").trim();
    const errorEl = document.getElementById("login-error");

    if (!isKuwaitiPhone(phone)) {
      errorEl.textContent = "الرجاء إدخال رقم هاتف كويتي صحيح";
      return;
    }

    const user = state.systemUsers.find(
      (u) => normalizePhone(u.phone) === normalizePhone(phone) && u.password === password,
    );

    if (!user) {
      errorEl.textContent = "بيانات الدخول غير صحيحة";
      return;
    }

    state.session.isLoggedIn = true;
    state.session.userId = user.id;
    saveState();
    render();
  });
}

function renderDashboard() {
  const user = state.systemUsers.find((u) => u.id === state.session.userId);
  const isAdmin = isAdminUser(user);
  const unreadNotifications = state.notifications.filter((n) => !n.read).length;
  const allowedSections = getAllowedSectionsForUser(user);
  if (!allowedSections.includes(ui.section)) {
    ui.section = allowedSections[0] || "projects";
  }

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar ${ui.mobileMenuOpen ? "open" : ""}">
        <img src="logo.png" alt="شعار" class="sidebar-logo" />
        <nav class="sidebar-nav">
          ${allowedSections.includes("projects") ? sidebarButton("projects", "المشاريع") : ""}
          ${allowedSections.includes("execution") ? sidebarButton("execution", "التنفيذ") : ""}
          ${allowedSections.includes("equipments") ? sidebarButton("equipments", "معدات الشركة") : ""}
          ${allowedSections.includes("settings") ? sidebarButton("settings", "الإعدادات") : ""}
          ${allowedSections.includes("accounts") ? sidebarButton("accounts", "الحسابات العامة") : ""}
        </nav>
        <div class="sidebar-footer">
          <button class="btn btn-soft" id="logout-btn" style="width:100%">تسجيل الخروج</button>
        </div>
      </aside>
      <main class="content">
        <div class="topbar">
          <div class="row">
            <button class="btn btn-secondary mobile-menu-btn" id="mobile-menu-btn">☰</button>
            <strong>${titleBySection(ui.section)}</strong>
          </div>
          <div class="row">
            <button class="btn btn-secondary" id="toggle-money-btn">${ui.moneyVisible ? "إخفاء المبالغ" : "إظهار المبالغ"}</button>
            ${isAdmin ? `<button class="btn btn-secondary notif-btn" id="open-notifications">🔔 <span>الإشعارات</span> ${unreadNotifications ? `<b>${unreadNotifications}</b>` : ""}</button>` : ""}
            <span class="muted">المستخدم: ${escapeHtml(user?.name || "-")}</span>
          </div>
        </div>
        ${isAdmin ? notificationsModalTemplate() : ""}
        <div id="section-root"></div>
      </main>
    </div>
  `;

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.section = btn.dataset.section;
      ui.mobileMenuOpen = false;
      if (ui.section !== "projects") {
        ui.selectedProjectId = null;
      }
      render();
    });
  });
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener("click", () => {
      ui.mobileMenuOpen = !ui.mobileMenuOpen;
      document.querySelector(".sidebar")?.classList.toggle("open", ui.mobileMenuOpen);
    });
  }
  const moneyBtn = document.getElementById("toggle-money-btn");
  if (moneyBtn) {
    moneyBtn.addEventListener("click", () => {
      ui.moneyVisible = !ui.moneyVisible;
      render();
    });
  }
  const openNotificationsBtn = document.getElementById("open-notifications");
  if (openNotificationsBtn) {
    openNotificationsBtn.addEventListener("click", () => {
      const modal = document.getElementById("notifications-modal");
      modal?.classList.remove("hidden");
      state.notifications.forEach((n) => {
        n.read = true;
      });
      saveState();
    });
  }
  const closeNotificationsBtn = document.getElementById("close-notifications");
  if (closeNotificationsBtn) {
    closeNotificationsBtn.addEventListener("click", () => {
      document.getElementById("notifications-modal")?.classList.add("hidden");
      render();
    });
  }
  document.getElementById("notifications-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "notifications-modal") {
      e.target.classList.add("hidden");
      render();
    }
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    state.session.isLoggedIn = false;
    state.session.userId = null;
    ui.mobileMenuOpen = false;
    ui.accountsUnlocked = false;
    saveState();
    render();
  });

  const root = document.getElementById("section-root");
  if (!allowedSections.length) {
    root.innerHTML = `<section class="section-card"><div class="empty">لا توجد صلاحيات متاحة لهذا المستخدم</div></section>`;
    return;
  }

  if (ui.section === "projects") {
    renderProjectsSection(root);
  }
  if (ui.section === "execution") {
    renderExecutionSection(root);
  }
  if (ui.section === "equipments") {
    renderEquipmentsSection(root);
  }
  if (ui.section === "settings") {
    renderSettingsSection(root);
  }
  if (ui.section === "accounts") {
    renderAccountsSection(root);
  }
}

function renderProjectsSection(root) {
  if (!ui.selectedProjectId) {
    const totalProjects = state.projects.length;
    const runningProjects = state.projects.filter((p) => getProjectCompletion(p) < 100).length;
    const avgCompletion = totalProjects
      ? state.projects.reduce((sum, p) => sum + getProjectCompletion(p), 0) / totalProjects
      : 0;

    const cards = state.projects
      .map((project) => {
        const progress = getProjectCompletion(project);
        const status = progress >= 100 ? "مكتمل" : "جاري";
        const qtyStats = getSubcontractQtyStats(project);
        return `
          <article class="project-card ${progress >= 100 ? "done" : ""}" data-open-project="${project.id}">
            <div class="row">
              <strong>${escapeHtml(project.name)}</strong>
              <span class="badge ${progress >= 100 ? "done" : "running"}">${status}</span>
            </div>
            <div class="project-meta">
              <span>تاريخ البداية: ${escapeHtml(project.startDate || "-")}</span>
              ${progressBar(progress)}
              <span>عدد البنود: ${project.boq.length}</span>
              <span>تشغيل ذاتي: ${qtyStats.selfPercent.toFixed(1)}% | باطن: ${qtyStats.subcontractPercent.toFixed(1)}%</span>
            </div>
          </article>
        `;
      })
      .join("");

    root.innerHTML = `
      <section class="section-card">
        <div class="kpi-grid">
          <article class="kpi kpi-light"><h4>إجمالي المشاريع</h4><p>${totalProjects}</p></article>
          <article class="kpi kpi-light"><h4>المشاريع الجارية</h4><p>${runningProjects}</p></article>
          <article class="kpi kpi-light"><h4>متوسط الإكمال</h4><p>${avgCompletion.toFixed(1)}%</p></article>
        </div>
      </section>
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">قائمة المشاريع</h3>
          <button class="btn btn-primary" id="open-project-modal">إضافة مشروع</button>
        </div>
        ${state.projects.length ? `<div class="project-grid">${cards}</div>` : '<div class="empty">لا توجد مشاريع حالياً</div>'}
      </section>
      ${ui.showProjectForm ? projectCreateFormTemplate(true) : ""}
    `;

    document.querySelectorAll("[data-open-project]").forEach((card) => {
      card.addEventListener("click", () => {
        ui.selectedProjectId = card.dataset.openProject;
        ui.mobileMenuOpen = false;
        ui.projectTab = "boq";
        ui.expenseTab = "petty";
        ui.rentalSubtab = "rent";
        ui.salarySubtab = "salaries";
        render();
      });
    });

    const openProjectModal = document.getElementById("open-project-modal");
    openProjectModal?.addEventListener("click", () => {
      ui.showProjectForm = true;
      render();
    });
    const closeProjectModal = document.getElementById("close-project-modal");
    closeProjectModal?.addEventListener("click", () => {
      ui.showProjectForm = false;
      projectDraft = getEmptyProjectDraft();
      render();
    });
    const projectModalBackdrop = document.getElementById("project-modal-backdrop");
    projectModalBackdrop?.addEventListener("click", (e) => {
      if (e.target === projectModalBackdrop) {
        ui.showProjectForm = false;
        render();
      }
    });

    bindProjectCreateForm();
    return;
  }

  const project = state.projects.find((p) => p.id === ui.selectedProjectId);
  if (!project) {
    ui.selectedProjectId = null;
    render();
    return;
  }

  const summary = getProjectFinancialSummary(project);

  root.innerHTML = `
    <section class="section-card">
      <div class="row">
        <h3 class="card-title">${escapeHtml(project.name)}</h3>
        <div class="row">
          <button class="btn btn-secondary" id="back-project-list">العودة لقائمة المشاريع</button>
          <button class="btn btn-danger" id="delete-project-inside">حذف المشروع</button>
        </div>
      </div>

      <div class="tabs" id="project-tabs">
        ${tabButton("boq", "المقايسات", ui.projectTab)}
        ${tabButton("expenses", "المصروفات", ui.projectTab)}
        ${tabButton("subcontract", "مقاولو الباطن", ui.projectTab)}
        ${tabButton("projectEquipment", "معدات الشركة داخل المشروع", ui.projectTab)}
      </div>
    </section>

    ${renderProjectTabContent(project)}

    <section class="section-card">
      <h3 class="card-title">الملخص المالي للمشروع</h3>
      <div class="summary-cards">
        <article class="summary-card"><h4>إجمالي مقاولو الباطن</h4><p>${formatMoney(summary.totalSubcontractors)}</p></article>
        <article class="summary-card"><h4>إجمالي التشغيل الذاتي</h4><p>${formatMoney(summary.selfExecution)}</p></article>
        <article class="summary-card"><h4>إجمالي المصروفات</h4><p>${formatMoney(summary.totalExpenses)}</p></article>
        <article class="summary-card"><h4>نسبة التشغيل الذاتي</h4><p>${summary.qtyStats.selfPercent.toFixed(1)}%</p></article>
        <article class="summary-card"><h4>نسبة مقاولي الباطن</h4><p>${summary.qtyStats.subcontractPercent.toFixed(1)}%</p></article>
        <article class="summary-card"><h4>كمية التشغيل الذاتي</h4><p>${num(summary.qtyStats.selfQty)}</p></article>
      </div>
    </section>
  `;

  document.getElementById("back-project-list").addEventListener("click", () => {
    ui.selectedProjectId = null;
    ui.mobileMenuOpen = false;
    render();
  });
  document.getElementById("delete-project-inside").addEventListener("click", () => {
    if (!confirm("هل أنت متأكد من حذف المشروع؟")) return;
    state.projects = state.projects.filter((p) => p.id !== project.id);
    ui.selectedProjectId = null;
    saveState();
    render();
  });

  document.querySelectorAll("#project-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.projectTab = btn.dataset.tab;
      render();
    });
  });

  bindProjectDetailActions(project);
}

function renderProjectTabContent(project) {
  if (ui.projectTab === "boq") {
    const rows = project.boq
      .map((item) => {
        const executed = Number(item.executedQty || 0);
        const subcontractExecuted = getSubcontractExecutedQtyForBoq(project, item.id);
        const selfExecuted = Math.max(executed - subcontractExecuted, 0);
        const subcontractAssigned = getSubcontractAssignedQtyForBoq(project, item.id);
        const selfAvailable = Math.max(Number(item.qty || 0) - subcontractAssigned, 0);
        const remaining = Math.max(selfAvailable - selfExecuted, 0);
        const progress = Number(item.qty || 0) > 0 ? (executed / Number(item.qty || 0)) * 100 : 0;
        return `
          <tr>
            <td>${escapeHtml(item.itemName)}</td>
            <td>${num(item.qty)}</td>
            <td>${num(subcontractAssigned)}</td>
            <td>${num(selfAvailable)}</td>
            <td>${num(selfExecuted)}</td>
            <td>${num(subcontractExecuted)}</td>
            <td>${num(executed)}</td>
            <td>${num(remaining)}</td>
            <td>${progressBar(progress)}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <section class="section-card">
        <h3 class="card-title">المقايسات</h3>
        ${project.boq.length ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>اسم البند</th><th>الكمية الإجمالية</th><th>كمية الباطن</th><th>تشغيل ذاتي متاح</th><th>منفذ ذاتي</th><th>منفذ باطن</th><th>المنفذ الكلي</th><th>المتبقي الذاتي</th><th>نسبة الإكمال</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>` : '<div class="empty">لا توجد مقايسات في هذا المشروع</div>'}
      </section>
    `;
  }

  if (ui.projectTab === "expenses") {
    return renderExpensesTab(project);
  }

  if (ui.projectTab === "subcontract") {
    const qtyStats = getSubcontractQtyStats(project);
    const rows = project.subcontractors
      .map(
        (sc) => `
        <tr>
          <td>${escapeHtml(getBoqItem(project, sc.boqId)?.itemName || "-")}</td>
          <td>${escapeHtml(sc.contractorName)}</td>
          <td>${num(sc.qty)}</td>
          <td>${escapeHtml(sc.unit)}</td>
          <td>${formatMoney(sc.unitPrice)}</td>
          <td>${formatMoney(sc.total)}</td>
          <td><button class="btn btn-danger" data-delete-subcontract="${sc.id}">حذف</button></td>
        </tr>
      `,
      )
      .join("");

    return `
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">مقاولو الباطن</h3>
          <button class="btn btn-primary" type="button" data-open-modal="subcontract-modal">إضافة مقاول باطن</button>
        </div>
        <div class="summary-cards" style="margin-bottom:12px">
          <article class="summary-card"><h4>إجمالي وحدات المشروع</h4><p>${num(qtyStats.totalQty)}</p></article>
          <article class="summary-card"><h4>وحدات مقاولي الباطن</h4><p>${num(qtyStats.subcontractQty)} (${qtyStats.subcontractPercent.toFixed(1)}%)</p></article>
          <article class="summary-card"><h4>التشغيل الذاتي</h4><p>${num(qtyStats.selfQty)} (${qtyStats.selfPercent.toFixed(1)}%)</p></article>
        </div>
        <div class="modal-backdrop hidden" id="subcontract-modal">
          <div class="modal">
            <div class="row">
              <h3 class="card-title">إضافة مقاول باطن</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="subcontract-modal">إغلاق</button>
            </div>
        <form id="add-subcontract-form" class="form-grid">
          <div class="grid-3">
            <div class="field"><label>المقايسة</label><select class="select" name="boqId" required>${project.boq
              .map((b) => `<option value="${b.id}">${escapeHtml(b.itemName)}</option>`)
              .join("")}</select></div>
            <div class="field"><label>اسم المقاول</label><input class="input" name="contractorName" required /></div>
            <div class="field"><label>الكمية</label><input class="input" type="number" step="0.01" min="0" name="qty" required /></div>
            <div class="field"><label>الوحدة</label><select class="select" name="unit" required>${unitOptionsHtml()}</select></div>
            <div class="field"><label>سعر الوحدة</label><input class="input" type="number" step="0.01" min="0" name="unitPrice" required /></div>
            <div class="field"><label>الإجمالي</label><input class="input" id="subcontract-total" readonly value="0" /></div>
          </div>
          <p class="muted" id="subcontract-remaining-hint"></p>
          <button class="btn btn-primary" type="submit">إضافة</button>
        </form>
          </div>
        </div>
        ${project.subcontractors.length ? `
          <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>المقايسة</th><th>المقاول</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة</th><th>الإجمالي</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table></div>
        ` : '<div class="empty" style="margin-top:12px">لا يوجد مقاولو باطن</div>'}
      </section>
    `;
  }

  if (ui.projectTab === "projectEquipment") {
    const mapped = project.companyEquipments.map((eq) => {
      const equipment = state.companyEquipments.find((e) => e.id === eq.equipmentId);
      const totalExpenses = eq.expenses.reduce((sum, ex) => sum + Number(ex.amount || 0), 0);
      return `
      <tr>
        <td>${escapeHtml(equipment?.name || "-")}</td>
        <td>${eq.expenses.length}</td>
        <td>${formatMoney(totalExpenses)}</td>
        <td><button class="btn btn-danger" data-remove-project-equipment="${eq.id}">إزالة</button></td>
      </tr>
      `;
    });

    return `
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">معدات الشركة داخل المشروع</h3>
          <button class="btn btn-primary" type="button" data-open-modal="project-equipment-modal">إضافة معدة للمشروع</button>
        </div>
        <div class="modal-backdrop hidden" id="project-equipment-modal">
          <div class="modal">
            <div class="row">
              <h3 class="card-title">إضافة معدة للمشروع</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="project-equipment-modal">إغلاق</button>
            </div>
        <form id="add-project-equipment-form" class="form-grid">
          <div class="grid-3">
            <div class="field"><label>المعدة</label><select class="select" name="equipmentId" required>
              <option value="">اختر المعدة</option>
              ${state.companyEquipments.map((eq) => `<option value="${eq.id}">${escapeHtml(eq.name)}</option>`).join("")}
            </select></div>
            <div class="field"><label>مصروف المعدة</label><input class="input" type="number" step="0.01" min="0" name="amount" required /></div>
            <div class="field"><label>ملاحظة</label><input class="input" name="note" /></div>
          </div>
          <button class="btn btn-primary" type="submit">إضافة للمشروع</button>
        </form>
          </div>
        </div>
        ${project.companyEquipments.length ? `
          <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>اسم المعدة</th><th>عدد المصروفات</th><th>الإجمالي</th><th>إجراء</th></tr></thead><tbody>${mapped.join("")}</tbody></table></div>
        ` : '<div class="empty" style="margin-top:12px">لم تتم إضافة معدات للمشروع</div>'}
      </section>
    `;
  }

  return "";
}

function renderExpensesTab(project) {
  return `
    <section class="section-card">
      <div class="tabs" id="expenses-tabs">
        ${tabButton("petty", "المصروفات النثرية", ui.expenseTab)}
        ${tabButton("operation", "مصاريف التشغيل", ui.expenseTab)}
        ${tabButton("rental", "إيجار المعدات", ui.expenseTab)}
        ${tabButton("salary", "المرتبات", ui.expenseTab)}
      </div>
    </section>
    ${ui.expenseTab === "petty" ? pettyExpensesTemplate(project) : ""}
    ${ui.expenseTab === "operation" ? operationExpensesTemplate(project) : ""}
    ${ui.expenseTab === "rental" ? rentalExpensesTemplate(project) : ""}
    ${ui.expenseTab === "salary" ? salaryTemplate(project) : ""}
  `;
}

function pettyExpensesTemplate(project) {
  const rows = project.expenses.petty
    .map(
      (ex) => `
      <tr>
        <td>${escapeHtml(ex.name)}</td>
        <td>${escapeHtml(ex.reason)}</td>
        <td>${formatMoney(ex.amount)}</td>
        <td>${escapeHtml(ex.note || "-")}</td>
        <td><button class="btn btn-danger" data-delete-petty="${ex.id}">حذف</button></td>
      </tr>
    `,
    )
    .join("");

  return `
    <section class="section-card">
      <div class="row">
        <h3 class="card-title">المصروفات النثرية</h3>
        <button class="btn btn-primary" type="button" data-open-modal="petty-modal">إضافة مصروفات نثرية</button>
      </div>
      <div class="modal-backdrop hidden" id="petty-modal">
        <div class="modal">
          <div class="row">
            <h3 class="card-title">إضافة مصروفات نثرية</h3>
            <button class="btn btn-secondary" type="button" data-close-modal="petty-modal">إغلاق</button>
          </div>
      <form id="add-petty-form" class="form-grid">
        <div class="grid-3">
          <div class="field"><label>اسم المصروف</label><input class="input" name="name" required /></div>
          <div class="field"><label>السبب</label><input class="input" name="reason" required /></div>
          <div class="field"><label>المبلغ</label><input class="input" name="amount" type="number" min="0" step="0.01" required /></div>
          <div class="field" style="grid-column:1/-1"><label>ملاحظة</label><input class="input" name="note" /></div>
        </div>
        <button class="btn btn-primary" type="submit">إضافة</button>
      </form>
        </div>
      </div>
      ${project.expenses.petty.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>الاسم</th><th>السبب</th><th>المبلغ</th><th>ملاحظة</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا توجد مصروفات نثرية</div>'}
    </section>
  `;
}

function operationExpensesTemplate(project) {
  const rows = project.expenses.operation
    .map(
      (ex) => `
      <tr>
        <td>${escapeHtml(ex.name)}</td>
        <td>${escapeHtml(ex.unit)}</td>
        <td>${num(ex.qty)}</td>
        <td>${formatMoney(ex.unitPrice)}</td>
        <td>${formatMoney(ex.otherCosts)}</td>
        <td>${formatMoney(ex.total)}</td>
        <td>${escapeHtml(ex.note || "-")}</td>
        <td><button class="btn btn-danger" data-delete-operation="${ex.id}">حذف</button></td>
      </tr>
    `,
    )
    .join("");

  return `
    <section class="section-card">
      <div class="row">
        <h3 class="card-title">مصاريف التشغيل</h3>
        <button class="btn btn-primary" type="button" data-open-modal="operation-modal">إضافة مصروف تشغيل</button>
      </div>
      <div class="modal-backdrop hidden" id="operation-modal">
        <div class="modal">
          <div class="row">
            <h3 class="card-title">إضافة مصروف تشغيل</h3>
            <button class="btn btn-secondary" type="button" data-close-modal="operation-modal">إغلاق</button>
          </div>
      <form id="add-operation-form" class="form-grid">
        <div class="grid-3">
          <div class="field"><label>اسم المصروف</label><input class="input" name="name" required /></div>
          <div class="field"><label>الوحدة</label><select class="select" name="unit" required>${unitOptionsHtml()}</select></div>
          <div class="field"><label>الكمية</label><input class="input" name="qty" type="number" min="0" step="0.01" required /></div>
          <div class="field"><label>سعر الوحدة</label><input class="input" name="unitPrice" type="number" min="0" step="0.01" required /></div>
          <div class="field"><label>مصاريف أخرى</label><input class="input" name="otherCosts" type="number" min="0" step="0.01" value="0" /></div>
          <div class="field"><label>الإجمالي</label><input class="input" id="operation-total" readonly value="0" /></div>
          <div class="field" style="grid-column:1/-1"><label>ملاحظة</label><input class="input" name="note" /></div>
        </div>
        <button class="btn btn-primary" type="submit">إضافة</button>
      </form>
        </div>
      </div>
      ${project.expenses.operation.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>الاسم</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>مصاريف أخرى</th><th>الإجمالي</th><th>ملاحظة</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا توجد مصاريف تشغيل</div>'}
    </section>
  `;
}

function rentalExpensesTemplate(project) {
  const rentalRows = project.expenses.rental.items
    .map((item) => {
      const totals = getRentalNet(item, project.expenses.rental.faults, project.expenses.rental.extras);
      return `
        <tr>
          <td>${escapeHtml(item.equipmentName)}</td>
          <td>${escapeHtml(item.durationType)}</td>
          <td>${num(item.durationValue)}</td>
          <td>${num(item.count)}</td>
          <td>${formatMoney(item.price)}</td>
          <td>${formatMoney(totals.base)}</td>
          <td>${formatMoney(totals.deduction)}</td>
          <td>${formatMoney(totals.addition)}</td>
          <td>${formatMoney(totals.net)}</td>
          <td><button class="btn btn-danger" data-delete-rental-item="${item.id}">حذف</button></td>
        </tr>
      `;
    })
    .join("");

  const faultsRows = project.expenses.rental.faults
    .map((fault) => {
      const target = project.expenses.rental.items.find((i) => i.id === fault.itemId);
      return `
        <tr>
          <td>${escapeHtml(target?.equipmentName || "-")}</td>
          <td>${escapeHtml(fault.durationType)}</td>
          <td>${num(fault.durationValue)}</td>
          <td>${escapeHtml(fault.details || "-")}</td>
          <td>${formatMoney(fault.amount)}</td>
          <td><button class="btn btn-danger" data-delete-rental-fault="${fault.id}">حذف</button></td>
        </tr>
      `;
    })
    .join("");

  const extrasRows = project.expenses.rental.extras
    .map((extra) => {
      const target = project.expenses.rental.items.find((i) => i.id === extra.itemId);
      return `
      <tr>
        <td>${escapeHtml(target?.equipmentName || "-")}</td>
        <td>${escapeHtml(extra.durationType)}</td>
        <td>${num(extra.durationValue)}</td>
        <td>${formatMoney(extra.amount)}</td>
        <td><button class="btn btn-danger" data-delete-rental-extra="${extra.id}">حذف</button></td>
      </tr>
      `;
    })
    .join("");

  return `
    <section class="section-card">
      <div class="subtabs" id="rental-subtabs">
        ${subtabButton("rent", "الإيجار", ui.rentalSubtab)}
        ${subtabButton("fault", "الأعطال", ui.rentalSubtab)}
        ${subtabButton("extra", "الإضافي", ui.rentalSubtab)}
      </div>
    </section>

    ${ui.rentalSubtab === "rent" ? `
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">الإيجار</h3>
          <button class="btn btn-primary" type="button" data-open-modal="rental-item-modal">إضافة إيجار</button>
        </div>
        <div class="modal-backdrop hidden" id="rental-item-modal">
          <div class="modal">
            <div class="row">
              <h3 class="card-title">إضافة إيجار معدة</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="rental-item-modal">إغلاق</button>
            </div>
        <form id="add-rental-item-form" class="form-grid">
          <div class="grid-3">
            <div class="field"><label>اسم المعدات</label><input class="input" name="equipmentName" required /></div>
            <div class="field"><label>نوع المدة</label>
              <select class="select" name="durationType" required>
                <option value="ساعة">ساعة</option>
                <option value="يوم">يوم</option>
                <option value="شهر">شهر</option>
              </select>
            </div>
            <div class="field"><label>قيمة المدة</label><input class="input" type="number" min="0" step="0.01" name="durationValue" required /></div>
            <div class="field"><label>العدد</label><input class="input" type="number" min="1" step="1" value="1" name="count" required /></div>
            <div class="field"><label>السعر</label><input class="input" type="number" min="0" step="0.01" name="price" required /></div>
            <div class="field"><label>تاريخ مرجعي للشهر</label><input class="input" type="date" name="referenceDate" required /></div>
            <div class="field"><label>الإجمالي</label><input class="input" id="rental-item-total" readonly value="0" /></div>
          </div>
          <button class="btn btn-primary" type="submit">إضافة</button>
        </form>
          </div>
        </div>
        ${project.expenses.rental.items.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>المعدة</th><th>المدة</th><th>القيمة</th><th>العدد</th><th>السعر</th><th>الأساسي</th><th>خصومات الأعطال</th><th>الإضافي</th><th>الصافي</th><th>إجراء</th></tr></thead><tbody>${rentalRows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا توجد معدات إيجار</div>'}
      </section>
    ` : ""}

    ${ui.rentalSubtab === "fault" ? `
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">الأعطال</h3>
          <button class="btn btn-primary" type="button" data-open-modal="rental-fault-modal">إضافة عطل</button>
        </div>
        <div class="modal-backdrop hidden" id="rental-fault-modal">
          <div class="modal">
            <div class="row">
              <h3 class="card-title">إضافة عطل</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="rental-fault-modal">إغلاق</button>
            </div>
        <form id="add-rental-fault-form" class="form-grid">
          <div class="grid-3">
            <div class="field"><label>المعدة</label><select class="select" name="itemId" required>
              ${project.expenses.rental.items.map((i) => `<option value="${i.id}">${escapeHtml(i.equipmentName)}</option>`).join("")}
            </select></div>
            <div class="field"><label>نوع المدة</label><select class="select" name="durationType"><option value="ساعة">ساعة</option><option value="يوم">يوم</option><option value="شهر">شهر</option></select></div>
            <div class="field"><label>قيمة المدة</label><input class="input" type="number" min="0" step="0.01" name="durationValue" required /></div>
            <div class="field" style="grid-column:1/-1"><label>التفاصيل</label><input class="input" name="details" /></div>
          </div>
          <button class="btn btn-primary" type="submit" ${project.expenses.rental.items.length ? "" : "disabled"}>إضافة</button>
        </form>
          </div>
        </div>
        ${project.expenses.rental.faults.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>المعدة</th><th>نوع المدة</th><th>قيمة المدة</th><th>التفاصيل</th><th>الخصم</th><th>إجراء</th></tr></thead><tbody>${faultsRows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا توجد أعطال مسجلة</div>'}
      </section>
    ` : ""}

    ${ui.rentalSubtab === "extra" ? `
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">الإضافي</h3>
          <button class="btn btn-primary" type="button" data-open-modal="rental-extra-modal">إضافة وقت إضافي</button>
        </div>
        <div class="modal-backdrop hidden" id="rental-extra-modal">
          <div class="modal">
            <div class="row">
              <h3 class="card-title">إضافة وقت إضافي</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="rental-extra-modal">إغلاق</button>
            </div>
        <form id="add-rental-extra-form" class="form-grid">
          <div class="grid-3">
            <div class="field"><label>المعدة</label><select class="select" name="itemId" required>
              ${project.expenses.rental.items.map((i) => `<option value="${i.id}">${escapeHtml(i.equipmentName)}</option>`).join("")}
            </select></div>
            <div class="field"><label>نوع المدة الإضافية</label><select class="select" name="durationType"><option value="ساعة">ساعة</option><option value="يوم">يوم</option><option value="شهر">شهر</option></select></div>
            <div class="field"><label>قيمة المدة</label><input class="input" type="number" min="0" step="0.01" name="durationValue" required /></div>
          </div>
          <button class="btn btn-primary" type="submit" ${project.expenses.rental.items.length ? "" : "disabled"}>إضافة</button>
        </form>
          </div>
        </div>
        ${project.expenses.rental.extras.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>المعدة</th><th>نوع المدة</th><th>القيمة</th><th>الإضافة</th><th>إجراء</th></tr></thead><tbody>${extrasRows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا توجد إضافيات</div>'}
      </section>
    ` : ""}
  `;
}

function salaryTemplate(project) {
  const totalSalaries = state.workers.reduce((sum, w) => sum + Number(w.salary || 0), 0);
  const totalDeductions = project.expenses.salary.deductions.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const netPaid = Math.max(totalSalaries - totalDeductions, 0);

  const deductionsRows = project.expenses.salary.deductions
    .map(
      (d) => `
      <tr>
        <td>${escapeHtml(getWorkerName(d.workerId))}</td>
        <td>${formatMoney(d.amount)}</td>
        <td>${escapeHtml(d.reason)}</td>
        <td>${escapeHtml(d.note || "-")}</td>
        <td><button class="btn btn-danger" data-delete-salary-deduction="${d.id}">حذف</button></td>
      </tr>
    `,
    )
    .join("");

  const workersRows = state.workers
    .map(
      (w) => `
      <tr>
        <td>${escapeHtml(w.name)}</td>
        <td>${escapeHtml(w.jobTitle)}</td>
        <td>${formatMoney(w.salary)}</td>
      </tr>
    `,
    )
    .join("");

  return `
    <section class="section-card">
      <div class="subtabs" id="salary-subtabs">
        ${subtabButton("salaries", "المرتبات", ui.salarySubtab)}
        ${subtabButton("deductions", "الخصومات", ui.salarySubtab)}
      </div>
    </section>

    ${ui.salarySubtab === "salaries" ? `
      <section class="section-card">
        <h3 class="card-title">المرتبات</h3>
        ${state.workers.length ? `<div class="table-wrap"><table><thead><tr><th>الموظف</th><th>الوظيفة</th><th>المرتب</th></tr></thead><tbody>${workersRows}</tbody></table></div>` : '<div class="empty">لا يوجد موظفون في الإعدادات</div>'}
        <div class="summary-cards" style="margin-top:12px">
          <article class="summary-card"><h4>إجمالي المرتبات</h4><p>${formatMoney(totalSalaries)}</p></article>
          <article class="summary-card"><h4>الخصومات</h4><p>${formatMoney(totalDeductions)}</p></article>
          <article class="summary-card"><h4>صافي المدفوع</h4><p>${formatMoney(netPaid)}</p></article>
        </div>
      </section>
    ` : ""}

    ${ui.salarySubtab === "deductions" ? `
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">الخصومات</h3>
          <button class="btn btn-primary" type="button" data-open-modal="salary-deduction-modal">إضافة خصم</button>
        </div>
        <div class="modal-backdrop hidden" id="salary-deduction-modal">
          <div class="modal">
            <div class="row">
              <h3 class="card-title">إضافة خصم</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="salary-deduction-modal">إغلاق</button>
            </div>
        <form id="add-salary-deduction-form" class="form-grid">
          <div class="grid-3">
            <div class="field"><label>اسم الموظف</label><select class="select" name="workerId" required>${state.workers
              .map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`)
              .join("")}</select></div>
            <div class="field"><label>المبلغ</label><input class="input" type="number" min="0" step="0.01" name="amount" required /></div>
            <div class="field"><label>السبب</label><input class="input" name="reason" required /></div>
            <div class="field" style="grid-column:1/-1"><label>ملاحظة</label><input class="input" name="note" /></div>
          </div>
          <button class="btn btn-primary" type="submit">إضافة</button>
        </form>
          </div>
        </div>
        ${project.expenses.salary.deductions.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>الموظف</th><th>المبلغ</th><th>السبب</th><th>ملاحظة</th><th>إجراء</th></tr></thead><tbody>${deductionsRows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا توجد خصومات</div>'}
      </section>
    ` : ""}
  `;
}

function renderExecutionSection(root) {
  const flatBoq = state.projects.flatMap((project) =>
    project.boq.map((item) => ({
      project,
      item,
      progress: Number(item.qty || 0) > 0 ? (Number(item.executedQty || 0) / Number(item.qty || 0)) * 100 : 0,
    })),
  );

  const optionsProjects = state.projects
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");

  const rows = flatBoq
    .map(({ project, item, progress }) => {
      const subcontractAssigned = getSubcontractAssignedQtyForBoq(project, item.id);
      const subcontractExecuted = getSubcontractExecutedQtyForBoq(project, item.id);
      const selfExecuted = Math.max(Number(item.executedQty || 0) - subcontractExecuted, 0);
      const selfAvailable = Math.max(Number(item.qty || 0) - subcontractAssigned, 0);
      return `
      <tr>
        <td>${escapeHtml(project.name)}</td>
        <td>${escapeHtml(item.itemName)}</td>
        <td>${num(item.qty)}</td>
        <td>${num(subcontractAssigned)}</td>
        <td>${num(selfAvailable)}</td>
        <td>${num(selfExecuted)}</td>
        <td>${num(subcontractExecuted)}</td>
        <td>${num(item.executedQty || 0)}</td>
        <td>${Math.max(selfAvailable - selfExecuted, 0).toFixed(2)}</td>
        <td>${progressBar(progress)}</td>
      </tr>
    `;
    })
    .join("");

  const executionRows = state.executionLogs
    .slice()
    .reverse()
    .slice(0, 40)
    .map((log) => {
      const project = state.projects.find((p) => p.id === log.projectId);
      const boq = project?.boq.find((b) => b.id === log.boqId);
      return `
      <tr>
        <td>${escapeHtml(project?.name || "-")}</td>
        <td>${escapeHtml(boq?.itemName || "-")}</td>
        <td>${escapeHtml(log.performerLabel || "-")}</td>
        <td>${num(log.executedQty)}</td>
        <td>${escapeHtml(new Date(log.createdAt).toLocaleString("en-US"))}</td>
      </tr>
      `;
    })
    .join("");

  root.innerHTML = `
    <section class="section-card">
      <div class="row">
        <h3 class="card-title">إضافة تنفيذ</h3>
        <button class="btn btn-primary" id="open-execution-modal">إضافة تنفيذ</button>
      </div>
      <div class="modal-backdrop hidden" id="execution-modal-backdrop">
        <div class="modal">
          <div class="row">
            <h3 class="card-title">إضافة تنفيذ</h3>
            <button class="btn btn-secondary" type="button" id="close-execution-modal">إغلاق</button>
          </div>
      <form id="add-execution-form" class="form-grid">
        <div class="grid-3">
          <div class="field"><label>المشروع</label><select class="select" name="projectId" id="execution-project" required><option value="">اختر المشروع</option>${optionsProjects}</select></div>
          <div class="field"><label>المقايسة</label><select class="select" name="boqId" id="execution-boq" required><option value="">اختر المقايسة</option></select></div>
          <div class="field"><label>نوع التنفيذ</label><select class="select" name="performerType" id="execution-performer-type"><option value="self">تنفيذ ذاتي</option><option value="subcontractor">مقاول باطن</option></select></div>
          <div class="field hidden" id="execution-subcontract-field"><label>مقاول الباطن</label><select class="select" name="subcontractId" id="execution-subcontract"><option value="">اختر المقاول</option></select></div>
          <div class="field"><label>الكمية المنفذة</label><input class="input" type="number" min="0" step="0.01" name="executedQty" required /></div>
        </div>
        <p class="muted" id="execution-remaining-hint"></p>
        <button class="btn btn-primary" type="submit">إضافة تنفيذ</button>
      </form>
        </div>
      </div>
    </section>

    <section class="section-card">
      <div class="tabs" id="execution-tabs">
        ${tabButton("allItems", "كل البنود من جميع المشاريع", ui.executionTab)}
        ${tabButton("logs", "سجل التنفيذ", ui.executionTab)}
      </div>
    </section>

    ${ui.executionTab === "allItems" ? `
      <section class="section-card">
        <h3 class="card-title">كل البنود من جميع المشاريع</h3>
        ${flatBoq.length ? `<div class="table-wrap execution-table-wrap"><table class="execution-table"><thead><tr><th>المشروع</th><th>البند</th><th>الإجمالي</th><th>المسند للباطن</th><th>التشغيل الذاتي المتاح</th><th>منفذ ذاتي</th><th>منفذ باطن</th><th>المنفذ الكلي</th><th>المتبقي الذاتي</th><th>نسبة الإكمال</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">لا توجد بنود متاحة</div>'}
      </section>
    ` : ""}

    ${ui.executionTab === "logs" ? `
      <section class="section-card">
        <h3 class="card-title">سجل التنفيذ</h3>
        ${state.executionLogs.length ? `<div class="table-wrap"><table><thead><tr><th>المشروع</th><th>المقايسة</th><th>المنفذ</th><th>الكمية</th><th>الوقت</th></tr></thead><tbody>${executionRows}</tbody></table></div>` : '<div class="empty">لا توجد عمليات تنفيذ بعد</div>'}
      </section>
    ` : ""}
  `;

  document.querySelectorAll("#execution-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.executionTab = btn.dataset.tab;
      render();
    });
  });

  const openExecutionModal = document.getElementById("open-execution-modal");
  const closeExecutionModal = document.getElementById("close-execution-modal");
  const executionModalBackdrop = document.getElementById("execution-modal-backdrop");
  openExecutionModal?.addEventListener("click", () => executionModalBackdrop.classList.remove("hidden"));
  closeExecutionModal?.addEventListener("click", () => executionModalBackdrop.classList.add("hidden"));
  executionModalBackdrop?.addEventListener("click", (e) => {
    if (e.target === executionModalBackdrop) executionModalBackdrop.classList.add("hidden");
  });

  const projectSelect = document.getElementById("execution-project");
  const boqSelect = document.getElementById("execution-boq");
  const performerTypeSelect = document.getElementById("execution-performer-type");
  const subcontractField = document.getElementById("execution-subcontract-field");
  const subcontractSelect = document.getElementById("execution-subcontract");
  const executedQtyInput = document.querySelector("#add-execution-form [name='executedQty']");
  const remainingHint = document.getElementById("execution-remaining-hint");

  const refreshExecutionSelectors = () => {
    const project = state.projects.find((p) => p.id === projectSelect.value);
    boqSelect.innerHTML = `<option value="">اختر المقايسة</option>${(project?.boq || [])
      .map((b) => `<option value="${b.id}">${escapeHtml(b.itemName)}</option>`)
      .join("")}`;
    subcontractSelect.innerHTML = `<option value="">اختر المقاول</option>`;
    remainingHint.textContent = "";
  };

  const refreshExecutionHint = () => {
    const project = state.projects.find((p) => p.id === projectSelect.value);
    const boq = project?.boq.find((b) => b.id === boqSelect.value);
    const performerType = performerTypeSelect.value;
    if (!project || !boq) {
      remainingHint.textContent = "";
      return;
    }

    const subcontractAssigned = getSubcontractAssignedQtyForBoq(project, boq.id);
    const subcontractExecuted = getSubcontractExecutedQtyForBoq(project, boq.id);
    const selfExecuted = Math.max(Number(boq.executedQty || 0) - subcontractExecuted, 0);
    const totalRemaining = Math.max(Number(boq.qty || 0) - Number(boq.executedQty || 0), 0);
    const selfAvailable = Math.max(Number(boq.qty || 0) - subcontractAssigned, 0);
    const selfRemaining = Math.max(selfAvailable - selfExecuted, 0);

    const boqSubcontractors = project.subcontractors.filter((s) => s.boqId === boq.id);
    subcontractSelect.innerHTML = `<option value="">اختر المقاول</option>${boqSubcontractors
      .map((s) => `<option value="${s.id}">${escapeHtml(s.contractorName)}</option>`)
      .join("")}`;

    if (performerType === "self") {
      executedQtyInput.max = String(selfRemaining);
      if (Number(executedQtyInput.value || 0) > selfRemaining) {
        executedQtyInput.value = String(selfRemaining);
      }
      remainingHint.textContent = `المتبقي للتنفيذ الذاتي: ${num(selfRemaining)} | المتبقي الكلي في البند: ${num(totalRemaining)}`;
    } else {
      const sub = project.subcontractors.find((s) => s.id === subcontractSelect.value);
      const subRemaining = sub ? Math.max(Number(sub.qty || 0) - Number(sub.executedQty || 0), 0) : 0;
      executedQtyInput.max = String(subRemaining);
      if (Number(executedQtyInput.value || 0) > subRemaining) {
        executedQtyInput.value = String(subRemaining);
      }
      remainingHint.textContent = `المتبقي لهذا المقاول: ${num(subRemaining)} | المتبقي الكلي في البند: ${num(totalRemaining)}`;
    }
  };

  projectSelect.addEventListener("change", () => {
    refreshExecutionSelectors();
    refreshExecutionHint();
  });
  boqSelect.addEventListener("change", refreshExecutionHint);
  performerTypeSelect.addEventListener("change", () => {
    subcontractField.classList.toggle("hidden", performerTypeSelect.value !== "subcontractor");
    refreshExecutionHint();
  });
  subcontractSelect.addEventListener("change", refreshExecutionHint);
  executedQtyInput.addEventListener("input", () => {
    const max = Number(executedQtyInput.max || 0);
    const val = Number(executedQtyInput.value || 0);
    if (max > 0 && val > max) {
      executedQtyInput.value = String(max);
    }
  });
  subcontractField.classList.toggle("hidden", performerTypeSelect.value !== "subcontractor");

  document.getElementById("add-execution-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const projectId = String(form.get("projectId"));
    const boqId = String(form.get("boqId"));
    const performerType = String(form.get("performerType") || "self");
    const subcontractId = String(form.get("subcontractId") || "");
    const executedQty = Number(form.get("executedQty") || 0);

    if (!projectId || !boqId || executedQty <= 0) return;

    const project = state.projects.find((p) => p.id === projectId);
    const boq = project?.boq.find((b) => b.id === boqId);
    if (!project || !boq) return;

    const totalRemaining = Math.max(Number(boq.qty || 0) - Number(boq.executedQty || 0), 0);
    if (executedQty > totalRemaining) {
      showAppPopup(`الكمية المنفذة تتجاوز المتبقي الكلي (${totalRemaining.toFixed(2)})`);
      return;
    }

    const subcontractAssigned = getSubcontractAssignedQtyForBoq(project, boq.id);
    const subcontractExecuted = getSubcontractExecutedQtyForBoq(project, boq.id);
    const selfExecuted = Math.max(Number(boq.executedQty || 0) - subcontractExecuted, 0);

    let performerLabel = "تنفيذ ذاتي";
    if (performerType === "self") {
      const selfAvailable = Math.max(Number(boq.qty || 0) - subcontractAssigned, 0);
      const selfRemaining = Math.max(selfAvailable - selfExecuted, 0);
      if (executedQty > selfRemaining) {
        showAppPopup(`الكمية المنفذة تتجاوز المتبقي الذاتي (${selfRemaining.toFixed(2)})`);
        return;
      }
    } else {
      const subcontract = project.subcontractors.find((s) => s.id === subcontractId && s.boqId === boqId);
      if (!subcontract) {
        showAppPopup("اختر مقاول باطن صحيح");
        return;
      }
      const subRemaining = Math.max(Number(subcontract.qty || 0) - Number(subcontract.executedQty || 0), 0);
      if (executedQty > subRemaining) {
        showAppPopup(`الكمية تتجاوز المتبقي للمقاول (${subRemaining.toFixed(2)})`);
        return;
      }
      subcontract.executedQty = Number(subcontract.executedQty || 0) + executedQty;
      performerLabel = `مقاول باطن: ${subcontract.contractorName}`;
    }

    boq.executedQty = Number(boq.executedQty || 0) + executedQty;

    state.executionLogs.push({
      id: crypto.randomUUID(),
      projectId,
      boqId,
      performerType,
      subcontractId: performerType === "subcontractor" ? subcontractId : null,
      performerLabel,
      executedQty,
      createdAt: new Date().toISOString(),
    });
    addAdminNotification("إضافة تنفيذ", `تم تسجيل تنفيذ في مشروع ${project.name} - بند ${boq.itemName} بكمية ${num(executedQty)}`);

    saveState();
    render();
  });
}

function renderEquipmentsSection(root) {
  const rows = state.companyEquipments
    .map((eq) => {
      const totalMaintenance = eq.maintenanceExpenses.reduce((sum, ex) => sum + Number(ex.amount || 0), 0);
      return `
      <tr>
        <td>${escapeHtml(eq.name)}</td>
        <td>${escapeHtml(eq.purchaseDate)}</td>
        <td>${eq.maintenanceExpenses.length}</td>
        <td>${formatMoney(totalMaintenance)}</td>
        <td><button class="btn btn-danger" data-delete-company-equipment="${eq.id}">حذف</button></td>
      </tr>
      `;
    })
    .join("");

  root.innerHTML = `
    <section class="section-card">
      <div class="tabs" id="equipments-tabs">
        ${tabButton("equipments", "معدات الشركة", ui.equipmentsTab)}
        ${tabButton("expenses", "مصاريف معدات الشركة", ui.equipmentsTab)}
      </div>
    </section>

    ${ui.equipmentsTab === "equipments" ? `
    <section class="section-card">
      <div class="row">
        <h3 class="card-title">معدات الشركة</h3>
        <button class="btn btn-primary" type="button" data-open-modal="add-company-equipment-modal">إضافة معدة</button>
      </div>
      <div class="modal-backdrop hidden" id="add-company-equipment-modal">
        <div class="modal">
          <div class="row">
            <h3 class="card-title">إضافة معدة</h3>
            <button class="btn btn-secondary" type="button" data-close-modal="add-company-equipment-modal">إغلاق</button>
          </div>
      <form id="add-company-equipment-form" class="form-grid">
        <div class="grid-2">
          <div class="field"><label>اسم المعدة</label><input class="input" name="name" required /></div>
          <div class="field"><label>تاريخ الشراء</label><input class="input" name="purchaseDate" type="date" required /></div>
        </div>
        <button class="btn btn-primary" type="submit">إضافة</button>
      </form>
        </div>
      </div>
    </section>
    ` : ""}

    ${ui.equipmentsTab === "expenses" ? `
    <section class="section-card">
      <div class="row">
        <h3 class="card-title">مصاريف معدات الشركة</h3>
        <button class="btn btn-primary" type="button" data-open-modal="add-company-equipment-expense-modal">إضافة مصروف معدة</button>
      </div>
      <div class="modal-backdrop hidden" id="add-company-equipment-expense-modal">
        <div class="modal">
          <div class="row">
            <h3 class="card-title">إضافة مصروف معدة</h3>
            <button class="btn btn-secondary" type="button" data-close-modal="add-company-equipment-expense-modal">إغلاق</button>
          </div>
      <form id="add-company-equipment-expense-form" class="form-grid">
        <div class="grid-3">
          <div class="field"><label>المعدة</label><select class="select" name="equipmentId" required><option value="">اختر</option>${state.companyEquipments.map((eq) => `<option value="${eq.id}">${escapeHtml(eq.name)}</option>`).join("")}</select></div>
          <div class="field"><label>النوع</label><select class="select" name="type" required><option value="صيانة">صيانة</option><option value="عطل">عطل</option></select></div>
          <div class="field"><label>المبلغ</label><input class="input" type="number" min="0" step="0.01" name="amount" required /></div>
          <div class="field" style="grid-column:1/-1"><label>تفاصيل</label><input class="input" name="details" /></div>
        </div>
        <button class="btn btn-primary" type="submit">تسجيل المصروف</button>
      </form>
        </div>
      </div>
    </section>
    ` : ""}

    <section class="section-card">
      ${state.companyEquipments.length ? `<div class="table-wrap"><table><thead><tr><th>اسم المعدة</th><th>تاريخ الشراء</th><th>عدد المصروفات</th><th>إجمالي المصروفات</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">لا توجد معدات مضافة</div>'}
    </section>
  `;

  bindModalToggles();
  document.querySelectorAll("#equipments-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.equipmentsTab = btn.dataset.tab;
      render();
    });
  });

  document.getElementById("add-company-equipment-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const purchaseDate = String(form.get("purchaseDate") || "");
    if (!name || !purchaseDate) return;

    state.companyEquipments.push({
      id: crypto.randomUUID(),
      name,
      purchaseDate,
      maintenanceExpenses: [],
    });
    addAdminNotification("إضافة معدة", `تمت إضافة معدة شركة جديدة: ${name}`);
    saveState();
    render();
  });

  document.getElementById("add-company-equipment-expense-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const equipmentId = String(form.get("equipmentId") || "");
    const type = String(form.get("type") || "");
    const amount = Number(form.get("amount") || 0);
    const details = String(form.get("details") || "").trim();
    const equipment = state.companyEquipments.find((eq) => eq.id === equipmentId);
    if (!equipment || amount <= 0) return;

    equipment.maintenanceExpenses.push({
      id: crypto.randomUUID(),
      type,
      amount,
      details,
      createdAt: new Date().toISOString(),
    });
    addAdminNotification("إضافة مصروف معدة", `تم تسجيل مصروف (${type}) على معدة: ${equipment.name}`);
    saveState();
    render();
  });

  document.querySelectorAll("[data-delete-company-equipment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("هل أنت متأكد من حذف المعدة؟")) return;
      state.companyEquipments = state.companyEquipments.filter((e) => e.id !== btn.dataset.deleteCompanyEquipment);
      state.projects.forEach((p) => {
        p.companyEquipments = p.companyEquipments.filter((e) => e.equipmentId !== btn.dataset.deleteCompanyEquipment);
      });
      saveState();
      render();
    });
  });
}

function renderSettingsSection(root) {
  const rolesRows = state.roles
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(getPermissionLabel(r.permissionKey))}</td>
        <td><button class="btn btn-danger" data-delete-role="${r.id}">حذف</button></td>
      </tr>
    `,
    )
    .join("");

  const usersRows = state.systemUsers
    .map(
      (u) => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.phone)}</td>
        <td>${escapeHtml(getRoleName(u.roleId))}</td>
        <td><button class="btn btn-danger" data-delete-system-user="${u.id}">حذف</button></td>
      </tr>
    `,
    )
    .join("");

  const workersRows = state.workers
    .map(
      (w) => `
      <tr>
        <td>${escapeHtml(w.name)}</td>
        <td>${escapeHtml(w.jobTitle)}</td>
        <td>${formatMoney(w.salary)}</td>
        <td>${escapeHtml(w.startDate)}</td>
        <td>
          <button class="btn btn-secondary" data-edit-worker-salary="${w.id}">تعديل مرتب</button>
          <button class="btn btn-danger" data-delete-worker="${w.id}">حذف</button>
        </td>
      </tr>
    `,
    )
    .join("");

  root.innerHTML = `
    <section class="section-card">
      <div class="tabs settings-tabs" id="settings-tabs">
        ${tabButton("roles", "الأدوار والصلاحيات", ui.settingsTab)}
        ${tabButton("systemUsers", "موظفو النظام", ui.settingsTab)}
        ${tabButton("workers", "موظفو العمل", ui.settingsTab)}
      </div>
    </section>

    ${ui.settingsTab === "roles" ? `
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">الأدوار والصلاحيات</h3>
          <button class="btn btn-primary" type="button" data-open-modal="add-role-modal">إضافة دور</button>
        </div>
        <div class="modal-backdrop hidden" id="add-role-modal">
          <div class="modal">
            <div class="row">
              <h3 class="card-title">إضافة دور</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="add-role-modal">إغلاق</button>
            </div>
        <form id="add-role-form" class="form-grid">
          <div class="grid-2">
            <div class="field"><label>اسم الدور</label><input class="input" name="name" required /></div>
            <div class="field"><label>الصلاحية</label><select class="select" name="permissionKey" required>${permissionOptionsHtml()}</select></div>
          </div>
          <button class="btn btn-primary btn-add" type="submit">إضافة دور</button>
        </form>
          </div>
        </div>
        ${state.roles.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>الدور</th><th>الصلاحيات</th><th>إجراء</th></tr></thead><tbody>${rolesRows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا توجد أدوار</div>'}
      </section>
    ` : ""}

    ${ui.settingsTab === "systemUsers" ? `
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">موظفو النظام</h3>
          <button class="btn btn-primary" type="button" data-open-modal="add-system-user-modal">إضافة مستخدم</button>
        </div>
        <div class="modal-backdrop hidden" id="add-system-user-modal">
          <div class="modal">
            <div class="row">
              <h3 class="card-title">إضافة مستخدم</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="add-system-user-modal">إغلاق</button>
            </div>
        <form id="add-system-user-form" class="form-grid">
          <div class="grid-3">
            <div class="field"><label>الاسم</label><input class="input" name="name" required /></div>
            <div class="field"><label>رقم الهاتف الكويتي</label><input class="input" name="phone" required /></div>
            <div class="field"><label>كلمة المرور</label><input class="input" type="password" name="password" required /></div>
            <div class="field"><label>الدور</label><select class="select" name="roleId"><option value="">بدون</option>${state.roles.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("")}</select></div>
          </div>
          <button class="btn btn-primary btn-add" type="submit">إضافة مستخدم</button>
        </form>
          </div>
        </div>
        ${state.systemUsers.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>الدور</th><th>إجراء</th></tr></thead><tbody>${usersRows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا يوجد مستخدمون</div>'}
      </section>
    ` : ""}

    ${ui.settingsTab === "workers" ? `
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">موظفو العمل</h3>
          <button class="btn btn-primary" type="button" data-open-modal="add-worker-modal">إضافة موظف</button>
        </div>
        <div class="modal-backdrop hidden" id="add-worker-modal">
          <div class="modal">
            <div class="row">
              <h3 class="card-title">إضافة موظف</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="add-worker-modal">إغلاق</button>
            </div>
        <form id="add-worker-form" class="form-grid">
          <div class="grid-3">
            <div class="field"><label>اسم الموظف</label><input class="input" name="name" required /></div>
            <div class="field"><label>الوظيفة</label><input class="input" name="jobTitle" required /></div>
            <div class="field"><label>المرتب</label><input class="input" type="number" min="0" step="0.01" name="salary" required /></div>
            <div class="field"><label>تاريخ بداية العمل</label><input class="input" type="date" name="startDate" required /></div>
          </div>
          <button class="btn btn-primary btn-add" type="submit">إضافة موظف</button>
        </form>
          </div>
        </div>
        ${state.workers.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>الاسم</th><th>الوظيفة</th><th>المرتب</th><th>تاريخ البداية</th><th>إجراء</th></tr></thead><tbody>${workersRows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا يوجد موظفون</div>'}
      </section>
    ` : ""}
    <div class="modal-backdrop hidden" id="edit-worker-salary-modal">
      <div class="modal">
        <div class="row">
          <h3 class="card-title">تعديل مرتب الموظف</h3>
          <button class="btn btn-secondary" type="button" data-close-modal="edit-worker-salary-modal">إغلاق</button>
        </div>
        <form id="edit-worker-salary-form" class="form-grid">
          <input type="hidden" name="workerId" />
          <div class="field"><label>المرتب الجديد</label><input class="input" type="number" min="0" step="0.01" name="salary" required /></div>
          <button class="btn btn-primary" type="submit">حفظ التعديل</button>
        </form>
      </div>
    </div>
  `;

  bindModalToggles();

  document.querySelectorAll("#settings-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.settingsTab = btn.dataset.tab;
      render();
    });
  });

  const roleForm = document.getElementById("add-role-form");
  if (roleForm) {
    roleForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const permissionKey = String(form.get("permissionKey") || "projects");
      state.roles.push({
        id: crypto.randomUUID(),
        name: String(form.get("name") || "").trim(),
        permissionKey,
        permissions: getPermissionLabel(permissionKey),
      });
      addAdminNotification("إضافة دور", `تم إضافة دور جديد: ${String(form.get("name") || "").trim()}`);
      saveState();
      render();
    });
  }

  const systemUserForm = document.getElementById("add-system-user-form");
  if (systemUserForm) {
    systemUserForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const phone = String(form.get("phone") || "").trim();
      if (!isKuwaitiPhone(phone)) {
        showAppPopup("رقم الهاتف الكويتي غير صحيح");
        return;
      }
      state.systemUsers.push({
        id: crypto.randomUUID(),
        name: String(form.get("name") || "").trim(),
        phone,
        password: String(form.get("password") || "").trim(),
        roleId: String(form.get("roleId") || "") || null,
      });
      addAdminNotification("إضافة مستخدم نظام", `تم إضافة مستخدم جديد: ${String(form.get("name") || "").trim()}`);
      saveState();
      render();
    });
  }

  const workerForm = document.getElementById("add-worker-form");
  if (workerForm) {
    workerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      state.workers.push({
        id: crypto.randomUUID(),
        name: String(form.get("name") || "").trim(),
        jobTitle: String(form.get("jobTitle") || "").trim(),
        salary: Number(form.get("salary") || 0),
        startDate: String(form.get("startDate") || ""),
      });
      addAdminNotification("إضافة موظف عمل", `تم إضافة موظف عمل: ${String(form.get("name") || "").trim()}`);
      saveState();
      render();
    });
  }

  document.querySelectorAll("[data-delete-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف هذا الدور؟")) return;
      const id = btn.dataset.deleteRole;
      state.roles = state.roles.filter((r) => r.id !== id);
      state.systemUsers = state.systemUsers.map((u) => ({ ...u, roleId: u.roleId === id ? null : u.roleId }));
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete-system-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف المستخدم؟")) return;
      state.systemUsers = state.systemUsers.filter((u) => u.id !== btn.dataset.deleteSystemUser);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete-worker]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف الموظف؟")) return;
      const id = btn.dataset.deleteWorker;
      state.workers = state.workers.filter((w) => w.id !== id);
      state.projects.forEach((p) => {
        p.expenses.salary.deductions = p.expenses.salary.deductions.filter((d) => d.workerId !== id);
      });
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-edit-worker-salary]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const worker = state.workers.find((w) => w.id === btn.dataset.editWorkerSalary);
      if (!worker) return;
      const modal = document.getElementById("edit-worker-salary-modal");
      const form = document.getElementById("edit-worker-salary-form");
      form.querySelector("[name='workerId']").value = worker.id;
      form.querySelector("[name='salary']").value = String(worker.salary || 0);
      modal.classList.remove("hidden");
    });
  });

  const editSalaryForm = document.getElementById("edit-worker-salary-form");
  if (editSalaryForm) {
    editSalaryForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const workerId = String(fd.get("workerId") || "");
      const salary = Number(fd.get("salary") || 0);
      const worker = state.workers.find((w) => w.id === workerId);
      if (!worker || salary < 0) return;
      worker.salary = salary;
      addAdminNotification("تعديل مرتب", `تم تعديل مرتب الموظف: ${worker.name}`);
      saveState();
      render();
    });
  }
}

function renderAccountsSection(root) {
  if (!ui.accountsUnlocked) {
    root.innerHTML = `
      <section class="section-card">
        <h3 class="card-title">الدخول لقسم الحسابات العامة</h3>
        <form id="accounts-access-form" class="form-grid" style="max-width:420px">
          <div class="field"><label>كلمة المرور الإضافية</label><input class="input" type="password" name="password" required /></div>
          <button class="btn btn-primary" type="submit">دخول</button>
          <p class="muted">الافتراضية: 2468</p>
          <p id="accounts-error" class="error"></p>
        </form>
      </section>
    `;

    document.getElementById("accounts-access-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const password = String(form.get("password") || "");
      if (password !== state.generalAccountsPassword) {
        document.getElementById("accounts-error").textContent = "كلمة المرور غير صحيحة";
        return;
      }
      ui.accountsUnlocked = true;
      render();
    });
    return;
  }

  const reports = getGeneralReports();

  root.innerHTML = `
    <section class="section-card">
      <div class="row">
        <h3 class="card-title">الحسابات العامة والتقارير</h3>
        <button class="btn btn-secondary eye-toggle" id="toggle-finance-visibility">${ui.moneyVisible ? "إخفاء المبالغ" : "إظهار المبالغ"}</button>
      </div>
      <div class="kpi-grid">
        <article class="kpi"><h4>إجمالي إيرادات الشركة</h4><p>${showMoney(reports.general.totalRevenue)}</p></article>
        <article class="kpi"><h4>إجمالي المصروفات</h4><p>${showMoney(reports.general.totalExpenses)}</p></article>
        <article class="kpi"><h4>صافي الربح</h4><p>${showMoney(reports.general.netProfit)}</p></article>
      </div>
    </section>

    <section class="section-card">
      <h3 class="card-title">تقرير المشاريع</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>المشروع</th><th>إجمالي التكاليف</th><th>الربح</th><th>نسبة الإكمال</th></tr></thead>
        <tbody>
          ${reports.projects
            .map(
              (r) => `<tr><td>${escapeHtml(r.name)}</td><td>${showMoney(r.cost)}</td><td>${showMoney(r.profit)}</td><td>${progressBar(r.completion)}</td></tr>`,
            )
            .join("") || "<tr><td colspan='4'>لا توجد بيانات</td></tr>"}
        </tbody>
      </table></div>
    </section>

    <section class="section-card">
      <h3 class="card-title">تقرير المرتبات</h3>
      <div class="summary-cards">
        <article class="summary-card"><h4>إجمالي المرتبات</h4><p>${showMoney(reports.salary.total)}</p></article>
        <article class="summary-card"><h4>الخصومات</h4><p>${showMoney(reports.salary.deductions)}</p></article>
        <article class="summary-card"><h4>المدفوع الفعلي</h4><p>${showMoney(reports.salary.net)}</p></article>
      </div>
    </section>

    <section class="section-card">
      <h3 class="card-title">تقرير مقاولو الباطن</h3>
      <div class="table-wrap"><table>
      <thead><tr><th>المشروع</th><th>الإجمالي</th></tr></thead>
      <tbody>
        ${reports.subcontractors
          .map((r) => `<tr><td>${escapeHtml(r.projectName)}</td><td>${showMoney(r.total)}</td></tr>`)
          .join("") || "<tr><td colspan='2'>لا توجد بيانات</td></tr>"}
      </tbody>
      </table></div>
    </section>

    <section class="section-card">
      <h3 class="card-title">تقرير المعدات</h3>
      <div class="table-wrap"><table>
      <thead><tr><th>المشروع</th><th>تكاليف الإيجار</th><th>الأعطال</th><th>الإضافي</th></tr></thead>
      <tbody>
        ${reports.equipment
          .map((r) => `<tr><td>${escapeHtml(r.projectName)}</td><td>${showMoney(r.rental)}</td><td>${showMoney(r.faults)}</td><td>${showMoney(r.extras)}</td></tr>`)
          .join("") || "<tr><td colspan='4'>لا توجد بيانات</td></tr>"}
      </tbody>
      </table></div>
    </section>

    <section class="section-card">
      <h3 class="card-title">تقرير التنفيذ</h3>
      <div class="table-wrap"><table>
      <thead><tr><th>المشروع</th><th>نسبة الإكمال</th></tr></thead>
      <tbody>
        ${reports.execution
          .map((r) => `<tr><td>${escapeHtml(r.projectName)}</td><td>${progressBar(r.completion)}</td></tr>`)
          .join("") || "<tr><td colspan='2'>لا توجد بيانات</td></tr>"}
      </tbody>
      </table></div>
    </section>

    <section class="section-card">
      <h3 class="card-title">تقرير المصروفات التفصيلي</h3>
      <div class="table-wrap"><table>
      <thead><tr><th>المشروع</th><th>نثرية</th><th>تشغيل</th><th>إيجار</th><th>مرتبات</th></tr></thead>
      <tbody>
        ${reports.expensesDetail
          .map(
            (r) => `<tr><td>${escapeHtml(r.projectName)}</td><td>${showMoney(r.petty)}</td><td>${showMoney(r.operation)}</td><td>${showMoney(r.rental)}</td><td>${showMoney(r.salary)}</td></tr>`,
          )
          .join("") || "<tr><td colspan='5'>لا توجد بيانات</td></tr>"}
      </tbody>
      </table></div>
    </section>
  `;

  document.getElementById("toggle-finance-visibility").addEventListener("click", () => {
    ui.moneyVisible = !ui.moneyVisible;
    render();
  });
}

function bindProjectCreateForm() {
  const form = document.getElementById("create-project-form");
  if (!form) return;

  const boqQty = form.querySelector("[name='boqQty']");
  const boqUnitPrice = form.querySelector("[name='boqUnitPrice']");
  const boqTotal = document.getElementById("boq-total-preview");

  const updateBoqTotalPreview = () => {
    boqTotal.value = String(Number(boqQty.value || 0) * Number(boqUnitPrice.value || 0));
  };

  boqQty.addEventListener("input", updateBoqTotalPreview);
  boqUnitPrice.addEventListener("input", updateBoqTotalPreview);

  document.getElementById("add-custom-field").addEventListener("click", () => {
    syncProjectDraftFromForm(form);
    projectDraft.customFields.push({ key: "", value: "" });
    render();
  });

  document.getElementById("add-boq-row").addEventListener("click", () => {
    const itemName = String(form.querySelector("[name='boqName']").value || "").trim();
    const qty = Number(form.querySelector("[name='boqQty']").value || 0);
    const unit = String(form.querySelector("[name='boqUnit']").value || "").trim();
    const unitPrice = Number(form.querySelector("[name='boqUnitPrice']").value || 0);

    if (!itemName || qty <= 0 || !unit || unitPrice < 0) {
      showAppPopup("الرجاء إدخال بيانات بند صحيحة");
      return;
    }

    projectDraft.boq.push({
      id: crypto.randomUUID(),
      itemName,
      qty,
      unit,
      unitPrice,
      total: qty * unitPrice,
      executedQty: 0,
    });

    form.querySelector("[name='boqName']").value = "";
    form.querySelector("[name='boqQty']").value = "";
    form.querySelector("[name='boqUnit']").value = "";
    form.querySelector("[name='boqUnitPrice']").value = "";
    syncProjectDraftFromForm(form);
    updateBoqTotalPreview();
    render();
  });

  document.querySelectorAll("[data-draft-boq-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف هذا البند من المقايسة؟")) return;
      syncProjectDraftFromForm(form);
      projectDraft.boq = projectDraft.boq.filter((b) => b.id !== btn.dataset.draftBoqRemove);
      render();
    });
  });

  document.querySelectorAll("[data-custom-key]").forEach((input) => {
    input.addEventListener("input", () => {
      const idx = Number(input.dataset.customKey);
      projectDraft.customFields[idx].key = input.value;
    });
  });

  document.querySelectorAll("[data-custom-value]").forEach((input) => {
    input.addEventListener("input", () => {
      const idx = Number(input.dataset.customValue);
      projectDraft.customFields[idx].value = input.value;
    });
  });

  document.querySelectorAll("[data-remove-custom]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncProjectDraftFromForm(form);
      projectDraft.customFields = projectDraft.customFields.filter((_, idx) => String(idx) !== btn.dataset.removeCustom);
      render();
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const name = String(fd.get("name") || "").trim();
    const startDate = String(fd.get("startDate") || "").trim();
    const type = String(fd.get("type") || "طرق").trim() || "طرق";
    const documentFile = fd.get("document");

    if (!name || !startDate) {
      showAppPopup("اسم المشروع وتاريخ البداية مطلوبان");
      return;
    }

    if (!projectDraft.boq.length) {
      showAppPopup("يجب إضافة بند مقايسة واحد على الأقل");
      return;
    }

    const customFields = projectDraft.customFields.filter((f) => String(f.key || "").trim());

    state.projects.push({
      id: crypto.randomUUID(),
      name,
      startDate,
      type,
      documentName: documentFile && typeof documentFile === "object" ? documentFile.name : "",
      customFields,
      boq: structuredClone(projectDraft.boq),
      expenses: {
        petty: [],
        operation: [],
        rental: {
          items: [],
          faults: [],
          extras: [],
        },
        salary: {
          deductions: [],
        },
      },
      subcontractors: [],
      companyEquipments: [],
    });
    addAdminNotification("إضافة مشروع", `تمت إضافة مشروع جديد: ${name}`);

    projectDraft = getEmptyProjectDraft();
    ui.showProjectForm = false;
    saveState();
    render();
  });
}

function bindProjectDetailActions(project) {
  bindModalToggles();

  const expensesTabs = document.getElementById("expenses-tabs");
  if (expensesTabs) {
    expensesTabs.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.expenseTab = btn.dataset.tab;
        render();
      });
    });
  }

  const rentalSubtabs = document.getElementById("rental-subtabs");
  if (rentalSubtabs) {
    rentalSubtabs.querySelectorAll(".subtab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.rentalSubtab = btn.dataset.subtab;
        render();
      });
    });
  }

  const salarySubtabs = document.getElementById("salary-subtabs");
  if (salarySubtabs) {
    salarySubtabs.querySelectorAll(".subtab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.salarySubtab = btn.dataset.subtab;
        render();
      });
    });
  }

  bindSubcontractForm(project);
  bindPettyForm(project);
  bindOperationForm(project);
  bindRentalForms(project);
  bindSalaryForm(project);
  bindProjectEquipmentsForm(project);

  document.querySelectorAll("[data-delete-petty]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف المصروف النثري؟")) return;
      project.expenses.petty = project.expenses.petty.filter((x) => x.id !== btn.dataset.deletePetty);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete-operation]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف مصروف التشغيل؟")) return;
      project.expenses.operation = project.expenses.operation.filter((x) => x.id !== btn.dataset.deleteOperation);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete-rental-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف بند الإيجار؟")) return;
      const id = btn.dataset.deleteRentalItem;
      project.expenses.rental.items = project.expenses.rental.items.filter((x) => x.id !== id);
      project.expenses.rental.faults = project.expenses.rental.faults.filter((x) => x.itemId !== id);
      project.expenses.rental.extras = project.expenses.rental.extras.filter((x) => x.itemId !== id);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete-rental-fault]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف العطل؟")) return;
      project.expenses.rental.faults = project.expenses.rental.faults.filter((x) => x.id !== btn.dataset.deleteRentalFault);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete-rental-extra]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف الإضافة؟")) return;
      project.expenses.rental.extras = project.expenses.rental.extras.filter((x) => x.id !== btn.dataset.deleteRentalExtra);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete-salary-deduction]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف الخصم؟")) return;
      project.expenses.salary.deductions = project.expenses.salary.deductions.filter(
        (x) => x.id !== btn.dataset.deleteSalaryDeduction,
      );
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete-subcontract]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف مقاول الباطن؟")) return;
      project.subcontractors = project.subcontractors.filter((x) => x.id !== btn.dataset.deleteSubcontract);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-remove-project-equipment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("إزالة المعدة من المشروع؟")) return;
      project.companyEquipments = project.companyEquipments.filter((x) => x.id !== btn.dataset.removeProjectEquipment);
      saveState();
      render();
    });
  });
}

function bindSubcontractForm(project) {
  const form = document.getElementById("add-subcontract-form");
  if (!form) return;

  const boqSelect = form.querySelector("[name='boqId']");
  const qtyInput = form.querySelector("[name='qty']");
  const unitPriceInput = form.querySelector("[name='unitPrice']");
  const totalInput = document.getElementById("subcontract-total");
  const hint = document.getElementById("subcontract-remaining-hint");

  const refresh = () => {
    totalInput.value = String(Number(qtyInput.value || 0) * Number(unitPriceInput.value || 0));
    const boq = getBoqItem(project, boqSelect.value);
    if (!boq) {
      hint.textContent = "";
      return;
    }
    const assigned = getSubcontractAssignedQtyForBoq(project, boq.id);
    const selfExecuted = getSelfExecutedQtyForBoq(project, boq.id);
    const availableForSubcontract = Math.max(Number(boq.qty || 0) - assigned - selfExecuted, 0);
    qtyInput.max = String(availableForSubcontract);
    if (Number(qtyInput.value || 0) > availableForSubcontract) {
      qtyInput.value = String(availableForSubcontract);
      totalInput.value = String(Number(qtyInput.value || 0) * Number(unitPriceInput.value || 0));
    }
    hint.textContent = `إجمالي البند: ${num(boq.qty)} | منفذ ذاتياً: ${num(selfExecuted)} | مسند للباطن: ${num(assigned)} | المتاح للباطن: ${num(availableForSubcontract)}`;
  };

  boqSelect.addEventListener("change", refresh);
  qtyInput.addEventListener("input", refresh);
  unitPriceInput.addEventListener("input", refresh);
  refresh();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);

    const boqId = String(fd.get("boqId") || "");
    const contractorName = String(fd.get("contractorName") || "").trim();
    const qty = Number(fd.get("qty") || 0);
    const unit = String(fd.get("unit") || "").trim();
    const unitPrice = Number(fd.get("unitPrice") || 0);

    if (!boqId || !contractorName || qty <= 0 || !unit || unitPrice < 0) {
      return;
    }
    const boq = getBoqItem(project, boqId);
    if (!boq) return;
    const assigned = getSubcontractAssignedQtyForBoq(project, boqId);
    const selfExecuted = getSelfExecutedQtyForBoq(project, boqId);
    const availableForSubcontract = Math.max(Number(boq.qty || 0) - assigned - selfExecuted, 0);
    if (qty > availableForSubcontract) {
      showAppPopup(`الكمية المطلوبة تتجاوز المتاح في البند (${availableForSubcontract.toFixed(2)})`);
      return;
    }

    const projectAssignable = getProjectSubcontractAssignableQty(project);
    if (qty > projectAssignable) {
      showAppPopup(`الكمية المطلوبة تتجاوز المتاح في المشروع (${projectAssignable.toFixed(2)})`);
      return;
    }

    project.subcontractors.push({
      id: crypto.randomUUID(),
      boqId,
      contractorName,
      qty,
      executedQty: 0,
      unit,
      unitPrice,
      total: qty * unitPrice,
    });
    addAdminNotification("إضافة مقاول باطن", `تمت إضافة مقاول باطن (${contractorName}) في مشروع ${project.name}`);

    saveState();
    render();
  });
}

function bindPettyForm(project) {
  const form = document.getElementById("add-petty-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const reason = String(fd.get("reason") || "").trim();
    const amount = Number(fd.get("amount") || 0);
    const note = String(fd.get("note") || "").trim();

    if (!name || !reason || amount <= 0) return;

    project.expenses.petty.push({
      id: crypto.randomUUID(),
      name,
      reason,
      amount,
      note,
    });
    addAdminNotification("إضافة مصروف نثري", `تمت إضافة مصروف نثري في مشروع ${project.name}`);

    saveState();
    render();
  });
}

function bindOperationForm(project) {
  const form = document.getElementById("add-operation-form");
  if (!form) return;

  const qtyInput = form.querySelector("[name='qty']");
  const unitPriceInput = form.querySelector("[name='unitPrice']");
  const otherInput = form.querySelector("[name='otherCosts']");
  const totalInput = document.getElementById("operation-total");

  const refresh = () => {
    totalInput.value = String(
      Number(qtyInput.value || 0) * Number(unitPriceInput.value || 0) + Number(otherInput.value || 0),
    );
  };

  qtyInput.addEventListener("input", refresh);
  unitPriceInput.addEventListener("input", refresh);
  otherInput.addEventListener("input", refresh);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const unit = String(fd.get("unit") || "").trim();
    const qty = Number(fd.get("qty") || 0);
    const unitPrice = Number(fd.get("unitPrice") || 0);
    const otherCosts = Number(fd.get("otherCosts") || 0);
    const note = String(fd.get("note") || "").trim();

    if (!name || !unit || qty <= 0 || unitPrice < 0 || otherCosts < 0) return;

    project.expenses.operation.push({
      id: crypto.randomUUID(),
      name,
      unit,
      qty,
      unitPrice,
      otherCosts,
      total: qty * unitPrice + otherCosts,
      note,
    });
    addAdminNotification("إضافة مصروف تشغيل", `تمت إضافة مصروف تشغيل في مشروع ${project.name}`);

    saveState();
    render();
  });
}

function bindRentalForms(project) {
  const itemForm = document.getElementById("add-rental-item-form");
  if (itemForm) {
    const durationType = itemForm.querySelector("[name='durationType']");
    const durationValue = itemForm.querySelector("[name='durationValue']");
    const countInput = itemForm.querySelector("[name='count']");
    const priceInput = itemForm.querySelector("[name='price']");
    const referenceDate = itemForm.querySelector("[name='referenceDate']");
    const total = document.getElementById("rental-item-total");

    const refresh = () => {
      total.value = String(
        calcDurationCost(
          String(durationType.value || "ساعة"),
          Number(durationValue.value || 0),
          Number(countInput.value || 0),
          Number(priceInput.value || 0),
          String(referenceDate.value || ""),
        ),
      );
    };

    [durationType, durationValue, countInput, priceInput, referenceDate].forEach((x) => x.addEventListener("input", refresh));

    itemForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(itemForm);
      const equipmentName = String(fd.get("equipmentName") || "").trim();
      const durationTypeValue = String(fd.get("durationType") || "ساعة");
      const durationValueNum = Number(fd.get("durationValue") || 0);
      const count = Number(fd.get("count") || 0);
      const price = Number(fd.get("price") || 0);
      const referenceDateValue = String(fd.get("referenceDate") || "");

      if (!equipmentName || durationValueNum <= 0 || count <= 0 || price < 0 || !referenceDateValue) return;

      project.expenses.rental.items.push({
        id: crypto.randomUUID(),
        equipmentName,
        durationType: durationTypeValue,
        durationValue: durationValueNum,
        count,
        price,
        referenceDate: referenceDateValue,
      });
      addAdminNotification("إضافة إيجار معدة", `تمت إضافة إيجار معدة في مشروع ${project.name}`);

      saveState();
      render();
    });
  }

  const faultForm = document.getElementById("add-rental-fault-form");
  if (faultForm) {
    faultForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(faultForm);
      const itemId = String(fd.get("itemId") || "");
      const durationTypeValue = String(fd.get("durationType") || "ساعة");
      const durationValueNum = Number(fd.get("durationValue") || 0);
      const details = String(fd.get("details") || "").trim();
      const item = project.expenses.rental.items.find((x) => x.id === itemId);
      if (!item || durationValueNum <= 0) return;

      const amount = calcAdditionalRentalAmount(item, durationTypeValue, durationValueNum);

      project.expenses.rental.faults.push({
        id: crypto.randomUUID(),
        itemId,
        durationType: durationTypeValue,
        durationValue: durationValueNum,
        details,
        amount,
      });
      addAdminNotification("إضافة عطل معدة", `تمت إضافة عطل معدة في مشروع ${project.name}`);

      saveState();
      render();
    });
  }

  const extraForm = document.getElementById("add-rental-extra-form");
  if (extraForm) {
    extraForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(extraForm);
      const itemId = String(fd.get("itemId") || "");
      const durationTypeValue = String(fd.get("durationType") || "ساعة");
      const durationValueNum = Number(fd.get("durationValue") || 0);
      const item = project.expenses.rental.items.find((x) => x.id === itemId);
      if (!item || durationValueNum <= 0) return;

      const amount = calcAdditionalRentalAmount(item, durationTypeValue, durationValueNum);

      project.expenses.rental.extras.push({
        id: crypto.randomUUID(),
        itemId,
        durationType: durationTypeValue,
        durationValue: durationValueNum,
        amount,
      });
      addAdminNotification("إضافة وقت إضافي", `تمت إضافة وقت إضافي لمعدة في مشروع ${project.name}`);

      saveState();
      render();
    });
  }
}

function bindSalaryForm(project) {
  const form = document.getElementById("add-salary-deduction-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const workerId = String(fd.get("workerId") || "");
    const amount = Number(fd.get("amount") || 0);
    const reason = String(fd.get("reason") || "").trim();
    const note = String(fd.get("note") || "").trim();
    if (!workerId || amount <= 0 || !reason) return;

    project.expenses.salary.deductions.push({
      id: crypto.randomUUID(),
      workerId,
      amount,
      reason,
      note,
    });
    addAdminNotification("إضافة خصم موظف", `تمت إضافة خصم في مشروع ${project.name}`);

    saveState();
    render();
  });
}

function bindProjectEquipmentsForm(project) {
  const form = document.getElementById("add-project-equipment-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const equipmentId = String(fd.get("equipmentId") || "");
    const amount = Number(fd.get("amount") || 0);
    const note = String(fd.get("note") || "").trim();

    if (!equipmentId || amount <= 0) return;

    let entity = project.companyEquipments.find((x) => x.equipmentId === equipmentId);
    if (!entity) {
      entity = {
        id: crypto.randomUUID(),
        equipmentId,
        expenses: [],
      };
      project.companyEquipments.push(entity);
    }

    entity.expenses.push({
      id: crypto.randomUUID(),
      amount,
      note,
      createdAt: new Date().toISOString(),
    });
    addAdminNotification("إضافة مصروف معدة داخل مشروع", `تمت إضافة مصروف معدة داخل مشروع ${project.name}`);

    saveState();
    render();
  });
}

function getGeneralReports() {
  const projects = state.projects.map((project) => {
    const summary = getProjectFinancialSummary(project);
    const completion = getProjectCompletion(project);
    const boqTotal = project.boq.reduce((s, b) => s + Number(b.total || 0), 0);
    const profit = boqTotal - summary.totalExpenses;

    return {
      id: project.id,
      name: project.name,
      cost: summary.totalExpenses,
      revenue: boqTotal,
      profit,
      completion,
      summary,
    };
  });

  const totalRevenue = projects.reduce((s, p) => s + p.revenue, 0);
  const totalExpenses = projects.reduce((s, p) => s + p.cost, 0);

  const totalSalaries = state.workers.reduce((s, w) => s + Number(w.salary || 0), 0) * Math.max(projects.length, 1);
  const deductions = state.projects.reduce(
    (s, p) => s + p.expenses.salary.deductions.reduce((x, y) => x + Number(y.amount || 0), 0),
    0,
  );

  return {
    general: {
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
    },
    projects,
    salary: {
      total: totalSalaries,
      deductions,
      net: Math.max(totalSalaries - deductions, 0),
    },
    subcontractors: state.projects.map((p) => ({
      projectName: p.name,
      total: p.subcontractors.reduce((s, c) => s + Number(c.total || 0), 0),
    })),
    equipment: state.projects.map((p) => {
      const rental = p.expenses.rental.items.reduce(
        (s, item) => s + getRentalNet(item, p.expenses.rental.faults, p.expenses.rental.extras).net,
        0,
      );
      const faults = p.expenses.rental.faults.reduce((s, f) => s + Number(f.amount || 0), 0);
      const extras = p.expenses.rental.extras.reduce((s, ex) => s + Number(ex.amount || 0), 0);
      return {
        projectName: p.name,
        rental,
        faults,
        extras,
      };
    }),
    execution: state.projects.map((p) => ({
      projectName: p.name,
      completion: getProjectCompletion(p),
    })),
    expensesDetail: state.projects.map((p) => {
      const petty = p.expenses.petty.reduce((s, x) => s + Number(x.amount || 0), 0);
      const operation = p.expenses.operation.reduce((s, x) => s + Number(x.total || 0), 0);
      const rental = p.expenses.rental.items.reduce(
        (s, item) => s + getRentalNet(item, p.expenses.rental.faults, p.expenses.rental.extras).net,
        0,
      );
      const salary = Math.max(
        state.workers.reduce((sum, w) => sum + Number(w.salary || 0), 0) -
          p.expenses.salary.deductions.reduce((sum, d) => sum + Number(d.amount || 0), 0),
        0,
      );
      return {
        projectName: p.name,
        petty,
        operation,
        rental,
        salary,
      };
    }),
  };
}

function getProjectFinancialSummary(project) {
  const totalSubcontractors = project.subcontractors.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const boqTotal = project.boq.reduce((sum, b) => sum + Number(b.total || 0), 0);
  const selfExecution = Math.max(boqTotal - totalSubcontractors, 0);
  const qtyStats = getSubcontractQtyStats(project);

  const petty = project.expenses.petty.reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const operation = project.expenses.operation.reduce((sum, x) => sum + Number(x.total || 0), 0);
  const rentalNet = project.expenses.rental.items.reduce(
    (sum, item) => sum + getRentalNet(item, project.expenses.rental.faults, project.expenses.rental.extras).net,
    0,
  );
  const totalSalaries = state.workers.reduce((sum, w) => sum + Number(w.salary || 0), 0);
  const deductions = project.expenses.salary.deductions.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const netSalaries = Math.max(totalSalaries - deductions, 0);
  const projectEquipment = project.companyEquipments.reduce(
    (sum, e) => sum + e.expenses.reduce((s, x) => s + Number(x.amount || 0), 0),
    0,
  );

  const totalExpenses = petty + operation + rentalNet + netSalaries + projectEquipment;

  return {
    totalSubcontractors,
    selfExecution,
    totalExpenses,
    qtyStats,
  };
}

function getSubcontractAssignedQtyForBoq(project, boqId, excludeSubcontractId = null) {
  return project.subcontractors
    .filter((s) => s.boqId === boqId && s.id !== excludeSubcontractId)
    .reduce((sum, s) => sum + Number(s.qty || 0), 0);
}

function getSubcontractExecutedQtyForBoq(project, boqId) {
  return project.subcontractors
    .filter((s) => s.boqId === boqId)
    .reduce((sum, s) => sum + Number(s.executedQty || 0), 0);
}

function getSelfExecutedQtyForBoq(project, boqId) {
  const boq = getBoqItem(project, boqId);
  if (!boq) return 0;
  const totalExecuted = Number(boq.executedQty || 0);
  const subcontractExecuted = getSubcontractExecutedQtyForBoq(project, boqId);
  return Math.max(totalExecuted - subcontractExecuted, 0);
}

function getProjectSubcontractAssignableQty(project) {
  return project.boq.reduce((sum, boq) => {
    const assigned = getSubcontractAssignedQtyForBoq(project, boq.id);
    const selfExecuted = getSelfExecutedQtyForBoq(project, boq.id);
    const available = Math.max(Number(boq.qty || 0) - assigned - selfExecuted, 0);
    return sum + available;
  }, 0);
}

function getSubcontractQtyStats(project) {
  const totalQty = project.boq.reduce((sum, b) => sum + Number(b.qty || 0), 0);
  const rawSubcontractQty = project.subcontractors.reduce((sum, s) => sum + Number(s.qty || 0), 0);
  const subcontractQty = Math.min(rawSubcontractQty, totalQty);
  const selfQty = Math.max(totalQty - subcontractQty, 0);
  const subcontractPercent = totalQty > 0 ? (subcontractQty / totalQty) * 100 : 0;
  const selfPercent = totalQty > 0 ? (selfQty / totalQty) * 100 : 0;
  return {
    totalQty,
    subcontractQty,
    selfQty,
    subcontractPercent: Math.min(subcontractPercent, 100),
    selfPercent: Math.min(selfPercent, 100),
  };
}

function getProjectCompletion(project) {
  const totalQty = project.boq.reduce((sum, b) => sum + Number(b.qty || 0), 0);
  if (totalQty <= 0) return 0;
  const executedQty = project.boq.reduce((sum, b) => sum + Math.min(Number(b.executedQty || 0), Number(b.qty || 0)), 0);
  return Math.min((executedQty / totalQty) * 100, 100);
}

function normalizeProjectData(project) {
  const normalized = { ...project };
  normalized.boq = (project.boq || []).map((b) => ({
    ...b,
    qty: Number(b.qty || 0),
    unitPrice: Number(b.unitPrice || 0),
    total: Number(b.total || Number(b.qty || 0) * Number(b.unitPrice || 0)),
    executedQty: Number(b.executedQty || 0),
  }));
  normalized.subcontractors = (project.subcontractors || []).map((s) => ({
    ...s,
    qty: Number(s.qty || 0),
    unitPrice: Number(s.unitPrice || 0),
    total: Number(s.total || Number(s.qty || 0) * Number(s.unitPrice || 0)),
    executedQty: Number(s.executedQty || 0),
  }));
  normalized.expenses = normalized.expenses || {
    petty: [],
    operation: [],
    rental: { items: [], faults: [], extras: [] },
    salary: { deductions: [] },
  };
  normalized.companyEquipments = normalized.companyEquipments || [];
  return normalized;
}

function getRentalNet(item, faults, extras) {
  const base = calcDurationCost(item.durationType, item.durationValue, item.count, item.price, item.referenceDate);
  const deduction = faults.filter((f) => f.itemId === item.id).reduce((sum, f) => sum + Number(f.amount || 0), 0);
  const addition = extras.filter((e) => e.itemId === item.id).reduce((sum, e) => sum + Number(e.amount || 0), 0);
  return {
    base,
    deduction,
    addition,
    net: Math.max(base + addition - deduction, 0),
  };
}

function calcAdditionalRentalAmount(baseItem, durationType, durationValue) {
  const baseHours = durationToHours(baseItem.durationType, 1, baseItem.referenceDate);
  const perHour = baseHours > 0 ? Number(baseItem.price || 0) / baseHours : 0;
  const targetHours = durationToHours(durationType, durationValue, baseItem.referenceDate);
  return perHour * targetHours * Number(baseItem.count || 1);
}

function calcDurationCost(durationType, durationValue, count, price, referenceDate) {
  const units = durationUnits(durationType, durationValue, referenceDate);
  return units * Number(count || 0) * Number(price || 0);
}

function durationUnits(type, value, date) {
  const v = Number(value || 0);
  if (type === "شهر") {
    return v * daysInMonth(date);
  }
  return v;
}

function durationToHours(type, value, date) {
  const v = Number(value || 0);
  if (type === "ساعة") return v;
  if (type === "يوم") return v * 24;
  if (type === "شهر") return v * daysInMonth(date) * 24;
  return v;
}

function daysInMonth(dateString) {
  const date = dateString ? new Date(dateString) : new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + 1, 0).getDate();
}

function getBoqItem(project, boqId) {
  return project.boq.find((b) => b.id === boqId);
}

function getWorkerName(id) {
  return state.workers.find((w) => w.id === id)?.name || "-";
}

function getRoleName(id) {
  const role = state.roles.find((r) => r.id === id);
  return role ? normalizeRole(role).name : "-";
}

function normalizeRole(role) {
  if (!role) {
    return {
      id: "",
      name: "",
      permissionKey: "all",
      permissions: getPermissionLabel("all"),
    };
  }

  const permissionKey = role.permissionKey || (role.permissions === "كامل الصلاحيات" ? "all" : "projects");
  return {
    ...role,
    permissionKey,
    permissions: getPermissionLabel(permissionKey),
  };
}

function getPermissionProfile(key) {
  return PERMISSION_OPTIONS.find((p) => p.key === key) || PERMISSION_OPTIONS[0];
}

function getPermissionLabel(key) {
  return getPermissionProfile(key).label;
}

function permissionOptionsHtml(selectedKey = "projects") {
  return PERMISSION_OPTIONS.map(
    (option) => `<option value="${option.key}" ${option.key === selectedKey ? "selected" : ""}>${option.label}</option>`,
  ).join("");
}

function unitOptionsHtml(selectedUnit = "متر") {
  return UNIT_OPTIONS.map(
    (unit) => `<option value="${unit}" ${unit === selectedUnit ? "selected" : ""}>${unit}</option>`,
  ).join("");
}

function getAllowedSectionsForUser(user) {
  if (!user?.roleId) {
    return SECTION_KEYS;
  }
  const roleRaw = state.roles.find((r) => r.id === user.roleId);
  if (!roleRaw) return SECTION_KEYS;
  const role = normalizeRole(roleRaw);
  const permissions = getPermissionProfile(role.permissionKey);
  return permissions.sections.filter((section) => SECTION_KEYS.includes(section));
}

function progressBar(value) {
  const safeValue = Math.max(0, Math.min(Number(value || 0), 100));
  return `<div class="progress-wrap"><div class="progress-track"><span class="progress-fill" style="width:${safeValue.toFixed(1)}%"></span></div><small>${safeValue.toFixed(1)}%</small></div>`;
}

function showMoney(value) {
  if (!ui.moneyVisible) return "***";
  return formatMoneyRaw(value);
}

function formatMoney(value) {
  if (!ui.moneyVisible) return "***";
  return formatMoneyRaw(value);
}

function formatMoneyRaw(value) {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount)} د.ك`;
}

function num(value) {
  return Number(value || 0).toFixed(2);
}

function isKuwaitiPhone(phone) {
  return /^(?:\+965|965)?[569]\d{7}$/.test(normalizePhone(phone));
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\s+/g, "");
}

function titleBySection(section) {
  if (section === "projects") return "إدارة المشاريع";
  if (section === "execution") return "قسم التنفيذ";
  if (section === "equipments") return "معدات الشركة";
  if (section === "settings") return "الإعدادات";
  if (section === "accounts") return "الحسابات العامة";
  return "لوحة التحكم";
}

function sidebarButton(id, title) {
  return `<button class="nav-btn ${ui.section === id ? "active" : ""}" data-section="${id}">${title}</button>`;
}

function tabButton(id, title, active) {
  return `<button type="button" class="tab-btn ${active === id ? "active" : ""}" data-tab="${id}">${title}</button>`;
}

function subtabButton(id, title, active) {
  return `<button type="button" class="subtab-btn ${active === id ? "active" : ""}" data-subtab="${id}">${title}</button>`;
}

function bindModalToggles() {
  document.querySelectorAll("[data-open-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open-modal");
      const modal = id ? document.getElementById(id) : null;
      modal?.classList.remove("hidden");
    });
  });
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-close-modal");
      const modal = id ? document.getElementById(id) : null;
      modal?.classList.add("hidden");
    });
  });
  document.querySelectorAll(".modal-backdrop").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
      }
    });
  });
}

function showAppPopup(message) {
  const id = "app-message-popup";
  document.getElementById(id)?.remove();
  const popup = document.createElement("div");
  popup.id = id;
  popup.className = "modal-backdrop";
  popup.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="row">
        <h3 class="card-title">تنبيه</h3>
        <button class="btn btn-secondary" type="button" id="app-message-popup-close">إغلاق</button>
      </div>
      <p class="muted" style="margin-top:0">${escapeHtml(message)}</p>
    </div>
  `;
  document.body.appendChild(popup);
  const close = () => popup.remove();
  popup.querySelector("#app-message-popup-close")?.addEventListener("click", close);
  popup.addEventListener("click", (e) => {
    if (e.target === popup) close();
  });
}

function notificationsModalTemplate() {
  const rows = state.notifications
    .slice(0, 80)
    .map(
      (n) => `
      <article class="summary-card" style="margin-bottom:8px">
        <h4>${escapeHtml(n.title)}</h4>
        <p style="font-size:0.95rem;color:#445d75;font-weight:500">${escapeHtml(n.description)}</p>
        <small class="muted">${escapeHtml(new Date(n.createdAt).toLocaleString("en-US"))}</small>
      </article>
    `,
    )
    .join("");

  return `
    <div class="modal-backdrop hidden" id="notifications-modal">
      <div class="modal">
        <div class="row">
          <h3 class="card-title">الإشعارات</h3>
          <button class="btn btn-secondary" type="button" id="close-notifications">إغلاق</button>
        </div>
        ${rows || '<div class="empty">لا توجد إشعارات حالياً</div>'}
      </div>
    </div>
  `;
}

function isAdminUser(user) {
  if (!user) return false;
  const role = state.roles.find((r) => r.id === user.roleId);
  if (role && role.permissionKey === "all") return true;
  if (!user.roleId && user.id === state.systemUsers[0]?.id) return true;
  return false;
}

function addAdminNotification(title, description) {
  const actor = state.systemUsers.find((u) => u.id === state.session.userId);
  if (isAdminUser(actor)) return;
  const actorName = actor?.name ? `بواسطة ${actor.name}` : "بواسطة مستخدم";
  state.notifications.unshift({
    id: crypto.randomUUID(),
    title,
    description: `${description} - ${actorName}`,
    createdAt: new Date().toISOString(),
    read: false,
  });
  state.notifications = state.notifications.slice(0, 200);
}

function projectCreateFormTemplate(inModal = false) {
  const content = `
    <section class="section-card">
      <div class="row">
        <h3 class="card-title">إضافة مشروع</h3>
        ${inModal ? '<button type="button" class="btn btn-secondary" id="close-project-modal">إغلاق</button>' : ""}
      </div>
      <form id="create-project-form" class="form-grid">
        <div class="grid-3">
          <div class="field"><label>اسم المشروع</label><input class="input" name="name" value="${escapeHtml(projectDraft.name || "")}" required /></div>
          <div class="field"><label>تاريخ البداية</label><input class="input" type="date" name="startDate" value="${escapeHtml(projectDraft.startDate || "")}" required /></div>
          <div class="field"><label>نوع المشروع</label><input class="input" name="type" value="${escapeHtml(projectDraft.type || "طرق")}" required /></div>
          <div class="field" style="grid-column:1/-1"><label>مستند المشروع (PDF / Word / صورة)</label><input class="input" type="file" name="document" accept=".pdf,.doc,.docx,image/*" /></div>
        </div>

        <div class="section-card" style="margin:0">
          <div class="row">
            <h4 class="card-title" style="margin:0">أنواع مخصصة بحقول مرنة</h4>
            <button type="button" class="btn btn-secondary" id="add-custom-field">إضافة حقل مرن</button>
          </div>
          <div class="form-grid" style="margin-top:10px">
            ${projectDraft.customFields
              .map(
                (field, idx) => `
              <div class="grid-3">
                <div class="field"><label>اسم الحقل</label><input class="input" data-custom-key="${idx}" value="${escapeHtml(field.key || "")}" /></div>
                <div class="field"><label>القيمة</label><input class="input" data-custom-value="${idx}" value="${escapeHtml(field.value || "")}" /></div>
                <div class="field" style="align-self:end"><button type="button" class="btn btn-danger" data-remove-custom="${idx}">حذف</button></div>
              </div>
            `,
              )
              .join("") || "<p class='muted'>لا توجد حقول إضافية حالياً</p>"}
          </div>
        </div>

        <div class="section-card" style="margin:0">
          <h4 class="card-title">جدول المقايسات</h4>
          <div class="grid-3">
            <div class="field"><label>اسم البند</label><input class="input" name="boqName" /></div>
            <div class="field"><label>الكمية</label><input class="input" type="number" min="0" step="0.01" name="boqQty" /></div>
            <div class="field"><label>الوحدة</label><select class="select" name="boqUnit">${unitOptionsHtml()}</select></div>
            <div class="field"><label>سعر الوحدة</label><input class="input" type="number" min="0" step="0.01" name="boqUnitPrice" /></div>
            <div class="field"><label>الإجمالي</label><input id="boq-total-preview" class="input" readonly value="0" /></div>
            <div class="field" style="align-self:end"><button type="button" class="btn btn-secondary" id="add-boq-row">إضافة مقايسة</button></div>
          </div>
          ${projectDraft.boq.length ? `
            <div class="table-wrap" style="margin-top:10px">
              <table>
                <thead><tr><th>اسم البند</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة</th><th>الإجمالي</th><th>إجراء</th></tr></thead>
                <tbody>
                  ${projectDraft.boq
                    .map(
                      (row) => `<tr><td>${escapeHtml(row.itemName)}</td><td>${num(row.qty)}</td><td>${escapeHtml(row.unit)}</td><td>${formatMoney(row.unitPrice)}</td><td>${formatMoney(row.total)}</td><td><button class='btn btn-danger' type='button' data-draft-boq-remove='${row.id}'>حذف</button></td></tr>`,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          ` : '<div class="empty" style="margin-top:10px">لا توجد بنود مضافة</div>'}
        </div>

        <div class="row">
          <button type="submit" class="btn btn-primary">حفظ المشروع</button>
        </div>
      </form>
    </section>
  `;
  if (!inModal) return content;
  return `<div class="modal-backdrop" id="project-modal-backdrop"><div class="modal">${content}</div></div>`;
}

function getEmptyProjectDraft() {
  return {
    name: "",
    startDate: "",
    type: "طرق",
    customFields: [],
    boq: [],
  };
}

function syncProjectDraftFromForm(form) {
  projectDraft.name = String(form.querySelector("[name='name']")?.value || "").trim();
  projectDraft.startDate = String(form.querySelector("[name='startDate']")?.value || "").trim();
  projectDraft.type = String(form.querySelector("[name='type']")?.value || "طرق").trim() || "طرق";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
