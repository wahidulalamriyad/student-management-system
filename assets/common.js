// Shared helpers for all pages
(function () {
  const cfg = window.APP_CONFIG || {};
  // Accept a pasted URL with /rest/v1/ or a trailing slash: keep only https://<project>.supabase.co
  if (cfg.SUPABASE_URL) cfg.SUPABASE_URL = String(cfg.SUPABASE_URL).trim().replace(/\/(rest|auth)\/v1\/?.*$/i, "").replace(/\/+$/, "");
  if (cfg.SUPABASE_ANON_KEY) cfg.SUPABASE_ANON_KEY = String(cfg.SUPABASE_ANON_KEY).trim();
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-PROJECT") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR-");

  const App = {
    cfg,
    configured,
    sb: configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true } }) : null,

    esc(s) {
      return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    },
    $(sel, root = document) { return root.querySelector(sel); },
    $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },

    toast(msg, isErr = false) {
      let t = document.getElementById("toast");
      if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
      t.textContent = msg; t.className = "show" + (isErr ? " err" : "");
      clearTimeout(t._h); t._h = setTimeout(() => (t.className = ""), isErr ? 4500 : 2200);
    },

    // Promise-based confirm / prompt dialogs
    dialog({ title, body = "", okText = "OK", cancelText = "Cancel", danger = false, html = false }) {
      return new Promise((resolve) => {
        const bg = document.createElement("div"); bg.className = "modal-bg";
        bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${App.esc(title)}</h3>
          <div class="dlg-body">${html ? body : `<p>${App.esc(body)}</p>`}</div>
          <div class="actions"><button class="btn secondary" data-x="0">${App.esc(cancelText)}</button>
          <button class="btn ${danger ? "red" : ""}" data-x="1">${App.esc(okText)}</button></div></div>`;
        document.body.appendChild(bg);
        const done = (v) => { bg.remove(); resolve(v ? bg : null); };
        bg.addEventListener("click", (e) => { if (e.target === bg) done(false); const x = e.target.closest("[data-x]"); if (x) done(x.dataset.x === "1"); });
        const first = bg.querySelector("input,select"); (first || bg.querySelector('[data-x="1"]')).focus();
        bg.addEventListener("keydown", (e) => { if (e.key === "Escape") done(false); if (e.key === "Enter" && e.target.tagName === "INPUT") done(true); });
      });
    },
    async confirm(title, body, okText = "Delete") { return !!(await App.dialog({ title, body, okText, danger: true })); },

    fmtDate(ts, withTime = true) {
      if (!ts) return "";
      const d = new Date(ts);
      return d.toLocaleString("en-GB", { timeZone: cfg.TIME_ZONE || undefined, day: "2-digit", month: "short", year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : {}) });
    },
    pad2(n) { return String(n).padStart(2, "0"); },
    classLabel(n) { return "Class-" + String(n).padStart(2, "0"); },

    deviceId() {
      try {
        let id = localStorage.getItem("att_device");
        if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem("att_device", id); }
        return id;
      } catch { return null; }
    },

    studentLink(token) {
      const base = location.href.replace(/[^/]*([?#].*)?$/, "");
      return `${base}attend.html?s=${encodeURIComponent(token)}`;
    },

    // Supabase returns at most 1000 rows per request; page through larger results
    async fetchAll(build) {
      const out = []; const size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await build().range(from, from + size - 1);
        if (error) throw error;
        out.push(...data);
        if (data.length < size) break;
      }
      return out;
    },

    notConfiguredHtml() {
      return `<div class="center-wrap"><div class="card" style="max-width:560px"><h2>Setup needed</h2>
        <p>Open <code>config.js</code> and fill in <b>SUPABASE_URL</b> and <b>SUPABASE_ANON_KEY</b> from your Supabase project
        (Project Settings ▸ API). See <code>README.md</code> for the full steps.</p></div></div>`;
    },
  };
  window.App = App;
})();
