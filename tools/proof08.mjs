// node tools/proof08.mjs <cdp url> <app url> <fixture png> <outdir>  : real-browser proof for the screenshot-to-FEN flow
import fs from "node:fs";
import path from "node:path";
const [cdp, appUrl, fixture, outDir] = process.argv.slice(2);
const key = path.basename(fixture);
const truth = JSON.parse(fs.readFileSync(path.join(path.dirname(fixture), "truth.json")))[key];
const tab = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const w = new Map(), errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data); w.get(d.id)?.(d);
  if (d.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
  if (d.method === "Log.entryAdded" && d.params.entry.level === "error") errors.push(d.params.entry.text + " " + (d.params.entry.url || ""));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; w.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (f) => fs.writeFileSync(f, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
try {
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable"); await send("DOM.enable");
  await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: appUrl }); await sleep(1500);
  // drop any service worker and caches left by an earlier run so the proof sees the files on disk
  await js(`navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))).then(() => caches.keys()).then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => 1)`);
  await send("Page.navigate", { url: appUrl }); await sleep(3000);
  await js(`document.getElementById('scan-open').click()`); await sleep(500);
  const root = (await send("DOM.getDocument")).result.root.nodeId;
  const node = (await send("DOM.querySelector", { nodeId: root, selector: "#scan-file" })).result.nodeId;
  const t0 = Date.now();
  await send("DOM.setFileInputFiles", { nodeId: node, files: [path.resolve(fixture)] });
  let r = null;
  for (let i = 0; i < 120 && !r; i++) { await sleep(500); r = await js(`JSON.stringify(window.__picchess.lastScan||null)`); }
  const wall = Date.now() - t0;
  if (!r) { await shot(`${outDir}/proof-08-fail.png`); throw new Error("no result in 60 s; errors: " + errors.join(" | ")); }
  r = JSON.parse(r);
  await sleep(800);
  const page = JSON.parse(await js(`JSON.stringify({fen: document.getElementById('ed-fen').value, check: !document.getElementById('ed-check').hidden && document.getElementById('ed-check').innerText, playDisabled: document.getElementById('ed-play').disabled, sw: document.documentElement.scrollWidth, iw: innerWidth})`));
  await shot(`${outDir}/proof-08-screenshot-to-fen-390.png`);
  await js(`document.getElementById('ed-tools').scrollIntoView()`); await sleep(300);
  await shot(`${outDir}/proof-08-editor-390.png`);
  const placement = page.fen.split(" ")[0];
  const expand = (f) => f.split("/").map((r) => r.replace(/\d/g, (n) => "1".repeat(n))).join("");
  const a = expand(placement), b = expand(truth.fen);
  let wrong = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) wrong++;
  const txt = [
    `fixture: ${key} (piece set ${truth.piece_set}, theme ${truth.theme}, bottom ${truth.orientation})`,
    `true FEN:      ${truth.fen}`,
    `predicted FEN: ${placement}   (read from the page, #ed-fen)`,
    `scan result FEN: ${r.fen}`,
    `squares wrong: ${wrong} of 64`,
    `flagged for the user to check: ${r.flagged.length}`,
    `time to first result: ${r.ms} ms in page (model load ${Math.round(r.loadMs)} ms, read ${Math.round(r.readMs)} ms); ${wall} ms wall incl. test overhead`,
    `"Check the board" step visible: ${!!page.check}; Play locked until confirmed: ${page.playDisabled}`,
    `horizontal overflow at 390 px: ${page.sw > page.iw}`,
    `console errors: ${errors.length ? errors.join(" | ") : "none"}`,
  ].join("\n");
  fs.writeFileSync(`${outDir}/proof-08-screenshot-to-fen.txt`, txt + "\n");
  console.log(txt);
} finally { try { await fetch(`${cdp}/json/close/${tab.id}`); } catch {} process.exit(0); }
