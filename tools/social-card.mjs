// Usage: node tools/social-card.mjs <cdp-http-url> <app-url-base> <outdir>
// Screenshots the app's own board for a fixed FEN, then composes tools/social-card.html at 1200x630 and 1080x1080.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const [cdp, base, outDir] = process.argv.slice(2);
const here = path.dirname(fileURLToPath(import.meta.url));
const FEN = "r2q1rk1/pp2bppp/2n1pn2/3p4/3P1B2/2NBPN2/PP3PPP/R2QK2R w KQ - 0 9";
const tab = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => { const x = (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result; if (x.exceptionDetails) throw new Error(x.exceptionDetails.exception?.description || x.exceptionDetails.text); return x.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (clip) => Buffer.from((await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })).result.data, "base64");

await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${base}/?fen=${encodeURIComponent(FEN)}` });
await sleep(3500); 
await js(`(document.getElementById('arrows').style.display='none', document.querySelectorAll('.marker, [data-marker]').forEach(e=>e.remove()), 0)`);
const r = JSON.parse(await js(`JSON.stringify(document.getElementById('board').getBoundingClientRect())`));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "board.png"), await shot({ x: r.x, y: r.y, width: r.width, height: r.height }));

const html = path.join(here, "social-card.html");
for (const [name, w, h, cls] of [["social-card.png", 1200, 630, "wide"], ["social-card-square.png", 1080, 1080, "square"]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await js(`document.open(); document.write(${JSON.stringify(fs.readFileSync(html, "utf8").replace("{{BOARD}}", "data:image/png;base64," + fs.readFileSync(path.join(outDir, "board.png")).toString("base64")).replace("{{CLS}}", cls))}); document.close()`);
  await sleep(500);
  fs.writeFileSync(path.join(outDir, name), await shot());
}
await fetch(`${cdp}/json/close/${tab.id}`);
ws.close();
