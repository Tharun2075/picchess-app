import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseInfo, parseBestmove, whiteScore, formatScore } from "../app/lib/uci.js";

const lines = fs.readFileSync(new URL("./fixtures/uci-lines.txt", import.meta.url), "utf8")
  .split("\n").filter((l) => l && !l.startsWith("#"));
const infos = lines.filter((l) => /^info depth \d+ seldepth/.test(l));

test("recorded lines: multipv 1..3 with cp scores parse", () => {
  const cp = infos.filter((l) => /score cp \d|score cp -\d/.test(l) && !/bound/.test(l)).map(parseInfo);
  assert.deepEqual([...new Set(cp.map((i) => i.multipv))].sort(), [1, 2, 3]);
  const first = parseInfo(lines.find((l) => /multipv 1 score cp 19 /.test(l)));
  assert.equal(first.depth, 16);
  assert.deepEqual(first.score, { kind: "cp", value: 19 });
  assert.equal(first.move, "d6d5");
  assert.equal(first.pv[1], "e1c1");
  const neg = parseInfo(lines.find((l) => /multipv 2 score cp -11 /.test(l)));
  assert.equal(neg.score.value, -11);
  assert.equal(neg.multipv, 2);
});

test("recorded lines: mate score", () => {
  const m = parseInfo(lines.find((l) => /score mate 1 /.test(l)));
  assert.deepEqual(m.score, { kind: "mate", value: 1 });
  assert.equal(m.move, "a1a8");
});

test("lowerbound / upperbound lines are ignored", () => {
  const bounded = lines.filter((l) => /(lower|upper)bound/.test(l));
  assert.ok(bounded.length >= 2);
  for (const l of bounded) assert.equal(parseInfo(l), null);
  assert.equal(parseInfo("info depth 9 seldepth 9 multipv 1 score cp 12 lowerbound nodes 5 pv e2e4"), null);
});

test("non-search info lines are ignored", () => {
  assert.equal(parseInfo("info string NNUE evaluation using nn-61e7af4bb97d.nnue"), null);
  assert.equal(parseInfo("info depth 1 currmove e2e4 currmovenumber 1"), null);
  assert.equal(parseInfo("uciok"), null);
  assert.equal(parseInfo(""), null);
});

test("bestmove", () => {
  assert.deepEqual(parseBestmove("bestmove d6d5 ponder e1c1"), { move: "d6d5", ponder: "e1c1" });
  assert.deepEqual(parseBestmove("bestmove a1a8"), { move: "a1a8", ponder: null });
  assert.deepEqual(parseBestmove("bestmove (none)"), { move: null, ponder: null });
  assert.equal(parseBestmove("info depth 1"), null);
});

test("score is shown from White's point of view", () => {
  assert.equal(formatScore(whiteScore({ kind: "cp", value: 120 }, "w")), "+1.2");
  assert.equal(formatScore(whiteScore({ kind: "cp", value: 120 }, "b")), "-1.2");
  assert.equal(formatScore(whiteScore({ kind: "cp", value: 0 }, "b")), "0.0");
  assert.equal(formatScore(whiteScore({ kind: "mate", value: 3 }, "w")), "M3");
  assert.equal(formatScore(whiteScore({ kind: "mate", value: 2 }, "b")), "-M2");
  assert.equal(formatScore(whiteScore({ kind: "mate", value: -2 }, "w")), "-M2");
});
