// Faculty admin: intakes, courses, sections, terms, classes, student lists, attendance, Excel export
(function () {
  const { esc, sb, cfg, $, $$ } = App;
  const root = document.getElementById("app");
  let user = null;

  if (!App.configured) { document.body.innerHTML = App.notConfiguredHtml(); return; }

  // ------------------------------------------------------------------ helpers
  const fail = (e) => { console.error(e); App.toast(e?.message || String(e), true); };
  async function q(promise) { const { data, error } = await promise; if (error) throw error; return data; }
  function topbar(crumbs = "") {
    return `<div class="topbar"><div><div class="brand">Attendance Manager</div><div class="sub">${esc(cfg.INSTITUTION || "")}</div></div>
      <div class="spacer"></div><span class="sub">${esc(user?.email || "")}</span><button class="link" id="logout">Sign out</button></div>
      ${crumbs ? `<div class="crumbs">${crumbs}</div>` : ""}`;
  }
  function bindTop() { const b = $("#logout"); if (b) b.onclick = async () => { await sb.auth.signOut(); location.hash = ""; }; }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
  function setHash(h) { if (location.hash !== h) location.hash = h; else route(); }

  // ------------------------------------------------------------------ login
  function renderLogin(msg = "", email = "") {
    root.innerHTML = `<div class="center-wrap"><div class="login"><div class="card">
      <h1>Faculty sign in</h1><p class="muted small" style="margin:0 0 18px">${esc(cfg.INSTITUTION || "")}</p>
      <form id="lf"><label>Email</label><input id="em" type="email" autocomplete="username" value="${esc(email)}" required />
      <div style="height:12px"></div><label>Password</label><input id="pw" type="password" autocomplete="current-password" required />
      <div style="height:18px"></div><button class="btn" style="width:100%;justify-content:center">Sign in</button>
      ${msg ? `<div class="msg err">${esc(msg)}</div>` : ""}
      <p class="small" style="margin-top:14px"><a href="#" id="forgot">Forgot password?</a></p></form></div>
      <p class="muted small" style="text-align:center">Accounts are created in Supabase ▸ Authentication ▸ Users.</p></div></div>`;
    $("#lf").onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.signInWithPassword({ email: $("#em").value.trim(), password: $("#pw").value });
      if (error) { renderLogin(error.message, $("#em").value.trim()); $("#pw").focus(); }
    };
    $("#forgot").onclick = async (e) => {
      e.preventDefault(); const em = $("#em").value.trim(); if (!em) return App.toast("Type your email first", true);
      const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.href.split("#")[0] });
      error ? fail(error) : App.toast("Password reset email sent");
    };
  }

  // ------------------------------------------------------------------ dashboard
  async function renderDashboard() {
    root.innerHTML = topbar() + `<main><p class="muted">Loading…</p></main>`; bindTop();
    const [intakes, courses, sections, students] = await Promise.all([
      q(sb.from("intakes").select("*").order("created_at", { ascending: false })),
      q(sb.from("courses").select("*").order("code")),
      q(sb.from("sections").select("id, name, class_code, created_at, intake:intakes(id, name), course:courses(id, code, title)").order("created_at", { ascending: false })),
      App.fetchAll(() => sb.from("students").select("section_id")),
    ]);
    const stuCount = {}; students.forEach((s) => (stuCount[s.section_id] = (stuCount[s.section_id] || 0) + 1));
    const filter = sessionStorage.getItem("att_filter_intake") || "";
    const shown = sections.filter((s) => !filter || s.intake.id === filter);

    root.innerHTML = topbar() + `<main>
      <div class="tiles">
        <div class="tile"><div class="k">Intakes</div><div class="v">${intakes.length}</div></div>
        <div class="tile"><div class="k">Courses</div><div class="v">${courses.length}</div></div>
        <div class="tile"><div class="k">Sections</div><div class="v">${sections.length}</div></div>
        <div class="tile"><div class="k">Students</div><div class="v">${students.length}</div></div>
      </div>
      <div style="height:18px"></div>
      <div class="card"><h2>Sections <span class="count">${shown.length} shown</span></h2>
        <div class="row" style="margin-bottom:12px"><div class="f" style="max-width:260px"><label>Filter by intake</label>
          <select id="flt"><option value="">All intakes</option>${intakes.map((i) => `<option value="${i.id}" ${i.id === filter ? "selected" : ""}>${esc(i.name)}</option>`).join("")}</select></div></div>
        ${shown.length ? `<div class="table-wrap"><table><thead><tr><th>Intake</th><th>Course</th><th>Section</th><th>Class code</th><th class="num">Students</th><th></th></tr></thead><tbody>
          ${shown.map((s) => `<tr><td>${esc(s.intake.name)}</td><td><b>${esc(s.course.code)}</b> ${esc(s.course.title)}</td><td><b>${esc(s.name)}</b></td>
            <td>${esc(s.class_code || "")}</td><td class="num">${stuCount[s.id] || 0}</td>
            <td style="text-align:right"><a class="btn sm" href="#/section/${s.id}">Open ▸</a></td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">No sections yet. Add an intake and a course, then create a section below.</p>`}
        <div style="height:16px"></div>
        <form id="fsec" class="row">
          <div class="f"><label>Intake</label><select id="s_in" required>${intakes.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}</select></div>
          <div class="f" style="flex:2"><label>Course</label><select id="s_co" required>${courses.map((c) => `<option value="${c.id}">${esc(c.code)} — ${esc(c.title)}</option>`).join("")}</select></div>
          <div class="f" style="max-width:110px"><label>Section</label><input id="s_nm" placeholder="R" maxlength="20" required /></div>
          <div class="f" style="max-width:130px"><label>Class code</label><input id="s_cc" placeholder="01553" maxlength="20" /></div>
          <div class="f" style="max-width:130px"><label>Classes per term</label><input id="s_n" type="number" min="0" max="60" value="12" /></div>
          <button class="btn" ${intakes.length && courses.length ? "" : "disabled"}>+ Add section</button>
        </form>
        <p class="muted small">A new section gets a <b>Mid Term</b> and a <b>Final Term</b> with the number of classes you choose. You can change them later.</p>
      </div>
      <div style="height:18px"></div>
      <div class="grid cols-2">
        <div class="card"><h2>Intakes <span class="count">e.g. Fall 2026-27</span></h2>
          <ul class="list">${intakes.map((i) => `<li><span class="grow">${esc(i.name)}</span><button class="icon-btn" data-del-intake="${i.id}" title="Delete">✕</button></li>`).join("") || `<li class="muted">None yet.</li>`}</ul>
          <form id="fin" class="row" style="margin-top:12px"><div class="f"><input id="in_nm" placeholder="Fall 2026-27" maxlength="60" required /></div><button class="btn">+ Add</button></form>
        </div>
        <div class="card"><h2>Courses</h2>
          <ul class="list">${courses.map((c) => `<li><b style="min-width:84px">${esc(c.code)}</b><span class="grow">${esc(c.title)}</span><button class="icon-btn" data-del-course="${c.id}" title="Delete">✕</button></li>`).join("") || `<li class="muted">None yet.</li>`}</ul>
          <form id="fco" class="row" style="margin-top:12px"><div class="f" style="max-width:120px"><input id="co_cd" placeholder="CSC 3215" maxlength="20" required /></div>
            <div class="f"><input id="co_tt" placeholder="Web Technologies" maxlength="120" required /></div><button class="btn">+ Add</button></form>
        </div>
      </div></main>`;
    bindTop();
    $("#flt").onchange = (e) => { sessionStorage.setItem("att_filter_intake", e.target.value); renderDashboard().catch(fail); };
    $("#fin").onsubmit = async (e) => { e.preventDefault(); try { await q(sb.from("intakes").insert({ name: $("#in_nm").value.trim() })); renderDashboard(); } catch (x) { fail(x); } };
    $("#fco").onsubmit = async (e) => { e.preventDefault(); try { await q(sb.from("courses").insert({ code: $("#co_cd").value.trim(), title: $("#co_tt").value.trim() })); renderDashboard(); } catch (x) { fail(x); } };
    $("#fsec").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const sec = await q(sb.from("sections").insert({ intake_id: $("#s_in").value, course_id: $("#s_co").value, name: $("#s_nm").value.trim(), class_code: $("#s_cc").value.trim() || null }).select().single());
        const n = Math.max(0, Math.min(60, +$("#s_n").value || 0));
        const terms = await q(sb.from("terms").insert([{ section_id: sec.id, name: "Mid Term", sort: 1 }, { section_id: sec.id, name: "Final Term", sort: 2 }]).select());
        if (n) await q(sb.from("classes").insert(terms.flatMap((t) => Array.from({ length: n }, (_, k) => ({ term_id: t.id, number: k + 1 })))));
        App.toast("Section created"); setHash(`#/section/${sec.id}/students`);
      } catch (x) { fail(x); }
    };
    $$("[data-del-intake]").forEach((b) => (b.onclick = async () => {
      if (!(await App.confirm("Delete intake?", "All sections, classes, student lists and attendance under this intake will be deleted."))) return;
      try { await q(sb.from("intakes").delete().eq("id", b.dataset.delIntake)); renderDashboard(); } catch (x) { fail(x); }
    }));
    $$("[data-del-course]").forEach((b) => (b.onclick = async () => {
      if (!(await App.confirm("Delete course?", "All sections of this course, with their classes, student lists and attendance, will be deleted."))) return;
      try { await q(sb.from("courses").delete().eq("id", b.dataset.delCourse)); renderDashboard(); } catch (x) { fail(x); }
    }));
  }

  // ------------------------------------------------------------------ section
  let S = null; // current section data

  async function loadSection(id) {
    const sec = await q(sb.from("sections").select("*, intake:intakes(id, name), course:courses(id, code, title)").eq("id", id).single());
    const terms = await q(sb.from("terms").select("*").eq("section_id", id).order("sort").order("name"));
    const termIds = terms.map((t) => t.id);
    const classes = termIds.length ? await App.fetchAll(() => sb.from("classes").select("*").in("term_id", termIds).order("number")) : [];
    const students = await App.fetchAll(() => sb.from("students").select("*").eq("section_id", id).order("seq").order("student_id"));
    const classIds = classes.map((c) => c.id);
    let att = [];
    for (let i = 0; i < classIds.length; i += 100) {
      const chunk = classIds.slice(i, i + 100);
      att = att.concat(await App.fetchAll(() => sb.from("attendance").select("id, class_id, student_id, student_name, submitted_at, source, device_id").in("class_id", chunk)));
    }
    const byClass = {}; att.forEach((a) => ((byClass[a.class_id] ||= {})[a.student_id] = a));
    terms.forEach((t) => (t.classes = classes.filter((c) => c.term_id === t.id).sort((a, b) => a.number - b.number)));
    const held = (c) => !!c.opened_at || !!byClass[c.id];
    S = { sec, terms, classes, students, att, byClass, held };
  }

  async function renderSection(id, tab = "classes") {
    root.innerHTML = topbar(`<a href="#">Sections</a> ›`) + `<main><p class="muted">Loading…</p></main>`; bindTop();
    await loadSection(id);
    const { sec, terms, classes, students, byClass, held } = S;
    const heldClasses = classes.filter(held);
    const totalMarks = heldClasses.reduce((n, c) => n + Object.keys(byClass[c.id] || {}).length, 0);
    const avg = heldClasses.length && students.length ? Math.round((totalMarks / (heldClasses.length * students.length)) * 100) : 0;
    const open = classes.find((c) => c.is_open && new Date(c.expires_at) > new Date());
    const openTerm = open && terms.find((t) => t.id === open.term_id);
    const link = App.studentLink(sec.public_token);

    root.innerHTML = topbar(`<a href="#">Sections</a> › ${esc(sec.course.code)} · Section ${esc(sec.name)} · ${esc(sec.intake.name)}`) + `<main>
      <div class="card">
        <div class="row" style="align-items:center">
          <div class="f" style="min-width:260px"><div class="muted small">${esc(sec.course.code)}${sec.class_code ? " · Class code " + esc(sec.class_code) : ""} · ${esc(sec.intake.name)}</div>
            <h1 style="color:var(--navy);font-size:22px;margin-top:2px">${esc(sec.course.title)} — Section ${esc(sec.name)}</h1></div>
          <button class="btn green" id="xls">⬇ Export Excel</button>
        </div>
        <div style="height:14px"></div>
        <label>Student attendance link (share once with the section — it stays the same all semester)</label>
        <div class="linkbox"><code>${esc(link)}</code>
          <button class="btn sm secondary" id="cpy">Copy</button><button class="btn sm secondary" id="qrb">QR code</button>
          <a class="btn sm secondary" href="${esc(link)}" target="_blank" rel="noopener">Open</a></div>
        <div style="height:14px"></div>
        <div class="tiles">
          <div class="tile"><div class="k">Students</div><div class="v">${students.length}</div></div>
          <div class="tile"><div class="k">Classes held</div><div class="v">${heldClasses.length}<span class="muted small"> / ${classes.length}</span></div></div>
          <div class="tile"><div class="k">Average attendance</div><div class="v">${avg}%</div></div>
          <div class="tile" style="border-top-color:${open ? "var(--green)" : "var(--line)"}"><div class="k">Open now</div><div class="v" style="font-size:18px;margin-top:10px">${open ? `${esc(openTerm.name)} · ${App.classLabel(open.number)}` : "—"}</div></div>
        </div>
      </div>
      <div class="tabs" id="tabs">${[["classes", "Classes & PIN"], ["students", `Students (${students.length})`], ["attendance", "Attendance sheet"], ["settings", "Settings"]]
        .map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? "active" : ""}">${l}</button>`).join("")}</div>
      <div id="tab"></div></main>`;
    bindTop();
    $("#cpy").onclick = async () => { try { await navigator.clipboard.writeText(link); App.toast("Link copied"); } catch { App.toast("Copy failed", true); } };
    $("#qrb").onclick = () => showQR(link);
    $("#xls").onclick = () => exportExcel();
    $$("#tabs [data-tab]").forEach((b) => (b.onclick = () => setHash(`#/section/${id}/${b.dataset.tab}`)));
    ({ classes: tabClasses, students: tabStudents, attendance: tabAttendance, settings: tabSettings }[tab] || tabClasses)();
  }

  function showQR(link) {
    App.dialog({ title: "Student attendance link", html: true, okText: "Done", cancelText: "Close",
      body: `<div class="qr" id="qrbox" style="padding:16px"></div><p class="small" style="word-break:break-all;text-align:center">${esc(link)}</p>` });
    setTimeout(() => { try { new QRCode(document.getElementById("qrbox"), { text: link, width: 220, height: 220 }); } catch {} }, 0);
  }

  // ---------- Classes tab
  function tabClasses() {
    const { sec, terms, students, byClass, held } = S;
    const now = new Date();
    $("#tab").innerHTML = `<div class="grid">${terms.map((t) => `<div class="card"><h2>${esc(t.name)}
        <span class="count">${t.classes.filter(held).length} of ${t.classes.length} classes held</span>
        <button class="icon-btn" data-del-term="${t.id}" title="Delete term">✕</button></h2>
        ${t.classes.length ? `<div class="table-wrap"><table><thead><tr><th>Class</th><th>Topic / title</th><th>Date</th><th>Status</th><th class="num">Present</th><th></th></tr></thead><tbody>
        ${t.classes.map((c) => {
          const isOpen = c.is_open && new Date(c.expires_at) > now; const n = Object.keys(byClass[c.id] || {}).length;
          return `<tr><td><b>${App.classLabel(c.number)}</b></td><td>${esc(c.title || "")}</td><td>${c.class_date ? esc(c.class_date) : ""}</td>
            <td>${isOpen ? `<span class="badge open">● Open</span>` : held(c) ? `<span class="badge held">Held</span>` : `<span class="badge">Not held</span>`}</td>
            <td class="num">${held(c) ? `${n} / ${students.length}` : ""}</td>
            <td style="text-align:right;white-space:nowrap"><a class="btn sm ${isOpen ? "green" : ""}" href="pin.html?class=${c.id}" target="_blank" rel="noopener">${isOpen ? "PIN screen ▸" : "Start PIN ▸"}</a>
              <button class="btn sm secondary" data-edit-class="${c.id}">Edit</button><button class="icon-btn" data-del-class="${c.id}" title="Delete class">✕</button></td></tr>`;
        }).join("")}</tbody></table></div>` : `<p class="muted">No classes yet.</p>`}
        <form class="row" data-add-classes="${t.id}" style="margin-top:12px"><div class="f" style="max-width:150px"><label>Add classes</label><input type="number" min="1" max="60" value="1" /></div>
          <button class="btn secondary">+ Add to ${esc(t.name)}</button></form></div>`).join("")}
      <div class="card"><h2>Add a term</h2><form id="fterm" class="row"><div class="f"><input id="t_nm" placeholder="e.g. Final Term" maxlength="40" required /></div><button class="btn secondary">+ Add term</button></form>
        <p class="muted small">Open <b>Start PIN</b> on the classroom screen. Students open the section link, type their ID and the PIN. Only one class per section can be open at a time.</p></div></div>`;
    $$("[data-add-classes]").forEach((f) => (f.onsubmit = async (e) => {
      e.preventDefault();
      const t = terms.find((x) => x.id === f.dataset.addClasses), n = Math.max(1, Math.min(60, +f.querySelector("input").value || 1));
      const start = t.classes.reduce((m, c) => Math.max(m, c.number), 0);
      try { await q(sb.from("classes").insert(Array.from({ length: n }, (_, k) => ({ term_id: t.id, number: start + k + 1 })))); renderSection(sec.id, "classes"); } catch (x) { fail(x); }
    }));
    $("#fterm").onsubmit = async (e) => {
      e.preventDefault();
      try { await q(sb.from("terms").insert({ section_id: sec.id, name: $("#t_nm").value.trim(), sort: terms.length + 1 })); renderSection(sec.id, "classes"); } catch (x) { fail(x); }
    };
    $$("[data-del-term]").forEach((b) => (b.onclick = async () => {
      if (!(await App.confirm("Delete term?", "All its classes and their attendance will be deleted."))) return;
      try { await q(sb.from("terms").delete().eq("id", b.dataset.delTerm)); renderSection(sec.id, "classes"); } catch (x) { fail(x); }
    }));
    $$("[data-del-class]").forEach((b) => (b.onclick = async () => {
      if (!(await App.confirm("Delete class?", "Its attendance records will be deleted too."))) return;
      try { await q(sb.from("classes").delete().eq("id", b.dataset.delClass)); renderSection(sec.id, "classes"); } catch (x) { fail(x); }
    }));
    $$("[data-edit-class]").forEach((b) => (b.onclick = async () => {
      const c = S.classes.find((x) => x.id === b.dataset.editClass);
      const dlg = await App.dialog({ title: `Edit ${App.classLabel(c.number)}`, okText: "Save", html: true,
        body: `<label>Class number</label><input id="e_no" type="number" min="1" max="200" value="${c.number}" />
          <div style="height:10px"></div><label>Topic / title (optional)</label><input id="e_tt" maxlength="120" value="${esc(c.title || "")}" />
          <div style="height:10px"></div><label>Date (optional)</label><input id="e_dt" type="date" value="${esc(c.class_date || "")}" />` });
      if (!dlg) return;
      try {
        await q(sb.from("classes").update({ number: +dlg.querySelector("#e_no").value, title: dlg.querySelector("#e_tt").value.trim() || null, class_date: dlg.querySelector("#e_dt").value || null }).eq("id", c.id));
        renderSection(sec.id, "classes");
      } catch (x) { fail(x); }
    }));
  }

  // ---------- Students tab
  function studentStats() {
    const { classes, byClass, held } = S;
    const heldC = classes.filter(held); const stats = {};
    S.students.forEach((s) => { const n = heldC.filter((c) => byClass[c.id]?.[s.student_id]).length; stats[s.student_id] = { n, of: heldC.length }; });
    return stats;
  }
  function tabStudents() {
    const { sec, students } = S, st = studentStats();
    $("#tab").innerHTML = `<div class="grid cols-2" style="grid-template-columns:2fr 1fr">
      <div class="card"><h2>Student list <span class="count">${students.length} students</span></h2>
        <div class="row" style="margin-bottom:10px"><div class="f"><input id="srch" placeholder="Search by ID or name…" /></div></div>
        <div class="table-wrap" style="max-height:560px"><table><thead><tr><th class="num">#</th><th>Student ID</th><th>Name</th><th class="num">Attendance</th><th></th></tr></thead>
        <tbody id="stb">${students.map((s, i) => `<tr data-q="${esc((s.student_id + " " + s.name).toLowerCase())}"><td class="num muted">${i + 1}</td><td><b>${esc(s.student_id)}</b></td><td>${esc(s.name)}</td>
          <td class="num">${st[s.student_id].of ? `${st[s.student_id].n}/${st[s.student_id].of} · ${pct(st[s.student_id].n, st[s.student_id].of)}%` : "—"}</td>
          <td style="text-align:right"><button class="icon-btn" data-del-stu="${s.id}" title="Remove">✕</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">No students yet — upload the list.</td></tr>`}</tbody></table></div>
      </div>
      <div class="grid" style="align-content:start">
        <div class="card"><h2>Upload student list</h2>
          <p class="small muted" style="margin-top:0">Excel (.xlsx / .xls) or CSV. The file needs a column for <b>Student ID</b> and one for <b>Name</b> — the university's "Valid Student List" works as it is.</p>
          <input type="file" id="upl" accept=".xlsx,.xls,.csv" />
        </div>
        <div class="card"><h2>Add one student</h2>
          <form id="fone"><label>Student ID</label><input id="o_id" placeholder="${esc(cfg.STUDENT_ID_EXAMPLE || "")}" maxlength="30" required />
            <div style="height:10px"></div><label>Name</label><input id="o_nm" maxlength="120" required />
            <div style="height:12px"></div><button class="btn">+ Add</button></form></div>
        ${students.length ? `<div class="card"><h2>Remove all</h2><p class="small muted" style="margin-top:0">Attendance already recorded stays in the database.</p>
          <button class="btn red" id="clr">Remove all students</button></div>` : ""}
      </div></div>`;
    $("#srch").oninput = (e) => { const v = e.target.value.toLowerCase(); $$("#stb tr").forEach((r) => (r.style.display = !v || (r.dataset.q || "").includes(v) ? "" : "none")); };
    $("#upl").onchange = (e) => e.target.files[0] && importStudents(e.target.files[0]);
    $("#fone").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await q(sb.from("students").upsert({ section_id: sec.id, student_id: normId($("#o_id").value), name: $("#o_nm").value.trim(), seq: students.length + 1 }, { onConflict: "section_id,student_id" }));
        App.toast("Student added"); renderSection(sec.id, "students");
      } catch (x) { fail(x); }
    };
    $$("[data-del-stu]").forEach((b) => (b.onclick = async () => {
      if (!(await App.confirm("Remove student?", "They will no longer be able to check in. Their past attendance stays.", "Remove"))) return;
      try { await q(sb.from("students").delete().eq("id", b.dataset.delStu)); renderSection(sec.id, "students"); } catch (x) { fail(x); }
    }));
    const clr = $("#clr"); if (clr) clr.onclick = async () => {
      if (!(await App.confirm("Remove all students?", "The whole student list for this section will be removed.", "Remove all"))) return;
      try { await q(sb.from("students").delete().eq("section_id", sec.id)); renderSection(sec.id, "students"); } catch (x) { fail(x); }
    };
  }
  const normId = (v) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

  async function importStudents(file) {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      const idRe = cfg.STUDENT_ID_PATTERN ? new RegExp(cfg.STUDENT_ID_PATTERN) : null;
      // find header row with an "ID" and a "Name" column; otherwise detect by content
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
      const dlg = await App.dialog({ title: "Import student list", okText: "Import", html: true,
        body: `<p>Found <b>${list.length}</b> students in <b>${esc(file.name)}</b> (${added} new${existing.size ? `, ${list.length - added} already on the list` : ""}).</p>
          <p class="small muted">First: ${esc(list[0].student_id)} — ${esc(list[0].name)}</p>
          ${missing ? `<label style="display:flex;gap:8px;align-items:center;font-size:13px;color:var(--ink)"><input type="checkbox" id="rep" style="width:auto" />
            Also remove the ${missing} students who are not in this file</label>` : ""}` });
      if (!dlg) return;
      const rows2 = list.map((s, k) => ({ section_id: S.sec.id, student_id: s.student_id, name: s.name, seq: k + 1 }));
      for (let i = 0; i < rows2.length; i += 500) await q(sb.from("students").upsert(rows2.slice(i, i + 500), { onConflict: "section_id,student_id" }));
      if (dlg.querySelector("#rep")?.checked) {
        const gone = S.students.filter((s) => !seen.has(s.student_id)).map((s) => s.id);
        for (let i = 0; i < gone.length; i += 100) await q(sb.from("students").delete().in("id", gone.slice(i, i + 100)));
      }
      App.toast(`Imported ${list.length} students`); renderSection(S.sec.id, "students");
    } catch (x) { fail(x); }
  }

  // ---------- Attendance tab (matrix with manual marking)
  function tabAttendance() {
    const { terms, students, byClass, held } = S;
    const sel = sessionStorage.getItem("att_term_" + S.sec.id) || "";
    const ts = terms.filter((t) => !sel || t.id === sel);
    const cols = ts.flatMap((t) => t.classes.map((c) => ({ t, c })));
    $("#tab").innerHTML = `<div class="card"><h2>Attendance sheet <span class="count">click a cell to mark present / absent</span></h2>
      <div class="row" style="margin-bottom:12px"><div class="f" style="max-width:240px"><label>Term</label><select id="tsel"><option value="">All terms</option>
        ${terms.map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>
        <div class="f"><input id="msr" placeholder="Search by ID or name…" /></div>
        <span class="small muted">✔ green = PIN check-in · ✔ blue = marked by you · ✘ = absent · grey = class not held yet</span></div>
      ${students.length && cols.length ? `<div class="table-wrap" style="max-height:620px"><table class="matrix"><thead>
        <tr><th class="sticky" rowspan="2">Student ID</th><th rowspan="2">Name</th>${ts.map((t) => t.classes.length ? `<th class="term" colspan="${t.classes.length}">${esc(t.name)}</th>` : "").join("")}<th rowspan="2" class="num">Present</th><th rowspan="2" class="num">%</th></tr>
        <tr>${cols.map(({ c }) => `<th class="num" title="${esc(c.title || "")}">${App.pad2(c.number)}</th>`).join("")}</tr></thead>
        <tbody id="mtb">${students.map((s) => {
          let n = 0, h = 0;
          const cells = cols.map(({ c }) => {
            const a = byClass[c.id]?.[s.student_id], isHeld = held(c); if (isHeld) h++; if (a) n++;
            return `<td class="cell ${a ? "p" + (a.source === "manual" ? " manual" : "") : isHeld ? "a" : "nh"}" data-c="${c.id}" data-s="${esc(s.student_id)}"
              title="${a ? esc((a.source === "manual" ? "Marked manually " : "Checked in ") + App.fmtDate(a.submitted_at)) : isHeld ? "Absent — click to mark present" : "Class not held — click to mark present"}">${a ? "✔" : isHeld ? "✘" : ""}</td>`;
          }).join("");
          const p = pct(n, h);
          return `<tr data-q="${esc((s.student_id + " " + s.name).toLowerCase())}"><td class="sticky"><b>${esc(s.student_id)}</b></td><td style="white-space:nowrap">${esc(s.name)}</td>${cells}
            <td class="num"><b>${n}</b>/${h}</td><td class="num ${h && p < 80 ? "low" : ""}">${h ? p + "%" : "—"}</td></tr>`;
        }).join("")}</tbody></table></div>` : `<p class="muted">Add students and classes first.</p>`}
      <div style="height:12px"></div><button class="btn green" id="xls2">⬇ Export Excel</button></div>`;
    $("#tsel").onchange = (e) => { sessionStorage.setItem("att_term_" + S.sec.id, e.target.value); tabAttendance(); };
    $("#msr").oninput = (e) => { const v = e.target.value.toLowerCase(); $$("#mtb tr").forEach((r) => (r.style.display = !v || r.dataset.q.includes(v) ? "" : "none")); };
    $("#xls2").onclick = () => exportExcel();
    $$("#mtb td.cell").forEach((td) => (td.onclick = () => toggleMark(td.dataset.c, td.dataset.s)));
  }

  async function toggleMark(classId, sid) {
    const a = S.byClass[classId]?.[sid], c = S.classes.find((x) => x.id === classId), stu = S.students.find((s) => s.student_id === sid);
    try {
      if (a) {
        if (a.source === "pin" && !(await App.confirm("Mark absent?", `${sid} checked in with the PIN at ${App.fmtDate(a.submitted_at)}. Remove this record?`, "Mark absent"))) return;
        await q(sb.from("attendance").delete().eq("id", a.id));
        delete S.byClass[classId][sid];
      } else {
        const row = await q(sb.from("attendance").insert({ class_id: classId, student_id: sid, student_name: stu?.name || "", source: "manual" }).select().single());
        (S.byClass[classId] ||= {})[sid] = row;
        if (!c.opened_at) { await q(sb.from("classes").update({ opened_at: new Date().toISOString() }).eq("id", classId)); c.opened_at = new Date().toISOString(); }
      }
      tabAttendance();
    } catch (x) { fail(x); }
  }

  // ---------- Settings tab
  function tabSettings() {
    const { sec } = S;
    $("#tab").innerHTML = `<div class="grid cols-2">
      <div class="card"><h2>Section details</h2><form id="fset">
        <label>Section</label><input id="st_nm" value="${esc(sec.name)}" maxlength="20" required />
        <div style="height:10px"></div><label>Class code</label><input id="st_cc" value="${esc(sec.class_code || "")}" maxlength="20" />
        <div style="height:14px"></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px;color:var(--ink)"><input type="checkbox" id="st_dev" style="width:auto" ${sec.one_device_per_class ? "checked" : ""} />
          One device per student per class (blocks a phone from checking in a second student)</label>
        <div style="height:14px"></div><button class="btn">Save</button></form></div>
      <div class="card"><h2>Student link</h2><p class="small muted" style="margin-top:0">Make a new link if the current one was shared outside the section. The old link stops working immediately.</p>
        <button class="btn amber" id="regen">Generate a new link</button>
        <div style="height:20px"></div><h2>Delete section</h2><p class="small muted" style="margin-top:0">Deletes the student list, all classes and all attendance of this section.</p>
        <button class="btn red" id="delsec">Delete this section</button></div></div>`;
    $("#fset").onsubmit = async (e) => {
      e.preventDefault();
      try { await q(sb.from("sections").update({ name: $("#st_nm").value.trim(), class_code: $("#st_cc").value.trim() || null, one_device_per_class: $("#st_dev").checked }).eq("id", sec.id)); App.toast("Saved"); renderSection(sec.id, "settings"); } catch (x) { fail(x); }
    };
    $("#regen").onclick = async () => {
      if (!(await App.confirm("Generate a new link?", "The current student link will stop working. Share the new one with the section.", "Generate"))) return;
      const tok = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
      try { await q(sb.from("sections").update({ public_token: tok }).eq("id", sec.id)); App.toast("New link created"); renderSection(sec.id, "settings"); } catch (x) { fail(x); }
    };
    $("#delsec").onclick = async () => {
      if (!(await App.confirm("Delete this section?", `${sec.course.code} Section ${sec.name}: the student list, classes and attendance will be deleted permanently.`))) return;
      try { await q(sb.from("sections").delete().eq("id", sec.id)); location.hash = ""; } catch (x) { fail(x); }
    };
  }

  // ------------------------------------------------------------------ Excel export
  function exportExcel() {
    const { sec, terms, students, byClass, held } = S;
    const wb = XLSX.utils.book_new();
    const info = [["Attendance export"], [], ["Course", `${sec.course.code} — ${sec.course.title}`], ["Section", sec.name], ["Class code", sec.class_code || ""],
      ["Intake", sec.intake.name], ["Exported", App.fmtDate(new Date())], ["Students", students.length], [],
      ["Each term sheet lists Student ID, Student Name, then one column per class: 1 = present, 0 = absent, blank = class not held yet."],
      ["Copy the class columns into the Portfolio's Mid/Final Overall sheet (Class-01 … or Week columns), matching students by Student ID."]];
    const wsI = XLSX.utils.aoa_to_sheet(info); wsI["!cols"] = [{ wch: 14 }, { wch: 60 }]; XLSX.utils.book_append_sheet(wb, wsI, "Info");

    terms.forEach((t) => {
      const hdr = ["Student ID", "Student Name", ...t.classes.map((c) => App.classLabel(c.number)), "Present", "Classes Held", "Attendance %"];
      const rows = students.map((s) => {
        let n = 0, h = 0;
        const v = t.classes.map((c) => { if (!held(c)) return ""; h++; const p = byClass[c.id]?.[s.student_id] ? 1 : 0; n += p; return p; });
        return [s.student_id, s.name, ...v, n, h, h ? +(n / h).toFixed(4) : ""];
      });
      const ws = XLSX.utils.aoa_to_sheet([hdr, ...rows]);
      ws["!cols"] = [{ wch: 13 }, { wch: 32 }, ...t.classes.map(() => ({ wch: 9 })), { wch: 9 }, { wch: 12 }, { wch: 13 }];
      const pc = XLSX.utils.encode_col(hdr.length - 1);
      for (let r = 2; r <= rows.length + 1; r++) { const cell = ws[`${pc}${r}`]; if (cell && cell.t === "n") cell.z = "0%"; }
      ws["!autofilter"] = { ref: `A1:${pc}${rows.length + 1}` };
      XLSX.utils.book_append_sheet(wb, ws, t.name.slice(0, 31));
    });

    const log = [["Term", "Class", "Class Title", "Class Date", "Student ID", "Student Name", "Recorded At", "Source", "Device"]];
    terms.forEach((t) => t.classes.forEach((c) => Object.values(byClass[c.id] || {}).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
      .forEach((a) => log.push([t.name, App.classLabel(c.number), c.title || "", c.class_date || "", a.student_id, a.student_name, App.fmtDate(a.submitted_at), a.source === "pin" ? "PIN" : "Manual", a.device_id ? a.device_id.slice(0, 8) : ""]))));
    const wsL = XLSX.utils.aoa_to_sheet(log); wsL["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 12 }, { wch: 13 }, { wch: 32 }, { wch: 22 }, { wch: 8 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsL, "Check-in Log");

    const safe = (x) => String(x).replace(/[^\w\-]+/g, "_");
    XLSX.writeFile(wb, `Attendance_${safe(sec.course.code)}_${safe(sec.intake.name)}_Sec-${safe(sec.name)}_${new Date().toLocaleDateString("en-CA")}.xlsx`);
  }

  // ------------------------------------------------------------------ router
  async function route() {
    if (!user) return renderLogin();
    const m = location.hash.match(/^#\/section\/([0-9a-f-]{36})(?:\/(\w+))?/);
    try { m ? await renderSection(m[1], m[2]) : await renderDashboard(); }
    catch (x) { fail(x); if (m) { location.hash = ""; } }
  }
  window.addEventListener("hashchange", route);
  sb.auth.onAuthStateChange((_e, session) => { const was = user?.id; user = session?.user || null; if (was !== user?.id) route(); });
  sb.auth.getSession().then(({ data }) => { user = data.session?.user || null; route(); });
})();
