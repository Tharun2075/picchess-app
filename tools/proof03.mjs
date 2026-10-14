// Usage: node tools/proof03.mjs <cdp-http-url> <app-url> <out.txt> <out.png>
// Drives a headless Chrome (started with ~/.workflow/bin/own-browser) over CDP.
import fs from "node:fs";
const [cdp, appUrl, outTxt, outPng] = process.argv.slice(2);
const tab = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => { const r = (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: appUrl });
await sleep(1500);
const log = [];
const note = (s) => { log.push(s); };

// helpers run in page
await js(`window.tap = (sq) => { const el = document.querySelector('#board [data-square="' + sq + '"]'); if (!el) throw new Error('no square ' + sq); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); };
window.tool = (t) => document.querySelector('#palette [data-tool="' + t + '"]').click();`);

// 1. an ongoing game with history
await js(`(() => { const g = window.__picchess.game; g.move({from:'e2',to:'e4'}); g.move({from:'e7',to:'e5'}); })()`);
const before = await js(`JSON.stringify({fen: window.__picchess.game.fen, hist: window.__picchess.game.history()})`);
note(`game before editing: ${before}`);

// 2. edit: build a position by hand
await js(`document.getElementById('edit').click()`);
await js(`document.getElementById('ed-clear').click()`);
const placements = { K: ["e1"], R: ["a1"], P: ["e4", "f2"], k: ["e8"], q: ["d8"], p: ["e5", "d7"], b: ["c8"] };
for (const [piece, sqs] of Object.entries(placements)) { await js(`tool('${piece}')`); for (const sq of sqs) await js(`tap('${sq}')`); }
await js(`tool('move')`);
// drag-style move: move the white pawn f2->f4 through the model the drag handler uses
await js(`document.querySelector('input[name=turn][value=b]').click()`);
await js(`document.querySelector('input[name=iplay][value=b]').click()`);
await sleep(1200);
const during = await js(`JSON.stringify({fen: window.__picchess.game.fen, hist: window.__picchess.game.history(), editFen: document.getElementById('ed-fen').value, errors: document.getElementById('ed-errors').innerText, castling: [...document.querySelectorAll('.castle')].map(c => c.value + ':' + (c.checked ? 'on' : 'off') + (c.disabled ? '/disabled' : ''))})`);
note(`during editing: ${during}`);
const d = JSON.parse(during), b = JSON.parse(before);
const untouched = d.fen === b.fen && JSON.stringify(d.hist) === JSON.stringify(b.hist);
note(`game untouched while editing: ${untouched}`);
const shotEdit = await send("Page.captureScreenshot", { format: "png" });

// 3. validation error shows and blocks Play
await js(`tool('K'); tap('a8')`);
const errText = await js(`document.getElementById('ed-errors').innerText`);
const playDisabled = await js(`document.getElementById('ed-play').disabled`);
note(`error shown after adding second white king: "${errText}" Play disabled=${playDisabled}`);
await js(`tool('erase'); tap('a8')`);

// 4. Play
await js(`document.getElementById('ed-play').click()`);
const t0 = Date.now();
let n = 0;
while (Date.now() - t0 < 20000) { n = await js(`document.querySelectorAll('#arrows g').length`); const depth = await js(`window.__picchess.lastUpdate ? Math.min(...window.__picchess.lastUpdate.lines.map(l => l.depth)) : 0`); if (n === 3 && depth >= 8) break; await sleep(200); }
await sleep(1500);
const after = await js(`JSON.stringify({fen: window.__picchess.game.fen, hist: window.__picchess.game.history(), orientation: window.__picchess.game.orientation, banner: document.getElementById('banner').innerText, hints: document.getElementById('hints-list').innerText, arrows: document.querySelectorAll('#arrows g').length, editing: window.__picchess.editor.editing})`);
note(`after Play: ${after}`);
const a = JSON.parse(after);
const ok = untouched && playDisabled === true && a.orientation === "b" && / b /.test(a.fen) && a.hist.length === 0 && a.arrows === 3 && a.editing === false && /Black to move/.test(a.banner);
const out = [`proof-03 board editor`, `RESULT: ${ok ? "PASS" : "FAIL"}`, ...log].join("\n");
fs.writeFileSync(outTxt, out + "\n");
fs.writeFileSync(outPng, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
fs.writeFileSync(outPng.replace(".png", "-editing.png"), Buffer.from(shotEdit.result.data, "base64"));
await fetch(`${cdp}/json/close/${tab.id}`);
console.log(out);
process.exit(0);
