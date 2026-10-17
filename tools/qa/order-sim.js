// Checks the engine of anime-order.html in Node: loads <script id="engine">, plays many random plans
// (random materials, animators, routes, sorting, memos, order) and asserts the numbers stay sane.
//
//   node tools/qa/order-sim.js [--runs 20000] [--seed 1]
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = +arg("runs", 20000), SEED = +arg("seed", 1);
const html = fs.readFileSync(path.resolve(__dirname, "../../anime-order.html"), "utf8");
const src = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const ctx = { module: {} }; vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;
let a = SEED >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const fail = []; const ok = (c, m) => { if (!c) fail.push(m); };
const BAD = /undefined|NaN|\[object Object\]|Infinity/;

// 1) the intended clean plan
function perfect(order = "first") {
  const s = E.newGame();
  ["yui_w", "bg_rain", "guitar_a", "capo", "mio_w", "muffler", "bg_door", "ref_g"].forEach((m) => E.trayToggle(s, m));
  E.assign(s, "C1", "hayase"); E.assign(s, "C2", "miyashita"); E.assign(s, "C4", "miyashita"); E.assign(s, "C3", "mori");
  ["yui_w", "bg_rain"].forEach((m) => E.bagToggle(s, "hayase", m));
  ["yui_w", "guitar_a", "capo", "mio_w", "muffler", "bg_door"].forEach((m) => E.bagToggle(s, "miyashita", m));
  ["yui_w", "capo", "ref_g"].forEach((m) => E.bagToggle(s, "mori", m));
  return s;
}
{
  const s = perfect();
  // route as synced: hayase, miyashita, mori (order of assignment) -> mori arrives too late
  const p0 = E.plan(s);
  console.log("route", s.route.join(">"), Object.entries(p0).map(([k, v]) => `${k}:${E.fmt(v.arrive)}→${E.fmt(v.finish)}${v.ok ? "" : "✗"}`).join("  "));
  while (s.route[0] !== "mori") E.routeMove(s, "mori", -1);
  const p = E.plan(s);
  console.log("route", s.route.join(">"), Object.entries(p).map(([k, v]) => `${k}:${E.fmt(v.arrive)}→${E.fmt(v.finish)}${v.ok ? "" : "✗"}`).join("  "));
  ok(!E.dispatchWhy(s), "perfect plan should dispatch: " + E.dispatchWhy(s));
  E.dispatch(s);
  const defs = E.CUT_IDS.map((c) => s.ret.cut[c].defects.length);
  ok(defs.every((n) => n === 0), "perfect plan should be clean: " + defs);
  E.CUT_IDS.forEach((c) => E.bundle(s, c, "shi"));
  E.send(s);
  ok(s.res.unpainted === 0 && s.res.remain === 0, "perfect all-shiage should be fully painted");
  console.log("perfect → all to 仕上げ:", s.res.d.paint.map((x) => `${x.cut} ${E.fmt(x.finish)}`).join(", "));
  const s2 = perfect(); while (s2.route[0] !== "mori") E.routeMove(s2, "mori", -1); E.dispatch(s2); E.CUT_IDS.forEach((c) => E.bundle(s2, c, "kan")); E.send(s2);
  console.log("perfect → all to 作監:", s2.res.d.paint.map((x) => `${x.cut} ${x.ok ? E.fmt(x.finish) : "線のまま"}`).join(", "));
}

