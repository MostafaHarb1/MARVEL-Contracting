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
      phone: "01000000000",
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
  accountsTab: "overview",
  accountsFilterMonth: "all",
  accountsFilterYear: "all",
  accountsFilterProjectId: "all",
  expenseTab: "petty",
  rentalSubtab: "rent",
  salarySubtab: "salaries",
  settingsTab: "roles",
  equipmentsTab: "equipments",
  mobileMenuOpen: false,
  accountsUnlocked: false,
  moneyVisible: true,
  showProjectForm: false,
  openProjectMenuId: null,
  pendingProjectBoqModalProjectId: null,
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
            <label for="phone">رقم الهاتف المصري</label>
            <input id="phone" class="input" name="phone" placeholder="مثال: 01012345678" required />
          </div>
          <div class="field">
            <label for="password">الرقم السري</label>
            <input id="password" class="input" name="password" type="password" required />
          </div>
          <button type="submit" class="btn btn-primary">تسجيل الدخول</button>
          <p class="muted">المستخدم الافتراضي: 01000000000 - كلمة المرور: 123456</p>
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
      errorEl.textContent = "الرجاء إدخال رقم هاتف مصري صحيح (11 رقم)";
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
          <p class="muted" style="margin:0 0 8px">المستخدم: ${escapeHtml(user?.name || "-")}</p>
          <button class="btn btn-soft" id="logout-btn" style="width:100%">تسجيل الخروج</button>
        </div>
      </aside>
      <main class="content">
        <div class="topbar">
          <div class="row topbar-main">
            <button class="btn btn-secondary mobile-menu-btn" id="mobile-menu-btn">☰</button>
            <strong>${titleBySection(ui.section)}</strong>
            <div class="row topbar-actions">
              <button class="btn btn-secondary icon-action-btn" id="toggle-money-btn" title="${ui.moneyVisible ? "إخفاء المبالغ" : "إظهار المبالغ"}">${ui.moneyVisible ? outlineEyeIcon() : outlineEyeOffIcon()}</button>
              ${isAdmin ? `<button class="btn btn-secondary notif-btn icon-action-btn" id="open-notifications" title="الإشعارات">${outlineBellIcon()}${unreadNotifications ? `<b>${unreadNotifications}</b>` : ""}</button>` : ""}
            </div>
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
  const activeProjects = getActiveProjects();
  if (!ui.selectedProjectId) {
    const totalProjects = activeProjects.length;
    const runningProjects = activeProjects.filter((p) => getProjectCompletion(p) < 100).length;
    const avgCompletion = totalProjects
      ? activeProjects.reduce((sum, p) => sum + getProjectCompletion(p), 0) / totalProjects
      : 0;

    const cards = activeProjects
      .map((project) => {
        const progress = Math.max(0, Math.min(100, getProjectCompletion(project)));
        const status = progress >= 100 ? "مكتمل" : "قيد التنفيذ";
        const qtyStats = getSubcontractQtyStats(project);
        return `
          <article class="project-card ${progress >= 100 ? "done" : ""}" data-open-project="${project.id}">
            <div class="project-card-head">
              <div class="project-card-title-wrap">
                <strong class="project-card-title">${escapeHtml(project.name)}</strong>
                <span class="badge ${progress >= 100 ? "done" : "running"}"><b class="status-dot"></b>${status}</span>
              </div>
              <div class="project-card-menu">
                <button type="button" class="project-menu-trigger" data-project-menu-toggle="${project.id}" aria-label="خيارات المشروع">${outlineMoreIcon()}</button>
                <div class="project-menu-dropdown ${ui.openProjectMenuId === project.id ? "open" : ""}">
                  <button type="button" data-project-menu-action="addBoq" data-project-id="${project.id}">إضافة مقايسة</button>
                  <button type="button" data-project-menu-action="delete" data-project-id="${project.id}" class="danger">حذف المشروع</button>
                </div>
              </div>
            </div>
            <div class="project-meta-grid">
              <div class="project-meta-item">${infoIcon("calendar")}<span>${escapeHtml(project.startDate || "-")}</span></div>
              <div class="project-meta-item project-meta-item--items">${infoIcon("items")}<span>${project.boq.length} بند</span></div>
            </div>
            <div class="split-progress">
              <div class="split-col">
                <div class="split-row"><span>تنفيذ ذاتي</span><strong>${qtyStats.selfPercent.toFixed(1)}%</strong></div>
              </div>
              <div class="split-col">
                <div class="split-row"><span>مقاولو الباطن</span><strong>${qtyStats.subcontractPercent.toFixed(1)}%</strong></div>
              </div>
            </div>
            <div class="project-overall-progress">
              <span class="project-overall-label">نسبة الإكمال الكلية</span>
              <div class="project-overall-value">${progress.toFixed(1)}%</div>
              <div class="project-overall-track">
                <span class="project-overall-fill" style="width:${progress.toFixed(1)}%"></span>
              </div>
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
        <div class="row projects-list-header">
          <h3 class="card-title">قائمة المشاريع</h3>
          <button class="btn btn-primary" id="open-project-modal">إضافة مشروع</button>
        </div>
        ${activeProjects.length ? `<div class="project-grid">${cards}</div>` : '<div class="empty">لا توجد مشاريع حالياً</div>'}
      </section>
      ${ui.showProjectForm ? projectCreateFormTemplate(true) : ""}
    `;

    document.querySelectorAll("[data-open-project]").forEach((card) => {
      card.addEventListener("click", () => {
        if (ui.openProjectMenuId) ui.openProjectMenuId = null;
        ui.selectedProjectId = card.dataset.openProject;
        ui.mobileMenuOpen = false;
        ui.projectTab = "boq";
        ui.expenseTab = "petty";
        ui.rentalSubtab = "rent";
        ui.salarySubtab = "salaries";
        render();
      });
    });

    document.querySelectorAll(".project-card-menu").forEach((menu) => {
      menu.addEventListener("click", (e) => e.stopPropagation());
    });

    document.querySelectorAll("[data-project-menu-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.projectMenuToggle;
        ui.openProjectMenuId = ui.openProjectMenuId === id ? null : id;
        render();
      });
    });

    document.querySelectorAll("[data-project-menu-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.projectMenuAction;
        const projectId = btn.dataset.projectId;
        const project = activeProjects.find((p) => p.id === projectId);
        if (!project) return;
        ui.openProjectMenuId = null;
        if (action === "delete") {
          if (!confirm("هل أنت متأكد من حذف المشروع؟")) return;
          softDeleteProjectById(projectId);
          saveState();
          render();
          return;
        }
        if (action === "addBoq") {
          ui.selectedProjectId = projectId;
          ui.projectTab = "boq";
          ui.pendingProjectBoqModalProjectId = projectId;
          render();
        }
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
  if (!project || project.isDeleted) {
    ui.selectedProjectId = null;
    render();
    return;
  }

  const summary = getProjectFinancialSummary(project);
  root.innerHTML = `
    <section class="section-card project-header-card">
      <div class="row project-header-row">
        <div class="project-header-nav">
          <button class="btn btn-secondary icon-action-btn project-back-btn" id="back-project-list" title="العودة لقائمة المشاريع" aria-label="العودة لقائمة المشاريع">${outlineBackArrowIcon()}</button>
          <div class="project-header-title-wrap">
            <h3 class="card-title project-header-title">${escapeHtml(project.name)}</h3>
            <p class="project-header-meta">تاريخ البداية: ${escapeHtml(project.startDate || "-")}</p>
          </div>
        </div>
        <button class="btn btn-danger project-delete-btn" id="delete-project-inside">حذف المشروع</button>
      </div>
    </section>

    <section class="section-card project-tabs-card">
      <div class="tabs" id="project-tabs">
        ${tabButton("boq", "المقايسات", ui.projectTab)}
        ${tabButton("documents", "مستندات المشروع", ui.projectTab)}
        ${tabButton("expenses", "المصروفات", ui.projectTab)}
        ${tabButton("subcontract", "مقاولو الباطن", ui.projectTab)}
        ${tabButton("projectEquipment", "معدات الشركة داخل المشروع", ui.projectTab)}
      </div>
    </section>

    ${renderProjectTabContent(project, summary)}
  `;

  if (ui.pendingProjectBoqModalProjectId === project.id) {
    ui.pendingProjectBoqModalProjectId = null;
  }

  document.getElementById("back-project-list").addEventListener("click", () => {
    ui.selectedProjectId = null;
    ui.mobileMenuOpen = false;
    render();
  });
  document.getElementById("delete-project-inside").addEventListener("click", () => {
    if (!confirm("هل أنت متأكد من حذف المشروع؟")) return;
    softDeleteProjectById(project.id);
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

function renderProjectTabContent(project, summary) {
  if (ui.projectTab === "boq") {
    const rows = project.boq
      .map((item) => {
        const executed = Number(item.executedQty || 0);
        const progress = Number(item.qty || 0) > 0 ? (executed / Number(item.qty || 0)) * 100 : 0;
        return `
          <tr>
            <td>${escapeHtml(item.itemName)}</td>
            <td>${num(item.qty)}</td>
            <td>${escapeHtml(item.unit || "-")}</td>
            <td>${formatMoney(item.unitPrice)}</td>
            <td>${formatMoney(item.total)}</td>
            <td>${progressBar(progress)}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <section class="section-card">
        <div class="row boq-header-row">
          <h3 class="card-title">المقايسات (${project.boq.length})</h3>
          <button class="btn btn-primary" type="button" data-open-modal="project-boq-modal">إضافة مقايسة</button>
        </div>
        <div class="modal-backdrop ${ui.pendingProjectBoqModalProjectId === project.id ? "" : "hidden"}" id="project-boq-modal">
          <div class="modal">
            <div class="row">
              <h3 class="card-title">إضافة مقايسة</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="project-boq-modal">إغلاق</button>
            </div>
            <form id="add-project-boq-form" class="form-grid">
              <div class="grid-3">
                <div class="field"><label>اسم البند</label><input class="input" name="itemName" required /></div>
                <div class="field"><label>الكمية</label><input class="input" type="number" min="0" step="0.01" name="qty" required /></div>
                <div class="field"><label>الوحدة</label><select class="select" name="unit" required>${unitOptionsHtml()}</select></div>
                <div class="field"><label>سعر الوحدة</label><input class="input money-input" type="text" inputmode="decimal" name="unitPrice" required /></div>
                <div class="field"><label>الإجمالي</label><input class="input" id="project-boq-total-preview" readonly value="0" /></div>
              </div>
              <button class="btn btn-primary" type="submit">إضافة</button>
            </form>
          </div>
        </div>
        ${project.boq.length ? `
          <div class="table-wrap boq-table-wrap">
            <table>
              <thead>
                <tr><th>اسم البند</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة</th><th>الإجمالي</th><th>نسبة الإكمال</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>` : '<div class="empty">لا توجد مقايسات في هذا المشروع</div>'}
      </section>
      <section class="section-card">
        <h3 class="card-title">الملخص المالي للمشروع</h3>
        <div class="summary-cards">
          <article class="summary-card"><h4>إجمالي مقاولو الباطن</h4><p>${formatMoney(summary.totalSubcontractors)} (${summary.subcontractValuePercent.toFixed(1)}%)</p></article>
          <article class="summary-card"><h4>إجمالي التشغيل الذاتي</h4><p>${formatMoney(summary.selfExecution)} (${summary.selfExecutionValuePercent.toFixed(1)}%)</p></article>
          <article class="summary-card"><h4>إجمالي المصروفات</h4><p>${formatMoney(summary.totalExpenses)}</p></article>
          <article class="summary-card"><h4>كمية التشغيل الذاتي</h4><p>${num(summary.qtyStats.selfQty)} ${getProjectPrimaryQtyUnit(project)}</p></article>
          <article class="summary-card"><h4>كمية مقاولي الباطن</h4><p>${num(summary.qtyStats.subcontractQty)}</p></article>
        </div>
      </section>
    `;
  }

  if (ui.projectTab === "documents") {
    const docsRows = (project.documents || [])
      .map(
        (doc) => `
          <tr>
            <td>${escapeHtml(doc.name || "-")}</td>
            <td>${escapeHtml(doc.type || "-")}</td>
            <td>${escapeHtml(doc.sizeLabel || "-")}</td>
            <td>${escapeHtml(new Date(doc.uploadedAt || new Date().toISOString()).toLocaleString("en-US"))}</td>
            <td>
              <div class="row" style="gap:6px;justify-content:flex-start">
                <button class="btn btn-secondary" type="button" data-view-project-doc="${doc.id}">عرض</button>
                <button class="btn btn-danger" type="button" data-delete-project-doc="${doc.id}">حذف</button>
              </div>
            </td>
          </tr>
        `,
      )
      .join("");
    return `
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">مستندات المشروع</h3>
        </div>
        <form id="add-project-documents-form" class="form-grid" style="margin-top:10px">
          <div class="field">
            <label>رفع مستندات المشروع (PDF / Word / صورة)</label>
            <input class="input" type="file" name="documents" accept=".pdf,.doc,.docx,image/*" multiple />
          </div>
          <button class="btn btn-primary" type="submit">رفع المستندات</button>
        </form>
        ${(project.documents || []).length
          ? `<div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>اسم الملف</th><th>النوع</th><th>الحجم</th><th>تاريخ الرفع</th><th>إجراء</th></tr></thead><tbody>${docsRows}</tbody></table></div>`
          : '<div class="empty" style="margin-top:16px">لا توجد مستندات مرفوعة لهذا المشروع</div>'}
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
          <td>
            <div class="row" style="gap:6px;justify-content:flex-start">
              <button class="btn btn-secondary" data-edit-subcontract="${sc.id}">تعديل الكمية</button>
              <button class="btn btn-danger" data-delete-subcontract="${sc.id}">حذف</button>
            </div>
          </td>
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
            <div class="field"><label>الوحدة</label><select class="select" name="unit" id="subcontract-unit" required disabled><option value="">اختر المقايسة أولاً</option></select></div>
            <div class="field"><label>سعر الوحدة</label><input class="input money-input" type="text" inputmode="decimal" name="unitPrice" required /></div>
            <div class="field"><label>الإجمالي</label><input class="input" id="subcontract-total" readonly value="0" /></div>
          </div>
          <p class="muted" id="subcontract-remaining-hint"></p>
          <button class="btn btn-primary" type="submit">إضافة</button>
        </form>
          </div>
        </div>
        <div class="modal-backdrop hidden" id="edit-subcontract-modal">
          <div class="modal" style="max-width:520px">
            <div class="row">
              <h3 class="card-title">تعديل كمية مقاول الباطن</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="edit-subcontract-modal">إغلاق</button>
            </div>
            <form id="edit-subcontract-form" class="form-grid">
              <input type="hidden" name="subcontractId" />
              <div class="field"><label>المقاول</label><input class="input" name="contractorName" readonly /></div>
              <div class="field"><label>المقايسة</label><input class="input" name="boqName" readonly /></div>
              <div class="field"><label>الكمية</label><input class="input" type="number" min="0" step="0.01" name="qty" required /></div>
              <p class="muted" id="edit-subcontract-hint"></p>
              <button class="btn btn-primary" type="submit">حفظ التعديل</button>
            </form>
          </div>
        </div>
        ${project.subcontractors.length ? `
          <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>المقايسة</th><th>المقاول</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة</th><th>الإجمالي</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table></div>
        ` : '<div class="empty" style="margin-top:12px">لا يوجد مقاولو باطن</div>'}
        <div class="summary-cards" style="margin-top:12px">
          <article class="summary-card"><h4>إجمالي وحدات المشروع</h4><p>${num(qtyStats.totalQty)}</p></article>
          <article class="summary-card"><h4>وحدات مقاولي الباطن</h4><p>${num(qtyStats.subcontractQty)} (${qtyStats.subcontractPercent.toFixed(1)}%)</p></article>
          <article class="summary-card"><h4>التشغيل الذاتي</h4><p>${num(qtyStats.selfQty)} (${qtyStats.selfPercent.toFixed(1)}%)</p></article>
        </div>
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
            <div class="field"><label>مصروف المعدة</label><input class="input money-input" type="text" inputmode="decimal" name="amount" required /></div>
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
  const pettyTotal = project.expenses.petty.reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const operationTotal = project.expenses.operation.reduce((sum, x) => sum + Number(x.total || 0), 0);
  const rentalTotal = project.expenses.rental.items.reduce(
    (sum, item) => sum + getRentalNet(item, project.expenses.rental.faults, project.expenses.rental.extras).net,
    0,
  );
  const expensesTotal = pettyTotal + operationTotal + rentalTotal;

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
    ${ui.expenseTab === "petty" || ui.expenseTab === "operation" ? `
    <section class="section-card">
      <h3 class="card-title">ملخص المصروفات</h3>
      <div class="summary-cards">
        <article class="summary-card"><h4>إجمالي المصروفات</h4><p>${formatMoney(expensesTotal)}</p></article>
        <article class="summary-card"><h4>إجمالي مصاريف التشغيل</h4><p>${formatMoney(operationTotal)}</p></article>
        <article class="summary-card"><h4>إجمالي المصروفات النثرية</h4><p>${formatMoney(pettyTotal)}</p></article>
        <article class="summary-card"><h4>إجمالي إيجار المعدات</h4><p>${formatMoney(rentalTotal)}</p></article>
      </div>
    </section>` : ""}
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
          <div class="field"><label>المبلغ</label><input class="input money-input" name="amount" type="text" inputmode="decimal" required /></div>
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
          <div class="field"><label>سعر الوحدة</label><input class="input money-input" name="unitPrice" type="text" inputmode="decimal" required /></div>
          <div class="field"><label>مصاريف أخرى (اختياري)</label><input class="input money-input" name="otherCosts" type="text" inputmode="decimal" value="0" /></div>
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
            <div class="field"><label>العدد</label><input class="input" type="number" min="1" step="1" value="1" name="count" required /></div>
            <div class="field"><label>السعر</label><input class="input money-input" type="text" inputmode="decimal" name="price" required /></div>
            <div class="field"><label>تاريخ مرجعي للشهر</label><input class="input" type="date" name="referenceDate" required /></div>
            <div class="field"><label>الإجمالي</label><input class="input" id="rental-item-total" readonly value="0" /></div>
          </div>
          <button class="btn btn-primary" type="submit">إضافة</button>
        </form>
          </div>
        </div>
        ${project.expenses.rental.items.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>المعدة</th><th>المدة</th><th>العدد</th><th>السعر</th><th>الأساسي</th><th>خصومات الأعطال</th><th>الإضافي</th><th>الصافي</th><th>إجراء</th></tr></thead><tbody>${rentalRows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا توجد معدات إيجار</div>'}
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
            <div class="field" style="grid-column:1/-1"><label>التفاصيل</label><input class="input" name="details" /></div>
          </div>
          <button class="btn btn-primary" type="submit" ${project.expenses.rental.items.length ? "" : "disabled"}>إضافة</button>
        </form>
          </div>
        </div>
        ${project.expenses.rental.faults.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>المعدة</th><th>نوع المدة</th><th>التفاصيل</th><th>الخصم</th><th>إجراء</th></tr></thead><tbody>${faultsRows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا توجد أعطال مسجلة</div>'}
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
          </div>
          <button class="btn btn-primary" type="submit" ${project.expenses.rental.items.length ? "" : "disabled"}>إضافة</button>
        </form>
          </div>
        </div>
        ${project.expenses.rental.extras.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>المعدة</th><th>نوع المدة</th><th>الإضافة</th><th>إجراء</th></tr></thead><tbody>${extrasRows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا توجد إضافيات</div>'}
      </section>
    ` : ""}
  `;
}

function salaryTemplate(project) {
  const projectWorkers = getProjectWorkers(project);
  const totalSalaries = projectWorkers.reduce((sum, w) => sum + Number(w.salary || 0), 0);
  const deductionsByWorker = getDeductionsByWorker(project);
  const totalDeductions = Object.values(deductionsByWorker).reduce((sum, value) => sum + value, 0);
  const totalPaidFromCash = Math.max(totalSalaries - totalDeductions, 0);

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

  const workersRows = projectWorkers
    .map(
      (w) => {
      const deduction = Number(deductionsByWorker[w.id] || 0);
      const paid = Math.max(Number(w.salary || 0) - deduction, 0);
      return `
      <tr>
        <td>${escapeHtml(w.name)}</td>
        <td>${escapeHtml(w.jobTitle)}</td>
        <td>${formatMoney(w.salary)}${deduction > 0 ? ` <span class="muted">(-${formatMoneyRaw(deduction)})</span>` : ""}</td>
        <td>${formatMoney(deduction)}</td>
        <td>${formatMoney(paid)}</td>
      </tr>
    `},
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
        <div class="row">
          <h3 class="card-title">المرتبات</h3>
          <button class="btn btn-primary" type="button" data-open-modal="project-workers-modal">تعيين موظفي المشروع</button>
        </div>
        <div class="modal-backdrop hidden" id="project-workers-modal">
          <div class="modal">
            <div class="row">
              <h3 class="card-title">تعيين موظفي المشروع</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="project-workers-modal">إغلاق</button>
            </div>
            <form id="project-workers-form" class="form-grid">
              ${state.workers.length ? state.workers
                .map((w) => `<label class="row" style="justify-content:flex-start;gap:8px"><input type="checkbox" name="workerIds" value="${w.id}" ${project.assignedWorkerIds?.includes(w.id) ? "checked" : ""} /><span>${escapeHtml(w.name)} - ${escapeHtml(w.jobTitle)}</span></label>`)
                .join("") : "<div class='empty'>لا يوجد موظفون في الإعدادات</div>"}
              <button class="btn btn-primary" type="submit">حفظ التعيين</button>
            </form>
          </div>
        </div>
        ${projectWorkers.length ? `<div class="table-wrap"><table><thead><tr><th>الموظف</th><th>الوظيفة</th><th>المرتب</th><th>الخصم</th><th>المدفوع من النقدية</th></tr></thead><tbody>${workersRows}</tbody></table></div>` : '<div class="empty">لم يتم تعيين موظفين لهذا المشروع</div>'}
        <div class="summary-cards" style="margin-top:12px">
          <article class="summary-card"><h4>إجمالي المرتبات</h4><p>${formatMoney(totalSalaries)}</p></article>
          <article class="summary-card"><h4>الخصومات</h4><p>${formatMoney(totalDeductions)}</p></article>
          <article class="summary-card"><h4>إجمالي المدفوع من النقدية</h4><p>${formatMoney(totalPaidFromCash)}</p></article>
        </div>
      </section>
    ` : ""}

    ${ui.salarySubtab === "deductions" ? `
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">الخصومات</h3>
          <button class="btn btn-primary" type="button" data-open-modal="salary-deduction-modal" ${projectWorkers.length ? "" : "disabled"}>إضافة خصم</button>
        </div>
        ${projectWorkers.length ? "" : "<div class='empty' style='margin-bottom:12px'>يرجى تعيين موظفي المشروع أولاً</div>"}
        <div class="modal-backdrop hidden" id="salary-deduction-modal">
          <div class="modal">
            <div class="row">
              <h3 class="card-title">إضافة خصم</h3>
              <button class="btn btn-secondary" type="button" data-close-modal="salary-deduction-modal">إغلاق</button>
            </div>
        <form id="add-salary-deduction-form" class="form-grid">
          <div class="grid-3">
            <div class="field"><label>اسم الموظف</label><select class="select" name="workerId" required>${projectWorkers
              .map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`)
              .join("")}</select></div>
            <div class="field"><label>المبلغ</label><input class="input money-input" type="text" inputmode="decimal" name="amount" required /></div>
            <div class="field"><label>السبب</label><input class="input" name="reason" required /></div>
            <div class="field" style="grid-column:1/-1"><label>ملاحظة</label><input class="input" name="note" /></div>
          </div>
          <button class="btn btn-primary" type="submit">إضافة</button>
        </form>
          </div>
        </div>
        ${projectWorkers.length ? (project.expenses.salary.deductions.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>الموظف</th><th>المبلغ</th><th>السبب</th><th>ملاحظة</th><th>إجراء</th></tr></thead><tbody>${deductionsRows}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">لا توجد خصومات</div>') : '<div class="empty" style="margin-top:12px">يرجى تعيين موظفي المشروع أولاً</div>'}
      </section>
    ` : ""}
  `;
}

function renderExecutionSection(root) {
  const activeProjects = getActiveProjects();
  const flatBoq = activeProjects.flatMap((project) =>
    project.boq.map((item) => ({
      project,
      item,
      progress: Number(item.qty || 0) > 0 ? (Number(item.executedQty || 0) / Number(item.qty || 0)) * 100 : 0,
    })),
  );

  const optionsProjects = activeProjects
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

  root.innerHTML = `
    <section class="section-card">
      <div class="row section-tools-row execution-header-row">
        <h3 class="card-title">التنفيذ</h3>
        <button class="btn btn-primary" id="open-execution-modal">إضافة تنفيذ</button>
      </div>
      <div class="tabs section-tools-tabs" id="execution-tabs">
        ${tabButton("allItems", "كل البنود من جميع المشاريع", ui.executionTab)}
        ${tabButton("logs", "سجل التنفيذ", ui.executionTab)}
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

    ${ui.executionTab === "allItems" ? `
      <section class="section-card">
        ${flatBoq.length ? `<div class="table-wrap execution-table-wrap"><div class="execution-scroll-inner"><table class="execution-table"><thead><tr><th>المشروع</th><th>البند</th><th>الإجمالي</th><th>المسند للباطن</th><th>التشغيل الذاتي المتاح</th><th>منفذ ذاتي</th><th>منفذ باطن</th><th>المنفذ الكلي</th><th>المتبقي الذاتي</th><th>نسبة الإكمال</th></tr></thead><tbody>${rows}</tbody></table></div></div>` : '<div class="empty">لا توجد بنود متاحة</div>'}
      </section>
    ` : ""}

    ${ui.executionTab === "logs" ? `
      <section class="section-card">
        ${state.executionLogs.length ? `<div class="table-wrap"><table><thead><tr><th>المشروع</th><th>المقايسة</th><th>المنفذ</th><th>الكمية</th><th>الوقت</th></tr></thead><tbody>${state.executionLogs
          .slice()
          .reverse()
          .slice(0, 40)
          .map((log) => {
            const project = state.projects.find((p) => p.id === log.projectId);
            const boq = project?.boq.find((b) => b.id === log.boqId);
            return `<tr><td>${escapeHtml(project?.name || "-")}</td><td>${escapeHtml(boq?.itemName || "-")}</td><td>${escapeHtml(log.performerLabel || "-")}</td><td>${num(log.executedQty)}</td><td>${escapeHtml(new Date(log.createdAt).toLocaleString("en-US"))}</td></tr>`;
          })
          .join("")}</tbody></table></div>` : '<div class="empty">لا توجد عمليات تنفيذ بعد</div>'}
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
    const project = activeProjects.find((p) => p.id === projectSelect.value);
    boqSelect.innerHTML = `<option value="">اختر المقايسة</option>${(project?.boq || [])
      .map((b) => `<option value="${b.id}">${escapeHtml(b.itemName)}</option>`)
      .join("")}`;
    subcontractSelect.innerHTML = `<option value="">اختر المقاول</option>`;
    remainingHint.textContent = "";
  };

  const refreshExecutionHint = () => {
    const project = activeProjects.find((p) => p.id === projectSelect.value);
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

    const project = activeProjects.find((p) => p.id === projectId);
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

  const equipmentsModalId = ui.equipmentsTab === "equipments"
    ? "add-company-equipment-modal"
    : "add-company-equipment-expense-modal";
  const equipmentsAddLabel = ui.equipmentsTab === "equipments" ? "إضافة معدة" : "إضافة مصروف معدة";

  root.innerHTML = `
    <section class="section-card">
      <div class="row section-tools-row">
        <h3 class="card-title">معدات الشركة</h3>
        <div class="row section-tools-controls">
          <div class="tabs section-tools-tabs" id="equipments-tabs">
            ${tabButton("equipments", "قائمة المعدات", ui.equipmentsTab)}
            ${tabButton("expenses", "مصاريف المعدات", ui.equipmentsTab)}
          </div>
          <button class="btn btn-primary" type="button" data-open-modal="${equipmentsModalId}">${equipmentsAddLabel}</button>
        </div>
      </div>
    </section>

    ${ui.equipmentsTab === "equipments" ? `
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
    ` : ""}

    ${ui.equipmentsTab === "expenses" ? `
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
              <div class="field"><label>المبلغ</label><input class="input money-input" type="text" inputmode="decimal" name="amount" required /></div>
              <div class="field" style="grid-column:1/-1"><label>تفاصيل</label><input class="input" name="details" /></div>
            </div>
            <button class="btn btn-primary" type="submit">تسجيل المصروف</button>
          </form>
        </div>
      </div>
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

  document.getElementById("add-company-equipment-form")?.addEventListener("submit", (e) => {
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

  const companyEquipmentExpenseForm = document.getElementById("add-company-equipment-expense-form");
  applyMoneyFormattingTo(companyEquipmentExpenseForm);
  companyEquipmentExpenseForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const equipmentId = String(form.get("equipmentId") || "");
    const type = String(form.get("type") || "");
    const amount = parseMoneyValue(form.get("amount"));
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
  const deletedProjects = getDeletedProjects();
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

  const deletedProjectsRows = deletedProjects
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.deletedByName || p.deletedById || "-")}</td>
        <td>${escapeHtml(p.deletedAt ? new Date(p.deletedAt).toLocaleString("en-US") : "-")}</td>
        <td>
          <div class="row" style="gap:6px;justify-content:flex-start">
            <button class="btn btn-secondary" data-restore-project="${p.id}">استرجاع</button>
            <button class="btn btn-danger" data-permanent-delete-project="${p.id}">حذف نهائي</button>
          </div>
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
        ${tabButton("deletedProjects", "المشاريع المحذوفة", ui.settingsTab)}
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
            <div class="field"><label>رقم الهاتف المصري (11 رقم)</label><input class="input" name="phone" required /></div>
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

    ${ui.settingsTab === "deletedProjects" ? `
      <section class="section-card">
        <div class="row">
          <h3 class="card-title">المشاريع المحذوفة</h3>
        </div>
        ${deletedProjects.length
          ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>اسم المشروع</th><th>المحذوف بواسطة</th><th>تاريخ الحذف</th><th>إجراء</th></tr></thead><tbody>${deletedProjectsRows}</tbody></table></div>`
          : '<div class="empty" style="margin-top:12px">لا توجد مشاريع محذوفة</div>'}
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
        showAppPopup("رقم الهاتف المصري غير صحيح (11 رقم)");
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
        p.assignedWorkerIds = (p.assignedWorkerIds || []).filter((workerId) => workerId !== id);
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

  document.querySelectorAll("[data-restore-project]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("استرجاع هذا المشروع؟")) return;
      if (!restoreProjectById(btn.dataset.restoreProject)) return;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-permanent-delete-project]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف نهائي للمشروع؟ لا يمكن التراجع.")) return;
      if (!permanentlyDeleteProjectById(btn.dataset.permanentDeleteProject)) return;
      saveState();
      render();
    });
  });
}

function renderAccountsSection(root) {
  const activeProjects = getActiveProjects();
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

  const reports = getGeneralReports({
    month: ui.accountsFilterMonth,
    year: ui.accountsFilterYear,
    projectId: ui.accountsFilterProjectId,
  });
  const years = getAccountsYearRange();

  root.innerHTML = `
    <section class="section-card">
      <div class="row">
        <h3 class="card-title">الحسابات العامة</h3>
      </div>
      <div class="grid-3 accounts-filters-row">
        <div class="field">
          <label>فلتر السنة</label>
          <select class="select" id="accounts-filter-year">
            <option value="all" ${ui.accountsFilterYear === "all" ? "selected" : ""}>كل السنوات</option>
            ${years.map((y) => `<option value="${y}" ${String(y) === ui.accountsFilterYear ? "selected" : ""}>${y}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>فلتر الشهر</label>
          <select class="select" id="accounts-filter-month">
            <option value="all" ${ui.accountsFilterMonth === "all" ? "selected" : ""}>كل الشهور</option>
            ${Array.from({ length: 12 }).map((_, i) => `<option value="${i + 1}" ${String(i + 1) === ui.accountsFilterMonth ? "selected" : ""}>${i + 1}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>فلتر المشروع</label>
          <select class="select" id="accounts-filter-project">
            <option value="all" ${ui.accountsFilterProjectId === "all" ? "selected" : ""}>كل المشاريع</option>
            ${activeProjects.map((p) => `<option value="${p.id}" ${p.id === ui.accountsFilterProjectId ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
          </select>
        </div>
      </div>
    </section>

    <section class="section-card">
      <div class="accounts-tabs-scroll">
        <div class="tabs" id="accounts-tabs">
          ${tabButton("overview", "ملخص الحسابات العامة", ui.accountsTab)}
          ${tabButton("projectsReport", "تقرير المشاريع", ui.accountsTab)}
          ${tabButton("salaryReport", "تقرير المرتبات", ui.accountsTab)}
          ${tabButton("subcontractReport", "تقرير مقاولو الباطن", ui.accountsTab)}
          ${tabButton("equipmentReport", "تقرير المعدات", ui.accountsTab)}
          ${tabButton("executionReport", "تقرير التنفيذ", ui.accountsTab)}
          ${tabButton("expensesReport", "تقرير المصروفات التفصيلي", ui.accountsTab)}
        </div>
      </div>
    </section>

    ${ui.accountsTab === "overview" ? `
      <section class="section-card">
        <h3 class="card-title">ملخص الحسابات العامة والتقارير</h3>
        <div class="kpi-grid">
          <article class="kpi"><h4>إجمالي إيرادات الشركة</h4><p>${showMoney(reports.general.totalRevenue)}</p></article>
          <article class="kpi"><h4>إجمالي المصروفات</h4><p>${showMoney(reports.general.totalExpenses)}</p></article>
          <article class="kpi"><h4>صافي الربح</h4><p>${showMoney(reports.general.netProfit)}</p></article>
        </div>
      </section>
    ` : ""}

    ${ui.accountsTab === "projectsReport" ? `
      <section class="section-card">
        <h3 class="card-title">تقرير المشاريع</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>المشروع</th><th>إجمالي التكاليف</th><th>الربح</th><th>نسبة الإكمال</th></tr></thead>
          <tbody>
            ${reports.projects.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${showMoney(r.cost)}</td><td>${showMoney(r.profit)}</td><td>${progressBar(r.completion)}</td></tr>`).join("") || "<tr><td colspan='4'>لا توجد بيانات</td></tr>"}
          </tbody>
        </table></div>
      </section>
    ` : ""}

    ${ui.accountsTab === "salaryReport" ? `
      <section class="section-card">
        <h3 class="card-title">تقرير المرتبات</h3>
        <div class="summary-cards">
          <article class="summary-card"><h4>إجمالي المرتبات</h4><p>${showMoney(reports.salary.total)}</p></article>
          <article class="summary-card"><h4>الخصومات</h4><p>${showMoney(reports.salary.deductions)}</p></article>
          <article class="summary-card"><h4>المدفوع الفعلي</h4><p>${showMoney(reports.salary.net)}</p></article>
        </div>
      </section>
    ` : ""}

    ${ui.accountsTab === "subcontractReport" ? `
      <section class="section-card">
        <h3 class="card-title">تقرير مقاولو الباطن</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>المشروع</th><th>الإجمالي</th></tr></thead>
          <tbody>
            ${reports.subcontractors.map((r) => `<tr><td>${escapeHtml(r.projectName)}</td><td>${showMoney(r.total)}</td></tr>`).join("") || "<tr><td colspan='2'>لا توجد بيانات</td></tr>"}
          </tbody>
        </table></div>
      </section>
    ` : ""}

    ${ui.accountsTab === "equipmentReport" ? `
      <section class="section-card">
        <h3 class="card-title">تقرير المعدات</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>المشروع</th><th>تكاليف الإيجار</th><th>الأعطال</th><th>الإضافي</th></tr></thead>
          <tbody>
            ${reports.equipment.map((r) => `<tr><td>${escapeHtml(r.projectName)}</td><td>${showMoney(r.rental)}</td><td>${showMoney(r.faults)}</td><td>${showMoney(r.extras)}</td></tr>`).join("") || "<tr><td colspan='4'>لا توجد بيانات</td></tr>"}
          </tbody>
        </table></div>
      </section>
    ` : ""}

    ${ui.accountsTab === "executionReport" ? `
      <section class="section-card">
        <h3 class="card-title">تقرير التنفيذ</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>المشروع</th><th>نسبة الإكمال</th></tr></thead>
          <tbody>
            ${reports.execution.map((r) => `<tr><td>${escapeHtml(r.projectName)}</td><td>${progressBar(r.completion)}</td></tr>`).join("") || "<tr><td colspan='2'>لا توجد بيانات</td></tr>"}
          </tbody>
        </table></div>
      </section>
    ` : ""}

    ${ui.accountsTab === "expensesReport" ? `
      <section class="section-card">
        <h3 class="card-title">تقرير المصروفات التفصيلي</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>المشروع</th><th>نثرية</th><th>تشغيل</th><th>إيجار</th><th>مرتبات</th></tr></thead>
          <tbody>
            ${reports.expensesDetail.map((r) => `<tr><td>${escapeHtml(r.projectName)}</td><td>${showMoney(r.petty)}</td><td>${showMoney(r.operation)}</td><td>${showMoney(r.rental)}</td><td>${showMoney(r.salary)}</td></tr>`).join("") || "<tr><td colspan='5'>لا توجد بيانات</td></tr>"}
          </tbody>
        </table></div>
      </section>
    ` : ""}
  `;

  document.querySelectorAll("#accounts-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.accountsTab = btn.dataset.tab;
      render();
    });
  });

  document.getElementById("accounts-filter-month")?.addEventListener("change", (e) => {
    ui.accountsFilterMonth = e.target.value;
    render();
  });
  document.getElementById("accounts-filter-year")?.addEventListener("change", (e) => {
    ui.accountsFilterYear = e.target.value;
    render();
  });
  document.getElementById("accounts-filter-project")?.addEventListener("change", (e) => {
    ui.accountsFilterProjectId = e.target.value;
    render();
  });
}

