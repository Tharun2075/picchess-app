import test from "node:test";
import assert from "node:assert/strict";
import { Game, validateFen, START_FEN } from "../app/lib/game.js";

const SAMPLE = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";

test("start position is the default", () => {
  const g = new Game();
  assert.equal(g.fen, START_FEN);
  assert.equal(g.status().text, "White to move.");
});
test("valid FEN loads", () => {
  const g = new Game();
  assert.deepEqual(g.loadFen(SAMPLE), { ok: true });
  assert.equal(g.fen, SAMPLE);
});
test("FEN with extra whitespace is accepted", () => {
  assert.ok(validateFen("  " + SAMPLE.replace(/ /g, "   ") + "\n").ok);
});
test("bare placement field is completed", () => {
  assert.ok(validateFen("8/8/8/8/8/8/8/K6k").ok);
});
test("invalid FEN gives a clear error and keeps the game", () => {
  const g = new Game(SAMPLE);
  const r = g.loadFen("not a fen");
  assert.equal(r.ok, false);
  assert.match(r.error, /^Invalid FEN/);
  assert.equal(g.fen, SAMPLE);
});
test("empty FEN is rejected", () => {
  assert.equal(validateFen("   ").ok, false);
});
test("FEN without kings is rejected", () => {
  assert.equal(validateFen("8/8/8/8/8/8/8/8 w - - 0 1").ok, false);
});
test("legal move succeeds and flips turn", () => {
  const g = new Game();
  assert.equal(g.move({ from: "e2", to: "e4" }).san, "e4");
  assert.equal(g.turn, "b");
});
test("illegal move returns null and changes nothing", () => {
  const g = new Game();
  assert.equal(g.move({ from: "e2", to: "e5" }), null);
  assert.equal(g.fen, START_FEN);
});
test("moving the wrong side's piece is illegal", () => {
  assert.equal(new Game().move({ from: "e7", to: "e5" }), null);
});
test("promotion", () => {
  const g = new Game("8/P6k/8/8/8/8/8/K7 w - - 0 1");
  assert.ok(g.isPromotion("a7", "a8"));
  assert.equal(g.move({ from: "a7", to: "a8", promotion: "q" }).san, "a8=Q");
  assert.equal(g.chess.get("a8").type, "q");
});
test("promotion without a piece is illegal", () => {
  const g = new Game("8/P6k/8/8/8/8/8/K7 w - - 0 1");
  assert.equal(g.move({ from: "a7", to: "a8" }), null);
});
test("castling kingside", () => {
  const g = new Game("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  assert.equal(g.move({ from: "e1", to: "g1" }).san, "O-O");
  assert.equal(g.chess.get("f1").type, "r");
  assert.equal(g.move({ from: "e8", to: "c8" }).san, "O-O-O");
});
test("castling through check is illegal", () => {
  const g = new Game("4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1");
  assert.equal(g.move({ from: "e1", to: "g1" }), null);
});
test("en passant", () => {
  const g = new Game("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
  const m = g.move({ from: "e5", to: "d6" });
  assert.equal(m.san, "exd6");
  assert.equal(g.chess.get("d5"), undefined);
});
test("fool's mate is checkmate", () => {
  const g = new Game();
  for (const s of ["f3", "e5", "g4", "Qh4#"]) assert.ok(g.move(s));
  const st = g.status();
  assert.equal(st.state, "checkmate");
  assert.equal(st.over, true);
  assert.match(st.text, /Black wins/);
});
test("stalemate", () => {
  const g = new Game("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
  assert.equal(g.status().state, "stalemate");
});
test("check status", () => {
  const g = new Game("4k3/8/8/8/8/8/4R3/4K3 b - - 0 1");
  assert.equal(g.status().state, "check");
});
test("insufficient material draw", () => {
  assert.equal(new Game("8/8/8/8/8/8/k7/K7 w - - 0 1").status().state, "draw");
});
test("undo restores position and history", () => {
  const g = new Game();
  g.move("e4"); g.move("e5");
  assert.deepEqual(g.history(), ["e4", "e5"]);
  g.undo();
  assert.deepEqual(g.history(), ["e4"]);
  g.undo();
  assert.equal(g.fen, START_FEN);
  assert.equal(g.undo(), null);
});
test("history starts from loaded FEN", () => {
  const g = new Game(SAMPLE);
  g.move("Bb5");
  assert.deepEqual(g.history(), ["Bb5"]);
});
test("flip toggles orientation", () => {
  const g = new Game();
  assert.equal(g.flip(), "b");
  assert.equal(g.flip(), "w");
});
