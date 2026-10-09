// Trains QALA v2's logistic-regression weights on labelled simulated sessions.
// Run: node train_v2.js   (prints the weights stored as TRAINED in qala_core.js, plus validation results)
'use strict';
const Q = require('./qala_core.js');

function dataset(n, seed) {
  const rnd = Q.mulberry32(seed); const X = [], Y = [];
  for (const kind of ['human', 'naive', 'jittered', 'mimic', 'slow']) {
    for (let i = 0; i < n; i++) {
      const ev = Q.genSession(kind, rnd).filter(e => !e.isHoneypot); // the honeypot stays a hard rule, not a learned feature
      for (let k = 4; k <= ev.length; k++) { X.push(Q.featureVector(Q.features(ev.slice(0, k)))); Y.push(kind === 'human' ? 0 : 1); }
    }
  }
  return { X, Y };
}

function train(X, Y, { iters = 2500, lr = 1.0, l2 = 0.0005 } = {}) {
  const d = X[0].length, n = X.length; let w = new Array(d).fill(0), b = 0;
  const npos = Y.filter(Boolean).length, wpos = n / (2 * npos), wneg = n / (2 * (n - npos)); // class-balanced
  for (let it = 0; it < iters; it++) {
    const gw = new Array(d).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b; for (let j = 0; j < d; j++) z += w[j] * X[i][j];
      const c = (Y[i] ? wpos : wneg) * (1 / (1 + Math.exp(-z)) - Y[i]);
      for (let j = 0; j < d; j++) gw[j] += c * X[i][j]; gb += c;
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]); b -= lr * gb / n;
  }
  return { w: w.map(v => +v.toFixed(3)), b: +b.toFixed(3) };
}

const { X, Y } = dataset(200, 4242);
const model = train(X, Y);
console.log(`trained on ${X.length} labelled prefixes from 1000 sessions`);
console.log('weights', JSON.stringify(model));
console.log('features: [speed, regularity, coverage, forward sweep, no pointer, forward-only, short dwell]');
const v = Q.benchmark(150, 9191);
console.log('validation (seed 9191) with stored TRAINED:', JSON.stringify({ falseFlags: v.humanFp.v2, detect: v.perKindDetect.v2 }));