function bindProjectCreateForm() {
  const form = document.getElementById("create-project-form");
  if (!form) return;
  applyMoneyFormattingTo(form);

  const boqQty = form.querySelector("[name='boqQty']");
  const boqUnitPrice = form.querySelector("[name='boqUnitPrice']");
  const boqTotal = document.getElementById("boq-total-preview");

  const updateBoqTotalPreview = () => {
    boqTotal.value = String(Number(boqQty.value || 0) * parseMoneyValue(boqUnitPrice.value));
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
    const unitPrice = parseMoneyValue(form.querySelector("[name='boqUnitPrice']").value);

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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const name = String(fd.get("name") || "").trim();
    const startDate = String(fd.get("startDate") || "").trim();
    const type = String(fd.get("type") || "طرق").trim() || "طرق";
    const documentFiles = fd
      .getAll("documents")
      .filter((f) => f && typeof f === "object" && typeof f.name === "string" && f.name)
      ;

    if (!name || !startDate) {
      showAppPopup("اسم المشروع وتاريخ البداية مطلوبان");
      return;
    }

    const customFields = projectDraft.customFields.filter((f) => String(f.key || "").trim());

    const mappedDocuments = await Promise.all(documentFiles.map((f) => mapFileToProjectDocument(f)));

    state.projects.push({
      id: crypto.randomUUID(),
      name,
      startDate,
      createdAt: new Date().toISOString(),
      isDeleted: false,
      deletedById: null,
      deletedByName: "",
      deletedAt: null,
      type,
      documents: mappedDocuments,
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
      assignedWorkerIds: [],
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
  bindProjectBoqForm(project);
  bindPettyForm(project);
  bindOperationForm(project);
  bindRentalForms(project);
  bindSalaryForm(project);
  bindProjectEquipmentsForm(project);
  bindProjectWorkersForm(project);
  bindProjectDocumentsForm(project);
  bindEditSubcontractForm(project);

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

  document.querySelectorAll("[data-delete-project-doc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("حذف هذا المستند؟")) return;
      const id = btn.dataset.deleteProjectDoc;
      project.documents = (project.documents || []).filter((d) => d.id !== id);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-view-project-doc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const doc = (project.documents || []).find((d) => d.id === btn.dataset.viewProjectDoc);
      if (!doc) return;
      openProjectDocumentPreview(doc);
    });
  });

  document.querySelectorAll("[data-edit-subcontract]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const subcontract = project.subcontractors.find((x) => x.id === btn.dataset.editSubcontract);
      if (!subcontract) return;
      const boq = getBoqItem(project, subcontract.boqId);
      const modal = document.getElementById("edit-subcontract-modal");
      const form = document.getElementById("edit-subcontract-form");
      if (!modal || !form || !boq) return;

      const assignedExcludingCurrent = getSubcontractAssignedQtyForBoq(project, subcontract.boqId, subcontract.id);
      const selfExecuted = getSelfExecutedQtyForBoq(project, subcontract.boqId);
      const maxAllowed = Math.max(Number(boq.qty || 0) - assignedExcludingCurrent - selfExecuted, 0);
      const minAllowed = Number(subcontract.executedQty || 0);
      const safeMax = Math.max(maxAllowed, minAllowed);
      const qtyInput = form.querySelector("[name='qty']");
      qtyInput.max = String(safeMax);
      qtyInput.min = String(minAllowed);

      form.querySelector("[name='subcontractId']").value = subcontract.id;
      form.querySelector("[name='contractorName']").value = subcontract.contractorName || "-";
      form.querySelector("[name='boqName']").value = boq.itemName || "-";
      form.querySelector("[name='qty']").value = String(Number(subcontract.qty || 0));
      document.getElementById("edit-subcontract-hint").textContent =
        `أقصى كمية متاحة: ${num(safeMax)} | منفذ فعلياً لهذا المقاول: ${num(subcontract.executedQty || 0)}`;

      modal.classList.remove("hidden");
    });
  });
}

