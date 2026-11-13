// The before / after film. Loaded by film.html, which holds the real prototype twice, once per pane.
// Every frame is a pure function of film time: frame(t) sets both panes (variant, step, scroll), the cursors,
// the captions and the counters from t alone, so frames can be rendered in any order and on any number of workers.
//   film.html          a still at t = 0     film.html?t=12   a still at 12 s     film.html?play   real-time preview
(() => {
  const SCALE = 1.2;
  const clamp = u => u < 0 ? 0 : u > 1 ? 1 : u;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const ease = u => { u = clamp(u); return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
  const easeOut = u => 1 - Math.pow(1 - clamp(u), 3);
  const lerp = (a, b, u) => a + (b - a) * u;
  const el = id => document.getElementById(id);

  const ACTS = [
    { variant: 'top', tag: 'Proposal A', title: 'Continue next to the progress bar', step: 0 },
    { variant: 'footer', tag: 'Proposal B', title: 'Continue in a sticky footer', step: 2 },
    { variant: 'dock', tag: 'Proposal C', title: 'Continue floats until the content ends', step: 4 },
  ];
  const INTRO = 2.4, ACT = 7.6, OUTRO = 3.2;
  const DUR = INTRO + ACTS.length * ACT + OUTRO;

  // act-local times
  const GO = .7;                                 // both students start reaching for Continue
  const L_TO_CARD = [GO, 1.25], FLICKS = [1.35, 4.35], L_TO_BTN = [4.45, 5.05], L_CLICK = 5.15;
  const R_TO_BTN = [GO, 1.4], R_CLICK = 1.5;
  const NFLICK = 4;

  const panes = ['left', 'right'].map(id => {
    const frame = el(id), box = frame.parentElement;
    return { id, frame, box, cur: el(id[0] + 'cur'), ring: el(id[0] + 'ring'), stats: el(id[0] + 'stats'), shown: {} };
  });

  const loaded = Promise.all(panes.map(p => new Promise(r => {
    const ok = () => p.frame.contentWindow.lesson && p.frame.contentDocument.readyState === 'complete';
    if (ok()) r(); else p.frame.addEventListener('load', () => r(), { once: true });
  })));

  function origin(p) {
    let x = 0, y = 0, n = p.box;
    while (n && n !== document.body) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y };
  }
  function set(p, variant, step, scroll) {
    const w = p.frame.contentWindow, L = w.lesson, s = p.shown;
    if (s.variant !== variant) { L.setVariant(variant); s.variant = variant; }
    if (s.step !== step) { L.go(step); s.step = step; }
    w.scrollTo(0, scroll);
    L.updateDock();
  }
  function maxScroll(p) {
    const d = p.frame.contentDocument.documentElement;
    return d.scrollHeight - p.frame.contentWindow.innerHeight;
  }
  // the cursor tip lands on the lower right of a button so it doesn't cover the label
  function target(p, sel) {
    const r = p.frame.contentDocument.querySelector(sel).getBoundingClientRect(), o = origin(p);
    return { x: o.x + (r.left + r.width * .8) * SCALE, y: o.y + (r.top + r.height * .68) * SCALE };
  }
  const RIGHT_BTN = { top: '.top-continue', footer: '.sticky-footer .btn', dock: '.footer-inline .btn' };

  // ---- measure every place a cursor will go, once, so frames don't depend on each other
  const M = [];
  async function measure() {
    await loaded;
    const [L, R] = panes;
    for (const a of ACTS) {
      set(L, 'original', a.step, 0);
      const max = maxScroll(L);
      const o = origin(L), card = L.frame.contentDocument.querySelector('.card').getBoundingClientRect();
      const read = { x: o.x + (card.left + card.width * .62) * SCALE, y: o.y + 470 };
      set(L, 'original', a.step, max);
      const lbtn = target(L, '.footer-inline .btn');
      set(R, a.variant, a.step, 0);
      const rbtn = target(R, RIGHT_BTN[a.variant]);
      M.push({ max, read, lbtn, rbtn });
    }
    // fonts are fetched the first time a glyph is used, so walk every step before the first frame
    for (const p of panes) for (let s = 0; s < 6; s++) set(p, 'original', s, 0);
    await Promise.all(panes.map(p => p.frame.contentDocument.fonts.ready));
    panes.forEach(p => { p.shown = {}; });
  }

  // a stroke from a to b, slightly curved, eased in and out
  function stroke(a, b, u) {
    u = ease(u);
    const dx = b.x - a.x, dy = b.y - a.y, bow = Math.sin(Math.PI * u) * .08;
    return { x: a.x + dx * u - dy * bow, y: a.y + dy * u + dx * bow };
  }
  function restOf(p) { const o = origin(p); return { x: o.x + 450, y: o.y + 560 }; }

  function placeCursor(p, pos, clickAt, t) {
    const press = clickAt !== null && t >= clickAt - .07 && t < clickAt + .11;
    p.cur.style.transform = `translate(${(pos.x - 3).toFixed(2)}px,${(pos.y - 2).toFixed(2)}px) scale(${press ? .86 : 1})`;
    const rg = clickAt !== null && t >= clickAt && t < clickAt + .45 ? (t - clickAt) / .45 : null;
    if (rg === null) { p.ring.style.display = 'none'; return; }
    const r = 6 + 22 * easeOut(rg);
    Object.assign(p.ring.style, { display: 'block', width: 2 * r + 'px', height: 2 * r + 'px', opacity: .7 * (1 - rg),
      transform: `translate(${pos.x - r}px,${pos.y - r}px)` });
  }
  function stats(p, secs, px, done, slow) {
    const [time, scr] = p.stats.querySelectorAll('span');
    time.querySelector('b').textContent = secs.toFixed(1) + ' s';
    scr.querySelector('b').textContent = Math.round(px).toLocaleString('en-US') + ' px';
    time.className = 'time' + (done ? (slow ? ' slow' : ' done') : '');
    scr.className = 'px' + (done && slow ? ' slow' : px === 0 && done ? ' done' : '');
  }

  function frame(t) {
    t = Math.max(0, Math.min(t, DUR));
    const [L, R] = panes;
    const k = Math.max(0, Math.min(ACTS.length - 1, Math.floor((t - INTRO) / ACT)));
    const a = ACTS[k], m = M[k], u = t - INTRO - k * ACT;   // u < 0 during the intro
    const prev = k > 0 ? M[k - 1] : null;

    el('intro').style.opacity = 1 - ease(seg(t, INTRO - .7, INTRO - .1));
    el('intro').style.display = t < INTRO - .1 ? 'flex' : 'none';
    const out = ease(seg(t, DUR - OUTRO, DUR - OUTRO + .6));
    el('outro').style.opacity = out; el('outro').style.display = out > 0 ? 'flex' : 'none';

    el('rtag').textContent = a.tag; el('rtitle').textContent = a.title;
    const cap = k === 0 ? 1 : ease(seg(u, 0, .4));
    el('rtag').style.opacity = el('rtitle').style.opacity = cap;

    // left: scroll the whole lesson in a few wheel flicks, then reach the button under it
    let lscroll = 0;
    if (u >= FLICKS[0]) {
      const span = (FLICKS[1] - FLICKS[0]) / NFLICK, i = Math.min(NFLICK - 1, Math.floor((u - FLICKS[0]) / span));
      const w = easeOut(seg(u - FLICKS[0] - i * span, 0, span * .75));
      lscroll = m.max * (i + w) / NFLICK;
    }
    const ldone = u >= L_CLICK;
    set(L, 'original', a.step + (ldone ? 1 : 0), ldone ? 0 : lscroll);
    const lstart = prev ? prev.lbtn : restOf(L);
    let lp = lstart;
    if (u >= L_TO_CARD[0]) lp = stroke(lstart, m.read, seg(u, ...L_TO_CARD));
    if (u >= L_TO_BTN[0]) lp = stroke(m.read, m.lbtn, seg(u, ...L_TO_BTN));
    placeCursor(L, lp, L_CLICK + INTRO + k * ACT, t);
    stats(L, Math.max(0, Math.min(u, L_CLICK) - GO), ldone ? m.max : lscroll, ldone, true);

    // right: the button is already on screen
    const rdone = u >= R_CLICK;
    set(R, a.variant, a.step + (rdone ? 1 : 0), 0);
    const rstart = prev ? prev.rbtn : restOf(R);
    const rp = u >= R_TO_BTN[0] ? stroke(rstart, m.rbtn, seg(u, ...R_TO_BTN)) : rstart;
    placeCursor(R, rp, R_CLICK + INTRO + k * ACT, t);
    stats(R, Math.max(0, Math.min(u, R_CLICK) - GO), 0, rdone, false);
  }

  const ready = measure().then(() => frame(0));
  window.__film = { dur: DUR, frame, ready };

  const q = new URLSearchParams(location.search);
  ready.then(() => {
    if (q.has('play')) {
      const t0 = performance.now();
      const tick = () => { frame(((performance.now() - t0) / 1000) % DUR); requestAnimationFrame(tick); };
      tick();
    } else if (q.has('t')) frame(+q.get('t'));
  });
})();
