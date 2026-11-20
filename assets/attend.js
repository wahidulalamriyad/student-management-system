// Student page: enter Student ID + the 6-digit PIN shown in class
(function () {
  const { esc, sb, cfg } = App;
  const root = document.getElementById("app");
  const token = new URLSearchParams(location.search).get("s") || "";
  const idRe = cfg.STUDENT_ID_PATTERN ? new RegExp(cfg.STUDENT_ID_PATTERN) : null;
  let info = null, pollTimer = null, busy = false;

  if (!App.configured) { document.body.innerHTML = App.notConfiguredHtml(); return; }

  function header() {
    if (!info) return `<div class="head"><div class="title">Class Attendance</div></div>`;
    return `<div class="head">
      <div class="code">${esc(info.course_code)}${info.class_code ? " · Class " + esc(info.class_code) : ""}</div>
      <div class="title">${esc(info.course_title)}</div>
      <div class="meta">Section ${esc(info.section)} · ${esc(info.intake)}</div></div>`;
  }

  function render(state = {}) {
    const a = info && info.active;
    const savedId = (() => { try { return localStorage.getItem("att_last_id") || ""; } catch { return ""; } })();
    if (state.result) {
      const r = state.result, ok = r.ok;
      root.innerHTML = header() + `<div class="body"><div class="result ${ok ? "ok" : "err"}">
        <div class="big">${ok ? "✔" : "✘"}</div>
        <h3>${esc(r.message)}</h3>
        ${r.name ? `<div><b>${esc(r.name)}</b></div>` : ""}
        <div class="muted small" style="margin-top:6px">${esc(state.id || "")}${r.term ? " · " + esc(r.term) + " · " + App.classLabel(r.class) : ""}</div>
        ${r.at ? `<div class="muted small">${App.fmtDate(r.at)}</div>` : ""}
        </div>
        ${ok ? `<p class="muted small" style="text-align:center">You can close this page.</p>` :
               `<button class="btn" style="width:100%;justify-content:center;margin-top:10px" id="again">Try again</button>`}
      </div>`;
      const again = document.getElementById("again"); if (again) again.onclick = () => render({ id: state.id });
      return;
    }
    root.innerHTML = header() + `<div class="body">
      ${a ? `<div class="active-class">● Attendance open: ${esc(a.term)} · ${App.classLabel(a.number)}${a.title ? " · " + esc(a.title) : ""}</div>`
          : `<div class="closed-class">Attendance is not open right now. This page refreshes automatically.</div>`}
      <form id="f" autocomplete="off" novalidate>
        <label for="sid">Student ID</label>
        <input id="sid" class="id-input" inputmode="text" placeholder="${esc(cfg.STUDENT_ID_EXAMPLE || "")}" value="${esc(state.id ?? savedId)}" maxlength="30" required />
        <div style="height:14px"></div>
        <label for="pin">6-digit PIN shown on the class screen</label>
        <input id="pin" class="pin-input" inputmode="numeric" pattern="\\d{6}" maxlength="6" placeholder="••••••" required ${a ? "" : "disabled"} />
        <div style="height:16px"></div>
        <button class="btn" type="submit" style="width:100%;justify-content:center;padding:13px;font-size:15px" ${a ? "" : "disabled"}>Record my attendance</button>
        ${state.error ? `<div class="msg err">${esc(state.error)}</div>` : ""}
        <p class="muted small" style="margin-top:14px">The PIN changes every 15 seconds. Enter it while it is on the screen.</p>
      </form></div>`;
    const pin = document.getElementById("pin");
    pin.addEventListener("input", () => { pin.value = pin.value.replace(/\D/g, "").slice(0, 6); });
    document.getElementById("f").addEventListener("submit", submit);
    (a && (state.id ?? savedId) ? pin : document.getElementById("sid")).focus();
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const id = document.getElementById("sid").value.trim().toUpperCase().replace(/\s+/g, "");
    const pin = document.getElementById("pin").value.trim();
    if (!id) return render({ id, error: "Enter your Student ID." });
    if (idRe && !idRe.test(id)) return render({ id, error: `Student ID format should look like ${cfg.STUDENT_ID_EXAMPLE}.` });
    if (!/^\d{6}$/.test(pin)) return render({ id, error: "The PIN has 6 digits." });
    busy = true;
    const btn = root.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Checking…";
    try {
      const { data, error } = await sb.rpc("submit_attendance", { p_token: token, p_student_id: id, p_pin: pin, p_device: App.deviceId() });
      if (error) throw error;
      try { localStorage.setItem("att_last_id", id); } catch {}
      if (data.ok) { stopPoll(); render({ result: data, id }); }
      else if (data.code === "closed") { await load(); render({ id, error: data.message }); }
      else if (["wrong_pin", "bad_pin", "bad_id"].includes(data.code)) render({ id, error: data.message });
      else render({ result: data, id });
    } catch (err) {
      render({ id, error: "Could not reach the server. Check your internet connection and try again." });
    } finally { busy = false; }
  }

  async function load() {
    const { data, error } = await sb.rpc("get_section_public", { p_token: token });
    if (error) throw error;
    if (!data.ok) { root.innerHTML = header() + `<div class="body"><div class="msg err">${esc(data.message)}</div></div>`; stopPoll(); return false; }
    info = data; return true;
  }
  function stopPoll() { clearInterval(pollTimer); pollTimer = null; }
  function startPoll() {
    stopPoll();
    pollTimer = setInterval(async () => {
      const wasOpen = !!(info && info.active);
      if (document.activeElement && document.activeElement.id === "pin" && document.activeElement.value) return; // do not disturb typing
      try { await load(); } catch { return; }
      if (!!(info && info.active) !== wasOpen) render({ id: document.getElementById("sid")?.value });
    }, 8000);
  }

  (async () => {
    if (!token) { root.innerHTML = header() + `<div class="body"><div class="msg err">This attendance link is incomplete. Ask your instructor for the section link.</div></div>`; return; }
    try { if (await load()) { render(); startPoll(); } }
    catch { root.innerHTML = header() + `<div class="body"><div class="msg err">Could not reach the server. Refresh the page to try again.</div></div>`; }
  })();
})();
