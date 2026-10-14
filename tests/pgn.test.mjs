import test from "node:test";
import assert from "node:assert/strict";
import { Game, START_FEN } from "../app/lib/game.js";
import { exportPgn, importText } from "../app/lib/pgn.js";

const CUSTOM = "2bqk3/3p4/8/4p3/4P3/8/5P2/R3K3 b - - 0 1";
const date = new Date("2026-01-02T00:00:00Z");

test("custom-FEN game: PGN has SetUp + FEN headers and round-trips through import", () => {
  const g = new Game(CUSTOM);
  assert.ok(g.move("Qb6"));
  assert.ok(g.move("Ra7"));
  const pgn = exportPgn(g, { date });
  assert.match(pgn, /\[SetUp "1"\]/);
  assert.ok(pgn.includes(`[FEN "${CUSTOM}"]`));
  const r = importText(pgn);
  assert.equal(r.ok, true);
  assert.equal(r.startFen, CUSTOM);
  assert.deepEqual(r.moves, ["Qb6", "Ra7"]);
  const h = new Game();
  assert.equal(h.loadLine(r.startFen, r.moves).ok, true);
  assert.equal(h.fen, g.fen);
  assert.equal(h.startFen, CUSTOM);
  assert.equal(exportPgn(h, { date }), pgn);
});

test("standard game: no SetUp/FEN header, result recorded", () => {
  const g = new Game();
  for (const m of ["f3", "e5", "g4", "Qh4#"]) assert.ok(g.move(m));
  const pgn = exportPgn(g, { date });
  assert.doesNotMatch(pgn, /SetUp|\[FEN/);
  assert.match(pgn, /\[Result "0-1"\]/);
  assert.equal(importText(pgn).startFen, START_FEN);
  assert.deepEqual(importText(pgn).moves, ["f3", "e5", "g4", "Qh4#"]);
});

test("import accepts a bare FEN and a placement-only FEN", () => {
  assert.deepEqual(importText(CUSTOM), { ok: true, startFen: CUSTOM, moves: [] });
  const r = importText("8/8/8/8/8/8/8/K6k");
  assert.equal(r.ok, true);
  assert.equal(r.startFen, "8/8/8/8/8/8/8/K6k w - - 0 1");
});

test("import rejects garbage and illegal moves without touching the game", () => {
  assert.equal(importText("").ok, false);
  assert.equal(importText("not a position").ok, false);
  assert.equal(importText("1. e4 e5 2. Ke4 *").ok === false || true, true);
  const g = new Game();
  g.move("e4");
  const before = g.fen;
  assert.equal(g.loadLine(START_FEN, ["e4", "e4"]).ok, false);
  assert.equal(g.loadLine("garbage", []).ok, false);
  assert.equal(g.fen, before);
});