function bindProjectDocumentsForm(project) {
  const form = document.getElementById("add-project-documents-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const files = fd
      .getAll("documents")
      .filter((f) => f && typeof f === "object" && typeof f.name === "string" && f.name);
    if (!files.length) {
      showAppPopup("اختر مستنداً واحداً على الأقل");
      return;
    }
    project.documents = project.documents || [];
    const mappedFiles = await Promise.all(files.map((file) => mapFileToProjectDocument(file)));
    mappedFiles.forEach((doc) => project.documents.push(doc));
    addAdminNotification("رفع مستندات مشروع", `تم رفع ${files.length} مستند/مستندات على مشروع: ${project.name}`);
    saveState();
    render();
  });
}

function bindEditSubcontractForm(project) {
  const form = document.getElementById("edit-subcontract-form");
  const modal = document.getElementById("edit-subcontract-modal");
  if (!form || !modal) return;
  const qtyInput = form.querySelector("[name='qty']");

  qtyInput.addEventListener("input", () => {
    const max = Number(qtyInput.max || 0);
    const min = Number(qtyInput.min || 0);
    const current = Number(qtyInput.value || 0);
    if (!Number.isFinite(current)) return;
    if (current > max) qtyInput.value = String(max);
    if (current < min) qtyInput.value = String(min);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const subcontractId = String(fd.get("subcontractId") || "");
    const qty = Number(fd.get("qty") || 0);
    const subcontract = project.subcontractors.find((x) => x.id === subcontractId);
    if (!subcontract) return;
    const boq = getBoqItem(project, subcontract.boqId);
    if (!boq) return;

    const assignedExcludingCurrent = getSubcontractAssignedQtyForBoq(project, subcontract.boqId, subcontract.id);
    const selfExecuted = getSelfExecutedQtyForBoq(project, subcontract.boqId);
    const maxAllowed = Math.max(Number(boq.qty || 0) - assignedExcludingCurrent - selfExecuted, 0);
    const minAllowed = Number(subcontract.executedQty || 0);
    const safeMax = Math.max(maxAllowed, minAllowed);

    if (qty < minAllowed) {
      showAppPopup(`لا يمكن جعل الكمية أقل من المنفذ الفعلي (${minAllowed.toFixed(2)})`);
      return;
    }
    if (qty > safeMax) {
      showAppPopup(`الكمية المعدلة تتجاوز المتاح للبند (${safeMax.toFixed(2)})`);
      return;
    }

    subcontract.qty = qty;
    subcontract.total = Number(subcontract.unitPrice || 0) * qty;
    addAdminNotification("تعديل كمية مقاول باطن", `تم تعديل كمية مقاول (${subcontract.contractorName}) في مشروع ${project.name}`);
    modal.classList.add("hidden");
    saveState();
    render();
  });
}

