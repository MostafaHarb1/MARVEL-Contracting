
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
            <span class="muted">المستخدم: ${escapeHtml(user?.name || "-")}</span>
          </div>
        </div>
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
