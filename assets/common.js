/*! © 2026 Wahidul Alam Riyad. All rights reserved. Proprietary — unauthorized copying, use or redistribution is prohibited. See LICENSE. */
// Classfolio — shared helpers for all pages
(function () {
  const cfg = window.APP_CONFIG || {};
  // Accept a pasted URL with /rest/v1/ or a trailing slash: keep only https://<project>.supabase.co
  if (cfg.SUPABASE_URL) cfg.SUPABASE_URL = String(cfg.SUPABASE_URL).trim().replace(/\/(rest|auth)\/v1\/?.*$/i, "").replace(/\/+$/, "");
  if (cfg.SUPABASE_ANON_KEY) cfg.SUPABASE_ANON_KEY = String(cfg.SUPABASE_ANON_KEY).trim();
  const configured = !!(cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-PROJECT") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR-"));

  // ---- icons (Lucide-style, inline SVG) ----
  const P = {
    logo: '<path d="M2.5 6.3c2.9-1.3 6-1.3 9.5.8 3.5-2.1 6.6-2.1 9.5-.8v10.6c-2.9-1.3-6-1.3-9.5.8-3.5-2.1-6.6-2.1-9.5-.8z"/><path d="M12 7.1v10.6"/><path d="M5.2 10h3.8M5.2 12.7h2.6"/><path d="M14.4 12.1l1.7 1.7 3.2-3.5" stroke="#7dffb3"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    graduation: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
    sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16V9M12 16V5M17 16v-4"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61M2 2l20 20"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/><path d="M14 2v6h6"/>',
    dots: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  };
  const icon = (n, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ""}</svg>`;

  // ---- theme ----
  const theme = {
    get() { return document.documentElement.dataset.theme || "light"; },
    set(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("att_theme", t); } catch {} document.dispatchEvent(new CustomEvent("themechange", { detail: t })); },
    toggle() { theme.set(theme.get() === "dark" ? "light" : "dark"); },
    button() { return `<button class="theme-btn" data-theme-toggle title="Switch Light / Dark Mode" aria-label="Switch light or dark mode">${icon("moon", "moon")}${icon("sun", "sun")}</button>`; },
  };
  if (!document.documentElement.dataset.theme) {
    let t = null; try { t = localStorage.getItem("att_theme"); } catch {}
    document.documentElement.dataset.theme = t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-theme-toggle]")) theme.toggle(); });

  // "Remember Me": keep the faculty session in localStorage (stays signed in) or sessionStorage (ends when the browser closes)
  function rememberMe() { try { return localStorage.getItem("cf_remember") !== "0"; } catch { return true; } }
  const authStorage = {
    getItem(k) { try { return sessionStorage.getItem(k) ?? localStorage.getItem(k); } catch { return null; } },
    setItem(k, v) { try { const keep = rememberMe(); (keep ? localStorage : sessionStorage).setItem(k, v); (keep ? sessionStorage : localStorage).removeItem(k); } catch {} },
    removeItem(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch {} },
  };

  const App = {
    cfg, configured, icon, theme,
    sb: configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true, storage: authStorage, storageKey: "classfolio-auth" } }) : null,
    remember: { get: rememberMe, set(v) { try { localStorage.setItem("cf_remember", v ? "1" : "0"); } catch {} } },
    // brand block (logo + wordmark)
    brand(sub = "") {
      return `<img class="logo-img logo-light" src="assets/logo.svg" alt="" width="40" height="40" /><img class="logo-img logo-dark" src="assets/logo-dark.svg" alt="" width="40" height="40" /><span class="brand-text"><span class="t1">Class<span class="folio">folio</span></span>${sub ? `<span class="t2">${App.esc(sub)}</span>` : ""}</span>`;
    },
    logoBig() { return `<img class="logo-img lg logo-light" src="assets/logo.svg" alt="Classfolio" width="60" height="60" /><img class="logo-img lg logo-dark" src="assets/logo-dark.svg" alt="Classfolio" width="60" height="60" />`; },
    avatar(url, name, size = 40, cls = "") {
      const s = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px`;
      return url ? `<img class="avatar-img ${cls}" src="${App.esc(url)}" alt="${App.esc(name || "")}" style="${s}" loading="lazy" referrerpolicy="no-referrer" />`
        : `<span class="avatar ${cls}" style="${s}">${App.esc(App.initials(name || "?"))}</span>`;
    },

    esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); },
    $(sel, root = document) { return root.querySelector(sel); },
    $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },

    // Title Case for short labels (small words stay lowercase; acronyms and IDs untouched)
    titleCase(t) {
      const small = new Set("a an the and or nor but of in on to for by with at from as per vs via".split(" "));
      const w = String(t).split(" "), last = w.length - 1;
      return w.map((x, i) => (/[A-Z0-9@#$]/.test(x.slice(1)) || !/^[a-z]/i.test(x) ? x : i && i !== last && small.has(x.toLowerCase()) ? x.toLowerCase() : x[0].toUpperCase() + x.slice(1))).join(" ");
    },
    toast(msg, isErr = false) {
      if (String(msg).split(" ").length <= 7 && !/[.!?]$/.test(String(msg).trim())) msg = App.titleCase(msg);
      let t = document.getElementById("toast");
      if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
      t.innerHTML = icon(isErr ? "alert" : "check") + `<span>${App.esc(msg)}</span>`; t.className = "show" + (isErr ? " err" : "");
      clearTimeout(t._h); t._h = setTimeout(() => (t.className = isErr ? "err" : ""), isErr ? 5000 : 2400);
    },

    // Promise-based dialog. Resolves with the modal element (OK) or null (cancel).
    dialog({ title, body = "", okText = "OK", cancelText = "Cancel", danger = false, html = false, wide = false, ic = null, noCancel = false, validate = null }) {
      return new Promise((resolve) => {
        const bg = document.createElement("div"); bg.className = "modal-bg";
        bg.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
          <div class="mh">${ic || danger ? `<div class="ic ${danger ? "red" : ""}">${icon(ic || "alert")}</div>` : ""}<h3 class="grow">${App.esc(title)}</h3>
            <button class="icon-btn" data-x="0" aria-label="Close">${icon("x")}</button></div>
          <div class="dlg-body">${html ? body : `<p>${App.esc(body)}</p>`}</div>
          <div class="actions">${noCancel ? "" : `<button class="btn secondary" data-x="0">${App.esc(cancelText)}</button>`}
          ${okText ? `<button class="btn ${danger ? "red" : ""}" data-x="1">${App.esc(okText)}</button>` : ""}</div></div>`;
        document.body.appendChild(bg);
        const done = (v) => {
          if (v && validate) { const err = validate(bg); if (err) { App.toast(err, true); return; } }
          bg.remove(); document.removeEventListener("keydown", key); resolve(v ? bg : null);
        };
        const key = (e) => { if (e.key === "Escape") done(false); if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox" && bg.contains(e.target)) { e.preventDefault(); done(true); } };
        document.addEventListener("keydown", key);
        bg.addEventListener("mousedown", (e) => { if (e.target === bg) done(false); });
        bg.addEventListener("click", (e) => { const x = e.target.closest("[data-x]"); if (x) done(x.dataset.x === "1"); });
        setTimeout(() => { const first = bg.querySelector(".dlg-body input:not([type=checkbox]),.dlg-body select"); (first || bg.querySelector('[data-x="1"]') || bg.querySelector("[data-x]")).focus(); }, 0);
      });
    },
    async confirm(title, body, okText = "Delete", danger = true) { return !!(await App.dialog({ title, body, okText, danger })); },

    fmtDate(ts, withTime = true) {
      if (!ts) return "";
      return new Date(ts).toLocaleString("en-GB", { timeZone: cfg.TIME_ZONE || undefined, day: "2-digit", month: "short", year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
    },
    fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString("en-GB", { timeZone: cfg.TIME_ZONE || undefined, hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""; },
    fmtDay(d) { return d ? new Date(d + (String(d).length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }) : ""; },
    pad2(n) { return String(n).padStart(2, "0"); },
    classLabel(n) { return "Class-" + String(n).padStart(2, "0"); },
    // "RAYDOAN, MD. MUSFIQUR RAHMAN" -> "Raydoan, Md. Musfiqur Rahman" (only changes ALL-CAPS / all-lowercase names)
    nameCase(s) {
      s = String(s ?? "").trim();
      if (!s || (s !== s.toUpperCase() && s !== s.toLowerCase())) return s;
      return s.toLowerCase().replace(/(^|[\s\-'.(,\/])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
    },
    initials(s) { return String(s || "?").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?"; },
    pctClass(p, min = 80) { return p == null ? "" : p >= min ? "pct-good" : p >= min - 10 ? "pct-warn" : "pct-bad"; },
    progress(p, min = 80) { const c = p == null ? "" : p >= min ? "" : p >= min - 10 ? "warn" : "bad"; return `<div class="progress ${c}"><span style="width:${Math.max(0, Math.min(100, p || 0))}%"></span></div>`; },
    // circular ring (SVG)
    ring(p, size = 76, stroke = 8, color = null) {
      const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, p || 0));
      return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="transform:rotate(-90deg)">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color || "var(--success)"}" stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 100)}" style="transition:stroke-dashoffset .6s ease"/></svg>`;
    },

    deviceId() {
      try {
        let id = localStorage.getItem("att_device");
        if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem("att_device", id); }
        return id;
      } catch { return null; }
    },
    studentLink() { return location.href.replace(/[^/]*([?#].*)?$/, ""); },   // the Student Portal (one link for every course)
    async copy(text, msg = "Copied") { try { await navigator.clipboard.writeText(text); App.toast(msg); } catch { App.toast("Copy Failed — Select and Copy Manually", true); } },

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
      return `<div class="corner">${theme.button()}</div><div class="center-wrap"><div class="card" style="max-width:560px">
        <div class="empty" style="padding:10px"><div class="ic">${icon("settings")}</div><h3>Setup Needed</h3>
        <p>Open <code>config.js</code> and fill in <b>SUPABASE_URL</b> (Project URL) and <b>SUPABASE_ANON_KEY</b> (publishable key) from your Supabase project. See <code>README.md</code>.</p></div></div></div>`;
    },
  };
  window.App = App;
})();
