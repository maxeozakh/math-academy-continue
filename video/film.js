// The before / after film. Loaded by film.html, which holds the real prototype twice, once per pane.
// Every frame is a pure function of film time: frame(t) rebuilds each pane's state (variant, step, answers, scroll)
// and the cursors from the scripts below, so frames can be rendered in any order and on any number of workers.
//   film.html          a still at t = 0     film.html?t=4   a still at 4 s     film.html?play   real-time preview
(() => {
  const SCALE = 1.2, DUR = 10;
  const clamp = u => u < 0 ? 0 : u > 1 ? 1 : u;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const ease = u => { u = clamp(u); return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
  const easeOut = u => 1 - Math.pow(1 - clamp(u), 3);
  const el = id => document.getElementById(id);

  const mv = (from, to, target) => ({ type: 'move', from, to, target });
  const ck = (at, action) => ({ type: 'click', at, action });
  const ty = (from, to, field, text) => ({ type: 'type', from, to, field, text });
  const fl = (from, to, n) => ({ type: 'flick', from, to, n });

  const PARTS = [
    { from: 0, variant: 'top', tag: 'Proposal A', title: 'Continue next to the progress bar' },
    { from: DUR / 3, variant: 'footer', tag: 'Proposal B', title: 'Continue in a sticky footer' },
    { from: DUR * 2 / 3, variant: 'dock', tag: 'Proposal C', title: 'Continue floats until the content ends' },
  ];
  const partAt = t => PARTS.reduce((p, q) => (t >= q.from ? q : p), PARTS[0]);

  // Same chapters on both sides: long lesson, typed answers, short lesson, multiple choice, long lesson...
  const SCRIPTS = {
    left: {
      variantAt: () => 'original',
      events: [
        mv(.2, .6, 'read'), fl(.65, 2.45, 3), mv(2.5, 2.9, 'action'), ck(3.0, 'act'),
        mv(3.15, 3.5, 'x1'), ck(3.55, 'focus:x1'), ty(3.6, 3.8, 'x1', '-1'), mv(3.85, 4.05, 'x2'), ck(4.1, 'focus:x2'), ty(4.15, 4.25, 'x2', '5'),
        mv(4.3, 4.6, 'action'), ck(4.7, 'act'), fl(4.8, 5.3, 1), mv(5.35, 5.7, 'action'), ck(5.8, 'act'),
        mv(5.95, 6.3, 'action'), ck(6.4, 'act'),
        mv(6.55, 6.9, 'choice1'), ck(7.0, 'choose:1'), mv(7.05, 7.4, 'action'), ck(7.5, 'act'), fl(7.6, 8.1, 1), mv(8.15, 8.5, 'action'), ck(8.6, 'act'),
        mv(8.75, 9.1, 'read'), fl(9.15, 11, 3),
      ],
    },
    right: {
      variantAt: t => partAt(t).variant,
      events: [
        mv(.25, .6, 'action'), ck(.7, 'act'),
        mv(.85, 1.2, 'x1'), ck(1.25, 'focus:x1'), ty(1.3, 1.5, 'x1', '-1'), mv(1.55, 1.75, 'x2'), ck(1.8, 'focus:x2'), ty(1.85, 1.95, 'x2', '5'),
        mv(2.0, 2.35, 'action'), ck(2.45, 'act'), ck(2.95, 'act'),
        mv(3.45, 3.85, 'action'), ck(3.95, 'act'),
        mv(4.05, 4.4, 'choice1'), ck(4.5, 'choose:1'), mv(4.6, 4.95, 'action'), ck(5.05, 'act'), ck(5.5, 'act'),
        mv(6.75, 7.05, 'action'), ck(7.15, 'act'),
        mv(7.3, 7.6, 'x1'), ck(7.65, 'focus:x1'), ty(7.7, 7.85, 'x1', '-1'), mv(7.9, 8.05, 'x2'), ck(8.1, 'focus:x2'), ty(8.15, 8.22, 'x2', '5'),
        mv(8.3, 8.6, 'action'), ck(8.7, 'act'), mv(8.8, 9.1, 'action'), ck(9.2, 'act'),
        mv(9.3, 9.6, 'action'), ck(9.7, 'act'),
      ],
    },
  };
  const start = e => e.at ?? e.from;
  for (const s of Object.values(SCRIPTS)) s.events.sort((a, b) => start(a) - start(b));

  const panes = ['left', 'right'].map(id => {
    const frame = el(id);
    return { id, frame, box: frame.parentElement, script: SCRIPTS[id], cur: el(id[0] + 'cur'), ring: el(id[0] + 'ring'), shown: {} };
  });
  const isQuestion = step => step % 2 === 1;

  function stateAt(p, t) {
    const s = { variant: p.script.variantAt(t), step: 0, answer: {}, submitted: false, focus: null, scroll: 0 };
    for (const e of p.script.events) {
      if (start(e) > t) break;
      if (e.type === 'click') {
        const [kind, arg] = e.action.split(':');
        if (kind === 'focus') s.focus = arg;
        else if (kind === 'choose') s.answer = { ...s.answer, choice: +arg };
        else if (isQuestion(s.step) && !s.submitted) { s.submitted = true; s.focus = null; }
        else Object.assign(s, { step: s.step + 1, answer: {}, submitted: false, focus: null, scroll: 0 });
      } else if (e.type === 'type') {
        const n = t >= e.to ? e.text.length : Math.min(e.text.length, Math.floor(seg(t, e.from, e.to) * e.text.length) + 1);
        s.answer = { ...s.answer, [e.field]: e.text.slice(0, n) };
      } else if (e.type === 'flick' && e.max !== undefined) {
        const s0 = s.scroll, span = (e.to - e.from) / e.n, i = Math.min(e.n - 1, Math.floor((t - e.from) / span));
        const w = t >= e.to ? 1 : easeOut(seg(t - e.from - i * span, 0, span * .75));
        s.scroll = s0 + (e.max - s0) * Math.min(1, (i + w) / e.n);
      }
    }
    return s;
  }

  function apply(p, s) {
    const w = p.frame.contentWindow, L = w.lesson, sh = p.shown;
    if (sh.variant !== s.variant) { L.setVariant(s.variant); sh.variant = s.variant; }
    if (sh.step !== s.step) { L.go(s.step); sh.step = s.step; }
    L.setAnswer(s.answer, s.submitted, s.focus);
    w.scrollTo(0, s.scroll);
    L.updateDock();
  }

  function origin(p) {
    let x = 0, y = 0, n = p.box;
    while (n && n !== document.body) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y };
  }
  const ACTION = { top: '.top-continue', footer: '.sticky-footer .btn', dock: '.footer-inline .btn' };
  // where each named target is on screen in the pane's current state; the cursor tip lands off-centre so it doesn't cover labels
  function locate(p, s, name) {
    const doc = p.frame.contentDocument, o = origin(p);
    const at = (sel, fx = .8, fy = .68) => {
      const r = doc.querySelector(sel).getBoundingClientRect();
      return { x: o.x + (r.left + r.width * fx) * SCALE, y: o.y + (r.top + r.height * fy) * SCALE };
    };
    if (name === 'read') { const c = at('.card', .62, 0); return { x: c.x, y: o.y + 470 }; }
    if (name === 'x1' || name === 'x2') return at(`.field[data-field="${name}"]`, .88, .8);
    if (name.startsWith('choice')) return at(`.choice[data-choice="${name.slice(6)}"] .badge`, .7, .7);
    if (s.variant === 'original') return at(isQuestion(s.step) && !s.submitted ? '.card-submit' : '.footer-inline .btn');
    return at(ACTION[s.variant]);
  }

  const loaded = Promise.all(panes.map(p => new Promise(r => {
    const ok = () => p.frame.contentWindow.lesson && p.frame.contentDocument.readyState === 'complete';
    if (ok()) r(); else p.frame.addEventListener('load', () => r(), { once: true });
  })));

  // Resolve every flick's end and every move's target once, in time order, so frames don't depend on each other.
  async function prepare() {
    await loaded;
    // fonts are fetched the first time a glyph is used, so show every step type before measuring
    for (const p of panes) for (let st = 0; st < 4; st++) { p.frame.contentWindow.lesson.go(st); p.frame.contentWindow.lesson.setAnswer({}, true); }
    await Promise.all(panes.map(p => p.frame.contentDocument.fonts.ready));
    for (const p of panes) {
      p.shown = {};
      for (const e of p.script.events) {
        if (e.type === 'flick') {
          const s = stateAt(p, e.from - 1e-6); apply(p, s);
          const d = p.frame.contentDocument.documentElement;
          e.max = Math.max(s.scroll, d.scrollHeight - p.frame.contentWindow.innerHeight);
        } else if (e.type === 'move') {
          const s = stateAt(p, e.to); apply(p, s);
          e.pt = locate(p, s, e.target);
        }
      }
      p.moves = p.script.events.filter(e => e.type === 'move');
      p.clicks = p.script.events.filter(e => e.type === 'click').map(e => e.at);
      const o = origin(p); p.rest = { x: o.x + 450, y: o.y + 560 };
    }
  }

  function stroke(a, b, u) {
    u = ease(u);
    const dx = b.x - a.x, dy = b.y - a.y, bow = Math.sin(Math.PI * u) * .08;
    return { x: a.x + dx * u - dy * bow, y: a.y + dy * u + dx * bow };
  }
  function cursorAt(p, t) {
    let pos = p.rest;
    for (const m of p.moves) {
      if (t >= m.to) { pos = m.pt; continue; }
      if (t > m.from) pos = stroke(pos, m.pt, seg(t, m.from, m.to));
      break;
    }
    return pos;
  }
  function drawCursor(p, t) {
    const pos = cursorAt(p, t);
    const press = p.clicks.some(c => t >= c - .07 && t < c + .11);
    p.cur.style.transform = `translate(${(pos.x - 3).toFixed(2)}px,${(pos.y - 2).toFixed(2)}px) scale(${press ? .86 : 1})`;
    const c = p.clicks.findLast(c => t >= c && t < c + .45);
    if (c === undefined) { p.ring.style.display = 'none'; return; }
    const rg = (t - c) / .45, r = 6 + 22 * easeOut(rg);
    Object.assign(p.ring.style, { display: 'block', width: 2 * r + 'px', height: 2 * r + 'px', opacity: .7 * (1 - rg),
      transform: `translate(${pos.x - r}px,${pos.y - r}px)` });
  }
  function frame(t) {
    t = Math.max(0, Math.min(t, DUR));
    for (const p of panes) {
      const s = stateAt(p, t);
      apply(p, s);
      drawCursor(p, t);
    }
    const part = partAt(t);
    el('rtag').textContent = part.tag; el('rtitle').textContent = part.title;
    const cap = part.from === 0 ? 1 : ease(seg(t, part.from, part.from + .3));
    el('rtag').style.opacity = el('rtitle').style.opacity = cap;
  }

  const ready = prepare().then(() => frame(0));
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
