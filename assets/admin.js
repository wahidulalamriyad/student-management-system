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

  let PROFILE = null;
  async function loadProfile() {
    if (!user) return (PROFILE = null);
    const { data } = await sb.from("faculty_profiles").select("*").eq("id", user.id).maybeSingle();
    PROFILE = data || { id: user.id, full_name: user.user_metadata?.full_name || "", email: user.email, research_interests: [], education: [], publications: [], links: {} };
    return PROFILE;
  }
  const myName = () => (PROFILE?.full_name || user?.user_metadata?.full_name || "").trim();

  function topbar() {
    const name = myName() || user?.email || "";
    return `<header class="topbar">
      <a class="brand" href="#/">${App.brand(cfg.INSTITUTION || "")}</a>
      <div class="spacer"></div>
      <a class="btn ghost sm" href="#/setup" title="Intakes & Courses">${icon("layers")}<span class="hide-sm">Intakes & Courses</span></a>
      ${App.theme.button()}
      <div class="menu-wrap"><button class="avatar-btn" id="me" title="${esc(name)}" aria-haspopup="menu">${App.avatar(PROFILE?.photo_url, name, 40)}</button></div>
    </header>`;
  }
  function bindTop() {
    const me = $("#me"); if (!me) return;
    me.onclick = (e) => {
      e.stopPropagation(); const w = me.parentElement, open = w.querySelector(".menu"); if (open) return open.remove();
      w.insertAdjacentHTML("beforeend", `<div class="menu" role="menu"><div class="who" style="display:flex;gap:12px;align-items:center">${App.avatar(PROFILE?.photo_url, myName() || user.email, 42)}
          <div style="min-width:0"><b style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(myName() || "Your Name")}</b><span class="muted xs" style="display:block;overflow:hidden;text-overflow:ellipsis">${esc(user.email)}</span></div></div>
        <a href="#/profile">${icon("user")} My Profile</a><a href="#/">${icon("grid")} All Sections</a><a href="#/setup">${icon("layers")} Intakes & Courses</a>
        <button data-m="pw">${icon("key")} Change Password</button><div class="sep"></div><button data-m="out" class="danger">${icon("logout")} Sign Out</button></div>`);
      const m = w.querySelector(".menu");
      m.onclick = async (ev) => { const b = ev.target.closest("[data-m]"); m.remove(); if (!b) return; if (b.dataset.m === "out") { await sb.auth.signOut(); PROFILE = null; location.hash = ""; } else changePassword(); };
      setTimeout(() => document.addEventListener("click", function h() { m.remove(); document.removeEventListener("click", h); }), 0);
    };
  }
  const page = (inner) => { root.innerHTML = topbar() + `<main class="container">${inner}</main>`; bindTop(); };

  async function changePassword(title = "Change Password") {
    const dlg = await App.dialog({ title, ic: "key", okText: "Save Password", html: true,
      body: `<label>New Password</label><input id="np1" type="password" autocomplete="new-password" minlength="8" />
        <div class="field-gap"></div><label>Repeat New Password</label><input id="np2" type="password" autocomplete="new-password" />
        <p class="hint">At least 8 characters, with letters and numbers.</p>`,
      validate: (m) => pwProblem(m.querySelector("#np1").value, m.querySelector("#np2").value) });
    if (!dlg) return;
    const { error } = await sb.auth.updateUser({ password: dlg.querySelector("#np1").value });
    error ? fail(error) : App.toast("Password Updated");
  }
  function pwProblem(a, b) {
    if (a.length < 8) return "Use at least 8 characters.";
    if (!/[A-Za-z]/.test(a) || !/\d/.test(a)) return "Use both letters and numbers.";
    if (b != null && a !== b) return "The two passwords do not match.";
    return null;
  }
  function pwScore(p) { let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^\w]/.test(p)) s++; return Math.min(4, s); }
  const isAiub = (e) => new RegExp(`@${(cfg.FACULTY_EMAIL_DOMAIN || "aiub.edu").replace(/\./g, "\\.")}$`, "i").test(e.trim());

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

  // ------------------------------------------------------------------ sign in / sign up
  function authShell(inner) {
    root.innerHTML = `<div class="corner">${App.theme.button()}</div><div class="auth">
      <aside class="auth-hero"><div class="auth-hero-in">
        <a class="brand brand-light" href="index.html">${App.brand(cfg.INSTITUTION || "")}</a>
        <div><h2>Attendance, Marks and Portfolios — in One Place.</h2>
          <ul class="auth-points"><li>${icon("smartphone")} Rotating-PIN Attendance in Seconds</li><li>${icon("book")} Gradebook That Matches Your Course Outline</li>
            <li>${icon("target")} Results, Grades and CO Attainment</li><li>${icon("user")} A Portfolio Every Student Can Open</li></ul></div>
        <p class="xs" style="opacity:.75;margin:0">© 2026 Wahidul Alam Riyad · Classfolio</p></div></aside>
      <section class="auth-main"><div class="login">${inner}</div></section></div>`;
  }
  function renderLogin(msg = "", email = "") {
    authShell(`<div class="card">${App.logoBig()}
      <h1>Welcome Back</h1><p class="muted" style="margin:6px 0 26px">Use your faculty account to continue.</p>
      <form id="lf" novalidate><label for="em">Email</label><input id="em" type="email" autocomplete="username" value="${esc(email)}" placeholder="name@aiub.edu" required />
      <div class="field-gap"></div><label for="pw">Password</label>
      <div class="search"><input id="pw" type="password" autocomplete="current-password" required style="padding-left:13px;padding-right:44px" />
        <button type="button" class="icon-btn" id="peek" style="position:absolute;right:4px;top:4px" aria-label="Show password">${icon("eye")}</button></div>
      <div class="row center-y" style="justify-content:space-between;margin:16px 0 22px">
        <label class="check-label"><input type="checkbox" id="rem" ${App.remember.get() ? "checked" : ""} /> Remember Me</label>
        <a href="#" id="forgot" class="small">Forgot Password?</a></div>
      <button class="btn lg block" id="lb">${icon("lock")} Sign In</button>
      ${msg ? `<div class="msg err">${icon("alert")}<div>${esc(msg)}</div></div>` : ""}</form></div>
      <p class="center small" style="margin-top:20px">New Faculty Member? <a href="#/signup"><b>Create an Account</b></a></p>
      <p class="center xs faint" style="margin-top:6px">Students: <a href="index.html">Open the Student Portal</a></p>`);
    $("#peek").onclick = () => { const p = $("#pw"); p.type = p.type === "password" ? "text" : "password"; $("#peek").innerHTML = icon(p.type === "password" ? "eye" : "eyeoff"); };
    $("#lf").onsubmit = async (e) => {
      e.preventDefault(); const em = $("#em").value.trim(), pw = $("#pw").value;
      if (!em || !pw) return renderLogin("Enter your email and password.", em);
      App.remember.set($("#rem").checked);
      const b = $("#lb"); b.disabled = true; b.innerHTML = `<span class="spinner" style="width:18px;height:18px"></span> Signing In…`;
      const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
      if (error) { renderLogin(/invalid login/i.test(error.message) ? "Wrong email or password." : /not confirmed/i.test(error.message) ? "Please confirm your email first — check your AIUB inbox for the link." : error.message, em); $("#pw").focus(); }
    };
    $("#forgot").onclick = async (e) => {
      e.preventDefault(); const em = $("#em").value.trim(); if (!em) { App.toast("Type Your Email First", true); return $("#em").focus(); }
      const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.href.split("#")[0] });
      error ? fail(error) : App.toast("Password Reset Email Sent — Check Your Inbox");
    };
    (email ? $("#pw") : $("#em")).focus();
  }
  function renderSignup(msg = "", v = {}) {
    const dom = cfg.FACULTY_EMAIL_DOMAIN || "aiub.edu";
    authShell(`<div class="card">${App.logoBig()}
      <h1>Create Your Faculty Account</h1><p class="muted" style="margin:6px 0 24px">Use your official <b>@${esc(dom)}</b> email address.</p>
      <form id="sf" novalidate>
        <label for="fn">Full Name</label><input id="fn" autocomplete="name" maxlength="120" value="${esc(v.fn || "")}" placeholder="e.g. Wahidul Alam Riyad" />
        <div class="field-gap"></div><label for="se">AIUB Email</label><input id="se" type="email" autocomplete="username" value="${esc(v.se || "")}" placeholder="name@${esc(dom)}" />
        <div class="field-gap"></div><label for="sp">Password</label>
        <div class="search"><input id="sp" type="password" autocomplete="new-password" style="padding-left:13px;padding-right:44px" />
          <button type="button" class="icon-btn" id="peek2" style="position:absolute;right:4px;top:4px" aria-label="Show password">${icon("eye")}</button></div>
        <div class="pw-meter" id="pwm"><span></span><span></span><span></span><span></span></div><p class="hint" id="pwh" style="margin-top:6px">At least 8 characters, with letters and numbers.</p>
        <div class="field-gap"></div><label for="sp2">Confirm Password</label><input id="sp2" type="password" autocomplete="new-password" />
        <div style="height:22px"></div><button class="btn lg block" id="sb">${icon("user")} Create Account</button>
        ${msg ? `<div class="msg err">${icon("alert")}<div>${esc(msg)}</div></div>` : ""}</form></div>
      <p class="center small" style="margin-top:20px">Already Have an Account? <a href="#/"><b>Sign In</b></a></p>`);
    const pw = $("#sp"), meter = $$("#pwm span"), labels = ["Too Short", "Weak", "Fair", "Good", "Strong"];
    pw.oninput = () => { const s = pw.value ? pwScore(pw.value) : -1; meter.forEach((m, i) => (m.className = i <= s - 1 || (s === 0 && i === 0 && pw.value) ? `on s${s}` : "")); $("#pwh").textContent = pw.value ? `Strength: ${labels[Math.max(0, s)]}` : "At least 8 characters, with letters and numbers."; };
    $("#peek2").onclick = () => { pw.type = pw.type === "password" ? "text" : "password"; $("#sp2").type = pw.type; $("#peek2").innerHTML = icon(pw.type === "password" ? "eye" : "eyeoff"); };
    $("#sf").onsubmit = async (e) => {
      e.preventDefault();
      const fn = App.nameCase($("#fn").value.replace(/\s+/g, " ").trim()), se = $("#se").value.trim().toLowerCase(), p1 = pw.value, p2 = $("#sp2").value, keep = { fn: $("#fn").value, se };
      if (fn.length < 3) return renderSignup("Enter your full name.", keep);
      if (!isAiub(se)) return renderSignup(`Use your official @${dom} email address.`, keep);
      const bad = pwProblem(p1, p2); if (bad) return renderSignup(bad, keep);
      const b = $("#sb"); b.disabled = true; b.innerHTML = `<span class="spinner" style="width:18px;height:18px"></span> Creating Account…`;
      const { data, error } = await sb.auth.signUp({ email: se, password: p1, options: { data: { full_name: fn }, emailRedirectTo: location.href.split("#")[0] } });
      if (error) return renderSignup(/database error|check_violation|aiub/i.test(error.message) ? `Use your official @${dom} email address.` : /registered|exists/i.test(error.message) ? "An account with this email already exists. Sign in instead." : /signups? not allowed|disabled/i.test(error.message) ? "New sign-ups are turned off. Ask the administrator to allow sign-ups in Supabase." : error.message, keep);
      if (data.session) { App.toast("Welcome to Classfolio!"); location.hash = "#/profile"; return; }
      authShell(`<div class="card center"><div style="display:flex;justify-content:center">${App.logoBig()}</div>
        <h1>Check Your Email</h1><p class="muted" style="margin:10px 0 22px">We sent a confirmation link to <b>${esc(se)}</b>. Open it to activate your account, then sign in.</p>
        <a class="btn lg block" href="#/">${icon("lock")} Go to Sign In</a></div>`);
    };
    $("#fn").focus();
  }

  // ------------------------------------------------------------------ my profile
  const LINKS = [["aiub", "AIUB Profile", "https://aiub.edu/faculty-list/faculty-profile?q=…"], ["website", "Personal Website", "https://"], ["scholar", "Google Scholar", "https://scholar.google.com/citations?user=…"],
    ["researchgate", "ResearchGate", "https://www.researchgate.net/profile/…"], ["orcid", "ORCID", "https://orcid.org/0000-…"], ["linkedin", "LinkedIn", "https://www.linkedin.com/in/…"],
    ["github", "GitHub", "https://github.com/…"], ["facebook", "Facebook", "https://facebook.com/…"], ["x", "X (Twitter)", "https://x.com/…"], ["youtube", "YouTube", "https://youtube.com/@…"]];
  const DESIGNATIONS = ["Lecturer", "Senior Lecturer", "Assistant Professor", "Associate Professor", "Professor", "Adjunct Faculty", "Visiting Faculty", "Teaching Assistant"];
  const safeUrl = (u) => { u = String(u || "").trim(); if (!u) return ""; if (!/^https?:\/\//i.test(u)) u = "https://" + u; try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };

  async function renderProfile() {
    page(loading()); await loadProfile();
    const P = JSON.parse(JSON.stringify(PROFILE)); P.research_interests ||= []; P.education ||= []; P.publications ||= []; P.links ||= {};
    if (P.aiub_profile_url && !P.links.aiub) P.links.aiub = P.aiub_profile_url;
    if (!P.email) P.email = user.email;
    const draw = () => {
      page(`<div class="crumbs"><a href="#/">${icon("back")} All Sections</a></div>
      <div class="page-head"><div><h1>My Profile</h1><p class="muted" style="margin:6px 0 0">Students see your photo, name, research interests, bio and links in the Student Portal.</p></div>
        <div class="actions"><button class="btn" id="psave">${icon("check")} Save Profile</button></div></div>
      <div class="grid side">
        <div class="stack">
          <div class="card"><div class="card-head"><div><h2>Profile Photo</h2><div class="sub">A clear, front-facing photo. JPG, PNG or WebP, up to 2 MB.</div></div></div>
            <div class="row center-y" style="gap:22px">${App.avatar(P.photo_url, P.full_name, 112, "xl")}
              <div class="stack-sm"><div class="btn-group"><button class="btn secondary" id="pup">${icon("camera")} ${P.photo_url ? "Change Photo" : "Upload Photo"}</button>
                ${P.photo_url ? `<button class="btn ghost" id="pdel">${icon("trash")} Remove</button>` : ""}</div>
                <span class="hint" style="margin:0">It is cropped to a square automatically.</span></div></div>
            <input type="file" id="pfile" accept="image/jpeg,image/png,image/webp" class="hidden" /></div>
          <div class="card"><div class="card-head"><div><h2>Basic Information</h2></div></div>
            <div class="grid cols-2">
              <div><label>Full Name</label><input data-k="full_name" maxlength="120" value="${esc(P.full_name || "")}" /></div>
              <div><label>Designation</label><input data-k="designation" list="desig" maxlength="80" value="${esc(P.designation || "")}" placeholder="e.g. Lecturer" /></div>
              <div><label>Department</label><input data-k="department" list="depts" maxlength="120" value="${esc(P.department || "")}" placeholder="e.g. Department of Computer Science" /></div>
              <div><label>Faculty</label><input data-k="faculty_name" list="facs" maxlength="120" value="${esc(P.faculty_name || "")}" placeholder="e.g. Faculty of Science and Technology" /></div>
              <div><label>Contact Email <span class="faint">(Shown to Students)</span></label><input data-k="email" type="email" maxlength="160" value="${esc(P.email || "")}" /></div>
              <div><label>Room</label><input data-k="room" maxlength="80" value="${esc(P.room || "")}" placeholder="e.g. Room D0412, Annex 4" /></div>
              <div><label>Consultation Hours</label><input data-k="consultation" maxlength="300" value="${esc(P.consultation || "")}" placeholder="e.g. Sun & Tue, 11:00 AM – 1:00 PM" /></div>
              <div><label>Phone <span class="faint">(Private — Never Shown to Students)</span></label><input data-k="phone" maxlength="40" value="${esc(P.phone || "")}" /></div></div>
            <datalist id="desig">${DESIGNATIONS.map((d) => `<option value="${d}">`).join("")}</datalist>
            <datalist id="depts"><option value="Department of Computer Science"><option value="Department of Computer Engineering"><option value="Department of Software Engineering"><option value="Department of Information Technology"><option value="Department of Data Science"></datalist>
            <datalist id="facs"><option value="Faculty of Science and Technology"><option value="Faculty of Engineering"><option value="Faculty of Business Administration"><option value="Faculty of Arts and Social Sciences"></datalist></div>
          <div class="card"><div class="card-head"><div><h2>About</h2></div></div>
            <label>Bio</label><textarea data-k="bio" maxlength="3000" style="min-height:140px" placeholder="A short introduction — your teaching, background and what students can expect.">${esc(P.bio || "")}</textarea>
            <div class="hint" style="text-align:right" id="biocount">${(P.bio || "").length} / 3000</div>
            <div class="field-gap"></div><label>Research Interests</label>
            <div class="tags" id="tags">${P.research_interests.map((t, i) => `<span class="tag">${esc(t)}<button type="button" data-tdel="${i}" aria-label="Remove">${icon("x")}</button></span>`).join("")}
              <input id="tagin" placeholder="${P.research_interests.length ? "Add Another…" : "Type an Interest and Press Enter"}" maxlength="60" /></div>
            <p class="hint">Press Enter or comma after each one, e.g. Web Security, Human-Computer Interaction.</p></div>
          <div class="card"><div class="card-head"><div><h2>Education</h2></div><button class="btn sm secondary" id="eadd">${icon("plus")} Add Degree</button></div>
            <div class="stack-sm">${P.education.map((e, i) => `<div class="rowcard" data-ei="${i}"><input data-e="degree" value="${esc(e.degree || "")}" placeholder="Degree, e.g. MSc in Computer Science" />
              <input data-e="institution" value="${esc(e.institution || "")}" placeholder="Institution" /><input data-e="year" value="${esc(e.year || "")}" placeholder="Year" style="max-width:96px" />
              <button class="icon-btn danger" data-edel="${i}">${icon("trash")}</button></div>`).join("") || `<p class="muted small" style="margin:0">No degrees added yet.</p>`}</div></div>
          <div class="card"><div class="card-head"><div><h2>Selected Publications</h2><div class="sub">Optional — Up to 20</div></div><button class="btn sm secondary" id="padd">${icon("plus")} Add Publication</button></div>
            <div class="stack-sm">${P.publications.map((e, i) => `<div class="rowcard" data-pi="${i}"><input data-p="title" value="${esc(e.title || "")}" placeholder="Title" style="flex:2" />
              <input data-p="venue" value="${esc(e.venue || "")}" placeholder="Journal / Conference" /><input data-p="year" value="${esc(e.year || "")}" placeholder="Year" style="max-width:86px" />
              <input data-p="url" value="${esc(e.url || "")}" placeholder="Link (https://…)" /><button class="icon-btn danger" data-pdel="${i}">${icon("trash")}</button></div>`).join("") || `<p class="muted small" style="margin:0">No publications added yet.</p>`}</div></div>
          <div class="card"><div class="card-head"><div><h2>Links</h2><div class="sub">Shown to Students as Buttons</div></div></div>
            <div class="grid cols-2">${LINKS.map(([k, l, ph]) => `<div><label>${l}</label><input data-l="${k}" value="${esc(P.links[k] || "")}" placeholder="${esc(ph)}" inputmode="url" /></div>`).join("")}</div></div>
        </div>
        <div class="stack sticky-col"><div class="card"><div class="card-head" style="margin-bottom:14px"><div><h2>How Students See You</h2><div class="sub">Live Preview</div></div></div><div id="pprev"></div></div></div>
      </div>
      <div class="savebar"><span class="muted small" id="pdirty">All changes saved</span><button class="btn" id="psave2">${icon("check")} Save Profile</button></div>`);
      bind();
    };
    let dirty = false;
    const mark = () => { dirty = true; const d = $("#pdirty"); if (d) d.innerHTML = `${icon("alert")} Unsaved changes`; preview(); };
    const collect = () => {
      $$("[data-k]").forEach((el) => (P[el.dataset.k] = el.value.trim()));
      $$("[data-l]").forEach((el) => (P.links[el.dataset.l] = el.value.trim()));
      P.education = $$("[data-ei]").map((r) => ({ degree: r.querySelector("[data-e=degree]").value.trim(), institution: r.querySelector("[data-e=institution]").value.trim(), year: r.querySelector("[data-e=year]").value.trim() }));
      P.publications = $$("[data-pi]").map((r) => ({ title: r.querySelector("[data-p=title]").value.trim(), venue: r.querySelector("[data-p=venue]").value.trim(), year: r.querySelector("[data-p=year]").value.trim(), url: r.querySelector("[data-p=url]").value.trim() }));
    };
    const preview = () => { collect(); const el = $("#pprev"); if (el) el.innerHTML = Grade.facultyCard(publicView(P), { compact: false }); };
    const bind = () => {
      $$("[data-k],[data-l],[data-e],[data-p]").forEach((el) => el.addEventListener("input", mark));
      $("[data-k=bio]").addEventListener("input", (e) => ($("#biocount").textContent = `${e.target.value.length} / 3000`));
      const tin = $("#tagin");
      tin.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === ",") && tin.value.trim()) { e.preventDefault(); collect(); const v = App.nameCase(tin.value.replace(/,/g, "").trim()); if (P.research_interests.length < 15 && !P.research_interests.includes(v)) P.research_interests.push(v); dirty = true; draw(); $("#tagin").focus(); }
        if (e.key === "Backspace" && !tin.value && P.research_interests.length) { collect(); P.research_interests.pop(); dirty = true; draw(); $("#tagin").focus(); }
      });
      $$("[data-tdel]").forEach((b) => (b.onclick = () => { collect(); P.research_interests.splice(+b.dataset.tdel, 1); dirty = true; draw(); }));
      $("#eadd").onclick = () => { collect(); P.education.push({ degree: "", institution: "", year: "" }); dirty = true; draw(); };
      $$("[data-edel]").forEach((b) => (b.onclick = () => { collect(); P.education.splice(+b.dataset.edel, 1); dirty = true; draw(); }));
      $("#padd").onclick = () => { collect(); if (P.publications.length >= 20) return App.toast("Up to 20 Publications", true); P.publications.push({ title: "", venue: "", year: "", url: "" }); dirty = true; draw(); };
      $$("[data-pdel]").forEach((b) => (b.onclick = () => { collect(); P.publications.splice(+b.dataset.pdel, 1); dirty = true; draw(); }));
      $("#pup").onclick = () => $("#pfile").click();
      $("#pfile").onchange = (e) => e.target.files[0] && uploadPhoto(e.target.files[0]);
      const pd = $("#pdel"); if (pd) pd.onclick = async () => { if (!(await App.confirm("Remove your photo?", "Students will see your initials instead.", "Remove"))) return; collect(); await removePhoto(P.photo_url); P.photo_url = null; await save(true); };
      $("#psave").onclick = () => save(); $("#psave2").onclick = () => save();
      if (dirty) { const d = $("#pdirty"); d.innerHTML = `${icon("alert")} Unsaved changes`; }
      preview();
    };
    async function uploadPhoto(file) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return App.toast("Use a JPG, PNG or WebP Image", true);
      if (file.size > 8 * 1024 * 1024) return App.toast("That image is too large (max 8 MB before resizing)", true);
      try {
        App.toast("Uploading Photo…");
        const blob = await squareImage(file, 512), path = `${user.id}/avatar-${Date.now()}.webp`;
        const up = await sb.storage.from("avatars").upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
        if (up.error) throw up.error;
        const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
        const old = P.photo_url; collect(); P.photo_url = url; await save(true); if (old) removePhoto(old);
      } catch (x) { fail(x); }
    }
    async function removePhoto(url) {
      const m = String(url || "").match(/\/avatars\/(.+)$/); if (!m) return;
      try { await sb.storage.from("avatars").remove([decodeURIComponent(m[1].split("?")[0])]); } catch {}
    }
    async function save(quiet = false) {
      collect();
      if (!P.full_name || P.full_name.length < 3) return App.toast("Enter Your Full Name", true);
      const links = {}; for (const [k] of LINKS) { const u = safeUrl(P.links[k]); if (P.links[k] && !u) return App.toast(`Check the ${LINKS.find((x) => x[0] === k)[1]} link`, true); if (u) links[k] = u; }
      const row = { id: user.id, full_name: App.nameCase(P.full_name), designation: P.designation || null, department: P.department || null, faculty_name: P.faculty_name || null,
        email: P.email || null, phone: P.phone || null, room: P.room || null, consultation: P.consultation || null, bio: P.bio || null,
        research_interests: P.research_interests.slice(0, 15), education: P.education.filter((e) => e.degree || e.institution).slice(0, 10),
        publications: P.publications.filter((e) => e.title).map((e) => ({ ...e, url: safeUrl(e.url) })).slice(0, 20), links, photo_url: P.photo_url || null, aiub_profile_url: links.aiub || null, updated_at: new Date().toISOString() };
      try {
        await q(sb.from("faculty_profiles").upsert(row, { onConflict: "id" }));
        if (row.full_name !== user.user_metadata?.full_name) sb.auth.updateUser({ data: { full_name: row.full_name } });
        PROFILE = row; Object.assign(P, row); dirty = false; draw(); App.toast(quiet ? "Photo Updated" : "Profile Saved");
      } catch (x) { fail(x); }
    }
    draw();
  }
  // what the student portal shows (never the phone number)
  const publicView = (p) => ({ name: p.full_name, designation: p.designation, department: p.department, faculty_name: p.faculty_name, email: p.email, room: p.room, consultation: p.consultation,
    bio: p.bio, research_interests: p.research_interests, education: p.education, publications: p.publications, links: p.links, photo_url: p.photo_url, aiub_profile_url: p.links?.aiub || p.aiub_profile_url });
  async function squareImage(file, size) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement("canvas"); c.width = c.height = Math.min(size, s);
    c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    return await new Promise((res) => c.toBlob((b) => res(b), "image/webp", 0.88));
  }

  // ------------------------------------------------------------------ data for the dashboard
  async function loadAll() {
    const [intakes, courses, sections, terms, classes, students, att] = await Promise.all([
      q(sb.from("intakes").select("*").order("created_at", { ascending: false })),
      q(sb.from("courses").select("*").order("code")),
      q(sb.from("sections").select("id, name, class_code, created_at, min_attendance_pct, portfolio_published, intake:intakes(id, name), course:courses(id, code, title)").order("created_at", { ascending: false })),
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
    const hello = hour < 5 ? "Good Evening" : hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

    page(`
      <div class="page-head"><div><div class="eyebrow">${icon("calendar")} ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: cfg.TIME_ZONE || undefined })}</div>
        <h1>${hello} 👋</h1></div>
        <div class="actions"><a class="btn secondary" href="#/setup">${icon("layers")} Intakes & Courses</a><button class="btn" id="newsec">${icon("plus")} New Section</button></div></div>
      ${live.map((s) => `<div class="live" style="margin-bottom:16px"><span class="live-dot"></span><div class="grow"><b>Attendance Is Open</b> · ${esc(s.course.code)} Section ${esc(s.name)} — ${App.classLabel(st[s.id].open.number)}</div>
        <a class="btn green sm" href="pin.html?class=${st[s.id].open.id}" target="_blank" rel="noopener">${icon("external")} PIN Screen</a></div>`).join("")}
      <div class="stats">
        <div class="stat"><div class="ic">${icon("grid")}</div><div><div class="k">Sections</div><div class="v">${sections.length}</div></div></div>
        <div class="stat"><div class="ic violet">${icon("users")}</div><div><div class="k">Students</div><div class="v">${D.totals.students}</div></div></div>
        <div class="stat"><div class="ic amber">${icon("calendar")}</div><div><div class="k">Classes Held</div><div class="v">${D.totals.held}</div></div></div>
        <div class="stat"><div class="ic green">${icon("chart")}</div><div><div class="k">Average Attendance</div><div class="v">${allAvg == null ? "—" : allAvg + "%"}</div></div></div>
      </div>
      <div style="height:32px"></div>
      ${sections.length ? `
      <div class="card-head"><div><h2>Your Sections</h2><div class="sub">Open a section to take attendance, manage students and export to Excel.</div></div>
        <div class="row center-y"><div class="search" style="width:240px">${icon("search")}<input id="dq" placeholder="Search Course or Section" value="${esc(qy)}" /></div>
        <select id="flt" style="width:auto;min-width:170px"><option value="">All Intakes</option>${intakes.map((i) => `<option value="${i.id}" ${i.id === filter ? "selected" : ""}>${esc(i.name)}</option>`).join("")}</select></div></div>
      <div class="sec-grid" id="secs">${sections.map((s) => { const x = st[s.id]; return `
        <a class="sec-card" href="#/section/${s.id}" data-intake="${s.intake.id}" data-q="${esc((s.course.code + " " + s.course.title + " " + s.name + " " + s.intake.name).toLowerCase())}">
          <div class="top"><div class="grow"><div class="code">${esc(s.course.code)}${s.class_code ? ` · ${esc(s.class_code)}` : ""}</div><div class="title">${esc(s.course.title)}</div></div>
            <div class="sec-letter" title="Section">${esc(s.name)}</div></div>
          <div class="meta"><span>${icon("calendar")} ${esc(s.intake.name)}</span><span>${icon("users")} ${x.students} students</span><span>${icon("check")} ${x.held}/${x.classes} held</span></div>
          <div class="foot">${x.open ? `<span class="badge green"><span class="dot"></span> Open Now</span>` : s.portfolio_published ? `<span class="badge blue" title="Portfolio Published">${icon("eye")}</span>` : ""}
            ${App.progress(x.avg, s.min_attendance_pct)}<b class="${App.pctClass(x.avg, s.min_attendance_pct)}">${x.avg == null ? "—" : x.avg + "%"}</b></div></a>`; }).join("")}</div>
      <div class="empty hidden" id="noresult"><h3>No Matching Sections</h3><p>Try a different search or intake.</p></div>`
      : `<div class="card"><div class="empty"><div class="ic">${icon("zap")}</div><h3>Let's Set Up Your First Section</h3>
          <p>Create a section for a course you teach. You can add the intake and course right in the same form, then upload the student list.</p>
          <button class="btn" id="newsec2">${icon("plus")} New Section</button></div>
          <div class="grid cols-3" style="margin-top:8px">${[["1", "Create a Section", "Intake, course, section letter and number of classes."], ["2", "Upload Students", "Drop in the university's Valid Student List (.xlsx)."], ["3", "Start a PIN", "Open the PIN screen in class and share the section link."]]
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
    const dlg = await App.dialog({ title: "New Section", ic: "plus", okText: "Create Section", html: true, wide: true,
      body: `<div class="grid cols-2">
        <div><label>Intake</label><select id="ns_in">${intakes.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}<option value="__new">+ New Intake…</option></select>
          <input id="ns_in_new" class="hidden" style="margin-top:8px" placeholder="e.g. Fall 2026-27" maxlength="60" /></div>
        <div><label>Course</label><select id="ns_co">${courses.map((c) => `<option value="${c.id}">${esc(c.code)} — ${esc(c.title)}</option>`).join("")}<option value="__new">+ New Course…</option></select>
          <div id="ns_co_new" class="row hidden" style="margin-top:8px"><input id="ns_cc" placeholder="CSC 3215" maxlength="20" style="flex:0 0 120px" /><input id="ns_ct" class="grow" placeholder="Web Technologies" maxlength="120" /></div></div>
        <div><label>Section</label><input id="ns_nm" placeholder="e.g. R" maxlength="20" /></div>
        <div><label>Class Code <span class="faint">(Optional)</span></label><input id="ns_code" placeholder="e.g. 01553" maxlength="20" /></div>
        <div><label>Classes per Term</label><input id="ns_n" type="number" min="0" max="60" value="12" /><p class="hint">A <b>Mid Term</b> and a <b>Final Term</b> are created with this many classes each.</p></div>
        <div><label>Minimum Attendance</label><input id="ns_min" type="number" min="0" max="100" value="80" /><p class="hint">Students below this % are flagged as at risk.</p></div>
        <div><label>Instructor <span class="faint">(Shown to Students)</span></label><input id="ns_ins" maxlength="120" value="${esc(myName() || (() => { try { return localStorage.getItem("att_instructor") || ""; } catch { return ""; } })())}" placeholder="e.g. Wahidul Alam Riyad" /></div>
        <div><label>Assessment Plan</label><select id="ns_plan"><option value="">Set up later</option>${Object.entries(Grade.PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select><p class="hint">Quizzes, exams, weights and COs — editable later.</p></div></div>`,
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
      const ins = v("#ns_ins"); try { localStorage.setItem("att_instructor", ins); } catch {}
      const sec = await q(sb.from("sections").insert({ intake_id: intakeId, course_id: courseId, name: v("#ns_nm"), class_code: v("#ns_code") || null, instructor: ins || null,
        min_attendance_pct: Math.max(0, Math.min(100, +v("#ns_min") || 80)) }).select().single());
      const n = Math.max(0, Math.min(60, +v("#ns_n") || 0)), pre = Grade.PRESETS[v("#ns_plan")];
      const terms = (await q(sb.from("terms").insert([{ section_id: sec.id, name: "Mid Term", sort: 1, weight: pre ? pre.termWeights[0] : 40 }, { section_id: sec.id, name: "Final Term", sort: 2, weight: pre ? pre.termWeights[1] : 60 }]).select())).sort((a, b) => a.sort - b.sort);
      if (n) await q(sb.from("classes").insert(terms.flatMap((t) => Array.from({ length: n }, (_, k) => ({ term_id: t.id, number: k + 1 })))));
      if (pre) {
        await q(sb.from("assessments").insert(pre.plan.map((x, i) => ({ section_id: sec.id, term_id: terms[x.term].id, name: x.name, grp: x.grp || null, rule: x.rule || "sum", kind: x.kind || "marks",
          max_marks: x.max_marks, weight: x.weight, co: x.co || null, by_group: !!x.by_group, visible: true, sort: i + 1 }))));
        const course = (await q(sb.from("courses").select("id, cos").eq("id", courseId).single()));
        if (pre.cos.length && !(course.cos || []).length) await q(sb.from("courses").update({ cos: pre.cos }).eq("id", courseId));
      }
      App.toast("Section Created — Now Upload the Student List"); go(`#/section/${sec.id}/students`);
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
    page(`<div class="crumbs"><a href="#/">${icon("back")} All Sections</a></div>
      <div class="page-head"><div><h1>Intakes & Courses</h1><p class="muted" style="margin:6px 0 0">The building blocks for your sections. Deleting one also deletes its sections.</p></div></div>
      <div class="grid cols-2">
        <div class="card"><div class="card-head"><div><h2>Intakes</h2><div class="sub">e.g. Fall 2026-27, Spring 2026-27</div></div></div>
          <form id="fin" class="row" style="margin-bottom:14px"><div class="f"><input id="in_nm" placeholder="New Intake Name" maxlength="60" required /></div><button class="btn">${icon("plus")} Add</button></form>
          <ul class="list">${intakes.map((i) => `<li><span class="grow"><b>${esc(i.name)}</b></span><span class="badge">${nI(i.id)} sections</span>
            <button class="icon-btn" data-ren-intake="${i.id}" data-name="${esc(i.name)}" title="Rename">${icon("edit")}</button>
            <button class="icon-btn danger" data-del-intake="${i.id}" title="Delete">${icon("trash")}</button></li>`).join("") || `<li class="muted">No intakes yet.</li>`}</ul></div>
        <div class="card"><div class="card-head"><div><h2>Courses</h2><div class="sub">Course Code and Title</div></div></div>
          <form id="fco" class="row" style="margin-bottom:14px"><div class="f" style="flex:0 0 130px;min-width:110px"><input id="co_cd" placeholder="CSC 3215" maxlength="20" required /></div>
            <div class="f"><input id="co_tt" placeholder="Web Technologies" maxlength="120" required /></div><button class="btn">${icon("plus")} Add</button></form>
          <ul class="list">${courses.map((c) => `<li><span class="code">${esc(c.code)}</span><span class="grow">${esc(c.title)}</span><span class="badge">${nC(c.id)}</span>
            <button class="icon-btn" data-ren-course="${c.id}" title="Edit">${icon("edit")}</button>
            <button class="icon-btn danger" data-del-course="${c.id}" title="Delete">${icon("trash")}</button></li>`).join("") || `<li class="muted">No courses yet.</li>`}</ul></div></div>`);
    $("#fin").onsubmit = async (e) => { e.preventDefault(); try { await q(sb.from("intakes").insert({ name: $("#in_nm").value.trim() })); App.toast("Intake Added"); renderSetup(); } catch (x) { fail(x); } };
    $("#fco").onsubmit = async (e) => { e.preventDefault(); try { await q(sb.from("courses").insert({ code: $("#co_cd").value.trim(), title: $("#co_tt").value.trim() })); App.toast("Course Added"); renderSetup(); } catch (x) { fail(x); } };
    $$("[data-ren-intake]").forEach((b) => (b.onclick = async () => {
      const d = await App.dialog({ title: "Rename Intake", ic: "edit", okText: "Save", html: true, body: `<label>Name</label><input id="rn" maxlength="60" value="${b.dataset.name}" />` });
      if (d) try { await q(sb.from("intakes").update({ name: d.querySelector("#rn").value.trim() }).eq("id", b.dataset.renIntake)); renderSetup(); } catch (x) { fail(x); }
    }));
    $$("[data-ren-course]").forEach((b) => (b.onclick = async () => {
      const c = courses.find((x) => x.id === b.dataset.renCourse);
      const d = await App.dialog({ title: "Edit Course", ic: "edit", okText: "Save", html: true,
        body: `<label>Course Code</label><input id="rc" maxlength="20" value="${esc(c.code)}" /><div class="field-gap"></div><label>Title</label><input id="rt" maxlength="120" value="${esc(c.title)}" />` });
      if (d) try { await q(sb.from("courses").update({ code: d.querySelector("#rc").value.trim(), title: d.querySelector("#rt").value.trim() }).eq("id", c.id)); renderSetup(); } catch (x) { fail(x); }
    }));
    $$("[data-del-intake]").forEach((b) => (b.onclick = async () => {
      if (!(await App.confirm("Delete This Intake?", "Every section in this intake — with its students, classes and attendance — will be permanently deleted."))) return;
      try { await q(sb.from("intakes").delete().eq("id", b.dataset.delIntake)); App.toast("Intake Deleted"); renderSetup(); } catch (x) { fail(x); }
    }));
    $$("[data-del-course]").forEach((b) => (b.onclick = async () => {
      if (!(await App.confirm("Delete This Course?", "Every section of this course — with its students, classes and attendance — will be permanently deleted."))) return;
      try { await q(sb.from("courses").delete().eq("id", b.dataset.delCourse)); App.toast("Course Deleted"); renderSetup(); } catch (x) { fail(x); }
    }));
  }

  // ------------------------------------------------------------------ section data
  let S = null;              // current section data
  const UI = {};             // per-section view state (search, filters)
  async function loadSection(id) {
    const sec = await q(sb.from("sections").select("*, intake:intakes(id, name), course:courses(*)").eq("id", id).single());
    const terms = await q(sb.from("terms").select("*").eq("section_id", id).order("sort").order("name"));
    const termIds = terms.map((t) => t.id);
    const classes = termIds.length ? await App.fetchAll(() => sb.from("classes").select("*").in("term_id", termIds).order("number")) : [];
    const students = (await App.fetchAll(() => sb.from("students").select("*").eq("section_id", id).order("seq").order("student_id"))).map(properStu);
    S = { sec, terms, classes, students, att: [], byClass: {}, assess: [], marks: {}, groups: [], members: [] };
    await Promise.all([loadAttendance(), loadMarks(), loadGroups()]);
    UI[id] ||= { q: "", filter: "all", sort: "seq", term: "", logClass: "", logSrc: "", riskOnly: false, mterm: "", rsort: "seq" };
  }
  const properStu = (s) => ((s.name = App.nameCase(s.name)), s);
  async function loadAttendance() {
    const ids = S.classes.map((c) => c.id); let att = [];
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80);
      att = att.concat(await App.fetchAll(() => sb.from("attendance").select("id, class_id, student_id, student_name, submitted_at, source, device_id, status, note").in("class_id", chunk).order("id")));
    }
    att.forEach((a) => (a.student_name = App.nameCase(a.student_name)));
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
    const scrollY = scrollY_(), kw = $(".table-wrap.keep"), wrapScroll = kw && drawSection.tab === curTab + sec.id ? [kw.scrollLeft, kw.scrollTop] : null;
    drawSection.tab = curTab + sec.id;
    const tabs = [["overview", "Overview", "chart"], ["classes", "Classes", "calendar", classes.length], ["students", "Students", "users", students.length], ["sheet", "Attendance", "grid"],
      ["marks", "Marks", "book", S.assess.length || null], ["groups", "Groups", "layers", S.groups.length || null], ["results", "Results", "target"], ["log", "Check-In Log", "list", S.att.length], ["settings", "Settings", "settings"]];
    page(`<div class="crumbs"><a href="#/">${icon("back")} All Sections</a></div>
      <div class="page-head"><div><div class="eyebrow"><span class="badge blue">${esc(sec.course.code)}</span>${sec.class_code ? `<span>Class Code ${esc(sec.class_code)}</span><span>·</span>` : ""}<span>${esc(sec.intake.name)}</span><span>·</span><span class="badge ${sec.portfolio_published ? "green" : ""}" title="Student Portfolio">${icon(sec.portfolio_published ? "eye" : "eyeoff")} Portfolio ${sec.portfolio_published ? "Published" : "Not Published"}</span></div>
        <h1>${esc(sec.course.title)} <span class="muted" style="font-weight:600">· Section ${esc(sec.name)}</span></h1></div>
        <div class="actions"><button class="btn secondary" id="share">${icon("qr")} Student Portal</button>
          <button class="btn secondary" id="xls">${icon("download")} Export Excel</button>
          ${nextC ? `<a class="btn ${open ? "green" : ""}" href="pin.html?class=${nextC.id}" target="_blank" rel="noopener">${icon(open ? "external" : "play")} ${open ? "Open PIN Screen" : `Start ${App.classLabel(nextC.number)}`}</a>` : ""}</div></div>
      ${open ? `<div class="live" style="margin-bottom:20px"><span class="live-dot"></span><div class="grow"><b>Attendance Is Open</b> for ${esc(openTerm.name)} · ${App.classLabel(open.number)} — ${Object.keys(recs(open.id)).length} of ${students.length} checked in</div>
        <button class="btn sm secondary" id="refresh">${icon("refresh")} Refresh</button></div>` : ""}
      <div class="stats">
        <div class="stat"><div class="ic violet">${icon("users")}</div><div><div class="k">Students</div><div class="v">${students.length}</div></div></div>
        <div class="stat"><div class="ic">${icon("calendar")}</div><div><div class="k">Classes Held</div><div class="v">${X.held.length}<small> / ${classes.length}</small></div></div></div>
        <div class="stat"><div class="ic green">${icon("chart")}</div><div><div class="k">Average Attendance</div><div class="v ${App.pctClass(X.avg, X.min)}">${X.avg == null ? "—" : X.avg + "%"}</div></div></div>
        <div class="stat"><div class="ic red">${icon("alert")}</div><div><div class="k">Below ${X.min}%</div><div class="v">${X.risk.length}<small> students</small></div></div></div>
      </div>
      <nav class="tabs" role="tablist">${tabs.map(([k, l, ic, n]) => `<button data-tab="${k}" class="${k === curTab ? "active" : ""}" role="tab">${icon(ic)} ${l}${n != null ? ` <span class="cnt">${n}</span>` : ""}</button>`).join("")}</nav>
      <div id="tab"></div>`);
    $("#share").onclick = () => shareDialog(link);
    $("#xls").onclick = exportExcel;
    const rf = $("#refresh"); if (rf) rf.onclick = async () => { await loadAttendance(); drawSection(); App.toast("Updated"); };
    $$(".tabs [data-tab]").forEach((b) => (b.onclick = () => go(`#/section/${sec.id}/${b.dataset.tab}`)));
    ({ overview: tabOverview, classes: tabClasses, students: tabStudents, sheet: tabSheet, marks: tabMarks, groups: tabGroups, results: tabResults, log: tabLog, settings: tabSettings }[curTab] || tabOverview)(X);
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
    App.dialog({ title: "Student Portal", ic: "link", okText: "", cancelText: "Close", html: true,
      body: `<p>One link for all your sections, all semester. Students open it and type their Student ID to <b>mark attendance</b> with the PIN on your screen and to <b>see their portfolio</b> once you publish it.</p>
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
        <div class="card"><div class="card-head"><div><h2>Attendance by Class</h2><div class="sub">Share of the section that attended each class held so far</div></div>
          <div class="legend"><span><span class="mk P">P</span> ≥ ${min}%</span><span><span class="mk L">L</span> ${min - 10}–${min - 1}%</span><span><span class="mk A">A</span> Lower</span></div></div>
          ${scored ? `<div class="bars">${[25, 50, 75, 100].map((g) => `<div class="gl" style="bottom:${g * 0.95}%"><span>${g}%</span></div>`).join("")}
            ${allCols.map(({ t, c, h, n, l }) => { if (!h) return `<div class="bar nh"><div class="tip">${esc(t.name)} · ${App.classLabel(c.number)}<br>Not held yet</div><div class="fill"></div></div>`; const p = pct(n, students.length); return `<div class="bar ${p < min - 10 ? "bad" : p < min ? "warn" : ""}"><div class="tip">${esc(t.name)} · ${App.classLabel(c.number)}<br>${n}/${students.length} · ${p}%${l ? ` · ${l} late` : ""}</div><div class="fill" style="height:${p * 0.95}%"></div></div>`; }).join("")}</div>
            <div class="bar-labels">${allCols.map(({ t, c }) => `<span title="${esc(t.name)} · ${App.classLabel(c.number)}">${esc((t.name.trim()[0] || "").toUpperCase())}${App.pad2(c.number)}</span>`).join("")}</div>`
          : `<div class="empty"><div class="ic">${icon("chart")}</div><h3>No Classes Held Yet</h3><p>Start the PIN for your first class — the chart fills in as students check in.</p></div>`}
        </div>
        <div class="card"><div class="card-head"><div><h2>Students Below ${min}%</h2><div class="sub">${X.risk.length ? "Consider Contacting These Students" : "Everyone is above the minimum — great!"}</div></div>
          ${X.risk.length ? `<button class="btn sm secondary" id="cprisk">${icon("copy")} Copy IDs</button>` : ""}</div>
          ${X.risk.length ? `<div class="table-wrap" style="max-height:420px"><table><thead><tr><th>Student ID</th><th>Name</th><th class="num">Attended</th><th class="num">Attendance</th></tr></thead><tbody>
            ${X.risk.sort((a, b) => X.per[a.student_id].p - X.per[b.student_id].p).map((s) => { const p = X.per[s.student_id]; return `<tr class="clickable" data-stu="${esc(s.student_id)}"><td><b>${esc(s.student_id)}</b></td><td>${esc(s.name)}</td>
              <td class="num">${p.a} / ${p.h}</td><td><div class="pct-cell">${App.progress(p.p, min)}<b class="${App.pctClass(p.p, min)}">${p.p}%</b></div></td></tr>`; }).join("")}</tbody></table></div>`
          : `<div class="empty" style="padding:24px"><div class="ic" style="background:var(--success-soft);color:var(--success)">${icon("check")}</div><p style="margin:0">No students are at risk${X.held.length ? "" : " yet"}.</p></div>`}
        </div></div>
      <div class="stack">
        ${S.assess.length ? (() => { const R = Object.values(allResults()), key = (r) => (r.complete || r.grade?.special ? r.overall : r.standing), gr = (r) => (r.complete || r.grade?.special ? r.grade : r.standingGrade);
          const vals = R.filter((r) => r.complete || r.grade?.special || r.standing != null).map(key).filter((x) => x != null), av = vals.length ? vals.reduce((n, x) => n + x, 0) / vals.length : null, f = R.filter((r) => gr(r)?.grade === "F").length, open_ = R.some((r) => !r.complete);
          return `<div class="card"><div class="card-head" style="margin-bottom:12px"><h2>Marks & Grades</h2><button class="btn sm soft" id="tores">${icon("target")} Results</button></div>
            <ul class="list"><li>${icon("chart")}<span class="grow">Section Average${open_ ? " (So Far)" : ""}</span><b>${av == null ? "—" : fmt(av) + "%"}</b></li><li>${icon("alert")}<span class="grow">${open_ ? "Standing at F" : "Failing (F)"}</span><b class="${f ? "pct-bad" : ""}">${f}</b></li>
            <li>${icon(S.sec.portfolio_published ? "eye" : "eyeoff")}<span class="grow">Portfolio</span><b>${S.sec.portfolio_published ? "Published" : "Not Published"}</b></li></ul></div>`; })() : `<div class="card"><h2 style="margin-bottom:8px">Marks & Grades</h2><p class="small muted">No assessment plan yet.</p><button class="btn sm" id="tomarks2">${icon("book")} Set Up Marks</button></div>`}
        <div class="card"><h2 style="margin-bottom:18px">Attendance Distribution</h2><div class="bands">${bands.map(([l, n, c]) => `<div class="band"><span class="muted">${l}</span>
          <div class="progress ${c === "green" ? "" : c}"><span style="width:${students.length ? (n / students.length) * 100 : 0}%"></span></div><b class="num">${n}</b></div>`).join("")}</div></div>
        <div class="card"><h2 style="margin-bottom:14px">Records</h2><ul class="list">
          <li><span class="mk P">P</span><span class="grow">On Time</span><b>${counts.P}</b></li>
          <li><span class="mk L">L</span><span class="grow">Late</span><b>${counts.L}</b></li>
          <li><span class="mk E">E</span><span class="grow">Excused</span><b>${counts.E}</b></li>
          <li>${icon("smartphone")}<span class="grow">Checked In with PIN</span><b>${counts.pin}</b></li>
          <li>${icon("edit")}<span class="grow">Marked by You</span><b>${counts.manual}</b></li></ul></div>
        <div class="card"><h2 style="margin-bottom:6px">Rules</h2><p class="small muted">Change these in Settings.</p><ul class="list small">
          <li>${icon("target")}<span class="grow">Minimum Attendance</span><b>${min}%</b></li>
          <li>${icon("clock")}<span class="grow">Late After</span><b>${S.sec.late_after_minutes ? S.sec.late_after_minutes + " min" : "Off"}</b></li>
          <li>${icon("smartphone")}<span class="grow">One Device per Class</span><b>${S.sec.one_device_per_class ? "On" : "Off"}</b></li></ul></div>
      </div></div>`;
    const tr_ = $("#tores"); if (tr_) tr_.onclick = () => go(`#/section/${S.sec.id}/results`);
    const tm_ = $("#tomarks2"); if (tm_) tm_.onclick = () => go(`#/section/${S.sec.id}/marks`);
    const cp = $("#cprisk"); if (cp) cp.onclick = () => App.copy(X.risk.map((s) => s.student_id).join("\n"), `${X.risk.length} IDs copied`);
    $$("[data-stu]").forEach((r) => (r.onclick = () => studentProfile(r.dataset.stu)));
  }

  // ---------- Classes tab
  function tabClasses() {
    const { sec, terms, students } = S, nextId = (S.classes.find(isOpen) || terms.flatMap((t) => t.classes).find((c) => !isHeld(c)))?.id;
    $("#tab").innerHTML = `<div class="stack">${terms.map((t) => { const h = t.classes.filter(isHeld).length; return `<div class="card">
        <div class="card-head"><div><h2>${esc(t.name)}</h2><div class="sub">${h} of ${t.classes.length} classes held</div></div>
          <div class="btn-group"><button class="btn sm secondary" data-add="${t.id}">${icon("plus")} Add Classes</button>
            <button class="icon-btn" data-term-menu="${t.id}" title="Term Options">${icon("dots")}</button></div></div>
        ${t.classes.length ? `<div class="table-wrap"><table><thead><tr><th>Class</th><th>Date</th><th>Topic</th><th>Status</th><th class="num">Attendance</th><th></th></tr></thead><tbody>
        ${t.classes.map((c) => { const r = Object.values(recs(c.id)), n = r.length, l = r.filter((x) => x.status === "late").length, o = isOpen(c), hd = isHeld(c); return `<tr>
          <td><b>${App.classLabel(c.number)}</b></td><td class="nowrap">${c.class_date ? App.fmtDay(c.class_date) : `<span class="faint">—</span>`}</td>
          <td>${c.title ? esc(c.title) : `<span class="faint">—</span>`}</td>
          <td>${o ? `<span class="badge green"><span class="dot"></span> Open</span>` : hd ? `<span class="badge blue">Held</span>` : `<span class="badge">Not Held</span>`}</td>
          <td>${hd ? `<div class="pct-cell">${App.progress(pct(n, students.length), sec.min_attendance_pct)}<b>${n}/${students.length}</b></div>${l ? `<div class="xs muted num">${l} late</div>` : ""}` : `<span class="faint">—</span>`}</td>
          <td class="actions"><a class="btn sm ${o ? "green" : c.id === nextId ? "" : "secondary"}" href="pin.html?class=${c.id}" target="_blank" rel="noopener">${icon(o ? "external" : "play")} ${o ? "PIN Screen" : hd ? "Reopen" : "Start PIN"}</a>
            <button class="icon-btn" data-cls-menu="${c.id}" title="More">${icon("dots")}</button></td></tr>`; }).join("")}</tbody></table></div>`
        : `<div class="empty" style="padding:24px"><p style="margin:0">No classes in this term yet.</p></div>`}</div>`; }).join("")}
      <div class="card"><div class="card-head"><div><h2>Add a Term</h2><div class="sub">For example a make-up term or a lab block.</div></div></div>
        <form id="fterm" class="row"><div class="f"><input id="t_nm" placeholder="Term Name" maxlength="40" required /></div><button class="btn secondary">${icon("plus")} Add Term</button></form></div></div>`;
    $$("[data-add]").forEach((b) => (b.onclick = async () => {
      const t = terms.find((x) => x.id === b.dataset.add);
      const d = await App.dialog({ title: `Add Classes to ${t.name}`, ic: "plus", okText: "Add", html: true, body: `<label>How Many Classes?</label><input id="nadd" type="number" min="1" max="60" value="1" />` });
      if (!d) return;
      const n = Math.max(1, Math.min(60, +d.querySelector("#nadd").value || 1)), start = t.classes.reduce((m, c) => Math.max(m, c.number), 0);
      try { const rows = await q(sb.from("classes").insert(Array.from({ length: n }, (_, k) => ({ term_id: t.id, number: start + k + 1 }))).select()); S.classes.push(...rows); await loadAttendance(); drawSection(); App.toast(`${n} class${n > 1 ? "es" : ""} added`); } catch (x) { fail(x); }
    }));
    $$("[data-term-menu]").forEach((b) => (b.onclick = () => {
      const t = terms.find((x) => x.id === b.dataset.termMenu);
      popover(b, `<button data-v="ren">${icon("edit")} Rename Term</button><button data-v="del" style="color:var(--danger)">${icon("trash")} Delete Term</button>`, async (v) => {
        if (v === "ren") {
          const d = await App.dialog({ title: "Rename Term", ic: "edit", okText: "Save", html: true, body: `<label>Name</label><input id="tn" maxlength="40" value="${esc(t.name)}" />` });
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
      try { const t = await q(sb.from("terms").insert({ section_id: sec.id, name: $("#t_nm").value.trim(), sort: terms.length + 1 }).select().single()); t.classes = []; S.terms.push(t); drawSection(); App.toast("Term Added"); } catch (x) { fail(x); }
    };
  }

  function classMenu(anchor, classId) {
    const c = S.classes.find((x) => x.id === classId);
    popover(anchor, `<div class="ph"><b>${App.classLabel(c.number)}</b><span class="xs muted">${Object.keys(recs(c.id)).length} records</span></div>
      <button data-v="edit">${icon("edit")} Edit Date & Topic</button>
      <button data-v="all">${icon("check")} Mark Everyone Present</button>
      <button data-v="clear">${icon("x")} Clear Attendance</button>
      <button data-v="del" style="color:var(--danger)">${icon("trash")} Delete Class</button>`, async (v) => {
      try {
        if (v === "edit") {
          const d = await App.dialog({ title: `Edit ${App.classLabel(c.number)}`, ic: "edit", okText: "Save", html: true,
            body: `<div class="grid cols-2"><div><label>Class Number</label><input id="e_no" type="number" min="1" max="200" value="${c.number}" /></div>
              <div><label>Date</label><input id="e_dt" type="date" value="${esc(c.class_date || "")}" /></div></div>
              <div class="field-gap"></div><label>Topic <span class="faint">(Optional)</span></label><input id="e_tt" maxlength="120" value="${esc(c.title || "")}" placeholder="e.g. HTML forms" />` });
          if (!d) return;
          const upd = { number: +d.querySelector("#e_no").value, title: d.querySelector("#e_tt").value.trim() || null, class_date: d.querySelector("#e_dt").value || null };
          await q(sb.from("classes").update(upd).eq("id", c.id)); Object.assign(c, upd); await loadAttendance(); drawSection(); App.toast("Class Updated");
        } else if (v === "all") {
          const missing = S.students.filter((s) => !recs(c.id)[s.student_id]);
          if (!missing.length) return App.toast("Everyone Is Already Marked");
          if (!(await App.confirm("Mark Everyone Present?", `${missing.length} students without a record for ${App.classLabel(c.number)} will be marked present.`, "Mark Present", false))) return;
          for (let i = 0; i < missing.length; i += 500) await q(sb.from("attendance").insert(missing.slice(i, i + 500).map((s) => ({ class_id: c.id, student_id: s.student_id, student_name: s.name, source: "manual", status: "present" }))));
          await markHeld(c); await loadAttendance(); drawSection(); App.toast(`${missing.length} marked present`);
        } else if (v === "clear") {
          if (!(await App.confirm("Clear Attendance?", `All ${Object.keys(recs(c.id)).length} records for ${App.classLabel(c.number)} will be deleted.`, "Clear"))) return;
          await q(sb.from("attendance").delete().eq("class_id", c.id)); await loadAttendance(); drawSection(); App.toast("Attendance Cleared");
        } else if (v === "del") {
          if (!(await App.confirm(`Delete ${App.classLabel(c.number)}?`, "The class and its attendance records will be permanently deleted."))) return;
          await q(sb.from("classes").delete().eq("id", c.id)); S.classes = S.classes.filter((x) => x.id !== c.id); await loadAttendance(); drawSection(); App.toast("Class Deleted");
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
      const row = await q(sb.from("attendance").insert({ class_id: classId, student_id: sid, student_name: stu?.name || "", source: "manual", status }).select().single()); row.student_name = App.nameCase(row.student_name);
      (S.byClass[classId] ||= {})[sid] = row; S.att.push(row); await markHeld(c);
    }
  }
  function statusPop(anchor, classId, sid, after) {
    const a = recs(classId)[sid], c = S.classes.find((x) => x.id === classId), t = S.terms.find((x) => x.id === c.term_id), stu = S.students.find((s) => s.student_id === sid);
    const cur = a ? a.status : "absent";
    popover(anchor, `<div class="ph"><b>${esc(stu?.name || sid)}</b><span class="xs muted">${esc(sid)} · ${esc(t.name)} · ${App.classLabel(c.number)}</span>
        ${a ? `<div class="xs muted" style="margin-top:4px">${a.source === "pin" ? "Checked In with PIN" : "Marked by You"} · ${App.fmtDate(a.submitted_at)}</div>` : ""}</div>
      ${[["present", "P", "Present"], ["late", "L", "Late"], ["excused", "E", "Excused"], ["absent", "A", "Absent"]].map(([v, k, l]) => `<button data-v="${v}" class="${cur === v ? "cur" : ""}"><span class="mk ${k}">${k}</span> ${l}${cur === v ? `<span class="grow"></span>${icon("check")}` : ""}</button>`).join("")}`,
      async (v) => {
        if (v === cur) return;
        if (a && a.source === "pin" && v === "absent" && !(await App.confirm("Mark Absent?", `${sid} checked in with the PIN at ${App.fmtTime(a.submitted_at)}. Remove this record?`, "Mark Absent"))) return;
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
          <div class="search" style="flex:1;min-width:200px;max-width:340px">${icon("search")}<input id="sq" placeholder="Search ID or Name" value="${esc(ui.q)}" /></div>
          <div class="seg" id="sf">${[["all", "All"], ["risk", `Below ${min}%`], ["perfect", "100%"]].map(([k, l]) => `<button data-f="${k}" class="${ui.filter === k ? "on" : ""}">${l}</button>`).join("")}</div>
          <select id="ss" style="width:auto"><option value="seq">List Order</option><option value="id">Student ID</option><option value="name">Name</option><option value="low">Lowest %</option><option value="high">Highest %</option></select></div>
        <div class="btn-group"><button class="btn" id="up">${icon("upload")} Upload List</button><button class="btn secondary" id="add1">${icon("plus")} Add</button>
          <button class="icon-btn bordered" id="stmenu" title="More">${icon("dots")}</button></div></div>
      ${students.length ? `<div class="table-wrap keep" style="border-radius:0;border-left:0;border-right:0;border-bottom:0;max-height:640px"><table><thead><tr><th class="num">#</th><th>Student ID</th><th>Name</th><th class="num">Attended</th><th class="num">Late</th><th class="num">Attendance</th><th></th></tr></thead>
        <tbody id="stb">${list.map(({ s, i, p }) => `<tr class="clickable" data-stu="${esc(s.student_id)}" data-q="${esc((s.student_id + " " + s.name).toLowerCase())}">
          <td class="num faint">${i + 1}</td><td><b>${esc(s.student_id)}</b></td><td>${esc(s.name) || `<span class="faint">—</span>`}</td>
          <td class="num">${p.h ? `${p.a} / ${p.h}` : "—"}</td><td class="num">${p.l || `<span class="faint">—</span>`}</td>
          <td>${p.h ? `<div class="pct-cell">${App.progress(p.p, min)}<b class="${App.pctClass(p.p, min)}">${p.p}%</b></div>` : `<span class="faint" style="float:right">—</span>`}</td>
          <td class="actions"><button class="icon-btn" data-pf="${esc(s.student_id)}" title="Portfolio">${icon("book")}</button><button class="icon-btn" data-edit-stu="${s.id}" title="Edit">${icon("edit")}</button><button class="icon-btn danger" data-del-stu="${s.id}" title="Remove">${icon("trash")}</button></td></tr>`).join("")}
          ${list.length ? "" : `<tr><td colspan="7"><div class="empty" style="padding:20px">No students match this filter.</div></td></tr>`}</tbody></table></div>`
      : `<div class="empty"><div class="ic">${icon("users")}</div><h3>No Students Yet</h3><p>Upload the university's <b>Valid Student List</b> (.xlsx) or any Excel / CSV file with a Student ID column and a Name column.</p>
          <button class="btn" id="up2">${icon("upload")} Upload Student List</button></div>`}
      <input type="file" id="upl" accept=".xlsx,.xls,.csv" class="hidden" /></div>`;
    $("#ss").value = ui.sort;
    const filterRows = () => { const v = ui.q.toLowerCase(); $$("#stb tr[data-q]").forEach((r) => (r.style.display = !v || r.dataset.q.includes(v) ? "" : "none")); };
    $("#sq").oninput = (e) => { ui.q = e.target.value; filterRows(); }; filterRows();
    $$("#sf button").forEach((b) => (b.onclick = () => { ui.filter = b.dataset.f; drawSection(); }));
    $("#ss").onchange = (e) => { ui.sort = e.target.value; drawSection(); };
    [$("#up"), $("#up2")].forEach((b) => b && (b.onclick = () => $("#upl").click()));
    $("#upl").onchange = (e) => e.target.files[0] && importStudents(e.target.files[0]);
    $("#add1").onclick = () => editStudent(null);
    $("#stmenu").onclick = (e) => popover(e.currentTarget, `<button data-v="dl">${icon("download")} Download Student List</button><button data-v="tpl">${icon("file")} Download Blank Template</button>
      <button data-v="cp">${icon("copy")} Copy All IDs</button><div class="sep" style="height:1px;background:var(--border);margin:6px 0"></div>
      <button data-v="clr" style="color:var(--danger)">${icon("trash")} Remove All Students</button>`, async (v) => {
      if (v === "dl") downloadRoster(false); else if (v === "tpl") downloadRoster(true);
      else if (v === "cp") App.copy(students.map((s) => s.student_id).join("\n"), `${students.length} IDs copied`);
      else if (v === "clr") {
        if (!(await App.confirm("Remove All Students?", "The whole list for this section will be removed. Attendance already recorded stays in the database.", "Remove All"))) return;
        try { await q(sb.from("students").delete().eq("section_id", S.sec.id)); S.students = []; drawSection(); App.toast("All Students Removed"); } catch (x) { fail(x); }
      }
    });
    $$("#stb tr[data-stu]").forEach((r) => (r.onclick = (e) => { if (e.target.closest("button")) return; studentProfile(r.dataset.stu); }));
    $$("[data-edit-stu]").forEach((b) => (b.onclick = () => editStudent(S.students.find((s) => s.id === b.dataset.editStu))));
    $$("#stb [data-pf]").forEach((b) => (b.onclick = () => portfolioModal(b.dataset.pf)));
    $$("[data-del-stu]").forEach((b) => (b.onclick = async () => {
      const s = S.students.find((x) => x.id === b.dataset.delStu);
      if (!(await App.confirm("Remove Student?", `${s.student_id} ${s.name} will no longer be able to check in. Past attendance stays.`, "Remove"))) return;
      try { await q(sb.from("students").delete().eq("id", s.id)); S.students = S.students.filter((x) => x.id !== s.id); drawSection(); App.toast("Student Removed"); } catch (x) { fail(x); }
    }));
  }
  const normId = (v) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

  async function editStudent(s) {
    const d = await App.dialog({ title: s ? "Edit Student" : "Add a Student", ic: s ? "edit" : "plus", okText: s ? "Save" : "Add Student", html: true,
      body: `<label>Student ID</label><input id="o_id" placeholder="${esc(cfg.STUDENT_ID_EXAMPLE || "")}" maxlength="30" value="${esc(s?.student_id || "")}" ${s ? "disabled" : ""} />
        <div class="field-gap"></div><label>Full Name</label><input id="o_nm" maxlength="120" value="${esc(s?.name || "")}" />
        ${s && s.access_code ? `<div class="field-gap"></div><label>Portfolio Access Code</label><div class="linkbox"><code style="font-size:16px;letter-spacing:.18em">${esc(s.access_code)}</code><button type="button" class="btn sm secondary" onclick="App.copy('${esc(s.access_code)}','Code copied')">${icon("copy")}</button></div><p class="hint">Only needed when the section requires access codes.</p>` : ""}`,
      validate: (m) => { const id = normId(m.querySelector("#o_id").value); if (!id) return "Enter the Student ID."; if (!s && cfg.STUDENT_ID_PATTERN && !new RegExp(cfg.STUDENT_ID_PATTERN).test(id)) return `ID should look like ${cfg.STUDENT_ID_EXAMPLE}.`; if (!s && S.students.some((x) => x.student_id === id)) return "This ID is already on the list."; } });
    if (!d) return;
    try {
      const name = App.nameCase(d.querySelector("#o_nm").value.replace(/\s+/g, " "));
      if (s) { await q(sb.from("students").update({ name }).eq("id", s.id)); s.name = name; }
      else { const row = await q(sb.from("students").insert({ section_id: S.sec.id, student_id: normId(d.querySelector("#o_id").value), name, seq: S.students.length + 1 }).select().single()); S.students.push(row); }
      drawSection(); App.toast(s ? "Saved" : "Student Added");
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
        seen.add(id); list.push({ student_id: id, name: nc >= 0 ? App.nameCase(String(rows[r][nc]).replace(/\s+/g, " ")) : "" });
      }
      if (!list.length) throw new Error("No student IDs found in this file.");
      const existing = new Set(S.students.map((s) => s.student_id));
      const added = list.filter((s) => !existing.has(s.student_id)).length, missing = S.students.filter((s) => !seen.has(s.student_id)).length;
      const dlg = await App.dialog({ title: "Import Student List", ic: "upload", okText: `Import ${list.length} students`, html: true, wide: true,
        body: `<div class="stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
            <div class="stat"><div><div class="k">In File</div><div class="v">${list.length}</div></div></div>
            <div class="stat"><div><div class="k">New</div><div class="v pct-good">${added}</div></div></div>
            <div class="stat"><div><div class="k">Not in File</div><div class="v ${missing ? "pct-warn" : ""}">${missing}</div></div></div></div>
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
      S.students = (await App.fetchAll(() => sb.from("students").select("*").eq("section_id", S.sec.id).order("seq").order("student_id"))).map(properStu);
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
        <div class="legend"><span><span class="mk P">P</span>Present</span><span><span class="mk L">L</span>Late</span><span><span class="mk E">E</span>Excused</span><span><span class="mk A">A</span>Absent</span><span><span class="mk N"></span>Not Held</span></div>
        <p class="hint">Click a class to change the mark.</p>`;
      const m = document.querySelector(".modal-bg[data-profile]");
      if (m) m.querySelector(".dlg-body").innerHTML = body;
      return body;
    };
    App.dialog({ title: "Student Attendance", ic: "user", okText: "", cancelText: "Close", html: true, wide: true, body: draw() }).then(() => drawSection());
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
        <select id="tsel" style="width:auto;min-width:150px"><option value="">All Terms</option>${terms.map((t) => `<option value="${t.id}" ${t.id === ui.term ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>
        <div class="search" style="flex:1;min-width:200px;max-width:320px">${icon("search")}<input id="msr" placeholder="Search ID or Name" value="${esc(ui.q)}" /></div>
        <label class="switch" style="align-items:center"><input type="checkbox" id="riskonly" ${ui.riskOnly ? "checked" : ""} /> Below ${min}% Only</label></div>
        <div class="btn-group"><button class="btn sm secondary" id="print">${icon("printer")} Print</button><button class="btn sm secondary" id="xls2">${icon("download")} Excel</button></div></div>
      <div style="padding:0 24px 16px" class="legend"><span><span class="mk P">P</span>Present</span><span><span class="mk L">L</span>Late</span><span><span class="mk E">E</span>Excused</span><span><span class="mk A">A</span>Absent</span><span><span class="mk N"></span>Not Held</span><span><span class="mk P manual">P</span>Marked by You</span><span class="faint">· Click a cell to change it, or a class number for bulk actions</span></div>
      ${students.length && cols.length ? `<div class="table-wrap keep" style="max-height:640px;border-radius:0;border-left:0;border-right:0;border-bottom:0"><table class="matrix"><thead>
        <tr><th class="sticky">Student ID</th><th class="name sticky2">Name</th>${cols.map(({ t, c }, i) => `<th class="cls ${isHeld(c) ? "" : "nh"} ${i === 0 || cols[i - 1].t.id !== t.id ? "tstart" : ""}" data-cls="${c.id}" title="${esc(t.name)} · ${App.classLabel(c.number)}${c.class_date ? " · " + App.fmtDay(c.class_date) : ""}${c.title ? " · " + esc(c.title) : ""}">${App.pad2(c.number)}<small>${esc(String(t.name).split(" ")[0])}</small></th>`).join("")}<th class="num">Total</th><th class="num" style="padding-right:16px">%</th></tr></thead>
        <tbody id="mtb">${shown.map((s) => {
          const p = X.per[s.student_id];
          const cells = cols.map(({ t, c }, i) => { const a = recs(c.id)[s.student_id], k = a ? STATUS[a.status].k : isHeld(c) ? "A" : "N";
            return `<td class="cell ${i === 0 || cols[i - 1].t.id !== t.id ? "tstart" : ""}" data-c="${c.id}" data-s="${esc(s.student_id)}"><span class="mk ${k} ${a && a.source === "manual" ? "manual" : ""}">${k === "N" ? "" : k}</span></td>`; }).join("");
          return `<tr data-q="${esc((s.student_id + " " + s.name).toLowerCase())}"><td class="sticky"><b>${esc(s.student_id)}</b></td><td class="name sticky2" title="${esc(s.name)}">${esc(s.name)}</td>${cells}
            <td class="num"><b>${p.a}</b><span class="faint">/${p.h}</span></td><td class="num ${App.pctClass(p.p, min)}" style="padding-right:16px;font-weight:700">${p.p == null ? "—" : p.p + "%"}</td></tr>`;
        }).join("")}</tbody></table></div>` : `<div class="empty"><div class="ic">${icon("grid")}</div><h3>Nothing to Show Yet</h3><p>Add students and classes first.</p></div>`}</div>`;
    App.stickyTable($("table.matrix"));
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
        <select id="lc" style="width:auto;min-width:190px"><option value="">All Classes</option>${S.terms.map((t) => `<optgroup label="${esc(t.name)}">${t.classes.filter(isHeld).map((c) => `<option value="${c.id}" ${ui.logClass === c.id ? "selected" : ""}>${App.classLabel(c.number)}${c.class_date ? " · " + App.fmtDay(c.class_date) : ""}</option>`).join("")}</optgroup>`).join("")}</select>
        <div class="seg" id="lsrc">${[["", "All"], ["pin", "PIN"], ["manual", "Manual"], ["late", "Late"], ["shared", "Shared Device"]].map(([k, l]) => `<button data-s="${k}" class="${ui.logSrc === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="search" style="flex:1;min-width:180px;max-width:280px">${icon("search")}<input id="lq" placeholder="Search ID or Name" value="${esc(ui.q)}" /></div></div>
        <span class="muted small">${rows.length} records</span></div>
      ${rows.length ? `<div class="table-wrap keep" style="max-height:640px;border-radius:0;border-left:0;border-right:0;border-bottom:0"><table><thead><tr><th>Time</th><th>Class</th><th>Student ID</th><th>Name</th><th>Status</th><th>Source</th><th>Device</th></tr></thead><tbody id="ltb">
        ${rows.slice(0, 1500).map((a) => { const c = cls[a.class_id], t = c && term[c.term_id]; return `<tr data-q="${esc((a.student_id + " " + a.student_name).toLowerCase())}">
          <td class="nowrap">${App.fmtDate(a.submitted_at)}</td><td class="nowrap">${t ? esc(t.name) + " · " : ""}${c ? App.classLabel(c.number) : ""}</td>
          <td><b>${esc(a.student_id)}</b></td><td>${esc(a.student_name)}</td>
          <td><span class="badge ${STATUS[a.status].cls}">${STATUS[a.status].label}</span></td>
          <td>${a.source === "pin" ? `<span class="badge blue">${icon("smartphone")} PIN</span>` : `<span class="badge">${icon("edit")} Manual</span>`}</td>
          <td class="mono xs">${a.device_id ? esc(a.device_id.slice(0, 8)) : "—"} ${shared(a) ? `<span class="badge red" title="Same Device Used for Another Student in This Class">Shared</span>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty"><div class="ic">${icon("list")}</div><h3>No Check-Ins Yet</h3><p>Records appear here as students check in or you mark them.</p></div>`}</div>`;
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
        <div class="card"><div class="card-head"><div><h2>Section Details</h2></div></div><form id="fset">
          <div class="grid cols-2"><div><label>Section</label><input id="st_nm" value="${esc(sec.name)}" maxlength="20" required /></div>
          <div><label>Class Code</label><input id="st_cc" value="${esc(sec.class_code || "")}" maxlength="20" placeholder="optional" /></div></div>
          <div style="height:18px"></div><button class="btn">${icon("check")} Save Details</button></form></div>
        <div class="card"><div class="card-head"><div><h2>Attendance Rules</h2><div class="sub">Apply to new check-ins from now on.</div></div></div>
          <label>Mark Students Late After</label>
          <div class="seg" id="late">${[[null, "Off"], [5, "5 min"], [10, "10 min"], [15, "15 min"], [20, "20 min"], [30, "30 min"]].map(([v, l]) => `<button data-v="${v ?? ""}" class="${(la ?? null) === v ? "on" : ""}">${l}</button>`).join("")}</div>
          <p class="hint">Counted from when you press Start on the PIN screen. Late still counts as attended.</p>
          <div class="field-gap"></div><label for="minp">Minimum Attendance</label>
          <div class="row center-y"><input id="minp" type="range" min="50" max="100" step="5" value="${sec.min_attendance_pct}" style="flex:1;min-height:0;padding:0;border:0;box-shadow:none" /><b id="minv" style="width:52px;text-align:right">${sec.min_attendance_pct}%</b></div>
          <p class="hint">Students below this are flagged “at risk” here and on their own check-in screen.</p>
          <div class="field-gap"></div>
          <label class="switch"><input type="checkbox" id="st_dev" ${sec.one_device_per_class ? "checked" : ""} /><span>One Device per Student per Class<span class="d">Stops one phone from checking in a second student in the same class.</span></span></label>
          <div style="height:18px"></div><button class="btn" id="saverules">${icon("check")} Save Rules</button></div>
        ${gradingCards("left")}
      </div>
      <div class="stack">
        ${gradingCards()}
        <div class="card" style="border-color:color-mix(in srgb,var(--danger) 35%,var(--border))"><div class="card-head"><div><h2 style="color:var(--danger)">Danger Zone</h2><div class="sub">Deletes the student list, classes, attendance, marks and groups of this section.</div></div></div>
          <button class="btn red-soft" id="delsec">${icon("trash")} Delete This Section</button></div></div></div>`;
    let lateV = la ?? null;
    $$("#late button").forEach((b) => (b.onclick = () => { lateV = b.dataset.v ? +b.dataset.v : null; $$("#late button").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("#minp").oninput = (e) => ($("#minv").textContent = e.target.value + "%");
    $("#fset").onsubmit = async (e) => {
      e.preventDefault(); const upd = { name: $("#st_nm").value.trim(), class_code: $("#st_cc").value.trim() || null };
      try { await q(sb.from("sections").update(upd).eq("id", sec.id)); Object.assign(sec, upd); drawSection(); App.toast("Saved"); } catch (x) { fail(x); }
    };
    $("#saverules").onclick = async () => {
      const upd = { late_after_minutes: lateV, min_attendance_pct: +$("#minp").value, one_device_per_class: $("#st_dev").checked };
      try { await q(sb.from("sections").update(upd).eq("id", sec.id)); Object.assign(sec, upd); drawSection(); App.toast("Rules Saved"); } catch (x) { fail(x); }
    };
    bindGrading();
    $("#delsec").onclick = async () => {
      const d = await App.dialog({ title: "Delete This Section?", danger: true, okText: "Delete Forever", html: true,
        body: `<p>${esc(sec.course.code)} Section ${esc(sec.name)} — the student list, classes, attendance, marks and groups will be permanently deleted. Export to Excel first if you need a copy.</p>
          <label>Type <b>${esc(sec.name)}</b> to confirm</label><input id="cf" />`, validate: (m) => (m.querySelector("#cf").value.trim() !== sec.name ? `Type ${sec.name} to confirm.` : null) });
      if (!d) return;
      try { await q(sb.from("sections").delete().eq("id", sec.id)); S = null; App.toast("Section Deleted"); go("#/"); } catch (x) { fail(x); }
    };
  }

  // ------------------------------------------------------------------ Excel export
  function exportExcel() {
    const { sec, terms, students } = S, X = stats(), wb = XLSX.utils.book_new();
    const info = [["Classfolio export"], [], ["Course", `${sec.course.code} — ${sec.course.title}`], ["Section", sec.name], ["Class Code", sec.class_code || ""],
      ["Intake", sec.intake.name], ["Exported", App.fmtDate(new Date())], ["Students", students.length], ["Classes Held", X.held.length], ["Minimum Attendance", sec.min_attendance_pct / 100], [],
      ["How to Read"], ["Attendance sheets: 1 = attended (present, late or excused), 0 = absent, blank = class not held yet."], ["Results and Marks sheets: totals out of 100 per term, Grand Total uses the term weights, grades use the section's grade scale."],
      ["Detail sheet: P = present, L = late, E = excused, A = absent."],
      ["To merge into the Portfolio: copy the Class columns of a term attendance sheet into the Mid/Final Overall sheet (rows are in the same order as the uploaded student list)."]];
    const wsI = XLSX.utils.aoa_to_sheet(info); wsI["!cols"] = [{ wch: 20 }, { wch: 70 }]; if (wsI.B10) wsI.B10.z = "0%"; XLSX.utils.book_append_sheet(wb, wsI, "Info");

    // Summary
    const sh = ["Student ID", "Student Name", ...terms.flatMap((t) => [`${t.name} Attended`, `${t.name} Held`]), "Total Attended", "Total Held", "Late", "Excused", "Attendance %", "Status"];
    const sr = students.map((s) => { const p = X.per[s.student_id]; return [s.student_id, s.name, ...terms.flatMap((t) => [p.byTerm[t.id].a, p.byTerm[t.id].h]), p.a, p.h, p.l, p.e, p.h ? p.a / p.h : "", p.h ? (p.p < X.min ? "Below Minimum" : "OK") : ""]; });
    const wsS = XLSX.utils.aoa_to_sheet([sh, ...sr]); fmtPct(wsS, sh.length - 2, sr.length); wsS["!cols"] = [{ wch: 13 }, { wch: 32 }, ...sh.slice(2).map((h) => ({ wch: Math.max(9, h.length + 2) }))];
    wsS["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(sh.length - 1)}${sr.length + 1}` }; XLSX.utils.book_append_sheet(wb, wsS, "Summary");

    // Results + marks per term (when an assessment plan exists)
    if (S.assess.length) {
      const R = allResults(), coCodes = [...new Set(students.flatMap((s) => R[s.student_id].coList.map((c) => c.code)))];
      const rh = ["Student ID", "Student Name", ...terms.map((t) => `${t.name} Total`), ...terms.map((t) => `${t.name} Grade`), "Grand Total", "Final Grade", "Grade Point", "Attendance %", ...coCodes.map((c) => `${c} %`), "COs Attained", "Complete"];
      const rr = students.map((s) => { const r = R[s.student_id]; return [s.student_id, s.name, ...r.terms.map((t) => t.total), ...r.terms.map((t) => t.grade?.grade || ""), r.overall, r.grade?.grade || "", r.grade?.point ?? "",
        r.attPct == null ? "" : r.attPct / 100, ...coCodes.map((c) => { const x = r.coList.find((o) => o.code === c); return x && x.pct != null ? x.pct / 100 : ""; }), `${r.coAttained}/${r.coList.length}`, r.complete ? "Yes" : "No"]; });
      const wsR = XLSX.utils.aoa_to_sheet([rh, ...rr]);
      [rh.indexOf("Attendance %"), ...coCodes.map((c) => rh.indexOf(`${c} %`))].forEach((ci) => fmtPct(wsR, ci, rr.length));
      wsR["!cols"] = [{ wch: 13 }, { wch: 32 }, ...rh.slice(2).map((h) => ({ wch: Math.max(9, h.length + 2) }))];
      wsR["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(rh.length - 1)}${rr.length + 1}` }; XLSX.utils.book_append_sheet(wb, wsR, "Results");
      terms.forEach((t) => {
        const items = S.assess.filter((a) => a.term_id === t.id).sort(bySort); if (!items.length) return;
        const mh = ["Student ID", "Student Name", ...items.map((a) => `${itemLabel(a)} (/${fmt(a.max_marks, 2)})`), "Term Total", "Grade"];
        const mr = students.map((s) => { const r = R[s.student_id].terms.find((x) => x.term.id === t.id), A = attByTerm(s.student_id)[t.id];
          return [s.student_id, s.name, ...items.map((a) => (a.kind === "attendance" ? (A.held ? Math.round((A.attended / A.held) * a.max_marks * 100) / 100 : "") : markOf(a.id, s.student_id) ?? "")), r.total, r.grade?.grade || ""]; });
        const ws = XLSX.utils.aoa_to_sheet([mh, ...mr]); ws["!cols"] = [{ wch: 13 }, { wch: 32 }, ...items.map((a) => ({ wch: Math.min(30, Math.max(10, itemLabel(a).length + 6)) })), { wch: 11 }, { wch: 7 }];
        XLSX.utils.book_append_sheet(wb, ws, `${t.name} Marks`.slice(0, 31));
      });
      if (S.groups.length) {
        const gr = [["Group", "Project Title", "Student ID", "Student Name"]];
        S.groups.forEach((g) => S.members.filter((m) => m.group_id === g.id).forEach((m) => gr.push([g.name, g.title || "", m.student_id, S.students.find((x) => x.student_id === m.student_id)?.name || ""])));
        const wsG = XLSX.utils.aoa_to_sheet(gr); wsG["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 13 }, { wch: 32 }]; XLSX.utils.book_append_sheet(wb, wsG, "Groups");
      }
    }

    // One sheet per term, 1/0 — ready to paste into the Portfolio
    terms.forEach((t) => {
      const hdr = ["Student ID", "Student Name", ...t.classes.map((c) => App.classLabel(c.number)), "Present", "Classes Held", "Attendance %"];
      const rows = students.map((s) => { let n = 0, h = 0;
        const v = t.classes.map((c) => { if (!isHeld(c)) return ""; h++; const p = recs(c.id)[s.student_id] ? 1 : 0; n += p; return p; });
        return [s.student_id, s.name, ...v, n, h, h ? n / h : ""]; });
      const ws = XLSX.utils.aoa_to_sheet([hdr, ...rows]); fmtPct(ws, hdr.length - 1, rows.length);
      ws["!cols"] = [{ wch: 13 }, { wch: 32 }, ...t.classes.map(() => ({ wch: 9 })), { wch: 9 }, { wch: 12 }, { wch: 13 }];
      ws["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(hdr.length - 1)}${rows.length + 1}` };
      XLSX.utils.book_append_sheet(wb, ws, `${t.name} Attendance`.slice(0, 31));
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

    XLSX.writeFile(wb, `Classfolio_${safe(sec.course.code)}_${safe(sec.intake.name)}_Sec-${safe(sec.name)}_${new Date().toLocaleDateString("en-CA")}.xlsx`);
    App.toast("Excel File Downloaded");
  }
  function fmtPct(ws, col, n) { const c = XLSX.utils.encode_col(col); for (let r = 2; r <= n + 1; r++) { const cell = ws[`${c}${r}`]; if (cell && cell.t === "n") cell.z = "0%"; } }

  // ================================================================== MARKS, GROUPS & RESULTS
  const fmt = (x, d = 1) => Grade.fmt(x, d);
  const bySort = (a, b) => (a.sort || 0) - (b.sort || 0);
  async function loadMarks() {
    S.assess = (await q(sb.from("assessments").select("*").eq("section_id", S.sec.id).order("sort"))).map((a) => ({ ...a, max_marks: +a.max_marks, weight: +a.weight }));
    const ids = S.assess.map((a) => a.id); let rows = [];
    for (let i = 0; i < ids.length; i += 80) rows = rows.concat(await App.fetchAll(() => sb.from("marks").select("assessment_id, student_id, score").in("assessment_id", ids.slice(i, i + 80)).order("id")));
    S.marks = {}; rows.forEach((m) => ((S.marks[m.assessment_id] ||= {})[m.student_id] = m.score == null ? null : +m.score));
  }
  async function loadGroups() {
    S.groups = await q(sb.from("groups").select("*").eq("section_id", S.sec.id).order("sort").order("name"));
    S.members = await App.fetchAll(() => sb.from("group_members").select("*").eq("section_id", S.sec.id).order("id"));
  }
  const markOf = (aid, sid) => { const v = S.marks[aid]?.[sid]; return v == null ? null : v; };
  function attByTerm(sid) { const m = {}; S.terms.forEach((t) => { let h = 0, a = 0; t.classes.forEach((c) => { if (!isHeld(c)) return; h++; if (recs(c.id)[sid]) a++; }); m[t.id] = { held: h, attended: a, planned: t.classes.length }; }); return m; }
  const ctxFor = (s) => ({ terms: S.terms, assessments: S.assess, scale: S.sec.grade_scale, round: S.sec.round_total, coTarget: S.sec.course.co_target ?? 60, cos: S.sec.course.cos || [], specialGrade: s?.special_grade || null });
  function resultOf(s) { const A = attByTerm(s.student_id); return Grade.student(ctxFor(s), (aid) => markOf(aid, s.student_id), (tid) => A[tid]); }
  function allResults() { const o = {}; S.students.forEach((s) => (o[s.student_id] = resultOf(s))); return o; }
  function averages() { const av = {}; S.assess.forEach((a) => { const v = S.students.map((s) => markOf(a.id, s.student_id)).filter((x) => x != null); if (v.length) av[a.id] = v.reduce((n, x) => n + x, 0) / v.length; }); return av; }
  const groupOf = (sid) => { const m = S.members.find((x) => x.student_id === sid); return m && S.groups.find((g) => g.id === m.group_id); };
  const maxGroups = () => (S.students.length > 40 ? 11 : 10);
  const itemLabel = (a) => (a.grp ? `${a.grp} · ${a.name}` : a.name);

  function portfolioData(sid) {
    const s = S.students.find((x) => x.student_id === sid), marks = {};
    S.assess.forEach((a) => { const v = markOf(a.id, sid); if (v != null) marks[a.id] = v; });
    const g = groupOf(sid);
    return { course: { ...S.sec.course }, section: { ...S.sec, intake: S.sec.intake.name }, student: { student_id: sid, special_grade: s?.special_grade || null },
      terms: S.terms, assessments: S.assess.map((a) => ({ ...a, visible: true })), marks, averages: averages(),
      classes: S.terms.flatMap((t) => t.classes.map((c) => ({ term_id: t.id, number: c.number, date: c.class_date, held: isHeld(c), status: recs(c.id)[sid]?.status || null }))),
      group: g ? { name: g.name, title: g.title, members: S.members.filter((m) => m.group_id === g.id).map((m) => m.student_id).sort() } : null };
  }
  function portfolioModal(sid) {
    const s = S.students.find((x) => x.student_id === sid);
    App.dialog({ title: `${s?.name || sid}`, ic: "book", okText: "", cancelText: "Close", html: true, wide: true,
      body: `<div class="row center-y" style="justify-content:space-between;margin-bottom:16px"><span class="muted">Student ID <b style="color:var(--text)">${esc(sid)}</b>${groupOf(sid) ? ` · ${esc(groupOf(sid).name)}` : ""}</span>
        <span class="badge ${S.sec.portfolio_published ? "green" : ""}">${S.sec.portfolio_published ? `${icon("eye")} Students can see this` : `${icon("eyeoff")} Not published to students`}</span></div>${Grade.render(portfolioData(sid), { faculty: true })}` });
    const m = $$(".modal-bg").pop(); m.querySelector(".modal").style.maxWidth = "1100px";
  }

  // ---------- autosave for marks
  const SAVE = { dirty: new Map(), timer: null };
  function saveState(st, msg) {
    const el = $("#savest"); if (!el) return;
    el.className = "save-state " + st;
    el.innerHTML = st === "saving" ? `<span class="spinner" style="width:14px;height:14px"></span> Saving…` : st === "err" ? `${icon("alert")} ${esc(msg || "Not saved — retrying")}` : `${icon("check")} All changes saved`;
  }
  function queueMark(aid, sid, score) {
    (S.marks[aid] ||= {})[sid] = score;
    SAVE.dirty.set(aid + "|" + sid, { assessment_id: aid, student_id: sid, score });
    saveState("saving"); clearTimeout(SAVE.timer); SAVE.timer = setTimeout(flushMarks, 600);
  }
  async function flushMarks() {
    if (!SAVE.dirty.size) return saveState("saved");
    const rows = [...SAVE.dirty.values()]; SAVE.dirty.clear();
    try {
      const now = new Date().toISOString();
      for (let i = 0; i < rows.length; i += 500) await q(sb.from("marks").upsert(rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now })), { onConflict: "assessment_id,student_id" }));
      saveState(SAVE.dirty.size ? "saving" : "saved");
    } catch (x) {
      rows.forEach((r) => !SAVE.dirty.has(r.assessment_id + "|" + r.student_id) && SAVE.dirty.set(r.assessment_id + "|" + r.student_id, r));
      saveState("err", friendly(x)); clearTimeout(SAVE.timer); SAVE.timer = setTimeout(flushMarks, 4000);
    }
  }
  addEventListener("beforeunload", (e) => { if (SAVE.dirty.size) { flushMarks(); e.preventDefault(); e.returnValue = ""; } });

  // ---------- Marks tab
  function tabMarks() {
    if (!S.assess.length) return marksEmpty();
    const ui = UI[S.sec.id];
    if (!ui.mterm || !S.terms.find((t) => t.id === ui.mterm)) ui.mterm = S.terms[0]?.id;
    const T = S.terms.find((t) => t.id === ui.mterm);
    const items = S.assess.filter((a) => a.term_id === T.id).sort(bySort), rows = Grade.termRows(items);
    const cols = rows.flatMap((r) => r.items);
    const R = allResults(), wsum = rows.reduce((n, r) => n + Grade.rowWeight(r), 0);
    const meta = (a) => `<small>/ ${fmt(a.max_marks, 2)} · ${fmt(a.weight, 2)}%${a.co ? ` · ${esc(a.co)}` : ""}${a.by_group ? " · Group" : ""}${a.visible === false ? " · Hidden" : ""}</small>`;
    // One flat header row: each column carries its own short label; the full name, group and rule are in the tooltip
    const short = (a) => { const p = String(a.name).split(" · "); return p.length > 2 ? `${p[0]} · ${p[p.length - 1]}` : a.name; };
    const ruleNote = (r) => r.rule === "best" ? "Best One Counted" : r.rule === "sum_up" ? "Added Up & Rounded Up" : r.rule === "avg" ? "Average" : "";
    const tip = (a, r) => [r.group ? r.label : "", a.name, r.group && ruleNote(r) ? ruleNote(r) : "", `Out of ${fmt(a.max_marks, 2)} · ${fmt(a.weight, 2)}% of the term`, a.co || ""].filter(Boolean).join("\n");
    const head = (a, r, first) => `<th class="it ${first ? "gstart" : ""}" title="${esc(tip(a, r))}"><span class="hl">${esc(short(a))}</span>${meta(a)}</th>`;
    const starts = new Set(rows.map((r) => r.items[0].id));
    const heads = rows.map((r) => r.items.map((a, i) => head(a, r, i === 0)).join("")).join("");
    const totCell = (r) => (r && r.graded ? fmt(r.total) : `<span class="faint">—</span>`);
    const grdCell = (r) => { if (!r || !r.graded) return `<span class="faint">—</span>`;
      const g = r.complete ? r.grade : r.standingGrade; if (!g?.grade) return `<span class="faint">—</span>`;
      return `<span class="grade-pill sm ${gradeTone(g.grade)} ${r.complete ? "" : "tentative"}" title="${r.complete ? "Term grade" : `Standing so far: ${fmt(r.standing)}% of the marks entered`}">${esc(g.grade)}</span>`; };
    const filled = cols.filter((a) => a.kind !== "attendance").reduce((n, a) => n + S.students.filter((s) => markOf(a.id, s.student_id) != null).length, 0);
    const need = cols.filter((a) => a.kind !== "attendance").length * S.students.length;
    $("#tab").innerHTML = `<div class="card flush">
      <div class="card-head" style="padding-bottom:16px"><div class="row center-y grow">
          <div class="seg" id="mterm">${S.terms.map((t) => `<button data-t="${t.id}" class="${t.id === T.id ? "on" : ""}">${esc(t.name)}</button>`).join("")}</div>
          <div class="search" style="flex:1;min-width:180px;max-width:300px">${icon("search")}<input id="mq" placeholder="Search ID or Name" value="${esc(ui.q)}" /></div>
          <span id="savest" class="save-state saved">${icon("check")} All changes saved</span></div>
        <div class="btn-group"><button class="btn sm secondary" id="plan">${icon("settings")} Assessment Plan</button>
          <button class="icon-btn bordered" id="mmenu" title="Import / Export">${icon("dots")}</button></div></div>
      <div style="padding:0 24px 16px" class="row center-y small muted">
        <span class="weight-meter ${Math.abs(wsum - 100) < 0.01 ? "ok" : "bad"}">${icon(Math.abs(wsum - 100) < 0.01 ? "check" : "alert")} Term weights add up to ${fmt(wsum, 2)}%</span>
        <span>·</span><span id="mcount">${filled} of ${need} marks entered</span><span>·</span><span>Type a mark and it saves by itself. <span class="kbd">Enter</span> moves down. You can paste a block of marks from Excel.</span></div>
      ${S.students.length ? `<div class="table-wrap keep" style="max-height:640px;border-radius:0;border-left:0;border-right:0;border-bottom:0"><table class="mgrid"><thead>
        <tr><th class="sticky">Student ID</th><th class="name sticky2">Name</th>${heads}
          <th class="num tot-h">Total<small>/ 100</small></th><th class="grd-h" title="An outlined grade is the standing on the marks entered so far">Grade</th></tr></thead>
        <tbody id="mtb">${S.students.map((s) => { const tr = R[s.student_id].terms.find((x) => x.term.id === T.id); const A = attByTerm(s.student_id)[T.id];
          return `<tr data-s="${esc(s.student_id)}" data-q="${esc((s.student_id + " " + s.name).toLowerCase())}"><td class="sticky"><b>${esc(s.student_id)}</b></td><td class="name sticky2" title="${esc(s.name)}">${esc(s.name)}</td>
            ${cols.map((a) => a.kind === "attendance" ? `<td class="calc ${starts.has(a.id) ? "gstart" : ""}" title="${A.attended} of ${A.held} classes">${A.held ? fmt((A.attended / A.held) * a.max_marks, 2) : "—"}</td>`
              : `<td class="${starts.has(a.id) ? "gstart" : ""}"><input class="mi ${a.by_group ? "grpm" : ""}" inputmode="decimal" data-a="${a.id}" data-max="${a.max_marks}" value="${markOf(a.id, s.student_id) ?? ""}" aria-label="${esc(itemLabel(a))} for ${esc(s.student_id)}" /></td>`).join("")}
            <td class="tot" data-tot>${totCell(tr)}</td><td data-grd class="grd">${grdCell(tr)}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty"><div class="ic">${icon("users")}</div><h3>No Students Yet</h3><p>Upload the student list first.</p></div>`}</div>`;
    $$("#mterm button").forEach((b) => (b.onclick = () => { ui.mterm = b.dataset.t; drawSection(); }));
    const filt = () => { const v = ui.q.toLowerCase(); $$("#mtb tr").forEach((r) => (r.style.display = !v || r.dataset.q.includes(v) ? "" : "none")); };
    $("#mq").oninput = (e) => { ui.q = e.target.value; filt(); }; filt();
    $("#plan").onclick = planEditor;
    $("#mmenu").onclick = (e) => popover(e.currentTarget, `<button data-v="tpl">${icon("download")} Download Marks Sheet (${esc(T.name)})</button><button data-v="up">${icon("upload")} Upload Marks Sheet</button>`, (v) => (v === "tpl" ? marksTemplate(T) : pickMarksFile(T)));
    const tb = $("#mtb"); if (!tb) return;
    App.stickyTable($("table.mgrid"));
    const recount = () => { const el = $("#mcount"); if (!el) return; const n = cols.filter((a) => a.kind !== "attendance").reduce((k, a) => k + S.students.filter((x) => markOf(a.id, x.student_id) != null).length, 0); el.textContent = `${n} of ${need} marks entered`; };
    const recalc = (tr) => { recount(); const s = S.students.find((x) => x.student_id === tr.dataset.s), r = resultOf(s).terms.find((x) => x.term.id === T.id);
      tr.querySelector("[data-tot]").innerHTML = totCell(r); tr.querySelector("[data-grd]").innerHTML = grdCell(r); };
    const apply = (inp) => {
      const raw = inp.value.trim(), max = +inp.dataset.max, tr = inp.closest("tr");
      if (raw === "") { inp.classList.remove("bad"); queueMark(inp.dataset.a, tr.dataset.s, null); return recalc(tr); }
      const v = +raw.replace(",", ".");
      if (isNaN(v) || v < 0 || v > max) { inp.classList.add("bad"); inp.title = `Enter a number from 0 to ${max}`; return; }
      inp.classList.remove("bad"); inp.title = ""; queueMark(inp.dataset.a, tr.dataset.s, Math.round(v * 100) / 100); recalc(tr);
    };
    tb.addEventListener("input", (e) => e.target.classList.contains("mi") && apply(e.target));
    tb.addEventListener("focusin", (e) => e.target.classList.contains("mi") && e.target.select());
    const grid = () => $$("#mtb tr").filter((r) => r.style.display !== "none").map((r) => $$("input.mi", r));
    const pos = (inp) => { const g = grid(); for (let r = 0; r < g.length; r++) { const c = g[r].indexOf(inp); if (c >= 0) return [g, r, c]; } return [g, -1, -1]; };
    tb.addEventListener("keydown", (e) => {
      const inp = e.target; if (!inp.classList.contains("mi")) return;
      const [g, r, c] = pos(inp); let nr = r, nc = c;
      if (e.key === "Enter" || e.key === "ArrowDown") nr = r + (e.shiftKey && e.key === "Enter" ? -1 : 1);
      else if (e.key === "ArrowUp") nr = r - 1;
      else if (e.key === "ArrowRight" && inp.selectionStart === inp.value.length) nc = c + 1;
      else if (e.key === "ArrowLeft" && inp.selectionStart === 0) nc = c - 1;
      else return;
      const t = g[nr]?.[nc]; if (t) { e.preventDefault(); t.focus(); }
    });
    tb.addEventListener("paste", (e) => {
      const inp = e.target; if (!inp.classList.contains("mi")) return;
      const text = e.clipboardData.getData("text"); if (!/[\t\n]/.test(text.trim())) return;
      e.preventDefault();
      const [g, r, c] = pos(inp), lines = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
      let n = 0, bad = 0;
      lines.forEach((cells, i) => cells.forEach((v, j) => { const t = g[r + i]?.[c + j]; if (!t) return; t.value = v.trim(); apply(t); n++; if (t.classList.contains("bad")) bad++; }));
      App.toast(bad ? `${n} cells pasted — ${bad} need checking (shown in red)` : `${n} marks pasted`, !!bad);
    });
  }
  const gradeTone = (g) => (!g ? "" : g === "F" ? "red" : /^A/.test(g) ? "green" : /^B/.test(g) ? "blue" : /^(I|W|UW)$/.test(g) ? "violet" : "amber");

  function marksEmpty() {
    const P = Grade.PRESETS;
    $("#tab").innerHTML = `<div class="card"><div class="empty" style="padding-bottom:20px"><div class="ic">${icon("book")}</div><h3>Set Up the Assessment Plan</h3>
        <p>Choose a ready-made plan that matches your Portfolio file, or build your own. You can change every item, mark and weight afterwards.</p></div>
      <div class="grid cols-3">${Object.entries(P).map(([k, p]) => `<button class="sec-card" data-preset="${k}" style="cursor:pointer;text-align:left;font:inherit">
          <div class="top"><div class="grow"><div class="code">${k === "theory" || k === "lab" ? "General" : "Your Course"}</div><div class="title">${esc(p.label)}</div></div><div class="sec-letter">${icon("layers")}</div></div>
          <div class="small muted">${planSummary(p)}</div></button>`).join("")}
        <button class="sec-card" id="ownplan" style="cursor:pointer;text-align:left;font:inherit"><div class="top"><div class="grow"><div class="code">Custom</div><div class="title">Build My Own</div></div><div class="sec-letter">${icon("plus")}</div></div>
          <div class="small muted">Start empty and add your own quizzes, assignments and exams.</div></button></div></div>`;
    $$("[data-preset]").forEach((b) => (b.onclick = () => applyPreset(b.dataset.preset)));
    $("#ownplan").onclick = planEditor;
  }
  function planSummary(p) {
    const rows = Grade.termRows(p.plan.filter((x) => x.term === 0).map((x, i) => ({ ...x, sort: i })));
    return `${esc(p.note || "")} · Mid ${p.termWeights[0]}% / Final ${p.termWeights[1]}%`;
  }
  async function ensureTwoTerms() {
    const t = [...S.terms].sort(bySort);
    if (t.length < 1) { const x = await q(sb.from("terms").insert({ section_id: S.sec.id, name: "Mid Term", sort: 1 }).select().single()); x.classes = []; S.terms.push(x); t.push(x); }
    if (t.length < 2) { const x = await q(sb.from("terms").insert({ section_id: S.sec.id, name: "Final Term", sort: 2 }).select().single()); x.classes = []; S.terms.push(x); t.push(x); }
    return t;
  }
  async function applyPreset(key) {
    const p = Grade.PRESETS[key], hasMarks = Object.values(S.marks).some((m) => Object.values(m).some((v) => v != null));
    if (!(await App.confirm(`Use “${p.label}”?`, hasMarks ? "This replaces the current assessment plan. Marks already entered for the current plan will be deleted." : "The plan is created for Mid Term and Final Term. You can edit it afterwards.", "Use This Plan", hasMarks))) return;
    try {
      const terms = await ensureTwoTerms();
      if (S.assess.length) await q(sb.from("assessments").delete().eq("section_id", S.sec.id));
      await q(sb.from("assessments").insert(p.plan.map((x, i) => ({ section_id: S.sec.id, term_id: terms[x.term].id, name: x.name, grp: x.grp || null, rule: x.rule || "sum", kind: x.kind || "marks",
        max_marks: x.max_marks, weight: x.weight, co: x.co || null, by_group: !!x.by_group, visible: true, sort: i + 1 }))));
      for (let i = 0; i < 2; i++) { await q(sb.from("terms").update({ weight: p.termWeights[i] }).eq("id", terms[i].id)); terms[i].weight = p.termWeights[i]; }
      if (p.cos.length && !(S.sec.course.cos || []).length) { await q(sb.from("courses").update({ cos: p.cos }).eq("id", S.sec.course.id)); S.sec.course.cos = p.cos; }
      await loadMarks(); drawSection(); App.toast("Assessment Plan Ready — Start Entering Marks");
    } catch (x) { fail(x); }
  }

  // ---------- Assessment plan editor
  async function planEditor() {
    const terms = [...S.terms].sort(bySort);
    if (!terms.length) return App.toast("Add a Term in the Classes Tab First", true);
    let local = S.assess.map((a) => ({ ...a })).sort(bySort), cur = UI[S.sec.id].mterm || terms[0].id;
    const tw = Object.fromEntries(terms.map((t) => [t.id, t.weight ?? ""]));
    const cos = (S.sec.course.cos || []).map((c) => c.code);
    const dlgP = App.dialog({ title: "Assessment Plan", ic: "settings", okText: "Save Plan", html: true, wide: true, body: "<div id='pe'></div>",
      validate: () => { const bad = local.find((a) => !a.name.trim() || !(+a.max_marks > 0) || isNaN(+a.weight)); return bad ? `Check “${bad.name || "(no name)"}”: it needs a name, a full mark above 0 and a weight.` : null; } });
    const m = $$(".modal-bg").pop(); m.querySelector(".modal").style.maxWidth = "1180px";
    const box = m.querySelector("#pe");
    const termSum = (tid) => Grade.termRows(local.filter((a) => a.term_id === tid)).reduce((n, r) => n + Grade.rowWeight(r), 0);
    const draw = () => {
      const rows = local.filter((a) => a.term_id === cur), groups = [...new Set(local.map((a) => a.grp).filter(Boolean))];
      const ws = termSum(cur), twSum = terms.reduce((n, t) => n + (+tw[t.id] || 0), 0);
      box.innerHTML = `<div class="row center-y" style="justify-content:space-between;margin-bottom:14px">
          <div class="seg" id="pt">${terms.map((t) => `<button data-t="${t.id}" class="${t.id === cur ? "on" : ""}">${esc(t.name)} <span class="faint">${fmt(termSum(t.id), 2)}%</span></button>`).join("")}</div>
          <select id="ppre" style="width:auto"><option value="">Replace with a preset…</option>${Object.entries(Grade.PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select></div>
        <div class="row center-y small" style="gap:14px;margin-bottom:14px;padding:12px 14px;border-radius:12px;background:var(--surface-2)"><b>Share of the course total:</b>
          ${terms.map((t) => `<label class="row center-y" style="gap:8px;margin:0;font-weight:500">${esc(t.name)} <input data-tw="${t.id}" type="number" min="0" max="100" step="5" value="${tw[t.id]}" style="width:76px;min-height:34px;padding:4px 8px" /> %</label>`).join("")}
          <span class="weight-meter ${Math.abs(twSum - 100) < 0.01 ? "ok" : "bad"}">${fmt(twSum, 2)}%</span><span class="faint">AIUB: Mid 40% · Final 60%</span></div>
        <datalist id="grps">${groups.map((g) => `<option value="${esc(g)}">`).join("")}</datalist><datalist id="cosl">${cos.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        <div class="table-wrap" style="max-height:440px"><table class="plan-table"><thead><tr><th></th><th>Group <span class="faint">(Optional)</span></th><th>Assessment</th><th>Group Rule</th><th>Type</th><th class="num">Full Mark</th><th class="num">Weight %</th><th>CO</th><th class="center" title="One Mark for the Whole Project Group">Group Mark</th><th class="center" title="Students Can See This Mark">Visible</th><th></th></tr></thead>
          <tbody>${rows.map((a) => { const i = local.indexOf(a); return `<tr data-i="${i}">
            <td class="nowrap"><button class="icon-btn" data-up="${i}" title="Move Up" style="width:28px;height:28px;transform:rotate(90deg)">${icon("back")}</button></td>
            <td><input data-f="grp" list="grps" value="${esc(a.grp || "")}" placeholder="—" style="min-width:140px" /></td>
            <td><input data-f="name" value="${esc(a.name)}" style="min-width:230px" /></td>
            <td><select data-f="rule" style="min-width:128px" ${a.grp ? "" : "disabled"}>${Object.entries(Grade.RULES).map(([k, l]) => `<option value="${k}" ${a.rule === k ? "selected" : ""}>${l}</option>`).join("")}</select></td>
            <td><select data-f="kind" style="min-width:138px"><option value="marks" ${a.kind !== "attendance" ? "selected" : ""}>Marks</option><option value="attendance" ${a.kind === "attendance" ? "selected" : ""}>Attendance</option></select></td>
            <td><input data-f="max_marks" type="number" min="0.5" step="0.5" value="${a.max_marks}" style="width:80px" /></td>
            <td><input data-f="weight" type="number" min="0" max="100" step="0.5" value="${a.weight}" style="width:80px" /></td>
            <td><input data-f="co" list="cosl" value="${esc(a.co || "")}" placeholder="—" style="width:72px" /></td>
            <td class="chk"><input type="checkbox" data-f="by_group" ${a.by_group ? "checked" : ""} /></td>
            <td class="chk"><input type="checkbox" data-f="visible" ${a.visible !== false ? "checked" : ""} /></td>
            <td><button class="icon-btn danger" data-del="${i}" title="Remove">${icon("trash")}</button></td></tr>`; }).join("") || `<tr><td colspan="11"><div class="empty" style="padding:22px">No assessments in this term yet.</div></td></tr>`}</tbody></table></div>
        <div class="row center-y" style="justify-content:space-between;margin-top:14px">
          <div class="btn-group"><button class="btn sm secondary" id="padd">${icon("plus")} Add Assessment</button><button class="btn sm secondary" id="patt">${icon("calendar")} Add Attendance Marks</button></div>
          <span class="weight-meter ${Math.abs(ws - 100) < 0.01 ? "ok" : "bad"}">${icon(Math.abs(ws - 100) < 0.01 ? "check" : "alert")} This term adds up to ${fmt(ws, 2)}%${Math.abs(ws - 100) < 0.01 ? "" : " — should be 100%"}</span></div>
        <p class="hint" style="margin-top:12px"><b>Weight</b> is how many % of the term total an item is worth. A 100-mark exam that counts 60% has Full Mark 100, Weight 60.
          Items with the same <b>Group</b> are shown together: <b>Add Up</b> adds them (exam parts, rubric criteria), <b>Add Up &amp; Round Up</b> rounds the group up to whole marks (project rubric components),
          <b>Best One</b> counts only the best quiz — parts of one quiz are named “Quiz 1 · …”.
          <b>Attendance</b> items are filled in automatically from the attendance record.</p>`;
      box.querySelectorAll("#pt button").forEach((b) => (b.onclick = () => { cur = b.dataset.t; draw(); }));
      box.querySelectorAll("[data-tw]").forEach((inp) => (inp.oninput = () => { tw[inp.dataset.tw] = inp.value; }));
      box.querySelectorAll("[data-tw]").forEach((inp) => (inp.onchange = draw));
      box.querySelectorAll("tr[data-i]").forEach((tr) => {
        const a = local[+tr.dataset.i];
        tr.querySelectorAll("[data-f]").forEach((el) => {
          const f = el.dataset.f;
          el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", () => {
            a[f] = el.type === "checkbox" ? el.checked : f === "max_marks" || f === "weight" ? +el.value : el.value.trim() ? el.value : f === "name" ? "" : null;
            if (f === "kind" && a.kind === "attendance") { a.max_marks = a.weight || 10; }
            if (f === "grp" && !a.grp) a.rule = "sum";
            if (f === "grp" && a.grp) { const sib = local.find((x) => x !== a && x.grp === a.grp && x.term_id === a.term_id); if (sib) a.rule = sib.rule; }
            if (f === "rule" && a.grp) local.filter((x) => x.grp === a.grp && x.term_id === a.term_id).forEach((x) => (x.rule = a.rule));
          });
          if (["weight", "grp", "rule", "kind"].includes(f)) el.addEventListener("change", draw);
        });
      });
      box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { local.splice(+b.dataset.del, 1); draw(); }));
      box.querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => { const i = +b.dataset.up, mine = local.filter((a) => a.term_id === cur), k = mine.indexOf(local[i]); if (k <= 0) return;
        const j = local.indexOf(mine[k - 1]); [local[i], local[j]] = [local[j], local[i]]; draw(); }));
      box.querySelector("#padd").onclick = () => { local.push({ term_id: cur, name: "New Assessment", grp: null, rule: "sum", kind: "marks", max_marks: 10, weight: 10, co: null, by_group: false, visible: true }); draw(); box.querySelector("tbody tr:last-child [data-f=name]")?.select(); };
      box.querySelector("#patt").onclick = () => { local.unshift({ term_id: cur, name: "Attendance", grp: null, rule: "sum", kind: "attendance", max_marks: 10, weight: 10, co: null, by_group: false, visible: true }); draw(); };
      box.querySelector("#ppre").onchange = async (e) => {
        const p = Grade.PRESETS[e.target.value]; if (!p) return;
        if (!(await App.confirm(`Replace with “${p.label}”?`, "Every term's items in this editor are replaced. Nothing is saved until you press Save Plan.", "Replace", false))) { e.target.value = ""; return; }
        const t2 = terms; local = p.plan.filter((x) => t2[x.term]).map((x) => ({ term_id: t2[x.term].id, name: x.name, grp: x.grp || null, rule: x.rule || "sum", kind: x.kind || "marks", max_marks: x.max_marks, weight: x.weight, co: x.co || null, by_group: !!x.by_group, visible: true }));
        terms.forEach((t, i) => (tw[t.id] = p.termWeights[i] ?? tw[t.id])); local._cos = p.cos; draw();
      };
    };
    draw();
    const ok = await dlgP; if (!ok) return;
    try {
      const keep = new Set(local.filter((a) => a.id).map((a) => a.id)), gone = S.assess.filter((a) => !keep.has(a.id));
      const lost = gone.filter((a) => Object.values(S.marks[a.id] || {}).some((v) => v != null));
      if (lost.length && !(await App.confirm("Delete marks?", `${lost.length} removed item${lost.length > 1 ? "s have" : " has"} marks entered (${lost.map((a) => a.name).slice(0, 4).join(", ")}${lost.length > 4 ? "…" : ""}). Those marks will be deleted.`, "Delete & Save"))) return;
      for (let i = 0; i < gone.length; i += 100) await q(sb.from("assessments").delete().in("id", gone.slice(i, i + 100).map((a) => a.id)));
      const order = terms.flatMap((t) => local.filter((a) => a.term_id === t.id));
      const clean = (a, i) => ({ section_id: S.sec.id, term_id: a.term_id, name: a.name.trim(), grp: a.grp ? a.grp.trim() : null, rule: a.grp ? a.rule : "sum", kind: a.kind, max_marks: +a.max_marks, weight: +a.weight, co: a.co ? a.co.trim().toUpperCase() : null, by_group: !!a.by_group, visible: a.visible !== false, sort: i + 1 });
      const ins = [], upd = [];
      order.forEach((a, i) => (a.id ? upd.push([a.id, clean(a, i)]) : ins.push(clean(a, i))));
      if (ins.length) await q(sb.from("assessments").insert(ins));
      for (let i = 0; i < upd.length; i += 10) await Promise.all(upd.slice(i, i + 10).map(([id, row]) => q(sb.from("assessments").update(row).eq("id", id))));
      for (const t of terms) { const w = tw[t.id] === "" || tw[t.id] == null ? null : +tw[t.id]; if (w !== (t.weight == null ? null : +t.weight)) { await q(sb.from("terms").update({ weight: w }).eq("id", t.id)); t.weight = w; } }
      if (local._cos && local._cos.length && !(S.sec.course.cos || []).length) { await q(sb.from("courses").update({ cos: local._cos }).eq("id", S.sec.course.id)); S.sec.course.cos = local._cos; }
      await loadMarks(); drawSection();
      const bad = terms.filter((t) => Math.abs(termSum(t.id) - 100) > 0.01 && local.some((a) => a.term_id === t.id));
      App.toast(bad.length ? `Plan saved — ${bad.map((t) => t.name).join(", ")} does not add up to 100%` : "Assessment Plan Saved", !!bad.length);
    } catch (x) { fail(x); }
  }

  function marksTemplate(T) {
    const items = S.assess.filter((a) => a.term_id === T.id && a.kind !== "attendance").sort(bySort);
    const hdr = ["Student ID", "Student Name", ...items.map((a) => `${itemLabel(a)} (/${fmt(a.max_marks, 2)})`)];
    const rows = S.students.map((s) => [s.student_id, s.name, ...items.map((a) => markOf(a.id, s.student_id) ?? "")]);
    const ws = XLSX.utils.aoa_to_sheet([hdr, ...rows]); ws["!cols"] = [{ wch: 13 }, { wch: 32 }, ...items.map((a) => ({ wch: Math.min(28, Math.max(10, itemLabel(a).length + 6)) }))];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, T.name.slice(0, 31));
    XLSX.writeFile(wb, `Marks_${safe(S.sec.course.code)}_Sec-${safe(S.sec.name)}_${safe(T.name)}.xlsx`);
  }
  function pickMarksFile(T) {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xlsx,.xls,.csv";
    inp.onchange = () => inp.files[0] && uploadMarks(T, inp.files[0]); inp.click();
  }
  async function uploadMarks(T, file) {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
      const hr = rows.findIndex((r) => r.some((c) => /^student\s*id$/i.test(String(c).trim())));
      if (hr < 0) throw new Error("Could not find a “Student ID” column. Use Download Marks Sheet to get the right format.");
      const H = rows[hr].map((c) => String(c).trim()), idc = H.findIndex((c) => /^student\s*id$/i.test(c));
      const items = S.assess.filter((a) => a.term_id === T.id && a.kind !== "attendance");
      const norm = (s) => s.toLowerCase().replace(/\s*\(\/[\d.]+\)\s*$/, "").replace(/\s+/g, " ").trim();
      const map = H.map((h) => items.find((a) => norm(itemLabel(a)) === norm(h) || norm(a.name) === norm(h) && !items.some((b) => b !== a && norm(b.name) === norm(h))));
      if (!map.some(Boolean)) throw new Error(`None of the columns match ${T.name} assessments. Use Download Marks Sheet to get the right format.`);
      const known = new Set(S.students.map((s) => s.student_id)); let cells = 0, bad = 0; const unknown = [], vals = [];
      for (let r = hr + 1; r < rows.length; r++) {
        const id = normId(rows[r][idc]); if (!id) continue;
        if (!known.has(id)) { unknown.push(id); continue; }
        map.forEach((a, c) => { if (!a) return; const raw = rows[r][c]; if (raw === "" || raw == null) return; const v = +String(raw).replace(",", ".");
          if (isNaN(v) || v < 0 || v > a.max_marks) { bad++; return; } vals.push([a.id, id, Math.round(v * 100) / 100]); cells++; });
      }
      const d = await App.dialog({ title: "Upload Marks", ic: "upload", okText: `Save ${cells} Marks`, html: true,
        body: `<p><b>${cells}</b> marks found for <b>${map.filter(Boolean).length}</b> ${T.name} assessments.</p>
          ${bad ? `<div class="msg warn">${icon("alert")}<div>${bad} values are not numbers or are above the full mark — they will be skipped.</div></div>` : ""}
          ${unknown.length ? `<div class="msg warn">${icon("alert")}<div>${unknown.length} Student IDs are not in this section and will be skipped: ${esc(unknown.slice(0, 6).join(", "))}${unknown.length > 6 ? "…" : ""}</div></div>` : ""}` });
      if (!d || !cells) return;
      vals.forEach(([a, s, v]) => queueMark(a, s, v)); await flushMarks(); drawSection(); App.toast(`${cells} marks saved`);
    } catch (x) { fail(x); }
  }

  // ---------- Groups tab
  function tabGroups() {
    const gAss = S.assess.filter((a) => a.by_group && a.kind !== "attendance").sort(bySort), mg = maxGroups();
    const inGroup = new Set(S.members.map((m) => m.student_id)), free = S.students.filter((s) => !inGroup.has(s.student_id));
    const nameOf = (sid) => S.students.find((s) => s.student_id === sid)?.name || "";
    $("#tab").innerHTML = `<div class="card" style="margin-bottom:20px"><div class="card-head" style="margin:0"><div><h2>Project Groups</h2>
        <div class="sub">${S.groups.length} of up to ${mg} groups · ${S.members.length} of ${S.students.length} students placed${free.length ? ` · <b class="pct-warn">${free.length} not in a group</b>` : ""} · The same groups are used for every term.</div></div>
        <div class="btn-group"><button class="btn" id="gnew" ${S.groups.length >= mg ? "disabled" : ""}>${icon("plus")} New Group</button><button class="btn secondary" id="gauto">${icon("zap")} Auto-Create</button>
          ${S.groups.length ? `<button class="icon-btn bordered" id="gmenu">${icon("dots")}</button>` : ""}</div></div></div>
      ${gAss.length ? "" : `<div class="msg info" style="margin:0 0 20px">${icon("info")}<div>Tip: in the Assessment Plan, tick <b>Group Mark</b> on project items. Then you can give one mark per group here and every member gets it.</div></div>`}
      ${S.groups.length ? `<div class="grp-grid">${S.groups.map((g) => { const mem = S.members.filter((m) => m.group_id === g.id);
        return `<div class="grp-card" data-g="${g.id}"><div class="row center-y" style="gap:10px"><div class="sec-letter" style="width:40px;height:40px;border-radius:11px;display:grid;place-items:center;font-weight:800;background:var(--primary-soft);color:var(--primary)">${esc(g.name.replace(/\D/g, "") || g.name[0])}</div>
            <div class="grow"><b>${esc(g.name)}</b><div class="xs muted">${g.title ? esc(g.title) : "No Project Title"}</div></div>
            <button class="icon-btn" data-gedit="${g.id}" title="Rename">${icon("edit")}</button><button class="icon-btn danger" data-gdel="${g.id}" title="Delete">${icon("trash")}</button></div>
          <div class="members">${mem.map((m) => `<div class="member"><b>${esc(m.student_id)}</b><span class="grow">${esc(nameOf(m.student_id))}</span><button class="icon-btn" data-mrem="${m.id}" title="Remove" style="width:28px;height:28px">${icon("x")}</button></div>`).join("") || `<span class="small faint">No Members Yet</span>`}</div>
          ${free.length ? `<select data-madd="${g.id}"><option value="">+ Add a student…</option>${free.map((s) => `<option value="${esc(s.student_id)}">${esc(s.student_id)} — ${esc(s.name)}</option>`).join("")}</select>` : ""}
          ${gAss.length && mem.length ? `<div class="grp-marks">${gAss.map((a) => { const vals = mem.map((m) => markOf(a.id, m.student_id)), same = vals.every((v) => v === vals[0]);
            return `<span>${esc(itemLabel(a))} <span class="faint xs">/ ${fmt(a.max_marks, 2)} · ${esc(S.terms.find((t) => t.id === a.term_id)?.name || "")}</span></span>
              <input inputmode="decimal" data-gm="${a.id}" data-max="${a.max_marks}" value="${same && vals[0] != null ? vals[0] : ""}" placeholder="${same ? "" : "Mixed"}" />`; }).join("")}</div>` : ""}</div>`; }).join("")}</div>`
      : `<div class="card"><div class="empty"><div class="ic">${icon("users")}</div><h3>No Groups Yet</h3><p>Create groups one by one, or let the app make them from the student list.</p></div></div>`}`;
    $("#gnew").onclick = () => editGroup(null);
    $("#gauto").onclick = autoGroups;
    const gm = $("#gmenu"); if (gm) gm.onclick = (e) => popover(e.currentTarget, `<button data-v="clear" style="color:var(--danger)">${icon("trash")} Delete All Groups</button>`, async () => {
      if (!(await App.confirm("Delete all groups?", "Every group and its member list will be deleted. Marks already given stay with each student."))) return;
      try { await q(sb.from("groups").delete().eq("section_id", S.sec.id)); await loadGroups(); drawSection(); } catch (x) { fail(x); } });
    $$("[data-gedit]").forEach((b) => (b.onclick = () => editGroup(S.groups.find((g) => g.id === b.dataset.gedit))));
    $$("[data-gdel]").forEach((b) => (b.onclick = async () => { const g = S.groups.find((x) => x.id === b.dataset.gdel);
      if (!(await App.confirm(`Delete ${g.name}?`, "The group is removed. Its members become unassigned; their marks stay."))) return;
      try { await q(sb.from("groups").delete().eq("id", g.id)); await loadGroups(); drawSection(); } catch (x) { fail(x); } }));
    $$("[data-mrem]").forEach((b) => (b.onclick = async () => { try { await q(sb.from("group_members").delete().eq("id", +b.dataset.mrem)); await loadGroups(); drawSection(); } catch (x) { fail(x); } }));
    $$("[data-madd]").forEach((sel) => (sel.onchange = async () => { if (!sel.value) return;
      try { await q(sb.from("group_members").insert({ group_id: sel.dataset.madd, section_id: S.sec.id, student_id: sel.value })); await loadGroups(); drawSection(); } catch (x) { fail(x); } }));
    $$("[data-gm]").forEach((inp) => (inp.onchange = async () => {
      const raw = inp.value.trim(), max = +inp.dataset.max, v = raw === "" ? null : +raw.replace(",", ".");
      if (v != null && (isNaN(v) || v < 0 || v > max)) { inp.classList.add("bad"); return App.toast(`Enter a number from 0 to ${max}`, true); }
      const g = inp.closest("[data-g]").dataset.g; S.members.filter((m) => m.group_id === g).forEach((m) => queueMark(inp.dataset.gm, m.student_id, v == null ? null : Math.round(v * 100) / 100));
      await flushMarks(); App.toast("Group Mark Saved for Every Member");
    }));
  }
  async function editGroup(g) {
    const n = S.groups.length + 1;
    const d = await App.dialog({ title: g ? "Edit Group" : "New Group", ic: g ? "edit" : "plus", okText: g ? "Save" : "Create Group", html: true,
      body: `<label>Group Name</label><input id="gn" maxlength="40" value="${esc(g?.name || `Group ${App.pad2(n)}`)}" /><div class="field-gap"></div>
        <label>Project Title <span class="faint">(Optional)</span></label><input id="gt" maxlength="160" value="${esc(g?.title || "")}" placeholder="e.g. Online Library System" />`,
      validate: (m) => (!m.querySelector("#gn").value.trim() ? "Type a group name." : null) });
    if (!d) return;
    const row = { name: d.querySelector("#gn").value.trim(), title: d.querySelector("#gt").value.trim() || null };
    try { if (g) await q(sb.from("groups").update(row).eq("id", g.id)); else await q(sb.from("groups").insert({ ...row, section_id: S.sec.id, sort: n })); await loadGroups(); drawSection(); } catch (x) { fail(x); }
  }
  async function autoGroups() {
    const mg = maxGroups(), inGroup = new Set(S.members.map((m) => m.student_id)), free = S.students.filter((s) => !inGroup.has(s.student_id));
    if (!free.length) return App.toast("Every Student Is Already in a Group");
    const d = await App.dialog({ title: "Auto-Create Groups", ic: "zap", okText: "Create Groups", html: true,
      body: `<p>${free.length} students are not in a group yet.</p><div class="grid cols-2"><div><label>Number of Groups</label><input id="ag_n" type="number" min="1" max="${mg}" value="${Math.min(mg, Math.max(1, Math.ceil(free.length / 4)))}" /><p class="hint">Up to ${mg} for this section.</p></div>
        <div><label>Order</label><select id="ag_o"><option value="seq">Student list order</option><option value="rand">Random</option></select></div></div>` });
    if (!d) return;
    const n = Math.max(1, Math.min(mg, +d.querySelector("#ag_n").value || 1)), list = [...free];
    if (d.querySelector("#ag_o").value === "rand") for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    try {
      const have = S.groups.length, need = Math.max(0, n - have);
      if (need) await q(sb.from("groups").insert(Array.from({ length: need }, (_, k) => ({ section_id: S.sec.id, name: `Group ${App.pad2(have + k + 1)}`, sort: have + k + 1 }))));
      await loadGroups();
      const gs = S.groups.slice(0, n), size = Object.fromEntries(gs.map((g) => [g.id, S.members.filter((m) => m.group_id === g.id).length]));
      const rows = list.map((s) => { const g = gs.reduce((a, b) => (size[b.id] < size[a.id] ? b : a)); size[g.id]++; return { group_id: g.id, section_id: S.sec.id, student_id: s.student_id }; });
      for (let i = 0; i < rows.length; i += 500) await q(sb.from("group_members").insert(rows.slice(i, i + 500)));
      await loadGroups(); drawSection(); App.toast(`${rows.length} students placed in ${n} groups`);
    } catch (x) { fail(x); }
  }

  // ---------- Results tab
  function tabResults(X) {
    const ui = UI[S.sec.id], R = allResults(), scale = [...(S.sec.grade_scale || Grade.AIUB_SCALE)].sort((a, b) => b.min - a.min);
    if (!S.assess.length) { $("#tab").innerHTML = `<div class="card"><div class="empty"><div class="ic">${icon("chart")}</div><h3>No Results Yet</h3><p>Set up the assessment plan in the Marks tab, then enter marks — results and grades appear here.</p><button class="btn" id="tomarks">${icon("book")} Go to Marks</button></div></div>`; $("#tomarks").onclick = () => go(`#/section/${S.sec.id}/marks`); return; }
    const list = S.students.map((s, i) => { const r = R[s.student_id], fin = r.complete || !!r.grade?.special;
      return { s, i, r, fin, key: fin ? r.overall : r.standing ?? 0, g: fin ? r.grade : r.standingGrade }; });
    const anyOpen = list.some((x) => !x.fin);
    // Only students who have at least one graded mark count towards the section figures
    const counted = list.filter((x) => x.fin || x.r.standing != null), totals = counted.map((x) => x.key), avg = totals.length ? totals.reduce((n, x) => n + x, 0) / totals.length : null;
    const pass = counted.filter((x) => x.g && x.g.grade !== "F" && !x.g.special).length;
    const dist = scale.map((g) => ({ g: g.grade, n: list.filter((x) => x.g?.grade === g.grade).length })), dmax = Math.max(1, ...dist.map((d) => d.n));
    const coCodes = [...new Set(list.flatMap((x) => x.r.coList.map((c) => c.code)))];
    const coSum = coCodes.map((code) => { const xs = list.map((x) => x.r.coList.find((c) => c.code === code)).filter((c) => c && c.pct != null);
      return { code, n: xs.length, att: xs.filter((c) => c.attained).length, avg: xs.length ? Math.round(xs.reduce((a, c) => a + c.pct, 0) / xs.length) : null }; });
    const sorters = { seq: (a, b) => a.i - b.i, high: (a, b) => b.key - a.key, low: (a, b) => a.key - b.key, id: (a, b) => a.s.student_id.localeCompare(b.s.student_id) };
    list.sort(sorters[ui.rsort] || sorters.seq);
    $("#tab").innerHTML = `
      <div class="card" style="margin-bottom:20px;padding-top:18px;padding-bottom:18px"><div class="row center-y" style="gap:16px">
        <div class="stat" style="border:0;box-shadow:none;padding:0;background:none;min-height:0"><div class="ic ${S.sec.portfolio_published ? "green" : ""}">${icon(S.sec.portfolio_published ? "eye" : "eyeoff")}</div></div>
        <div class="grow"><b>${S.sec.portfolio_published ? "Portfolios Are Published" : "Portfolios Are Not Published Yet"}</b>
          <div class="small muted">${S.sec.portfolio_published ? "Students see their marks, grade, COs and attendance in the Student Portal by typing their ID. Items marked Hidden in the plan are not shown." : "Students can still mark attendance. Publish when you want them to see their marks and grades."}</div></div>
        <label class="switch" style="align-items:center"><input type="checkbox" id="pub" ${S.sec.portfolio_published ? "checked" : ""} /> <b>Show to Students</b></label></div></div>
      <div class="stats" style="margin-bottom:20px">
        <div class="stat"><div class="ic">${icon("chart")}</div><div><div class="k">Section Average${anyOpen ? " (So Far)" : ""}</div><div class="v">${avg == null ? "—" : fmt(avg)}</div></div></div>
        <div class="stat"><div class="ic green">${icon("zap")}</div><div><div class="k">Highest</div><div class="v">${totals.length ? fmt(Math.max(...totals)) : "—"}</div></div></div>
        <div class="stat"><div class="ic amber">${icon("target")}</div><div><div class="k">Lowest</div><div class="v">${totals.length ? fmt(Math.min(...totals)) : "—"}</div></div></div>
        <div class="stat"><div class="ic violet">${icon("check")}</div><div><div class="k">Passing (D or Above)</div><div class="v">${pass}<small> / ${counted.length}${counted.length < list.length ? ` graded` : ""}</small></div></div></div></div>
      <div class="grid cols-2" style="margin-bottom:20px;align-items:start">
        <div class="card"><div class="card-head"><div><h2>Grade Distribution</h2><div class="sub">${anyOpen ? "Current standing — based on the marks entered so far" : "Final Grades"}</div></div></div>
          <div class="dist">${dist.map((d) => `<div class="d ${d.g === "F" ? "F" : ""}"><b>${d.n}</b><div class="f" style="height:${(d.n / dmax) * 75}%"></div><span>${esc(d.g)}</span></div>`).join("")}</div></div>
        <div class="card"><div class="card-head"><div><h2>Course Outcome Attainment</h2><div class="sub">Students reaching ${S.sec.course.co_target ?? 60}% of each CO's marks</div></div></div>
          ${coSum.length ? `<div class="bands">${coSum.map((c) => { const p = c.n ? Math.round((c.att / c.n) * 100) : 0; return `<div class="band" style="grid-template-columns:56px 1fr 120px"><b style="color:var(--excused)">${esc(c.code)}</b>
            <div class="progress ${p < 50 ? "bad" : p < 70 ? "warn" : ""}"><span style="width:${p}%"></span></div><span class="num small">${c.att}/${c.n} · <b>${p}%</b></span></div>`; }).join("")}</div>
            <p class="hint">Average CO score: ${coSum.map((c) => `${esc(c.code)} ${c.avg == null ? "—" : c.avg + "%"}`).join(" · ")}</p>`
          : `<div class="empty" style="padding:24px"><p style="margin:0">Tag assessments with a CO in the Assessment Plan to see attainment.</p></div>`}</div></div>
      <div class="card flush"><div class="card-head" style="padding-bottom:16px"><div class="row center-y grow">
          <div class="search" style="flex:1;min-width:200px;max-width:320px">${icon("search")}<input id="rq" placeholder="Search ID or Name" value="${esc(ui.q)}" /></div>
          <select id="rs" style="width:auto"><option value="seq">List Order</option><option value="high">Highest Total</option><option value="low">Lowest Total</option><option value="id">Student ID</option></select></div>
        <button class="btn sm secondary" id="rx">${icon("download")} Export Results</button></div>
        <div class="table-wrap keep" style="max-height:640px;border-radius:0;border-left:0;border-right:0;border-bottom:0"><table class="res-table"><thead><tr><th>Student ID</th><th>Name</th>
          ${S.terms.map((t) => `<th class="num">${esc(t.name)}</th>`).join("")}<th class="num" title="All Marks So Far, Out of 100">Grand Total</th><th class="num" title="Score on the Marks Entered So Far">Standing</th><th>Grade</th><th class="num">Point</th><th class="num">Attendance</th>${coCodes.length ? `<th class="num">COs</th>` : ""}<th>Special</th><th></th></tr></thead>
          <tbody id="rtb">${list.map(({ s, r, fin, g }) => `<tr data-q="${esc((s.student_id + " " + s.name).toLowerCase())}">
            <td><b>${esc(s.student_id)}</b></td><td>${esc(s.name)}</td>
            ${r.terms.map((t) => `<td class="num">${t.empty ? "—" : `${fmt(t.total)} <span class="faint xs">${esc(t.grade?.grade || "")}</span>`}</td>`).join("")}
            <td class="num"><b style="font-size:15px">${fmt(r.overall)}</b></td>
            <td class="num">${r.standing == null ? "—" : `${fmt(r.standing)}%`}</td>
            <td>${!g ? `<span class="faint">—</span>` : `<span class="grade-pill sm ${gradeTone(g?.grade)}" style="${fin ? "" : "background:transparent;box-shadow:inset 0 0 0 1.5px currentColor"}" title="${fin ? "Final Grade" : "Current Standing — Not Final"}">${esc(g?.grade || "—")}</span>${fin ? "" : ` <span class="faint xs">So Far</span>`}`}</td>
            <td class="num">${fin && g?.point != null ? (+g.point).toFixed(2) : "—"}</td>
            <td class="num ${App.pctClass(r.attPct, X.min)}">${r.attPct == null ? "—" : r.attPct + "%"}</td>
            ${coCodes.length ? `<td class="num">${r.coAttained} / ${r.coList.length}</td>` : ""}
            <td><select data-sg="${s.id}" style="width:auto;min-height:32px;padding:3px 30px 3px 9px;font-size:13px"><option value="">—</option>${["I", "W", "UW"].map((g) => `<option ${s.special_grade === g ? "selected" : ""}>${g}</option>`).join("")}</select></td>
            <td class="actions"><button class="btn sm secondary" data-pf="${esc(s.student_id)}">${icon("book")} Portfolio</button></td></tr>`).join("")}</tbody></table></div></div>`;
    $("#rs").value = ui.rsort || "seq"; $("#rs").onchange = (e) => { ui.rsort = e.target.value; drawSection(); };
    const f = () => { const v = ui.q.toLowerCase(); $$("#rtb tr").forEach((r) => (r.style.display = !v || r.dataset.q.includes(v) ? "" : "none")); };
    $("#rq").oninput = (e) => { ui.q = e.target.value; f(); }; f();
    $("#rx").onclick = exportExcel;
    $("#pub").onchange = (e) => setPublished(e.target.checked);
    $$("[data-pf]").forEach((b) => (b.onclick = () => portfolioModal(b.dataset.pf)));
    $$("[data-sg]").forEach((sel) => (sel.onchange = async () => { const s = S.students.find((x) => x.id === sel.dataset.sg), v = sel.value || null;
      try { await q(sb.from("students").update({ special_grade: v }).eq("id", s.id)); s.special_grade = v; drawSection(); App.toast(v ? `${s.student_id} marked ${v}` : "Special Grade Removed"); } catch (x) { fail(x); } }));
  }
  async function setPublished(on) {
    if (on && !(await App.confirm("Publish portfolios?", "Students will see their marks, grade, course outcomes and attendance in the Student Portal by typing their Student ID. Items marked Hidden stay hidden.", "Publish", false))) return drawSection();
    try { await q(sb.from("sections").update({ portfolio_published: on }).eq("id", S.sec.id)); S.sec.portfolio_published = on; drawSection(); App.toast(on ? "Portfolios Published" : "Portfolios Hidden from Students"); } catch (x) { fail(x); }
  }

  // ---------- Grading & course settings (part of the Settings tab)
  function gradingCards(part = "right") {
    const sec = S.sec, c = sec.course, scale = [...(sec.grade_scale || Grade.AIUB_SCALE)].sort((a, b) => b.min - a.min);
    if (part === "left") return `<div class="card"><div class="card-head"><div><h2>Course Outcomes</h2><div class="sub">Shared by every section of ${esc(c.code)}</div></div></div>
        <div class="grid cols-2" style="margin-bottom:14px"><div><label>Credit Hours</label><input id="co_cr" type="number" min="0" max="10" step="0.5" value="${c.credit_hours ?? ""}" /></div>
          <div><label>CO Attainment Target (%)</label><input id="co_tg" type="number" min="0" max="100" value="${c.co_target ?? 60}" /></div></div>
        <div class="stack-sm" id="colist">${(c.cos || []).map((o, i) => coRow(o, i)).join("")}</div>
        <button class="btn sm secondary" id="coadd" style="margin-top:12px">${icon("plus")} Add Outcome</button>
        <div style="height:16px"></div><button class="btn" id="saveco">${icon("check")} Save Course Outcomes</button></div>`;
    return `<div class="card"><div class="card-head"><div><h2>Student Portfolio</h2><div class="sub">What Students See in the Student Portal</div></div></div>
        <label class="switch"><input type="checkbox" id="st_pub" ${sec.portfolio_published ? "checked" : ""} /><span>Show Portfolio to Students<span class="d">Marks, grade, course outcomes and attendance. Students open the portal and type their Student ID.</span></span></label>
        <div class="field-gap"></div>
        <label class="switch"><input type="checkbox" id="st_code" ${sec.portfolio_code_required ? "checked" : ""} /><span>Require a Personal Access Code<span class="d">Recommended. Each student also needs their own 6-character code to open the portfolio, so nobody can view another student's marks by typing their ID. Attendance check-in is not affected.</span></span></label>
        <div class="btn-group" style="margin-top:12px;padding-left:56px"><button class="btn sm secondary" id="dlcodes">${icon("download")} Download Access Codes</button><button class="btn sm ghost" id="newcodes">${icon("refresh")} New Codes for Everyone</button></div>
        <div class="field-gap"></div><label>Instructor Name <span class="faint">(If Different from Your Profile)</span></label><input id="st_ins" maxlength="120" value="${esc(sec.instructor || "")}" placeholder="${esc(myName() || "e.g. Wahidul Alam Riyad")}" />
        <p class="hint">Students See Your <a href="#/profile">profile</a> — photo, research interests, bio and links.</p>
        <div style="height:16px"></div><button class="btn" id="savepf">${icon("check")} Save</button></div>
      <div class="card"><div class="card-head"><div><h2>Grading</h2><div class="sub">Grade Scale for This Section</div></div><button class="btn sm ghost" id="gsreset">${icon("refresh")} AIUB Default</button></div>
        <div class="table-wrap"><table class="plan-table" id="gst"><thead><tr><th>Grade</th><th class="num">From (%)</th><th class="num">Grade Point</th><th></th></tr></thead><tbody>
          ${scale.map((g, i) => `<tr data-i="${i}"><td><input data-k="grade" value="${esc(g.grade)}" maxlength="3" style="width:70px" /></td><td><input data-k="min" type="number" min="0" max="100" value="${g.min}" style="width:90px" /></td>
            <td><input data-k="point" type="number" min="0" max="5" step="0.01" value="${(+g.point).toFixed(2)}" style="width:90px" /></td><td><button class="icon-btn danger" data-gsdel="${i}">${icon("trash")}</button></td></tr>`).join("")}</tbody></table></div>
        <button class="btn sm secondary" id="gsadd" style="margin-top:10px">${icon("plus")} Add Grade</button>
        <div class="field-gap"></div><label class="switch"><input type="checkbox" id="st_round" ${sec.round_total ? "checked" : ""} /><span>Round Totals Before Grading<span class="d">89.5 becomes 90 (A+). Turn off to grade the exact total.</span></span></label>
        <div style="height:16px"></div><button class="btn" id="savegs">${icon("check")} Save Grading</button></div>`;
  }
  const coRow = (o, i) => `<div data-co="${i}" style="display:grid;gap:8px;padding:14px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border)">
      <div class="row center-y" style="gap:8px"><input data-k="code" value="${esc(o.code || "")}" placeholder="CO1" style="width:84px;font-weight:700" title="Code" />
        <input data-k="po" value="${esc(o.po || "")}" placeholder="PO (e.g. PO-c-1)" style="flex:1;min-width:110px" title="Program Outcome" />
        <input data-k="level" value="${esc(o.level || "")}" placeholder="Level (e.g. C4)" style="flex:1;min-width:100px" title="Domain Level" />
        <button class="icon-btn danger" data-codel="${i}" title="Remove">${icon("trash")}</button></div>
      <textarea data-k="statement" placeholder="Statement — what students will be able to do" style="min-height:64px">${esc(o.statement || "")}</textarea></div>`;
  function bindGrading() {
    const sec = S.sec, c = sec.course;
    $("#savepf").onclick = async () => { const on = $("#st_pub").checked;
      if (on && !sec.portfolio_published && !(await App.confirm("Publish portfolios?", "Students will see their marks, grade, course outcomes and attendance by typing their Student ID.", "Publish", false))) return;
      const upd = { portfolio_published: on, portfolio_code_required: $("#st_code").checked, instructor: $("#st_ins").value.trim() || null };
      try { await q(sb.from("sections").update(upd).eq("id", sec.id)); Object.assign(sec, upd); try { localStorage.setItem("att_instructor", upd.instructor || ""); } catch {} drawSection(); App.toast("Saved"); } catch (x) { fail(x); } };
    $("#dlcodes").onclick = async () => {
      try { const rows = await App.fetchAll(() => sb.from("students").select("student_id, name, access_code, seq").eq("section_id", sec.id).order("seq").order("student_id"));
        const ws = XLSX.utils.aoa_to_sheet([["Student ID", "Student Name", "Access Code"], ...rows.map((r) => [r.student_id, App.nameCase(r.name), r.access_code])]);
        ws["!cols"] = [{ wch: 14 }, { wch: 34 }, { wch: 14 }]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Access Codes");
        XLSX.writeFile(wb, `Classfolio_Access_Codes_${safe(sec.course.code)}_Sec-${safe(sec.name)}.xlsx`); App.toast("Access codes downloaded — give each student only their own code"); } catch (x) { fail(x); } };
    $("#newcodes").onclick = async () => {
      if (!(await App.confirm("New codes for everyone?", "Every student in this section gets a new access code. The old codes stop working right away — download and share the new list.", "Make New Codes"))) return;
      try { const { data, error } = await sb.rpc("reset_access_codes", { p_section: sec.id }); if (error) throw error; App.toast(`${data} new access codes made`); } catch (x) { fail(x); } };
    const readScale = () => $$("#gst tbody tr").map((tr) => ({ grade: tr.querySelector("[data-k=grade]").value.trim(), min: +tr.querySelector("[data-k=min]").value, point: +tr.querySelector("[data-k=point]").value })).filter((g) => g.grade);
    $("#gsreset").onclick = () => { sec.grade_scale = Grade.AIUB_SCALE.map((g) => ({ ...g })); tabSettings(); App.toast("AIUB Scale Loaded — Press Save Grading"); };
    $("#gsadd").onclick = () => { sec.grade_scale = [...readScale(), { grade: "", min: 0, point: 0 }]; tabSettings(); };
    $$("[data-gsdel]").forEach((b) => (b.onclick = () => { const s = readScale(); s.splice(+b.dataset.gsdel, 1); sec.grade_scale = s; tabSettings(); }));
    $("#savegs").onclick = async () => { const s = readScale().sort((a, b) => b.min - a.min);
      if (!s.length || !s.some((g) => g.min === 0)) return App.toast("The Lowest Grade Must Start at 0%", true);
      try { await q(sb.from("sections").update({ grade_scale: s, round_total: $("#st_round").checked }).eq("id", sec.id)); sec.grade_scale = s; sec.round_total = $("#st_round").checked; drawSection(); App.toast("Grading Saved"); } catch (x) { fail(x); } };
    const readCos = () => $$("#colist [data-co]").map((r) => ({ code: r.querySelector("[data-k=code]").value.trim().toUpperCase(), statement: r.querySelector("[data-k=statement]").value.trim(), po: r.querySelector("[data-k=po]").value.trim(), level: r.querySelector("[data-k=level]").value.trim() })).filter((o) => o.code);
    $("#coadd").onclick = () => { const list = readCos(); list.push({ code: `CO${list.length + 1}`, statement: "" }); $("#colist").innerHTML = list.map(coRow).join(""); bindCoDel(); };
    const bindCoDel = () => $$("[data-codel]").forEach((b) => (b.onclick = () => { const list = readCos(); list.splice(+b.dataset.codel, 1); $("#colist").innerHTML = list.map(coRow).join(""); bindCoDel(); }));
    bindCoDel();
    $("#saveco").onclick = async () => { const upd = { cos: readCos(), credit_hours: $("#co_cr").value === "" ? null : +$("#co_cr").value, co_target: Math.max(0, Math.min(100, +$("#co_tg").value || 60)) };
      try { await q(sb.from("courses").update(upd).eq("id", c.id)); Object.assign(c, upd); drawSection(); App.toast("Course Outcomes Saved"); } catch (x) { fail(x); } };
  }

  // ------------------------------------------------------------------ router
  async function route() {
    closePop(); clearInterval(liveTimer);
    if (!user) return location.hash === "#/signup" ? renderSignup() : renderLogin();
    if (!PROFILE) { try { await loadProfile(); } catch {} }
    if (location.hash === "#/profile") { S = null; return renderProfile().catch(fail); }
    if (location.hash === "#/signup") { location.hash = "#/"; return; }
    if (recovering) { recovering = false; await changePassword("Set a New Password"); }
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
    if (was !== user?.id) PROFILE = null;
    if (was !== user?.id || ev === "PASSWORD_RECOVERY") route();
  });
  sb.auth.getSession().then(({ data }) => { user = data.session?.user || null; route(); });
})();
