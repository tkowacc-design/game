// Random-walk tester for anime-producer.html.
// Clicks every kind of enabled control the screen offers (only inside an open dialog when one is up),
// reloads now and then to test save/resume, and reports page errors, broken text and layout overflow.
// Each run fixes Math.random with its own seed, so a failure can be replayed with --seed.
//
//   node tools/qa/fuzz.js [--runs 6] [--steps 400] [--seed 1] [--width 1440] [--height 900] [--out report.json] [--page anime-rts.html] [--live]
//
// --live: for a screen that redraws while time runs (the RTS prototype). Moving things are clicked without
// waiting for them to stop, and a button replaced by a redraw is found again by its data-* and clicked once more.
//
// Needs playwright-core (`npm i --no-save playwright-core` in tools/qa) and a Chromium
// (CHROMIUM env, default /opt/pw-browsers/chromium-1194/chrome-linux/chrome).
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require(require.resolve("playwright-core", { paths: [__dirname, process.cwd()] }));

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = +arg("runs", 6), STEPS = +arg("steps", 400), SEED0 = +arg("seed", 1);
const W = +arg("width", 1440), H = +arg("height", 900);
const OUT = arg("out", "");
const LIVE = process.argv.includes("--live");
const PAGE = "file://" + path.resolve(__dirname, "../..", arg("page", "anime-producer.html"));
const EXE = process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
// leaving the game is allowed but rare, so a run gets deep into the season
const RARE = new Set(["title", "quitYes", "again", "quit", "restartAsk", "retry", "restart", "cancel"]);
const BAD_TEXT = /undefined|NaN|\[object Object\]|Infinity/;