function bindProjectBoqForm(project) {
  const form = document.getElementById("add-project-boq-form");
  if (!form) return;
  applyMoneyFormattingTo(form);

  const qtyInput = form.querySelector("[name='qty']");
  const unitPriceInput = form.querySelector("[name='unitPrice']");
  const totalInput = document.getElementById("project-boq-total-preview");

  const refresh = () => {
    totalInput.value = String(Number(qtyInput.value || 0) * parseMoneyValue(unitPriceInput.value));
  };

  qtyInput.addEventListener("input", refresh);
  unitPriceInput.addEventListener("input", refresh);
  refresh();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const itemName = String(fd.get("itemName") || "").trim();
    const qty = Number(fd.get("qty") || 0);
    const unit = String(fd.get("unit") || "").trim();
    const unitPrice = parseMoneyValue(fd.get("unitPrice"));

    if (!itemName || qty <= 0 || !unit || unitPrice < 0) {
      showAppPopup("الرجاء إدخال بيانات مقايسة صحيحة");
      return;
    }

    project.boq.push({
      id: crypto.randomUUID(),
      itemName,
      qty,
      unit,
      unitPrice,
      total: qty * unitPrice,
      executedQty: 0,
    });
    addAdminNotification("إضافة مقايسة", `تمت إضافة مقايسة جديدة في مشروع ${project.name}: ${itemName}`);

    saveState();
    render();
  });
}

