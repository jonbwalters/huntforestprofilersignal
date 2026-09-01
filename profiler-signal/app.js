/* Profiler Signal site — shared chart engine. Expects data.js (PROF_DATA).
   Axis model: every chart is drawn over an array of day strings (AX).
   - default AX = the production days present in the data (compact axis)
   - o.calendar = true uses every calendar day in the range, so the mill's
     dark days occupy real width and can be shaded (o.showFree). */
const D = PROF_DATA;
const DAYS = D.days, N = DAYS.length;
const CH = D.channels;
const CHCOL = ['--ch1', '--ch2', '--ch3', '--ch4'];
const CHNAME = {'oli_rmc_LeftPrflr1InfdRoll': 'Left P1', 'oli_rmc_LeftPrflr2InfdRoll': 'Left P2',
                'oli_rmc_RightPrflr1InfdRoll': 'Right P1', 'oli_rmc_RightPrflr2InfdRoll': 'Right P2'};
const DIX = new Map(DAYS.map((d, i) => [d, i]));      // day -> index in the series
const NONPROD = new Set(D.nonprod || []);              // scheduled dark days

function idxOf(dstr){
  let lo = 0, hi = N - 1, r = N - 1;
  while (lo <= hi){ const m = (lo + hi) >> 1; if (DAYS[m] >= dstr){ r = m; hi = m - 1 } else lo = m + 1 }
  return r;
}
function usd(v){ return '$' + Math.round(v).toLocaleString('en-US'); }
function fmtD(d){ return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}); }
function addDays(dstr, n){ const t = new Date(dstr + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10); }
function clampDay(dstr){ return dstr < DAYS[0] ? DAYS[0] : (dstr > DAYS[N - 1] ? DAYS[N - 1] : dstr); }
function calendarRange(d0, d1){ const out = []; let d = d0; while (d <= d1){ out.push(d); d = addDays(d, 1) } return out; }

/* evidence within [d0, d1] inclusive, merged + sorted */
function evidenceIn(d0, d1){
  const out = [];
  for (const e of D.stops)  if (e.day >= d0 && e.day <= d1) out.push({day: e.day, src: 'stop',   text: e.text});
  for (const e of D.wos)    if (e.day >= d0 && e.day <= d1) out.push({day: e.day, src: 'wo',     text: e.text});
  for (const e of D.ledger) if (e.day >= d0 && e.day <= d1) out.push({day: e.day, src: 'ledger', text: e.text});
  return out.sort((a, b) => a.day < b.day ? -1 : 1);
}

