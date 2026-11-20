/*! © 2026 Wahidul Alam Riyad. All rights reserved. Proprietary — unauthorized copying, use or redistribution is prohibited. See LICENSE. */
// Student portal: type Student ID → check in with the class PIN, view each course portfolio
(function () {
  const { esc, sb, cfg, icon, $, $$ } = App;
  const root = document.getElementById("app");
  const idRe = cfg.STUDENT_ID_PATTERN ? new RegExp(cfg.STUDENT_ID_PATTERN) : null;
  let sid = (() => { try { return localStorage.getItem("att_last_id") || ""; } catch { return ""; } })();
  let L = null, busy = false, poll = null, clock = null, lastResult = null, pfCache = {};

  if (!App.configured) { document.body.innerHTML = App.notConfiguredHtml(); return; }
  const norm = (v) => String(v || "").trim().toUpperCase().replace(/\s+/g, "");
  const left = (exp) => { const s = Math.max(0, Math.round((new Date(exp) - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${App.pad2(s % 60)}`; };
  const top = (extra = "") => `<div class="portal-top"><a class="brand" href="#/"><div class="logo">${icon("logo")}</div><div><div class="t1">Student Portal</div><div class="t2">${esc(cfg.INSTITUTION || "")}</div></div></a>
      <div class="btn-group" style="align-items:center">${extra}${App.theme.button()}</div></div>`;
  const shell = (inner, extra) => { root.innerHTML = `<div class="portal">${top(extra)}${inner}</div>`; };

  // ---------------- sign-in by ID
  function renderStart(err = "") {
    stop();
    shell(`<div class="portal-hero"><div class="card">
        <div class="logo-lg" style="width:56px;height:56px;border-radius:16px;display:grid;place-items:center;color:#fff;margin-bottom:22px;background:linear-gradient(135deg,#4f6bff,#2b44c2);box-shadow:0 12px 28px -10px rgba(51,85,214,.8)">${icon("user")}</div>
        <h1>Welcome</h1><p class="muted" style="margin:8px 0 24px">Type your Student ID to mark attendance and see your course portfolio.</p>
        <form id="f" novalidate><label for="sid">Student ID</label>
          <input id="sid" class="id-input" autocapitalize="characters" spellcheck="false" autocomplete="off" placeholder="${esc(cfg.STUDENT_ID_EXAMPLE || "")}" value="${esc(sid)}" maxlength="30" />
          <div style="height:18px"></div><button class="btn lg block" id="go">Continue ${icon("chevron")}</button>
          ${err ? `<div class="msg err">${icon("alert")}<div>${esc(err)}</div></div>` : ""}</form></div>
      <p class="center small muted" style="margin-top:18px">Faculty? <a href="admin.html">Sign in here</a></p></div>`);
    const i = $("#sid"); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
    i.addEventListener("input", () => { const p = i.selectionStart; i.value = i.value.toUpperCase(); i.setSelectionRange(p, p); });
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const v = norm(i.value);
      if (!v) return renderStart("Enter your Student ID.");
      if (idRe && !idRe.test(v)) return renderStart(`That doesn't look like a Student ID. Example: ${cfg.STUDENT_ID_EXAMPLE}`);
      const b = $("#go"); b.disabled = true; b.innerHTML = `<span class="spinner" style="width:18px;height:18px;border-color:rgba(255,255,255,.4);border-top-color:#fff"></span> Finding your courses…`;
      try { const r = await lookup(v); if (!r.ok) return renderStart(r.message); sid = v; try { localStorage.setItem("att_last_id", v); } catch {} location.hash = "#/"; renderHome(); }
      catch { renderStart("Could not reach the server. Check your internet connection and try again."); }
    };
  }
  async function lookup(v = sid) { const { data, error } = await sb.rpc("portal_lookup", { p_student_id: v }); if (error) throw error; if (data.ok) L = data; return data; }

  // ---------------- home
  function renderHome() {
    if (!L) return renderStart();
    const open = L.sections.filter((s) => s.active), pending = open.filter((s) => !s.active.status);
    const who = `<span class="chip">${icon("user")} ${esc(L.student_id)}</span><button class="btn ghost sm" id="out">Change ID</button>`;
    const checkin = pending.length ? `<div class="checkin-card" id="ci"><div class="row center-y" style="gap:12px;align-items:flex-start;position:relative;z-index:1">
          <div class="grow"><div class="row center-y" style="gap:10px"><span class="live-dot"></span><h2>Attendance Is Open</h2></div>
            <div class="sub">${pending.map((s) => `${esc(s.course_code)} · ${esc(s.active.term)} · ${App.classLabel(s.active.number)}`).join("<br>")}</div></div>
          <span class="chip" style="background:rgba(255,255,255,.15);border-color:transparent;color:#fff" id="cd">${icon("clock")} ${left(pending[0].active.expires_at)}</span></div>
        <form id="pf" style="margin-top:20px;position:relative;z-index:1" novalidate><label style="color:rgba(255,255,255,.85)">6-Digit PIN on the Class Screen</label>
          <div class="otp" id="otp">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="PIN digit ${i + 1}" />`).join("")}</div>
          <div style="height:16px"></div><button class="btn white lg block" id="sub">${icon("check")} Record My Attendance</button>
          <div id="perr"></div></form></div>`
      : open.length && !(lastResult && lastResult.ok) ? `<div class="checkin-card"><div class="checkin-done" style="position:relative;z-index:1"><div class="check">${icon("check")}</div>
          <div><h2>Attendance Recorded</h2><div class="sub">${open.map((s) => `${esc(s.course_code)} · ${App.classLabel(s.active.number)} · ${s.active.status === "late" ? "Late" : s.active.status === "excused" ? "Excused" : "On Time"}`).join("<br>")}</div></div></div></div>`
      : open.length ? "" : `<div class="card" style="display:flex;gap:14px;align-items:center"><div class="stat" style="border:0;box-shadow:none;padding:0;background:none"><div class="ic">${icon("clock")}</div></div>
          <div class="grow"><b>No class is taking attendance right now</b><div class="small muted">When your instructor starts, a PIN box appears here automatically.</div></div><span class="spinner" style="width:18px;height:18px"></span></div>`;
    const courses = L.sections.map((s) => { const sm = s.summary || {}, p = sm.pct, min = sm.min_pct ?? 80;
      return `<button class="course-card ${s.published ? "" : "locked"}" data-tok="${esc(s.token)}" ${s.published ? "" : "disabled"}>
        <div class="row center-y" style="gap:12px;align-items:flex-start"><div class="grow"><div class="code" style="font-size:12.5px;font-weight:700;color:var(--primary)">${esc(s.course_code)}${s.credit_hours ? ` · ${+s.credit_hours} Credit${+s.credit_hours === 1 ? "" : "s"}` : ""}</div>
          <div style="font-size:17px;font-weight:700;margin-top:3px;line-height:1.3">${esc(s.course_title)}</div></div><div class="sec-letter" style="width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-weight:800;background:var(--primary-soft);color:var(--primary)">${esc(s.section)}</div></div>
        <div class="small muted" style="display:flex;gap:14px;flex-wrap:wrap"><span>${icon("calendar")} ${esc(s.intake)}</span>${s.instructor ? `<span>${icon("user")} ${esc(s.instructor)}</span>` : ""}</div>
        <div><div class="row center-y" style="justify-content:space-between;margin-bottom:6px"><span class="small muted">Attendance</span><b class="${App.pctClass(p, min)}">${p == null ? "—" : p + "%"}</b></div>${App.progress(p, min)}
          <div class="xs faint" style="margin-top:6px">${sm.held ? `${sm.attended} of ${sm.held} class${sm.held === 1 ? "" : "es"}${sm.late ? ` · ${sm.late} late` : ""}` : "No classes yet"}</div></div>
        <div style="padding-top:12px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          ${s.published ? `<span class="small" style="color:var(--primary);font-weight:650">View My Portfolio</span>${icon("chevron")}` : `<span class="small faint">${icon("clock")} Portfolio not published yet</span>`}</div></button>`; }).join("");
    shell(`<div class="stack">${lastResult ? resultHtml(lastResult) : ""}${checkin}
        <div><div class="card-head" style="margin-top:10px"><div><h2>My Courses</h2><div class="sub">${L.sections.length} course${L.sections.length === 1 ? "" : "s"} this semester</div></div></div>
        <div class="course-grid">${courses}</div></div></div>`, who);
    $("#out").onclick = () => { try { localStorage.removeItem("att_last_id"); } catch {} sid = ""; L = null; lastResult = null; renderStart(); };
    $$(".course-card[data-tok]").forEach((b) => (b.onclick = () => { if (!b.disabled) location.hash = `#/course/${b.dataset.tok}`; }));
    if (pending.length) bindOtp();
    const x = $("#dismiss"); if (x) x.onclick = () => { lastResult = null; renderHome(); };
    start();
  }
  function resultHtml(r) {
    const ok = r.ok, late = r.status === "late", s = r.summary;
    return `<div class="card" style="border-color:${ok ? "color-mix(in srgb,var(--success) 35%,var(--border))" : "color-mix(in srgb,var(--danger) 35%,var(--border))"}">
      <div class="row center-y" style="gap:16px;align-items:flex-start"><div class="result ${ok ? (late ? "late" : "ok") : "err"}" style="padding:0"><div class="check" style="width:56px;height:56px;margin:0">${icon(ok ? (late ? "clock" : "check") : "x")}</div></div>
        <div class="grow"><h3>${esc(r.message)}</h3><div class="small muted" style="margin-top:4px">${esc(r.course_code || "")} ${r.term ? "· " + esc(r.term) + " · " + App.classLabel(r.class) : ""} ${r.at ? "· " + App.fmtDate(r.at) : ""}</div>
          ${ok && s && s.held ? `<div class="small" style="margin-top:8px">Attendance so far: <b class="${App.pctClass(s.pct, s.min_pct)}">${s.pct}%</b> (${s.attended} of ${s.held} class${s.held === 1 ? "" : "es"})</div>` : ""}</div>
        <button class="icon-btn" id="dismiss" aria-label="Dismiss">${icon("x")}</button></div></div>`;
  }
  function bindOtp() {
    const boxes = $$("#otp input");
    boxes.forEach((b, i) => {
      b.addEventListener("input", () => { const v = b.value.replace(/\D/g, ""); if (v.length > 1) return fill(i, v); b.value = v; b.classList.toggle("filled", !!v); if (v && i < 5) boxes[i + 1].focus(); if (boxes.every((x) => x.value)) submit(); });
      b.addEventListener("keydown", (e) => { if (e.key === "Backspace" && !b.value && i > 0) { boxes[i - 1].value = ""; boxes[i - 1].classList.remove("filled"); boxes[i - 1].focus(); e.preventDefault(); } });
      b.addEventListener("paste", (e) => { e.preventDefault(); fill(i, (e.clipboardData.getData("text") || "").replace(/\D/g, "")); });
      b.addEventListener("focus", () => b.select());
    });
    function fill(i, d) { d.slice(0, 6 - i).split("").forEach((c, k) => { boxes[i + k].value = c; boxes[i + k].classList.add("filled"); }); (boxes.find((x) => !x.value) || boxes[5]).focus(); if (boxes.every((x) => x.value)) submit(); }
    $("#pf").onsubmit = (e) => { e.preventDefault(); submit(); };
    boxes[0].focus();
  }
  async function submit() {
    if (busy) return;
    const pin = $$("#otp input").map((b) => b.value).join("");
    if (!/^\d{6}$/.test(pin)) { $("#perr").innerHTML = `<div class="msg">${icon("alert")}<div>Enter all 6 digits of the PIN.</div></div>`; return; }
    busy = true; const b = $("#sub"); b.disabled = true; b.innerHTML = `<span class="spinner" style="width:18px;height:18px"></span> Checking…`;
    try {
      const { data, error } = await sb.rpc("portal_checkin", { p_student_id: sid, p_pin: pin, p_device: App.deviceId() });
      if (error) throw error;
      if (data.ok || ["locked", "device_used", "not_enrolled"].includes(data.code)) { lastResult = data; await lookup(); renderHome(); }
      else if (data.code === "closed") { await lookup(); renderHome(); App.toast(data.message, true); }
      else { $$("#otp input").forEach((x) => { x.value = ""; x.classList.remove("filled"); }); $$("#otp input")[0].focus(); $("#perr").innerHTML = `<div class="msg">${icon("alert")}<div>${esc(data.message)}</div></div>`; b.disabled = false; b.innerHTML = `${icon("check")} Record My Attendance`; }
    } catch { $("#perr").innerHTML = `<div class="msg">${icon("alert")}<div>${navigator.onLine === false ? "You are offline. Connect to the internet and try again." : "Could not reach the server. Try again."}</div></div>`; b.disabled = false; b.innerHTML = `${icon("check")} Record My Attendance`; }
    finally { busy = false; }
  }
  function start() {
    stop();
    poll = setInterval(async () => {
      if (busy || location.hash.startsWith("#/course/")) return;
      if ($$("#otp input").some((x) => x.value)) return;
      const before = JSON.stringify(L.sections.map((s) => [s.active?.number, s.active?.status]));
      try { await lookup(); } catch { return; }
      if (JSON.stringify(L.sections.map((s) => [s.active?.number, s.active?.status])) !== before) renderHome();
    }, 7000);
    clock = setInterval(() => { const el = $("#cd"), s = L?.sections.find((x) => x.active && !x.active.status); if (el && s) el.innerHTML = `${icon("clock")} ${left(s.active.expires_at)}`; }, 1000);
  }
  function stop() { clearInterval(poll); clearInterval(clock); }

  // ---------------- portfolio
  async function renderCourse(tok) {
    stop();
    const s = L?.sections.find((x) => x.token === tok);
    const back = `<button class="btn ghost sm" id="back">${icon("back")} My Courses</button>`;
    shell(`<div class="loading"><span class="spinner"></span> Loading your portfolio…</div>`, back);
    $("#back").onclick = () => (location.hash = "#/");
    try {
      const { data, error } = await sb.rpc("portal_portfolio", { p_token: tok, p_student_id: sid });
      if (error) throw error;
      if (!data.ok) { shell(`<div class="card"><div class="empty"><div class="ic">${icon("clock")}</div><h3>Not Available Yet</h3><p>${esc(data.message)}</p><a class="btn" href="#/">${icon("back")} My Courses</a></div></div>`, back); $("#back").onclick = () => (location.hash = "#/"); return; }
      pfCache[tok] = data;
      const c = data.course, se = data.section;
      shell(`<div class="page-head"><div><div class="eyebrow"><span class="badge blue">${esc(c.code)}</span><span>Section ${esc(se.name)}</span><span>·</span><span>${esc(se.intake)}</span>${c.credit_hours ? `<span>·</span><span>${+c.credit_hours} Credit Hours</span>` : ""}</div>
          <h1>${esc(c.title)}</h1><div class="muted" style="margin-top:6px">Student ID <b style="color:var(--text)">${esc(data.student.student_id)}</b>${se.instructor ? ` · Instructor ${esc(se.instructor)}` : ""}</div></div>
          <div class="actions no-print"><button class="btn secondary" onclick="print()">${icon("printer")} Print</button></div></div>
        ${Grade.render(data)}
        <p class="center xs faint" style="margin-top:26px">Marks shown are the latest entered by your instructor. Contact your instructor if something looks wrong.</p>`, back);
      $("#back").onclick = () => (location.hash = "#/");
    } catch { shell(`<div class="card"><div class="empty"><div class="ic">${icon("alert")}</div><h3>Could Not Load</h3><p>Check your internet connection and try again.</p><button class="btn" onclick="location.reload()">${icon("refresh")} Try Again</button></div></div>`, back); $("#back").onclick = () => (location.hash = "#/"); }
  }

  // ---------------- router
  async function route() {
    const m = location.hash.match(/^#\/course\/([a-z0-9]+)/i);
    if (!sid) return renderStart();
    if (!L) { shell(`<div class="loading"><span class="spinner"></span> Loading…</div>`); try { const r = await lookup(); if (!r.ok) { sid = ""; return renderStart(r.message); } } catch { return renderStart("Could not reach the server. Refresh to try again."); } }
    if (m) return renderCourse(m[1]);
    renderHome();
  }
  addEventListener("hashchange", () => { scrollTo(0, 0); route(); });
  route();
})();
