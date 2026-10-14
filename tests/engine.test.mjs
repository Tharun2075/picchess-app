import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../app/lib/engine.js";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FEN2 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

class StubWorker {
  constructor() { this.sent = []; this.searching = false; }
  postMessage(c) {
    this.sent.push(c);
    if (c === "uci") this.say("uciok");
    else if (c === "isready") this.say("readyok");
    else if (c.startsWith("go")) this.searching = true;
    else if (c === "stop") { this.searching = false; this.say("bestmove e2e4"); }
  }
  say(line) { queueMicrotask(() => this.onmessage({ data: line })); }
  terminate() { this.terminated = true; }
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const info = (n, mv, cp) => `info depth 10 seldepth 12 multipv ${n} score cp ${cp} nodes 1 nps 1 time 1 pv ${mv}`;

function make(opts, updates = []) {
  let w;
  const e = new Engine(() => (w = new StubWorker()), opts, { onUpdate: (u) => updates.push(u) });
  return { e, get w() { return w; }, updates };
}

test("handshake and search commands, in order", async () => {
  const t = make({ movetime: 1500, depth: 14 });
  t.e.analyze(START);
  await tick(); await tick();
  assert.deepEqual(t.w.sent, [
    "uci", "setoption name MultiPV value 3", "isready",
    "ucinewgame", "isready", `position fen ${START}`, "go movetime 1500 depth 14",
  ]);
});

test("emits latest top-3 lines, ordered by multipv, and done on bestmove", async () => {
  const t = make();
  t.e.analyze(START); await tick(); await tick();
  t.w.say(info(2, "d2d4", 30)); t.w.say(info(1, "e2e4", 40)); t.w.say(info(3, "g1f3", 20));
  t.w.say("bestmove e2e4"); await tick();
  const last = t.updates.at(-1);
  assert.equal(last.done, true);
  assert.deepEqual(last.lines.map((l) => l.move), ["e2e4", "d2d4", "g1f3"]);
  assert.equal(t.e.searching, false);
});

test("a new position stops the previous search and ignores its stale output", async () => {
  const t = make();
  t.e.analyze(START); await tick(); await tick();
  t.e.analyze(FEN2); await tick(); await tick();
  const s = t.w.sent;
  assert.ok(s.includes("stop"));
  assert.ok(s.indexOf("stop") < s.lastIndexOf(`position fen ${FEN2}`));
  assert.equal(s.filter((c) => c.startsWith("go")).length, 2);
  assert.equal(t.e.current.fen, FEN2);
});

test("hints off: stop() halts the search and nothing new is searched", async () => {
  const t = make();
  t.e.analyze(START); await tick(); await tick();
  assert.equal(t.w.searching, true);
  t.e.stop(); await tick();
  assert.equal(t.w.searching, false);
  assert.equal(t.e.searching, false);
  const goCount = t.w.sent.filter((c) => c.startsWith("go")).length;
  t.w.say(info(1, "e2e4", 40)); await tick(); // late output after stop is dropped
  assert.equal(t.updates.length, 0);
  assert.equal(t.w.sent.filter((c) => c.startsWith("go")).length, goCount);
});

test("analyze before the engine is ready is queued, not dropped", async () => {
  const t = make();
  t.e.analyze(START);
  assert.equal(t.w.sent.filter((c) => c.startsWith("go")).length, 0);
  await tick(); await tick();
  assert.equal(t.w.sent.filter((c) => c.startsWith("go")).length, 1);
});

test("stop() before ready cancels the queued search", async () => {
  const t = make();
  t.e.analyze(START); t.e.stop();
  await tick(); await tick();
  assert.equal(t.w.sent.filter((c) => c.startsWith("go")).length, 0);
});

test("worker error -> unavailable, no further searching and no fake moves", async () => {
  const t = make();
  t.e.analyze(START);
  t.w.onerror(new Error("wasm failed"));
  assert.equal(t.e.status, "unavailable");
  t.e.analyze(FEN2);
  assert.equal(t.updates.length, 0);
});

test("constructor failure -> unavailable", () => {
  const e = new Engine(() => { throw new Error("no Worker"); });
  e.analyze(START);
  assert.equal(e.status, "unavailable");
});
