/* Churn Tableau 圖解指南：示意畫面引擎 + 各章內容。資料來自 data.js（make_data.py 從 tableau/ 的 CSV 算出來）。 */
(function () {
  "use strict";

  // ================================================================
  // 資料
  // ================================================================
  const G = window.GUIDE_DATA, A = G.all, DEMO = G.demo;
  const FIELDS = {};
  Object.keys(G.fields).forEach(k => { FIELDS[k] = G.fields[k].map(f => [f[1], f[0]]); });  // [d|m, 欄位名稱]
  const PREVIEW = { churn_dashboard: G.preview, feature_importance: G.importance, data_quality: G.dq };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // 四捨五入到小數一位（0.4205 → 42.1%）；toFixed 會因為二進位誤差把 42.05 捨成 42.0
  const pct = v => (Math.round(v * 1000 + 1e-7) / 10).toFixed(1) + "%";
  const n0 = v => Math.round(v).toLocaleString("en-US");
  const f2 = v => (+v).toFixed(2);
  const usdM = v => "$" + (v / 1e6).toFixed(1) + "M";  // 貨幣（自訂）、小數 1 位、顯示單位百萬
  const cmp = (a, b) => String(a).localeCompare(String(b), "zh-Hant-TW");
  const alpha = arr => arr.slice().sort((a, b) => cmp(a.l, b.l));
  const desc = arr => arr.slice().sort((a, b) => b.v - a.v);
  const clone = o => JSON.parse(JSON.stringify(o));
  const FMT = { pct, n0, f2, usdM, raw: v => String(v) };
  const TICK = { pct: v => Math.round(v * 100) + "%", n0: v => (v >= 1000 ? (v / 1000) + "K" : String(v)), f2: v => String(+v.toFixed(2)), usdM: v => "$" + (+(v / 1e6).toFixed(1)) + "M", raw: v => String(v) };

  const DS_MAIN = "churn_dashboard";
  const DS_ORDER = [DS_MAIN, "feature_importance", "data_quality"];
  const FOLDER = ["churn_dashboard.csv", "data_quality.csv", "feature_importance.csv"];
  // 第 4 章把這幾個欄位的預設彙總改成平均值；其他數字欄維持總計
  const AVG_FIELDS = ["流失率", "預測流失機率", "平均使用月數", "平均月費"];
  const agg = f => (AVG_FIELDS.indexOf(f) >= 0 ? "AVG" : "SUM");

  // ---- 各圖的資料 ----
  const items = arr => arr.map(r => ({ l: r.l, v: r.v }));
  const kpi5 = k => [["客戶數", n0(k["客戶數"])], ["流失人數", n0(k["流失人數"])], ["流失率", pct(k["流失率"])], ["月營收", usdM(k["月營收"])], ["流失月營收", usdM(k["流失月營收"])]];
  const revItems = rev => rev.slice().sort((a, b) => cmp(a.l, b.l)).map(r => ({ l: r.l, parts: [r.churn, r.stay] }));
  // 資料情境：全體客戶，或在儀表板上點了某一組之後的那群客戶
  function ctxOf(src, selTenure) {
    return {
      kpi: kpi5(src.kpi),
      contract: desc(items(src.contract)), payment: desc(items(src.payment)), internet: desc(items(src.internet)),
      // 被點的那張圖本身不會被篩選：點到的那根保持原色，其他變淡
      tenure: A.tenure.map(r => ({ l: r.l, v: r.v, dim: !!selTenure && r.l !== selTenure })),
      rev: revItems(src.rev),
    };
  }
  const CTX = ctxOf(A), CTX_DEMO = ctxOf(DEMO, DEMO.group);
  const D = {};
  D.kpi = CTX.kpi;
  D.kpiAlpha = D.kpi.slice().sort((a, b) => cmp(a[0], b[0]));
  const RK = A.riskKpi;
  D.riskKpi = [["客戶數", n0(RK["客戶數"])], ["高風險人數", n0(RK["高風險人數"])], ["月營收", usdM(RK["月營收"])], ["預期流失月營收", usdM(RK["預期流失月營收"])]];
  D.riskKpiAlpha = D.riskKpi.slice().sort((a, b) => cmp(a[0], b[0]));
  D.contract = items(A.contract);
  D.payment = items(A.payment);
  D.tenure = items(A.tenure);
  D.internet = items(A.internet);
  D.addons = items(A.addons);
  D.revCats = A.rev.map(r => r.l).sort(cmp);
  D.rev = revItems(A.rev);
  D.revTotal = D.rev.map(r => ({ l: r.l, v: r.parts[0] + r.parts[1] }));
  D.heatI = A.heatI;
  D.heatT = A.heatT;
  D.binsSorted = A.hist.slice().sort((a, b) => a.k - b.k).map(h => h.l);
  D.binsAlpha = D.binsSorted.slice().sort(cmp);
  D.hist = order => order.map(l => { const h = A.hist.find(x => x.l === l); return { l, parts: [h.churn, h.stay] }; });
  D.histTotal = order => D.hist(order).map(r => ({ l: r.l, v: r.parts[0] + r.parts[1] }));
  D.seg = A.seg.map(r => ({ x: r.tenure, y: r.charge, s: r.n, cv: r.rate, l: r.l }));
  const segN = A.seg.reduce((a, r) => a + r.n, 0);
  D.segAll = { x: A.seg.reduce((a, r) => a + r.tenure * r.n, 0) / segN, y: A.seg.reduce((a, r) => a + r.charge * r.n, 0) / segN };
  D.calib = A.seg.map(r => ({ l: r.l, a: r.n, b: r.rate, p: r.pred })).sort((x, y) => y.b - x.b);
  D.tiers = A.tiers.slice().sort((a, b) => a.o - b.o).map(r => ({ l: r.l, a: r.n, b: r.rev }));
  D.listCols = ["客戶編號", "客群", "合約類型", "網路服務", "付款方式", "預測流失機率"];
  D.listRows = (rows, upto) => rows.map(r => r.slice(0, upto).map((x, i) => (i === 5 ? pct(x) : x)));
  D.listByProb = A.list;
  D.listById = A.list.slice().sort((a, b) => cmp(a[0], b[0]));
  D.deciles = A.deciles.map(r => ({ l: r.l, v: r.v, p: r.p }));
  D.imp = G.importance.map(r => ({ l: r[0], v: r[1] }));
  D.dq = G.dq.map(r => [r[0], r[1], r[2] == null ? "" : n0(r[2]), r[3] == null ? "" : pct(r[3]), r[4] == null ? "" : n0(r[4])]);

  // 儀表板上的文字只有兩處：風險名單一行說明名單怎麼選、資料檢核的指標定義。
  // 結論不寫進儀表板：數字寫死在文字裡，資料更新後會跟圖對不上
  const KR = A.kpi;
  const INS = {
    risk: ["還沒流失的現有客戶中，每種合約預測流失機率最高的 100 位。用右邊的篩選器切換合約和客群，點上面的風險分級也會篩選名單。"],
    dq: [
      "流失率 = 流失人數 ÷ 客戶數",
      `例：${n0(KR["流失人數"])} ÷ ${n0(KR["客戶數"])} = ${pct(KR["流失率"])}`,
      "預測流失機率：模型對每位客戶預測的流失機率（交叉驗證的樣本外機率）",
      "缺值比例 = 缺值數 ÷ 總筆數",
      "相異值個數：該欄位有幾種不同的值",
      "資料來源：Kaggle Playground Series S6E3（合成資料）",
    ],
  };

  // ================================================================
  // 圖示
  // ================================================================
  const svg = (w, h, body) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;
  const S = 'fill="none" stroke="currentColor"';
  const PLUS = `<circle cx="12.8" cy="12.8" r="3.4" style="fill:var(--chrome)" stroke="currentColor"/><path d="M12.8 11v3.6M11 12.8h3.6" ${S}/>`;
  const ICON = {
    db: svg(12, 12, `<ellipse cx="6" cy="3" rx="4.4" ry="1.8" ${S}/><path d="M1.6 3v6c0 1 2 1.8 4.4 1.8s4.4-.8 4.4-1.8V3" ${S}/>`),
    sheet: svg(12, 12, `<rect x="1" y="1.5" width="10" height="9" rx="1" ${S}/><path d="M1 4.5h10M4.3 4.5v6" ${S}/>`),
    dash: svg(12, 12, `<rect x="1" y="1" width="4.4" height="4.4" ${S}/><rect x="6.6" y="1" width="4.4" height="4.4" ${S}/><rect x="1" y="6.6" width="10" height="4.4" ${S}/>`),
    newSheet: svg(17, 17, `<rect x="1.5" y="2.5" width="10" height="9" rx="1" ${S}/><path d="M1.5 5.5h10M4.8 5.5v6" ${S}/>${PLUS}`),
    newDash: svg(17, 17, `<rect x="1.5" y="2.5" width="4.5" height="4" ${S}/><rect x="7" y="2.5" width="4.5" height="4" ${S}/><rect x="1.5" y="7.5" width="10" height="4" ${S}/>${PLUS}`),
    newStory: svg(17, 17, `<path d="M1.5 3.5h4l1 1h5v7h-10z" ${S}/>${PLUS}`),
    sortAsc: svg(14, 14, `<rect x="1" y="2" width="4" height="2" fill="currentColor"/><rect x="1" y="6" width="8" height="2" fill="currentColor"/><rect x="1" y="10" width="12" height="2" fill="currentColor"/>`),
    sortDesc: svg(14, 14, `<rect x="1" y="2" width="12" height="2" fill="currentColor"/><rect x="1" y="6" width="8" height="2" fill="currentColor"/><rect x="1" y="10" width="4" height="2" fill="currentColor"/>`),
    undo: svg(14, 14, `<path d="M4 5h5a3 3 0 0 1 0 6H6M4 5l2.5-2.5M4 5l2.5 2.5" ${S} stroke-linecap="round"/>`),
    save: svg(14, 14, `<path d="M2 2h8l2 2v8H2z M4.5 2v3h4V2 M4 12V8h6v4" ${S}/>`),
    newds: svg(14, 14, `<ellipse cx="6" cy="3.5" rx="4" ry="1.6" ${S}/><path d="M2 3.5v6c0 .9 1.8 1.6 4 1.6M10 3.5v3" ${S}/><path d="M11 9v4M9 11h4" ${S}/>`),
    swap: svg(14, 14, `<path d="M3 4h8l-2-2M11 10H3l2 2" ${S} stroke-linecap="round"/>`),
    labelT: svg(14, 14, `<rect x="1.5" y="6" width="7" height="6" ${S}/><path d="M9 3h4M11 3v5" ${S}/>`),
    cols: svg(11, 11, `<path d="M1 1.5v8M4 1.5v8M7 1.5v8M10 1.5v8" ${S}/>`),
    rows: svg(11, 11, `<path d="M1 1.5h9M1 4.5h9M1 7.5h9M1 10h9" ${S}/>`),
    color: svg(14, 12, `<circle cx="3" cy="6" r="2.2" fill="currentColor"/><circle cx="7" cy="6" r="2.2" ${S}/><circle cx="11" cy="6" r="2.2" fill="currentColor" opacity=".5"/>`),
    size: svg(14, 12, `<circle cx="3" cy="7" r="1.5" fill="currentColor"/><circle cx="9" cy="6" r="3.6" ${S}/>`),
    text: svg(14, 12, `<path d="M3 2.5h8M7 2.5v7.5" ${S} stroke-width="1.4"/>`),
    label: svg(14, 12, `<rect x="1.5" y="3" width="11" height="6" rx="1" ${S}/><path d="M4 6h6" ${S}/>`),
    detail: svg(14, 12, `<circle cx="3" cy="6" r="1.1" fill="currentColor"/><circle cx="7" cy="6" r="1.1" fill="currentColor"/><circle cx="11" cy="6" r="1.1" fill="currentColor"/>`),
    tip: svg(14, 12, `<path d="M1.5 1.5h11v6.5h-6l-2.5 2.5V8h-2.5z" ${S}/>`),
  };
  const MICON = { text: ICON.text, label: ICON.label, color: ICON.color, size: ICON.size, detail: ICON.detail, tooltip: ICON.tip };

  // ================================================================
  // 圖表（預覽和示意畫面共用）
  // ================================================================
  function niceMax(max) {
    if (!(max > 0)) return { max: 1, ticks: [0, 1] };
    const raw = max / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
    const top = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let t = 0; t <= top + step / 2; t += step) ticks.push(+t.toFixed(10));
    return { max: top, ticks };
  }
  const cls = o => "ch" + (o && o.cpt ? " cpt" : "");
  const C = {};
  function axisHTML(nm, o) {
    const tf = TICK[o.fmt || "pct"];
    return `<div class="axis${o.axisGone ? " gone" : ""}" data-k="axis"><span></span><div class="sc">${nm.ticks.map(t => `<span style="left:${(t / nm.max * 100).toFixed(1)}%">${tf(t)}</span>`).join("")}</div>${o.axisTitle ? `<div class="at">${esc(o.axisTitle)}</div>` : ""}</div>`;
  }
  // 列架上維度的欄位標籤：Tableau 預設顯示在列標頭的左上方
  // axisGone / flabelGone：正在拿掉的那一步，淡淡畫出來讓標示找得到，下一步才真的消失
  const flabelHTML = o => (o.flabel ? `<div class="hb-row hb-flrow"><span class="hb-fl${o.flabelGone ? " gone" : ""}" data-k="flabel">${esc(o.flabel)}</span><span></span></div>` : "");
  C.hbar = function (items, o) {
    o = o || {};
    const fmt = FMT[o.fmt || "pct"], nm = niceMax(Math.max.apply(null, items.map(i => i.v)));
    let h = `<div class="${cls(o)} hb"${o.lw ? ` style="--lw:${o.lw}px"` : ""}>` + flabelHTML(o);
    items.forEach(i => {
      const w = (i.v / nm.max * 100).toFixed(1), dim = i.dim ? ' class="dim"' : "";
      h += `<div class="hb-row"><span class="hb-l" title="${esc(i.l)}">${esc(i.l)}</span><div class="hb-t"><i${dim} style="width:${w}%;background:var(${i.c || "--c1"})"></i>${o.labels ? `<small${dim} style="left:${w}%">${fmt(i.v)}</small>` : ""}</div></div>`;
    });
    if (o.axis) h += axisHTML(nm, o);
    return h + "</div>";
  };
  C.rowsAbc = function (labels, o) {
    o = o || {};
    return `<div class="${cls(o)} hb"${o.lw ? ` style="--lw:${o.lw}px"` : ""}>` + flabelHTML(o) + labels.map(l => `<div class="hb-row"><span class="hb-l">${esc(l)}</span><div class="hb-t"><span class="abc">Abc</span></div></div>`).join("") + "</div>";
  };
  C.vbar = function (items, o) {
    o = o || {};
    const fmt = FMT[o.fmt || "pct"], nm = niceMax(Math.max.apply(null, items.map(i => i.v)));
    let h = `<div class="${cls(o)} vb"><div class="vb-plot"${o.h ? ` style="height:${o.h}px"` : ""}>`;
    items.forEach(i => {
      h += `<div class="vb-col">${o.labels ? `<small>${fmt(i.v)}</small>` : ""}<i style="height:${(i.v / nm.max * 88).toFixed(1)}%;background:var(${i.c || "--c1"})${i.dim ? ";opacity:.25" : ""}"></i></div>`;
    });
    return h + `</div><div class="vb-x">${items.map(i => `<span title="${esc(i.l)}">${esc(i.l)}</span>`).join("")}</div></div>`;
  };
  C.stackH = function (items, segs, o) {
    o = o || {};
    const fmt = FMT[o.fmt || "f2"];
    const nm = niceMax(Math.max.apply(null, items.map(i => i.parts.reduce((a, b) => a + b, 0))));
    let h = `<div class="${cls(o)} hb${o.segName ? " tall" : ""}"${o.lw ? ` style="--lw:${o.lw}px"` : ""}>` + flabelHTML(o);
    items.forEach(i => {
      let left = 0, segHTML = "";
      i.parts.forEach((v, k) => {
        const w = v / nm.max * 100;
        segHTML += `<i class="seg" style="left:${left.toFixed(1)}%;width:${w.toFixed(1)}%;background:var(${segs[k].c})"></i>`;
        // segName：「狀態」也放在標籤上，每段寫「流失／留存」和金額（Tableau 會分兩行）
        if (o.labels && w > 9) segHTML += `<small class="mid${o.segName ? " two" : ""}" style="left:${(left + w / 2).toFixed(1)}%">${o.segName ? esc(segs[k].n) + "<br>" : ""}${fmt(v)}</small>`;
        left += w;
      });
      h += `<div class="hb-row"><span class="hb-l">${esc(i.l)}</span><div class="hb-t">${segHTML}</div></div>`;
    });
    if (o.axis) h += axisHTML(nm, o);
    return h + "</div>";
  };
  C.stackV = function (items, segs, o) {
    o = o || {};
    const nm = niceMax(Math.max.apply(null, items.map(i => i.parts.reduce((a, b) => a + b, 0))));
    let h = `<div class="${cls(o)} vb"><div class="vb-plot"${o.h ? ` style="height:${o.h}px"` : ""}>`;
    items.forEach(i => {
      const tot = i.parts.reduce((a, b) => a + b, 0);
      h += `<div class="vb-col"><span class="stk" style="height:${(tot / nm.max * 92).toFixed(1)}%">${i.parts.map((v, k) => `<i style="height:${(v / tot * 100).toFixed(1)}%;background:var(${segs[k].c})"></i>`).join("")}</span></div>`;
    });
    return h + `</div><div class="vb-x">${items.map(i => `<span title="${esc(i.l)}">${esc(i.l.replace("$", ""))}</span>`).join("")}</div></div>`;
  };
  C.heat = function (rl, cl, M, o) {
    o = o || {};
    const vals = [].concat.apply([], M), lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    let h = `<div class="${cls(o)}"><div class="heat" style="grid-template-columns:${o.rw || 108}px repeat(${cl.length},minmax(0,1fr))"><span></span>${cl.map(c => `<span class="hh">${esc(c)}</span>`).join("")}`;
    rl.forEach((r, i) => {
      h += `<span class="hr">${esc(r)}</span>`;
      cl.forEach((c, j) => {
        const v = M[i][j], p = hi > lo ? (v - lo) / (hi - lo) : 0, mix = Math.round(10 + 90 * Math.sqrt(p));
        if (o.mode === "abc") h += `<span class="hc abc">Abc</span>`;
        else if (o.mode === "text") h += `<span class="hc abc" style="color:color-mix(in srgb, var(--c1) ${mix}%, var(--line))">Abc</span>`;
        else h += `<span class="hc" style="background:color-mix(in srgb, var(--c1) ${mix}%, var(--surface));${mix > 58 ? "color:var(--on-c)" : ""}">${o.labels ? pct(v) : ""}</span>`;
      });
    });
    return h + "</div></div>";
  };
  C.kpi = function (items, o) {
    o = o || {};
    return `<div class="${cls(o)}"><div class="kpi${o.big ? " big" : ""}">${items.map(i => `<div><span>${esc(i[0])}</span>${i[1] == null ? '<b class="abc">Abc</b>' : `<b>${esc(i[1])}</b>`}</div>`).join("")}</div></div>`;
  };
  C.table = function (hd, rows, o) {
    o = o || {};
    const isN = i => (o.num || []).indexOf(i) >= 0;
    let h = `<div class="${cls(o)}"><table class="ctable"><thead><tr>${hd.map((x, i) => `<th class="${isN(i) ? "n" : ""}">${esc(x)}</th>`).join("")}</tr></thead><tbody>`;
    rows.forEach(r => { h += `<tr>${r.map((x, i) => `<td class="${isN(i) ? "n" : ""}">${esc(x)}</td>`).join("")}</tr>`; });
    if (o.more) h += `<tr class="more"><td colspan="${hd.length}">${esc(o.more)}</td></tr>`;
    return h + "</tbody></table></div>";
  };
  C.nested = function (groups, o) {
    o = o || {};
    const nm = niceMax(Math.max.apply(null, [].concat.apply([], groups.map(g => g.cats.map(c => c.v)))));
    const shown = o.max ? groups.slice(0, o.max) : groups;
    let h = `<div class="${cls(o)} nest" style="--lw:${o.lw || 120}px;--fw:${o.fw || 90}px">`;
    shown.forEach(g => {
      h += `<div class="nest-g" style="--n:${g.cats.length || 1}"><div class="nest-f">${esc(g.f)}</div><div class="hb">`;
      if (!g.cats.length || o.factorsOnly) h += `<div class="hb-row"><span class="hb-l"></span><div class="hb-t"><span class="abc">Abc</span></div></div>`;
      else g.cats.forEach(c => {
        const w = (c.v / nm.max * 100).toFixed(1);
        h += `<div class="hb-row"><span class="hb-l">${esc(c.l)}</span><div class="hb-t">${o.bars === false ? '<span class="abc">Abc</span>' : `<i style="width:${w}%;background:var(${c.c || "--c1"})"></i>${o.labels ? `<small style="left:${w}%">${pct(c.v)}</small>` : ""}`}</div></div>`;
      });
      h += "</div></div>";
    });
    if (o.max && groups.length > o.max) h += `<div class="nest-more">…下面還有 ${groups.length - o.max} 個因子</div>`;
    return h + "</div>";
  };
  C.dual = function (items, A, B, o) {
    o = o || {};
    const ma = niceMax(Math.max.apply(null, items.map(i => i.a))).max;
    const mb = B ? niceMax(Math.max.apply(null, items.map(i => i.b))).max : 1;
    const bar = (v, m, X, c) => {
      const w = (v / m * 100).toFixed(1);
      return `<div class="hb-t"><i style="width:${w}%;background:var(${c || "--c1"})"></i>${o.labels ? `<small style="left:${w}%">${FMT[X.fmt](v)}</small>` : ""}</div>`;
    };
    let h = `<div class="${cls(o)}"><div class="dual" style="--lw:${o.lw || 110}px;grid-template-columns:var(--lw) minmax(0,1fr)${B ? " minmax(0,1fr)" : ""}"><span class="dh"></span><span class="dh">${esc(A.t)}</span>${B ? `<span class="dh">${esc(B.t)}</span>` : ""}`;
    items.forEach(i => { h += `<span class="dl">${esc(i.l)}</span>${bar(i.a, ma, A, i.c)}${B ? bar(i.b, mb, B, i.c) : ""}`; });
    return h + "</div></div>";
  };
  C.scatter = function (pts, o) {
    o = o || {};
    const W = 420, H = 250, L = 46, B = 34, R = 18, Tp = 12;
    const xm = niceMax(Math.max.apply(null, pts.map(p => p.x)) * 1.08), ym = niceMax(Math.max.apply(null, pts.map(p => p.y)) * 1.12);
    const X = v => L + v / xm.max * (W - L - R), Y = v => H - B - v / ym.max * (H - B - Tp);
    const smax = Math.max.apply(null, pts.map(p => p.s || 1));
    const cv = pts.map(p => p.cv || 0), cmin = Math.min.apply(null, cv), cmax = Math.max.apply(null, cv);
    let s = `<svg class="svgc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || "散佈圖")}">`;
    s += `<line class="ax" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/><line class="ax" x1="${L}" y1="${Tp}" x2="${L}" y2="${H - B}"/>`;
    xm.ticks.forEach(t => { s += `<text class="tk" x="${X(t).toFixed(1)}" y="${H - B + 13}" font-size="10" text-anchor="middle">${t}</text>`; });
    ym.ticks.forEach(t => { s += `<text class="tk" x="${L - 6}" y="${(Y(t) + 3).toFixed(1)}" font-size="10" text-anchor="end">${t}</text>`; });
    s += `<text class="tk" x="${(L + W - R) / 2}" y="${H - 3}" font-size="10.5" text-anchor="middle">${esc(o.xt || "")}</text>`;
    s += `<text class="tk" transform="translate(11 ${(Tp + H - B) / 2}) rotate(-90)" font-size="10.5" text-anchor="middle">${esc(o.yt || "")}</text>`;
    pts.forEach(p => {
      const r = o.mode === "bub" ? 9 + 25 * Math.sqrt((p.s || 1) / smax) : 5.5;
      const pc = cmax > cmin ? ((p.cv || 0) - cmin) / (cmax - cmin) : 0.5;
      const fill = o.color ? `color-mix(in srgb, var(--c1) ${Math.round(22 + 78 * pc)}%, var(--surface))` : (o.hollow ? "var(--surface)" : "var(--c1)");
      const cx = X(p.x), cy = Y(p.y);
      s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" style="fill:${fill};stroke:${o.hollow ? "var(--c1)" : "var(--surface)"}" stroke-width="1.5" fill-opacity="${o.mode === "bub" ? 0.88 : 1}"/>`;
      if (o.labels && p.l) {
        const right = cx < W * 0.66;
        s += `<text x="${(right ? cx + r + 4 : cx - r - 4).toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-size="11" text-anchor="${right ? "start" : "end"}">${esc(p.l)}</text>`;
      }
    });
    return `<div class="${cls(o)}">${s}</svg></div>`;
  };
  C.line = function (items, o) {
    o = o || {};
    const W = 420, H = 220, L = 40, B = 26, R = 12, Tp = 18, n = items.length;
    const nm = niceMax(Math.max.apply(null, items.map(i => i.v)));
    const X = i => L + (i + 0.5) * (W - L - R) / n, Y = v => H - B - v / nm.max * (H - B - Tp);
    let s = `<svg class="svgc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || "折線圖")}">`;
    s += `<line class="ax" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>`;
    nm.ticks.forEach(t => { s += `<text class="tk" x="${L - 6}" y="${(Y(t) + 3).toFixed(1)}" font-size="9.5" text-anchor="end">${TICK[o.fmt || "pct"](t)}</text><line class="ax" x1="${L}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke-dasharray="2 3" opacity=".6"/>`; });
    s += `<polyline points="${items.map((it, i) => X(i).toFixed(1) + "," + Y(it.v).toFixed(1)).join(" ")}" style="fill:none;stroke:var(--c1)" stroke-width="2.4" stroke-linejoin="round"/>`;
    items.forEach((it, i) => {
      s += `<circle cx="${X(i).toFixed(1)}" cy="${Y(it.v).toFixed(1)}" r="3" style="fill:var(--c1)"/>`;
      if (o.labels) s += `<text x="${X(i).toFixed(1)}" y="${(Y(it.v) - 7).toFixed(1)}" font-size="9" text-anchor="middle">${FMT[o.fmt || "pct"](it.v)}</text>`;
      s += `<text class="tk" x="${X(i).toFixed(1)}" y="${H - B + 13}" font-size="9" text-anchor="middle">${esc(it.l)}</text>`;
    });
    return `<div class="${cls(o)}">${s}</svg></div>`;
  };
  const LG = {
    cat: (t, items) => `<div class="lg"><span class="lg-t">${esc(t)}</span>${items.map(i => `<span class="sw"><i style="background:var(${i[1]})"></i>${esc(i[0])}</span>`).join("")}</div>`,
    cont: (t, lo, hi) => `<div class="lg"><span class="lg-t">${esc(t)}</span><div class="grad" style="background:linear-gradient(90deg, color-mix(in srgb, var(--c1) 10%, var(--surface)), var(--c1))"></div><div class="grad-x"><span>${esc(lo)}</span><span>${esc(hi)}</span></div></div>`,
  };
  const FC = (t, items, on) => `<div class="fcard"><span class="fc-t">${esc(t)}</span><label><i>${on ? "" : "✓"}</i>（全部）</label>${items.map(i => `<label><i>${!on || on === i ? "✓" : ""}</i>${esc(i)}</label>`).join("")}</div>`;

  function V(v) {
    let h = "";
    switch (v.k) {
      case "empty": h = '<div class="vempty"></div>'; break;
      case "hbar": h = C.hbar(v.items, v.o); break;
      case "rows": h = C.rowsAbc(v.labels, v.o); break;
      case "vbar": h = C.vbar(v.items, v.o); break;
      case "stackH": h = C.stackH(v.items, v.segs, v.o); break;
      case "stackV": h = C.stackV(v.items, v.segs, v.o); break;
      case "heat": h = C.heat(v.rl, v.cl, v.M, v.o); break;
      case "kpi": h = C.kpi(v.items, v.o); break;
      case "table": h = C.table(v.hd, v.rows, v.o); break;
      case "nested": h = C.nested(v.groups, v.o); break;
      case "dual": h = C.dual(v.items, v.A, v.B, v.o); break;
      case "scatter": h = C.scatter(v.pts, v.o); break;
      case "line": h = C.line(v.items, v.o); break;
      case "vbar2": h = C.vbar2(v.items, v.o); break;
      case "num": h = `<div class="vnum">${esc(v.v)}</div>`; break;
    }
    return h + (v.note ? `<div class="vnote">${esc(v.note)}</div>` : "");
  }


  // ================================================================
  // 19 張工作表的成品（儀表板預覽用）。c 是資料情境：全體，或點了某一組之後
  // ================================================================
  C.vbar2 = function (items, o) {
    o = o || {};
    const sub = (title, its) => `<span class="vb2-t">${esc(title)}</span>${C.vbar(its, Object.assign({}, o, { labels: true }))}`;
    return `<div class="${cls(o)} vb2">${sub("實際流失率", items.map(i => ({ l: i.l, v: i.v })))}${sub("平均預測機率", items.map(i => ({ l: i.l, v: i.p, c: "--c2" })))}</div>`;
  };
  const CHURN_SEGS = [{ n: "流失", c: "--c-churn" }, { n: "留存", c: "--c-stay" }];
  const cpt = o => Object.assign({ cpt: true }, o || {});
  const revLegend = '<div class="lg" style="flex-direction:row;gap:10px;font-size:9.5px"><span class="lg-t">狀態</span><span class="sw"><i style="background:var(--c-churn)"></i>流失</span><span class="sw"><i style="background:var(--c-stay)"></i>留存</span></div>';
  const PREV = {
    "KPI 橫幅": c => C.kpi(c.kpi, cpt({ big: true })),
    "各合約類型流失率": c => C.hbar(c.contract, cpt({ labels: true })),
    "各付款方式流失率": c => C.hbar(c.payment, cpt({ labels: true, lw: 112 })),
    "各使用月數流失率": c => C.hbar(c.tenure, cpt({ labels: true, lw: 76 })),
    "各網路服務流失率": c => C.hbar(c.internet, cpt({ labels: true, lw: 76 })),
    "各合約月營收": c => C.stackH(c.rev, CHURN_SEGS, cpt({ labels: true, segName: true, fmt: "usdM" })),
    "合約×網路服務": () => C.heat(D.heatI.rl, D.heatI.cl, D.heatI.M, cpt({ labels: true, rw: 84 })),
    "合約×使用月數": () => C.heat(D.heatT.rl, D.heatT.cl, D.heatT.M, cpt({ labels: true, rw: 84 })),
    "月費分布": () => revLegend + C.stackV(D.hist(D.binsSorted), CHURN_SEGS, cpt({ h: 70 })),
    "各加值服務數流失率": () => C.hbar(D.addons, cpt({ labels: true, lw: 40 })),
    "客群輪廓": () => C.scatter(D.seg, cpt({ mode: "bub", color: true, labels: true, xt: "平均使用月數", yt: "平均月費" })),
    "各客群人數與流失率": () => C.dual(D.calib, { t: "客戶數", fmt: "n0" }, { t: "流失率", fmt: "pct" }, cpt({ labels: true, lw: 84 })),
    "實際vs預測流失率": () => C.table(["客群", "客戶數", "流失率", "預測流失機率"], D.calib.map(r => [r.l, n0(r.a), pct(r.b), pct(r.p)]), cpt({ num: [1, 2, 3] })),
    "現有客戶 KPI": () => C.kpi(D.riskKpi, cpt({ big: true })),
    "現有客戶風險分級": () => C.dual(D.tiers, { t: "客戶數", fmt: "n0" }, { t: "月營收", fmt: "usdM" }, cpt({ labels: true, lw: 96 })),
    "高風險挽留名單": () => C.table(D.listCols, D.listRows(D.listByProb.slice(0, 7), 6), cpt({ num: [5], more: `共 ${D.listByProb.length} 位，用篩選器切換合約、客群` })),
    "十分位實際vs預測": () => C.vbar2(D.deciles, cpt({ h: 46 })),
    "特徵重要度": () => C.hbar(desc(D.imp), cpt({ labels: true, lw: 76 })),
    "資料品質檢核": () => C.table(["欄位名稱", "型態", "缺值數", "缺值比例", "相異值個數"], D.dq.slice(0, 9), cpt({ num: [2, 3, 4], more: `…共 ${D.dq.length} 列，最後一列是總筆數` })),
  };
  const SHEETS = Object.keys(PREV);

  // 6 個儀表板的版面（h = 預覽高度；link = 要開「用作篩選器」的工作表；nt = 在儀表板上隱藏標題）
  const DASHES = [
    { id: "overview", n: "總覽", size: "1200 × 900", h: 640,
      link: ["各合約類型流失率", "各付款方式流失率", "各使用月數流失率", "各網路服務流失率", "各合約月營收"],
      zones: { t: "v", c: [
        { t: "sheet", n: "KPI 橫幅", f: 0.6, nt: true },
        { t: "h", f: 2, k: "第二排", c: [{ t: "sheet", n: "各合約類型流失率" }, { t: "sheet", n: "各付款方式流失率" }, { t: "sheet", n: "各使用月數流失率" }] },
        { t: "h", f: 2, k: "第三排", c: [{ t: "sheet", n: "各網路服務流失率" }, { t: "sheet", n: "各合約月營收", f: 2 }] },
      ] } },
    { id: "drivers", n: "流失因子", size: "1200 × 900", h: 660,
      link: ["合約×網路服務", "合約×使用月數", "月費分布", "各加值服務數流失率"],
      zones: { t: "v", c: [
        { t: "sheet", n: "KPI 橫幅", f: 0.6, nt: true },
        { t: "h", f: 1.9, c: [{ t: "sheet", n: "合約×網路服務" }, { t: "sheet", n: "合約×使用月數" }] },
        { t: "h", f: 2, c: [{ t: "sheet", n: "月費分布", f: 1.5 }, { t: "sheet", n: "各加值服務數流失率" }] },
      ] } },
    { id: "seg", n: "客群", size: "1200 × 850", h: 620,
      link: ["客群輪廓", "各客群人數與流失率"],
      zones: { t: "v", c: [
        { t: "sheet", n: "KPI 橫幅", f: 0.6, nt: true },
        { t: "h", f: 3.6, c: [{ t: "sheet", n: "客群輪廓", f: 1.1 }, { t: "v", c: [{ t: "sheet", n: "各客群人數與流失率" }, { t: "sheet", n: "實際vs預測流失率", f: 0.8 }] }] },
      ] } },
    { id: "risk", n: "風險名單", size: "1200 × 1000", h: 760,
      link: ["現有客戶風險分級"],
      zones: { t: "v", c: [
        { t: "sheet", n: "現有客戶 KPI", f: 0.6, nt: true },
        { t: "sheet", n: "現有客戶風險分級", f: 1.1 },
        { t: "text", lines: INS.risk, f: 0.22 },
        { t: "h", f: 2.6, c: [{ t: "sheet", n: "高風險挽留名單", f: 2.6 }, { t: "filters", f: 0.6, cards: [{ t: "合約類型", items: D.revCats }, { t: "客群", items: D.calib.map(c => c.l).sort(cmp) }] }] },
      ] } },
    { id: "model", n: "模型驗證", size: "1200 × 800", h: 600,
      link: ["十分位實際vs預測"],
      zones: { t: "v", c: [
        { t: "sheet", n: "KPI 橫幅", f: 0.6, nt: true },
        { t: "h", f: 3, c: [{ t: "sheet", n: "十分位實際vs預測", f: 1.2 }, { t: "sheet", n: "特徵重要度" }] },
      ] } },
    { id: "dq", n: "資料檢核", size: "1200 × 800", h: 520, link: [],
      zones: { t: "h", c: [{ t: "sheet", n: "資料品質檢核", f: 2 }, { t: "text", lines: INS.dq, f: 1 }] } },
  ];
  const DASH_NAMES = DASHES.map(d => d.n);

  function zoneHTML(z, mini, root, ctx) {
    const flex = `flex:${z.f || 1} 1 0`;
    const style = root ? `style="${flex};height:${root}px"` : `style="${flex}"`;
    if (z.t === "v" || z.t === "h") return `<div class="z${z.t}" ${style}${z.k ? ` data-k="zone:${esc(z.k)}"` : ""}>${z.c.map(c => zoneHTML(c, mini, 0, ctx)).join("")}</div>`;
    if (z.t === "sheet") return `<div class="zleaf" ${style} data-k="zone:${esc(z.n)}">${z.nt && !mini ? "" : `<span class="zl-t${z.nt ? " nt" : ""}" data-k="ztitle:${esc(z.n)}">${esc(z.n)}${z.nt ? "<em>（標題已隱藏）</em>" : ""}</span>`}${mini ? "" : PREV[z.n](ctx || CTX)}</div>`;
    // Tableau 放進用了「色彩」的工作表時，自動在儀表板右邊加一欄圖例
    if (z.t === "legend") return `<div class="zleaf legend" ${style} data-k="zone:圖例">${LG.cat(z.title, z.items)}</div>`;
    if (z.t === "text") return `<div class="zleaf text" ${style} data-k="zone:文字"><ul>${(mini ? z.lines.slice(0, 2) : z.lines).map(l => `<li>${esc(l)}</li>`).join("")}${mini && z.lines.length > 2 ? "<li>…</li>" : ""}</ul></div>`;
    if (z.t === "empty") return `<div class="zleaf empty" ${style} data-k="zone:${esc(z.k || "空容器")}">${esc(z.label || "水平容器（還是空的）")}</div>`;
    if (z.t === "filters") return `<div class="zleaf filters" ${style} data-k="zone:篩選器">${z.cards.map(c => FC(c.t, c.items)).join("")}</div>`;
    return "";
  }

  // ================================================================
  // 示意畫面
  // ================================================================
  const menubar = () => `<div class="menubar">${["檔案", "資料", "工作表", "儀表板", "故事", "分析", "地圖", "格式", "伺服器", "視窗", "說明"].map(m => `<span data-k="menu:${m}">${m}</span>`).join("")}</div>`;
  function toolbar(s) {
    return `<div class="toolbar"><span class="tbb" title="撤銷">${ICON.undo}</span><span class="tbb" title="儲存">${ICON.save}</span><span class="tbb" title="新增資料來源">${ICON.newds}</span><span class="tb-sep"></span>` +
      `<span class="tbb" data-k="tb:swap" title="交換">${ICON.swap}</span><span class="tbb" data-k="tb:sortasc" title="昇冪排序">${ICON.sortAsc}</span><span class="tbb" data-k="tb:sortdesc" title="降冪排序">${ICON.sortDesc}</span><span class="tbb" data-k="tb:labels" title="顯示標記標籤">${ICON.labelT}</span>` +
      `<span class="fit" data-k="tb:fit">${esc(s.fit || "標準")} ▾</span><span class="showme" data-k="tb:showme">${ICON.dash}顯示</span></div>`;
  }
  function tabbarHTML(s) {
    const tabs = s.hideSheets ? s.tabs.filter(t => (s.dtabs || []).indexOf(t) >= 0) : s.tabs;
    const act = s.active == null ? tabs.length - 1 : (s.hideSheets ? tabs.indexOf(s.tabs[s.active]) : s.active);
    let idx = tabs.map((t, i) => i), gap = 0;
    if (tabs.length > 6) {
      const keep = new Set([tabs.length - 1, tabs.length - 2, tabs.length - 3, act]);
      idx = idx.filter(i => keep.has(i));
      gap = tabs.length - idx.length;
    }
    const dset = s.dtabs || [];
    let h = `<div class="tabbar"><div class="tab${act === -1 ? " on" : ""}" data-k="tab-ds">${ICON.db}<span>資料來源</span></div>`;
    if (gap) h += `<div class="tab gap">…前面還有 ${gap} 個分頁</div>`;
    idx.forEach(i => {
      const t = tabs[i], d = dset.indexOf(t) >= 0;
      h += `<div class="tab${i === act ? " on" : ""}${d ? " dashtab" : ""}" data-k="tab:${esc(t)}">${d ? ICON.dash : ICON.sheet}<span>${esc(t)}</span></div>`;
    });
    return h + `<div class="ticons"><span class="ticon" data-k="tab-new" title="新建工作表">${ICON.newSheet}</span><span class="ticon" data-k="tab-newdash" title="新建儀表板">${ICON.newDash}</span><span class="ticon" title="新建故事">${ICON.newStory}</span></div></div>`;
  }
  function dsListHTML(s) {
    const list = DS_ORDER.slice(0, s.dsCount || DS_ORDER.length);
    const i = Math.max(0, list.indexOf(s.ds));
    let to = Math.min(list.length, Math.max(i + 3, 5)), from = Math.max(0, to - 5);
    let h = from > 0 ? `<div class="ds more">⋮ 上面還有 ${from} 個</div>` : "";
    list.slice(from, to).forEach(d => { h += `<div class="ds${d === s.ds ? " on" : ""}" data-k="ds:${d}">${ICON.db}<span>${d}</span></div>`; });
    if (to < list.length) h += `<div class="ds more">⋮ 下面還有 ${list.length - to} 個</div>`;
    return h;
  }
  function sideHTML(x) {
    if (x.k === "cat") return `<div data-k="side:${esc(x.t)}">${LG.cat(x.t, x.items)}</div>`;
    if (x.k === "cont") return `<div data-k="side:${esc(x.t)}">${LG.cont(x.t, x.lo, x.hi)}</div>`;
    if (x.k === "fc") return `<div data-k="side:${esc(x.t)}">${FC(x.t, x.items, x.on)}</div>`;
    return "";
  }
  function sheetHTML(s) {
    const all = FIELDS[s.ds] || [], sel = s.sel || [];
    // 示意圖只畫這張圖用得到的欄位（s.show），其他收成一行
    const fl = s.show ? all.filter(f => s.show.indexOf(f[1]) >= 0) : all, more = all.length - fl.length;
    const dims = fl.filter(f => f[0] === "d"), meas = fl.filter(f => f[0] === "m");
    const field = f => `<div class="field${sel.indexOf(f[1]) >= 0 ? " sel" : ""}" data-k="field:${esc(f[1])}"><span class="ficon ${f[0]}">${f[0] === "d" ? "Abc" : "#"}</span><span>${esc(f[1])}</span></div>`;
    const pills = (arr, shelf) => (arr || []).map(p => `<span class="pill ${p[0]}" data-k="pill:${shelf}:${esc(p[1])}">${esc(p[1])}</span>`).join("");
    const mrow = m => `<div class="mrow" data-k="mpill:${esc(m.l)}">${MICON[m.p]}<span class="pill ${m.t}">${esc(m.l)}</span></div>`;
    const side = s.side && s.side.length;
    return menubar() + toolbar(s) + `<div class="main${side ? " side" : ""}">` + (s.wbfmt ? wbfmtHTML(s) :
      `<div class="datapane"><div class="pane-h">資料</div><div class="dslist">${dsListHTML(s)}</div><div class="tblname">${ICON.sheet}${esc(s.ds)}.csv</div>` +
      `<div class="fields" data-k="fields">${dims.map(field).join("")}${!s.show || s.show.indexOf("度量名稱") >= 0 ? `<div class="field" data-k="field:度量名稱"><span class="ficon d">Abc</span><span><i>度量名稱</i></span></div>` : ""}${dims.length && meas.length ? '<div class="fsep"></div>' : ""}${meas.map(field).join("")}${more ? `<div class="ds more">⋮ 另外還有 ${more} 個欄位</div>` : ""}</div></div>`) +
      `<div class="cards"><div class="card"><div class="card-h">頁面</div><div class="card-b"></div></div>` +
      `<div class="card"><div class="card-h">篩選條件</div><div class="card-b" data-k="shelf:filters">${pills(s.filters, "filters")}</div></div>` +
      `<div class="card"><div class="card-h">標記</div><div class="card-b"><div class="marktype" data-k="mark:type"><span>${esc(s.markType || "自動")}</span><span>▾</span></div>` +
      `<div class="mbtns"><div class="mbtn" data-k="mark:color">${ICON.color}色彩</div><div class="mbtn" data-k="mark:size">${ICON.size}大小</div>` +
      `<div class="mbtn" data-k="mark:slot">${s.slot === "標籤" ? ICON.label : ICON.text}${esc(s.slot || "文字")}</div><div class="mbtn" data-k="mark:detail">${ICON.detail}詳細資料</div><div class="mbtn" data-k="mark:tooltip">${ICON.tip}工具提示</div></div>` +
      `<div class="mpills">${(s.marks || []).map(mrow).join("")}</div></div></div>` +
      (s.mv ? `<div class="card" data-k="card:度量值"><div class="card-h">度量值</div><div class="card-b">${s.mv.map(l => `<span class="pill m">${esc(l)}</span>`).join("")}</div></div>` : "") +
      `</div><div class="canvas"><div class="shelf"><span class="shelf-l">${ICON.cols}欄</span><div class="shelf-a" data-k="shelf:cols">${pills(s.cols, "cols")}</div></div>` +
      `<div class="shelf"><span class="shelf-l">${ICON.rows}列</span><div class="shelf-a" data-k="shelf:rows">${pills(s.rows, "rows")}</div></div>` +
      `<div class="view"><div class="vtitle${s.wbTitle ? " wb" : ""}" data-k="title">${esc(s.title)}</div><div class="vbody" data-k="view">${V(s.view)}</div></div></div>` +
      (side ? `<div class="sidecol">${s.side.map(sideHTML).join("")}</div>` : "") + `</div>` + tabbarHTML(s);
  }
  // 只畫官方文件確認過的兩列（工作表標題、格線），其他列用灰色橫條代替
  function wbfmtHTML(s) {
    const row = (k, v) => `<div class="drow" data-k="fmt:${k}"><span>${k}</span><span class="sel">${v} ▾</span></div>`;
    return `<div class="datapane wbfmt" data-k="fmtpane"><div class="pane-h">設定工作簿格式<span class="x">✕</span></div>` +
      `<div class="fsec">字型</div><i class="ph"></i><i class="ph"></i>${row("工作表標題", s.wbTitle ? "12　<b>B</b>" : "Tableau Book")}<i class="ph"></i>` +
      `<div class="fsec">線條</div>${row("格線", s.wbGrid ? "無" : "——")}<i class="ph"></i><i class="ph"></i>` +
      `<div class="fsec"></div><span class="fbtn">重設為預設值</span></div>`;
  }
  function startHTML() {
    return menubar() + `<div class="scr scr-start"><div class="st-left"><div class="st-h">連線</div><div class="st-sub">到檔案</div><span class="st-i">Microsoft Excel</span><span class="st-i" data-k="start:文字檔">文字檔</span><i class="ph"></i><i class="ph"></i><i class="ph"></i><div class="st-sub">到伺服器</div><i class="ph"></i><i class="ph"></i></div>` +
      `<div class="st-main"><div class="st-h">開啟</div><div class="st-open">開啟工作簿</div></div></div>`;
  }
  function dsourceHTML(s) {
    const all = G.fields[s.ds], cols = all.slice(0, 9), rows = (PREVIEW[s.ds] || []).slice(0, 3);
    const cell = v => (v == null ? "" : String(v));
    return menubar() + `<div class="scr scr-ds"><div class="dsl"><div class="h">連線 <em>新增</em></div><div class="conn">${esc(s.ds)}<br><small>文字檔</small></div><div class="h" style="margin-top:8px">檔案</div>${FOLDER.slice(0, 10).map(f => `<div class="f">${esc(f)}</div>`).join("")}<div class="f">…</div></div>` +
      `<div class="dsr"><div class="dsr-top"><span class="ttl">${esc(s.ds)}</span><span class="lx">連線　● 即時　○ 擷取</span></div>` +
      `<div class="dcanvas" data-k="dsrc:canvas"><span class="dtable">${esc(s.ds)}.csv</span></div>` +
      `<div class="dgrid" data-k="dsrc:grid"><table><thead><tr>${cols.map(c => `<th><small class="${c[1]}">${c[1] === "d" ? "Abc" : "#"}</small>${esc(c[0])}</th>`).join("")}${all.length > cols.length ? `<th>…（共 ${all.length} 欄）</th>` : ""}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map((c, i) => `<td>${esc(cell(r[i]))}</td>`).join("")}${all.length > cols.length ? "<td></td>" : ""}</tr>`).join("")}</tbody></table></div></div></div>` +
      tabbarHTML(Object.assign({}, s, { active: -1 }));
  }
  function dashHTML(s) {
    const objs = ["水平", "垂直", "文字", "影像", "網頁", "空白", "巡覽", "下載", "擴展程式"];
    const list = s.sheetList || SHEETS.slice(0, 6);
    return menubar() + `<div class="scr scr-dash"><div class="dpane"><div class="tabs2"><span class="on">儀表板</span><span>配置</span></div>` +
      `<div class="sec">大小</div><div class="sizebox" data-k="dash:size">${esc(s.size || "預設大小")} ▾</div>` +
      `<div class="sec">工作表</div>${list.map(n => `<div class="sh" data-k="dsheet:${esc(n)}">${ICON.sheet}${esc(n)}</div>`).join("")}<div class="sh muted">…</div>` +
      `<div class="sec">物件</div><div class="objs">${objs.map(o => `<span data-k="obj:${o}">${o}</span>`).join("")}</div>` +
      `<div class="tiled"><span class="on">平鋪</span><span>浮動</span></div>` +
      `<div class="ckrow" data-k="dash:showtitle"><i>${s.showTitle ? "✓" : ""}</i>顯示儀表板標題</div></div>` +
      `<div class="dcan" data-k="dash:canvas"><div class="frame${s.zones ? "" : " emptyf"}">${s.showTitle ? `<div class="z-title" data-k="dash:title">${esc(s.title)}</div>` : ""}${s.zones ? zoneHTML(s.zones, !s.full, s.full ? 340 : 250, s.demo ? CTX_DEMO : CTX) : "把工作表拖到這裡"}</div></div></div>` +
      tabbarHTML(s);
  }
  function webHTML(s) {
    const d0 = DASHES[0];
    return `<div class="scr scr-web"><div class="addr"><span>public.tableau.com/app/profile/你的帳號/viz/CustomerChurnDashboard/總覽</span></div>` +
      `<div class="web"><div class="wt"><b>Customer Churn Dashboard</b><span class="btn small" data-k="web:edit">Edit Details</span></div>` +
      (s.tabsOn ? `<div class="wtabs" data-k="web:tabbar">${DASH_NAMES.map((d, i) => `<span class="${i === 0 ? "on" : ""}">${esc(d)}</span>`).join("")}</div>` : "") +
      `<div class="dprev" style="min-width:0;padding:8px;box-shadow:none"><div class="z-title">${esc(d0.n)}</div>${zoneHTML(d0.zones, true, 200)}</div>` +
      `<div class="wbar"><span class="btn small" data-k="web:share">Share</span></div></div></div>`;
  }
  function screenHTML(s) {
    if (s.screen === "start") return startHTML(s);
    if (s.screen === "dsource") return dsourceHTML(s);
    if (s.screen === "dash") return dashHTML(s);
    if (s.screen === "web") return webHTML(s);
    return sheetHTML(s);
  }

  // ---- 選單和對話框（只畫這一步會用到的選項，其他選項用灰色橫條代替） ----
  const mi = l => ({ l }), PH = { ph: 1 };
  function overlayHTML(ov) {
    if (ov.type === "menu") {
      return `<div class="ov ov-menu">${ov.items.map(it => it.ph ? '<i class="ph"></i>' : `<div class="mi" data-k="ov:${esc(it.l)}"><span>${it.ck ? "☑ " : ""}${esc(it.l)}</span>${it.sub ? '<span class="arr">▸</span>' : ""}</div>`).join("")}</div>`;
    }
    if (ov.type === "dialog") {
      return `<div class="ov ov-dialog"><div class="dt">${esc(ov.title)}</div><div class="db">${ov.body}</div><div class="df">${(ov.btns || ["確定", "取消"]).map((b, i) => `<span class="fbtn${i === 0 ? " pri" : ""}" data-k="dlg:${esc(b)}">${esc(b)}</span>`).join("")}</div></div>`;
    }
    if (ov.type === "file") {
      return `<div class="ov ov-dialog filedlg" style="margin:0"><div class="fd-t">開啟</div><div class="fd-path">本機 › 文件 › churn_tableau</div><div class="fd-list">${FOLDER.map(f => `<span class="${f === ov.sel ? "sel" : ""}" data-k="file:${esc(f)}">${esc(f)}</span>`).join("")}</div>` +
        `<div class="fd-b">檔案名稱 <span class="inp">${esc(ov.sel)}</span><span class="fbtn pri" data-k="file:開啟">開啟</span><span class="fbtn">取消</span></div></div>`;
    }
    if (ov.type === "showme") {
      const tiles = [];
      for (let i = 0; i < 24; i++) tiles.push(i === 0 ? `<span class="sm on" data-k="ov:文字表">文字表</span>` : '<span class="sm"></span>');
      return `<div class="ov ov-showme"><span class="smt">顯示</span>${tiles.join("")}</div>`;
    }
    return "";
  }
  const DLG = {
    numfmt: () => `<div class="dcols"><div class="dlist2">${["自動", "數位(標準)", "數字（自訂）", "貨幣(標準)", "貨幣（自訂）", "科學型", "百分比", "自訂"].map(x => `<span class="${x === "百分比" ? "on" : ""}" data-k="dl:${x}">${x}</span>`).join("")}</div><div><div class="drow" data-k="dl:小數"><span>小數</span><span class="sel">1 ▴▾</span></div></div></div>`,
    sort: o => `<div class="drow" data-k="dl:排序方式"><span>排序方式</span><span class="sel">${esc(o.by)} ▾</span></div>` +
      (o.manual ? `<div class="dlist2" data-k="dl:清單">${o.manual.map(x => `<span class="${x === o.pick ? "on" : ""}">${esc(x)}</span>`).join("")}</div><div class="drow" data-k="dl:箭頭"><span></span><span>▲ 上移　▼ 下移</span></div>`
        : `<div class="drow" data-k="dl:排序順序"><span>排序順序</span><span>${o.order === "遞增" ? "● 遞增　○ 遞減" : "○ 遞增　● 遞減"}</span></div><div class="drow" data-k="dl:欄位名稱"><span>欄位名稱</span><span class="sel">${esc(o.field)} ▾</span></div><div class="drow" data-k="dl:彙總"><span>彙總</span><span class="sel">${esc(o.agg)} ▾</span></div>`),
    filter: (items, keep) => `<div class="drow"><span><b>常規</b></span><span class="muted">萬用字元　條件　前</span></div><div class="dlist2" data-k="dl:清單">${items.map(x => `<span><i>${!keep || x === keep ? "✓" : ""}</i>${esc(x)}</span>`).join("")}</div><div class="drow" data-k="dl:全部"><span></span><span><span class="fbtn">全部</span>　<span class="fbtn">無</span></span></div>`,
    label: f => `<div class="drow" data-k="dl:字型"><span>字型</span><span class="sel">20　<b>B</b> ▾</span></div><div class="dlist2" data-k="dl:文字"><span class="on">&lt;${esc(f)}&gt;</span></div>`,
    colors: pickChurn => `<div class="dcols"><div><div class="muted" style="font-size:11px">選取資料項目</div><div class="dlist2" data-k="dl:項目"><span class="${pickChurn ? "on" : ""}"><i style="background:var(--c-churn);border:0"></i>流失</span><span><i style="background:var(--c-stay);border:0"></i>留存</span></div></div>` +
      `<div><div class="muted" style="font-size:11px">選取色板</div><div class="swatches" data-k="dl:色板">${["--c1", "--c2", "--c-churn", "--mea", "--dim", "--c-stay", "--muted", "--line", "--accent", "--soft"].map(c => `<i style="background:var(${c})"></i>`).join("")}</div></div></div>`,
    size: () => `<div class="drow" data-k="dl:大小"><span>大小</span><span class="sel">固定大小 ▾</span></div><div class="drow" data-k="dl:寬高"><span>寬 × 高</span><span><span class="ov-input">1200</span> × <span class="ov-input">900</span></span></div>`,
    saveas: () => `<div class="drow"><span>檔案名稱</span><span class="ov-input">churn_dashboard</span></div><div class="drow" data-k="dl:存檔類型"><span>存檔類型</span><span class="sel">Tableau 封裝工作簿 (*.twbx) ▾</span></div>`,
    login: () => `<div class="drow"><span>電子郵件</span><span class="ov-input">你的 email</span></div><div class="drow"><span>密碼</span><span class="ov-input">••••••••</span></div>`,
    wbname: () => `<div class="drow" data-k="dl:名稱"><span>名稱</span><span class="ov-input">Customer Churn Dashboard</span></div>`,
    details: on => `<div class="drow" data-k="dl:tabs"><span>Show Sheets as Tabs</span><span>${on ? "● 開" : "○ 關"}</span></div><div class="drow"><span>Description</span><span class="muted">（可留空）</span></div>`,
    share: () => `<div class="drow" data-k="dl:link"><span>Link</span><span class="ov-input">https://public.tableau.com/views/…</span></div><div class="drow"><span>Embed Code</span><span class="muted">（貼進網頁用，不需要）</span></div>`,
  };

  function findK(root, key) {
    const all = root.querySelectorAll("[data-k]");
    for (let i = all.length - 1; i >= 0; i--) if (all[i].dataset.k === key) return all[i];
    return null;
  }
  function placeOverlays(mock, list) {
    (list || []).forEach(ov => {
      const wrap = document.createElement("div");
      wrap.innerHTML = overlayHTML(ov);
      const el = wrap.firstElementChild;
      if (!el) return;
      mock.appendChild(el);
      const m = mock.getBoundingClientRect();
      let x = 40, y = 60;
      if (ov.pos === "center") {
        x = (m.width - el.offsetWidth) / 2; y = Math.max(34, Math.min(110, (m.height - el.offsetHeight) / 2));
      } else {
        const a = findK(mock, ov.at);
        if (a) {
          const r = a.getBoundingClientRect();
          if (ov.pos === "right") { x = r.right - m.left + 2; y = r.top - m.top - 4; }
          else if (ov.pos === "above") { x = r.left - m.left; y = r.top - m.top - el.offsetHeight - 4; }
          else { x = r.left - m.left; y = r.bottom - m.top + 2; }
        }
      }
      // 留在示意畫面裡面：太長的選單往上移，不要被畫面底部截掉
      x = Math.max(4, Math.min(x, m.width - el.offsetWidth - 4));
      y = Math.max(4, Math.min(y, m.height - el.offsetHeight - 4));
      el.style.left = x + "px"; el.style.top = y + "px";
    });
  }

  // ================================================================
  // 一步一步的示意畫面（stepper）
  // ================================================================
  const STORE_KEY = "churn-tableau-guide-v2";
  let store = { steps: {}, done: {}, checks: {} };
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) store = Object.assign(store, JSON.parse(raw)); } catch (e) { /* 私密視窗等情況，用預設值 */ }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* 存不了就算了 */ } };
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let activeStepper = null;

  function copyText(text, toast, fallback) {
    const fb = () => { fallback.value = text; fallback.hidden = false; fallback.focus(); fallback.select(); toast.textContent = "請按 Ctrl+C 複製上面這行"; };
    try { navigator.clipboard.writeText(text).then(() => { toast.textContent = "已複製"; }, fb); } catch (e) { fb(); }
  }

  function makeStepper(def, chapterNo) {
    let st = clone(def.base);
    def.steps.forEach((s, i) => {
      st = Object.assign({}, st, clone(s.set || {}));
      s.state = clone(st);
      s.n = i + 1;
      s.id = `${def.id} · 步驟 ${i + 1}`;
    });
    const el = document.createElement("div");
    el.className = "stepper";
    el.innerHTML = `<div class="sp-top"><span class="sp-name">${esc(def.id)}　${esc(def.name)}</span>${def.src ? `<span class="sp-src">資料來源：<code>${esc(def.src)}</code></span>` : ""}</div>` +
      `<div class="dots">${def.steps.map((s, i) => `<button type="button" class="dot" data-i="${i}" aria-label="${esc(s.id)}：${esc(s.short)}">${i + 1}</button>`).join("")}</div>` +
      `<div class="step-head"><span class="chip"></span><h4></h4></div>` +
      `<div class="mock-scroll"><div class="mock" role="img"></div></div>` +
      `<div class="panel"><div class="box do"><span>做什麼</span><p class="sdo"></p></div><div class="box"><span>做完會看到</span><p class="ssee"></p></div><p class="note" hidden></p></div>` +
      `<div class="nav"><button class="btn prev" type="button">← 上一步</button><button class="btn primary next" type="button">下一步 →</button><span class="spacer"></span>` +
      `<button class="btn replay" type="button" hidden>再播一次拖曳</button><button class="btn copy" type="button">複製步驟編號</button><span class="toast" aria-live="polite"></span></div>` +
      `<input class="copyfallback" hidden readonly aria-label="步驟編號文字">`;
    const q = c => el.querySelector(c);
    const mock = q(".mock");
    let cur = Math.min(def.steps.length - 1, store.steps[def.id] || 0);

    function fly(f) {
      if (reduce || !f) return;
      const a = findK(mock, f.from), b = findK(mock, f.to);
      if (!a || !b) { console.warn("guide: 拖曳動畫找不到起點或終點", f.from, f.to); return; }
      const arriving = f.reveal ? [findK(mock, f.reveal)].filter(Boolean) : [];
      arriving.forEach(x => x.classList.add("arriving"));
      mock.classList.add("pending");
      const g = document.createElement("span");
      g.className = `pill ${f.kind} ghost`;
      g.textContent = f.label;
      mock.appendChild(g);
      const m = mock.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const gw = g.offsetWidth, gh = g.offsetHeight;
      const x1 = ra.left - m.left + 10, y1 = ra.top - m.top + (ra.height - gh) / 2;
      const x2 = rb.left - m.left + (rb.width - gw) / 2, y2 = rb.top - m.top + (rb.height - gh) / 2;
      const done = () => { g.remove(); mock.classList.remove("pending"); arriving.forEach(x => x.classList.remove("arriving")); };
      if (!g.animate) { done(); return; }
      const an = g.animate([
        { transform: `translate(${x1}px,${y1}px)`, opacity: 0 },
        { transform: `translate(${x1}px,${y1}px)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${x2}px,${y2}px)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${x2}px,${y2}px)`, opacity: 0 },
      ], { duration: 1500, easing: "ease-in-out", delay: 250 });
      an.onfinish = done; an.oncancel = done;
    }
    function go(i, animate) {
      cur = Math.max(0, Math.min(def.steps.length - 1, i));
      store.steps[def.id] = cur; save();
      const s = def.steps[cur];
      mock.classList.remove("pending");
      mock.innerHTML = screenHTML(s.state);
      mock.setAttribute("aria-label", "示意畫面：" + s.short);
      placeOverlays(mock, s.ov);
      Object.keys(s.hl || {}).forEach(k => {
        const t = findK(mock, k);
        if (!t) { console.warn("guide: 找不到要標示的元素", s.id, k); return; }
        t.classList.add("hl");
        const b = document.createElement("i"); b.className = "badge"; b.textContent = s.hl[k];
        t.appendChild(b);
      });
      q(".chip").textContent = s.id;
      q("h4").textContent = s.short;
      q(".sdo").innerHTML = s.doo;
      q(".ssee").innerHTML = s.see || "";
      q(".note").hidden = !s.note;
      q(".note").innerHTML = s.note || "";
      q(".prev").disabled = cur === 0;
      q(".next").disabled = cur === def.steps.length - 1;
      q(".next").textContent = cur === def.steps.length - 1 ? "這張做完了" : "下一步 →";
      q(".replay").hidden = !s.fly || reduce;
      q(".toast").textContent = "";
      q(".copyfallback").hidden = true;
      el.querySelectorAll(".dot").forEach(d => {
        const j = +d.dataset.i;
        d.classList.toggle("cur", j === cur); d.classList.toggle("done", j < cur);
        if (j === cur) d.setAttribute("aria-current", "step"); else d.removeAttribute("aria-current");
      });
      if (animate !== false) fly(s.fly);
    }
    el.addEventListener("click", e => {
      activeStepper = api;
      const d = e.target.closest(".dot");
      if (d) go(+d.dataset.i);
      else if (e.target.closest(".prev")) go(cur - 1);
      else if (e.target.closest(".next")) go(cur + 1);
      else if (e.target.closest(".replay")) go(cur);
      else if (e.target.closest(".copy")) {
        const s = def.steps[cur];
        copyText(`我卡在 Tableau 指南 ${s.id}（${def.name}）：${s.short}`, q(".toast"), q(".copyfallback"));
      }
    });
    const api = { el, mount: () => go(cur, false), next: () => go(cur + 1), prev: () => go(cur - 1) };
    return api;
  }

  // ---- 步驟產生器 ----
  const TARGET = {
    cols: { key: "shelf:cols", short: "「欄」", long: "上方的 <b>欄</b> 架（第一條長框）", shelf: "cols" },
    rows: { key: "shelf:rows", short: "「列」", long: "上方的 <b>列</b> 架（第二條長框）", shelf: "rows" },
    color: { key: "mark:color", short: "「色彩」", long: "「標記」卡的 <b>色彩</b> 方塊" },
    size: { key: "mark:size", short: "「大小」", long: "「標記」卡的 <b>大小</b> 方塊" },
    text: { key: "mark:slot", short: "「文字」", long: "「標記」卡的 <b>文字</b> 方塊" },
    label: { key: "mark:slot", short: "「標籤」", long: "「標記」卡的 <b>標籤</b> 方塊" },
    tooltip: { key: "mark:tooltip", short: "「工具提示」", long: "「標記」卡的 <b>工具提示</b> 方塊" },
    filters: { key: "shelf:filters", short: "「篩選條件」", long: "「篩選條件」卡（「標記」卡上面那格）", shelf: "filters" },
  };
  const pillLabel = (field, kind, target) => (kind === "m" && target !== "filters" ? `${agg(field)}(${field})` : field);
  const NEWTAB_NOTE = "新分頁的名字可能是「工作表 5」之類，數字多少不重要，最後會改名。";
  DLG.numcustom = () => `<div class="dcols"><div class="dlist2">${["自動", "數位(標準)", "數字（自訂）", "貨幣(標準)", "貨幣（自訂）", "科學型", "百分比", "自訂"].map(x => `<span class="${x === "數字（自訂）" ? "on" : ""}" data-k="dl:${x}">${x}</span>`).join("")}</div>` +
    `<div><div class="drow" data-k="dl:小數位數"><span>小數位數</span><span class="sel">1 ▴▾</span></div><div class="drow" data-k="dl:單位"><span>單位</span><span class="sel">百萬 (M) ▾</span></div><div class="drow" data-k="dl:首碼"><span>首碼/尾碼</span><span><span class="ov-input">$</span>　<span class="ov-input">&nbsp;</span></span></div></div></div>`;
  const step = {
    newSheet: (ds, first) => {
      const main = ds === DS_MAIN;
      return {
        short: first ? "用「工作表 1」" : (main ? "新建工作表" : `新建工作表，點 ${ds}`),
        doo: first ? `第一張圖直接用底部現成的 <b>工作表 1</b> 分頁，確認左上「資料」窗格點的是 <b>${ds}</b>。`
          : `點分頁列右邊第一個小圖示 <b>新建工作表</b>。${main ? "確認左上「資料」窗格點的是 <b>churn_dashboard</b>（新工作表會沿用上一張的資料來源）。" : `再到左上「資料」窗格點 <b>${ds}</b>。`}`,
        see: `${first ? "" : "底部多一個空白分頁。"}左邊列出 ${ds}.csv 的欄位：藍色 <code>Abc</code> 是文字類別，綠色 <code>#</code> 是數字。示意圖只畫出這張圖用得到的欄位。`,
        note: first ? "" : NEWTAB_NOTE,
        hl: first ? { "tab:工作表 1": 1, ["ds:" + ds]: 2 } : { "tab-new": 1, ["ds:" + ds]: 2 },
      };
    },
    drag: (field, kind, target, set, see, note) => {
      const t = TARGET[target], lbl = pillLabel(field, kind, target);
      const reveal = t.shelf ? `pill:${t.shelf}:${lbl}` : `mpill:${lbl}`;
      return {
        short: `${field} 拖到${t.short}`, doo: `把欄位清單裡的 <b>${esc(field)}</b> 拖到${t.long}，放開。`, see, note, set,
        hl: { ["field:" + field]: 1, [t.key]: 2 }, fly: { from: "field:" + field, to: t.key, label: field, kind, reveal },
      };
    },
    labels: (see, set) => ({
      short: "顯示數字標籤", doo: "點「標記」卡的 <b>標籤</b> 方塊 → 在跳出的小視窗勾 <b>顯示標記標籤</b>。",
      see, set, hl: { "mark:slot": 1, "ov:顯示標記標籤": 2 }, ov: [{ type: "menu", at: "mark:slot", items: [Object.assign(mi("顯示標記標籤"), { ck: true }), PH, PH] }],
    }),
    fit: (mode, see, extra) => ({
      short: `檢視大小改成「${mode}」`, doo: `點工具列上寫著「標準」的 <b>適合</b> 下拉選單 → 選 <b>${mode}</b>。`,
      see: see || (mode === "整個檢視" ? "圖會撐滿整個檢視區，之後放進儀表板才不會被裁掉或出現捲軸。" : "表格寬度會配合畫面，欄位不會擠在左邊。"),
      set: Object.assign({ fit: mode }, extra || {}), hl: { "tb:fit": 1, ["ov:" + mode]: 2 }, ov: [{ type: "menu", at: "tb:fit", items: [mi("標準"), mi("適合寬度"), mi("適合高度"), mi("整個檢視")] }],
    }),
    // 長條上已經有數字標籤，軸和欄位標籤是多餘的（官方用語：顯示標頭、隱藏列的欄位標籤）
    hideAxis: (see, set) => ({
      short: "拿掉下面的軸", doo: "在圖下方的軸（寫著刻度數字的那一排）按 <b>右鍵</b> → 點有打勾的 <b>顯示標頭</b>，把勾拿掉。",
      see, set, note: "官方說明文件有的地方把這個選項寫成「顯示標題」，是同一個。要把軸叫回來：在「欄」架上的膠囊按右鍵 → 再勾一次。",
      hl: { axis: 1, "ov:顯示標頭": 2 }, ov: [{ type: "menu", at: "axis", pos: "above", items: [PH, PH, Object.assign(mi("顯示標頭"), { ck: true }), PH, PH] }],
    }),
    hideRowLabel: (field, see, set) => ({
      short: "拿掉左上角的欄位標籤", doo: `在長條左上方、寫著「${esc(field)}」的那一格按 <b>右鍵</b> → 點 <b>隱藏列的欄位標籤</b>。`,
      see, set, hl: { flabel: 1, "ov:隱藏列的欄位標籤": 2 }, ov: [{ type: "menu", at: "flabel", pos: "right", items: [PH, PH, mi("隱藏列的欄位標籤"), PH] }],
    }),
    sortDesc: (see, set) => ({ short: "由高到低排序", doo: "點工具列的 <b>降冪排序</b> 按鈕（長條由長到短的圖示）。", see, set, hl: { "tb:sortdesc": 1 } }),
    rename: (name, tabs, see) => ({
      short: `分頁改名「${name}」`, doo: `<b>雙擊</b>底部這張工作表的分頁，名字會變成可以打字的框。輸入 <b>${esc(name)}</b>，按 Enter。`,
      see: see || `分頁和圖上方的標題都變成「${esc(name)}」：標題本來就是顯示分頁名稱，不用另外改。`,
      set: { tabs, title: name }, hl: { ["tab:" + name]: 1, title: 2 },
    }),
    sortMenu: (shelf, pill) => ({
      short: `打開「${pill}」的排序`, doo: `在「${shelf === "rows" ? "列" : "欄"}」架上的 <b>${esc(pill)}</b> 膠囊按 <b>右鍵</b> → 點 <b>排序</b>。`,
      see: "跳出「排序」視窗。", hl: { [`pill:${shelf}:${pill}`]: 1, "ov:排序": 2 },
      ov: [{ type: "menu", at: `pill:${shelf}:${pill}`, items: [PH, PH, mi("排序"), PH, PH] }],
    }),
    sortDialog: (pill, o, set, see, note) => ({
      short: `依「${o.field}」排序`, doo: `排序方式選 <b>欄位</b>，排序順序選 <b>${o.order}</b>，欄位名稱選 <b>${esc(o.field)}</b>，彙總選 <b>${o.agg}</b>。設好後關掉視窗。`,
      see, note, set, hl: { "dl:排序方式": 1, "dl:排序順序": 2, "dl:欄位名稱": 3, "dl:彙總": 4 },
      ov: [{ type: "dialog", pos: "center", title: `排序 [${pill}]`, body: DLG.sort(Object.assign({ by: "欄位" }, o)), btns: ["關閉"] }],
    }),
    markType: (type, set, see) => ({
      short: `標記類型改成「${type}」`, doo: `點「標記」卡最上面寫著「自動」的下拉選單 → 選 <b>${type}</b>。`, see,
      set, hl: { "mark:type": 1, ["ov:" + type]: 2 },
      ov: [{ type: "menu", at: "mark:type", pos: "right", items: ["自動", "條形", "線", "區域", "方塊", "圓", "形狀", "文字", "地圖", "圓形圖", "甘特橫條圖", "多邊形", "密度"].map(mi) }],
    }),
    // 拖到「篩選條件」→ 視窗裡只留一個值（keep 空白 = 全部保留）
    filterTo: (field, values, keep, filters, see) => [
      step.drag(field, "d", "filters", { filters }, "放開後會跳出「篩選條件」視窗。"),
      {
        short: keep ? `只留「${keep}」` : "保留全部 → 確定",
        doo: keep ? `在「常規」分頁先按清單下方的 <b>無</b> 取消全部勾選，再只勾 <b>${esc(keep)}</b> → <b>確定</b>。` : "在「常規」分頁確認全部都有勾（沒有的話按清單下方的 <b>全部</b>）→ <b>確定</b>。",
        see, hl: { "dl:清單": 1, "dlg:確定": 2 },
        ov: [{ type: "dialog", pos: "center", title: `篩選條件 [${field}]`, body: DLG.filter(values, keep) }],
      },
    ],
    select: (names, see, note) => ({
      short: `按住 Ctrl 選 ${names.length} 個欄位`, doo: `在欄位清單按住 <b>Ctrl</b>，依序點 ${names.map(n => `<b>${esc(n)}</b>`).join("、")}。`,
      see: see || `${names.length} 個欄位都反白（選取中）。`, note, set: { sel: names }, hl: { fields: 1 },
    }),
    showMe: (set, see, note) => ({
      short: "用「顯示」做成文字表", doo: "點工具列最右邊的 <b>顯示</b> → 選 <b>文字表</b>（左上角第一個，像小表格的圖示）。",
      see, note, set: Object.assign({ sel: [] }, set), hl: { "tb:showme": 1, "ov:文字表": 2 }, ov: [{ type: "showme", at: "tb:showme", pos: "below" }],
    }),
  };
  // 底部分頁：前面已經做好的工作表
  const TABS = SHEETS.slice();
  const before = name => TABS.slice(0, TABS.indexOf(name));
  const withNew = name => before(name).concat([`工作表 ${before(name).length + 1}`]);
  const done = name => before(name).concat([name]);
  const base = (name, ds, show, extra) => Object.assign({
    screen: "sheet", ds, show, tabs: withNew(name), active: before(name).length, title: `工作表 ${before(name).length + 1}`,
    cols: [], rows: [], filters: [], marks: [], markType: "自動", slot: "文字", view: { k: "empty" }, fit: "標準", side: [],
  }, extra || {});
  const FIRST = { tabs: ["工作表 1"], title: "工作表 1", active: 0 };
  const AVG_NOTE = "膠囊要寫 <b>AVG(流失率)</b>。如果寫的是 SUM(流失率)、長條變成十幾萬，代表第 4 章「預設彙總改成平均值」還沒做。";
  const PCT_NOTE = "軸上顯示 0.1、0.2 而不是 10%、20% 的話，代表第 4 章的百分比格式還沒設。不影響後面，之後再回去設也可以。";
  const RETAIN = ["流失", "留存"];

  // ================================================================
  // 各張工作表的步驟
  // ================================================================
  const W = {};
  const mvOf = order => order.map(i => `${agg(i[0])}(${i[0]})`);
  const kpiView = (order, big) => ({ k: "kpi", items: order, o: big ? { big: true } : {} });
  // Show Me 做出來的欄名會帶彙總方式，例如「平均值 流失率」
  const rawName = order => order.map(i => [agg(i[0]) === "AVG" ? `平均值 ${i[0]}` : i[0], i[1]]);
  DLG.alias = names => `<div class="dcols"><div><div class="muted" style="font-size:11px">成員</div><div class="dlist2">${names.map(n => `<span>${esc(agg(n) === "AVG" ? "平均值 " + n : n)}</span>`).join("")}</div></div>` +
    `<div><div class="muted" style="font-size:11px">值（別名）</div><div class="dlist2" data-k="dl:別名">${names.map(n => `<span class="${agg(n) === "AVG" ? "on" : ""}">${esc(n)}</span>`).join("")}</div></div></div>`;
  // KPI 橫幅：選幾個數字欄 →「顯示」做成文字表 → 調順序 → 放大字
  function kpiSteps(names, items, alphaItems, filters, selectNote) {
    return [
      step.select(names, null, selectNote),
      step.showMe({ cols: [["d", "度量名稱"]], filters: filters.concat([["d", "度量名稱"]]), marks: [{ p: "text", t: "m", l: "度量值" }], mv: mvOf(alphaItems), view: kpiView(rawName(alphaItems)) },
        "所有 KPI 排成一排：上面是欄位名稱，下面是數字。順序可能和圖上不同，下一步調整。",
        "KPI 排成直的一排（「度量名稱」跑到「列」架）的話，按工具列的 <b>交換</b>。"),
      {
        short: "調整 KPI 的順序", doo: `在「標記」卡下面的 <b>度量值</b> 卡裡，把膠囊上下拖成這個順序：${names.map(esc).join(" → ")}。`,
        see: "上面的 KPI 跟著換成同樣的順序。", set: { mv: mvOf(items), view: kpiView(rawName(items)) }, hl: { "card:度量值": 1 },
      },
      {
        short: "欄名改回乾淨的名字", doo: "在欄位清單最下面、斜體的 <b>度量名稱</b> 上按右鍵 → <b>別名…</b> → 在「值（別名）」那欄把帶彙總字樣的名字改掉，例如「平均值 流失率」改成「流失率」、「月營收 的總和」改成「月營收」→ <b>確定</b>。",
        see: "上面的欄名變成乾淨的名字。", note: "Tableau 會在度量名稱前後加上彙總方式（平均值、的總和）。哪幾個會加不一定，畫面上看到哪個就改哪個；沒有的話這步跳過。",
        set: { view: kpiView(items) }, hl: { "field:度量名稱": 1, "dl:別名": 2 },
        ov: [{ type: "dialog", pos: "center", title: "編輯別名 [度量名稱]", body: DLG.alias(names) }],
      },
      {
        short: "把數字放大", doo: "點「標記」卡的 <b>文字</b> 方塊 → 點旁邊的 <b>…</b> 按鈕 → 在「編輯標籤」視窗把文字全選，字級改 <b>20</b>、按 <b>B</b> 粗體 → <b>確定</b>。",
        see: "數字變大、變粗，看起來像一排 KPI 卡。", set: { view: kpiView(items, true) },
        hl: { "mark:slot": 1, "dl:字型": 2 }, ov: [{ type: "dialog", pos: "center", title: "編輯標籤", body: DLG.label("度量值") }],
      },
      step.fit("整個檢視"),
    ];
  }
  const KPI_NAMES = D.kpi.map(i => i[0]);
  W.kpi = {
    id: "5-1", name: "KPI 橫幅", src: "churn_dashboard.csv", base: base("KPI 橫幅", DS_MAIN, ["合約類型", "使用月數分組", "度量名稱"].concat(KPI_NAMES), FIRST),
    steps: [step.newSheet(DS_MAIN, true)].concat(kpiSteps(KPI_NAMES, D.kpi, D.kpiAlpha, [],
      "這幾欄是 Python 先放好的輔助欄：<b>客戶數</b> 每列都是 1，加總就是人數；<b>流失率</b> 每列是 0 或 1，取平均就是流失率。數字是在 Tableau 裡彙總算的，所以之後在儀表板上點任何一張圖，這排 KPI 都會跟著變。"),
    [step.rename("KPI 橫幅", done("KPI 橫幅"))]),
  };
  const ax = (title, fmt) => ({ axis: true, axisTitle: title, fmt });
  // 5-2 的圖：拿掉軸和欄位標籤之前，左上角有「合約類型」、下面有流失率的軸
  const cv = o => Object.assign(ax("流失率"), { flabel: "合約類型" }, o);
  W.contract = {
    id: "5-2", name: "各合約類型流失率", src: "churn_dashboard.csv", base: base("各合約類型流失率", DS_MAIN, ["合約類型", "付款方式", "使用月數分組", "網路服務", "客戶數", "流失率"]),
    steps: [
      step.newSheet(DS_MAIN),
      step.drag("合約類型", "d", "rows", { rows: [["d", "合約類型"]], view: { k: "rows", labels: alpha(D.contract).map(i => i.l), o: { flabel: "合約類型" } } },
        "檢視區左邊出現三列：Month-to-month、One year、Two year。每列先顯示 Abc，因為還沒有數字。左上角那格「合約類型」是欄位標籤，最後會拿掉。"),
      step.drag("流失率", "m", "cols", { cols: [["m", "AVG(流失率)"]], slot: "標籤", view: { k: "hbar", items: alpha(D.contract), o: cv() } },
        "每一列變成一條橫向長條，越長代表流失率越高。「標記」卡的「文字」方塊變成「標籤」，因為現在畫的是長條圖。", AVG_NOTE),
      step.drag("客戶數", "m", "tooltip", { marks: [{ p: "tooltip", t: "m", l: "SUM(客戶數)" }] },
        "畫面看起來不會變。滑鼠移到長條上時，跳出的小框會多一行客戶數。"),
      step.labels(`長條尾端出現 ${D.contract.map(c => pct(c.v)).join("、")}。`, { view: { k: "hbar", items: alpha(D.contract), o: cv({ labels: true }) } }),
      step.sortDesc("最長的排到最上面。合約類型這張本來就剛好由高到低，看不出變化是正常的；付款方式那張就看得出來。",
        { view: { k: "hbar", items: desc(D.contract), o: cv({ labels: true }) } }),
      step.hideAxis("軸和軸下面的「流失率」都不見了。每條長條尾端已經寫了數字，軸只是多一排字。",
        { view: { k: "hbar", items: desc(D.contract), o: cv({ labels: true, axisGone: true }) } }),
      step.hideRowLabel("合約類型", "左上角的「合約類型」不見了，只剩三種合約的名字和長條。圖的標題已經說了這是合約類型。",
        { view: { k: "hbar", items: desc(D.contract), o: { labels: true, flabel: "合約類型", flabelGone: true } } }),
      step.fit("整個檢視", null, { view: { k: "hbar", items: desc(D.contract), o: { labels: true } } }),
      step.rename("各合約類型流失率", done("各合約類型流失率")),
    ],
  };
  const rv = o => Object.assign(ax("月營收", "usdM"), { flabel: "合約類型" }, o);
  W.revenue = {
    id: "5-6", name: "各合約月營收", src: "churn_dashboard.csv", base: base("各合約月營收", DS_MAIN, ["合約類型", "狀態", "月營收", "流失月營收"]),
    steps: [
      step.newSheet(DS_MAIN),
      step.drag("合約類型", "d", "rows", { rows: [["d", "合約類型"]], view: { k: "rows", labels: D.revCats, o: { flabel: "合約類型" } } }, "左邊出現三種合約。"),
      step.drag("月營收", "m", "cols", { cols: [["m", "SUM(月營收)"]], slot: "標籤", view: { k: "hbar", items: D.revTotal, o: rv() } },
        "每種合約一條長條，長度是這種合約全部客戶的月費加總。", "軸上是一長串數字而不是 $10M 的話，代表第 4 章的金額格式還沒設。"),
      step.drag("狀態", "d", "color", {
        marks: [{ p: "color", t: "d", l: "狀態" }], side: [{ k: "cat", t: "狀態", items: [["流失", "--c1"], ["留存", "--c2"]] }],
        view: { k: "stackH", items: D.rev, segs: [{ n: "流失", c: "--c1" }, { n: "留存", c: "--c2" }], o: rv() },
      }, "每條長條切成兩段：流失客戶的營收、留下來客戶的營收。右邊出現「狀態」的圖例。", "預設顏色是 Tableau 自動配的，下一步改成「流失＝紅、留存＝灰」，比較直覺。"),
      {
        short: "打開「編輯色彩」", doo: "滑鼠移到右邊「狀態」圖例上，點右上角出現的 <b>▼</b> → 點 <b>編輯色彩…</b>。", see: "跳出「編輯色彩」視窗。",
        hl: { "side:狀態": 1, "ov:編輯色彩…": 2 }, ov: [{ type: "menu", at: "side:狀態", pos: "above", items: [PH, mi("編輯色彩…"), PH] }],
      },
      {
        short: "流失改紅色、留存改灰色", doo: "左邊點 <b>流失</b>，右邊色板點一個紅色；再點 <b>留存</b>，右邊點一個灰色 → <b>確定</b>。",
        see: "流失那段變紅、留存變灰，一眼就看得出流失帶走多少營收。",
        set: { side: [{ k: "cat", t: "狀態", items: [["流失", "--c-churn"], ["留存", "--c-stay"]] }], view: { k: "stackH", items: D.rev, segs: CHURN_SEGS, o: rv() } },
        hl: { "dl:項目": 1, "dl:色板": 2 }, ov: [{ type: "dialog", pos: "center", title: "編輯色彩 [狀態]", body: DLG.colors(true) }],
      },
      step.labels(`每一段裡出現金額。Month-to-month 流失的月營收（${usdM(D.rev[0].parts[0])}）幾乎和留下來的（${usdM(D.rev[0].parts[1])}）一樣多。`,
        { view: { k: "stackH", items: D.rev, segs: CHURN_SEGS, o: rv({ labels: true }) } }),
      step.drag("狀態", "d", "label", {
        marks: [{ p: "color", t: "d", l: "狀態" }, { p: "label", t: "d", l: "狀態" }], view: { k: "stackH", items: D.rev, segs: CHURN_SEGS, o: rv({ labels: true, segName: true }) },
      }, "每一段多寫了「流失」或「留存」。圖自己就說明了顏色，放進儀表板後不需要圖例，可以省下右邊一整欄。",
      "金額不見了、只剩流失／留存的話，再把 <b>月營收</b> 也拖到「標籤」。太短的段（例如 Two year 的流失）放不下字，Tableau 會自動省略，是正常的。"),
      step.hideAxis("下面的金額軸不見了。每一段已經寫了金額。",
        { view: { k: "stackH", items: D.rev, segs: CHURN_SEGS, o: rv({ labels: true, segName: true, axisGone: true }) } }),
      step.hideRowLabel("合約類型", "左上角的「合約類型」不見了。",
        { view: { k: "stackH", items: D.rev, segs: CHURN_SEGS, o: { labels: true, segName: true, fmt: "usdM", flabel: "合約類型", flabelGone: true } } }),
      step.fit("整個檢視", null, { view: { k: "stackH", items: D.rev, segs: CHURN_SEGS, o: { labels: true, segName: true, fmt: "usdM" } } }),
      step.rename("各合約月營收", done("各合約月營收")),
    ],
  };
  const heatLegend = M => { const v = [].concat.apply([], M); return [{ k: "cont", t: "AVG(流失率)", lo: pct(Math.min.apply(null, v)), hi: pct(Math.max.apply(null, v)) }]; };
  W.heat = {
    id: "6-1", name: "合約×網路服務", src: "churn_dashboard.csv", base: base("合約×網路服務", DS_MAIN, ["合約類型", "網路服務", "使用月數分組", "客戶數", "流失率"]),
    steps: [
      step.newSheet(DS_MAIN),
      step.drag("合約類型", "d", "rows", { rows: [["d", "合約類型"]], view: { k: "rows", labels: D.heatI.rl } }, "左邊出現三種合約。"),
      step.drag("網路服務", "d", "cols", { cols: [["d", "網路服務"]], view: { k: "heat", rl: D.heatI.rl, cl: D.heatI.cl, M: D.heatI.M, o: { mode: "abc" } } },
        "變成 3 × 3 的表格，每格先顯示 Abc。"),
      step.drag("流失率", "m", "color", { marks: [{ p: "color", t: "m", l: "AVG(流失率)" }], side: heatLegend(D.heatI.M), view: { k: "heat", rl: D.heatI.rl, cl: D.heatI.cl, M: D.heatI.M, o: { mode: "text" } } },
        "Abc 依流失率高低變深淺，右邊出現顏色圖例。"),
      step.markType("方塊", { markType: "方塊", slot: "標籤", view: { k: "heat", rl: D.heatI.rl, cl: D.heatI.cl, M: D.heatI.M, o: {} } },
        "每一格塗滿顏色，變成熱圖：顏色越深，流失率越高。"),
      step.drag("流失率", "m", "label", { marks: [{ p: "color", t: "m", l: "AVG(流失率)" }, { p: "label", t: "m", l: "AVG(流失率)" }], view: { k: "heat", rl: D.heatI.rl, cl: D.heatI.cl, M: D.heatI.M, o: { labels: true } } },
        `每格寫上流失率。Month-to-month × Fiber optic 是 ${pct(D.heatI.M[D.heatI.rl.indexOf("Month-to-month")][D.heatI.cl.indexOf("Fiber optic")])}，最深。`,
        "同一個欄位可以同時放在「色彩」和「標籤」。"),
      step.fit("整個檢視"),
      step.rename("合約×網路服務", done("合約×網路服務")),
    ],
  };
  W.hist = {
    id: "6-3", name: "月費分布", src: "churn_dashboard.csv", base: base("月費分布", DS_MAIN, ["月費區間", "狀態", "客戶數", "區間排序"]),
    steps: [
      step.newSheet(DS_MAIN),
      step.drag("月費區間", "d", "cols", { cols: [["d", "月費區間"]], view: { k: "kpi", items: D.binsAlpha.map(b => [b.replace("$", ""), null]) } },
        "上方出現 11 個月費區間。注意順序是亂的：$100–110 排在 $20–30 前面，因為 Tableau 照文字排。"),
      step.drag("客戶數", "m", "rows", { rows: [["m", "SUM(客戶數)"]], slot: "標籤", view: { k: "vbar", items: D.histTotal(D.binsAlpha), o: { fmt: "n0", h: 150 } } },
        "每個區間一根直條，高度是客戶數。"),
      step.sortMenu("cols", "月費區間"),
      step.sortDialog("月費區間", { field: "區間排序", agg: "最小值", order: "遞增" }, { view: { k: "vbar", items: D.histTotal(D.binsSorted), o: { fmt: "n0", h: 150 } } },
        "區間照金額由小到大排：$10–20、$20–30 … $110–120。", "「區間排序」是每個區間的起點金額（10、20、30…），專門拿來排序用。"),
      step.drag("狀態", "d", "color", {
        marks: [{ p: "color", t: "d", l: "狀態" }], side: [{ k: "cat", t: "狀態", items: [["流失", "--c1"], ["留存", "--c2"]] }],
        view: { k: "stackV", items: D.hist(D.binsSorted), segs: [{ n: "流失", c: "--c1" }, { n: "留存", c: "--c2" }], o: { h: 150 } },
      }, "每根直條切成流失、留存兩段。"),
      {
        short: "顏色改成流失紅、留存灰", doo: "照 5-6 的第 5、6 步：右邊「狀態」圖例的 <b>▼</b> → <b>編輯色彩…</b> → 流失選紅色、留存選灰色 → <b>確定</b>。",
        see: "跟「各合約月營收」用同一套顏色。看得出流失集中在 $70–110 這幾個區間。",
        set: { side: [{ k: "cat", t: "狀態", items: [["流失", "--c-churn"], ["留存", "--c-stay"]] }], view: { k: "stackV", items: D.hist(D.binsSorted), segs: CHURN_SEGS, o: { h: 150 } } },
        hl: { "side:狀態": 1 },
      },
      step.fit("整個檢視"),
      step.rename("月費分布", done("月費分布")),
    ],
  };
  const scat = o => Object.assign({ xt: "平均使用月數", yt: "平均月費" }, o);
  W.bubble = {
    id: "7-1", name: "客群輪廓", src: "churn_dashboard.csv", base: base("客群輪廓", DS_MAIN, ["客群", "客戶數", "流失率", "平均使用月數", "平均月費"]),
    steps: [
      step.newSheet(DS_MAIN),
      step.drag("平均使用月數", "m", "cols", { cols: [["m", "AVG(平均使用月數)"]], slot: "標籤", view: { k: "hbar", items: [{ l: "", v: D.segAll.x }], o: { fmt: "f2", axis: true, lw: 10 } } },
        "出現一條橫的長條：全體客戶平均用了幾個月。先別管它，下一步就會變成點。", "膠囊要寫 AVG(平均使用月數)。寫 SUM 的話，代表第 4 章這個欄位的預設彙總還沒改。"),
      step.drag("平均月費", "m", "rows", { rows: [["m", "AVG(平均月費)"]], view: { k: "scatter", pts: [{ x: D.segAll.x, y: D.segAll.y }], o: scat({ hollow: true }) } },
        "變成一張只有<b>一個點</b>的散佈圖。", "只有一個點，是因為還沒告訴 Tableau 要分客群：這個點是全體客戶的平均。下一步就會拆開。"),
      step.drag("客群", "d", "label", { marks: [{ p: "label", t: "d", l: "客群" }], view: { k: "scatter", pts: D.seg, o: scat({ hollow: true, labels: true }) } },
        "一個點拆成 4 個點，旁邊寫著客群名稱。橫軸是平均用了幾個月，縱軸是平均月費。"),
      step.markType("圓", { markType: "圓", view: { k: "scatter", pts: D.seg, o: scat({ labels: true }) } }, "空心的點變成實心圓。"),
      step.drag("客戶數", "m", "size", { marks: [{ p: "label", t: "d", l: "客群" }, { p: "size", t: "m", l: "SUM(客戶數)" }], view: { k: "scatter", pts: D.seg, o: scat({ labels: true, mode: "bub" }) } },
        "圓的大小變成客戶數：人越多，圓越大。"),
      step.drag("流失率", "m", "color", {
        marks: [{ p: "label", t: "d", l: "客群" }, { p: "size", t: "m", l: "SUM(客戶數)" }, { p: "color", t: "m", l: "AVG(流失率)" }],
        side: [{ k: "cont", t: "AVG(流失率)", lo: pct(Math.min.apply(null, D.seg.map(p => p.cv))), hi: pct(Math.max.apply(null, D.seg.map(p => p.cv))) }],
        view: { k: "scatter", pts: D.seg, o: scat({ labels: true, mode: "bub", color: true }) },
      }, "圓的顏色變成流失率：越深越容易流失。高風險客在左上（用得短、月費高），顏色最深。"),
      { short: "（可選）把圓放大", doo: "點「標記」卡的 <b>大小</b> 方塊 → 把跳出的滑桿往右拉。", see: "所有圓一起變大，比較好看。跳過也沒關係。", hl: { "mark:size": 1 } },
      step.rename("客群輪廓", done("客群輪廓")),
    ],
  };
  const calibA = { t: "客戶數", fmt: "n0" }, calibB = { t: "流失率", fmt: "pct" };
  W.calib = {
    id: "7-2", name: "各客群人數與流失率", src: "churn_dashboard.csv", base: base("各客群人數與流失率", DS_MAIN, ["客群", "合約類型", "客戶數", "流失率"]),
    steps: [
      step.newSheet(DS_MAIN),
      step.drag("客群", "d", "rows", { rows: [["d", "客群"]], view: { k: "rows", labels: alpha(D.calib).map(i => i.l) } }, "左邊出現 4 個客群。"),
      step.drag("客戶數", "m", "cols", { cols: [["m", "SUM(客戶數)"]], slot: "標籤", view: { k: "dual", items: alpha(D.calib), A: calibA } }, "每個客群一條長條，長度是人數。"),
      step.drag("流失率", "m", "cols", { cols: [["m", "SUM(客戶數)"], ["m", "AVG(流失率)"]], view: { k: "dual", items: alpha(D.calib), A: calibA, B: calibB } },
        "右邊多一組長條：每個客群的流失率。左右共用同一排客群。", "要放在 <code>SUM(客戶數)</code> 膠囊的<b>右邊</b>，不要蓋在它上面（蓋上去會取代掉）。"),
      step.labels("每條長條尾端出現數字。", { view: { k: "dual", items: alpha(D.calib), A: calibA, B: calibB, o: { labels: true } } }),
      step.sortMenu("rows", "客群"),
      step.sortDialog("客群", { field: "流失率", agg: "平均值", order: "遞減" }, { view: { k: "dual", items: D.calib, A: calibA, B: calibB, o: { labels: true } } },
        `高風險客（流失率 ${pct(D.calib[0].b)}）排最上面，超穩定低風險客排最下面。`),
      step.fit("整個檢視"),
      step.rename("各客群人數與流失率", done("各客群人數與流失率")),
    ],
  };
  W.calibTable = {
    id: "7-3", name: "實際vs預測流失率", src: "churn_dashboard.csv", base: base("實際vs預測流失率", DS_MAIN, ["客群", "客戶數", "流失率", "預測流失機率"]),
    steps: [
      step.newSheet(DS_MAIN),
      step.select(["客群", "客戶數", "流失率", "預測流失機率"]),
      step.showMe({ rows: [["d", "客群"]], cols: [["d", "度量名稱"]], filters: [["d", "度量名稱"]], marks: [{ p: "text", t: "m", l: "度量值" }], mv: ["SUM(客戶數)", "AVG(流失率)", "AVG(預測流失機率)"],
        view: { k: "table", hd: ["客群", "客戶數", "流失率", "預測流失機率"], rows: D.calib.map(r => [r.l, n0(r.a), pct(r.b), pct(r.p)]), o: { num: [1, 2, 3] } } },
        "自動做好一張表：每個客群一列，右邊三欄數字。", "客群跑到上面變成橫的話，按工具列的 <b>交換</b>。"),
      {
        short: "確認欄的順序", doo: "看「標記」卡下面的 <b>度量值</b> 卡。順序不是 客戶數 → 流失率 → 預測流失機率 的話，把膠囊上下拖成這個順序。",
        see: `每個客群的實際流失率和模型的預測流失機率幾乎一樣，例如高風險客 ${pct(D.calib[0].b)} vs ${pct(D.calib[0].p)}，代表模型在客群層級很準。`,
        hl: { "card:度量值": 1 },
      },
      step.fit("適合寬度"),
      step.rename("實際vs預測流失率", done("實際vs預測流失率")),
    ],
  };
  const KEEP_RETAIN = "篩選後只剩還沒流失的現有客戶。";
  W.riskKpi = {
    id: "8-1", name: "現有客戶 KPI", src: "churn_dashboard.csv", base: base("現有客戶 KPI", DS_MAIN, ["狀態", "風險等級", "度量名稱"].concat(D.riskKpi.map(i => i[0]))),
    steps: [step.newSheet(DS_MAIN)]
      .concat(step.filterTo("狀態", RETAIN, "留存", [["d", "狀態"]], `${KEEP_RETAIN}畫面還是空的，下一步才放數字。`))
      .concat(kpiSteps(D.riskKpi.map(i => i[0]), D.riskKpi, D.riskKpiAlpha, [["d", "狀態"]],
        "這張已經篩成留存，所以「客戶數」是現有客戶數；<b>高風險人數</b> 每列是 0 或 1（預測機率 ≥ 50% 是 1），加總就是高風險的現有客戶數。"))
      .concat([step.rename("現有客戶 KPI", done("現有客戶 KPI"))]),
  };
  const listView = (rows, n, abcLast) => ({ k: "table", hd: D.listCols.slice(0, n).concat(abcLast ? [""] : []), rows: D.listRows(rows.slice(0, 7), n).map(r => abcLast ? r.concat(["Abc"]) : r), o: { num: n === 6 ? [5] : [], more: `…共 ${rows.length} 位客戶` } });
  const oneYear = D.listByProb.filter(r => r[2] === "One year");
  const segCats = D.calib.map(c => c.l).sort(cmp);
  W.list = {
    id: "8-3", name: "高風險挽留名單", src: "churn_dashboard.csv",
    base: base("高風險挽留名單", DS_MAIN, ["客戶編號", "客群", "合約類型", "網路服務", "付款方式", "狀態", "挽留名單", "預測流失機率", "使用月數", "月營收"]),
    steps: [step.newSheet(DS_MAIN)]
      .concat(step.filterTo("狀態", RETAIN, "留存", [["d", "狀態"]], KEEP_RETAIN))
      .concat(step.filterTo("挽留名單", ["否", "是"], "是", [["d", "狀態"], ["d", "挽留名單"]], "只剩 300 位：每種合約裡最可能流失的 100 位現有客戶。"))
      .concat([
        step.drag("客戶編號", "d", "rows", { rows: [["d", "客戶編號"]], view: listView(D.listById, 1, true) }, "左邊列出客戶編號（共 300 位），先照編號排。"),
        {
          short: "再拖 4 個欄位到「列」", doo: "依序把 <b>客群</b>、<b>合約類型</b>、<b>網路服務</b>、<b>付款方式</b> 拖到「列」架，每個都放在前一顆膠囊的<b>右邊</b>。",
          see: "表格多出 4 欄文字。", set: { rows: [["d", "客戶編號"], ["d", "客群"], ["d", "合約類型"], ["d", "網路服務"], ["d", "付款方式"]], view: listView(D.listById, 5, true) },
          hl: { "field:客群": 1, "shelf:rows": 2 }, fly: { from: "field:客群", to: "shelf:rows", label: "客群", kind: "d", reveal: "pill:rows:客群" },
        },
        step.drag("預測流失機率", "m", "text", { marks: [{ p: "text", t: "m", l: "AVG(預測流失機率)" }], view: listView(D.listById, 6) }, "最右邊一欄變成每位客戶的預測流失機率。"),
        step.sortMenu("rows", "客戶編號"),
        step.sortDialog("客戶編號", { field: "預測流失機率", agg: "平均值", order: "遞減" }, { view: listView(D.listByProb, 6) }, "最可能流失的客戶排到最上面。"),
      ])
      .concat(step.filterTo("合約類型", D.revCats, "", [["d", "狀態"], ["d", "挽留名單"], ["d", "合約類型"]], "表格不會變：先全部保留，等一下讓看的人自己切換。"))
      .concat([
        {
          short: "顯示篩選器", doo: "在「篩選條件」卡上的 <b>合約類型</b> 膠囊按右鍵 → 點 <b>顯示篩選條件</b>。",
          see: "右邊出現一張勾選清單：（全部）、Month-to-month、One year、Two year。", set: { side: [{ k: "fc", t: "合約類型", items: D.revCats }] },
          hl: { "pill:filters:合約類型": 1, "ov:顯示篩選條件": 2 }, ov: [{ type: "menu", at: "pill:filters:合約類型", pos: "right", items: [PH, mi("顯示篩選條件"), PH, PH] }],
        },
        {
          short: "客群也做一個篩選器", doo: "照前面三步，把 <b>客群</b> 也拖到「篩選條件」卡 → 保留全部 → 確定 → 右鍵 → 顯示篩選條件。",
          see: "右邊有兩張篩選器：合約類型、客群。",
          set: { filters: [["d", "狀態"], ["d", "挽留名單"], ["d", "合約類型"], ["d", "客群"]], side: [{ k: "fc", t: "合約類型", items: D.revCats }, { k: "fc", t: "客群", items: segCats }] },
          hl: { "field:客群": 1, "shelf:filters": 2 },
        },
        {
          short: "使用月數、月營收放進工具提示", doo: "把 <b>使用月數</b> 和 <b>月營收</b> 都拖到「標記」卡的 <b>工具提示</b>。",
          see: "滑鼠移到某位客戶上，小框會顯示他用了幾個月、月費多少。",
          set: { marks: [{ p: "text", t: "m", l: "AVG(預測流失機率)" }, { p: "tooltip", t: "m", l: "SUM(使用月數)" }, { p: "tooltip", t: "m", l: "SUM(月營收)" }] },
          hl: { "field:使用月數": 1, "mark:tooltip": 2 },
        },
        step.fit("適合寬度"),
        step.rename("高風險挽留名單", done("高風險挽留名單")),
        {
          short: "試用篩選器", doo: "在右邊「合約類型」篩選器只勾 <b>One year</b>。",
          see: "名單只剩一年約的客戶。他們的機率比月約低，而且大多是高價值客：簽了長約也可能要走。試完記得把（全部）勾回來。",
          set: { side: [{ k: "fc", t: "合約類型", items: D.revCats, on: "One year" }, { k: "fc", t: "客群", items: segCats }], view: listView(oneYear, 6) },
          hl: { "side:合約類型": 1 },
        },
      ]),
  };
  W.deciles = {
    id: "9-1", name: "十分位實際vs預測", src: "churn_dashboard.csv", base: base("十分位實際vs預測", DS_MAIN, ["風險十分位", "客戶數", "流失率", "預測流失機率"]),
    steps: [
      step.newSheet(DS_MAIN),
      step.drag("風險十分位", "d", "cols", { cols: [["d", "風險十分位"]], view: { k: "kpi", items: D.deciles.map(d => [d.l, null]) } },
        "上方出現第01組到第10組。第01組是模型認為最可能流失的 10% 客戶。"),
      step.drag("流失率", "m", "rows", { rows: [["m", "AVG(流失率)"]], slot: "標籤", view: { k: "vbar", items: D.deciles, o: { h: 140 } } },
        "每組一根直條，高度是這組實際流失的比例：由左到右一路下降，代表模型的排序排得對。"),
      step.drag("預測流失機率", "m", "rows", { rows: [["m", "AVG(流失率)"], ["m", "AVG(預測流失機率)"]], view: { k: "vbar2", items: D.deciles, o: { h: 70 } } },
        "下面多一排：每組的平均預測機率。上下兩排幾乎一樣高，代表模型給的機率可以直接讀成「流失的可能性」。", "放在 AVG(流失率) 膠囊的<b>右邊</b>，兩個度量會上下各畫一排。"),
      step.labels(`直條上方出現數字：第01組實際 ${pct(D.deciles[0].v)}、預測 ${pct(D.deciles[0].p)}。`, { view: { k: "vbar2", items: D.deciles, o: { h: 70 } } }),
      step.fit("整個檢視"),
      step.rename("十分位實際vs預測", done("十分位實際vs預測")),
    ],
  };
  W.dq = {
    id: "10-1", name: "資料品質檢核", src: "data_quality.csv", base: base("資料品質檢核", "data_quality"),
    steps: [
      step.newSheet("data_quality"),
      step.select(["欄位名稱", "型態", "缺值數", "缺值比例", "相異值個數"]),
      step.showMe({ rows: [["d", "欄位名稱"], ["d", "型態"]], cols: [["d", "度量名稱"]], filters: [["d", "度量名稱"]], marks: [{ p: "text", t: "m", l: "度量值" }], mv: ["SUM(缺值數)", "SUM(缺值比例)", "SUM(相異值個數)"],
        view: { k: "table", hd: ["欄位名稱", "型態", "缺值數", "缺值比例", "相異值個數"], rows: D.dq.slice().sort((a, b) => cmp(a[0], b[0])).slice(0, 8), o: { num: [2, 3, 4], more: `…共 ${D.dq.length} 列，「總筆數」不一定在最後` } } },
        "做好一張表：每個欄位一列。", "「列」架上要有 欄位名稱 和 型態，「欄」架上是 度量名稱。不對的話直接把膠囊拖到對的架子上。"),
      step.sortMenu("rows", "欄位名稱"),
      {
        short: "把「總筆數」移到最後", doo: "排序方式選 <b>手動方式排序</b> → 在清單點 <b>總筆數</b> → 一直按 <b>▼ 下移</b> 直到最底 → 關掉視窗。",
        see: "總筆數排到表格最後一列：「總筆數｜594,194 筆」，右邊三格空白是正常的。",
        set: { view: { k: "table", hd: ["欄位名稱", "型態", "缺值數", "缺值比例", "相異值個數"], rows: D.dq.slice(0, 4).concat([["⋮", "", "", "", ""]], D.dq.slice(-2)), o: { num: [2, 3, 4] } } },
        hl: { "dl:排序方式": 1, "dl:清單": 2, "dl:箭頭": 3 },
        ov: [{ type: "dialog", pos: "center", title: "排序 [欄位名稱]", body: DLG.sort({ by: "手動方式排序", manual: D.dq.slice(-6).map(r => r[0]), pick: "總筆數" }), btns: ["關閉"] }],
      },
      step.fit("適合寬度"),
      step.rename("資料品質檢核", done("資料品質檢核")),
    ],
  };

  // ---- 接資料、欄位設定、儀表板、發布 ----
  const SHOW_CONNECT = ["客戶編號", "合約類型", "使用月數分組", "客群", "客戶數", "流失率", "月營收"];
  const CONNECT1 = {
    id: "3-1", name: "接 churn_dashboard.csv", base: { screen: "start", ds: DS_MAIN, tabs: ["工作表 1"], active: 0, dsCount: 1, show: SHOW_CONNECT },
    steps: [
      { short: "點「文字檔」", doo: "打開 Tableau。在左邊「連線」區的「到檔案」底下，點 <b>文字檔</b>。", see: "跳出「開啟」檔案視窗。", hl: { "start:文字檔": 1 } },
      {
        short: "選 churn_dashboard.csv", doo: "切到 <b>文件 › churn_tableau</b>，點 <b>churn_dashboard.csv</b> → <b>開啟</b>。", see: "進入「資料來源」頁面。這個檔有 59 萬列，讀進來要幾秒。",
        hl: { "file:churn_dashboard.csv": 1, "file:開啟": 2 }, ov: [{ type: "file", sel: "churn_dashboard.csv", pos: "center" }],
      },
      {
        short: "檢查預覽", doo: "看下方的預覽表格，不用點任何東西。", set: { screen: "dsource" },
        see: "看得到 客戶編號、合約類型、付款方式…共 25 欄。中文正常、不是亂碼；文字欄上方是 <code>Abc</code>，數字欄是 <code>#</code>。",
        note: "中文變成亂碼的話，看第 13 章的問題 3。", hl: { "dsrc:grid": 1 },
      },
      {
        short: "進到工作表 1", doo: "點左下角的 <b>工作表 1</b> 分頁。", set: { screen: "sheet", title: "工作表 1", cols: [], rows: [], marks: [], view: { k: "empty" } },
        see: "進到工作表畫面。左上「資料」窗格出現 churn_dashboard，下面是它的欄位。", hl: { "tab:工作表 1": 1, "ds:churn_dashboard": 2 },
      },
    ],
  };
  const CONNECT2 = {
    id: "3-2", name: "接 feature_importance.csv", base: { screen: "sheet", ds: DS_MAIN, tabs: ["工作表 1"], active: 0, dsCount: 1, title: "工作表 1", view: { k: "empty" }, cols: [], rows: [], marks: [], show: SHOW_CONNECT },
    steps: [
      {
        short: "資料 → 新資料來源", doo: "點上方選單 <b>資料</b> → <b>新資料來源</b>。", see: "畫面左邊跳出「連線」清單。",
        hl: { "menu:資料": 1, "ov:新資料來源": 2 }, ov: [{ type: "menu", at: "menu:資料", items: [mi("新資料來源"), PH, PH, PH] }],
      },
      { short: "點「文字檔」", doo: "在「到檔案」底下點 <b>文字檔</b>。", see: "跳出「開啟」檔案視窗。", set: { screen: "start" }, hl: { "start:文字檔": 1 } },
      {
        short: "選 feature_importance.csv", doo: "點 <b>feature_importance.csv</b> → <b>開啟</b>。", see: "進入這個檔案的「資料來源」頁面。",
        hl: { "file:feature_importance.csv": 1, "file:開啟": 2 }, ov: [{ type: "file", sel: "feature_importance.csv", pos: "center" }],
      },
      {
        short: "回到工作表 1", doo: "點左下角的 <b>工作表 1</b> 分頁。", set: { screen: "sheet", ds: "feature_importance", dsCount: 2, show: null },
        see: "「資料」窗格現在有兩個資料來源。點哪個，下面就列出哪個檔案的欄位。",
        note: "這兩個檔沒有共同欄位，所以各自是一個資料來源。<b>不要</b>把第二個檔案拖到第一個檔案的畫布上，那樣 Tableau 會要求設定「關係」。",
        hl: { "tab:工作表 1": 1, "ds:feature_importance": 2 },
      },
    ],
  };
  const SHOW_FIELDS = ["合約類型", "客群", "流失人數", "流失率", "月營收", "預測流失機率"];
  const fieldMenus = (field, sub, last) => [
    { type: "menu", at: "field:" + field, pos: "right", items: [PH, PH, Object.assign(mi("預設屬性"), { sub: true }), PH, PH] },
    { type: "menu", at: "ov:預設屬性", pos: "right", items: [PH, Object.assign(mi("彙總"), { sub: sub === "彙總" }), PH, Object.assign(mi("數位格式…"), {})] },
  ].concat(last ? [last] : []);
  const FIELD1 = {
    id: "4-1", name: "流失率改成預設平均值", base: { screen: "sheet", ds: DS_MAIN, tabs: ["工作表 1"], active: 0, title: "工作表 1", view: { k: "empty" }, cols: [], rows: [], marks: [], show: SHOW_FIELDS },
    steps: [
      { short: "點資料來源 churn_dashboard", doo: "在左上「資料」窗格點 <b>churn_dashboard</b>。", see: "下面列出它的欄位。", hl: { "ds:churn_dashboard": 1 } },
      {
        short: "右鍵 → 預設屬性 → 彙總 → 平均值", doo: "在 <b>流失率</b> 上按 <b>右鍵</b> → 滑到 <b>預設屬性</b> → 滑到 <b>彙總</b> → 點 <b>平均值</b>。",
        see: "選單關掉，畫面看起來沒變。之後把流失率拖進任何圖，膠囊都會寫 AVG(流失率)，數值就是流失率。",
        note: "為什麼要改：流失率這欄每位客戶是 0 或 1。Tableau 預設會「總計」（加總），加起來是流失人數 133,817；取「平均值」才是流失率 22.5%。",
        hl: { "field:流失率": 1, "ov:預設屬性": 2, "ov:彙總": 3, "ov:平均值": 4 },
        ov: fieldMenus("流失率", "彙總", { type: "menu", at: "ov:彙總", pos: "right", items: [mi("總計"), mi("平均值"), mi("最小值"), mi("最大值"), PH, PH] }),
      },
    ],
  };
  const FIELD2 = {
    id: "4-2", name: "流失率設成百分比", base: FIELD1.base,
    steps: [
      {
        short: "右鍵 → 預設屬性 → 數位格式", doo: "在 <b>流失率</b> 上按 <b>右鍵</b> → 滑到 <b>預設屬性</b> → 點 <b>數位格式…</b>。",
        see: "跳出數字格式的視窗。", note: "繁中介面就是翻成「數位格式」，意思是數字格式。",
        hl: { "field:流失率": 1, "ov:預設屬性": 2, "ov:數位格式…": 3 }, ov: fieldMenus("流失率"),
      },
      {
        short: "選百分比、小數 1", doo: "左邊清單點 <b>百分比</b>，右邊 <b>小數</b> 改成 <b>1</b> → <b>確定</b>。",
        see: "視窗關掉，畫面看起來沒變。之後流失率在圖上都會顯示成 22.5%，不是 0.2252。",
        hl: { "dl:百分比": 1, "dl:小數": 2, "dlg:確定": 3 }, ov: [{ type: "dialog", pos: "center", title: "預設數位格式 [流失率]", body: DLG.numfmt() }],
      },
    ],
  };
  const FIELD3 = {
    id: "4-3", name: "月營收顯示成 $39.1M", base: FIELD1.base,
    steps: [
      { short: "右鍵 → 預設屬性 → 數位格式", doo: "在 <b>月營收</b> 上按 <b>右鍵</b> → 滑到 <b>預設屬性</b> → 點 <b>數位格式…</b>。", see: "跳出數字格式的視窗。", hl: { "field:月營收": 1, "ov:預設屬性": 2, "ov:數位格式…": 3 }, ov: fieldMenus("月營收") },
      {
        short: "數字（自訂）、單位百萬、首碼 $", doo: "左邊點 <b>數字（自訂）</b>，右邊 <b>小數位數</b> 改成 <b>1</b>、<b>單位</b> 選 <b>百萬 (M)</b>、<b>首碼/尾碼</b> 的首碼填 <b>$</b> → <b>確定</b>。",
        see: `之後月營收會顯示成 ${usdM(KR["月營收"])}，不是一長串數字。`,
        note: "不要選「貨幣（自訂）」：它會照 Windows 的地區設定加上 NT$，但這份資料是美元。",
        hl: { "dl:數字（自訂）": 1, "dl:小數位數": 2, "dl:單位": 3, "dl:首碼": 4 }, ov: [{ type: "dialog", pos: "center", title: "預設數位格式 [月營收]", body: DLG.numcustom() }],
      },
    ],
  };
  // 整本工作簿的格式：標題字級、格線。已經做好的工作表也會一起變
  const FIELD4 = {
    id: "4-4", name: "整本工作簿：標題變小、拿掉格線", base: FIELD1.base,
    steps: [
      {
        short: "格式 → 工作簿…", doo: "點上方選單 <b>格式</b> → <b>工作簿…</b>（在選單下半部）。", see: "左邊的「資料」窗格換成「設定工作簿格式」窗格。",
        set: { wbfmt: true }, hl: { "menu:格式": 1, "ov:工作簿…": 2 }, ov: [{ type: "menu", at: "menu:格式", items: [PH, PH, PH, PH, PH, mi("工作簿…"), PH] }],
      },
      {
        short: "工作表標題：12、粗體", doo: "在 <b>字型</b> 那一區找到 <b>工作表標題</b>，點它右邊的下拉選單 → 字級選 <b>12</b>、按 <b>B</b>（粗體）。",
        see: "每張工作表的標題都變小、變粗。預設的標題很大，放進儀表板後會比圖還搶眼。", set: { wbTitle: true }, hl: { "fmt:工作表標題": 1, title: 2 },
      },
      {
        short: "格線：無", doo: "往下在線條那一區找到 <b>格線</b>，點它右邊的下拉選單 → 選 <b>無</b>。",
        see: "所有圖背景的格線都不見了。長條上會直接寫數字，格線只是多出來的線。", set: { wbGrid: true }, hl: { "fmt:格線": 1 },
      },
      {
        short: "關掉窗格", doo: "點窗格右上角的 <b>✕</b>。", see: "「資料」窗格回來了。", set: { wbfmt: false }, hl: { fields: 1 },
        note: "這是整本工作簿的設定：已經做好的工作表會一起變，之後新做的也會套用。想還原的話，重新打開這個窗格，按下面的 <b>重設為預設值</b>。",
      },
    ],
  };
  const FIELD_SETTINGS = [
    ["churn_dashboard：<b>流失率</b>", "平均值", "百分比，小數 1"],
    ["churn_dashboard：<b>預測流失機率</b>", "平均值", "百分比，小數 1"],
    ["churn_dashboard：<b>平均使用月數</b>", "平均值", "不用改"],
    ["churn_dashboard：<b>平均月費</b>", "平均值", "不用改"],
    ["churn_dashboard：<b>月營收</b>", "不用改（總計）", "數字（自訂），小數位數 1，單位百萬 (M)，首碼 $"],
    ["churn_dashboard：<b>流失月營收</b>", "不用改（總計）", "同上"],
    ["churn_dashboard：<b>預期流失月營收</b>", "不用改（總計）", "同上"],
    ["feature_importance：<b>重要度</b>", "不用改", "百分比，小數 1"],
    ["data_quality：<b>缺值比例</b>", "不用改", "百分比，小數 1"],
  ];

  const ALLTABS = SHEETS.slice();
  const dzone = id => clone(DASHES.find(d => d.id === id).zones);
  const ovZ = dzone("overview");  // 做完的樣子：KPI 沒有標題、第三排 1/3 : 2/3
  const ovRow2 = ovZ.c[1];
  // 做到一半的樣子：剛拖進來時 KPI 還有標題、第三排兩張一樣寬
  const ovStart = (z => { z.c[0].nt = false; z.c[2].c.forEach(c => { c.f = 1; }); return z; })(clone(ovZ));
  const ovNoTitle = (z => { z.c[0].nt = true; return z; })(clone(ovStart));
  const withLegend = z => ({ t: "h", c: [Object.assign(clone(z), { f: 6 }), { t: "legend", f: 1, title: "狀態", items: [["流失", "--c-churn"], ["留存", "--c-stay"]] }] });
  const LINK_OV = DASHES[0].link;
  const DASH1 = {
    id: "11-1", name: "組「總覽」儀表板並開啟連動", base: { screen: "dash", tabs: ALLTABS.concat(["儀表板 1"]), dtabs: ["儀表板 1"], active: ALLTABS.length, title: "儀表板 1", size: "預設大小", showTitle: false, sheetList: SHEETS.slice(0, 6) },
    steps: [
      { short: "新建儀表板", doo: "點底部分頁列右邊第二個小圖示 <b>新建儀表板</b>。", see: "出現一個空白儀表板，左邊是「儀表板」窗格：大小、工作表清單、物件。", hl: { "tab-newdash": 1, "tab:儀表板 1": 2 } },
      { short: "分頁改名「總覽」", doo: "雙擊底部的「儀表板 1」分頁，輸入 <b>總覽</b>，按 Enter。", see: "分頁變成「總覽」。", set: { tabs: ALLTABS.concat(["總覽"]), dtabs: ["總覽"], title: "總覽" }, hl: { "tab:總覽": 1 } },
      {
        short: "大小設成固定 1200 × 900", doo: "點左邊 <b>大小</b> 的下拉選單 → 選 <b>固定大小</b> → 寬填 <b>1200</b>、高填 <b>900</b>。",
        see: "儀表板變成固定大小。發布後在不同螢幕上版面才不會跑掉。", set: { size: "固定大小（1200 × 900）" },
        hl: { "dash:size": 1, "dl:大小": 2, "dl:寬高": 3 }, ov: [{ type: "dialog", at: "dash:size", pos: "right", title: "大小", body: DLG.size(), btns: [] }],
      },
      { short: "勾「顯示儀表板標題」", doo: "勾左邊最下面的 <b>顯示儀表板標題</b>。", see: "畫面上方出現標題「總覽」。標題就是分頁名稱，不用另外改。", set: { showTitle: true }, hl: { "dash:showtitle": 1, "dash:title": 2 } },
      {
        short: "拖進 KPI 橫幅", doo: "從左邊 <b>工作表</b> 清單把 <b>KPI 橫幅</b> 拖到右邊畫面，放開。", see: "KPI 橫幅占滿整個畫面。先不用管大小，最後再調。",
        set: { zones: { t: "v", c: [{ t: "sheet", n: "KPI 橫幅" }] } }, hl: { "dsheet:KPI 橫幅": 1, "zone:KPI 橫幅": 2 },
      },
      {
        short: "拖一個「水平」到下方", doo: "從 <b>物件</b> 把 <b>水平</b> 拖到 KPI 橫幅的<b>下緣</b>（出現灰色陰影在下半部時放開）。",
        see: "KPI 橫幅下面多一個空的水平容器：放進去的東西會左右排。", note: "官方繁中文件有的地方翻成「水準」，指的是同一個東西（Horizontal）。",
        set: { zones: { t: "v", c: [{ t: "sheet", n: "KPI 橫幅" }, { t: "empty", k: "第二排" }] } }, hl: { "obj:水平": 1, "zone:第二排": 2 },
      },
      {
        short: "三張流失率圖拖進去", doo: `依序把 ${ovRow2.c.map(c => `<b>${c.n}</b>`).join("、")} 拖進這個水平容器，一張放在前一張的右邊。`,
        see: "第二排變成三張並排的圖。", set: { zones: { t: "v", c: [{ t: "sheet", n: "KPI 橫幅" }, ovRow2] } }, hl: { "dsheet:各合約類型流失率": 1, "zone:第二排": 2 },
      },
      {
        short: "第三排：網路服務和月營收", doo: "再拖一個 <b>水平</b> 到第二排的<b>下緣</b>，然後把 <b>各網路服務流失率</b>、<b>各合約月營收</b> 依序拖進去。",
        see: "第三排左邊是網路服務、右邊是各合約月營收。同時儀表板最右邊多出一欄「狀態」圖例：工作表用了「色彩」，Tableau 就會自動把圖例加進來。",
        set: { zones: withLegend(ovStart) }, hl: { "obj:水平": 1, "zone:第三排": 2, "zone:圖例": 3 },
      },
      {
        short: "刪掉右邊的圖例", doo: "點一下右邊的「狀態」圖例選取它（外框變粗）→ 點外框右上角的 <b>✕</b>。",
        see: "圖例不見了，右邊那一欄的寬度還給圖。「各合約月營收」的每一段已經寫了流失／留存（5-6），不需要圖例。",
        note: "右邊還留著一條空白的話，點那條空白選取它，一樣按 ✕。只是從儀表板拿掉，工作表本身不受影響。5-6 沒有把「狀態」拖到「標籤」的話，先回去補做那一步。",
        set: { zones: ovStart }, hl: { "zone:各合約月營收": 1 },
      },
      {
        short: "藏起 KPI 橫幅的標題", doo: "在 KPI 橫幅上方的標題「KPI 橫幅」按 <b>右鍵</b> → 點 <b>隱藏標題</b>。",
        see: "標題不見了，數字往上貼齊。每個數字上面已經有欄名，不需要再一個標題。", set: { zones: ovNoTitle },
        hl: { "ztitle:KPI 橫幅": 1, "ov:隱藏標題": 2 }, ov: [{ type: "menu", at: "ztitle:KPI 橫幅", pos: "right", items: [PH, mi("隱藏標題"), PH, PH] }],
      },
      {
        short: "第二排平均分寬度", doo: "點第二排容器的邊緣選取它（外框變粗）→ 右上角 <b>▼</b> → <b>均勻分佈</b>。",
        see: "三張圖變成一樣寬。", note: "選不到容器的話，先點容器裡任一張圖，再從它右上角的 ▼ 選 <b>選取容器</b>。",
        hl: { "zone:第二排": 1, "ov:均勻分佈": 2 }, ov: [{ type: "menu", at: "zone:第二排", items: [PH, mi("均勻分佈"), PH, mi("移除容器")] }],
      },
      {
        short: "第三排：網路服務窄一點", doo: "滑鼠移到第三排兩張圖中間的分隔線，游標變成左右箭頭時往左拖，讓「各網路服務流失率」跟上面的「各合約類型流失率」一樣寬。",
        see: "網路服務只有三條長條，1/3 寬就夠；各合約月營收拿到 2/3。上下兩排的分隔線對齊，版面看起來整齊。", set: { zones: ovZ }, hl: { "zone:各網路服務流失率": 1, "zone:各合約月營收": 2 },
      },
      {
        short: "調整每排高度", doo: "滑鼠移到兩排之間的分隔線，游標變成上下箭頭時拖動：KPI 那排矮一點（大約占 1/6），第二排和第三排一樣高。",
        see: "版面跟第 0 章「成品長這樣」的總覽一樣。", hl: { "zone:KPI 橫幅": 1, "zone:第二排": 2, "zone:第三排": 3 },
      },
      {
        short: "開啟連動：用作篩選器", doo: "點一下 <b>各使用月數流失率</b> 選取它 → 點它右上角的 <b>▼</b> → 點 <b>用作篩選器</b>。",
        see: "選單關掉。之後在這張圖上點任何一條長條，儀表板上其他工作表都會篩成那一組客戶。",
        note: "選取工作表後，右上角的小工具列也有一個漏斗圖示，點它效果一樣。",
        hl: { "zone:各使用月數流失率": 1, "ov:用作篩選器": 2 }, ov: [{ type: "menu", at: "zone:各使用月數流失率", items: [PH, mi("用作篩選器"), PH, PH] }],
      },
      {
        short: "其他四張也開", doo: `照上一步，對 ${LINK_OV.filter(n => n !== "各使用月數流失率").map(n => `<b>${n}</b>`).join("、")} 也各點一次 <b>▼ → 用作篩選器</b>。`,
        see: "這頁的五張圖都能拿來篩選了。KPI 橫幅不用開：它只負責被篩選。",
        hl: { "zone:各合約類型流失率": 1, "zone:各付款方式流失率": 2, "zone:各網路服務流失率": 3, "zone:各合約月營收": 4 },
      },
      {
        short: "試試看：點「0-12 個月」", doo: "在「各使用月數流失率」點 <b>0-12 個月</b> 那條長條。", set: { full: true, demo: true },
        see: `整頁都變成「加入 12 個月內」這群客戶：KPI 變成 ${CTX_DEMO.kpi.map(k => `${k[0]} ${k[1]}`).join("、")}；合約、付款方式、網路服務、月營收也都只算這群人。點的那張圖本身不會被篩，只是其他長條變淡。`,
        hl: { "zone:KPI 橫幅": 1, "zone:各使用月數流失率": 2 },
      },
      {
        short: "取消選取", doo: "再點一次 <b>0-12 個月</b>，或點圖上的空白處。", set: { full: true, demo: false },
        see: `整頁回到全部客戶的數字：KPI 是 ${CTX.kpi.map(k => `${k[0]} ${k[1]}`).join("、")}。`, hl: { "zone:KPI 橫幅": 1 },
      },
    ],
  };
  // 11-1 的第幾步（其他段落引用用，步驟增減時不用手改）
  const d1 = short => { const i = DASH1.steps.findIndex(x => x.short === short); if (i < 0) throw new Error("DASH1 沒有這一步：" + short); return i + 1; };
  const DASH2 = {
    id: "11-7", name: "收尾：隱藏個別工作表", base: { screen: "dash", tabs: ALLTABS.concat(DASH_NAMES), dtabs: DASH_NAMES.slice(), active: ALLTABS.length, title: "總覽", size: "固定大小（1200 × 900）", showTitle: true, zones: ovZ, sheetList: SHEETS.slice(0, 6) },
    steps: [
      {
        short: "右鍵 → 隱藏所有工作表", doo: "在底部任一個儀表板分頁（例如 <b>總覽</b>）按右鍵 → 點 <b>隱藏所有工作表</b>。", see: "跳出選單。",
        hl: { "tab:總覽": 1, "ov:隱藏所有工作表": 2 }, ov: [{ type: "menu", at: "tab:總覽", pos: "above", items: [PH, PH, mi("隱藏所有工作表"), PH] }],
      },
      {
        short: "只剩 6 個儀表板", doo: "不用再點，看底部分頁列。", set: { hideSheets: true },
        see: "19 張工作表都收起來了，只剩 6 個儀表板分頁。發布後別人也只會看到這 6 頁。", note: "要改某張圖：在儀表板上點那張圖 → 右上角的 <b>前往工作表</b> 圖示。或右鍵分頁 → <b>取消隱藏所有工作表</b>。",
        hl: { "tab:資料檢核": 1 },
      },
    ],
  };
  const PUB1 = {
    id: "12-1", name: "先存一份在自己電腦", base: Object.assign(clone(DASH2.base), { hideSheets: true }),
    steps: [
      {
        short: "檔案 → 另存新檔", doo: "點上方選單 <b>檔案</b> → <b>另存新檔…</b>（Save As）。", see: "跳出存檔視窗。", note: "較舊的版本沒有本機存檔，選單裡找不到的話直接做 12-2，之後可以從網站下載工作簿。",
        hl: { "menu:檔案": 1, "ov:另存新檔…": 2 }, ov: [{ type: "menu", at: "menu:檔案", items: [PH, PH, mi("另存新檔…"), PH, PH] }],
      },
      {
        short: "存成 .twbx", doo: "存檔類型選 <b>Tableau 封裝工作簿 (*.twbx)</b>，存到 <b>文件 › churn_tableau</b> → 存檔。",
        see: "資料夾多一個 churn_dashboard.twbx。.twbx 會把資料一起打包，換電腦也能打開。", hl: { "dl:存檔類型": 1 },
        ov: [{ type: "dialog", pos: "center", title: "另存新檔", body: DLG.saveas(), btns: ["存檔", "取消"] }],
      },
    ],
  };
  const PUB2 = {
    id: "12-2", name: "發布到 Tableau Public", base: Object.assign(clone(DASH2.base), { hideSheets: true }),
    steps: [
      {
        short: "伺服器 → Tableau Public → 儲存到 Tableau Public", doo: "點上方選單 <b>伺服器</b> → <b>Tableau Public</b> → <b>儲存到 Tableau Public…</b>。", see: "跳出登入視窗。",
        hl: { "menu:伺服器": 1, "ov:Tableau Public": 2, "ov:儲存到 Tableau Public…": 3 },
        ov: [{ type: "menu", at: "menu:伺服器", items: [PH, PH, Object.assign(mi("Tableau Public"), { sub: true })] }, { type: "menu", at: "ov:Tableau Public", pos: "right", items: [mi("儲存到 Tableau Public…"), PH] }],
      },
      { short: "登入", doo: "用第 2 章註冊的 Tableau Public 帳號登入。", see: "登入後跳出命名視窗。", ov: [{ type: "dialog", pos: "center", title: "Tableau Public 登入", body: DLG.login(), btns: ["登入"] }], hl: { "dlg:登入": 1 } },
      {
        short: "取名字 → 儲存", doo: "名稱填 <b>Customer Churn Dashboard</b> → <b>儲存</b>。", see: "Tableau 會把 59 萬筆明細轉成擷取檔上傳，大概要一、兩分鐘。完成後瀏覽器會自動打開你的作品頁面。",
        note: "⚠️ 發布到 Tableau Public 就是公開，任何人都看得到、也能下載資料。這份是 Kaggle 合成資料所以沒問題；換成真實客戶資料時不能用 Tableau Public。",
        hl: { "dl:名稱": 1, "dlg:儲存": 2 }, ov: [{ type: "dialog", pos: "center", title: "儲存到 Tableau Public", body: DLG.wbname(), btns: ["儲存", "取消"] }],
      },
    ],
  };
  const PUB3 = {
    id: "12-3", name: "讓 6 頁能切換、拿分享連結", base: { screen: "web", tabsOn: false },
    steps: [
      {
        short: "打開 Show Sheets as Tabs", doo: "在作品頁面點 <b>Edit Details</b>（或齒輪設定）→ 把 <b>Show Sheets as Tabs</b> 打開 → 存檔。",
        see: "作品上方出現 6 個分頁，看的人才能切換。", set: { tabsOn: true },
        hl: { "web:edit": 1, "dl:tabs": 2 }, ov: [{ type: "dialog", at: "web:edit", pos: "below", title: "Edit Details", body: DLG.details(true), btns: ["Save"] }],
      },
      {
        short: "Share → 複製連結", doo: "點作品下方的 <b>Share</b> → 複製 <b>Link</b> 那串網址。", see: "這就是分享連結。直接複製瀏覽器網址列也可以。",
        hl: { "web:share": 1, "dl:link": 2 }, ov: [{ type: "dialog", at: "web:share", pos: "above", title: "Share", body: DLG.share(), btns: ["Copy"] }],
      },
    ],
  };

  // ================================================================
  // 章節
  // ================================================================
  const P = html => ({ t: "p", html });
  const H = text => ({ t: "h", text });
  const SP = def => ({ t: "stepper", def });
  const repeatBlock = (title, rows, sheets, note) => ({ t: "repeat", title, rows, sheets, note });
  const DICT = [
    ["客戶編號", "維度", "每位客戶的編號（C 開頭，Tableau 才會當文字）"],
    ["合約類型、付款方式、網路服務", "維度", "原始資料"],
    ["使用月數分組", "維度", "0-12、13-24、25-48、49 個月以上"],
    ["月費區間", "維度", "每 10 美元一組（月費分布用）"],
    ["加值服務數", "維度", "6 種加值服務訂了幾項（0 項～6 項）"],
    ["客群", "維度", "KMeans 分出的 4 群"],
    ["狀態", "維度", "流失 / 留存"],
    ["風險等級", "維度", "依預測流失機率分：≥50% 高、20–50% 中、<20% 低"],
    ["風險十分位", "維度", "依預測流失機率由高到低切 10 組，第01組最高"],
    ["挽留名單", "維度", "「是」= 還沒流失的客戶裡，每種合約機率最高的 100 位"],
    ["客戶數", "度量", "每列都是 1，總計＝人數"],
    ["流失人數", "度量", "流失＝1、留存＝0，總計＝流失人數"],
    ["流失率", "度量", "跟流失人數一樣是 0/1；預設彙總改成平均值，平均＝流失率"],
    ["月營收", "度量", "月費；總計＝月營收"],
    ["流失月營收", "度量", "流失客戶的月費（留存客戶是 0），總計＝流失帶走的月營收"],
    ["預測流失機率", "度量", "模型的交叉驗證機率；預設彙總改成平均值"],
    ["預期流失月營收", "度量", "預測流失機率 × 月費，總計＝預期會流失的月營收"],
    ["高風險人數", "度量", "預測機率 ≥ 50% 是 1，總計＝高風險人數"],
    ["使用月數", "度量", "用了幾個月（挽留名單的工具提示用）"],
    ["平均使用月數、平均月費", "度量", "使用月數、月費的複本，預設彙總改成平均值（客群輪廓用）"],
    ["區間排序、等級排序", "度量", "排序用：月費區間、風險等級照文字排會亂掉"],
  ];
  const CH = [
    { id: "overview", no: 0, grp: "開始", nav: "成品長這樣", title: "成品長這樣：6 個連動的儀表板", lead: "先看最後要做出什麼。所有圖都用你資料裡的真實數字畫成。", blocks: () => [
      { t: "concept" },
      H("連動：點一下，整頁一起變"),
      P("Dashboard 跟一頁靜態報表最大的差別是<b>連動</b>：所有圖都接同一份客戶明細，在任何一張圖上點一個類別，同一頁的 KPI 和其他圖都會篩成那群客戶。下面是「總覽」點了「0-12 個月」前後的樣子。"),
      { t: "linkdemo" },
      H("6 個儀表板"),
      { t: "dashes" },
    ] },
    { id: "prep", no: 1, grp: "開始", nav: "準備資料", title: "準備資料", lead: "用 Python 產生 Tableau 要讀的 CSV，再複製到 Windows。", blocks: () => [
      H("1-1　產生檔案"),
      P("在 WSL 的專案資料夾執行下面這行。模型檔已經有了，平常不用重新訓練；只有改了模型或資料，才要先跑 <code>uv run train_and_save.py</code>。"),
      { t: "cmd", title: "WSL 終端機（在 ~/churn）", code: "uv run export_for_tableau.py" },
      P("會在 <code>tableau/</code> 產生 4 個檔：dashboard 用的 <code>churn_dashboard.csv</code>、特徵重要度、資料檢核表，以及 Power BI 用的 <code>churn_mart.csv</code>（Tableau 用不到）。"),
      H("1-2　複製到 Windows"),
      P("Tableau 是 Windows 程式，它的「開啟檔案」視窗看不到 WSL 裡的 <code>/home/…</code>。只要複製這 3 個檔："),
      { t: "cmd", title: "WSL 終端機", code: "W=\"$(wslpath \"$(cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\\r')\")/Documents/churn_tableau\"\nmkdir -p \"$W\"\ncp tableau/churn_dashboard.csv tableau/feature_importance.csv tableau/data_quality.csv \"$W/\"" },
      H("1-3　三個檔案"),
      { t: "table", hd: ["檔案", "內容", "用在"], rows: [
        ["<code>churn_dashboard.csv</code>", "每位客戶一列（59 萬列、25 欄）", "17 張互動的工作表，全部接這一個資料來源，所以能連動"],
        ["<code>feature_importance.csv</code>", "模型 21 個特徵的重要度", "特徵重要度。這是模型整體的性質，不會隨篩選變"],
        ["<code>data_quality.csv</code>", "明細每個欄位的型態、缺值、相異值", "資料檢核頁"],
      ] },
      H("1-4　churn_dashboard.csv 的欄位"),
      P("指標都在 Tableau 裡用彙總算（不用計算欄位），所以明細裡先放好幾個輔助欄："),
      { t: "table", hd: ["欄位", "類型", "意思"], rows: DICT.map(r => [`<b>${esc(r[0])}</b>`, r[1], esc(r[2])]) },
    ] },
    { id: "install", no: 2, grp: "開始", nav: "安裝 Tableau", title: "安裝 Tableau Public", lead: "桌面版現在的正式名稱是 Tableau Desktop Public Edition，免費。", blocks: () => [
      { t: "list", items: [
        "瀏覽器打開 <b>public.tableau.com</b>，右上角 <b>Sign Up</b> 註冊帳號（第 12 章發布時要用）。",
        "登入後在網站上方找 <b>Create</b> 選單，選 <b>Tableau Desktop Public Edition</b> 下載。網站改版時位置可能不同，找「Download」或「Desktop Public Edition」字樣即可。",
        "在 <b>Windows</b> 執行安裝檔（需要系統管理員權限），一路按下一步。",
        "第一次開啟可能要填 email 啟用。",
        "（可選）中文介面：選單 <b>Help → Choose Language → 中文（繁體）</b>，重開 Tableau。這份指南的按鈕名稱照繁中介面寫，部分附英文。",
      ] },
      { t: "callout", html: "Tableau 的繁中翻譯有些字比較怪，例如「數位格式」（數字格式）、「降冪排序」（由大到小）、「條形」（長條）。指南照官方繁中說明文件的用字寫，跟你畫面上不一樣時，以你的畫面為準，截圖給我。" },
    ] },
    { id: "connect", no: 3, grp: "接資料", nav: "接資料", title: "接資料：3 個檔案", lead: "churn_dashboard.csv 從開始畫面接；另外兩個用「資料 → 新資料來源」各接一次。", blocks: () => [
      SP(CONNECT1),
      SP(CONNECT2),
      P("最後照 3-2 再接一次 <code>data_quality.csv</code>。接完「資料」窗格會有 3 個資料來源。"),
    ] },
    { id: "fields", no: 4, grp: "接資料", nav: "預設設定", title: "預設設定：彙總、數字格式、工作簿格式", lead: "這章的設定都只做一次：每個數字欄位拖進圖裡時要「加總」還是「平均」、數字怎麼顯示，以及整本工作簿的標題大小和格線。之後每張圖都套用。", blocks: () => [
      SP(FIELD1),
      SP(FIELD2),
      SP(FIELD3),
      H("要設定的欄位"),
      P("每一列都照上面的方法做：在「資料」窗格對欄位按右鍵 → 預設屬性 → 彙總 / 數位格式。"),
      { t: "check", id: "fields", hd: ["欄位", "預設屬性 → 彙總", "預設屬性 → 數位格式"], rows: FIELD_SETTINGS },
      { t: "callout", kind: "info", html: "「平均值」那 4 個一定要改，不然流失率會變成流失人數。數字格式不做不會壞，只是會顯示成 0.2252、39137314 這種樣子。" },
      H("整本工作簿的格式"),
      P("Tableau 預設的工作表標題很大、每張圖都有格線，拼成儀表板會很雜。在這裡改一次，所有工作表（包括已經做好的）都會套用。"),
      SP(FIELD4),
    ] },
    { id: "p1", no: 5, grp: "做工作表", nav: "總覽頁（6 張）", title: "「總覽」頁的 6 張工作表", lead: "一張工作表只放一張圖。這章做 6 張，第 11 章才把它們拼成「總覽」儀表板並開啟連動。", blocks: () => [
      { t: "dashmini", id: "overview" },
      SP(W.kpi),
      SP(W.contract),
      repeatBlock("5-3、5-4、5-5　照 5-2 再做三張", [
        ["<b>各付款方式流失率</b>", "付款方式", "流失率", "客戶數", "要，降冪排序"],
        ["<b>各使用月數流失率</b>", "使用月數分組", "流失率", "客戶數", "不要，保持 0-12 → 49 個月以上"],
        ["<b>各網路服務流失率</b>", "網路服務", "流失率", "客戶數", "要，降冪排序"],
      ], ["各付款方式流失率", "各使用月數流失率", "各網路服務流失率"], "每張都要做完 5-2 的全部步驟，包括顯示標籤、拿掉軸和欄位標籤。使用月數分組的名稱刻意用數字開頭（0-12 個月、13-24 個月…），Tableau 預設的排序剛好就是月數順序，所以不用排序。付款方式的名字被截成「Bank transfer (auto…」的話：滑鼠移到名字那一欄的右邊界，游標變成左右箭頭時往右拖。"),
      SP(W.revenue),
    ] },
    { id: "p2", no: 6, grp: "做工作表", nav: "流失因子頁（4 張）", title: "「流失因子」頁的 4 張工作表", lead: "哪些客戶組合最容易流失：兩張熱圖、月費分布、加值服務數。", blocks: () => [
      { t: "dashmini", id: "drivers" },
      SP(W.heat),
      repeatBlock("6-2　照 6-1 再做一張", [["<b>合約×使用月數</b>", "合約類型", "使用月數分組", "—", "不用排序"]], ["合約×使用月數"]),
      SP(W.hist),
      repeatBlock("6-4　照 5-2 做加值服務數", [["<b>各加值服務數流失率</b>", "加值服務數", "流失率", "客戶數", "不要，保持 0 項 → 6 項"]], ["各加值服務數流失率"]),
    ] },
    { id: "p3", no: 7, grp: "做工作表", nav: "客群頁（3 張）", title: "「客群」頁的 3 張工作表", lead: "KMeans 分出的 4 個客群：各自長什麼樣、多少人、流失率多少、模型準不準。", blocks: () => [
      { t: "dashmini", id: "seg" },
      SP(W.bubble),
      SP(W.calib),
      SP(W.calibTable),
    ] },
    { id: "p4", no: 8, grp: "做工作表", nav: "風險名單頁（3 張）", title: "「風險名單」頁的 3 張工作表", lead: "只看還沒流失的現有客戶：每張工作表先把「狀態」篩成留存。", blocks: () => [
      { t: "dashmini", id: "risk" },
      SP(W.riskKpi),
      repeatBlock("8-2　照 7-2 做風險分級", [["<b>現有客戶風險分級</b>", "風險等級", "客戶數、月營收", "—", "依「等級排序」/ 最小值 / 遞增"]], ["現有客戶風險分級"],
        "開始前先照 8-1 第 2、3 步，把「狀態」篩成只留「留存」。「等級排序」是 1＝高風險、2＝中風險、3＝低風險，照 7-2 第 6、7 步排序，高風險就會在最上面。"),
      SP(W.list),
    ] },
    { id: "p5", no: 9, grp: "做工作表", nav: "模型驗證頁（2 張）", title: "「模型驗證」頁的 2 張工作表", lead: "模型給的機率可不可信：依預測機率把客戶切成 10 組，比較每組的實際流失率和預測機率。", blocks: () => [
      { t: "dashmini", id: "model" },
      SP(W.deciles),
      repeatBlock("9-2　照 5-2 做特徵重要度", [["<b>特徵重要度</b>", "特徵", "重要度", "—", "要，降冪排序"]], ["特徵重要度"],
        "這張的資料來源是 <b>feature_importance</b>（新建工作表後記得在「資料」窗格點它）。重要度是 LightGBM 的增益（gain）占比，是模型整體的性質，所以不跟其他圖連動。"),
    ] },
    { id: "p6", no: 10, grp: "做工作表", nav: "資料檢核頁（1 張）", title: "「資料檢核」頁的工作表", lead: "檢查明細每個欄位的型態、缺值和相異值，最後一列是總筆數。", blocks: () => [
      { t: "dashmini", id: "dq" },
      SP(W.dq),
    ] },
    { id: "dashboards", no: 11, grp: "組裝與發布", nav: "組成儀表板", title: "組成 6 個儀表板，開啟連動", lead: "儀表板是一頁版面：把做好的工作表拖進去排好，再對每張圖開「用作篩選器」，整頁就會連動。先詳細做一次「總覽」，其他 5 頁照版面圖放。", blocks: () => [
      SP(DASH1),
      H("其他 5 個儀表板"),
      P(`每個都照 11-1 的第 1～4 步開始：新建儀表板 → 改名 → 大小 → 顯示儀表板標題。然後照版面圖放工作表：KPI 照第 ${d1("藏起 KPI 橫幅的標題")} 步隱藏標題；自動長出來的圖例照第 ${d1("刪掉右邊的圖例")} 步處理（哪些要留，看各頁的說明）；並排的圖讓分隔線上下對齊。最後對列出的工作表開「用作篩選器」（11-1 第 ${d1("開啟連動：用作篩選器")} 步）。`),
      { t: "dashplan" },
      SP(DASH2),
    ] },
    { id: "publish", no: 12, grp: "組裝與發布", nav: "存檔與發布", title: "存檔、發布、拿分享連結", lead: "先存一份在自己電腦，再發布到 Tableau Public。", blocks: () => [
      SP(PUB1),
      SP(PUB2),
      SP(PUB3),
      H("之後資料更新"),
      { t: "list", items: [
        "重跑第 1 章的指令（產生檔案、複製到 Windows）。",
        "在 Tableau 打開 .twbx → 對「資料」窗格每個資料來源按右鍵 → <b>重新整理</b>。",
        "再做一次 12-2，<b>用同一個名稱</b>儲存，Tableau 問要不要覆蓋時選是。分享連結不會變。",
      ] },
    ] },
    { id: "help", no: 13, grp: "求助", nav: "卡住的時候", title: "卡住的時候", lead: "最常遇到的問題，以及怎麼讓我看到你的畫面。", blocks: () => [
      { t: "faq" },
      H("讓我知道你卡在哪"),
      { t: "list", items: [
        "按示意畫面下方的 <b>複製步驟編號</b>，貼給 Claude。",
        "按 <b>Win + PrtSc</b> 截一張圖（會自動存到「圖片 › Screenshots」），跟我說「看截圖」，我可以直接讀你的畫面。",
      ] },
    ] },
  ];
  const FAQ = [
    ["在儀表板上點了圖，其他圖和 KPI 沒有跟著變", "那張圖沒開「用作篩選器」，或其他圖用的不是 churn_dashboard 這個資料來源。", `選取那張圖 → 右上角 <b>▼</b> → <b>用作篩選器</b>（11-1 第 ${d1("開啟連動：用作篩選器")} 步）。確認每張互動的圖，「資料」窗格點的都是 churn_dashboard。特徵重要度和資料檢核本來就不會變。`],
    ["流失率顯示成 133,817 之類的大數字", "流失率這欄每位客戶是 0 或 1，Tableau 預設把它加總了，加起來就是流失人數。", "做第 4 章的 4-1：流失率的預設彙總改成 <b>平均值</b>。已經做好的圖，對膠囊按右鍵，在彙總的選項選平均值。"],
    ["儀表板右邊多出一欄（圖例或空白）", "放進用了「色彩」的工作表時，Tableau 會自動在儀表板右邊加一欄圖例。", `點圖例選取它 → 右上角 <b>✕</b>（11-1 第 ${d1("刪掉右邊的圖例")} 步）。還留一條空白的話，點空白處一樣按 ✕。需要留的圖例（例如月費分布的流失／留存），拖到它說明的那張圖上方放開。`],
    ["圖看起來很雜：標題很大、有格線、下面有軸、左上角有欄位名稱", "這些都是 Tableau 的預設值。", "標題和格線：做 4-4（整本一次改）。軸和欄位名稱：每張長條圖照 5-2 最後兩步，軸上右鍵取消勾 <b>顯示標頭</b>、欄位名稱上右鍵 <b>隱藏列的欄位標籤</b>。在工作表改，儀表板會自動跟著變。"],
    ["KPI 的欄名是「平均值 流失率」或只剩「平均值」", "度量名稱的別名沒改到，或改成了錯的字。", "欄位清單最下面斜體的 <b>度量名稱</b> 右鍵 → <b>別名…</b> → 在「值（別名）」那欄把那一格整格改成 <b>流失率</b>（5-1）。"],
    ["金額顯示成 NT$39.1M", "用了「貨幣」格式，Tableau 會照 Windows 的地區設定（台灣）加上 NT$，但這份資料是美元。", "對金額欄位按右鍵 → 預設屬性 → 數位格式… → 改選 <b>數字（自訂）</b>，<b>首碼/尾碼</b> 的首碼填 <b>$</b>（4-3）。月營收、流失月營收、預期流失月營收三個都要改。"],
    ["中文變亂碼（例如 å®¢æˆ¶æ•¸）", "Tableau 用錯文字編碼讀檔。", "回到 <b>資料來源</b> 分頁 → 畫布上檔案右邊的 <b>▼</b> → <b>文字檔屬性</b> → <b>字元集</b> 選 <b>UTF-8</b>。也確認檔案沒有先用 Excel 打開再存過（Excel 可能改掉編碼）。"],
    ["欄位旁出現橘色鍊條或紅色驚嘆號，數字變成 * 或空白", "同一張工作表混用了兩個資料來源的欄位，Tableau 在嘗試「資料混合」。", "一張工作表只用一個資料來源。把錯的膠囊拖出架子（拖到空白處放開就會移除），確認「資料」窗格點的是對的資料來源再重拖。"],
    ["把第二個檔案拖到畫布上，出現「關係」設定", "在同一個資料來源裡放兩個沒有共同欄位的檔案。", "在畫布上對多拖進來的檔案按右鍵 → <b>移除</b>，再照 3-2 用 <b>資料 → 新資料來源</b> 另外接。"],
    ["發布後只看得到一頁，或版面擠在一起", "沒開 Show Sheets as Tabs，或儀表板大小沒設固定。", "照 12-3 打開 <b>Show Sheets as Tabs</b>；分頁裡出現一堆個別工作表的話，做 11-7 隱藏後重新發布。版面亂的話，回 11-1 第 3 步設成固定大小。"],
  ];
  // 其他 5 個儀表板的額外說明
  const PLAN_NOTE = {
    drivers: "KPI 橫幅就是總覽那張，同一張工作表可以放進好幾個儀表板。放進兩張熱圖和月費分布後，右邊會長出三個圖例：兩個熱圖的顏色圖例刪掉（格子裡已經寫了數字）；「狀態」圖例要留，把它拖到「月費分布」的上緣放開，它就會待在那張圖上方，右邊那一欄跟著消失。",
    seg: "點客群輪廓的某個圓，KPI 會變成那個客群的數字。客群輪廓會帶進兩個圖例：大小（客戶數）刪掉；色彩（流失率）要留，拖到客群輪廓的下緣放開。",
    risk: "右邊兩張篩選器不用另外拖：「高風險挽留名單」放進來時會自動帶進來。為了讓它們也篩選 KPI 和風險分級：點篩選器右上角 ▼ → <b>應用於工作表</b> → <b>選定工作表</b> → 按 <b>儀表板上的所有項</b> → 確定。最後把下面的說明文字用「物件 → 文字」放在名單上方。",
    model: "點某一組直條，KPI 會變成那 10% 客戶的數字。特徵重要度是另一個資料來源，不會跟著變。",
    dq: "從「物件」把「文字」拖到表格右邊，貼上下面的指標定義。",
  };

  // ================================================================
  // 畫章節
  // ================================================================
  const main = document.getElementById("main"), toc = document.getElementById("toc");
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  function copyButton(text) {
    const wrap = el("span", "", `<button type="button" class="btn small">複製</button> <span class="toast" aria-live="polite"></span><input class="copyfallback" hidden readonly aria-label="要複製的文字">`);
    wrap.querySelector("button").addEventListener("click", () => copyText(text, wrap.querySelector(".toast"), wrap.querySelector("input")));
    return wrap;
  }
  function dashPreview(d, ctx, caption) {
    return `<div class="dprev-wrap"><div class="dprev">${caption ? `<p class="muted" style="font-size:.85rem;margin-bottom:6px">${caption}</p>` : ""}<div class="z-title">${esc(d.n)}</div>${zoneHTML(d.zones, false, d.h, ctx)}</div></div>`;
  }
  const table = (hd, rows) => `<div class="tablewrap"><table class="tb"><thead><tr>${hd.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  function renderBlock(b, mounts) {
    if (b.t === "h") return el("h3", "", esc(b.text));
    if (b.t === "p") return el("div", "prose", `<p>${b.html}</p>`);
    if (b.t === "list") return el("div", "prose", `<ol>${b.items.map(i => `<li>${i}</li>`).join("")}</ol>`);
    if (b.t === "callout") return el("div", "callout" + (b.kind ? " " + b.kind : ""), b.html);
    if (b.t === "table") return el("div", "", table(b.hd, b.rows));
    if (b.t === "cmd" || b.t === "textbox") {
      const text = b.code || b.lines.join("\n");
      const box = el("div", "cmd" + (b.t === "textbox" ? " textbox" : ""), `<div class="cmd-h"><span>${esc(b.title)}</span></div><pre>${esc(text)}</pre>`);
      box.querySelector(".cmd-h").appendChild(copyButton(text));
      return box;
    }
    if (b.t === "stepper") { const s = makeStepper(b.def); mounts.push(s.mount); return s.el; }
    if (b.t === "check") {
      const rows = b.rows.map((r, i) => {
        const key = b.id + ":" + i, on = !!store.checks[key];
        return `<tr class="${on ? "done" : ""}"><td><input type="checkbox" id="ck-${key.replace(":", "-")}" data-ck="${key}"${on ? " checked" : ""} aria-label="完成"></td>${r.map(c => `<td>${c}</td>`).join("")}</tr>`;
      }).join("");
      const box = el("div", "tablewrap", `<table class="tb chk"><thead><tr><th></th>${b.hd.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`);
      box.addEventListener("change", e => {
        const k = e.target.dataset.ck; if (!k) return;
        store.checks[k] = e.target.checked; save();
        e.target.closest("tr").classList.toggle("done", e.target.checked);
      });
      return box;
    }
    if (b.t === "repeat") {
      const wrap = el("div", "block");
      wrap.appendChild(el("h3", "", esc(b.title)));
      wrap.appendChild(el("div", "", table(["工作表名稱", "拖到「列」", "拖到「欄」", "工具提示", "排序"], b.rows)));
      if (b.note) wrap.appendChild(el("div", "prose", `<p class="muted">${b.note}</p>`));
      wrap.appendChild(el("div", "dlist", b.sheets.map(n => `<div class="zleaf" style="padding:12px 14px;min-height:150px"><span class="zl-t">做完長這樣：${esc(n)}</span>${PREV[n](CTX)}</div>`).join("")));
      return wrap;
    }
    if (b.t === "concept") {
      return el("div", "block", `<div class="defs"><div class="def"><div><b class="term">工作表</b><span class="en">Worksheet</span></div><p>一張圖。畫面最下面的每個分頁就是一張工作表，<b>一張工作表只放一張圖</b>。</p></div>` +
        `<div class="def"><div><b class="term">儀表板</b><span class="en">Dashboard</span></div><p>一整頁版面。它也是底部的一個分頁，裡面放的是好幾張做好的工作表，而且彼此連動。</p></div></div>` +
        table(["用過 Power BI 的話", "Power BI", "Tableau"], [
          ["放好幾張圖的那一頁", "報表頁面", "<b>儀表板</b>"],
          ["一張圖", "視覺效果，直接加在頁面上", "<b>工作表</b>，每張圖先在自己的分頁做好"],
          ["點一張圖篩選其他圖", "預設就會交叉篩選", "對工作表開 <b>用作篩選器</b>"],
        ]) +
        `<div class="stats"><div class="stat"><b>3</b><span>個 CSV 檔</span></div><div class="stat"><b>19</b><span>張工作表（零件）</span></div><div class="stat"><b>6</b><span>個儀表板（成品）</span></div><div class="stat"><b>0</b><span>個計算欄位</span></div></div>`);
    }
    if (b.t === "linkdemo") {
      const d = DASHES[0];
      return el("div", "block", dashPreview(d, CTX, "① 沒點任何東西：全部 59 萬位客戶") + dashPreview(d, CTX_DEMO, `② 點了「各使用月數流失率」的 ${esc(DEMO.group)}：KPI、合約、付款方式、網路服務、月營收都變成這 ${n0(DEMO.kpi["客戶數"])} 位客戶的數字`));
    }
    if (b.t === "dashes") {
      const wrap = el("div", "block");
      DASHES.forEach(d => {
        const sheets = [];
        (function walk(z) { if (z.t === "sheet") sheets.push(z.n); (z.c || []).forEach(walk); })(d.zones);
        wrap.appendChild(el("div", "block", `<h4>${esc(d.n)}</h4><p class="muted">${sheets.length} 張工作表：${sheets.map(esc).join("、")}${d.link.length ? `。點這幾張會篩選整頁：${d.link.map(esc).join("、")}` : "（這頁不需要連動）"}</p>${dashPreview(d)}`));
      });
      return wrap;
    }
    if (b.t === "dashmini") {
      const d = DASHES.find(x => x.id === b.id);
      return el("div", "block", `<p class="muted">這章的工作表最後會組成「${esc(d.n)}」儀表板（第 11 章）：</p>${dashPreview(d)}`);
    }
    if (b.t === "dashplan") {
      const wrap = el("div", "block");
      DASHES.slice(1).forEach((d, i) => {
        const blk = el("div", "block", `<h4>11-${i + 2}　${esc(d.n)}（大小：固定 ${esc(d.size)}）</h4>${dashPreview(d)}`);
        const text = (function find(z) { if (z.t === "text") return z.lines; for (const c of (z.c || [])) { const r = find(c); if (r) return r; } return null; })(d.zones);
        const lines = [];
        if (d.link.length) lines.push(`<b>用作篩選器：</b>${d.link.map(esc).join("、")}`);
        if (PLAN_NOTE[d.id]) lines.push(PLAN_NOTE[d.id]);
        blk.appendChild(el("div", "prose", `<ul>${lines.map(l => `<li>${l}</li>`).join("")}</ul>`));
        if (text) blk.appendChild(renderBlock({ t: "textbox", title: `${d.n}的${d.id === "dq" ? "指標定義" : "名單說明"}（貼進文字物件）`, lines: text }, []));
        wrap.appendChild(blk);
      });
      return wrap;
    }
    if (b.t === "faq") {
      return el("div", "block", FAQ.map((f, i) => `<div class="def"><b class="term" style="font-size:1.05rem">問題 ${i + 1}：${esc(f[0])}</b><p><b>原因：</b>${f[1]}</p><p><b>解法：</b>${f[2]}</p></div>`).join(""));
    }
    return el("div");
  }

  function renderTOC(curId) {
    let h = "", grp = "";
    CH.forEach(c => {
      if (c.grp !== grp) { grp = c.grp; h += `<div class="grp">${esc(grp)}</div>`; }
      h += `<a href="#${c.id}" class="${c.id === curId ? "on" : ""}"${c.id === curId ? ' aria-current="page"' : ""}><span class="no">${c.no}</span><span>${esc(c.nav)}</span><span class="ck">${store.done[c.id] ? "✓" : ""}</span></a>`;
    });
    toc.innerHTML = h;
  }
  function render(ch) {
    main.innerHTML = "";
    activeStepper = null;
    main.appendChild(el("div", "ch-head", `<span class="eyebrow">${ch.no === 0 ? "開始之前" : "第 " + ch.no + " 章"}</span><h2>${esc(ch.title)}</h2>${ch.lead ? `<p class="muted">${ch.lead}</p>` : ""}`));
    const mounts = [];
    ch.blocks().forEach(b => main.appendChild(renderBlock(b, mounts)));
    const i = CH.indexOf(ch), prev = CH[i - 1], next = CH[i + 1];
    const foot = el("div", "ch-foot", `<label class="donebox"><input type="checkbox" id="done-${ch.id}"${store.done[ch.id] ? " checked" : ""}> 這章做完了</label><span class="spacer"></span>` +
      (prev ? `<a class="btn" href="#${prev.id}">← ${esc(prev.nav)}</a>` : "") + (next ? `<a class="btn primary" href="#${next.id}">${esc(next.nav)} →</a>` : ""));
    foot.querySelector("input").addEventListener("change", e => { store.done[ch.id] = e.target.checked; save(); renderTOC(ch.id); });
    main.appendChild(foot);
    mounts.forEach(fn => fn());
    renderTOC(ch.id);
  }
  function route(scroll) {
    const id = (location.hash || "").slice(1);
    const ch = CH.find(c => c.id === id) || CH[0];
    render(ch);
    if (scroll) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", () => route(true));
  document.addEventListener("keydown", e => {
    if (!activeStepper || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "ArrowRight") activeStepper.next();
    if (e.key === "ArrowLeft") activeStepper.prev();
  });
  route(false);
})();
