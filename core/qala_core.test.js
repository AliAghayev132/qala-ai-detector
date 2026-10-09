// QALA detector tests. Run: node --test qala_core.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Q = require('./qala_core.js');

const ev = (screen, t, o = {}) => ({ t, screen, isHoneypot: screen === Q.HONEYPOT, hasMouse: o.mouse !== false, isNav: o.nav !== false });

test('benchmark is deterministic for a given seed', () => {
  assert.deepEqual(Q.benchmark(100, 777), Q.benchmark(100, 777));
});

test('seeded run reproduces the published numbers (n=100, seed 777)', () => {
  const b = Q.benchmark(100, 777);
  assert.equal(b.perKindDetect.qala.naive, 1);
  assert.equal(b.perKindDetect.qala.jittered, 1);
  assert.equal(b.perKindDetect.qala.mimic, 0.67);
  assert.equal(b.perKindDetect.qala.slow, 0.03);
  assert.equal(b.perKindDetect.rate.mimic, 0.43);
  assert.equal(b.perKindDetect.rate.slow, 0.01);
  assert.equal(b.humanFp.qala, 0.01);
  assert.equal(b.humanFp.rate, 0.18);
});

test('response levels switch exactly at 45 / 70 / 85', () => {
  assert.equal(Q.responseFor(44.9).level, 'ok');
  assert.equal(Q.responseFor(45).level, 'monitor');
  assert.equal(Q.responseFor(70).level, 'stepup');
  assert.equal(Q.responseFor(85).level, 'lock');
});

test('a honeypot touch pushes a session to lock', () => {
  const s = [ev('dashboard', 0), ev('invoices', 4000), ev(Q.HONEYPOT, 8000, { mouse: false })];
  assert.ok(Q.score(s).risk >= 85);
});

test('adding a honeypot event never lowers risk', () => {
  const base = [ev('dashboard', 0), ev('reports', 9000), ev('dashboard', 20000)];
  const withHoney = base.concat([ev(Q.HONEYPOT, 26000)]);
  assert.ok(Q.score(withHoney).risk >= Q.score(base).risk);
});

test('a calm human-like session stays at Normal', () => {
  const s = [ev('dashboard', 0), ev('invoices', 12000), ev('invoices', 19000, { nav: false }), ev('dashboard', 33000), ev('reports', 52000)];
  assert.equal(Q.responseFor(Q.score(s).risk).level, 'ok');
});

test('a fast forward sweep with no pointer is flagged', () => {
  const s = Q.REAL_SCREENS.map((sc, i) => ev(sc, i * 900, { mouse: false }));
  assert.ok(Q.score(s).risk >= 70);
});

test('features: actions per minute and early coverage are computed correctly', () => {
  const s = [ev('dashboard', 0), ev('invoices', 10000), ev('customers', 20000), ev('reports', 30000)];
  const f = Q.features(s);
  assert.equal(Math.round(f.apm), 8);       // 4 events over 0.5 min
  assert.equal(f.coverSpeed, 4);            // 4 distinct real screens in the first 60 s
  assert.equal(f.newStreak, 4);             // never went back
});

test('rate limit always catches the naive crawler', () => {
  const rnd = Q.mulberry32(42);
  for (let i = 0; i < 50; i++) assert.ok(Q.rateLimitReplay(Q.genSession('naive', rnd)).locked);
});

test('across 30 seeds QALA flags far fewer real users than a rate limit', () => {
  let q = 0, r = 0;
  for (let s = 1; s <= 30; s++) { const b = Q.benchmark(100, s * 101 + 7); q += b.humanFp.qala; r += b.humanFp.rate; }
  assert.ok(q / 30 < (r / 30) / 3, `qala ${q / 30} vs rate ${r / 30}`);
});

test('across 30 seeds QALA catches more human-mimic agents than a rate limit', () => {
  let q = 0, r = 0;
  for (let s = 1; s <= 30; s++) { const b = Q.benchmark(100, s * 101 + 7); q += b.perKindDetect.qala.mimic; r += b.perKindDetect.rate.mimic; }
  assert.ok(q > r);
});

test('known limit stays documented: low-and-slow agents are caught under 10%', () => {
  let q = 0;
  for (let s = 1; s <= 30; s++) q += Q.benchmark(100, s * 101 + 7).perKindDetect.qala.slow;
  assert.ok(q / 30 < 0.1);
});

test('the live demo page runs the same detector as qala_core.js', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'demo', 'index.html'), 'utf8');
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.indexOf('/* ============ UI ============ */'));
  const ctx = vm.createContext({});
  vm.runInContext(script + '\nthis.__b = benchmark(100, 777);', ctx);
  const pick = b => JSON.parse(JSON.stringify({ d: b.perKindDetect, fp: b.humanFp, o: b.overallDetect,
    rows: Object.fromEntries(Object.entries(b.rows).map(([k, v]) => [k, [v.detectRate, v.medCoverage]])) }));
  assert.deepEqual(pick(ctx.__b), pick(Q.benchmark(100, 777)));
});

test('trained v2 reproduces the held-out numbers (seed 777, never used for training)', () => {
  const b = Q.benchmark(100, 777);
  assert.equal(b.perKindDetect.v2.naive, 1);
  assert.equal(b.perKindDetect.v2.jittered, 1);
  assert.equal(b.perKindDetect.v2.mimic, 0.73);
  assert.equal(b.perKindDetect.v2.slow, 0.38);
  assert.equal(b.humanFp.v2, 0.01);
});

test('across 30 seeds v2 catches far more low-and-slow agents than v1 and keeps false flags under 5%', () => {
  let s1 = 0, s2 = 0, fp = 0;
  for (let s = 1; s <= 30; s++) { const b = Q.benchmark(100, s * 101 + 7); s1 += b.perKindDetect.qala.slow; s2 += b.perKindDetect.v2.slow; fp += b.humanFp.v2; }
  assert.ok(s2 / 30 > s1 / 30 + 0.15, `v1 ${s1 / 30} vs v2 ${s2 / 30}`);
  assert.ok(fp / 30 < 0.05, `v2 false flags ${fp / 30}`);
});

test('train_v2.js reproduces the stored weights', () => {
  const out = require('node:child_process').execFileSync(process.execPath, [__dirname + '/train_v2.js'], { encoding: 'utf8' });
  const m = JSON.parse(out.split('\n').find(l => l.startsWith('weights')).slice(8));
  assert.deepEqual(m, Q.TRAINED);
});