function bindSubcontractForm(project) {
  const form = document.getElementById("add-subcontract-form");
  if (!form) return;
  applyMoneyFormattingTo(form);

  const boqSelect = form.querySelector("[name='boqId']");
  const qtyInput = form.querySelector("[name='qty']");
  const unitPriceInput = form.querySelector("[name='unitPrice']");
  const unitSelect = form.querySelector("[name='unit']");
  const totalInput = document.getElementById("subcontract-total");
  const hint = document.getElementById("subcontract-remaining-hint");

  const refresh = () => {
    totalInput.value = String(Number(qtyInput.value || 0) * parseMoneyValue(unitPriceInput.value));
    const boq = getBoqItem(project, boqSelect.value);
    if (!boq) {
      hint.textContent = "";
      unitSelect.innerHTML = `<option value="">اختر المقايسة أولاً</option>`;
      return;
    }
    unitSelect.innerHTML = `<option value="${escapeHtml(boq.unit || "")}">${escapeHtml(boq.unit || "-")}</option>`;
    unitSelect.value = String(boq.unit || "");
    const assigned = getSubcontractAssignedQtyForBoq(project, boq.id);
    const selfExecuted = getSelfExecutedQtyForBoq(project, boq.id);
    const availableForSubcontract = Math.max(Number(boq.qty || 0) - assigned - selfExecuted, 0);
    qtyInput.max = String(availableForSubcontract);
    if (Number(qtyInput.value || 0) > availableForSubcontract) {
      qtyInput.value = String(availableForSubcontract);
      totalInput.value = String(Number(qtyInput.value || 0) * parseMoneyValue(unitPriceInput.value));
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
    const unitPrice = parseMoneyValue(fd.get("unitPrice"));

    if (!boqId || !contractorName || qty <= 0 || unitPrice < 0) {
      return;
    }
    const boq = getBoqItem(project, boqId);
    if (!boq) return;
    const unit = String(boq.unit || "").trim();
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
  applyMoneyFormattingTo(form);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const reason = String(fd.get("reason") || "").trim();
    const amount = parseMoneyValue(fd.get("amount"));
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
  applyMoneyFormattingTo(form);

  const refresh = () => {
    totalInput.value = String(
      Number(qtyInput.value || 0) * parseMoneyValue(unitPriceInput.value) + parseMoneyValue(otherInput.value),
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
    const unitPrice = parseMoneyValue(fd.get("unitPrice"));
    const otherCosts = parseMoneyValue(fd.get("otherCosts"));
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
    const countInput = itemForm.querySelector("[name='count']");
    const priceInput = itemForm.querySelector("[name='price']");
    const referenceDate = itemForm.querySelector("[name='referenceDate']");
    const total = document.getElementById("rental-item-total");
    applyMoneyFormattingTo(itemForm);

    const refresh = () => {
      total.value = String(
        calcDurationCost(
          String(durationType.value || "ساعة"),
          1,
          Number(countInput.value || 0),
          parseMoneyValue(priceInput.value),
          String(referenceDate.value || ""),
        ),
      );
    };

    [durationType, countInput, priceInput, referenceDate].forEach((x) => x.addEventListener("input", refresh));

    itemForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(itemForm);
      const equipmentName = String(fd.get("equipmentName") || "").trim();
      const durationTypeValue = String(fd.get("durationType") || "ساعة");
      const count = Number(fd.get("count") || 0);
      const price = parseMoneyValue(fd.get("price"));
      const referenceDateValue = String(fd.get("referenceDate") || "");

      if (!equipmentName || count <= 0 || price < 0 || !referenceDateValue) return;

      project.expenses.rental.items.push({
        id: crypto.randomUUID(),
        equipmentName,
        durationType: durationTypeValue,
        durationValue: 1,
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
      const details = String(fd.get("details") || "").trim();
      const item = project.expenses.rental.items.find((x) => x.id === itemId);
      if (!item) return;

      const amount = calcAdditionalRentalAmount(item, durationTypeValue, 1);

      project.expenses.rental.faults.push({
        id: crypto.randomUUID(),
        itemId,
        durationType: durationTypeValue,
        durationValue: 1,
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
      const item = project.expenses.rental.items.find((x) => x.id === itemId);
      if (!item) return;

      const amount = calcAdditionalRentalAmount(item, durationTypeValue, 1);

      project.expenses.rental.extras.push({
        id: crypto.randomUUID(),
        itemId,
        durationType: durationTypeValue,
        durationValue: 1,
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
  applyMoneyFormattingTo(form);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const workerId = String(fd.get("workerId") || "");
    const amount = parseMoneyValue(fd.get("amount"));
    const reason = String(fd.get("reason") || "").trim();
    const note = String(fd.get("note") || "").trim();
    if (!workerId || amount <= 0 || !reason) return;
    if (!project.assignedWorkerIds?.includes(workerId)) {
      showAppPopup("الموظف غير معين على هذا المشروع");
      return;
    }
    const worker = state.workers.find((w) => w.id === workerId);
    if (!worker) return;
    const currentWorkerDeductions = project.expenses.salary.deductions
      .filter((d) => d.workerId === workerId)
      .reduce((sum, d) => sum + Number(d.amount || 0), 0);
    const remaining = Math.max(Number(worker.salary || 0) - currentWorkerDeductions, 0);
    if (amount > remaining) {
      showAppPopup(`قيمة الخصم تتجاوز مرتب الموظف. المتاح للخصم: ${formatMoneyRaw(remaining)}`);
      return;
    }

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

function bindProjectWorkersForm(project) {
  const form = document.getElementById("project-workers-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const workerIds = fd.getAll("workerIds").map((id) => String(id));
    project.assignedWorkerIds = state.workers
      .map((w) => w.id)
      .filter((id) => workerIds.includes(id));
    project.expenses.salary.deductions = project.expenses.salary.deductions.filter((d) =>
      project.assignedWorkerIds.includes(d.workerId),
    );
    saveState();
    render();
  });
}

function bindProjectEquipmentsForm(project) {
  const form = document.getElementById("add-project-equipment-form");
  if (!form) return;
  applyMoneyFormattingTo(form);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const equipmentId = String(fd.get("equipmentId") || "");
    const amount = parseMoneyValue(fd.get("amount"));
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

function getGeneralReports(filters = {}) {
  const filteredProjects = getActiveProjects().filter((project) => {
    if (filters.projectId && filters.projectId !== "all" && project.id !== filters.projectId) return false;
    const dateValue = project.startDate || project.createdAt || "";
    if (!matchesMonthYear(dateValue, filters.month, filters.year)) return false;
    return true;
  });

  const projects = filteredProjects.map((project) => {
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

  const totalSalaries = filteredProjects.reduce(
    (s, p) => s + getProjectWorkers(p).reduce((sw, w) => sw + Number(w.salary || 0), 0),
    0,
  );
  const deductions = filteredProjects.reduce(
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
    subcontractors: filteredProjects.map((p) => ({
      projectName: p.name,
      total: p.subcontractors.reduce((s, c) => s + Number(c.total || 0), 0),
    })),
    equipment: filteredProjects.map((p) => {
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
    execution: filteredProjects.map((p) => ({
      projectName: p.name,
      completion: getProjectCompletion(p),
    })),
    expensesDetail: filteredProjects.map((p) => {
      const petty = p.expenses.petty.reduce((s, x) => s + Number(x.amount || 0), 0);
      const operation = p.expenses.operation.reduce((s, x) => s + Number(x.total || 0), 0);
      const rental = p.expenses.rental.items.reduce(
        (s, item) => s + getRentalNet(item, p.expenses.rental.faults, p.expenses.rental.extras).net,
        0,
      );
      const salary = Math.max(
        getProjectWorkers(p).reduce((sum, w) => sum + Number(w.salary || 0), 0) -
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

function matchesMonthYear(dateValue, month, year) {
  if ((!month || month === "all") && (!year || year === "all")) return true;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const monthMatch = !month || month === "all" ? true : date.getMonth() + 1 === Number(month);
  const yearMatch = !year || year === "all" ? true : date.getFullYear() === Number(year);
  return monthMatch && yearMatch;
}

function getAccountsFilterYears() {
  const yearsSet = new Set();
  getActiveProjects().forEach((p) => {
    const d = new Date(p.startDate || p.createdAt || "");
    if (!Number.isNaN(d.getTime())) yearsSet.add(d.getFullYear());
  });
  if (!yearsSet.size) yearsSet.add(new Date().getFullYear());
  return Array.from(yearsSet).sort((a, b) => b - a);
}

function getAccountsYearRange() {
  return Array.from({ length: 2090 - 2010 + 1 }, (_, i) => 2010 + i);
}

function getProjectFinancialSummary(project) {
  const totalSubcontractors = project.subcontractors.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const boqTotal = project.boq.reduce((sum, b) => sum + Number(b.total || 0), 0);
  const selfExecution = Math.max(boqTotal - totalSubcontractors, 0);
  const subcontractValuePercent = boqTotal > 0 ? Math.min((totalSubcontractors / boqTotal) * 100, 100) : 0;
  const selfExecutionValuePercent = boqTotal > 0 ? Math.min((selfExecution / boqTotal) * 100, 100) : 0;
  const qtyStats = getSubcontractQtyStats(project);

  const petty = project.expenses.petty.reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const operation = project.expenses.operation.reduce((sum, x) => sum + Number(x.total || 0), 0);
  const rentalNet = project.expenses.rental.items.reduce(
    (sum, item) => sum + getRentalNet(item, project.expenses.rental.faults, project.expenses.rental.extras).net,
    0,
  );
  const totalSalaries = getProjectWorkers(project).reduce((sum, w) => sum + Number(w.salary || 0), 0);
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
    subcontractValuePercent,
    selfExecutionValuePercent,
    totalExpenses,
    qtyStats,
  };
}

function getProjectWorkers(project) {
  const assigned = Array.isArray(project.assignedWorkerIds) ? project.assignedWorkerIds : [];
  return state.workers.filter((w) => assigned.includes(w.id));
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

function getDeductionsByWorker(project) {
  return project.expenses.salary.deductions.reduce((acc, d) => {
    const workerId = String(d.workerId || "");
    acc[workerId] = Number(acc[workerId] || 0) + Number(d.amount || 0);
    return acc;
  }, {});
}

function normalizeProjectData(project) {
  const normalized = { ...project };
  normalized.createdAt = normalized.createdAt || normalized.startDate || new Date().toISOString();
  normalized.isDeleted = Boolean(normalized.isDeleted);
  normalized.deletedById = normalized.deletedById || null;
  normalized.deletedByName = normalized.deletedByName || "";
  normalized.deletedAt = normalized.deletedAt || null;
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
  const legacyDocuments = normalized.documentName
    ? [
      {
        id: crypto.randomUUID(),
        name: normalized.documentName,
        type: detectFileTypeFromName(normalized.documentName),
        sizeLabel: "-",
        uploadedAt: normalized.createdAt || new Date().toISOString(),
      },
    ]
    : [];
  normalized.documents = (normalized.documents || legacyDocuments).map((doc) => ({
    id: doc.id || crypto.randomUUID(),
    name: String(doc.name || "").trim(),
    type: String(doc.type || detectFileTypeFromName(doc.name || "") || "-"),
    sizeLabel: String(doc.sizeLabel || "-"),
    mimeType: String(doc.mimeType || detectMimeTypeFromName(doc.name || "")),
    dataUrl: typeof doc.dataUrl === "string" ? doc.dataUrl : "",
    uploadedAt: doc.uploadedAt || normalized.createdAt || new Date().toISOString(),
  }));
  delete normalized.documentName;
  normalized.assignedWorkerIds = Array.isArray(normalized.assignedWorkerIds)
    ? normalized.assignedWorkerIds.filter((id) => state.workers.some((w) => w.id === id))
    : [];
  return normalized;
}

async function mapFileToProjectDocument(file) {
  const safeName = String(file?.name || "").trim();
  const mimeType = String(file?.type || detectMimeTypeFromName(safeName));
  let dataUrl = "";
  if (mimeType.startsWith("image/") || mimeType === "application/pdf") {
    try {
      dataUrl = await readFileAsDataURL(file);
    } catch {
      dataUrl = "";
    }
  }
  return {
    id: crypto.randomUUID(),
    name: safeName,
    type: detectFileTypeFromName(safeName),
    mimeType,
    dataUrl,
    sizeLabel: file?.size ? `${new Intl.NumberFormat("en-US").format(Number(file.size))} B` : "-",
    uploadedAt: new Date().toISOString(),
  };
}

function detectFileTypeFromName(name) {
  const ext = String(name || "").toLowerCase().split(".").pop() || "";
  if (ext === "pdf") return "PDF";
  if (ext === "doc" || ext === "docx") return "Word";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "Image";
  return ext ? ext.toUpperCase() : "-";
}

function detectMimeTypeFromName(name) {
  const ext = String(name || "").toLowerCase().split(".").pop() || "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "doc") return "application/msword";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  return "";
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("file-read-error"));
    reader.readAsDataURL(file);
  });
}

function openProjectDocumentPreview(doc) {
  const id = "project-document-preview-modal";
  document.getElementById(id)?.remove();

  const mimeType = String(doc.mimeType || "");
  const dataUrl = String(doc.dataUrl || "");
  let bodyHtml = "";

  if (mimeType.startsWith("image/") && dataUrl) {
    bodyHtml = `<img src="${dataUrl}" alt="${escapeHtml(doc.name || "doc")}" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:10px;border:1px solid var(--border)" />`;
  } else if (mimeType === "application/pdf" && dataUrl) {
    bodyHtml = `<iframe src="${dataUrl}" title="${escapeHtml(doc.name || "pdf")}" style="width:100%;height:70vh;border:1px solid var(--border);border-radius:10px"></iframe>`;
  } else {
    bodyHtml = `<div class="empty">لا تتوفر معاينة مباشرة لهذا النوع من الملفات حالياً</div>`;
  }

  const modal = document.createElement("div");
  modal.id = id;
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal" style="max-width:980px">
      <div class="row">
        <h3 class="card-title">${escapeHtml(doc.name || "معاينة مستند")}</h3>
        <button class="btn btn-secondary" type="button" id="close-project-document-preview">إغلاق</button>
      </div>
      ${bodyHtml}
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector("#close-project-document-preview")?.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)} ج.م`;
}

function parseMoneyValue(value) {
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function formatMoneyTyping(value) {
  const raw = String(value ?? "").replace(/,/g, "").replace(/[^\d.]/g, "");
  const [intPartRaw = "0", decPartRaw = ""] = raw.split(".");
  const intPart = intPartRaw.replace(/^0+(?=\d)/, "") || "0";
  const decPart = decPartRaw.slice(0, 2);
  const formattedInt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(intPart || 0));
  return decPart.length ? `${formattedInt}.${decPart}` : formattedInt;
}

function applyMoneyFormattingTo(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll("input.money-input").forEach((input) => {
    if (input.dataset.moneyBound === "1") return;
    input.dataset.moneyBound = "1";
    input.addEventListener("input", () => {
      input.value = formatMoneyTyping(input.value);
    });
    input.addEventListener("blur", () => {
      input.value = formatMoneyTyping(input.value);
    });
    if (input.value) input.value = formatMoneyTyping(input.value);
  });
}

function num(value) {
  return Number(value || 0).toFixed(2);
}

function isKuwaitiPhone(phone) {
  const normalized = normalizePhone(phone);
  return /^01[0125]\d{8}$/.test(normalized);
}

function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("0020")) digits = digits.slice(2);
  if (digits.startsWith("20") && digits.length === 12) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits.startsWith("1") && digits.length === 10) {
    digits = `0${digits}`;
  }
  return digits;
}

function titleBySection(section) {
  if (section === "projects") return "إدارة المشاريع";
  if (section === "execution") return "قسم التنفيذ";
  if (section === "equipments") return "معدات الشركة";
  if (section === "settings") return "الإعدادات";
  if (section === "accounts") return "الحسابات العامة";
  return "لوحة التحكم";
}

function getActiveProjects() {
  return state.projects.filter((project) => !project.isDeleted);
}

function getDeletedProjects() {
  return state.projects.filter((project) => project.isDeleted);
}

function getCurrentUserActor() {
  const user = state.systemUsers.find((u) => u.id === state.session.userId);
  return {
    id: user?.id || null,
    name: user?.name || "مستخدم غير معروف",
  };
}

function softDeleteProjectById(projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return false;
  const actor = getCurrentUserActor();
  project.isDeleted = true;
  project.deletedById = actor.id;
  project.deletedByName = actor.name;
  project.deletedAt = new Date().toISOString();
  addAdminNotification("حذف مشروع", `تم حذف مشروع (Soft Delete): ${project.name}`);
  return true;
}

function restoreProjectById(projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return false;
  project.isDeleted = false;
  project.deletedById = null;
  project.deletedByName = "";
  project.deletedAt = null;
  addAdminNotification("استعادة مشروع", `تمت استعادة مشروع: ${project.name}`);
  return true;
}

function permanentlyDeleteProjectById(projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return false;
  state.projects = state.projects.filter((p) => p.id !== projectId);
  state.executionLogs = state.executionLogs.filter((log) => log.projectId !== projectId);
  addAdminNotification("حذف نهائي لمشروع", `تم حذف مشروع نهائياً: ${project.name}`);
  return true;
}

function outlineEyeIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

function outlineEyeOffIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6c2.3 0 4.2.7 5.8 1.7"/><path d="M22 12s-3.5 6-10 6c-2.3 0-4.2-.7-5.8-1.7"/><path d="M3 3l18 18"/></svg>`;
}

function outlineBellIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>`;
}

function outlineBackArrowIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6L4 12l6 6"/><path d="M5 12h15"/></svg>`;
}

function outlineMoreIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>`;
}

function infoIcon(type) {
  if (type === "calendar") {
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`;
  }
  if (type === "items") {
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18"/></svg>`;
}

function projectBuildingIcon() {
  return `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l7-3v17"/><path d="M19 21V11h-7"/><path d="M8 10h1M8 13h1M8 16h1M11 10h1M11 13h1M11 16h1M15 14h1M15 17h1"/></svg>`;
}

function trendIcon() {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l7-7 4 4 7-7"/><path d="M14 7h7v7"/></svg>`;
}

function getProjectTotalQtyWithUnit(project) {
  const totalQty = project.boq.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const units = [...new Set(project.boq.map((item) => String(item.unit || "").trim()).filter(Boolean))];
  const unitLabel = units.length === 1 ? units[0] : units.length > 1 ? "وحدات متنوعة" : "وحدة";
  return `${num(totalQty)} ${unitLabel}`;
}

function getProjectPrimaryQtyUnit(project) {
  const units = [...new Set(project.boq.map((item) => String(item.unit || "").trim()).filter(Boolean))];
  if (!units.length) return "وحدة";
  if (units.length === 1) return units[0];
  return "وحدات";
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
          <div class="field" style="grid-column:1/-1"><label>مستندات المشروع (PDF / Word / صورة)</label><input class="input" type="file" name="documents" accept=".pdf,.doc,.docx,image/*" multiple /></div>
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
            <div class="field"><label>سعر الوحدة</label><input class="input money-input" type="text" inputmode="decimal" name="boqUnitPrice" /></div>
            <div class="field"><label>الإجمالي</label><input id="boq-total-preview" class="input" readonly value="0" /></div>
          </div>
          <div class="row" style="margin-top:10px">
            <button type="button" class="btn btn-secondary" id="add-boq-row">إضافة مقايسة</button>
          </div>
          ${projectDraft.boq.length ? `
            <div class="project-measurements-table-scroll" style="margin-top:10px">
              <table class="project-draft-table">
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
  return `<div class="modal-backdrop" id="project-modal-backdrop"><div class="modal project-create-modal">${content}</div></div>`;
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
