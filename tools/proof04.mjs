// Usage: node tools/proof04.mjs <cdp-http-url> <app-url> <server-pid> <out.txt> <out.png>
// 1) load app online, wait for the service worker to cache everything, 2) kill the static server,
// 3) reload in the SAME browser and check the app still renders, plays and analyses from the cache.
import fs from "node:fs";
const [cdp, appUrl, pid, outTxt, outPng] = process.argv.slice(2);
const tab = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => { const r = (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = []; const note = (s) => log.push(s);
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });

await send("Page.navigate", { url: appUrl });
await sleep(1500);
const online = await js(`(async () => { await navigator.serviceWorker.ready; const ks = await caches.keys(); const c = await caches.open(ks[0]); return JSON.stringify({ caches: ks, entries: (await c.keys()).length, controlled: !!navigator.serviceWorker.controller }); })()`);
note(`online first load: ${online}`);
const entries = JSON.parse(online).entries;
const wasmCached = await js(`caches.keys().then(async ks => !!(await (await caches.open(ks[0])).match('./engine/stockfish-19-lite-single.wasm')))`);
note(`engine wasm in cache: ${wasmCached}`);
// reload once so the page is controlled by the worker
await send("Page.navigate", { url: appUrl });
await sleep(1500);
note(`controlled by service worker after reload: ${await js("!!navigator.serviceWorker.controller")}`);

process.kill(Number(pid));
await sleep(800);
let serverDown = false;
try { await fetch(appUrl, { signal: AbortSignal.timeout(1500) }); } catch { serverDown = true; }
note(`static server stopped (fetch from this script fails): ${serverDown}`);

await send("Page.navigate", { url: appUrl + "?offline=1" });
await sleep(2500);
const state = await js(`JSON.stringify({ title: document.title, squares: document.querySelectorAll('#board [data-square]').length, pieces: document.querySelectorAll('#board .piece').length, banner: document.getElementById('banner').innerText, offlineLabel: document.getElementById('offline-state').innerText, online: navigator.onLine })`);
note(`offline reload (server down): ${state}`);
const s = JSON.parse(state);
// play a move and export PGN offline
await js(`document.getElementById('pgn-text').value = '1. d4 d5 2. c4 *'; document.getElementById('pgn-load').click()`);
await js(`document.getElementById('pgn-download').click()`);
const pgn = await js(`document.getElementById('pgn-text').value`);
note(`PGN export offline:\n${pgn}`);
// engine runs from cached wasm
const t0 = Date.now(); let n = 0;
while (Date.now() - t0 < 25000) { n = await js(`document.querySelectorAll('#arrows g').length`); if (n === 3) break; await sleep(300); }
note(`engine hints offline: ${n} arrows after ${Date.now() - t0} ms; hints: ${(await js(`document.getElementById('hints-list').innerText`)).replace(/\n/g, ' | ')}`);
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(outPng, Buffer.from(shot.result.data, "base64"));
const pass = serverDown && s.squares >= 64 && s.pieces > 0 && wasmCached && entries > 20 && n === 3 && /\[Event/.test(pgn);
fs.writeFileSync(outTxt, `proof-04 offline PWA + PGN export\nRESULT: ${pass ? "PASS" : "FAIL"}\n` + log.join("\n") + "\n");
console.log(pass ? "PASS" : "FAIL"); process.exit(0);