/* consecutive runs of scheduled dark days inside [d0,d1] */
function darkRuns(d0, d1){
  const runs = []; let cur = null;
  for (const d of calendarRange(d0, d1)){
    if (NONPROD.has(d)){ if (cur) cur.push(d); else cur = [d]; }
    else if (cur){ runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs;
}
/* production days inside [d0,d1] (used for the handover count) */
function prodDays(d0, d1){
  return calendarRange(d0, d1).filter(d => DIX.has(d) && !NONPROD.has(d)).length;
}

function makeAxis(o){
  return o.calendar ? calendarRange(DAYS[o.i0], DAYS[o.i1]) : DAYS.slice(o.i0, o.i1 + 1);
}
function hatch(id){
  return `<defs><pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="5" height="5" fill="var(--paper3)"/>
    <line x1="0" y1="0" x2="0" y2="5" stroke="var(--rule2)" stroke-width="1.1"/></pattern></defs>`;
}

/* ---------- signal chart ---------- */
function drawSignal(el, o){
  o = Object.assign({i0: 0, i1: N - 1, h: 340, lanes: true, focus: null, animate: false,
                     clamp: 12, links: false, calendar: false, showFree: false}, o || {});
  const AX = makeAxis(o), n = AX.length;
  const XP = new Map(AX.map((d, i) => [d, i]));
  const xp = d => {
    if (XP.has(d)) return XP.get(d);
    let lo = 0, hi = n - 1, r = n - 1;
    while (lo <= hi){ const m = (lo + hi) >> 1; if (AX[m] >= d){ r = m; hi = m - 1 } else lo = m + 1 }
    return r;
  };
  const W = 1120, H = o.h, ML = 46, MR = 14, MT = o.lanes ? 48 : 18, MB = 30;
  const iw = W - ML - MR, ih = H - MT - MB, YMAX = o.clamp, YMIN = -o.clamp;
  const X = k => ML + iw * k / (n - 1);
  const Y = v => MT + ih * (1 - (Math.max(YMIN, Math.min(YMAX, v)) - YMIN) / (YMAX - YMIN));
  const slot = iw / (n - 1);
  const S = [];
  S.push(`<svg viewBox="0 0 ${W} ${H}" class="${o.animate ? 'drawline' : ''}" role="img" aria-label="profiler channel deviation scores">`);
  S.push(hatch('dark'));
  S.push(`<rect x="${ML}" y="${Y(3)}" width="${iw}" height="${Y(-3) - Y(3)}" fill="var(--band)"/>`);

  // scheduled dark days — the free repair windows
  if (o.showFree)
    for (const run of darkRuns(AX[0], AX[n - 1])){
      const a = X(xp(run[0])) - slot / 2, b = X(xp(run[run.length - 1])) + slot / 2;
      S.push(`<rect x="${a}" y="${MT}" width="${Math.max(2.5, b - a)}" height="${ih}" fill="url(#dark)"/>`);
      if (run.length >= 3)
        S.push(`<text x="${(a + b) / 2}" y="${MT + ih - 7}" font-size="9" fill="var(--muted)" text-anchor="middle" font-family="DM Mono,monospace">${run.length}d</text>`);
    }

  // episode windows
  for (const ep of D.episodes){
    if (ep.closed < AX[0] || ep.fired > AX[n - 1]) continue;
    const dim = (o.focus !== null && ep.n !== o.focus);
    const a = X(xp(ep.fired < AX[0] ? AX[0] : ep.fired));
    const b = X(xp(ep.closed > AX[n - 1] ? AX[n - 1] : ep.closed));
    S.push(`<rect x="${a}" y="${MT - 4}" width="${Math.max(5, b - a)}" height="${ih + 4}" fill="var(${ep.verdict === 'hit' ? '--amber-dim' : '--miss'})" opacity="${dim ? .45 : 1}"/>`);
    if (ep.fired >= AX[0] && ep.fired <= AX[n - 1]){
      const dash = ep.rule_met === false ? ' stroke-dasharray="4 4"' : '';
      const mk = `<line x1="${a}" x2="${a}" y1="${MT - 4}" y2="${MT + ih}" stroke="var(--amber)" stroke-width="1.6"${dash} opacity="${dim ? .4 : .95}"/>` +
                 `<text x="${a + 5}" y="${MT + 13}" font-size="11.5" font-weight="700" fill="var(--amber)" font-family="Manrope,sans-serif" opacity="${dim ? .55 : 1}">${ep.mark || ep.n}</text>`;
      S.push(o.links ? `<a href="episode.html#${ep.n}">${mk}<rect x="${a - 8}" y="${MT - 4}" width="20" height="${ih}" fill="transparent"><title>Event ${ep.n} — open</title></rect></a>` : mk);
    }
  }
  // grid + y labels
  for (const v of [-12, -6, -3, 0, 3, 6, 12]){
    if (Math.abs(v) > YMAX) continue;
    S.push(`<line x1="${ML}" x2="${W - MR}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/>`);
    S.push(`<text x="${ML - 7}" y="${Y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)" font-family="DM Mono,monospace">${v}</text>`);
  }
  // x ticks
  if (n <= 150){
    for (let k = 0; k < n; k++)
      if (new Date(AX[k] + 'T00:00:00Z').getUTCDay() === 1){
        S.push(`<line x1="${X(k)}" x2="${X(k)}" y1="${MT + ih}" y2="${MT + ih + 4}" stroke="var(--axis)"/>`);
        S.push(`<text x="${X(k)}" y="${H - 9}" font-size="10" fill="var(--muted)" font-family="DM Mono,monospace" text-anchor="middle">${AX[k].slice(5)}</text>`);
      }
  } else {
    let lastM = '';
    for (let k = 0; k < n; k++){
      const m = AX[k].slice(0, 7);
      if (m !== lastM){ lastM = m;
        S.push(`<line x1="${X(k)}" x2="${X(k)}" y1="${MT + ih}" y2="${MT + ih + 4}" stroke="var(--axis)"/>`);
        if (['01', '04', '07', '10'].includes(m.slice(5)))
          S.push(`<text x="${X(k)}" y="${H - 9}" font-size="10.5" fill="var(--muted)" font-family="DM Mono,monospace">${m}</text>`);
      }
    }
  }
  // channel traces
  CH.forEach((c, j) => {
    let path = '', pen = false; const s = D.series[c];
    for (let k = 0; k < n; k++){
      const i = DIX.get(AX[k]);
      const v = (i === undefined) ? null : s[i];
      if (v === null || v === undefined){ pen = false; continue }
      path += (pen ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true;
    }
    S.push(`<path class="tr" d="${path}" fill="none" stroke="var(${CHCOL[j]})" stroke-width="1.7" opacity="0.92"/>`);
    for (let k = 0; k < n; k++){
      const i = DIX.get(AX[k]); if (i === undefined) continue;
      const v = s[i];
      if (v !== null && v > YMAX) S.push(`<text x="${X(k)}" y="${MT + 10}" font-size="9.5" fill="var(${CHCOL[j]})" text-anchor="middle">▲</text>`);
      if (v !== null && v < YMIN) S.push(`<text x="${X(k)}" y="${MT + ih - 3}" font-size="9.5" fill="var(${CHCOL[j]})" text-anchor="middle">▼</text>`);
    }
  });
  // evidence lanes
  if (o.lanes){
    const LN = [['stops', '--red', 16], ['wos', '--wo', 27], ['ledger', '--ledger', 38]];
    for (const [key, col, yy] of LN)
      for (const e of D[key]){
        if (e.day < AX[0] || e.day > AX[n - 1]) continue;
        S.push(`<rect x="${X(xp(e.day)) - 2}" y="${yy - 5}" width="4" height="8" rx="2" fill="var(${col})"/>`);
      }
    S.push(`<text x="${ML}" y="8" font-size="9.5" fill="var(--muted)" font-family="DM Mono,monospace">mill records · stops / work orders / ledger</text>`);
  }
  S.push(`<line x1="${ML}" x2="${W - MR}" y1="${MT + ih}" y2="${MT + ih}" stroke="var(--axis)"/>`);
  S.push('</svg>');
  el.innerHTML = S.join('');
  attachTip(el, AX, ML, iw);
}

function attachTip(el, AX, ML, iw){
  const n = AX.length;
  const tip = document.createElement('div'); tip.className = 'tip'; el.appendChild(tip);
  const svg = el.querySelector('svg');
  svg.addEventListener('mousemove', ev => {
    const r = svg.getBoundingClientRect();
    const fx = (ev.clientX - r.left) / r.width * 1120;
    let k = Math.round((fx - ML) / iw * (n - 1));
    k = Math.max(0, Math.min(n - 1, k));
    const d = AX[k], i = DIX.get(d);
    const zz = (i === undefined) ? [] : CH.map((c, j) => {
      const v = D.series[c][i];
      return v === null || v === undefined ? null :
        `<span style="color:var(${CHCOL[j]})">${CHNAME[c]}</span> <b class="mono">${v}</b>`;
    }).filter(Boolean);
    const near = evidenceIn(addDays(d, -1), addDays(d, 1))
      .map(e => `<div class="ev"><span class="src ${e.src}">${e.src}</span> ${e.text.slice(0, 110)}</div>`);
    tip.style.display = 'block';
    tip.style.left = Math.min(el.clientWidth - 370, Math.max(0, (ev.clientX - r.left) + 14)) + 'px';
    tip.style.top = (ev.clientY - r.top + 16) + 'px';
    tip.innerHTML = `<div class="d">${d}</div>` +
      (zz.length ? `<div style="margin-top:3px">${zz.join(' · ')}</div>`
        : `<div style="margin-top:3px">${NONPROD.has(d) ? 'scheduled downtime — mill dark' : 'no production data'}</div>`) +
      near.slice(0, 4).join('');
  });
  svg.addEventListener('mouseleave', () => tip.style.display = 'none');
}

/* ---------- costed-downtime bars ---------- */
function drawDowntime(el, o){
  o = Object.assign({i0: 0, i1: N - 1, h: 150, calendar: false, showFree: false}, o || {});
  const AX = makeAxis(o), n = AX.length;
  const XP = new Map(AX.map((d, i) => [d, i]));
  const W = 1120, H = o.h, ML = 46, MR = 14, MT = 14, MB = 26;
  const iw = W - ML - MR, ih = H - MT - MB;
  const byDay = {};
  for (const s of D.all_stops){
    if (s.day < AX[0] || s.day > AX[n - 1]) continue;
    (byDay[s.day] = byDay[s.day] || {tot: 0, prof: 0, items: []});
    byDay[s.day].tot += s.cost; if (s.prof) byDay[s.day].prof += s.cost;
    byDay[s.day].items.push(s);
  }
  const max = Math.max(20000, ...Object.values(byDay).map(v => v.tot));
  const X = k => ML + iw * k / (n - 1);
  const slot = iw / (n - 1), bw = Math.max(2.5, slot * 0.66);
  const Y = v => MT + ih * (1 - v / max);
  const S = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="costed downtime per day">`];
  S.push(hatch('dark2'));
  if (o.showFree)
    for (const run of darkRuns(AX[0], AX[n - 1])){
      const a = X(XP.get(run[0])) - slot / 2, b = X(XP.get(run[run.length - 1])) + slot / 2;
      S.push(`<rect x="${a}" y="${MT}" width="${Math.max(2.5, b - a)}" height="${ih}" fill="url(#dark2)"/>`);
    }
  for (const f of [0.5, 1]){
    S.push(`<line x1="${ML}" x2="${W - MR}" y1="${Y(max * f)}" y2="${Y(max * f)}" stroke="var(--grid)"/>`);
    S.push(`<text x="${ML - 7}" y="${Y(max * f) + 4}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="DM Mono,monospace">${Math.round(max * f / 1000)}k</text>`);
  }
  for (const [day, v] of Object.entries(byDay)){
    const k = XP.get(day); if (k === undefined) continue;
    const names = v.items.map(s => `${s.id} ${s.ll || ''} ${usd(s.cost)}`).join('\n');
    S.push(`<g><title>${day}\n${names}</title>` +
      `<rect x="${X(k) - bw / 2}" y="${Y(v.tot)}" width="${bw}" height="${MT + ih - Y(v.tot)}" fill="var(--bar)" rx="1.5"/>` +
      (v.prof ? `<rect x="${X(k) - bw / 2}" y="${Y(v.prof)}" width="${bw}" height="${MT + ih - Y(v.prof)}" fill="var(--red)" rx="1.5"/>` : '') + `</g>`);
  }
  for (const ep of D.episodes){
    const k = XP.get(ep.fired); if (k === undefined) continue;
    S.push(`<line x1="${X(k)}" x2="${X(k)}" y1="${MT}" y2="${MT + ih}" stroke="var(--amber)" stroke-width="1.2" opacity=".7"/>`);
  }
  S.push(`<line x1="${ML}" x2="${W - MR}" y1="${MT + ih}" y2="${MT + ih}" stroke="var(--axis)"/>`);
  S.push('</svg>');
  el.innerHTML = S.join('');
}

/* ---------- scroll reveal + count-up ---------- */
function initMotion(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches){
    document.querySelectorAll('.rv').forEach(e => e.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
  }), {threshold: 0.12});
  document.querySelectorAll('.rv').forEach(e => io.observe(e));
  document.querySelectorAll('[data-count]').forEach(e => {
    const end = +e.dataset.count, t0 = performance.now(), dur = 900;
    const step = t => {
      const p = Math.min(1, (t - t0) / dur);
      e.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
