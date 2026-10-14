// Usage: node tools/proof05.mjs <cdp-http-url> <app-url-base> <out.txt> <out.png>
// Opens the scan panel on a sample screenshot in a private headless Chrome and records what it found.
import fs from "node:fs";
const [cdp, base, outTxt, outPng] = process.argv.slice(2);
const tab = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => { const r = (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 2300, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: `${base}/?scan=samples/sample-phone-green.png&bottom=w&turn=w` });
await sleep(2500);
const found = await js(`JSON.stringify({msg: document.getElementById('scan-msg').textContent, corners: __picchess.scan.state.corners, tiles: document.getElementById('scan-tiles').children.length, w: document.getElementById('scan-canvas').width, h: document.getElementById('scan-canvas').height, found: __picchess.scan.state.found})`);
log.push("scan state: " + found);
log.push("true box for sample (truth.json 005): x=11 y=272 size=392");
fs.writeFileSync(outPng, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
// placeholder step: Use this grid -> editor with empty board, turn + orientation carried
await js(`document.querySelector('input[name=scan-bottom][value=b]').click(); document.querySelector('input[name=scan-turn][value=b]').click(); document.getElementById('scan-use').click()`);
await sleep(1000);
log.push("after Use this grid: " + await js(`JSON.stringify({editing: !document.getElementById('editor').hidden, banner: document.getElementById('banner').textContent})`));
fs.writeFileSync(outTxt, log.join("\n") + "\n");
console.log(log.join("\n"));
await fetch(`${cdp}/json/close/${tab.id}`);
ws.close();
