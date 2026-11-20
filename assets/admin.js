/*! © 2026 Wahidul Alam Riyad. All rights reserved. Proprietary — unauthorized copying, use or redistribution is prohibited. See LICENSE. */
// Faculty admin: intakes, courses, sections, terms, classes, student lists, attendance, reports, Excel export
(function () {
  const { esc, sb, cfg, $, $$, icon } = App;
  const root = document.getElementById("app");
  let user = null, recovering = false;

  if (!App.configured) { document.body.innerHTML = App.notConfiguredHtml(); return; }

  // ------------------------------------------------------------------ helpers
  const fail = (e) => { console.error(e); App.toast(friendly(e), true); };
  function friendly(e) {
    const m = e?.message || String(e);
    if (/duplicate key|unique/i.test(m)) return "That already exists — use a different name or number.";
    if (/permission denied|row-level security/i.test(m)) return "Permission denied. Did you run the latest supabase/schema.sql?";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Network problem — check your connection.";
    return m;
  }
  async function q(promise) { const { data, error } = await promise; if (error) throw error; return data; }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
  function go(h) { if (location.hash !== h) location.hash = h; else route(); }
  const loading = () => `<div class="loading"><span class="spinner"></span> Loading…</div>`;
  const STATUS = {
    present: { k: "P", label: "Present", cls: "green" },
    late: { k: "L", label: "Late", cls: "amber" },
    excused: { k: "E", label: "Excused", cls: "violet" },
  };

  function topbar() {
    const name = user?.email || "";
    return `<header class="topbar">
      <a class="brand" href="#/"><div class="logo">${icon("logo")}</div><div><div class="t1">Attendance Manager</div><div class="t2">${esc(cfg.INSTITUTION || "")}</div></div></a>
      <div class="spacer"></div>
      <a class="btn ghost sm" href="#/setup" title="Intakes & courses">${icon("layers")}<span class="hide-sm">Intakes & courses</span></a>
      ${App.theme.button()}
      <div class="menu-wrap"><button class="avatar" id="me" title="${esc(name)}" aria-haspopup="menu">${esc(App.initials(name.split("@")[0]))}</button></div>
    </header>`;
  }
  function bindTop() {
    const me = $("#me"); if (!me) return;
    me.onclick = (e) => {
      e.stopPropagation(); const w = me.parentElement, open = w.querySelector(".menu"); if (open) return open.remove();
      w.insertAdjacentHTML("beforeend", `<div class="menu" role="menu"><div class="who"><span class="muted xs">Signed in as</span><b>${esc(user.email)}</b></div>
        <a href="#/">${icon("grid")} All sections</a><a href="#/setup">${icon("layers")} Intakes & courses</a>
        <button data-m="pw">${icon("key")} Change password</button><div class="sep"></div><button data-m="out" class="danger">${icon("logout")} Sign out</button></div>`);
      const m = w.querySelector(".menu");
      m.onclick = async (ev) => { const b = ev.target.closest("[data-m]"); m.remove(); if (!b) return; if (b.dataset.m === "out") { await sb.auth.signOut(); location.hash = ""; } else changePassword(); };
      setTimeout(() => document.addEventListener("click", function h() { m.remove(); document.removeEventListener("click", h); }), 0);
    };
  }
  const page = (inner) => { root.innerHTML = topbar() + `<main class="container">${inner}</main>`; bindTop(); };

  async function changePassword(title = "Change password") {
    const dlg = await App.dialog({ title, ic: "key", okText: "Save password", html: true,
      body: `<label>New password</label><input id="np1" type="password" autocomplete="new-password" minlength="8" />
        <div class="field-gap"></div><label>Repeat new password</label><input id="np2" type="password" autocomplete="new-password" />
        <p class="hint">At least 8 characters.</p>`,
      validate: (m) => { const a = m.querySelector("#np1").value, b = m.querySelector("#np2").value; if (a.length < 8) return "Use at least 8 characters."; if (a !== b) return "The two passwords do not match."; } });
    if (!dlg) return;
    const { error } = await sb.auth.updateUser({ password: dlg.querySelector("#np1").value });
    error ? fail(error) : App.toast("Password updated");
  }

  // popover menu anchored to an element
  let popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
  function popover(anchor, html, onPick) {
    closePop();
    const p = document.createElement("div"); p.className = "pop"; p.innerHTML = html; document.body.appendChild(p); popEl = p;
    const r = anchor.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
    p.style.left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12)) + "px";
    p.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
    p.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { closePop(); onPick(b.dataset.v); } });
    setTimeout(() => document.addEventListener("mousedown", function h(e) { if (!p.contains(e.target)) { closePop(); document.removeEventListener("mousedown", h); } }), 0);
  }
  addEventListener("scroll", closePop, true); addEventListener("resize", closePop);

  // ------------------------------------------------------------------ login
  function renderLogin(msg = "", email = "") {
    root.innerHTML = `<div class="corner">${App.theme.button()}</div><div class="center-wrap" style="min-height:100vh"><div class="login">
      <div class="card"><div class="logo-lg">${icon("logo")}</div>
      <h1>Welcome back</h1><p class="muted" style="margin:6px 0 26px">Sign in to manage attendance${cfg.INSTITUTION ? ` · ${esc(cfg.INSTITUTION)}` : ""}</p>
      <form id="lf"><label for="em">Email</label><input id="em" type="email" autocomplete="username" value="${esc(email)}" required />
      <div class="field-gap"></div><label for="pw">Password</label>
      <div class="search"><input id="pw" type="password" autocomplete="current-password" required style="padding-left:13px;padding-right:44px" />
        <button type="button" class="icon-btn" id="peek" style="position:absolute;right:4px;top:4px" aria-label="Show password">${icon("eye")}</button></div>
      <div style="height:22px"></div><button class="btn lg block" id="lb">Sign in</button>
      ${msg ? `<div class="msg err">${icon("alert")}<div>${esc(msg)}</div></div>` : ""}
      <div class="center" style="margin-top:18px"><a href="#" id="forgot" class="small">Forgot password?</a></div></form></div>
      <p class="muted small center" style="margin-top:18px">Faculty accounts are created in Supabase ▸ Authentication ▸ Users.</p></div></div>`;
    $("#peek").onclick = () => { const p = $("#pw"); p.type = p.type === "password" ? "text" : "password"; $("#peek").innerHTML = icon(p.type === "password" ? "eye" : "eyeoff"); };
    $("#lf").onsubmit = async (e) => {
      e.preventDefault(); const b = $("#lb"); b.disabled = true; b.innerHTML = `<span class="spinner" style="width:18px;height:18px"></span> Signing in…`;
      const { error } = await sb.auth.signInWithPassword({ email: $("#em").value.trim(), password: $("#pw").value });
      if (error) { renderLogin(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message, $("#em").value.trim()); $("#pw").focus(); }
    };
    $("#forgot").onclick = async (e) => {
      e.preventDefault(); const em = $("#em").value.trim(); if (!em) { App.toast("Type your email first", true); return $("#em").focus(); }
      const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.href.split("#")[0] });
      error ? fail(error) : App.toast("Password reset email sent — check your inbox");
    };
    (email ? $("#pw") : $("#em")).focus();
  }

  // ------------------------------------------------------------------ data for the dashboard
  async function loadAll() {
    const [intakes, courses, sections, terms, classes, students, att] = await Promise.all([
      q(sb.from("intakes").select("*").order("created_at", { ascending: false })),
      q(sb.from("courses").select("*").order("code")),
      q(sb.from("sections").select("id, name, class_code, created_at, min_attendance_pct, intake:intakes(id, name), course:courses(id, code, title)").order("created_at", { ascending: false })),
      App.fetchAll(() => sb.from("terms").select("id, section_id")),
      App.fetchAll(() => sb.from("classes").select("id, term_id, number, opened_at, is_open, expires_at")),
      App.fetchAll(() => sb.from("students").select("section_id")),
      App.fetchAll(() => sb.from("attendance").select("class_id")),
    ]);
    const termSec = {}; terms.forEach((t) => (termSec[t.id] = t.section_id));
    const attBy = {}; att.forEach((a) => (attBy[a.class_id] = (attBy[a.class_id] || 0) + 1));
    const st = {}; sections.forEach((s) => (st[s.id] = { students: 0, classes: 0, held: 0, marks: 0, open: null }));
    students.forEach((s) => st[s.section_id] && st[s.section_id].students++);
    const now = new Date();
    classes.forEach((c) => {
      const x = st[termSec[c.term_id]]; if (!x) return;
      x.classes++; const held = !!c.opened_at || !!attBy[c.id]; if (held) { x.held++; x.marks += attBy[c.id] || 0; }
      if (c.is_open && new Date(c.expires_at) > now) x.open = c;
    });
    sections.forEach((s) => { const x = st[s.id]; x.avg = x.held && x.students ? Math.round((x.marks / (x.held * x.students)) * 100) : null; });
    return { intakes, courses, sections, st, totals: { students: students.length, held: Object.values(st).reduce((n, x) => n + x.held, 0) } };
  }

  // ------------------------------------------------------------------ dashboard
  async function renderDashboard() {
    page(loading());
    const D = await loadAll();
    const { intakes, courses, sections, st } = D;
    const filter = sessionStorage.getItem("att_f_intake") || "", qy = sessionStorage.getItem("att_q") || "";
    const live = sections.filter((s) => st[s.id].open);
    const allAvg = (() => { const xs = sections.map((s) => st[s.id]).filter((x) => x.avg != null); return xs.length ? Math.round(xs.reduce((n, x) => n + x.avg, 0) / xs.length) : null; })();
    const hour = +new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: cfg.TIME_ZONE || undefined });
    const hello = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    page(`
      <div class="page-head"><div><div class="eyebrow">${icon("calendar")} ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: cfg.TIME_ZONE || undefined })}</div>
        <h1>${hello} 👋</h1></div>
        <div class="actions"><a class="btn secondary" href="#/setup">${icon("layers")} Intakes & courses</a><button class="btn" id="newsec">${icon("plus")} New section</button></div></div>
      ${live.map((s) => `<div class="live" style="margin-bottom:16px"><span class="live-dot"></span><div class="grow"><b>Attendance is open</b> · ${esc(s.course.code)} Section ${esc(s.name)} — ${App.classLabel(st[s.id].open.number)}</div>
        <a class="btn green sm" href="pin.html?class=${st[s.id].open.id}" target="_blank" rel="noopener">${icon("external")} PIN screen</a></div>`).join("")}
      <div class="stats">
        <div class="stat"><div class="ic">${icon("grid")}</div><div><div class="k">Sections</div><div class="v">${sections.length}</div></div></div>
        <div class="stat"><div class="ic violet">${icon("users")}</div><div><div class="k">Students</div><div class="v">${D.totals.students}</div></div></div>
        <div class="stat"><div class="ic amber">${icon("calendar")}</div><div><div class="k">Classes held</div><div class="v">${D.totals.held}</div></div></div>
        <div class="stat"><div class="ic green">${icon("chart")}</div><div><div class="k">Average attendance</div><div class="v">${allAvg == null ? "—" : allAvg + "%"}</div></div></div>
      </div>
      <div style="height:32px"></div>
      ${sections.length ? `
      <div class="card-head"><div><h2>Your sections</h2><div class="sub">Open a section to take attendance, manage students and export to Excel.</div></div>
        <div class="row center-y"><div class="search" style="width:240px">${icon("search")}<input id="dq" placeholder="Search course or section" value="${esc(qy)}" /></div>
        <select id="flt" style="width:auto;min-width:170px"><option value="">All intakes</option>${intakes.map((i) => `<option value="${i.id}" ${i.id === filter ? "selected" : ""}>${esc(i.name)}</option>`).join("")}</select></div></div>
      <div class="sec-grid" id="secs">${sections.map((s) => { const x = st[s.id]; return `
        <a class="sec-card" href="#/section/${s.id}" data-intake="${s.intake.id}" data-q="${esc((s.course.code + " " + s.course.title + " " + s.name + " " + s.intake.name).toLowerCase())}">
          <div class="top"><div class="grow"><div class="code">${esc(s.course.code)}${s.class_code ? ` · ${esc(s.class_code)}` : ""}</div><div class="title">${esc(s.course.title)}</div></div>
            <div class="sec-letter" title="Section">${esc(s.name)}</div></div>
          <div class="meta"><span>${icon("calendar")} ${esc(s.intake.name)}</span><span>${icon("users")} ${x.students} students</span><span>${icon("check")} ${x.held}/${x.classes} held</span></div>
          <div class="foot">${x.open ? `<span class="badge green"><span class="dot"></span> Open now</span>` : ""}
            ${App.progress(x.avg, s.min_attendance_pct)}<b class="${App.pctClass(x.avg, s.min_attendance_pct)}">${x.avg == null ? "—" : x.avg + "%"}</b></div></a>`; }).join("")}</div>
      <div class="empty hidden" id="noresult"><h3>No matching sections</h3><p>Try a different search or intake.</p></div>`
      : `<div class="card"><div class="empty"><div class="ic">${icon("zap")}</div><h3>Let's set up your first section</h3>
          <p>Create a section for a course you teach. You can add the intake and course right in the same form, then upload the student list.</p>
          <button class="btn" id="newsec2">${icon("plus")} New section</button></div>
          <div class="grid cols-3" style="margin-top:8px">${[["1", "Create a section", "Intake, course, section letter and number of classes."], ["2", "Upload students", "Drop in the university's Valid Student List (.xlsx)."], ["3", "Start a PIN", "Open the PIN screen in class and share the section link."]]
            .map(([n, t, d]) => `<div class="stat" style="align-items:flex-start"><div class="ic">${n}</div><div><b>${t}</b><div class="small muted">${d}</div></div></div>`).join("")}</div></div>`}`);
    const nb = $("#newsec") , nb2 = $("#newsec2");
    [nb, nb2].forEach((b) => b && (b.onclick = () => newSection(D)));
    const apply = () => {
      const v = ($("#dq")?.value || "").toLowerCase(), f = $("#flt")?.value || ""; let n = 0;
      $$("#secs .sec-card").forEach((c) => { const show = (!f || c.dataset.intake === f) && (!v || c.dataset.q.includes(v)); c.style.display = show ? "" : "none"; n += show; });
      $("#noresult")?.classList.toggle("hidden", n > 0);
    };
    if ($("#dq")) { $("#dq").oninput = (e) => { sessionStorage.setItem("att_q", e.target.value); apply(); }; $("#flt").onchange = (e) => { sessionStorage.setItem("att_f_intake", e.target.value); apply(); }; apply(); }
  }

  async function newSection(D) {
    const { intakes, courses } = D;
    const dlg = await App.dialog({ title: "New section", ic: "plus", okText: "Create section", html: true, wide: true,
      body: `<div class="grid cols-2">
        <div><label>Intake</label><select id="ns_in">${intakes.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}<option value="__new">+ New intake…</option></select>
          <input id="ns_in_new" class="hidden" style="margin-top:8px" placeholder="e.g. Fall 2026-27" maxlength="60" /></div>
        <div><label>Course</label><select id="ns_co">${courses.map((c) => `<option value="${c.id}">${esc(c.code)} — ${esc(c.title)}</option>`).join("")}<option value="__new">+ New course…</option></select>
          <div id="ns_co_new" class="row hidden" style="margin-top:8px"><input id="ns_cc" placeholder="CSC 3215" maxlength="20" style="flex:0 0 120px" /><input id="ns_ct" class="grow" placeholder="Web Technologies" maxlength="120" /></div></div>
        <div><label>Section</label><input id="ns_nm" placeholder="e.g. R" maxlength="20" /></div>
        <div><label>Class code <span class="faint">(optional)</span></label><input id="ns_code" placeholder="e.g. 01553" maxlength="20" /></div>
        <div><label>Classes per term</label><input id="ns_n" type="number" min="0" max="60" value="12" /><p class="hint">A <b>Mid Term</b> and a <b>Final Term</b> are created with this many classes each.</p></div>
        <div><label>Minimum attendance</label><input id="ns_min" type="number" min="0" max="100" value="80" /><p class="hint">Students below this % are flagged as at risk.</p></div></div>`,
      validate: (m) => {
        if (m.querySelector("#ns_in").value === "__new" && !m.querySelector("#ns_in_new").value.trim()) return "Type the new intake name.";
        if (m.querySelector("#ns_co").value === "__new" && (!m.querySelector("#ns_cc").value.trim() || !m.querySelector("#ns_ct").value.trim())) return "Type the new course code and title.";
        if (!m.querySelector("#ns_nm").value.trim()) return "Type the section name, e.g. R.";
      } });
    if (!dlg) return;
    try {
      const v = (s) => dlg.querySelector(s).value.trim();
      let intakeId = v("#ns_in"), courseId = v("#ns_co");
      if (intakeId === "__new") intakeId = (await q(sb.from("intakes").insert({ name: v("#ns_in_new") }).select().single())).id;
      if (courseId === "__new") courseId = (await q(sb.from("courses").insert({ code: v("#ns_cc"), title: v("#ns_ct") }).select().single())).id;
      const sec = await q(sb.from("sections").insert({ intake_id: intakeId, course_id: courseId, name: v("#ns_nm"), class_code: v("#ns_code") || null,
        min_attendance_pct: Math.max(0, Math.min(100, +v("#ns_min") || 80)) }).select().single());
      const n = Math.max(0, Math.min(60, +v("#ns_n") || 0));
      const terms = await q(sb.from("terms").insert([{ section_id: sec.id, name: "Mid Term", sort: 1 }, { section_id: sec.id, name: "Final Term", sort: 2 }]).select());
      if (n) await q(sb.from("classes").insert(terms.flatMap((t) => Array.from({ length: n }, (_, k) => ({ term_id: t.id, number: k + 1 })))));
      App.toast("Section created — now upload the student list"); go(`#/section/${sec.id}/students`);
    } catch (x) { fail(x); }
    // reveal "new" fields
  }
  document.addEventListener("change", (e) => {
    if (e.target.id === "ns_in") $("#ns_in_new").classList.toggle("hidden", e.target.value !== "__new");
    if (e.target.id === "ns_co") $("#ns_co_new").classList.toggle("hidden", e.target.value !== "__new");
  });

  // ------------------------------------------------------------------ intakes & courses
  async function renderSetup() {
    page(loading());
    const [intakes, courses, sections] = await Promise.all([
      q(sb.from("intakes").select("*").order("created_at", { ascending: false })), q(sb.from("courses").select("*").order("code")), q(sb.from("sections").select("intake_id, course_id")) ]);
    const nI = (id) => sections.filter((s) => s.intake_id === id).length, nC = (id) => sections.filter((s) => s.course_id === id).length;
    page(`<div class="crumbs"><a href="#/">${icon("back")} All sections</a></div>
      <div class="page-head"><div><h1>Intakes & courses</h1><p class="muted" style="margin:6px 0 0">The building blocks for your sections. Deleting one also deletes its sections.</p></div></div>
      <div class="grid cols-2">
        <div class="card"><div class="card-head"><div><h2>Intakes</h2><div class="sub">e.g. Fall 2026-27, Spring 2026-27</div></div></div>
          <form id="fin" class="row" style="margin-bottom:14px"><div class="f"><input id="in_nm" placeholder="New intake name" maxlength="60" required /></div><button class="btn">${icon("plus")} Add</button></form>
          <ul class="list">${intakes.map((i) => `<li><span class="grow"><b>${esc(i.name)}</b></span><span class="badge">${nI(i.id)} sections</span>
            <button class="icon-btn" data-ren-intake="${i.id}" data-name="${esc(i.name)}" title="Rename">${icon("edit")}</button>
            <button class="icon-btn danger" data-del-intake="${i.id}" title="Delete">${icon("trash")}</button></li>`).join("") || `<li class="muted">No intakes yet.</li>`}</ul></div>
        <div class="card"><div class="card-head"><div><h2>Courses</h2><div class="sub">Course code and title</div></div></div>
          <form id="fco" class="row" style="margin-bottom:14px"><div class="f" style="flex:0 0 130px;min-width:110px"><input id="co_cd" placeholder="CSC 3215" maxlength="20" required /></div>
            <div class="f"><input id="co_tt" placeholder="Web Technologies" maxlength="120" required /></div><button class="btn">${icon("plus")} Add</button></form>
          <ul class="list">${courses.map((c) => `<li><span class="code">${esc(c.code)}</span><span class="grow">${esc(c.title)}</span><span class="badge">${nC(c.id)}</span>
            <button class="icon-btn" data-ren-course="${c.id}" title="Edit">${icon("edit")}</button>
            <button class="icon-btn danger" data-del-course="${c.id}" title="Delete">${icon("trash")}</button></li>`).join("") || `<li class="muted">No courses yet.</li>`}</ul></div></div>`);
    $("#fin").onsubmit = async (e) => { e.preventDefault(); try { await q(sb.from("intakes").insert({ name: $("#in_nm").value.trim() })); App.toast("Intake added"); renderSetup(); } catch (x) { fail(x); } };
    $("#fco").onsubmit = async (e) => { e.preventDefault(); try { await q(sb.from("courses").insert({ code: $("#co_cd").value.trim(), title: $("#co_tt").value.trim() })); App.toast("Course added"); renderSetup(); } catch (x) { fail(x); } };
    $$("[data-ren-intake]").forEach((b) => (b.onclick = async () => {
      const d = await App.dialog({ title: "Rename intake", ic: "edit", okText: "Save", html: true, body: `<label>Name</label><input id="rn" maxlength="60" value="${b.dataset.name}" />` });
      if (d) try { await q(sb.from("intakes").update({ name: d.querySelector("#rn").value.trim() }).eq("id", b.dataset.renIntake)); renderSetup(); } catch (x) { fail(x); }
    }));
    $$("[data-ren-course]").forEach((b) => (b.onclick = async () => {
      const c = courses.find((x) => x.id === b.dataset.renCourse);
      const d = await App.dialog({ title: "Edit course", ic: "edit", okText: "Save", html: true,
        body: `<label>Course code</label><input id="rc" maxlength="20" value="${esc(c.code)}" /><div class="field-gap"></div><label>Title</label><input id="rt" maxlength="120" value="${esc(c.title)}" />` });
      if (d) try { await q(sb.from("courses").update({ code: d.querySelector("#rc").value.trim(), title: d.querySelector("#rt").value.trim() }).eq("id", c.id)); renderSetup(); } catch (x) { fail(x); }
    }));
    $$("[data-del-intake]").forEach((b) => (b.onclick = async () => {
      if (!(await App.confirm("Delete this intake?", "Every section in this intake — with its students, classes and attendance — will be permanently deleted."))) return;
      try { await q(sb.from("intakes").delete().eq("id", b.dataset.delIntake)); App.toast("Intake deleted"); renderSetup(); } catch (x) { fail(x); }
    }));
    $$("[data-del-course]").forEach((b) => (b.onclick = async () => {
      if (!(await App.confirm("Delete this course?", "Every section of this course — with its students, classes and attendance — will be permanently deleted."))) return;
      try { await q(sb.from("courses").delete().eq("id", b.dataset.delCourse)); App.toast("Course deleted"); renderSetup(); } catch (x) { fail(x); }
    }));
  }

  // ------------------------------------------------------------------ section data
  let S = null;              // current section data
  const UI = {};             // per-section view state (search, filters)
  async function loadSection(id) {
    const sec = await q(sb.from("sections").select("*, intake:intakes(id, name), course:courses(id, code, title)").eq("id", id).single());
    const terms = await q(sb.from("terms").select("*").eq("section_id", id).order("sort").order("name"));
    const termIds = terms.map((t) => t.id);
    const classes = termIds.length ? await App.fetchAll(() => sb.from("classes").select("*").in("term_id", termIds).order("number")) : [];
    const students = await App.fetchAll(() => sb.from("students").select("*").eq("section_id", id).order("seq").order("student_id"));
    S = { sec, terms, classes, students, att: [], byClass: {} };
    await loadAttendance();
    UI[id] ||= { q: "", filter: "all", sort: "seq", term: "", logClass: "", logSrc: "", riskOnly: false };
  }
  async function loadAttendance() {
    const ids = S.classes.map((c) => c.id); let att = [];
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80);
      att = att.concat(await App.fetchAll(() => sb.from("attendance").select("id, class_id, student_id, student_name, submitted_at, source, device_id, status, note").in("class_id", chunk).order("id")));
    }
    S.att = att; S.byClass = {}; att.forEach((a) => ((S.byClass[a.class_id] ||= {})[a.student_id] = a));
    S.terms.forEach((t) => (t.classes = S.classes.filter((c) => c.term_id === t.id).sort((a, b) => a.number - b.number)));
  }
  const recs = (cid) => S.byClass[cid] || {};
  const isHeld = (c) => !!c.opened_at || Object.keys(recs(c.id)).length > 0;
  const isOpen = (c) => c.is_open && new Date(c.expires_at) > new Date();
  function stats() {
    const held = S.classes.filter(isHeld), min = S.sec.min_attendance_pct ?? 80;
    const per = {};
    S.students.forEach((s) => {
      let a = 0, l = 0, e = 0; const byTerm = {};
      S.terms.forEach((t) => { let ta = 0, th = 0; t.classes.forEach((c) => { if (!isHeld(c)) return; th++; const r = recs(c.id)[s.student_id]; if (r) { ta++; a++; if (r.status === "late") l++; if (r.status === "excused") e++; } }); byTerm[t.id] = { a: ta, h: th }; });
      per[s.student_id] = { a, l, e, h: held.length, p: pct(a, held.length), byTerm };
    });
    const vals = Object.values(per).filter((x) => x.p != null);
    const avg = vals.length ? Math.round(vals.reduce((n, x) => n + x.p, 0) / vals.length) : null;
    const risk = S.students.filter((s) => per[s.student_id].p != null && per[s.student_id].p < min);
    return { held, per, avg, risk, min };
  }

  // ------------------------------------------------------------------ section view
  let curTab = "overview", liveTimer = null;
  async function renderSection(id, tab) {
    curTab = tab || "overview";
    if (!S || S.sec.id !== id) { page(loading()); await loadSection(id); }
    drawSection();
  }
  function drawSection() {
    const { sec, classes, students } = S, X = stats(), link = App.studentLink(sec.public_token);
    const open = classes.find(isOpen), openTerm = open && S.terms.find((t) => t.id === open.term_id);
    const nextC = open || S.terms.flatMap((t) => t.classes).find((c) => !isHeld(c));
    const scrollY = scrollY_(), wrapScroll = $(".table-wrap.keep") ? [$(".table-wrap.keep").scrollLeft, $(".table-wrap.keep").scrollTop] : null;
    const tabs = [["overview", "Overview", "chart"], ["classes", "Classes", "calendar", classes.length], ["students", "Students", "users", students.length], ["sheet", "Attendance sheet", "grid"], ["log", "Check-in log", "list", S.att.length], ["settings", "Settings", "settings"]];
    page(`<div class="crumbs"><a href="#/">${icon("back")} All sections</a></div>
      <div class="page-head"><div><div class="eyebrow"><span class="badge blue">${esc(sec.course.code)}</span>${sec.class_code ? `<span>Class code ${esc(sec.class_code)}</span><span>·</span>` : ""}<span>${esc(sec.intake.name)}</span></div>
        <h1>${esc(sec.course.title)} <span class="muted" style="font-weight:600">· Section ${esc(sec.name)}</span></h1></div>
        <div class="actions"><button class="btn secondary" id="share">${icon("qr")} Student link</button>
          <button class="btn secondary" id="xls">${icon("download")} Export Excel</button>
          ${nextC ? `<a class="btn ${open ? "green" : ""}" href="pin.html?class=${nextC.id}" target="_blank" rel="noopener">${icon(open ? "external" : "play")} ${open ? "Open PIN screen" : `Start ${App.classLabel(nextC.number)}`}</a>` : ""}</div></div>
      ${open ? `<div class="live" style="margin-bottom:20px"><span class="live-dot"></span><div class="grow"><b>Attendance is open</b> for ${esc(openTerm.name)} · ${App.classLabel(open.number)} — ${Object.keys(recs(open.id)).length} of ${students.length} checked in</div>
        <button class="btn sm secondary" id="refresh">${icon("refresh")} Refresh</button></div>` : ""}
      <div class="stats">
        <div class="stat"><div class="ic violet">${icon("users")}</div><div><div class="k">Students</div><div class="v">${students.length}</div></div></div>
        <div class="stat"><div class="ic">${icon("calendar")}</div><div><div class="k">Classes held</div><div class="v">${X.held.length}<small> / ${classes.length}</small></div></div></div>
        <div class="stat"><div class="ic green">${icon("chart")}</div><div><div class="k">Average attendance</div><div class="v ${App.pctClass(X.avg, X.min)}">${X.avg == null ? "—" : X.avg + "%"}</div></div></div>
        <div class="stat"><div class="ic red">${icon("alert")}</div><div><div class="k">Below ${X.min}%</div><div class="v">${X.risk.length}<small> students</small></div></div></div>
      </div>
      <nav class="tabs" role="tablist">${tabs.map(([k, l, ic, n]) => `<button data-tab="${k}" class="${k === curTab ? "active" : ""}" role="tab">${icon(ic)} ${l}${n != null ? ` <span class="cnt">${n}</span>` : ""}</button>`).join("")}</nav>
      <div id="tab"></div>`);
    $("#share").onclick = () => shareDialog(link);
    $("#xls").onclick = exportExcel;
    const rf = $("#refresh"); if (rf) rf.onclick = async () => { await loadAttendance(); drawSection(); App.toast("Updated"); };
    $$(".tabs [data-tab]").forEach((b) => (b.onclick = () => go(`#/section/${sec.id}/${b.dataset.tab}`)));
    ({ overview: tabOverview, classes: tabClasses, students: tabStudents, sheet: tabSheet, log: tabLog, settings: tabSettings }[curTab] || tabOverview)(X);
    scrollTo(0, scrollY);
    if (wrapScroll && $(".table-wrap.keep")) { $(".table-wrap.keep").scrollLeft = wrapScroll[0]; $(".table-wrap.keep").scrollTop = wrapScroll[1]; }
    // live refresh while a class is open
    clearInterval(liveTimer);
    if (open) liveTimer = setInterval(async () => {
      if (!S || S.sec.id !== sec.id || document.querySelector(".modal-bg,.pop") || !location.hash.includes(sec.id)) return;
      const before = S.att.length; try { await loadAttendance(); } catch { return; }
      const stillOpen = S.classes.find(isOpen);
      if (S.att.length !== before || !stillOpen) { if (!stillOpen) { const c = await q(sb.from("classes").select("*").eq("id", open.id).single()); Object.assign(S.classes.find((x) => x.id === c.id), c); } drawSection(); }
    }, 8000);
  }
  const scrollY_ = () => (location.hash === _lastHash ? scrollY : 0); let _lastHash = "";

  function shareDialog(link) {
    App.dialog({ title: "Student attendance link", ic: "link", okText: "", cancelText: "Close", html: true,
      body: `<p>Share this link with the section once — it stays the same all semester. Students open it, type their ID and the PIN on your screen.</p>
        <div class="qr" id="qrbox" style="margin:16px auto;max-width:260px"></div>
        <div class="linkbox"><code>${esc(link)}</code><button class="btn sm" id="lc">${icon("copy")} Copy</button><a class="btn sm secondary" href="${esc(link)}" target="_blank" rel="noopener">${icon("external")}</a></div>` });
    setTimeout(() => { try { new QRCode(document.getElementById("qrbox"), { text: link, width: 230, height: 230 }); } catch {} const b = $("#lc"); if (b) b.onclick = () => App.copy(link, "Link copied"); }, 0);
  }

  // ---------- Overview tab
  function tabOverview(X) {
    const { students, terms } = S, min = X.min;
    const allCols = terms.flatMap((t) => t.classes.map((c) => ({ t, c, h: isHeld(c), n: Object.keys(recs(c.id)).length, l: Object.values(recs(c.id)).filter((r) => r.status === "late").length })));
    const heldCols = allCols.filter((x) => x.h);
    const bands = [["90–100%", (p) => p >= 90, "green"], ["80–89%", (p) => p >= 80 && p < 90, ""], ["70–79%", (p) => p >= 70 && p < 80, "warn"], ["Below 70%", (p) => p < 70, "bad"]]
      .map(([l, f, c]) => [l, students.filter((s) => X.per[s.student_id].p != null && f(X.per[s.student_id].p)).length, c]);
    const counts = { P: 0, L: 0, E: 0, pin: 0, manual: 0 }; S.att.forEach((a) => { counts[a.status === "late" ? "L" : a.status === "excused" ? "E" : "P"]++; counts[a.source]++; });
    const scored = students.length && heldCols.length;
    $("#tab").innerHTML = `<div class="grid side">
      <div class="stack">
        <div class="card"><div class="card-head"><div><h2>Attendance by class</h2><div class="sub">Share of the section that attended each class held so far</div></div>
          <div class="legend"><span><span class="mk P">P</span> ≥ ${min}%</span><span><span class="mk L">L</span> ${min - 10}–${min - 1}%</span><span><span class="mk A">A</span> lower</span></div></div>
          ${scored ? `<div class="bars">${[25, 50, 75, 100].map((g) => `<div class="gl" style="bottom:${g * 0.95}%"><span>${g}%</span></div>`).join("")}
            ${allCols.map(({ t, c, h, n, l }) => { if (!h) return `<div class="bar nh"><div class="tip">${esc(t.name)} · ${App.classLabel(c.number)}<br>Not held yet</div><div class="fill"></div></div>`; const p = pct(n, students.length); return `<div class="bar ${p < min - 10 ? "bad" : p < min ? "warn" : ""}"><div class="tip">${esc(t.name)} · ${App.classLabel(c.number)}<br>${n}/${students.length} · ${p}%${l ? ` · ${l} late` : ""}</div><div class="fill" style="height:${p * 0.95}%"></div></div>`; }).join("")}</div>
            <div class="bar-labels">${allCols.map(({ t, c }) => `<span title="${esc(t.name)} · ${App.classLabel(c.number)}">${esc((t.name.trim()[0] || "").toUpperCase())}${App.pad2(c.number)}</span>`).join("")}</div>`
          : `<div class="empty"><div class="ic">${icon("chart")}</div><h3>No classes held yet</h3><p>Start the PIN for your first class — the chart fills in as students check in.</p></div>`}
        </div>
        <div class="card"><div class="card-head"><div><h2>Students below ${min}%</h2><div class="sub">${X.risk.length ? "Consider contacting these students" : "Everyone is above the minimum — great!"}</div></div>
          ${X.risk.length ? `<button class="btn sm secondary" id="cprisk">${icon("copy")} Copy IDs</button>` : ""}</div>
          ${X.risk.length ? `<div class="table-wrap" style="max-height:420px"><table><thead><tr><th>Student ID</th><th>Name</th><th class="num">Attended</th><th class="num">Attendance</th></tr></thead><tbody>
            ${X.risk.sort((a, b) => X.per[a.student_id].p - X.per[b.student_id].p).map((s) => { const p = X.per[s.student_id]; return `<tr class="clickable" data-stu="${esc(s.student_id)}"><td><b>${esc(s.student_id)}</b></td><td>${esc(s.name)}</td>
              <td class="num">${p.a} / ${p.h}</td><td><div class="pct-cell">${App.progress(p.p, min)}<b class="${App.pctClass(p.p, min)}">${p.p}%</b></div></td></tr>`; }).join("")}</tbody></table></div>`
          : `<div class="empty" style="padding:24px"><div class="ic" style="background:var(--success-soft);color:var(--success)">${icon("check")}</div><p style="margin:0">No students are at risk${X.held.length ? "" : " yet"}.</p></div>`}
        </div></div>
      <div class="stack">
        <div class="card"><h2 style="margin-bottom:18px">Distribution</h2><div class="bands">${bands.map(([l, n, c]) => `<div class="band"><span class="muted">${l}</span>
          <div class="progress ${c === "green" ? "" : c}"><span style="width:${students.length ? (n / students.length) * 100 : 0}%"></span></div><b class="num">${n}</b></div>`).join("")}</div></div>
        <div class="card"><h2 style="margin-bottom:14px">Records</h2><ul class="list">
          <li><span class="mk P">P</span><span class="grow">On time</span><b>${counts.P}</b></li>
          <li><span class="mk L">L</span><span class="grow">Late</span><b>${counts.L}</b></li>
          <li><span class="mk E">E</span><span class="grow">Excused</span><b>${counts.E}</b></li>
          <li>${icon("smartphone")}<span class="grow">Checked in with PIN</span><b>${counts.pin}</b></li>
          <li>${icon("edit")}<span class="grow">Marked by you</span><b>${counts.manual}</b></li></ul></div>
        <div class="card"><h2 style="margin-bottom:6px">Rules</h2><p class="small muted">Change these in Settings.</p><ul class="list small">
          <li>${icon("target")}<span class="grow">Minimum attendance</span><b>${min}%</b></li>
          <li>${icon("clock")}<span class="grow">Late after</span><b>${S.sec.late_after_minutes ? S.sec.late_after_minutes + " min" : "Off"}</b></li>
          <li>${icon("smartphone")}<span class="grow">One device per class</span><b>${S.sec.one_device_per_class ? "On" : "Off"}</b></li></ul></div>
      </div></div>`;
    const cp = $("#cprisk"); if (cp) cp.onclick = () => App.copy(X.risk.map((s) => s.student_id).join("\n"), `${X.risk.length} IDs copied`);
    $$("[data-stu]").forEach((r) => (r.onclick = () => studentProfile(r.dataset.stu)));
  }

  // ---------- Classes tab
  function tabClasses() {
    const { sec, terms, students } = S;
    $("#tab").innerHTML = `<div class="stack">${terms.map((t) => { const h = t.classes.filter(isHeld).length; return `<div class="card">
        <div class="card-head"><div><h2>${esc(t.name)}</h2><div class="sub">${h} of ${t.classes.length} classes held</div></div>
          <div class="btn-group"><button class="btn sm secondary" data-add="${t.id}">${icon("plus")} Add classes</button>
            <button class="icon-btn" data-term-menu="${t.id}" title="Term options">${icon("dots")}</button></div></div>
        ${t.classes.length ? `<div class="table-wrap"><table><thead><tr><th>Class</th><th>Date</th><th>Topic</th><th>Status</th><th class="num">Attendance</th><th></th></tr></thead><tbody>
        ${t.classes.map((c) => { const r = Object.values(recs(c.id)), n = r.length, l = r.filter((x) => x.status === "late").length, o = isOpen(c), hd = isHeld(c); return `<tr>
          <td><b>${App.classLabel(c.number)}</b></td><td class="nowrap">${c.class_date ? App.fmtDay(c.class_date) : `<span class="faint">—</span>`}</td>
          <td>${c.title ? esc(c.title) : `<span class="faint">—</span>`}</td>
          <td>${o ? `<span class="badge green"><span class="dot"></span> Open</span>` : hd ? `<span class="badge blue">Held</span>` : `<span class="badge">Not held</span>`}</td>
          <td>${hd ? `<div class="pct-cell">${App.progress(pct(n, students.length), sec.min_attendance_pct)}<b>${n}/${students.length}</b></div>${l ? `<div class="xs muted num">${l} late</div>` : ""}` : ""}</td>
          <td class="actions"><a class="btn sm ${o ? "green" : hd ? "secondary" : ""}" href="pin.html?class=${c.id}" target="_blank" rel="noopener">${icon(o ? "external" : "play")} ${o ? "PIN screen" : hd ? "Reopen" : "Start PIN"}</a>
            <button class="icon-btn" data-cls-menu="${c.id}" title="More">${icon("dots")}</button></td></tr>`; }).join("")}</tbody></table></div>`
        : `<div class="empty" style="padding:24px"><p style="margin:0">No classes in this term yet.</p></div>`}</div>`; }).join("")}
      <div class="card"><div class="card-head"><div><h2>Add a term</h2><div class="sub">For example a make-up term or a lab block.</div></div></div>
        <form id="fterm" class="row"><div class="f"><input id="t_nm" placeholder="Term name" maxlength="40" required /></div><button class="btn secondary">${icon("plus")} Add term</button></form></div></div>`;
    $$("[data-add]").forEach((b) => (b.onclick = async () => {
      const t = terms.find((x) => x.id === b.dataset.add);
      const d = await App.dialog({ title: `Add classes to ${t.name}`, ic: "plus", okText: "Add", html: true, body: `<label>How many classes?</label><input id="nadd" type="number" min="1" max="60" value="1" />` });
      if (!d) return;
      const n = Math.max(1, Math.min(60, +d.querySelector("#nadd").value || 1)), start = t.classes.reduce((m, c) => Math.max(m, c.number), 0);
      try { const rows = await q(sb.from("classes").insert(Array.from({ length: n }, (_, k) => ({ term_id: t.id, number: start + k + 1 }))).select()); S.classes.push(...rows); await loadAttendance(); drawSection(); App.toast(`${n} class${n > 1 ? "es" : ""} added`); } catch (x) { fail(x); }
    }));
    $$("[data-term-menu]").forEach((b) => (b.onclick = () => {
      const t = terms.find((x) => x.id === b.dataset.termMenu);
      popover(b, `<button data-v="ren">${icon("edit")} Rename term</button><button data-v="del" style="color:var(--danger)">${icon("trash")} Delete term</button>`, async (v) => {
        if (v === "ren") {
          const d = await App.dialog({ title: "Rename term", ic: "edit", okText: "Save", html: true, body: `<label>Name</label><input id="tn" maxlength="40" value="${esc(t.name)}" />` });
          if (d) try { await q(sb.from("terms").update({ name: d.querySelector("#tn").value.trim() }).eq("id", t.id)); t.name = d.querySelector("#tn").value.trim(); drawSection(); } catch (x) { fail(x); }
        } else {
          if (!(await App.confirm(`Delete ${t.name}?`, "All its classes and their attendance records will be permanently deleted."))) return;
          try { await q(sb.from("terms").delete().eq("id", t.id)); S.terms = S.terms.filter((x) => x.id !== t.id); S.classes = S.classes.filter((c) => c.term_id !== t.id); await loadAttendance(); drawSection(); } catch (x) { fail(x); }
        }
      });
    }));
    $$("[data-cls-menu]").forEach((b) => (b.onclick = () => classMenu(b, b.dataset.clsMenu)));
    $("#fterm").onsubmit = async (e) => {
      e.preventDefault();
      try { const t = await q(sb.from("terms").insert({ section_id: sec.id, name: $("#t_nm").value.trim(), sort: terms.length + 1 }).select().single()); t.classes = []; S.terms.push(t); drawSection(); App.toast("Term added"); } catch (x) { fail(x); }
    };
  }

  function classMenu(anchor, classId) {
    const c = S.classes.find((x) => x.id === classId);
    popover(anchor, `<div class="ph"><b>${App.classLabel(c.number)}</b><span class="xs muted">${Object.keys(recs(c.id)).length} records</span></div>
      <button data-v="edit">${icon("edit")} Edit date & topic</button>
      <button data-v="all">${icon("check")} Mark everyone present</button>
      <button data-v="clear">${icon("x")} Clear attendance</button>
      <button data-v="del" style="color:var(--danger)">${icon("trash")} Delete class</button>`, async (v) => {
      try {
        if (v === "edit") {
          const d = await App.dialog({ title: `Edit ${App.classLabel(c.number)}`, ic: "edit", okText: "Save", html: true,
            body: `<div class="grid cols-2"><div><label>Class number</label><input id="e_no" type="number" min="1" max="200" value="${c.number}" /></div>
              <div><label>Date</label><input id="e_dt" type="date" value="${esc(c.class_date || "")}" /></div></div>
              <div class="field-gap"></div><label>Topic <span class="faint">(optional)</span></label><input id="e_tt" maxlength="120" value="${esc(c.title || "")}" placeholder="e.g. HTML forms" />` });
          if (!d) return;
          const upd = { number: +d.querySelector("#e_no").value, title: d.querySelector("#e_tt").value.trim() || null, class_date: d.querySelector("#e_dt").value || null };
          await q(sb.from("classes").update(upd).eq("id", c.id)); Object.assign(c, upd); await loadAttendance(); drawSection(); App.toast("Class updated");
        } else if (v === "all") {
          const missing = S.students.filter((s) => !recs(c.id)[s.student_id]);
          if (!missing.length) return App.toast("Everyone is already marked");
          if (!(await App.confirm("Mark everyone present?", `${missing.length} students without a record for ${App.classLabel(c.number)} will be marked present.`, "Mark present", false))) return;
          for (let i = 0; i < missing.length; i += 500) await q(sb.from("attendance").insert(missing.slice(i, i + 500).map((s) => ({ class_id: c.id, student_id: s.student_id, student_name: s.name, source: "manual", status: "present" }))));
          await markHeld(c); await loadAttendance(); drawSection(); App.toast(`${missing.length} marked present`);
        } else if (v === "clear") {
          if (!(await App.confirm("Clear attendance?", `All ${Object.keys(recs(c.id)).length} records for ${App.classLabel(c.number)} will be deleted.`, "Clear"))) return;
          await q(sb.from("attendance").delete().eq("class_id", c.id)); await loadAttendance(); drawSection(); App.toast("Attendance cleared");
        } else if (v === "del") {
          if (!(await App.confirm(`Delete ${App.classLabel(c.number)}?`, "The class and its attendance records will be permanently deleted."))) return;
          await q(sb.from("classes").delete().eq("id", c.id)); S.classes = S.classes.filter((x) => x.id !== c.id); await loadAttendance(); drawSection(); App.toast("Class deleted");
        }
      } catch (x) { fail(x); }
    });
  }
  async function markHeld(c) {
    if (c.opened_at) return;
    const now = new Date().toISOString(), upd = { opened_at: now, class_date: c.class_date || new Date().toLocaleDateString("en-CA", { timeZone: cfg.TIME_ZONE || undefined }) };
    await q(sb.from("classes").update(upd).eq("id", c.id)); Object.assign(c, upd);
  }

  // ---------- status change (shared by sheet + profile)
  async function setStatus(classId, sid, status) {
    const a = recs(classId)[sid], c = S.classes.find((x) => x.id === classId), stu = S.students.find((s) => s.student_id === sid);
    if (!status) {
      if (!a) return;
      await q(sb.from("attendance").delete().eq("id", a.id)); delete S.byClass[classId][sid]; S.att = S.att.filter((x) => x.id !== a.id);
    } else if (a) {
      if (a.status === status) return;
      await q(sb.from("attendance").update({ status }).eq("id", a.id)); a.status = status;
    } else {
      const row = await q(sb.from("attendance").insert({ class_id: classId, student_id: sid, student_name: stu?.name || "", source: "manual", status }).select().single());
      (S.byClass[classId] ||= {})[sid] = row; S.att.push(row); await markHeld(c);
    }
  }
  function statusPop(anchor, classId, sid, after) {
    const a = recs(classId)[sid], c = S.classes.find((x) => x.id === classId), t = S.terms.find((x) => x.id === c.term_id), stu = S.students.find((s) => s.student_id === sid);
    const cur = a ? a.status : "absent";
    popover(anchor, `<div class="ph"><b>${esc(stu?.name || sid)}</b><span class="xs muted">${esc(sid)} · ${esc(t.name)} · ${App.classLabel(c.number)}</span>
        ${a ? `<div class="xs muted" style="margin-top:4px">${a.source === "pin" ? "Checked in with PIN" : "Marked by you"} · ${App.fmtDate(a.submitted_at)}</div>` : ""}</div>
      ${[["present", "P", "Present"], ["late", "L", "Late"], ["excused", "E", "Excused"], ["absent", "A", "Absent"]].map(([v, k, l]) => `<button data-v="${v}" class="${cur === v ? "cur" : ""}"><span class="mk ${k}">${k}</span> ${l}${cur === v ? `<span class="grow"></span>${icon("check")}` : ""}</button>`).join("")}`,
      async (v) => {
        if (v === cur) return;
        if (a && a.source === "pin" && v === "absent" && !(await App.confirm("Mark absent?", `${sid} checked in with the PIN at ${App.fmtTime(a.submitted_at)}. Remove this record?`, "Mark absent"))) return;
        try { await setStatus(classId, sid, v === "absent" ? null : v); after(); } catch (x) { fail(x); }
      });
  }

  // ---------- Students tab
  function tabStudents(X) {
    const { students } = S, ui = UI[S.sec.id], min = X.min;
    let list = students.map((s, i) => ({ s, i, p: X.per[s.student_id] }));
    if (ui.filter === "risk") list = list.filter((x) => x.p.p != null && x.p.p < min);
    if (ui.filter === "perfect") list = list.filter((x) => x.p.h && x.p.a === x.p.h);
    const sorters = { seq: (a, b) => a.i - b.i, id: (a, b) => a.s.student_id.localeCompare(b.s.student_id), name: (a, b) => a.s.name.localeCompare(b.s.name),
      low: (a, b) => (a.p.p ?? 101) - (b.p.p ?? 101), high: (a, b) => (b.p.p ?? -1) - (a.p.p ?? -1) };
    list.sort(sorters[ui.sort] || sorters.seq);
    $("#tab").innerHTML = `<div class="card flush">
      <div class="card-head" style="padding-bottom:18px"><div class="row center-y grow">
          <div class="search" style="flex:1;min-width:200px;max-width:340px">${icon("search")}<input id="sq" placeholder="Search ID or name  ( / )" value="${esc(ui.q)}" /></div>
          <div class="seg" id="sf">${[["all", "All"], ["risk", `Below ${min}%`], ["perfect", "100%"]].map(([k, l]) => `<button data-f="${k}" class="${ui.filter === k ? "on" : ""}">${l}</button>`).join("")}</div>
          <select id="ss" style="width:auto"><option value="seq">List order</option><option value="id">Student ID</option><option value="name">Name</option><option value="low">Lowest %</option><option value="high">Highest %</option></select></div>
        <div class="btn-group"><button class="btn" id="up">${icon("upload")} Upload list</button><button class="btn secondary" id="add1">${icon("plus")} Add</button>
          <button class="icon-btn bordered" id="stmenu" title="More">${icon("dots")}</button></div></div>
      ${students.length ? `<div class="table-wrap keep" style="border-radius:0;border-left:0;border-right:0;border-bottom:0;max-height:640px"><table><thead><tr><th class="num">#</th><th>Student ID</th><th>Name</th><th class="num">Attended</th><th class="num">Late</th><th class="num">Attendance</th><th></th></tr></thead>
        <tbody id="stb">${list.map(({ s, i, p }) => `<tr class="clickable" data-stu="${esc(s.student_id)}" data-q="${esc((s.student_id + " " + s.name).toLowerCase())}">
          <td class="num faint">${i + 1}</td><td><b>${esc(s.student_id)}</b></td><td>${esc(s.name) || `<span class="faint">—</span>`}</td>
          <td class="num">${p.h ? `${p.a} / ${p.h}` : "—"}</td><td class="num">${p.l || ""}</td>
          <td>${p.h ? `<div class="pct-cell">${App.progress(p.p, min)}<b class="${App.pctClass(p.p, min)}">${p.p}%</b></div>` : `<span class="faint" style="float:right">—</span>`}</td>
          <td class="actions"><button class="icon-btn" data-edit-stu="${s.id}" title="Edit">${icon("edit")}</button><button class="icon-btn danger" data-del-stu="${s.id}" title="Remove">${icon("trash")}</button></td></tr>`).join("")}
          ${list.length ? "" : `<tr><td colspan="7"><div class="empty" style="padding:20px">No students match this filter.</div></td></tr>`}</tbody></table></div>`
      : `<div class="empty"><div class="ic">${icon("users")}</div><h3>No students yet</h3><p>Upload the university's <b>Valid Student List</b> (.xlsx) or any Excel / CSV file with a Student ID column and a Name column.</p>
          <button class="btn" id="up2">${icon("upload")} Upload student list</button></div>`}
      <input type="file" id="upl" accept=".xlsx,.xls,.csv" class="hidden" /></div>`;
    $("#ss").value = ui.sort;
    const filterRows = () => { const v = ui.q.toLowerCase(); $$("#stb tr[data-q]").forEach((r) => (r.style.display = !v || r.dataset.q.includes(v) ? "" : "none")); };
    $("#sq").oninput = (e) => { ui.q = e.target.value; filterRows(); }; filterRows();
    $$("#sf button").forEach((b) => (b.onclick = () => { ui.filter = b.dataset.f; drawSection(); }));
    $("#ss").onchange = (e) => { ui.sort = e.target.value; drawSection(); };
    [$("#up"), $("#up2")].forEach((b) => b && (b.onclick = () => $("#upl").click()));
    $("#upl").onchange = (e) => e.target.files[0] && importStudents(e.target.files[0]);
    $("#add1").onclick = () => editStudent(null);
    $("#stmenu").onclick = (e) => popover(e.currentTarget, `<button data-v="dl">${icon("download")} Download student list</button><button data-v="tpl">${icon("file")} Download blank template</button>
      <button data-v="cp">${icon("copy")} Copy all IDs</button><div class="sep" style="height:1px;background:var(--border);margin:6px 0"></div>
      <button data-v="clr" style="color:var(--danger)">${icon("trash")} Remove all students</button>`, async (v) => {
      if (v === "dl") downloadRoster(false); else if (v === "tpl") downloadRoster(true);
      else if (v === "cp") App.copy(students.map((s) => s.student_id).join("\n"), `${students.length} IDs copied`);
      else if (v === "clr") {
        if (!(await App.confirm("Remove all students?", "The whole list for this section will be removed. Attendance already recorded stays in the database.", "Remove all"))) return;
        try { await q(sb.from("students").delete().eq("section_id", S.sec.id)); S.students = []; drawSection(); App.toast("All students removed"); } catch (x) { fail(x); }
      }
    });
    $$("#stb tr[data-stu]").forEach((r) => (r.onclick = (e) => { if (e.target.closest("button")) return; studentProfile(r.dataset.stu); }));
    $$("[data-edit-stu]").forEach((b) => (b.onclick = () => editStudent(S.students.find((s) => s.id === b.dataset.editStu))));
    $$("[data-del-stu]").forEach((b) => (b.onclick = async () => {
      const s = S.students.find((x) => x.id === b.dataset.delStu);
      if (!(await App.confirm("Remove student?", `${s.student_id} ${s.name} will no longer be able to check in. Past attendance stays.`, "Remove"))) return;
      try { await q(sb.from("students").delete().eq("id", s.id)); S.students = S.students.filter((x) => x.id !== s.id); drawSection(); App.toast("Student removed"); } catch (x) { fail(x); }
    }));
  }
  const normId = (v) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

  async function editStudent(s) {
    const d = await App.dialog({ title: s ? "Edit student" : "Add a student", ic: s ? "edit" : "plus", okText: s ? "Save" : "Add student", html: true,
      body: `<label>Student ID</label><input id="o_id" placeholder="${esc(cfg.STUDENT_ID_EXAMPLE || "")}" maxlength="30" value="${esc(s?.student_id || "")}" ${s ? "disabled" : ""} />
        <div class="field-gap"></div><label>Full name</label><input id="o_nm" maxlength="120" value="${esc(s?.name || "")}" />`,
      validate: (m) => { const id = normId(m.querySelector("#o_id").value); if (!id) return "Enter the Student ID."; if (!s && cfg.STUDENT_ID_PATTERN && !new RegExp(cfg.STUDENT_ID_PATTERN).test(id)) return `ID should look like ${cfg.STUDENT_ID_EXAMPLE}.`; if (!s && S.students.some((x) => x.student_id === id)) return "This ID is already on the list."; } });
    if (!d) return;
    try {
      const name = d.querySelector("#o_nm").value.trim();
      if (s) { await q(sb.from("students").update({ name }).eq("id", s.id)); s.name = name; }
      else { const row = await q(sb.from("students").insert({ section_id: S.sec.id, student_id: normId(d.querySelector("#o_id").value), name, seq: S.students.length + 1 }).select().single()); S.students.push(row); }
      drawSection(); App.toast(s ? "Saved" : "Student added");
    } catch (x) { fail(x); }
  }

  function downloadRoster(blank) {
    const rows = blank ? [["Student ID", "Student Name"], [cfg.STUDENT_ID_EXAMPLE || "22-48341-3", "Example Name"]] : [["#", "Student ID", "Student Name"], ...S.students.map((s, i) => [i + 1, s.student_id, s.name])];
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = blank ? [{ wch: 14 }, { wch: 34 }] : [{ wch: 5 }, { wch: 14 }, { wch: 34 }];
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, blank ? "Student_List_Template.xlsx" : `Students_${safe(S.sec.course.code)}_Sec-${safe(S.sec.name)}.xlsx`);
  }
  const safe = (x) => String(x).replace(/[^\w\-]+/g, "_");

  async function importStudents(file) {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      const idRe = cfg.STUDENT_ID_PATTERN ? new RegExp(cfg.STUDENT_ID_PATTERN) : null;
      let hr = -1, ic = -1, nc = -1;
      for (let r = 0; r < Math.min(rows.length, 15) && hr < 0; r++) {
        const cells = rows[r].map((c) => String(c).trim().toLowerCase());
        const i = cells.findIndex((c) => /^(student\s*)?id(\s*no\.?)?$/.test(c)), n = cells.findIndex((c) => /name/.test(c));
        if (i >= 0 && n >= 0) { hr = r; ic = i; nc = n; }
      }
      if (hr < 0 && idRe) {
        for (let r = 0; r < rows.length && ic < 0; r++) {
          const i = rows[r].findIndex((c) => idRe.test(normId(c)));
          if (i >= 0) { hr = r - 1; ic = i; nc = rows[r].findIndex((c, k) => k !== i && String(c).trim().length > 2 && !idRe.test(normId(c)) && isNaN(+c)); }
        }
      }
      if (ic < 0) throw new Error("Could not find a Student ID column in this file.");
      const seen = new Set(), list = [];
      for (let r = hr + 1; r < rows.length; r++) {
        const id = normId(rows[r][ic]); if (!id || seen.has(id)) continue;
        if (idRe && !idRe.test(id)) continue;
        seen.add(id); list.push({ student_id: id, name: nc >= 0 ? String(rows[r][nc]).trim() : "" });
      }
      if (!list.length) throw new Error("No student IDs found in this file.");
      const existing = new Set(S.students.map((s) => s.student_id));
      const added = list.filter((s) => !existing.has(s.student_id)).length, missing = S.students.filter((s) => !seen.has(s.student_id)).length;
      const dlg = await App.dialog({ title: "Import student list", ic: "upload", okText: `Import ${list.length} students`, html: true, wide: true,
        body: `<div class="stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
            <div class="stat"><div><div class="k">In file</div><div class="v">${list.length}</div></div></div>
            <div class="stat"><div><div class="k">New</div><div class="v pct-good">${added}</div></div></div>
            <div class="stat"><div><div class="k">Not in file</div><div class="v ${missing ? "pct-warn" : ""}">${missing}</div></div></div></div>
          <div class="table-wrap" style="max-height:220px"><table><thead><tr><th>Student ID</th><th>Name</th></tr></thead><tbody>
            ${list.slice(0, 8).map((s) => `<tr><td><b>${esc(s.student_id)}</b></td><td>${esc(s.name)}</td></tr>`).join("")}
            ${list.length > 8 ? `<tr><td colspan="2" class="muted">…and ${list.length - 8} more</td></tr>` : ""}</tbody></table></div>
          ${missing ? `<div class="field-gap"></div><label class="switch"><input type="checkbox" id="rep" /><span>Remove the ${missing} students who are not in this file<span class="d">Use this when students have dropped the course. Their past attendance stays.</span></span></label>` : ""}
          <p class="hint">The list order in the file becomes the row order in the Excel export, so it matches your Portfolio file.</p>` });
      if (!dlg) return;
      const rep = dlg.querySelector("#rep")?.checked;
      const rows2 = list.map((s, k) => ({ section_id: S.sec.id, student_id: s.student_id, name: s.name, seq: k + 1 }));
      for (let i = 0; i < rows2.length; i += 500) await q(sb.from("students").upsert(rows2.slice(i, i + 500), { onConflict: "section_id,student_id" }));
      if (rep) { const gone = S.students.filter((s) => !seen.has(s.student_id)).map((s) => s.id); for (let i = 0; i < gone.length; i += 100) await q(sb.from("students").delete().in("id", gone.slice(i, i + 100))); }
      S.students = await App.fetchAll(() => sb.from("students").select("*").eq("section_id", S.sec.id).order("seq").order("student_id"));
      App.toast(`Imported ${list.length} students`); drawSection();
    } catch (x) { fail(x); }
  }

  // student profile (modal)
  function studentProfile(sid) {
    const draw = () => {
      const X = stats(), s = S.students.find((x) => x.student_id === sid), p = X.per[sid];
      if (!s) return;
      const body = `<div class="summary" style="margin:0 0 20px"><div class="ring">${App.ring(p.p, 76, 8, p.p != null && p.p < X.min ? "var(--danger)" : "var(--success)")}<b>${p.p == null ? "—" : p.p + "%"}</b></div>
          <div class="t"><b style="font-size:16px">${esc(s.name)}</b><div class="muted">${esc(s.student_id)}</div>
          <div style="margin-top:6px">Attended <b>${p.a}</b> of <b>${p.h}</b> held · <b>${p.l}</b> late · <b>${p.e}</b> excused</div></div></div>
        ${S.terms.map((t) => `<div class="section-title" style="margin-top:6px">${esc(t.name)} <span class="faint">· ${p.byTerm[t.id].a}/${p.byTerm[t.id].h}</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px">${t.classes.map((c) => { const r = recs(c.id)[sid], k = r ? STATUS[r.status].k : isHeld(c) ? "A" : "N";
            return `<button class="mkbtn" data-c="${c.id}" title="${App.classLabel(c.number)}${c.class_date ? " · " + App.fmtDay(c.class_date) : ""}" style="border:0;background:none;padding:0;cursor:pointer;text-align:center">
              <span class="mk ${k} ${r && r.source === "manual" ? "manual" : ""}">${k === "N" ? "" : k}</span><div class="xs faint" style="margin-top:2px">${App.pad2(c.number)}</div></button>`; }).join("")}</div>`).join("")}
        <div class="legend"><span><span class="mk P">P</span>Present</span><span><span class="mk L">L</span>Late</span><span><span class="mk E">E</span>Excused</span><span><span class="mk A">A</span>Absent</span><span><span class="mk N"></span>Not held</span></div>
        <p class="hint">Click a class to change the mark.</p>`;
      const m = document.querySelector(".modal-bg[data-profile]");
      if (m) m.querySelector(".dlg-body").innerHTML = body;
      return body;
    };
    App.dialog({ title: "Student attendance", ic: "user", okText: "", cancelText: "Close", html: true, wide: true, body: draw() }).then(() => drawSection());
    const m = $$(".modal-bg").pop(); m.dataset.profile = "1";
    m.addEventListener("click", (e) => { const b = e.target.closest(".mkbtn"); if (b) statusPop(b, b.dataset.c, sid, draw); });
  }

  // ---------- Attendance sheet tab
  function tabSheet(X) {
    const { terms, students } = S, ui = UI[S.sec.id], min = X.min;
    const ts = terms.filter((t) => !ui.term || t.id === ui.term);
    const cols = ts.flatMap((t) => t.classes.map((c) => ({ t, c })));
    const shown = students.filter((s) => !ui.riskOnly || (X.per[s.student_id].p != null && X.per[s.student_id].p < min));
    $("#tab").innerHTML = `<div class="card flush">
      <div class="card-head" style="padding-bottom:16px"><div class="row center-y grow">
        <select id="tsel" style="width:auto;min-width:150px"><option value="">All terms</option>${terms.map((t) => `<option value="${t.id}" ${t.id === ui.term ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>
        <div class="search" style="flex:1;min-width:200px;max-width:320px">${icon("search")}<input id="msr" placeholder="Search ID or name  ( / )" value="${esc(ui.q)}" /></div>
        <label class="switch" style="align-items:center"><input type="checkbox" id="riskonly" ${ui.riskOnly ? "checked" : ""} /> Below ${min}% only</label></div>
        <div class="btn-group"><button class="btn sm secondary" id="print">${icon("printer")} Print</button><button class="btn sm secondary" id="xls2">${icon("download")} Excel</button></div></div>
      <div style="padding:0 24px 16px" class="legend"><span><span class="mk P">P</span>Present</span><span><span class="mk L">L</span>Late</span><span><span class="mk E">E</span>Excused</span><span><span class="mk A">A</span>Absent</span><span><span class="mk N"></span>Not held</span><span><span class="mk P manual">P</span>Marked by you</span><span class="faint">· Click a cell to change it, a class number for bulk actions</span></div>
      ${students.length && cols.length ? `<div class="table-wrap keep" style="max-height:640px;border-radius:0;border-left:0;border-right:0;border-bottom:0"><table class="matrix"><thead>
        <tr><th class="sticky" rowspan="2">Student ID</th><th rowspan="2" class="name">Name</th>${ts.map((t) => t.classes.length ? `<th class="term" colspan="${t.classes.length}">${esc(t.name)}</th>` : "").join("")}<th rowspan="2" class="num">Total</th><th rowspan="2" class="num" style="padding-right:16px">%</th></tr>
        <tr>${cols.map(({ c }) => `<th class="cls ${isHeld(c) ? "" : "nh"}" data-cls="${c.id}" title="${App.classLabel(c.number)}${c.class_date ? " · " + App.fmtDay(c.class_date) : ""}${c.title ? " · " + esc(c.title) : ""}">${App.pad2(c.number)}</th>`).join("")}</tr></thead>
        <tbody id="mtb">${shown.map((s) => {
          const p = X.per[s.student_id];
          const cells = cols.map(({ c }) => { const a = recs(c.id)[s.student_id], k = a ? STATUS[a.status].k : isHeld(c) ? "A" : "N";
            return `<td class="cell" data-c="${c.id}" data-s="${esc(s.student_id)}"><span class="mk ${k} ${a && a.source === "manual" ? "manual" : ""}">${k === "N" ? "" : k}</span></td>`; }).join("");
          return `<tr data-q="${esc((s.student_id + " " + s.name).toLowerCase())}"><td class="sticky"><b>${esc(s.student_id)}</b></td><td class="name" title="${esc(s.name)}">${esc(s.name)}</td>${cells}
            <td class="num"><b>${p.a}</b><span class="faint">/${p.h}</span></td><td class="num ${App.pctClass(p.p, min)}" style="padding-right:16px;font-weight:700">${p.p == null ? "—" : p.p + "%"}</td></tr>`;
        }).join("")}</tbody></table></div>` : `<div class="empty"><div class="ic">${icon("grid")}</div><h3>Nothing to show yet</h3><p>Add students and classes first.</p></div>`}</div>`;
    $("#tsel").onchange = (e) => { ui.term = e.target.value; drawSection(); };
    $("#riskonly").onchange = (e) => { ui.riskOnly = e.target.checked; drawSection(); };
    const filterRows = () => { const v = ui.q.toLowerCase(); $$("#mtb tr").forEach((r) => (r.style.display = !v || r.dataset.q.includes(v) ? "" : "none")); };
    $("#msr").oninput = (e) => { ui.q = e.target.value; filterRows(); }; filterRows();
    $("#xls2").onclick = exportExcel; $("#print").onclick = () => print();
    $$("#mtb td.cell").forEach((td) => (td.onclick = () => statusPop(td.firstElementChild, td.dataset.c, td.dataset.s, drawSection)));
    $$("th[data-cls]").forEach((th) => (th.onclick = () => classMenu(th, th.dataset.cls)));
  }

  // ---------- Check-in log tab
  function tabLog() {
    const ui = UI[S.sec.id], cls = Object.fromEntries(S.classes.map((c) => [c.id, c])), term = Object.fromEntries(S.terms.map((t) => [t.id, t]));
    // shared-device detection: one device used for 2+ students in the same class
    const devMap = {}; S.att.forEach((a) => { if (!a.device_id) return; const k = a.class_id + "|" + a.device_id; (devMap[k] ||= new Set()).add(a.student_id); });
    const shared = (a) => a.device_id && devMap[a.class_id + "|" + a.device_id].size > 1;
    let rows = [...S.att].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
    if (ui.logClass) rows = rows.filter((a) => a.class_id === ui.logClass);
    if (ui.logSrc === "shared") rows = rows.filter(shared); else if (ui.logSrc) rows = rows.filter((a) => a.source === ui.logSrc || a.status === ui.logSrc);
    const nShared = S.att.filter(shared).length;
    $("#tab").innerHTML = `${nShared ? `<div class="msg warn" style="margin:0 0 18px">${icon("alert")}<div><b>${nShared} check-ins</b> came from a device that was also used for another student in the same class. This can mean one phone checked in a friend. Filter by <b>Shared device</b> to review.</div></div>` : ""}
      <div class="card flush"><div class="card-head" style="padding-bottom:16px"><div class="row center-y grow">
        <select id="lc" style="width:auto;min-width:190px"><option value="">All classes</option>${S.terms.map((t) => `<optgroup label="${esc(t.name)}">${t.classes.filter(isHeld).map((c) => `<option value="${c.id}" ${ui.logClass === c.id ? "selected" : ""}>${App.classLabel(c.number)}${c.class_date ? " · " + App.fmtDay(c.class_date) : ""}</option>`).join("")}</optgroup>`).join("")}</select>
        <div class="seg" id="lsrc">${[["", "All"], ["pin", "PIN"], ["manual", "Manual"], ["late", "Late"], ["shared", "Shared device"]].map(([k, l]) => `<button data-s="${k}" class="${ui.logSrc === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="search" style="flex:1;min-width:180px;max-width:280px">${icon("search")}<input id="lq" placeholder="Search ID or name" value="${esc(ui.q)}" /></div></div>
        <span class="muted small">${rows.length} records</span></div>
      ${rows.length ? `<div class="table-wrap keep" style="max-height:640px;border-radius:0;border-left:0;border-right:0;border-bottom:0"><table><thead><tr><th>Time</th><th>Class</th><th>Student ID</th><th>Name</th><th>Status</th><th>Source</th><th>Device</th></tr></thead><tbody id="ltb">
        ${rows.slice(0, 1500).map((a) => { const c = cls[a.class_id], t = c && term[c.term_id]; return `<tr data-q="${esc((a.student_id + " " + a.student_name).toLowerCase())}">
          <td class="nowrap">${App.fmtDate(a.submitted_at)}</td><td class="nowrap">${t ? esc(t.name) + " · " : ""}${c ? App.classLabel(c.number) : ""}</td>
          <td><b>${esc(a.student_id)}</b></td><td>${esc(a.student_name)}</td>
          <td><span class="badge ${STATUS[a.status].cls}">${STATUS[a.status].label}</span></td>
          <td>${a.source === "pin" ? `<span class="badge blue">${icon("smartphone")} PIN</span>` : `<span class="badge">${icon("edit")} Manual</span>`}</td>
          <td class="mono xs">${a.device_id ? esc(a.device_id.slice(0, 8)) : "—"} ${shared(a) ? `<span class="badge red" title="Same device used for another student in this class">Shared</span>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty"><div class="ic">${icon("list")}</div><h3>No check-ins yet</h3><p>Records appear here as students check in or you mark them.</p></div>`}</div>`;
    $("#lc").onchange = (e) => { ui.logClass = e.target.value; drawSection(); };
    $$("#lsrc button").forEach((b) => (b.onclick = () => { ui.logSrc = b.dataset.s; drawSection(); }));
    const f = () => { const v = ui.q.toLowerCase(); $$("#ltb tr").forEach((r) => (r.style.display = !v || r.dataset.q.includes(v) ? "" : "none")); };
    $("#lq").oninput = (e) => { ui.q = e.target.value; f(); }; f();
  }

  // ---------- Settings tab
  function tabSettings() {
    const { sec } = S, la = sec.late_after_minutes;
    $("#tab").innerHTML = `<div class="grid cols-2" style="align-items:start">
      <div class="stack">
        <div class="card"><div class="card-head"><div><h2>Section details</h2></div></div><form id="fset">
          <div class="grid cols-2"><div><label>Section</label><input id="st_nm" value="${esc(sec.name)}" maxlength="20" required /></div>
          <div><label>Class code</label><input id="st_cc" value="${esc(sec.class_code || "")}" maxlength="20" placeholder="optional" /></div></div>
          <div style="height:18px"></div><button class="btn">${icon("check")} Save details</button></form></div>
        <div class="card"><div class="card-head"><div><h2>Attendance rules</h2><div class="sub">Apply to new check-ins from now on.</div></div></div>
          <label>Mark students late after</label>
          <div class="seg" id="late">${[[null, "Off"], [5, "5 min"], [10, "10 min"], [15, "15 min"], [20, "20 min"], [30, "30 min"]].map(([v, l]) => `<button data-v="${v ?? ""}" class="${(la ?? null) === v ? "on" : ""}">${l}</button>`).join("")}</div>
          <p class="hint">Counted from when you press Start on the PIN screen. Late still counts as attended.</p>
          <div class="field-gap"></div><label for="minp">Minimum attendance</label>
          <div class="row center-y"><input id="minp" type="range" min="50" max="100" step="5" value="${sec.min_attendance_pct}" style="flex:1;min-height:0;padding:0;border:0;box-shadow:none" /><b id="minv" style="width:52px;text-align:right">${sec.min_attendance_pct}%</b></div>
          <p class="hint">Students below this are flagged “at risk” here and on their own check-in screen.</p>
          <div class="field-gap"></div>
          <label class="switch"><input type="checkbox" id="st_dev" ${sec.one_device_per_class ? "checked" : ""} /><span>One device per student per class<span class="d">Stops one phone from checking in a second student in the same class.</span></span></label>
          <div style="height:18px"></div><button class="btn" id="saverules">${icon("check")} Save rules</button></div>
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><div><h2>Student link</h2><div class="sub">Make a new link if the current one was shared outside the section.</div></div></div>
          <div class="linkbox" style="margin-bottom:14px"><code>${esc(App.studentLink(sec.public_token))}</code></div>
          <button class="btn amber" id="regen">${icon("refresh")} Generate a new link</button><p class="hint">The old link stops working immediately.</p></div>
        <div class="card" style="border-color:color-mix(in srgb,var(--danger) 35%,var(--border))"><div class="card-head"><div><h2 style="color:var(--danger)">Danger zone</h2><div class="sub">Deletes the student list, all classes and all attendance of this section.</div></div></div>
          <button class="btn red-soft" id="delsec">${icon("trash")} Delete this section</button></div></div></div>`;
    let lateV = la ?? null;
    $$("#late button").forEach((b) => (b.onclick = () => { lateV = b.dataset.v ? +b.dataset.v : null; $$("#late button").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("#minp").oninput = (e) => ($("#minv").textContent = e.target.value + "%");
    $("#fset").onsubmit = async (e) => {
      e.preventDefault(); const upd = { name: $("#st_nm").value.trim(), class_code: $("#st_cc").value.trim() || null };
      try { await q(sb.from("sections").update(upd).eq("id", sec.id)); Object.assign(sec, upd); drawSection(); App.toast("Saved"); } catch (x) { fail(x); }
    };
    $("#saverules").onclick = async () => {
      const upd = { late_after_minutes: lateV, min_attendance_pct: +$("#minp").value, one_device_per_class: $("#st_dev").checked };
      try { await q(sb.from("sections").update(upd).eq("id", sec.id)); Object.assign(sec, upd); drawSection(); App.toast("Rules saved"); } catch (x) { fail(x); }
    };
    $("#regen").onclick = async () => {
      if (!(await App.confirm("Generate a new link?", "The current student link stops working right away. Share the new one with the section.", "Generate", false))) return;
      const tok = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
      try { await q(sb.from("sections").update({ public_token: tok }).eq("id", sec.id)); sec.public_token = tok; drawSection(); App.toast("New link created"); } catch (x) { fail(x); }
    };
    $("#delsec").onclick = async () => {
      const d = await App.dialog({ title: "Delete this section?", danger: true, okText: "Delete forever", html: true,
        body: `<p>${esc(sec.course.code)} Section ${esc(sec.name)} — the student list, classes and attendance will be permanently deleted. Export to Excel first if you need a copy.</p>
          <label>Type <b>${esc(sec.name)}</b> to confirm</label><input id="cf" />`, validate: (m) => (m.querySelector("#cf").value.trim() !== sec.name ? `Type ${sec.name} to confirm.` : null) });
      if (!d) return;
      try { await q(sb.from("sections").delete().eq("id", sec.id)); S = null; App.toast("Section deleted"); go("#/"); } catch (x) { fail(x); }
    };
  }

  // ------------------------------------------------------------------ Excel export
  function exportExcel() {
    const { sec, terms, students } = S, X = stats(), wb = XLSX.utils.book_new();
    const info = [["Attendance export"], [], ["Course", `${sec.course.code} — ${sec.course.title}`], ["Section", sec.name], ["Class code", sec.class_code || ""],
      ["Intake", sec.intake.name], ["Exported", App.fmtDate(new Date())], ["Students", students.length], ["Classes held", X.held.length], ["Minimum attendance", sec.min_attendance_pct / 100], [],
      ["How to read"], ["Term sheets: 1 = attended (present, late or excused), 0 = absent, blank = class not held yet."],
      ["Detail sheet: P = present, L = late, E = excused, A = absent."],
      ["To merge into the Portfolio: copy the Class columns of a term sheet into the Mid/Final Overall sheet (rows are in the same order as the uploaded student list)."]];
    const wsI = XLSX.utils.aoa_to_sheet(info); wsI["!cols"] = [{ wch: 20 }, { wch: 70 }]; if (wsI.B10) wsI.B10.z = "0%"; XLSX.utils.book_append_sheet(wb, wsI, "Info");

    // Summary
    const sh = ["Student ID", "Student Name", ...terms.flatMap((t) => [`${t.name} Attended`, `${t.name} Held`]), "Total Attended", "Total Held", "Late", "Excused", "Attendance %", "Status"];
    const sr = students.map((s) => { const p = X.per[s.student_id]; return [s.student_id, s.name, ...terms.flatMap((t) => [p.byTerm[t.id].a, p.byTerm[t.id].h]), p.a, p.h, p.l, p.e, p.h ? p.a / p.h : "", p.h ? (p.p < X.min ? "Below minimum" : "OK") : ""]; });
    const wsS = XLSX.utils.aoa_to_sheet([sh, ...sr]); fmtPct(wsS, sh.length - 2, sr.length); wsS["!cols"] = [{ wch: 13 }, { wch: 32 }, ...sh.slice(2).map((h) => ({ wch: Math.max(9, h.length + 2) }))];
    wsS["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(sh.length - 1)}${sr.length + 1}` }; XLSX.utils.book_append_sheet(wb, wsS, "Summary");

    // One sheet per term, 1/0 — ready to paste into the Portfolio
    terms.forEach((t) => {
      const hdr = ["Student ID", "Student Name", ...t.classes.map((c) => App.classLabel(c.number)), "Present", "Classes Held", "Attendance %"];
      const rows = students.map((s) => { let n = 0, h = 0;
        const v = t.classes.map((c) => { if (!isHeld(c)) return ""; h++; const p = recs(c.id)[s.student_id] ? 1 : 0; n += p; return p; });
        return [s.student_id, s.name, ...v, n, h, h ? n / h : ""]; });
      const ws = XLSX.utils.aoa_to_sheet([hdr, ...rows]); fmtPct(ws, hdr.length - 1, rows.length);
      ws["!cols"] = [{ wch: 13 }, { wch: 32 }, ...t.classes.map(() => ({ wch: 9 })), { wch: 9 }, { wch: 12 }, { wch: 13 }];
      ws["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(hdr.length - 1)}${rows.length + 1}` };
      XLSX.utils.book_append_sheet(wb, ws, t.name.slice(0, 31));
    });

    // Detail letters
    const cols = terms.flatMap((t) => t.classes.map((c) => ({ t, c })));
    const dh = ["Student ID", "Student Name", ...cols.map(({ t, c }) => `${t.name.replace(/\s*Term$/i, "")} ${App.pad2(c.number)}`)];
    const dr = students.map((s) => [s.student_id, s.name, ...cols.map(({ c }) => { if (!isHeld(c)) return ""; const a = recs(c.id)[s.student_id]; return a ? STATUS[a.status].k : "A"; })]);
    const wsD = XLSX.utils.aoa_to_sheet([dh, ...dr]); wsD["!cols"] = [{ wch: 13 }, { wch: 32 }, ...cols.map(() => ({ wch: 8 }))]; XLSX.utils.book_append_sheet(wb, wsD, "Detail");

    // Classes + log
    const ch = [["Term", "Class", "Date", "Topic", "Held", "Attended", "Late", "Excused", "Enrolled", "Attendance %"]];
    terms.forEach((t) => t.classes.forEach((c) => { const r = Object.values(recs(c.id)); ch.push([t.name, App.classLabel(c.number), c.class_date || "", c.title || "", isHeld(c) ? "Yes" : "No", r.length, r.filter((x) => x.status === "late").length, r.filter((x) => x.status === "excused").length, students.length, isHeld(c) && students.length ? r.length / students.length : ""]); }));
    const wsC = XLSX.utils.aoa_to_sheet(ch); fmtPct(wsC, 9, ch.length - 1); wsC["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 26 }, { wch: 7 }, { wch: 10 }, { wch: 7 }, { wch: 9 }, { wch: 9 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(wb, wsC, "Classes");
    const log = [["Term", "Class", "Class Date", "Student ID", "Student Name", "Recorded At", "Status", "Source", "Device"]];
    terms.forEach((t) => t.classes.forEach((c) => Object.values(recs(c.id)).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
      .forEach((a) => log.push([t.name, App.classLabel(c.number), c.class_date || "", a.student_id, a.student_name, App.fmtDate(a.submitted_at), STATUS[a.status].label, a.source === "pin" ? "PIN" : "Manual", a.device_id ? a.device_id.slice(0, 8) : ""]))));
    const wsL = XLSX.utils.aoa_to_sheet(log); wsL["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 13 }, { wch: 32 }, { wch: 20 }, { wch: 9 }, { wch: 8 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsL, "Check-in Log");

    XLSX.writeFile(wb, `Attendance_${safe(sec.course.code)}_${safe(sec.intake.name)}_Sec-${safe(sec.name)}_${new Date().toLocaleDateString("en-CA")}.xlsx`);
    App.toast("Excel file downloaded");
  }
  function fmtPct(ws, col, n) { const c = XLSX.utils.encode_col(col); for (let r = 2; r <= n + 1; r++) { const cell = ws[`${c}${r}`]; if (cell && cell.t === "n") cell.z = "0%"; } }

  // ------------------------------------------------------------------ router
  async function route() {
    closePop(); clearInterval(liveTimer);
    if (!user) return renderLogin();
    if (recovering) { recovering = false; await changePassword("Set a new password"); }
    const m = location.hash.match(/^#\/section\/([0-9a-f-]{36})(?:\/(\w+))?/);
    try {
      if (m) { if (S && S.sec.id !== m[1]) S = null; await renderSection(m[1], m[2]); }
      else { S = null; location.hash === "#/setup" ? await renderSetup() : await renderDashboard(); }
      _lastHash = location.hash;
    } catch (x) { fail(x); if (m) location.hash = "#/"; }
  }
  // coming back from the PIN screen tab: pull fresh data
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !S || !location.hash.includes(S.sec.id) || document.querySelector(".modal-bg,.pop")) return;
    try { const ids = S.terms.map((t) => t.id); S.classes = ids.length ? await App.fetchAll(() => sb.from("classes").select("*").in("term_id", ids).order("number")) : []; await loadAttendance(); drawSection(); } catch {}
  });
  addEventListener("hashchange", () => { if (!location.hash.startsWith("#/section/") || !S || !location.hash.includes(S.sec.id)) scrollTo(0, 0); route(); });
  addEventListener("keydown", (e) => {
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { const s = $("#sq") || $("#msr") || $("#lq") || $("#dq"); if (s) { e.preventDefault(); s.focus(); } }
    if (e.key === "Escape") closePop();
  });
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "PASSWORD_RECOVERY") recovering = true;
    const was = user?.id; user = session?.user || null;
    if (was !== user?.id || ev === "PASSWORD_RECOVERY") route();
  });
  sb.auth.getSession().then(({ data }) => { user = data.session?.user || null; route(); });
})();
