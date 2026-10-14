// Usage: node tools/live-check.mjs <cdp-http-url> <app-url> <outdir>
// Live-site canary: phone render, hints, two-tap move, PGN export, offline reload via the service worker.
import fs from "node:fs";
const [cdp, appUrl, outDir] = process.argv.slice(2);
const tab = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (f) => fs.writeFileSync(f, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
const out = []; const res = {};
const check = (name, ok, v) => { res[name] = ok; out.push(`${ok ? "PASS" : "FAIL"} ${name}: ${v}`); };
const tap = async (sq) => {
  const c = JSON.parse(await js(`(() => { const r = document.querySelector('#board [data-square="${sq}"]').getBoundingClientRect(); return JSON.stringify([r.x + r.width/2, r.y + r.height/2]) })()`));
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: c[0], y: c[1], button: "left", clickCount: 1 });
};
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: appUrl });
await sleep(1500);
const r = JSON.parse(await js(`JSON.stringify({sq: document.querySelectorAll('#board [data-square]').length, pieces: document.querySelectorAll('#board .piece').length, w: innerWidth, h: innerHeight})`));
check("renders board", r.sq >= 64 && r.pieces === 32, JSON.stringify(r));
if (!(await js(`document.getElementById('hints-toggle').checked`))) await js(`document.getElementById('hints-toggle').click()`);
const t0 = Date.now(); let n = 0;
while (Date.now() - t0 < 5000) { n = await js(`document.querySelectorAll('#arrows g').length`); if (n === 3) break; await sleep(100); }
const el = Date.now() - t0;
const hl = (await js(`document.getElementById('hints-list').innerText`)).replace(/\n/g, " | ");
check("hints ON -> 3 arrows within 5s", n === 3 && el <= 5000, `${n} arrows after ${el} ms; ${hl}`);
await shot(`${outDir}/live-proof-390.png`);
await tap("e2"); await tap("e4");
await sleep(500);
const mv = await js(`document.getElementById('moves').innerText.replace(/\\s+/g,' ')`);
check("two-tap move e2-e4", /e4/.test(mv), `moves list: "${mv}"`);
await js(`document.getElementById('pgn-download').click()`);
const pgn = await js(`document.getElementById('pgn-text').value`);
check("PGN export", /\[Event/.test(pgn) && /1\. e4/.test(pgn), JSON.stringify(pgn.slice(0, 120)));
// make sure the worker controls the page, then go offline
await send("Page.navigate", { url: appUrl }); await sleep(2000);
const sw = await js(`navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller)`);
out.push(`service worker controlling page: ${sw}`);
await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await send("Page.navigate", { url: appUrl }); await sleep(2500);
const off = JSON.parse(await js(`JSON.stringify({sq: document.querySelectorAll('#board [data-square]').length, pieces: document.querySelectorAll('#board .piece').length, title: document.title})`));
check("offline reload served by SW", off.sq >= 64 && off.pieces > 0, JSON.stringify(off));
await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: appUrl }); await sleep(3500);
await shot(`${outDir}/live-proof-desktop.png`);
fs.writeFileSync(`${outDir}/live-check-result.txt`, out.join("\n") + "\n");
console.log(out.join("\n")); process.exit(0);
