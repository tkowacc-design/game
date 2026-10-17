// Browser walk-through for anime-order.html: every run plays the whole desk (storyboard → animators → bags →
// dispatch → check → hand on → footage) with random but legal choices, using the screen's own buttons and,
// now and then, drag and drop. After every step it checks page errors, broken text and sideways scrolling,
// and now and then reloads to check that the game comes back exactly as it was.
//
//   node tools/qa/order-walk.js [--runs 6] [--seed 1] [--width 1440] [--height 900] [--drag]
//
// Needs playwright-core (`npm i --no-save playwright-core` in tools/qa) and a Chromium
// (CHROMIUM env, default /opt/pw-browsers/chromium-1194/chrome-linux/chrome).
"use strict";
const path = require("path");
const { chromium } = require(require.resolve("playwright-core", { paths: [__dirname, process.cwd()] }));
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = +arg("runs", 6), SEED0 = +arg("seed", 1), W = +arg("width", 1440), H = +arg("height", 900), DRAG = process.argv.includes("--drag");
const PAGE = "file://" + path.resolve(__dirname, "../../anime-order.html");
const EXE = process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BAD = /undefined|NaN|\[object Object\]|Infinity/;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x9E3779B9) | 0; let t = Math.imul(a ^ (a >>> 16), 0x85ebca6b); t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; }; }

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const fails = [], summary = [];
  for (let r = 0; r < RUNS; r++) {
    const seed = SEED0 + r, rnd = rng(seed * 7919), pick = (xs) => xs[Math.floor(rnd() * xs.length)];
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    await ctx.route(/fonts\.(googleapis|gstatic)/, (rt) => rt.abort());
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|fonts/.test(m.text())) errors.push("console: " + m.text()); });
    const trail = [], drags = [];
    const fail = (kind, detail) => fails.push({ seed, kind, detail, trail: trail.slice(-10) });
    const check = async (what) => {
      trail.push(what);
      if (errors.length) fail("error", errors.splice(0).join(" | "));
      const c = await p.evaluate((bad) => { const t = document.body.innerText; const m = t.match(new RegExp(bad)); return { bad: m ? t.slice(Math.max(0, m.index - 30), m.index + 30) : "", over: document.documentElement.scrollWidth > innerWidth + 1, pane: !!document.querySelector("#app .pane") }; }, BAD.source);
      if (c.bad) fail("text", `${what}: ${c.bad}`);
      if (c.over) fail("overflow", `${what}: sideways scroll at ${W}px`);
      if (!c.pane) fail("layout", `${what}: no detail pane`);
    };
    const state = () => p.evaluate(() => localStorage.getItem("animep.order"));
    const click = async (sel, what) => { const el = await p.$(sel); if (!el) { fail("missing", `${what || sel}`); return false; } if (await el.isDisabled()) { fail("disabled", `${what || sel}`); return false; } await el.click(); await p.waitForTimeout(25); await check(what || sel); return true; };
    const sel = async (ref) => { const on = await p.$(`[data-act="sel"][data-v="${ref}"].on, .on[data-act="sel"][data-v="${ref}"]`); if (on) return true; const el = await p.$(`[data-act="sel"][data-v="${ref}"]`); if (!el) { fail("missing", "select " + ref); return false; } await el.click(); await p.waitForTimeout(25); await check("select " + ref); return true; };
    const drag = async (ref, zone) => {
      const a = await p.$(`[data-drag="${ref}"]`), b = await p.$(`[data-drop="${zone}"]`);
      if (!a || !b) return false;
      await a.scrollIntoViewIfNeeded();
      const before = await state();
      await p.dragAndDrop(`[data-drag="${ref}"]`, `[data-drop="${zone}"]`).catch(() => {});
      await p.waitForTimeout(30); await check(`drag ${ref} → ${zone}`);
      const ok = (await state()) !== before;
      if (!ok) drags.push(`${ref} → ${zone}`);
      return ok; // the caller falls back to the buttons when a drop did not land
    };
    const reload = async (where) => {
      if (rnd() > 0.25) return;
      const before = await state(); await p.reload(); await p.waitForTimeout(80); const after = await state();
      const a = JSON.parse(before || "{}"), b = JSON.parse(after || "{}");
      if (JSON.stringify(a.s) !== JSON.stringify(b.s)) fail("resume", `${where}: state changed after reload`);
      await check("reload at " + where);
      const m = await p.$('#modal-root [data-act="close"], #modal-root [data-act="start"]'); if (m) await click('#modal-root [data-act="close"], #modal-root [data-act="start"]', "close dialog after reload");
    };
    const E = { MATS: ["yui_w", "yui_s", "mio_w", "mio_p", "guitar_a", "guitar_e", "capo", "muffler", "bg_rain", "bg_day", "bg_door", "bg_hall", "ref_g", "ref_c"], ANIMS: ["mori", "miyashita", "hayase", "kobayashi"], CUTS: ["C1", "C2", "C3", "C4"] };
    const GOOD = ["yui_w", "bg_rain", "guitar_a", "capo", "mio_w", "muffler", "bg_door", "ref_g"];

    await p.goto(PAGE); await check("open");
    await click('[data-act="start"]', "start");
    // 1. storyboard: mostly the right sheets, some wrong ones
    for (const m of E.MATS) {
      const want = GOOD.includes(m) ? rnd() < 0.85 : rnd() < 0.25;
      if (!want) continue;
      if (DRAG && rnd() < 0.4 && await drag("mat:" + m, "tray")) continue;
      await sel("mat:" + m); await click('.pane [data-act="tray"]', "tray " + m);
    }
    if (rnd() < 0.5) { await sel("mat:mio_w"); const see = await p.$('.pane .see'); if (see) { await see.click(); await check("see also"); } }
    await reload("step 1");
    await click('.desk [data-act="go"][data-v="2"]', "go 2");
    // 2. animators: random, then repaired if the plan cannot be sent
    const plan = rnd() < 0.5 ? { C1: "hayase", C2: "miyashita", C3: "mori", C4: "miyashita" } : {};
    for (const c of E.CUTS) {
      const a = plan[c] || pick(E.ANIMS);
      if (DRAG && rnd() < 0.4 && await drag("conte:" + c, "anim:" + a)) continue;
      await sel("conte:" + c);
      const b = await p.$(`.pane [data-act="assign"][data-a="${a}"]:not([disabled])`);
      if (b) { await b.click(); await p.waitForTimeout(25); await check(`assign ${c} ${a}`); }
      else { const any = await p.$('.pane [data-act="assign"]:not([disabled]):not(.on)'); if (any) { await any.click(); await check(`assign ${c} other`); } }
    }
    await reload("step 2");
    await click('.desk [data-act="go"][data-v="3"]', "go 3");
    // 3. bags: each needed sheet goes into each bag with some chance
    const inTray = await p.$$eval('.list [data-act="sel"][data-v^="mat:"]', (els) => els.map((e) => e.dataset.v.slice(4)));
    const used = await p.$$eval('.desk [data-drop^="bag:"]', (els) => els.map((e) => e.dataset.drop.slice(4)));
    for (const a of used) for (const m of inTray) {
      if (rnd() > (GOOD.includes(m) ? 0.7 : 0.15)) continue;
      if (DRAG && rnd() < 0.3 && await drag("mat:" + m, "bag:" + a)) continue;
      await sel("mat:" + m);
      const b = await p.$(`.pane [data-act="bag"][data-a="${a}"]:not(.on):not([disabled])`); if (b) { await b.click(); await p.waitForTimeout(25); await check(`bag ${a} ${m}`); }
    }
    if (rnd() < 0.3) { const x = await p.$('.desk [data-act="bagDel"]'); if (x) { await x.click(); await check("bag remove chip"); } }
    // make it sendable: move 森 first, else try a few reassignments
    for (let tries = 0; tries < 6; tries++) {
      const dis = await p.$eval('.desk [data-act="dispatch"]', (b) => b.disabled);
      if (!dis) break;
      const up = await p.$('.desk [data-act="route"][data-a="mori"][data-d="-1"]:not([disabled])');
      if (up) { await up.click(); await check("route mori up"); continue; }
      const why = await p.$eval('.desk .foot .why', (e) => e.textContent).catch(() => "");
      trail.push("blocked: " + why);
      // fall back to the known-good team for the cut that blocks
      await click('.desk [data-act="go"][data-v="2"]', "back to 2");
      for (const [c, a] of Object.entries({ C1: "hayase", C2: "miyashita", C3: "mori", C4: "miyashita" })) { await sel("conte:" + c); const b = await p.$(`.pane [data-act="assign"][data-a="${a}"]:not([disabled]):not(.on)`); if (b) { await b.click(); await check(`repair ${c}`); } }
      await click('.desk [data-act="go"][data-v="3"]', "go 3 again");
      // drop doubled versions that cost time
      for (const a of await p.$$eval('.desk [data-drop^="bag:"]', (els) => els.map((e) => e.dataset.drop.slice(4)))) for (const m of ["yui_s", "mio_p", "guitar_e", "bg_day", "ref_c"]) { const x = await p.$(`.desk [data-act="bagDel"][data-a="${a}"][data-m="${m}"]`); if (x) { await x.click(); await check(`unbag ${m}`); } }
    }
    await reload("step 3");
    const sendable = !(await p.$eval('.desk [data-act="dispatch"]', (b) => b.disabled));
    if (!sendable) { fail("stuck", "could not make the order sendable"); await ctx.close(); continue; }
    await click('.desk [data-act="dispatch"]', "dispatch");
    await reload("log dialog");
    if (await p.$('#modal-root [data-act="close"]')) await click('#modal-root [data-act="close"]', "close log");
    // 4. check: look at each cut next to its storyboard, then sort (the engine is read only to decide, like a careful player)
    const truth = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem("animep.order")); return Object.fromEntries(Object.entries(d.s.ret.cut).map(([c, x]) => [c, x.defects.map((y) => y.cat)])); });
    for (const c of E.CUTS) {
      await sel("genga:" + c); await click('.pane [data-act="pair"]', "pair " + c);
      const bagsNow = await p.$$eval('.list [data-act="sel"][data-v^="bag:"]', (els) => els.map((e) => e.dataset.v));
      if (rnd() < 0.3 && bagsNow.length) { await sel(pick(bagsNow)); const b = await p.$('.pane [data-act="bench"][data-i="2"]:not([disabled])'); if (b) { await b.click(); await check("bench bag"); } }
      const careful = rnd() < 0.7, toKan = careful ? truth[c].length > 0 : rnd() < 0.5;
      if (!(DRAG && rnd() < 0.3 && await drag("genga:" + c, "bundle:" + (toKan ? "kan" : "shi")))) { await sel("genga:" + c); await click(`.pane [data-act="bundle"][data-w="${toKan ? "kan" : "shi"}"]`, `bundle ${c}`); }
      if (toKan) for (const cat of careful ? [...new Set(truth[c])] : [pick(["服", "小物", "楽器", "背景", "手", "芝居"])]) { const m = await p.$(`.desk [data-act="memo"][data-c="${c}"][data-cat="${cat}"]`); if (m) { await m.click(); await check(`memo ${c} ${cat}`); } }
    }
    if (rnd() < 0.3) { await click('.list [data-act="log"]', "log again"); await click('#modal-root [data-act="close"]', "close log"); }
    if (rnd() < 0.3) { const sm = await p.$("details[data-k=shelf] > summary"); if (sm) { await sm.click(); await check("open shelf"); await sel("mat:yui_w"); const open = await p.$eval("details[data-k=shelf]", (d) => d.open); if (!open) fail("shelf", "shelf closed itself after a redraw"); } }
    await reload("step 4");
    await click('.desk [data-act="go"][data-v="5"]', "go 5");
    const orders = await p.$$('.desk [data-act="order"]');
    if (orders.length) await click(`.desk [data-act="order"][data-v="${rnd() < 0.7 ? "first" : "together"}"]`, "order");
    await sel("person:" + pick(["oshima", "minato"]));
    await reload("step 5");
    await click('.desk [data-act="send"]', "send");
    await p.waitForTimeout(400); await check("footage");
    const res = await p.evaluate(() => ({ verdict: document.querySelector(".verdict")?.textContent || "", frames: !!document.querySelector("#video svg"), d: JSON.parse(localStorage.getItem("animep.order")).s.res }));
    if (!res.d) { fail("send", "the bundles were not sent"); await ctx.close(); continue; }
    if (!res.frames) fail("video", "no footage frame");
    if (!res.verdict) fail("verdict", "no verdict");
    await sel("res:" + pick(E.CUTS)); await click('.pane [data-act="playFrom"]', "play from");
    await reload("step 6");
    if (drags.length) summary.push(`seed ${seed}: drops that did not land: ${drags.join(", ")}`);
    summary.push(`seed ${seed}: ${res.verdict}  直した${res.d.fixed} 見逃し${res.d.remain} むだ${res.d.wasted} 線のまま${res.d.unpainted}  (${trail.length} steps)`);
    if (rnd() < 0.5) { await click('[data-act="restartAsk"]', "restart ask"); await click('#modal-root [data-act="restart"]', "restart"); const ph = await p.$eval(".steps button.on", (b) => b.textContent); if (!/1/.test(ph)) fail("restart", "restart did not go back to step 1"); }
    await ctx.close();
  }
  await browser.close();
  console.log(`viewport ${W}x${H}  runs ${RUNS}  failures ${fails.length}`);
  summary.forEach((s) => console.log("  " + s));
  const seen = new Set();
  for (const f of fails) { const k = f.kind + f.detail; if (seen.has(k)) continue; seen.add(k); console.log(`  ✗ [${f.kind}] seed ${f.seed}: ${f.detail}\n      trail: ${f.trail.join(" > ")}`); }
  process.exitCode = fails.length ? 1 : 0;
})();
