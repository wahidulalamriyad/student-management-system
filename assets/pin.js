// Instructor PIN screen: shows the rotating 6-digit PIN for one class
(function () {
  const { esc, sb, cfg } = App;
  const root = document.getElementById("app");
  const classId = new URLSearchParams(location.search).get("class");
  let ctx = null, state = null, fetchedAt = 0, poll = null, tick = null, feedTimer = null;

  if (!App.configured) { document.body.classList.remove("pin-screen"); document.body.innerHTML = App.notConfiguredHtml(); return; }

  async function loadContext() {
    const { data: cls, error } = await sb.from("classes")
      .select("id, number, title, is_open, expires_at, term:terms(id, name, section:sections(id, name, class_code, public_token, intake:intakes(name), course:courses(code, title)))")
      .eq("id", classId).single();
    if (error) throw error;
    ctx = cls;
  }

  function shell() {
    const s = ctx.term.section, link = App.studentLink(s.public_token);
    root.className = "";
    root.innerHTML = `<div class="pin-wrap">
      <div class="pin-main">
        <div class="course">${esc(s.course.code)} · ${esc(s.course.title)} · Section ${esc(s.name)} · ${esc(s.intake.name)}</div>
        <div class="klass">${esc(ctx.term.name)} · ${App.classLabel(ctx.number)}${ctx.title ? " · " + esc(ctx.title) : ""}</div>
        <div id="digits" class="pin-digits dim">------</div>
        <div class="pin-bar"><div id="bar"></div></div>
        <div class="pin-hint" id="hint">Starting…</div>
      </div>
      <aside class="pin-side">
        <h2>Students check in here</h2>
        <div class="qr" id="qr"></div>
        <div class="linkbox"><code id="lnk">${esc(link)}</code><button class="btn sm secondary" id="copy">Copy</button></div>
        <h2>Present</h2>
        <div><span class="counter" id="present">0</span> <span class="muted">of <span id="enrolled">0</span> students</span></div>
        <div class="row" id="controls"></div>
        <h2>Latest check-ins</h2>
        <ul class="feed" id="feed"><li class="muted">No check-ins yet.</li></ul>
        <a class="btn secondary" href="admin.html#/section/${esc(s.id)}" style="justify-content:center">← Back to section</a>
      </aside></div>`;
    try { new QRCode(document.getElementById("qr"), { text: link, width: 190, height: 190, correctLevel: QRCode.CorrectLevel.M }); } catch {}
    document.getElementById("copy").onclick = async () => { try { await navigator.clipboard.writeText(link); App.toast("Link copied"); } catch { App.toast("Copy failed — select the link instead", true); } };
  }

  function controls() {
    const c = document.getElementById("controls");
    if (state && state.is_open) {
      c.innerHTML = `<button class="btn amber" id="ext">+5 min</button>
        <button class="btn red" id="close">End attendance</button>
        <button class="btn secondary" id="fs">Full screen</button>`;
      document.getElementById("ext").onclick = async () => { const { error } = await sb.rpc("extend_class", { p_class_id: classId, p_minutes: 5 }); if (error) App.toast(error.message, true); else { App.toast("Extended by 5 minutes"); refresh(); } };
      document.getElementById("close").onclick = async () => {
        if (!(await App.confirm("End attendance?", "Students will no longer be able to check in for this class.", "End now"))) return;
        const { error } = await sb.rpc("close_class", { p_class_id: classId }); if (error) App.toast(error.message, true); else refresh();
      };
      document.getElementById("fs").onclick = () => document.documentElement.requestFullscreen?.();
    } else {
      const def = cfg.DEFAULT_SESSION_MINUTES || 10;
      c.innerHTML = `<div class="f"><label>Session length</label><select id="mins">${[5, 10, 15, 20, 30, 45, 60].map((m) => `<option ${m === def ? "selected" : ""} value="${m}">${m} minutes</option>`).join("")}</select></div>
        <button class="btn green" id="start">Start attendance</button>`;
      document.getElementById("start").onclick = start;
    }
  }

  async function start() {
    const mins = +document.getElementById("mins").value;
    const { error } = await sb.rpc("open_class", { p_class_id: classId, p_minutes: mins });
    if (error) return App.toast(error.message, true);
    App.toast("Attendance started"); refresh();
  }

  async function refresh() {
    const { data, error } = await sb.rpc("current_pin", { p_class_id: classId });
    if (error) { document.getElementById("hint").textContent = "Connection problem — retrying…"; return; }
    const changed = !state || state.is_open !== data.is_open;
    state = data; fetchedAt = performance.now();
    document.getElementById("present").textContent = data.present;
    document.getElementById("enrolled").textContent = data.enrolled;
    const d = document.getElementById("digits");
    if (data.is_open) {
      d.textContent = data.pin.slice(0, 3) + " " + data.pin.slice(3); d.classList.remove("dim");
    } else {
      d.textContent = "--- ---"; d.classList.add("dim");
      document.getElementById("bar").style.width = "0%";
      document.getElementById("hint").innerHTML = "Attendance is <b>closed</b> for this class. Choose a length and press <b>Start attendance</b>.";
    }
    if (changed) controls();
  }

  function animate() {
    if (!state || !state.is_open) return;
    const elapsed = (performance.now() - fetchedAt) / 1000;
    const left = Math.max(0, state.seconds_left - elapsed);
    document.getElementById("bar").style.width = (left / state.period * 100).toFixed(1) + "%";
    const minsLeft = Math.max(0, Math.round((new Date(state.expires_at) - new Date(state.server_time)) / 1000 - elapsed));
    document.getElementById("hint").innerHTML = `New PIN in <b>${Math.ceil(left)}</b> s &nbsp;·&nbsp; attendance closes in <b>${Math.floor(minsLeft / 60)}:${App.pad2(minsLeft % 60)}</b>`;
  }

  async function feed() {
    const { data, error } = await sb.from("attendance").select("student_id, student_name, submitted_at, source")
      .eq("class_id", classId).order("submitted_at", { ascending: false }).limit(25);
    if (error) return;
    const ul = document.getElementById("feed");
    ul.innerHTML = data.length ? data.map((r) => `<li><span><b>${esc(r.student_id)}</b> ${esc(r.student_name)}${r.source === "manual" ? " <span class='badge'>manual</span>" : ""}</span>
      <span>${new Date(r.submitted_at).toLocaleTimeString("en-GB", { timeZone: cfg.TIME_ZONE || undefined })}</span></li>`).join("")
      : `<li class="muted">No check-ins yet.</li>`;
  }

  (async () => {
    if (!classId) { root.innerHTML = `<div class="card" style="color:#1f2933">Missing class. Open the PIN screen from the admin page.</div>`; return; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = "admin.html"; return; }
    try { await loadContext(); } catch (e) { root.innerHTML = `<div class="card" style="color:#1f2933">Class not found or you do not have access.</div>`; return; }
    shell(); await refresh(); controls(); feed();
    poll = setInterval(refresh, 1000);         // PIN comes from the server every second (no clock drift)
    tick = setInterval(animate, 200);
    feedTimer = setInterval(feed, 4000);
  })();
})();