function seeded(seed) {
  return `(() => { let a = ${seed} >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x9E3779B9) | 0; let t = Math.imul(a ^ (a >>> 16), 0x85ebca6b); t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; }; }

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const report = { page: PAGE, viewport: `${W}x${H}`, runs: [], acts: {}, events: {}, failures: [] };
  for (let r = 0; r < RUNS; r++) {
    const seed = SEED0 + r, rand = rng(seed * 7919);
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    await ctx.addInitScript(seeded(seed));
    await ctx.route(/fonts\.(googleapis|gstatic)/, (rt) => rt.abort());
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push("pageerror: " + e.message + ((e.stack || "").split("\n")[1] || "").replace(/file:\/\/\S*\//, " @")));
    p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|fonts/.test(m.text())) errors.push("console: " + m.text()); });
    await p.goto(PAGE);
    const trail = [];
    let phaseMax = "title", ended = 0, overflowSeen = false;
    const fail = (kind, detail) => report.failures.push({ seed, step: trail.length, kind, detail, trail: trail.slice(-12) });
    for (let step = 0; step < STEPS; step++) {
      const info = await p.evaluate(() => {
        const modal = document.querySelector("#modal-root .modal-bg");
        const root = modal || document;
        const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
        const els = [...root.querySelectorAll("[data-act]")].filter((el) => !el.disabled && vis(el));
        const ev = modal && modal.querySelector("[data-act=evChoice]") ? (modal.querySelector("h2")?.textContent || "") : "";
        const phase = document.querySelector("[data-act=endWeek]") ? "prod" : document.querySelector("[data-act=start]") ? "schedule" : document.querySelector("[data-act=again]") ? "end" : "title";
        return { n: els.length, acts: els.map((el) => el.dataset.act), modal: !!modal, ev, phase };
      });
      if (["schedule", "prod", "end"].indexOf(info.phase) > ["schedule", "prod", "end"].indexOf(phaseMax)) phaseMax = info.phase;
      if (info.phase === "end") ended++;
      if (info.ev) report.events[info.ev] = (report.events[info.ev] || 0) + 1;
      if (!info.n) { fail("stuck", `no enabled control (modal=${info.modal}, phase=${info.phase})`); break; }
      // pick: favour moving the week on so runs reach the late season
      let idx = -1;
      const endIdx = info.acts.indexOf("endWeek");
      if (!info.modal && endIdx >= 0 && rand() < 0.35) idx = endIdx;
      for (let tries = 0; idx < 0 && tries < 20; tries++) { const i = Math.floor(rand() * info.n); if (!RARE.has(info.acts[i]) || rand() < 0.03) idx = i; }
      if (idx < 0) idx = Math.floor(rand() * info.n);
      if (!info.modal && info.phase === "prod" && rand() < 0.01) { trail.push("reload"); await p.reload(); await p.waitForTimeout(80); continue; }
      const act = info.acts[idx];
      trail.push(act);
      report.acts[act] = (report.acts[act] || 0) + 1;
      try {
        const handle = (await p.evaluateHandle((i) => {
          const modal = document.querySelector("#modal-root .modal-bg"), root = modal || document;
          const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
          return [...root.querySelectorAll("[data-act]")].filter((el) => !el.disabled && vis(el))[i];
        }, idx)).asElement();
        if (handle && (await handle.evaluate((el) => el.tagName)) === "SELECT") {
          const n = await handle.evaluate((el) => el.options.length);
          await handle.selectOption({ index: Math.floor(rand() * n) });
        } else if (handle) {
          const key = LIVE ? await handle.evaluate((el) => JSON.stringify(el.dataset)) : null;
          try { await handle.click({ timeout: 2000, force: LIVE }); }
          catch (e) {
            if (!LIVE || !/not attached|detached|not visible/.test(e.message)) throw e;
            const again = (await p.evaluateHandle((k) => [...document.querySelectorAll("[data-act]")].find((el) => JSON.stringify(el.dataset) === k && !el.disabled), key)).asElement();
            if (again) await again.click({ timeout: 2000, force: true });
          }
        }
      } catch (e) { fail("click", `${act}: ${e.message.split("\n")[0]}`); }
      await p.waitForTimeout(30);
      if (errors.length) { fail("error", errors.splice(0).join(" | ")); }
      const check = await p.evaluate((bad) => {
        const txt = (document.querySelector("#app")?.innerText || "") + "\n" + (document.querySelector("#modal-root")?.innerText || "");
        const m = txt.match(new RegExp(bad));
        const over = document.documentElement.scrollWidth > window.innerWidth + 1;
        const hasPane = !!document.querySelector("#app .pane");
        return { bad: m ? txt.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\n/g, " ") : "", over, hasPane };
      }, BAD_TEXT.source);
      if (check.bad) fail("text", check.bad);
      if (check.over && !overflowSeen) { overflowSeen = true; fail("overflow", `page scrolls sideways at ${W}px after ${act}`); }
      if (!check.hasPane && !LIVE) fail("layout", `no detail pane after ${act}`); // the RTS screen has no fixed panel
    }
    report.runs.push({ seed, steps: trail.length, phaseMax, reachedEnd: ended > 0 });
    await ctx.close();
  }
  await browser.close();
  // de-duplicate failures by kind+detail
  const seen = new Map();
  for (const f of report.failures) { const k = f.kind + "|" + f.detail; if (!seen.has(k)) seen.set(k, { ...f, count: 0 }); seen.get(k).count++; }
  report.failures = [...seen.values()];
  const txt = JSON.stringify(report, null, 2);
  if (OUT) fs.writeFileSync(OUT, txt);
  console.log(`viewport ${W}x${H}  runs ${RUNS}  failures ${report.failures.length}`);
  report.runs.forEach((r) => console.log(`  seed ${r.seed}: ${r.steps} steps, reached ${r.phaseMax}${r.reachedEnd ? " (end screen)" : ""}`));
  console.log("actions exercised:", Object.keys(report.acts).sort().join(", "));
  console.log("events seen:", Object.keys(report.events).join(", ") || "none");
  report.failures.slice(0, 20).forEach((f) => console.log(`  ✗ [${f.kind}] x${f.count} seed ${f.seed} step ${f.step}: ${f.detail}\n      trail: ${f.trail.join(" > ")}`));
  process.exitCode = report.failures.length ? 1 : 0;
})();
