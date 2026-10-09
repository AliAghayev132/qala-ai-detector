// QALA AI Detection Engine — core logic (pure functions, shared by the demo UI and this node test)
// Everything here is a self-contained simulation: "attacker" profiles are abstract
// statistical event generators that drive QALA's own demo app, used to exercise the detector.
// No real browsers, no real sites, no evasion tooling for production anti-bot systems.

'use strict';

// --- deterministic PRNG so benchmark numbers are stable ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
function gauss(rnd, mean, sd) {
  const u = 1 - rnd(), v = rnd();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// The demo app has 5 real screens a user can reach, plus 1 hidden honeypot screen.
const REAL_SCREENS = ['dashboard', 'invoices', 'customers', 'reports', 'settings'];
const HONEYPOT = 'schema_export'; // never rendered to a human; only DOM enumeration reaches it

// --- session = ordered events {t(ms from start), screen, action, isHoneypot, hasMouse, isNav} ---

// Each profile returns an array of events. Timing/behaviour distributions differ by profile.
function genSession(kind, rnd) {
  const ev = [];
  let t = 0;
  const push = (screen, opts = {}) => {
    ev.push({
      t,
      screen,
      isHoneypot: screen === HONEYPOT,
      hasMouse: opts.hasMouse !== undefined ? opts.hasMouse : true,
      isNav: !!opts.isNav,
    });
  };

  if (kind === 'human') {
    // A real user: few screens, irregular pacing, mouse present, backtracks, dwells.
    const visits = 3 + Math.floor(rnd() * 3); // 3-5 nav actions, often revisiting
    const path = [];
    for (let i = 0; i < visits; i++) {
      // humans revisit earlier screens ~35% of the time
      let s;
      if (path.length && rnd() < 0.35) s = path[Math.floor(rnd() * path.length)];
      else s = REAL_SCREENS[Math.floor(rnd() * REAL_SCREENS.length)];
      path.push(s);
      push(s, { isNav: true, hasMouse: rnd() < 0.92 });
      t += Math.max(600, gauss(rnd, 9000, 6000)); // long, variable dwell
      // a couple of in-screen actions
      const acts = Math.floor(rnd() * 3);
      for (let a = 0; a < acts; a++) {
        push(s, { hasMouse: rnd() < 0.9 });
        t += Math.max(400, gauss(rnd, 3500, 2500));
      }
    }
  } else if (kind === 'naive') {
    // Breadth-first crawler: visits everything fast, perfectly regular, no mouse, enumerates DOM (hits honeypot).
    const order = [...REAL_SCREENS, HONEYPOT];
    for (const s of order) {
      push(s, { isNav: true, hasMouse: false });
      t += Math.max(200, gauss(rnd, 1200, 150)); // very regular
      // clicks every action on the screen
      for (let a = 0; a < 3; a++) { push(s, { hasMouse: false }); t += Math.max(150, gauss(rnd, 900, 120)); }
    }
  } else if (kind === 'jittered') {
    // Adds random delays to beat a simple rate limit; still no mouse, still enumerates, hits honeypot sometimes.
    const order = [...REAL_SCREENS];
    if (rnd() < 0.6) order.push(HONEYPOT);
    for (const s of order) {
      push(s, { isNav: true, hasMouse: false });
      t += Math.max(300, gauss(rnd, 2600, 1800)); // jitter
      for (let a = 0; a < 2 + Math.floor(rnd() * 2); a++) { push(s, { hasMouse: false }); t += Math.max(250, gauss(rnd, 1600, 1200)); }
    }
  } else if (kind === 'mimic') {
    // Human-mimicking agent: variable timing, synthetic mouse, some backtracking, avoids the obvious honeypot.
    // Still systematic — it wants full coverage — which is what gives it away.
    const path = [];
    for (const base of REAL_SCREENS) {
      path.push(base);
      push(base, { isNav: true, hasMouse: rnd() < 0.85 });
      t += Math.max(900, gauss(rnd, 6000, 4500)); // human-like variance
      for (let a = 0; a < 1 + Math.floor(rnd() * 2); a++) { push(base, { hasMouse: rnd() < 0.8 }); t += Math.max(600, gauss(rnd, 3000, 2200)); }
      if (rnd() < 0.2 && path.length > 1) { // occasional backtrack to look human
        const b = path[Math.floor(rnd() * (path.length - 1))];
        push(b, { isNav: true, hasMouse: rnd() < 0.85 }); t += Math.max(800, gauss(rnd, 4000, 3000));
      }
    }
  } else if (kind === 'slow') {
    // Low-and-slow mimic: paces itself under the rate limit, avoids the honeypot, AND copies
    // human backtracking and dwell. Slow + human-like navigation is the genuine hard case —
    // our honest failure mode. It still maps the whole app, just patiently.
    const path = [];
    for (const base of REAL_SCREENS) {
      path.push(base);
      push(base, { isNav: true, hasMouse: rnd() < 0.82 });
      t += Math.max(4000, gauss(rnd, 22000, 13000)); // deliberately slow + variable
      if (rnd() < 0.5) { push(base, { hasMouse: rnd() < 0.78 }); t += Math.max(3000, gauss(rnd, 15000, 9000)); }
      if (rnd() < 0.4 && path.length > 1) { // human-like backtrack to stay under suspicion
        const b = path[Math.floor(rnd() * (path.length - 1))];
        push(b, { isNav: true, hasMouse: rnd() < 0.82 }); t += Math.max(4000, gauss(rnd, 18000, 11000));
      }
    }
  }
  return ev;
}

// --- feature extraction from a (partial) event list ---
function features(ev) {
  if (ev.length < 2) {
    return { apm: 0, cv: 1, coverSpeed: ev.length ? 1 : 0, honeypot: 0, mouseRatio: 1, backtrackRatio: 1, dwellMed: 15000, newStreak: ev.length };
  }
  const intervals = [];
  for (let i = 1; i < ev.length; i++) intervals.push(ev[i].t - ev[i - 1].t);
  const meanInt = intervals.reduce((a, b) => a + b, 0) / intervals.length || 1;
  const varInt = intervals.reduce((a, b) => a + (b - meanInt) ** 2, 0) / intervals.length;
  const cv = Math.sqrt(varInt) / (meanInt || 1);
  const durMin = Math.max(1 / 60, (ev[ev.length - 1].t - ev[0].t) / 60000);
  const apm = ev.length / durMin;

  // screens visited within first 60s (coverage speed)
  const t0 = ev[0].t;
  const early = new Set();
  for (const e of ev) if (e.t - t0 <= 60000 && REAL_SCREENS.includes(e.screen)) early.add(e.screen);
  const coverSpeed = early.size;

  const honeypot = ev.filter((e) => e.isHoneypot).length;
  const mouseRatio = ev.filter((e) => e.hasMouse).length / ev.length;

  // backtracking: fraction of nav events that return to an already-seen screen
  const navs = ev.filter((e) => e.isNav);
  let seen = new Set(), back = 0;
  for (const n of navs) { if (seen.has(n.screen)) back++; seen.add(n.screen); }
  const backtrackRatio = navs.length ? back / navs.length : 0;

  // longest run of consecutive navigations each to a not-yet-seen screen (forward sweep)
  let seen2 = new Set(), streak = 0, newStreak = 0;
  for (const n of navs) {
    if (!seen2.has(n.screen)) { streak++; newStreak = Math.max(newStreak, streak); }
    else streak = 0;
    seen2.add(n.screen);
  }

  const dwellMed = median(intervals);
  return { apm, cv, coverSpeed, honeypot, mouseRatio, backtrackRatio, dwellMed, newStreak };
}

// --- transparent weighted logistic model (the "AI": a scored classifier with named features) ---
// Weights lean on the two signals that separate systematic mapping from human use —
// coverage speed and forward-only navigation — because a good mimic copies human timing
// and pointer movement, so those discriminate weakly. A honeypot touch is near-conclusive.
const WEIGHTS = {
  bias: -4.8,
  rate: 0.5,        // fast actions
  regular: 0.7,     // low timing variance (robotic)
  cover: 1.6,       // visits many screens quickly (systematic mapping)
  newStreak: 2.6,   // long run of new screens with no return (a forward sweep)
  noMouse: 0.5,     // no pointer movement before actions
  noBacktrack: 1.4, // rarely returns to a screen (forward-only crawl)
  shortDwell: 0.5,  // little time reading content
};
const HONEYPOT_BUMP = 42; // a honeypot touch is near-conclusive

// returns {risk 0-100, contributions: [{name, pts}], f}
function score(ev) {
  const f = features(ev);
  const nRate = clamp(f.apm / 40, 0, 1);
  const nRegular = clamp(1 - f.cv / 0.8, 0, 1);
  const nCover = clamp(f.coverSpeed / 5, 0, 1);
  const nStreak = clamp((f.newStreak - 1) / 3, 0, 1); // streak of 4+ new screens = max
  const nNoMouse = clamp(1 - f.mouseRatio, 0, 1);
  const nNoBack = clamp(1 - f.backtrackRatio, 0, 1);
  const nShortDwell = clamp(1 - f.dwellMed / 8000, 0, 1);

  const terms = [
    ['Action speed', WEIGHTS.rate * nRate],
    ['Timing regularity', WEIGHTS.regular * nRegular],
    ['Systematic coverage', WEIGHTS.cover * nCover],
    ['Forward sweep (new screens)', WEIGHTS.newStreak * nStreak],
    ['No pointer movement', WEIGHTS.noMouse * nNoMouse],
    ['Forward-only navigation', WEIGHTS.noBacktrack * nNoBack],
    ['Short dwell time', WEIGHTS.shortDwell * nShortDwell],
  ];
  const z = WEIGHTS.bias + terms.reduce((a, [, v]) => a + v, 0);
  let risk = 100 * sigmoid(z);
  const honeyPts = Math.min(60, HONEYPOT_BUMP * f.honeypot);
  risk = clamp(risk + honeyPts, 0, 100);

  // contributions in risk-points for the breakdown bars (scaled so they sum ~ to risk above bias)
  const contributions = terms.map(([name, v]) => ({ name, raw: v }));
  if (f.honeypot) contributions.push({ name: 'Honeypot touched', raw: honeyPts / 10 });
  return { risk, contributions, f };
}

function responseFor(risk) {
  if (risk >= 85) return { level: 'lock', label: 'Session locked' };
  if (risk >= 70) return { level: 'stepup', label: 'Step-up re-auth' };
  if (risk >= 45) return { level: 'monitor', label: 'Monitor + alert' };
  return { level: 'ok', label: 'Normal' };
}
const LOCK_THRESHOLD = 70; // risk at which coverage is cut off (step-up/lock)

// Replay a session event-by-event; return risk at the end, whether it locked, and
// how much of the app it mapped before the lock fired.
function replay(ev) {
  let lockedAt = -1;
  for (let i = 4; i <= ev.length; i++) { // need a few events before the score is meaningful
    const r = score(ev.slice(0, i)).risk;
    if (r >= LOCK_THRESHOLD) { lockedAt = i; break; }
  }
  const upto = lockedAt === -1 ? ev.length : lockedAt;
  const mapped = new Set();
  for (let i = 0; i < upto; i++) if (REAL_SCREENS.includes(ev[i].screen)) mapped.add(ev[i].screen);
  return {
    finalRisk: score(ev).risk,
    locked: lockedAt !== -1,
    coverageBeforeLock: mapped.size / REAL_SCREENS.length,
  };
}

// QALA v2: a logistic-regression model trained on labelled simulated sessions (see train_v2.js:
// 1,000 sessions, 200 per type, seed 4242 -> 10,612 labelled prefixes; threshold checked on validation seed 9191).
// v2 risk = average of the calibrated v1 risk and the trained model's risk. The honeypot stays a hard rule.
const TRAINED = { w: [-0.742, 1.162, 1.18, 3.227, 5.517, 2.917, 0.284], b: -6.16 };
function featureVector(f) {
  return [clamp(f.apm / 40, 0, 1), clamp(1 - f.cv / 0.8, 0, 1), clamp(f.coverSpeed / 5, 0, 1), clamp((f.newStreak - 1) / 3, 0, 1),
    clamp(1 - f.mouseRatio, 0, 1), clamp(1 - f.backtrackRatio, 0, 1), clamp(1 - f.dwellMed / 8000, 0, 1)];
}
function scoreTrained(ev) {
  const f = features(ev); const x = featureVector(f);
  let z = TRAINED.b; for (let j = 0; j < x.length; j++) z += TRAINED.w[j] * x[j];
  return clamp(100 * sigmoid(z) + Math.min(60, HONEYPOT_BUMP * f.honeypot), 0, 100);
}
function scoreV2(ev) { return (scoreTrained(ev) + score(ev).risk) / 2; }
function replayV2(ev) {
  let lockedAt = -1;
  for (let i = 4; i <= ev.length; i++) { if (scoreV2(ev.slice(0, i)) >= LOCK_THRESHOLD) { lockedAt = i; break; } }
  return { locked: lockedAt !== -1 };
}

// Baseline comparator: a plain rate-limit rule (lock if apm over a threshold at any window).
function rateLimitReplay(ev, apmThreshold = 25) {
  // sliding: compute apm over the whole session; simple but matches "a simple rate-limit rule"
  let lockedAt = -1;
  for (let i = 3; i <= ev.length; i++) {
    const f = features(ev.slice(0, i));
    if (f.apm > apmThreshold) { lockedAt = i; break; }
  }
  const upto = lockedAt === -1 ? ev.length : lockedAt;
  const mapped = new Set();
  for (let i = 0; i < upto; i++) if (REAL_SCREENS.includes(ev[i].screen)) mapped.add(ev[i].screen);
  return { locked: lockedAt !== -1, coverageBeforeLock: mapped.size / REAL_SCREENS.length };
}

// Run the benchmark: n sessions per kind.
// Returns per-kind stats for QALA plus a per-method comparison (no detection, rate-limit rule, QALA).
function benchmark(n = 40, seed = 12345) {
  const rnd = mulberry32(seed);
  const kinds = ['human', 'naive', 'jittered', 'mimic', 'slow'];
  const attackers = ['naive', 'jittered', 'mimic', 'slow'];
  const rows = {};
  // per method: caught counts per attacker kind, plus human false positives, plus coverage
  const methodCaught = { rate: {}, qala: {}, v2: {} };
  const methodCov = { none: {}, rate: {}, qala: {} };
  for (const a of attackers) { methodCaught.rate[a] = 0; methodCaught.qala[a] = 0; methodCaught.v2[a] = 0; methodCov.none[a] = []; methodCov.rate[a] = []; methodCov.qala[a] = []; }
  let humanFpRate = 0, humanFpQala = 0, humanFpV2 = 0;

  for (const kind of kinds) {
    let caught = 0; const cov = [];
    for (let i = 0; i < n; i++) {
      const ev = genSession(kind, rnd);
      const q = replay(ev);
      const rl = rateLimitReplay(ev);
      const v2 = replayV2(ev);
      if (kind === 'human') {
        if (q.locked) humanFpQala++;
        if (rl.locked) humanFpRate++;
        if (v2.locked) humanFpV2++;
      } else {
        if (q.locked) { caught++; methodCaught.qala[kind]++; }
        if (rl.locked) methodCaught.rate[kind]++;
        if (v2.locked) methodCaught.v2[kind]++;
        methodCov.none[kind].push(1);
        methodCov.rate[kind].push(rl.coverageBeforeLock);
        methodCov.qala[kind].push(q.coverageBeforeLock);
      }
      cov.push(q.coverageBeforeLock);
    }
    rows[kind] = {
      sessions: n,
      detectRate: kind === 'human' ? null : caught / n,
      medCoverage: median(cov),
    };
  }

  // overall attacker detection rate per method (mean across attacker kinds)
  const overall = (m) => attackers.reduce((s, a) => s + methodCaught[m][a] / n, 0) / attackers.length;
  const allCov = (m) => median(attackers.flatMap((a) => methodCov[m][a]));

  return {
    rows,
    humanFp: { rate: humanFpRate / n, qala: humanFpQala / n, v2: humanFpV2 / n },
    perKindDetect: {
      none: Object.fromEntries(attackers.map((a) => [a, 0])),
      rate: Object.fromEntries(attackers.map((a) => [a, methodCaught.rate[a] / n])),
      qala: Object.fromEntries(attackers.map((a) => [a, methodCaught.qala[a] / n])),
      v2: Object.fromEntries(attackers.map((a) => [a, methodCaught.v2[a] / n])),
    },
    overallDetect: { none: 0, rate: overall('rate'), qala: overall('qala'), v2: overall('v2') },
    medCoverage: { none: allCov('none'), rate: allCov('rate'), qala: allCov('qala') },
  };
}

if (typeof module !== 'undefined') {
  module.exports = { mulberry32, genSession, features, score, responseFor, replay, rateLimitReplay, benchmark, REAL_SCREENS, HONEYPOT, LOCK_THRESHOLD, WEIGHTS, TRAINED, featureVector, scoreTrained, scoreV2, replayV2 };
}
