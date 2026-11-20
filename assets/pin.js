/*! © 2026 Wahidul Alam Riyad. All rights reserved. Proprietary — unauthorized copying, use or redistribution is prohibited. See LICENSE. */
// Instructor PIN screen: shows the rotating 6-digit PIN for one class
(function () {
  const { esc, sb, cfg, icon } = App;
  const root = document.getElementById("app");
  const classId = new URLSearchParams(location.search).get("class");
  let ctx = null, next = null, state = null, fetchedAt = 0, lastPin = "", link = "", fails = 0;

  if (!App.configured) { document.body.classList.remove("pin-screen"); document.body.innerHTML = App.notConfiguredHtml(); return; }
  const msgPage = (t, b) => { document.body.classList.remove("pin-screen");
    root.innerHTML = `<div class="corner">${App.theme.button()}</div><div class="center-wrap"><div class="card" style="max-width:520px"><div class="empty"><div class="ic">${icon("alert")}</div><h3>${esc(t)}</h3><p>${esc(b)}</p><a class="btn" href="admin.html">Go to Admin</a></div></div></div>`; };

  async function loadContext() {
    const { data, error } = await sb.from("classes")
      .select("id, number, title, class_date, term_id, term:terms(id, name, section:sections(id, name, class_code, public_token, late_after_minutes, intake:intakes(name), course:courses(code, title)))")
      .eq("id", classId).single();
    if (error) throw error;
    ctx = data;
    const { data: nx } = await sb.from("classes").select("id, number").eq("term_id", ctx.term_id).gt("number", ctx.number).order("number").limit(1);
    next = nx && nx[0];
  }

  function shell() {
    const s = ctx.term.section; link = App.studentLink(s.public_token);
    root.innerHTML = `<div class="pin-wrap" id="wrap">
      <section class="pin-main">
        <div class="top-actions">
          <a class="btn ghost sm" href="admin.html#/section/${esc(s.id)}/classes">${icon("back")} Back to Section</a>
          <div class="btn-group">
            <button class="icon-btn bordered" id="focus" title="Hide / Show Side Panel (H)">${icon("eye")}</button>
            <button class="icon-btn bordered" id="fs" title="Full Screen (F)">${icon("maximize")}</button>
            ${App.theme.button()}
          </div>
        </div>
        <div class="course">${esc(s.course.code)} · ${esc(s.course.title)} · Section ${esc(s.name)}</div>
        <div class="klass">${esc(ctx.term.name)} · ${App.classLabel(ctx.number)}${ctx.title ? " · " + esc(ctx.title) : ""}</div>
        <div id="digits" class="pin-digits dim">${digitsHtml("------")}</div>
        <div class="pin-bar" id="barw"><div id="bar" style="width:0"></div></div>
        <div class="pin-hint" id="hint">Loading…</div>
        <div class="pin-chips" id="chips"></div>
      </section>
      <aside class="pin-side">
        <div><h2>Scan to Check In</h2><div class="qr" id="qr"></div>
          <div class="linkbox" style="margin-top:12px"><code>${esc(link.replace(/^https?:\/\//, ""))}</code><button class="btn sm secondary" id="copy">${icon("copy")}</button></div></div>
        <div><h2>Attendance</h2><div class="counter-box"><div class="ring" id="ring"></div>
          <div><div class="counter" id="present">0</div><div class="muted small">of <b id="enrolled">0</b> students checked in</div><div class="small" id="latecnt"></div></div></div></div>
        <div id="controls"></div>
        <div class="grow"><h2>Latest Check-Ins</h2><ul class="feed" id="feed"><li class="muted">No check-ins yet.</li></ul></div>
      </aside></div>`;
    try { new QRCode(document.getElementById("qr"), { text: link, width: 300, height: 300, correctLevel: QRCode.CorrectLevel.M }); } catch {}
    document.getElementById("copy").onclick = () => App.copy(link, "Student link copied");
    document.getElementById("fs").onclick = toggleFs;
    document.getElementById("focus").onclick = toggleFocus;
  }
  const digitsHtml = (p) => p.split("").map((d, i) => (i === 3 ? `<span class="sp"></span>` : "") + `<span>${esc(d)}</span>`).join("");
  const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  const toggleFocus = () => { const w = document.getElementById("wrap"); w.classList.toggle("focus"); document.getElementById("focus").innerHTML = icon(w.classList.contains("focus") ? "eyeoff" : "eye"); };
  document.addEventListener("keydown", (e) => { if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return; if (e.key === "f" || e.key === "F") toggleFs(); if (e.key === "h" || e.key === "H") toggleFocus(); });

  function controls() {
    const c = document.getElementById("controls"), def = cfg.DEFAULT_SESSION_MINUTES || 10;
    if (state && state.is_open) {
      c.innerHTML = `<h2>Session</h2><div class="btn-group" style="width:100%">
        <button class="btn amber grow" id="ext">${icon("plus")} 5 min</button>
        <button class="btn red grow" id="close">${icon("stop")} End Attendance</button></div>`;
      document.getElementById("ext").onclick = async () => { const { error } = await sb.rpc("extend_class", { p_class_id: classId, p_minutes: 5 }); if (error) App.toast(error.message, true); else { App.toast("Extended by 5 minutes"); refresh(); } };
      document.getElementById("close").onclick = async () => {
        if (!(await App.confirm("End Attendance Now?", "Students will no longer be able to check in for this class. You can still mark students by hand later.", "End Now"))) return;
        const { error } = await sb.rpc("close_class", { p_class_id: classId }); if (error) App.toast(error.message, true); else { App.toast("Attendance ended"); refresh(); }
      };
    } else {
      let mins = def;
      c.innerHTML = `<h2>Start Attendance</h2><div class="label">Keep It Open For</div>
        <div class="seg lenpick" id="len">${[3, 5, 10, 15, 20, 30].map((m) => `<button data-m="${m}" class="${m === def ? "on" : ""}">${m} min</button>`).join("")}</div>
        <div style="height:14px"></div><button class="btn green lg block" id="start">${icon("play")} Start Attendance</button>
        ${ctx.term.section.late_after_minutes ? `<p class="hint">Check-ins after ${ctx.term.section.late_after_minutes} min are marked <b>late</b>.</p>` : ""}
        ${state && state.present && next ? `<div style="height:10px"></div><a class="btn secondary block" href="pin.html?class=${next.id}">Next: ${App.classLabel(next.number)} ${icon("chevron")}</a>` : ""}`;
      App.$$("#len button").forEach((b) => (b.onclick = () => { mins = +b.dataset.m; App.$$("#len button").forEach((x) => x.classList.toggle("on", x === b)); }));
      document.getElementById("start").onclick = async () => {
        const { error } = await sb.rpc("open_class", { p_class_id: classId, p_minutes: mins });
        if (error) return App.toast(error.message, true);
        App.toast("Attendance started"); refresh();
      };
    }
  }

  async function refresh() {
    const { data, error } = await sb.rpc("current_pin", { p_class_id: classId });
    if (error) { if (++fails > 2) document.getElementById("hint").innerHTML = `${icon("alert")} Connection problem — retrying…`; return; }
    fails = 0;
    const changed = !state || state.is_open !== data.is_open;
    state = data; fetchedAt = performance.now();
    document.getElementById("present").textContent = data.present;
    document.getElementById("enrolled").textContent = data.enrolled;
    const pct = data.enrolled ? Math.round((data.present / data.enrolled) * 100) : 0;
    document.getElementById("ring").innerHTML = App.ring(pct, 92, 9, "var(--primary)") + `<b>${pct}%</b>`;
    const d = document.getElementById("digits");
    if (data.is_open) {
      if (data.pin !== lastPin) { d.innerHTML = digitsHtml(data.pin); d.classList.remove("dim"); if (lastPin) { d.classList.remove("flip"); void d.offsetWidth; d.classList.add("flip"); } lastPin = data.pin; }
    } else {
      lastPin = ""; d.innerHTML = digitsHtml("------"); d.classList.add("dim"); document.getElementById("bar").style.width = "0%";
      document.getElementById("hint").innerHTML = data.present
        ? `Attendance is <b>closed</b> · ${data.present} of ${data.enrolled} checked in. Start again to let late students in.`
        : `Attendance is <b>closed</b>. Pick a length on the right and press <b>Start Attendance</b>.`;
      document.getElementById("chips").innerHTML = "";
    }
    if (changed) controls();
  }

  function animate() {
    if (!state || !state.is_open) return;
    const elapsed = (performance.now() - fetchedAt) / 1000;
    const left = Math.max(0, state.seconds_left - elapsed);
    document.getElementById("bar").style.width = ((left / state.period) * 100).toFixed(1) + "%";
    document.getElementById("barw").classList.toggle("low", left < 4);
    const now = new Date(new Date(state.server_time).getTime() + elapsed * 1000);
    const secs = Math.max(0, Math.round((new Date(state.expires_at) - now) / 1000));
    document.getElementById("hint").innerHTML = `New PIN in <b>${Math.ceil(left)}s</b>`;
    const lateAt = state.late_at && new Date(state.late_at);
    document.getElementById("chips").innerHTML = `<span class="chip">${icon("clock")} Closes In <b>&nbsp;${Math.floor(secs / 60)}:${App.pad2(secs % 60)}</b></span>` +
      (lateAt ? (now < lateAt ? `<span class="chip">${icon("alert")} Late After ${App.fmtTime(lateAt).slice(0, 5)}</span>` : `<span class="chip" style="color:var(--warning)">${icon("alert")} Marking Late Now</span>`) : "") +
      `<span class="chip">${icon("smartphone")} Open the Link · Type ID + PIN</span>`;
  }

  async function feed() {
    const { data, error } = await sb.from("attendance").select("student_id, student_name, submitted_at, source, status")
      .eq("class_id", classId).order("submitted_at", { ascending: false }).limit(30);
    if (error) return;
    const late = data.filter((r) => r.status === "late").length;
    document.getElementById("latecnt").innerHTML = late ? `<span class="badge amber" style="margin-top:6px">${late} late</span>` : "";
    const ul = document.getElementById("feed");
    const html = data.length ? data.map((r) => `<li><div class="avatar" style="width:34px;height:34px;font-size:12px">${esc(App.initials(App.nameCase(r.student_name) || r.student_id))}</div>
        <div class="grow"><b>${esc(r.student_id)}</b><span>${esc(App.nameCase(r.student_name))}</span></div>
        ${r.status === "late" ? `<span class="badge amber">Late</span>` : r.status === "excused" ? `<span class="badge violet">Excused</span>` : r.source === "manual" ? `<span class="badge blue">Manual</span>` : ""}
        <time>${App.fmtTime(r.submitted_at)}</time></li>`).join("") : `<li class="muted">No check-ins yet.</li>`;
    if (ul.dataset.h !== html) { ul.innerHTML = html; ul.dataset.h = html; }
  }

  (async () => {
    if (!classId) return msgPage("No Class Selected", "Open the PIN screen from the Classes tab of a section.");
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = "admin.html"; return; }
    try { await loadContext(); } catch { return msgPage("Class Not Found", "This class does not exist or belongs to another account."); }
    shell(); await refresh(); feed();
    setInterval(refresh, 1000);            // PIN comes from the server every second (no clock drift)
    setInterval(animate, 200);
    setInterval(feed, 3000);
  })();
})();
