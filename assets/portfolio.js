/*! © 2026 Wahidul Alam Riyad. All rights reserved. Proprietary — unauthorized copying, use or redistribution is prohibited. See LICENSE. */
// Shared grade engine, course presets and the portfolio view (used by faculty and student pages)
(function () {
  const esc = (s) => App.esc(s), icon = (n) => App.icon(n);
  const AIUB_SCALE = [{ min: 90, grade: "A+", point: 4.0 }, { min: 85, grade: "A", point: 3.75 }, { min: 80, grade: "B+", point: 3.5 }, { min: 75, grade: "B", point: 3.25 },
    { min: 70, grade: "C+", point: 3.0 }, { min: 65, grade: "C", point: 2.75 }, { min: 60, grade: "D+", point: 2.5 }, { min: 50, grade: "D", point: 2.25 }, { min: 0, grade: "F", point: 0 }];
  const num = (x) => (x == null || x === "" || isNaN(+x) ? null : +x);
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const fmt = (x, d = 1) => (x == null ? "—" : (Math.round(x * 10 ** d) / 10 ** d).toLocaleString("en-US", { maximumFractionDigits: d }));

  function gradeFor(total, scale, round) {
    if (total == null) return null;
    const v = round ? Math.round(r2(total)) : r2(total);
    const s = [...(scale && scale.length ? scale : AIUB_SCALE)].sort((a, b) => b.min - a.min);
    return s.find((g) => v >= g.min) || s[s.length - 1];
  }

  // Build display rows (single items + groups) for one term
  function termRows(items) {
    const rows = [], seen = {};
    items.forEach((a) => {
      if (a.grp) {
        if (!seen[a.grp]) { seen[a.grp] = { group: true, label: a.grp, rule: a.rule || "sum", items: [] }; rows.push(seen[a.grp]); }
        seen[a.grp].items.push(a);
      } else rows.push({ group: false, label: a.name, rule: "sum", items: [a] });
    });
    return rows;
  }

  /**
   * Compute one student's results.
   * ctx: { terms, assessments, scale, round, coTarget, cos, specialGrade }
   * score(aid) -> number|null, att(termId) -> {held, attended}
   */
  function student(ctx, score, att) {
    const terms = [...ctx.terms].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const wSum = terms.reduce((n, t) => n + (num(t.weight) || 0), 0);
    const tw = (t) => (wSum > 0 ? (num(t.weight) || 0) / wSum : 1 / (terms.length || 1));
    const out = { terms: [], overall: 0, complete: true, coList: [] };
    const coAgg = {};
    terms.forEach((t) => {
      const items = ctx.assessments.filter((a) => a.term_id === t.id).sort((a, b) => (a.sort || 0) - (b.sort || 0));
      const A = att(t.id) || { held: 0, attended: 0 };
      let total = 0, possible = 0, missing = 0, pending = 0, gW = 0, gC = 0;
      const rows = termRows(items).map((row) => {
        const kids = row.items.map((a) => {
          const hidden = a.visible === false;
          let sc = null;
          if (a.kind === "attendance") sc = A.held ? (A.attended / A.held) * a.max_marks : null;
          else sc = hidden ? null : num(score(a.id));
          const ratio = sc == null ? null : Math.min(1, sc / a.max_marks);
          if (a.co && a.kind !== "attendance" && sc != null) { const c = (coAgg[a.co] ||= { got: 0, max: 0 }); c.got += Math.min(sc, a.max_marks); c.max += +a.max_marks; }
          return { a, hidden, score: sc, ratio, contrib: ratio == null ? 0 : ratio * a.weight, missing: !hidden && sc == null && a.kind !== "attendance", pending: hidden || (a.kind === "attendance" && !A.held) };
        });
        let contrib, weight, max, sc, ratio;
        if (row.rule === "best" || row.rule === "avg") {
          const have = kids.filter((k) => k.ratio != null);
          weight = Math.max(...kids.map((k) => +k.a.weight)); max = Math.max(...kids.map((k) => +k.a.max_marks));
          ratio = have.length ? (row.rule === "best" ? Math.max(...have.map((k) => k.ratio)) : have.reduce((n, k) => n + k.ratio, 0) / have.length) : null;
          contrib = ratio == null ? 0 : ratio * weight; sc = ratio == null ? null : ratio * max;
          if (row.rule === "best") { const b = have.find((k) => k.ratio === ratio); kids.forEach((k) => (k.best = k === b)); }
        } else {
          weight = kids.reduce((n, k) => n + +k.a.weight, 0); max = kids.reduce((n, k) => n + +k.a.max_marks, 0);
          contrib = kids.reduce((n, k) => n + k.contrib, 0);
          const scored = kids.filter((k) => k.score != null);
          sc = scored.length ? scored.reduce((n, k) => n + k.score, 0) : null; ratio = sc == null ? null : sc / max;
        }
        const rowPending = kids.every((k) => k.pending), rowMissing = row.rule === "sum" ? kids.some((k) => k.missing) : kids.every((k) => k.missing || k.pending);
        const co = [...new Set(kids.map((k) => k.a.co).filter(Boolean))].join(", ");
        total += contrib; possible += rowPending ? 0 : weight; if (rowMissing) missing++; if (rowPending) pending++;
        if (!rowPending && ratio != null) { gW += weight; gC += contrib; }
        return { ...row, kids, contrib, weight, max, score: sc, ratio, co, pending: rowPending, missing: rowMissing, kind: kids[0].a.kind };
      });
      const g = gradeFor(total, ctx.scale, ctx.round);
      out.terms.push({ term: t, weightShare: tw(t), rows, total: r2(total), possible, missing, pending, grade: g, att: A,
        attPct: A.held ? Math.round((A.attended / A.held) * 100) : null, empty: items.length === 0 });
      out.overall += total * tw(t); out._gW = (out._gW || 0) + gW * tw(t); out._gC = (out._gC || 0) + gC * tw(t);
      if (missing || pending) out.complete = false;
    });
    out.overall = r2(out.overall);
    out.coverage = r2(out._gW || 0);                                   // % of the course marked so far
    out.standing = out._gW ? r2(((out._gC || 0) / out._gW) * 100) : null; // score on what has been marked
    const g = gradeFor(out.overall, ctx.scale, ctx.round);
    out.grade = ctx.specialGrade ? { grade: ctx.specialGrade, point: null, special: true } : g;
    out.standingGrade = out.standing == null ? null : gradeFor(out.standing, ctx.scale, ctx.round);
    const allHeld = out.terms.reduce((n, t) => n + t.att.held, 0), allAtt = out.terms.reduce((n, t) => n + t.att.attended, 0);
    out.attPct = allHeld ? Math.round((allAtt / allHeld) * 100) : null;
    const target = ctx.coTarget ?? 60;
    const codes = [...new Set([...(ctx.cos || []).map((c) => c.code), ...Object.keys(coAgg)])].sort();
    out.coList = codes.map((code) => { const c = coAgg[code], def = (ctx.cos || []).find((x) => x.code === code) || {};
      const pct = c && c.max ? Math.round((c.got / c.max) * 100) : null; return { code, statement: def.statement || "", po: def.po || "", level: def.level || "", got: c?.got ?? null, max: c?.max ?? null, pct, attained: pct != null && pct >= target }; });
    out.coAttained = out.coList.filter((c) => c.attained).length; out.coTarget = target;
    return out;
  }

  // ------------------------------------------------------------------ presets
  const P = (term, name, max, weight, extra = {}) => ({ term, name, max_marks: max, weight, ...extra });
  const att = (term, label = "Attendance & Performance") => P(term, label, 10, 10, { kind: "attendance" });
  const crit = (term, grp, names, max, weight, co) => names.map((n) => P(term, n, max, weight, { grp, co }));
  const PRESETS = {
    webtech: {
      label: "Web Technologies (CSC 3215)", termWeights: [40, 60],
      cos: [{ code: "CO1", statement: "Analyze professional engineering solutions in societal and environmental contexts", po: "PO-c-1", level: "C4" },
        { code: "CO2", statement: "Classify the flow of process for sustainable digital solution", po: "PO-c-1", level: "C4" },
        { code: "CO3", statement: "Develop multi-tier web application for targeted society", po: "PO-c-2", level: "C4" },
        { code: "CO4", statement: "Develop a multi-tier-based web application as group member/leader in the project", po: "PO-k-3", level: "P4" }],
      plan: [
        att(0), P(0, "Quiz 1", 20, 20, { grp: "Quiz (Best of 2)", rule: "best" }), P(0, "Quiz 2", 20, 20, { grp: "Quiz (Best of 2)", rule: "best" }),
        ...crit(0, "Project Prototype 1", ["Criterion 1", "Criterion 2"], 10, 10, "CO3").map((x) => ({ ...x, by_group: true })),
        ...crit(0, "Mid Term Exam", ["Analytical Question · Criterion 1", "Analytical Question · Criterion 2"], 10, 10, "CO1"),
        P(0, "Short Question", 10, 10, { grp: "Mid Term Exam" }), P(0, "Code Writing", 20, 20, { grp: "Mid Term Exam" }),
        att(1), P(1, "Quiz 3", 20, 20, { grp: "Quiz (Best of 2)", rule: "best" }), P(1, "Quiz 4", 20, 20, { grp: "Quiz (Best of 2)", rule: "best" }),
        ...crit(1, "Project Prototype 2", ["Criterion 1", "Criterion 2"], 10, 10, "CO4").map((x) => ({ ...x, by_group: true })),
        ...crit(1, "Final Term Exam", ["Analytical Question · Criterion 1", "Analytical Question · Criterion 2"], 10, 10, "CO2"),
        P(1, "Short Question", 10, 10, { grp: "Final Term Exam" }), P(1, "Code Writing", 20, 20, { grp: "Final Term Exam" })],
    },
    toc: {
      label: "Theory of Computation (CSC 3113)", termWeights: [40, 60],
      cos: [{ code: "CO1", statement: "Demonstrate different computational model and mathematical notations", po: "PO-a-2", level: "C3" },
        { code: "CO2", statement: "Use original example of different computational model and mathematical notations", po: "PO-a-2", level: "C3" },
        { code: "CO3", statement: "Determine a solution for a complex problem using the principles of existing computational models", po: "PO-c-3", level: "C5" },
        { code: "CO4", statement: "Explain the principles of existing computational models and use it to find a new solution", po: "PO-l-2", level: "A4" }],
      plan: [
        att(0, "Attendance"),
        ...crit(0, "Quiz 1", ["DFA Design · Design", "DFA Design · Design Conventions", "DFA Design · Result Analysis"], 5, 5, "CO3"), P(0, "Other Questions", 15, 15, { grp: "Quiz 1" }),
        ...crit(0, "Mid Term Exam (out of 100 → 60)", ["Regular Expression · Definition", "Regular Expression · Logical Argument", "Regular Expression · Relevant Example"], 5, 3, "CO2"),
        ...crit(0, "Mid Term Exam (out of 100 → 60)", ["NFA to DFA · Modification", "NFA to DFA · Conventions Followed", "NFA to DFA · Result Analysis"], 5, 3, "CO4"),
        P(0, "Other Questions", 70, 42, { grp: "Mid Term Exam (out of 100 → 60)" }),
        att(1, "Attendance"), P(1, "Quiz 2", 30, 30, { grp: "Quiz (Best of 2)", rule: "best" }), P(1, "Quiz 3", 30, 30, { grp: "Quiz (Best of 2)", rule: "best" }),
        ...crit(1, "Final Term Exam (out of 100 → 60)", ["PDA Formal Definition · Definition", "PDA Formal Definition · Logical Argument", "PDA Formal Definition · Relevant Example"], 5, 3, "CO1"),
        P(1, "Other Questions", 85, 51, { grp: "Final Term Exam (out of 100 → 60)" })],
    },
    dslab: {
      label: "Data Structure Lab (CSC 2107)", termWeights: [40, 60],
      cos: [{ code: "CO1", statement: "Apply concepts of basic data structures to solve simple arithmetic problems", po: "PO-a-4", level: "C3" },
        { code: "CO2", statement: "Solve real-life problems using advanced concepts of data structure", po: "PO-a-4", level: "C3" },
        { code: "CO3", statement: "Determine approaches required to solve complex problems based on specific requirements", po: "PO-e-1", level: "C3" },
        { code: "CO4", statement: "Use determined approaches in solving complex real-life problems with specific requirements", po: "PO-e-1", level: "C3" }],
      plan: [
        att(0), P(0, "Lab Task", 30, 30),
        ...crit(0, "Assignment & Viva", ["Knowledge and Proper Use of Data Structure", "Solution"], 10, 20, "CO1"),
        ...crit(0, "Lab Exam", ["Problem Analysis and Choice of Data Structure", "Solution"], 10, 10, "CO2"),
        att(1), P(1, "Lab Task", 30, 30),
        ...crit(1, "Assignment & Viva", ["Determination of Approach and Data Structure", "Solution"], 10, 20, "CO3"),
        ...crit(1, "Lab Exam", ["Problem Analysis and Use of Data Structure", "Solution"], 10, 10, "CO4")],
    },
    theory: {
      label: "Standard Theory Course", termWeights: [40, 60], cos: [],
      plan: [0, 1].flatMap((t) => [att(t, "Attendance"), P(t, `Quiz ${t * 2 + 1}`, 20, 20, { grp: "Quiz (Best of 2)", rule: "best" }), P(t, `Quiz ${t * 2 + 2}`, 20, 20, { grp: "Quiz (Best of 2)", rule: "best" }),
        P(t, "Assignment", 20, 20), P(t, "Term Exam", 100, 50)]),
    },
    lab: {
      label: "Standard Lab Course", termWeights: [40, 60], cos: [],
      plan: [0, 1].flatMap((t) => [att(t), P(t, "Lab Tasks", 30, 30), P(t, "Lab Report", 20, 20), P(t, "Lab Exam", 40, 40)]),
    },
  };

  // ------------------------------------------------------------------ portfolio view
  const pctCls = (p, min) => App.pctClass(p, min);
  function chip(status, held) { const k = status === "late" ? "L" : status === "excused" ? "E" : status ? "P" : held ? "A" : "N"; return `<span class="mk ${k}">${k === "N" ? "" : k}</span>`; }

  /**
   * data: { course, section, student, terms, assessments, marks{aid:score}, averages{aid:avg}, classes[], group }
   * opts: { faculty: bool }
   */
  function render(data, opts = {}) {
    const sec = data.section, course = data.course, minAtt = sec.min_attendance_pct ?? 80;
    const attBy = {}; data.classes.forEach((c) => { const a = (attBy[c.term_id] ||= { held: 0, attended: 0 }); if (c.held) { a.held++; if (c.status) a.attended++; } });
    const R = student({ terms: data.terms, assessments: data.assessments, scale: sec.grade_scale, round: sec.round_total, coTarget: course.co_target, cos: course.cos, specialGrade: data.student.special_grade },
      (aid) => data.marks[aid], (tid) => attBy[tid]);
    const fin = R.complete || !!R.grade?.special, G = (fin ? R.grade : R.standingGrade) || {}, gClass = !G.grade ? "" : G.special ? "violet" : G.grade === "F" ? "red" : /^A/.test(G.grade) ? "green" : /^B/.test(G.grade) ? "blue" : "amber";
    const anyMarks = data.assessments.length > 0;
    const head = `<div class="pf-hero">
        <div class="pf-ring" title="Grand total of all marks so far, out of 100">${App.ring(R.overall, 132, 12, "var(--primary)")}<div><b>${fmt(R.overall)}</b><span>${fin ? "out of 100" : "earned so far"}</span></div></div>
        <div class="pf-kpis">
          <div class="pf-kpi"><span class="k">${fin ? "Final Grade" : "Current Standing"}</span><span class="v"><span class="grade-pill ${gClass}">${esc(G.grade || "—")}</span>${fin || R.standing == null ? "" : ` <span style="font-size:16px;color:var(--muted);font-weight:650">${fmt(R.standing)}%</span>`}</span>
            <span class="s">${G.special ? "Special grade" : fin ? (G.point != null ? `Grade Point ${(+G.point).toFixed(2)}` : "") : R.standing == null ? "No marks released yet" : `On the ${fmt(R.coverage, 0)}% of the course marked so far`}</span></div>
          <div class="pf-kpi"><span class="k">Attendance</span><span class="v ${pctCls(R.attPct, minAtt)}">${R.attPct == null ? "—" : R.attPct + "%"}</span><span class="s">Minimum ${minAtt}%</span></div>
          <div class="pf-kpi"><span class="k">Course Outcomes</span><span class="v">${R.coList.length ? `${R.coAttained}<small> / ${R.coList.length}</small>` : "—"}</span><span class="s">Attained (target ${R.coTarget}%)</span></div>
          <div class="pf-kpi"><span class="k">Status</span><span class="v" style="font-size:16px">${R.complete ? `<span class="badge green">${icon("check")} All Marks In</span>` : `<span class="badge amber">${icon("clock")} In Progress</span>`}</span><span class="s">${R.complete ? "Final result" : "More marks to come"}</span></div>
        </div></div>
      ${R.attPct != null && R.attPct < minAtt ? `<div class="msg warn">${icon("alert")}<div>Your attendance is below the required ${minAtt}%. Please attend the remaining classes.</div></div>` : ""}`;

    const terms = R.terms.map((T) => {
      const rows = T.rows.map((row) => {
        const isAtt = row.kind === "attendance", avg = row.kids.length === 1 && !isAtt ? num(data.averages?.[row.kids[0].a.id]) : null;
        const avgSum = row.rule === "sum" && row.kids.length > 1 && row.kids.every((k) => data.averages?.[k.a.id] != null) ? row.kids.reduce((n, k) => n + +data.averages[k.a.id], 0) : null;
        const sAvg = avg ?? avgSum;
        const scoreTxt = row.pending ? `<span class="faint">${isAtt ? "No classes yet" : "Not released"}</span>` : row.score == null ? `<span class="faint">—</span>` : `<b>${fmt(row.score, 2)}</b><span class="faint"> / ${fmt(row.max, 2)}</span>`;
        const sub = row.group && row.kids.length > 1 ? `<div class="pf-sub">${row.kids.map((k) => `<div class="${k.best ? "best" : ""}"><span>${esc(k.a.name)}${k.a.co ? ` <span class="co-tag">${esc(k.a.co)}</span>` : ""}${k.best ? ` <span class="badge green" style="padding:0 7px">Counted</span>` : ""}</span>
            <span>${k.hidden ? `<span class="faint">Not released</span>` : k.score == null ? `<span class="faint">—</span>` : `${fmt(k.score, 2)}<span class="faint"> / ${fmt(k.a.max_marks, 2)}</span>`}</span></div>`).join("")}</div>` : "";
        return `<div class="pf-row ${row.group && row.kids.length > 1 ? "has-sub" : ""}">
          <div class="pf-name"><b>${esc(row.label)}</b>${row.co ? ` <span class="co-tag">${esc(row.co)}</span>` : ""}${row.rule === "best" ? ` <span class="faint xs">best counted</span>` : ""}${isAtt && T.att.held ? `<div class="xs faint">${T.att.attended} of ${T.att.held} class${T.att.held === 1 ? "" : "es"}</div>` : ""}</div>
          <div class="pf-score">${scoreTxt}</div>
          <div class="pf-contrib"><div class="progress ${row.ratio != null && row.ratio < 0.5 ? "bad" : row.ratio != null && row.ratio < 0.7 ? "warn" : ""}"><span style="width:${(row.ratio || 0) * 100}%"></span></div>
            <span><b>${row.pending ? "—" : fmt(row.contrib, 2)}</b><span class="faint"> / ${fmt(row.weight, 2)}</span></span></div>
          <div class="pf-avg">${sAvg != null ? `${fmt(sAvg, 1)}<span class="faint"> avg</span>` : ""}</div>${sub}</div>`;
      }).join("");
      const tg = T.grade || {};
      return `<div class="card pf-term"><div class="card-head"><div><h2>${esc(T.term.name)}</h2><div class="sub">${Math.round(T.weightShare * 100)}% of the course total${T.attPct != null ? ` · Attendance ${T.attPct}%` : ""}</div></div>
          <div class="pf-tt"><span class="faint small">Term Total</span><b>${T.empty ? "—" : fmt(T.total)}</b><span class="faint">/ 100</span>${T.empty ? "" : `<span class="grade-pill sm">${esc(tg.grade || "")}</span>`}</div></div>
        ${T.empty ? `<p class="muted">No assessments set for this term yet.</p>` : `<div class="pf-table"><div class="pf-row pf-hdr"><div>Assessment</div><div>Marks</div><div>Weighted</div><div>Section</div></div>${rows}</div>`}</div>`;
    }).join("");

    const cos = R.coList.length ? `<div class="card"><div class="card-head"><div><h2>Course Outcomes</h2><div class="sub">A CO is attained at ${R.coTarget}% or more of its marks</div></div></div>
      <div class="co-grid">${R.coList.map((c) => `<div class="co-card ${c.pct == null ? "" : c.attained ? "ok" : "no"}"><div class="row center-y" style="gap:10px"><span class="co-code">${esc(c.code)}</span>
          <span class="grow"></span>${c.pct == null ? `<span class="badge">Not assessed yet</span>` : c.attained ? `<span class="badge green">${icon("check")} Attained</span>` : `<span class="badge red">Not attained</span>`}</div>
        <p class="small" style="margin:10px 0 12px;color:var(--text-2)">${esc(c.statement) || `<span class="faint">—</span>`}</p>
        <div class="co-bar"><span style="width:${c.pct || 0}%"></span><i style="left:${R.coTarget}%"></i></div>
        <div class="row center-y xs muted" style="margin-top:6px;justify-content:space-between"><span>${c.pct == null ? "" : `${fmt(c.got, 2)} / ${fmt(c.max, 2)} marks`}</span><b class="${c.pct == null ? "" : c.attained ? "pct-good" : "pct-bad"}">${c.pct == null ? "" : c.pct + "%"}</b></div>
        ${c.po || c.level ? `<div class="xs faint" style="margin-top:4px">${esc([c.po, c.level].filter(Boolean).join(" · "))}</div>` : ""}</div>`).join("")}</div></div>` : "";

    const attn = `<div class="card"><div class="card-head"><div><h2>Attendance</h2><div class="sub">Each box is one class</div></div>
        <div class="legend"><span><span class="mk P">P</span>Present</span><span><span class="mk L">L</span>Late</span><span><span class="mk E">E</span>Excused</span><span><span class="mk A">A</span>Absent</span><span><span class="mk N"></span>Not Held</span></div></div>
      ${data.terms.map((t) => { const cl = data.classes.filter((c) => c.term_id === t.id), a = attBy[t.id] || { held: 0, attended: 0 }, p = a.held ? Math.round((a.attended / a.held) * 100) : null;
        return `<div class="pf-att"><div class="row center-y" style="justify-content:space-between;margin-bottom:10px"><b>${esc(t.name)}</b><span class="small muted">${a.attended} / ${a.held} · <b class="${pctCls(p, minAtt)}">${p == null ? "—" : p + "%"}</b></span></div>
          <div class="pf-chips">${cl.map((c) => `<div title="${App.classLabel(c.number)}${c.date ? " · " + App.fmtDay(c.date) : ""}">${chip(c.status, c.held)}<span>${App.pad2(c.number)}</span></div>`).join("") || `<span class="faint small">No classes yet</span>`}</div></div>`; }).join("")}</div>`;

    const grp = data.group ? `<div class="card"><div class="card-head"><div><h2>Project Group</h2><div class="sub">${esc(data.group.name)}${data.group.title ? " · " + esc(data.group.title) : ""}</div></div></div>
      <div class="pf-members">${(data.group.members || []).map((m) => `<span class="chip ${m === data.student.student_id ? "me" : ""}">${icon("user")} ${esc(m)}${m === data.student.student_id ? " (you)" : ""}</span>`).join("")}</div></div>` : "";

    const scale = [...(sec.grade_scale || AIUB_SCALE)].sort((a, b) => b.min - a.min);
    const gs = `<div class="card"><div class="card-head"><div><h2>Grading Scale</h2><div class="sub">${sec.round_total ? "Totals are rounded to the nearest whole number before grading" : "Totals are graded as they are"}</div></div></div>
      <div class="gs-grid">${scale.map((g, i) => `<div class="gs ${G.grade === g.grade ? "on" : ""}"><b>${esc(g.grade)}</b><span>${g.min}${i === 0 ? "–100" : `–${scale[i - 1].min - 1}`}</span><span class="faint">${(+g.point).toFixed(2)}</span></div>`).join("")}</div></div>`;

    return `<div class="pf">${head}
      ${anyMarks ? `<div class="stack">${terms}</div>` : `<div class="card"><div class="empty"><div class="ic">${icon("book")}</div><h3>No marks yet</h3><p>${opts.faculty ? "Set up the assessment plan in the Marks tab." : "Your instructor has not added any assessments yet."}</p></div></div>`}
      <div class="grid cols-2" style="align-items:start">${cos ? `<div class="stack">${cos}</div>` : ""}<div class="stack">${attn}${grp}${gs}</div></div></div>`;
  }

  window.Grade = { AIUB_SCALE, PRESETS, student, gradeFor, termRows, render, fmt, num, r2 };
})();
