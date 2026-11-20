/*! © 2026 Wahidul Alam Riyad. All rights reserved. Proprietary — unauthorized copying, use or redistribution is prohibited. See LICENSE. */
// Student page: enter Student ID + the 6-digit PIN shown in class
(function () {
  const { esc, sb, cfg, icon } = App;
  const root = document.getElementById("app");
  const token = new URLSearchParams(location.search).get("s") || "";
  const idRe = cfg.STUDENT_ID_PATTERN ? new RegExp(cfg.STUDENT_ID_PATTERN) : null;
  let info = null, pollTimer = null, clockTimer = null, busy = false, view = "form";

  if (!App.configured) { document.body.innerHTML = App.notConfiguredHtml(); return; }

  const savedId = () => { try { return localStorage.getItem("att_last_id") || ""; } catch { return ""; } };
  const top = () => `<div class="student-top"><div class="brand"><div class="logo">${icon("logo")}</div><div><div class="t1">Class Attendance</div>
      <div class="t2">${esc(cfg.INSTITUTION || "")}</div></div></div>${App.theme.button()}</div>`;
  function header() {
    if (!info) return `<div class="head"><div class="title">Class Attendance</div></div>`;
    return `<div class="head"><div class="code">${esc(info.course_code)}${info.class_code ? " · Class Code " + esc(info.class_code) : ""}</div>
      <div class="title">${esc(info.course_title)}</div><div class="meta">Section ${esc(info.section)} · ${esc(info.intake)}</div></div>`;
  }
  const shell = (inner) => `<div class="student-wrap">${top()}<div class="student">${header()}<div class="body">${inner}</div></div>
    <div class="footer-note">${icon("shield")} Your attendance is checked against the section list.</div></div>`;
  const fail = (msg) => { root.innerHTML = shell(`<div class="msg err">${icon("alert")}<div>${esc(msg)}</div></div>`); };

  function left(exp) { const s = Math.max(0, Math.round((new Date(exp) - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${App.pad2(s % 60)}`; }

  // ---------------- form
  function renderForm(state = {}) {
    view = "form";
    const a = info && info.active, id = state.id ?? savedId();
    root.innerHTML = shell(`
      ${a ? `<div class="status-pill open"><span class="live-dot"></span><div class="grow">Attendance Is Open<small>${esc(a.term)} · ${App.classLabel(a.number)}${a.title ? " · " + esc(a.title) : ""}</small></div>
              <span class="count" id="cd" title="Time left">${left(a.expires_at)}</span></div>`
          : `<div class="status-pill closed">${icon("clock")}<div class="grow">Attendance Is Not Open Yet<small>This page updates by itself when your instructor starts.</small></div><span class="spinner" style="width:18px;height:18px"></span></div>`}
      <form id="f" autocomplete="off" novalidate>
        <label for="sid">Student ID</label>
        <input id="sid" class="id-input" inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="${esc(cfg.STUDENT_ID_EXAMPLE || "")}" value="${esc(id)}" maxlength="30" required />
        <div class="field-gap"></div>
        <label>6-Digit PIN on the Class Screen</label>
        <div class="otp" id="otp">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="PIN digit ${i + 1}" ${a ? "" : "disabled"} />`).join("")}</div>
        <div class="field-gap"></div>
        <button class="btn lg block" type="submit" id="go" ${a ? "" : "disabled"}>${icon("check")} Record My Attendance</button>
        ${state.error ? `<div class="msg err">${icon("alert")}<div>${esc(state.error)}</div></div>` : ""}
        <p class="muted small center" style="margin:16px 0 0">The PIN changes every 15 seconds — type the one on the screen now.</p>
      </form>`);
    const boxes = App.$$("#otp input"), sid = document.getElementById("sid");
    boxes.forEach((b, i) => {
      b.addEventListener("input", () => {
        const v = b.value.replace(/\D/g, "");
        if (v.length > 1) { fillFrom(i, v); return; }
        b.value = v; b.classList.toggle("filled", !!v);
        if (v && i < 5) boxes[i + 1].focus();
        if (boxes.every((x) => x.value)) submit();
      });
      b.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !b.value && i > 0) { boxes[i - 1].value = ""; boxes[i - 1].classList.remove("filled"); boxes[i - 1].focus(); e.preventDefault(); }
        if (e.key === "ArrowLeft" && i > 0) boxes[i - 1].focus();
        if (e.key === "ArrowRight" && i < 5) boxes[i + 1].focus();
      });
      b.addEventListener("paste", (e) => { e.preventDefault(); fillFrom(i, (e.clipboardData.getData("text") || "").replace(/\D/g, "")); });
      b.addEventListener("focus", () => b.select());
    });
    function fillFrom(i, digits) {
      digits.slice(0, 6 - i).split("").forEach((d, k) => { boxes[i + k].value = d; boxes[i + k].classList.add("filled"); });
      const next = boxes.find((x) => !x.value); (next || boxes[5]).focus();
      if (boxes.every((x) => x.value)) submit();
    }
    sid.addEventListener("input", () => { const p = sid.selectionStart; sid.value = sid.value.toUpperCase(); sid.setSelectionRange(p, p); });
    sid.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); boxes[0].focus(); } });
    document.getElementById("f").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
    if (a) (id && (!idRe || idRe.test(id)) ? boxes[0] : sid).focus();
  }

  // ---------------- result
  function renderResult(r, id) {
    view = "result";
    const s = r.summary, late = r.status === "late", ok = r.ok;
    const kind = !ok ? "err" : late ? "late" : "ok";
    const pct = s && s.pct != null ? s.pct : null, low = pct != null && pct < (s.min_pct ?? 80);
    root.innerHTML = shell(`<div class="result ${kind}">
        <div class="check">${icon(ok ? (late ? "clock" : "check") : "x")}</div>
        <h2>${esc(r.message)}</h2>
        ${r.name ? `<div class="who">${esc(App.nameCase(r.name))}</div>` : ""}
        <div class="det">${esc(id)}${r.term ? " · " + esc(r.term) + " · " + App.classLabel(r.class) : ""}</div>
        ${r.at ? `<div class="det">${App.fmtDate(r.at)}</div>` : ""}
        ${ok && r.status ? `<div style="margin-top:12px"><span class="badge ${late ? "amber" : r.status === "excused" ? "violet" : "green"}">${late ? "Late" : r.status === "excused" ? "Excused" : "On Time"}</span></div>` : ""}
      </div>
      ${s && s.held ? `<div class="summary"><div class="ring">${App.ring(pct, 76, 8, low ? "var(--danger)" : "var(--success)")}<b>${pct}%</b></div>
        <div class="t">You have attended <b>${s.attended}</b> of <b>${s.held}</b> classes so far${s.late ? `, <b>${s.late}</b> late` : ""}.
        ${low ? `<div class="msg warn" style="margin-top:10px">${icon("alert")}<div>Below the ${s.min_pct}% minimum. Try not to miss more classes.</div></div>` : `<div class="small muted" style="margin-top:6px">Keep it up!</div>`}</div></div>` : ""}
      <div style="margin-top:22px">${ok ? `<p class="muted small center" style="margin:0 0 12px">You can close this page now.</p>
        <button class="btn ghost block" id="other">${icon("user")} Check In a Different ID</button>`
        : `<button class="btn lg block" id="again">${icon("refresh")} Try Again</button>`}</div>`);
    const again = document.getElementById("again"); if (again) again.onclick = () => renderForm({ id });
    const other = document.getElementById("other"); if (other) other.onclick = () => { try { localStorage.removeItem("att_last_id"); } catch {} load().then(() => { renderForm({ id: "" }); startPoll(); }); };
  }

  async function submit() {
    if (busy || view !== "form") return;
    const sidEl = document.getElementById("sid");
    const id = sidEl.value.trim().toUpperCase().replace(/\s+/g, "");
    const pin = App.$$("#otp input").map((b) => b.value).join("");
    if (!id) return renderForm({ id, error: "Enter your Student ID first." });
    if (idRe && !idRe.test(id)) return renderForm({ id, error: `That doesn't look like a Student ID. Example: ${cfg.STUDENT_ID_EXAMPLE}` });
    if (!/^\d{6}$/.test(pin)) return renderForm({ id, error: "Enter all 6 digits of the PIN." });
    busy = true;
    const btn = document.getElementById("go"); btn.disabled = true; btn.innerHTML = `<span class="spinner" style="width:18px;height:18px;border-color:rgba(255,255,255,.4);border-top-color:#fff"></span> Checking…`;
    try {
      const { data, error } = await sb.rpc("submit_attendance", { p_token: token, p_student_id: id, p_pin: pin, p_device: App.deviceId() });
      if (error) throw error;
      try { localStorage.setItem("att_last_id", id); } catch {}
      if (data.ok) { stopPoll(); renderResult(data, id); }
      else if (data.code === "closed") { await load(); renderForm({ id, error: data.message }); }
      else if (["wrong_pin", "bad_pin", "bad_id"].includes(data.code)) renderForm({ id, error: data.message });
      else renderResult(data, id);
    } catch (err) {
      renderForm({ id, error: navigator.onLine === false ? "You are offline. Connect to the internet and try again." : "Could not reach the server. Try again in a moment." });
    } finally { busy = false; }
  }

  async function load() {
    const { data, error } = await sb.rpc("get_section_public", { p_token: token });
    if (error) throw error;
    if (!data.ok) { stopPoll(); fail(data.message); return false; }
    info = data; return true;
  }
  function stopPoll() { clearInterval(pollTimer); pollTimer = null; }
  function startPoll() {
    stopPoll();
    pollTimer = setInterval(async () => {
      if (view !== "form" || busy) return;
      const was = info && info.active ? info.active.number + info.active.term : "";
      const typing = App.$$("#otp input").some((b) => b.value);
      try { if (!(await load())) return; } catch { return; }
      const now = info && info.active ? info.active.number + info.active.term : "";
      if (now !== was && !typing) renderForm({ id: document.getElementById("sid")?.value });
    }, 6000);
  }
  clockTimer = setInterval(() => {
    const el = document.getElementById("cd"); if (!el || !info?.active) return;
    el.textContent = left(info.active.expires_at);
    if (new Date(info.active.expires_at) <= Date.now()) load().then(() => view === "form" && !busy && renderForm({ id: document.getElementById("sid")?.value })).catch(() => {});
  }, 1000);

  (async () => {
    if (!token) return fail("This attendance link is incomplete. Ask your instructor for the section link.");
    try { if (await load()) { renderForm(); startPoll(); } }
    catch { fail("Could not reach the server. Refresh the page to try again."); }
  })();
})();
