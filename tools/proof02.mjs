// Usage: node tools/proof02.mjs <cdp-http-url e.g. http://127.0.0.1:PORT> <app-url> <out.txt> [out.png]
// Drives a headless Chrome the caller started (see ~/.workflow/bin/own-browser) over CDP.
import fs from "node:fs";
const [cdp, appUrl, outTxt, outPng] = process.argv.slice(2);
const tab = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
const t0 = Date.now();
await send("Page.navigate", { url: appUrl });
let upd = null;
while (Date.now() - t0 < 15000) {
  upd = await evalJs(`(() => { const u = window.__picchess?.lastUpdate; return u ? JSON.stringify(u.lines.map(l => ({move:l.move, mp:l.multipv, depth:l.depth}))) : null })()`);
  if (upd && JSON.parse(upd).length === 3 && JSON.parse(upd).every((l) => l.depth >= 8)) break;
  await new Promise((r) => setTimeout(r, 100));
}
const elapsed = Date.now() - t0;
const raw = await evalJs(`JSON.stringify(window.__picchess?.engine.log ?? [])`);
const listText = await evalJs(`document.getElementById('hints-list').innerText`);
const nArrows = await evalJs(`document.querySelectorAll('#arrows g').length`);
const fen = await evalJs(`window.__picchess.game.fen`);
const lines = JSON.parse(upd ?? "[]");
const legal = await evalJs(`(() => { const g = window.__picchess.game; return JSON.stringify(g.chess.moves({verbose:true}).map(m => m.from+m.to+(m.promotion||''))) })()`);
const legalSet = new Set(JSON.parse(legal));
const moves = lines.map((l) => l.move);
const ok = moves.length === 3 && new Set(moves).size === 3 && moves.every((m) => legalSet.has(m)) && nArrows === 3;
const log = JSON.parse(raw);
const out = [
  `proof-02 stockfish top-3`,
  `position: ${fen}`,
  `time to 3 distinct moves at depth>=8: ${elapsed} ms (limit 5000)`,
  `moves: ${moves.join(" ")}  distinct=${new Set(moves).size}  all legal=${moves.every((m) => legalSet.has(m))}  arrows drawn=${nArrows}`,
  `RESULT: ${ok && elapsed <= 5000 ? "PASS" : "FAIL"}`,
  `--- list shown in the page ---`, listText,
  `--- raw UCI lines (> = sent, others = received; info lines shown for the final depth only) ---`,
  ...log.filter((l) => !l.startsWith("info") || /multipv/.test(l)).slice(-60),
].join("\n");
fs.writeFileSync(outTxt, out + "\n");
if (outPng) {
  await new Promise((r) => setTimeout(r, 1800)); // let the search finish so the shot shows the final list
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(outPng, Buffer.from(shot.result.data, "base64"));
}
await fetch(`${cdp}/json/close/${tab.id}`);
console.log(out.split("\n").slice(0, 6).join("\n"));
process.exit(0);
