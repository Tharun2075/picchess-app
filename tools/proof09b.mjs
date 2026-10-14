// node tools/proof09b.mjs <cdp url> <app url> <fixture png> <outdir> : 390 px proof of the share tick box and the "Shared, thank you" toast.
// The page's fetch is stubbed, so nothing is sent to the live Worker.
import fs from "node:fs";
import path from "node:path";
const [cdp, appUrl, fixture, outDir] = process.argv.slice(2);
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
  await js(`window.__sent = []; const f = window.fetch; window.fetch = (u, o) => { if (String(u).includes("workers.dev")) { window.__sent.push(String(u)); return Promise.resolve(new Response('{"ok":true}', { status: 200 })); } return f(u, o); }; 1`);
  await js(`if (!document.getElementById('scan-share').checked) document.getElementById('scan-share').click()`);
  const ticked = await js(`document.getElementById('scan-share').checked`);
  await js(`document.getElementById('scan-share').scrollIntoView({block:'center'})`); await sleep(400);
  await shot(`${outDir}/proof-09b-optin-390.png`);
  await send("DOM.setFileInputFiles", { nodeId: node, files: [path.resolve(fixture)] });
  let r = null;
  for (let i = 0; i < 120 && !r; i++) { await sleep(500); r = await js(`JSON.stringify(window.__picchess.lastScan||null)`); }
  if (!r) throw new Error("no scan result; errors: " + errors.join(" | "));
  await sleep(800);
  await js(`document.getElementById('ed-confirm').click()`); await sleep(300);
  await js(`document.getElementById('ed-play').click()`);
  await sleep(700);
  const t = JSON.parse(await js(`JSON.stringify({hidden: document.getElementById('toast').hidden, text: document.getElementById('toast').textContent, sent: window.__sent, sw: document.documentElement.scrollWidth, iw: innerWidth})`));
  await shot(`${outDir}/proof-09b-toast-390.png`);
  console.log(JSON.stringify({ ticked, ...t, errors }));
} finally { try { await fetch(`${cdp}/json/close/${tab.id}`); } catch {} process.exit(0); }