// 2) random plans
const stats = { feasible: 0, dispatched: 0, defects: {}, unpainted: {}, remain: {}, cleanRuns: 0, cats: {} };
for (let r = 0; r < RUNS; r++) {
  const s = E.newGame();
  for (const m of E.MAT_IDS) if (rnd() < 0.6) E.trayToggle(s, m);
  for (const c of E.CUT_IDS) { for (let k = 0; k < 4; k++) { const an = pick(E.ANIM_IDS); if (!E.assign(s, c, an)) break; } }
  for (const an of E.used(s)) for (const m of s.tray) if (rnd() < 0.5) E.bagToggle(s, an, m);
  for (let k = 0; k < 4; k++) if (s.route.length > 1) E.routeMove(s, pick(s.route), rnd() < 0.5 ? -1 : 1);
  ok(E.used(s).length === s.route.length, "route out of sync");
  ok(E.ANIM_IDS.every((an) => E.cutsOf(s, an).length <= 2), "more than two cuts");
  const p = E.plan(s);
  for (const an of s.route) { const x = p[an]; ok(Number.isFinite(x.arrive) && x.arrive >= E.DEPART, "arrive"); if (x.ok) ok(x.finish <= E.DUE && x.finish >= x.arrive, "finish"); }
  const why = E.dispatchWhy(s);
  if (E.CUT_IDS.every((c) => s.assign[c])) { if (!why) stats.feasible++; }
  if (why) { ok(E.dispatch(s) === why, "dispatch should refuse with the same reason"); continue; }
  E.dispatch(s); stats.dispatched++;
  ok(s.phase === 4 && s.ret, "phase 4 after dispatch");
  const nd = E.CUT_IDS.reduce((n, c) => n + s.ret.cut[c].defects.length, 0);
  stats.defects[nd] = (stats.defects[nd] || 0) + 1;
  for (const c of E.CUT_IDS) for (const d of s.ret.cut[c].defects) { ok(E.CATS.includes(d.cat) && d.label && d.cause && !BAD.test(d.label + d.cause), "defect text " + JSON.stringify(d)); stats.cats[d.k] = (stats.cats[d.k] || 0) + 1; }
  ok(s.ret.log.every((l) => Number.isFinite(l.t) && !BAD.test(l.text)), "log text");
  // sort: random, a "smart" player sends exactly the defective ones with right memos
  const smart = rnd() < 0.3;
  for (const c of E.CUT_IDS) {
    const defs = s.ret.cut[c].defects;
    if (smart) { E.bundle(s, c, defs.length ? "kan" : "shi"); if (defs.length) [...new Set(defs.map((d) => d.cat))].forEach((cat) => E.memo(s, c, cat)); }
    else { E.bundle(s, c, rnd() < 0.5 ? "kan" : "shi"); if (s.bundle[c] === "kan") for (const cat of E.CATS) if (rnd() < 0.2) E.memo(s, c, cat); }
  }
  E.setOrder(s, smart ? "first" : pick(["first", "together"]));
  const pre = E.deliver(s, false);
  ok(pre.paint.length === 4 && pre.paint.every((x) => Number.isFinite(x.arrive)), "preview paint");
  ok(!E.sendWhy(s), "send should be possible");
  E.send(s);
  const R = s.res;
  ok(R.d.paint.length === 4, "4 painted rows");
  ok(R.fixed + R.remain === nd, `fixed+remain=${R.fixed + R.remain} vs ${nd}`);
  ok(R.d.trips.reduce((n, t) => n + t.cuts.length, 0) === 4, "every cut travels once");
  for (const x of R.d.paint) { if (x.ok) ok(x.finish <= E.SHOOT && x.finish >= x.arrive + 180, "paint time"); }
  for (const k of R.d.kan) ok(k.mins >= 15 && Number.isFinite(k.end), "kan time");
  // preview with exact memos and real defects should match when memos are right and complete
  if (smart) { ok(R.remain === 0, "smart player leaves nothing"); stats.smartUnpainted = (stats.smartUnpainted || 0) + (R.unpainted ? 1 : 0); stats.smart = (stats.smart || 0) + 1; }
  if (!nd) stats.cleanRuns++;
  stats.unpainted[R.unpainted] = (stats.unpainted[R.unpainted] || 0) + 1;
  stats.remain[R.remain] = (stats.remain[R.remain] || 0) + 1;
}
console.log(`runs ${RUNS}  dispatched ${stats.dispatched}  (all assigned & feasible ${stats.feasible})  clean ${stats.cleanRuns}`);
console.log("defects per run:", JSON.stringify(stats.defects));
console.log("defect kinds:", JSON.stringify(stats.cats));
console.log("unpainted per run:", JSON.stringify(stats.unpainted), " remaining defects:", JSON.stringify(stats.remain));
console.log(`smart sorting: ${stats.smart} runs, ${stats.smartUnpainted} had a cut left unpainted`);
const uniq = [...new Set(fail)];
console.log(uniq.length ? `FAIL ${fail.length}\n  ` + uniq.slice(0, 20).join("\n  ") : "OK");
process.exitCode = uniq.length ? 1 : 0;
