import test from "node:test";
import assert from "node:assert/strict";
import { emptyPosition, startPosition, parseFen, setPiece, movePiece, setTurn, setCastling, setEp, toFen, validate, inferCastling, legalEpSquares } from "../app/lib/position.js";

const P = (fen) => parseFen(fen).position;
const kings = (pos) => setPiece(setPiece(pos, "e1", "K"), "e8", "k");

test("start position round-trips through FEN", () => {
  assert.equal(toFen(startPosition()), "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
});
test("empty board FEN", () => {
  assert.equal(toFen(emptyPosition()), "8/8/8/8/8/8/8/8 w - - 0 1");
});
test("setPiece places and erases without mutating the input", () => {
  const a = emptyPosition();
  const b = setPiece(a, "e4", "N");
  assert.equal(a.board.every((x) => x === null), true);
  assert.equal(toFen(b).split(" ")[0], "8/8/8/8/4N3/8/8/8");
  assert.equal(toFen(setPiece(b, "e4", null)).split(" ")[0], "8/8/8/8/8/8/8/8");
});
test("setPiece rejects bad square or piece", () => {
  assert.throws(() => setPiece(emptyPosition(), "i9", "K"));
  assert.throws(() => setPiece(emptyPosition(), "e4", "X"));
});
test("movePiece moves and captures", () => {
  const pos = movePiece(startPosition(), "e2", "e4");
  assert.equal(toFen(pos).split(" ")[0], "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
  const cap = movePiece(pos, "e4", "e7");
  assert.equal(cap.board.filter((p) => p === "p").length, 7);
});
test("setTurn flips side to move in the FEN", () => {
  assert.match(toFen(setTurn(startPosition(), "b")), / b KQkq /);
});
test("inferCastling: full start", () => assert.equal(inferCastling(startPosition().board), "KQkq"));
test("inferCastling: moving the h1 rook removes K only", () => {
  const pos = movePiece(startPosition(), "h1", "h3");
  assert.equal(pos.castling, "Qkq");
});
test("inferCastling: moving the black king removes k and q", () => {
  assert.equal(movePiece(startPosition(), "e8", "e7").castling, "KQ");
});
test("castling can be unticked by hand and stays off", () => {
  const pos = setCastling(startPosition(), "K", false);
  assert.equal(pos.castling, "Qkq");
  assert.equal(setCastling(pos, "K", true).castling, "KQkq");
});
test("a right cannot be ticked when the rook is missing", () => {
  const pos = setPiece(startPosition(), "a8", null);
  assert.equal(setCastling(pos, "q", true).castling, "KQk");
});
test("toFen never writes impossible castling", () => {
  const pos = { ...emptyPosition(), castling: "KQkq" };
  assert.match(toFen(kings(pos)), / w - - /);
});
test("en passant: only legal targets are offered and written", () => {
  const pos = P("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 3");
  assert.deepEqual(legalEpSquares(pos), ["d6"]);
  assert.match(toFen(pos), / w - d6 0 1$/);
  assert.equal(setEp(pos, "a6").ep, "-");
  assert.equal(setEp(pos, "d6").ep, "d6");
});
test("en passant square is dropped when the pawn disappears", () => {
  const pos = setPiece(P("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 3"), "d5", null);
  assert.equal(pos.ep, "-");
  assert.equal(setEp(pos, "d6").ep, "-");
});
test("validate: start position is fine", () => assert.deepEqual(validate(startPosition()), { ok: true, errors: [] }));
test("validate: missing white king", () => {
  const r = validate(setPiece(emptyPosition(), "e8", "k"));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /White needs exactly one king \(found 0\)/);
});
test("validate: two black kings", () => {
  const r = validate(setPiece(kings(emptyPosition()), "a8", "k"));
  assert.match(r.errors.join(" "), /Black needs exactly one king \(found 2\)/);
});
test("validate: empty board reports both kings", () => {
  assert.equal(validate(emptyPosition()).errors.length, 2);
});
test("validate: pawn on rank 1 and rank 8", () => {
  const a = validate(setPiece(kings(emptyPosition()), "a1", "P"));
  assert.match(a.errors.join(" "), /rank 1 or 8 \(a1\)/);
  const b = validate(setPiece(kings(emptyPosition()), "h8", "p"));
  assert.match(b.errors.join(" "), /rank 1 or 8 \(h8\)/);
});
test("validate: pawns on ranks 2-7 are fine", () => {
  assert.equal(validate(setPiece(kings(emptyPosition()), "a2", "P")).ok, true);
});
test("validate: side not to move in check is rejected (rook)", () => {
  // Black king attacked by white rook, White to move
  const pos = P("4k3/8/8/8/8/8/8/4RK2 w - - 0 1");
  const r = validate(pos);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Black's king is in check but it is White's move/);
});
test("validate: same check is fine when it is Black's move", () => {
  assert.equal(validate(P("4k3/8/8/8/8/8/8/4RK2 b - - 0 1")).ok, true);
});
test("validate: blocked check is not check", () => {
  assert.equal(validate(P("4k3/8/8/4p3/8/8/8/4RK2 w - - 0 1")).ok, true);
});
test("validate: check by knight, bishop, pawn", () => {
  assert.equal(validate(P("4k3/8/3N4/8/8/8/8/4K3 w - - 0 1")).ok, false);
  assert.equal(validate(P("4k3/8/8/8/8/8/1B6/4K3 w - - 0 1")).ok, true);
  assert.equal(validate(P("4k3/8/8/b7/8/8/8/4K3 w - - 0 1")).ok, true); // White in check, White to move: allowed
  assert.equal(validate(P("4k3/3P4/8/8/8/8/8/4K3 w - - 0 1")).ok, false);
  assert.equal(validate(P("4k3/5p2/8/8/8/8/8/4K3 b - - 0 1")).ok, true);
});
test("validate: White pawn attacks diagonally forward only", () => {
  assert.equal(validate(P("8/8/8/8/8/3k4/4P3/4K3 w - - 0 1")).ok, false); // pawn e2 hits d3
  assert.equal(validate(P("8/8/8/8/8/4k3/4P3/4K3 w - - 0 1")).ok, true); // straight ahead is not an attack
});
test("validate: more than 16 pieces per side", () => {
  let pos = startPosition();
  pos = setPiece(pos, "a3", "N"); // 17 white pieces
  const r = validate(pos);
  assert.match(r.errors.join(" "), /White has 17 pieces; at most 16/);
  assert.equal(validate(startPosition()).ok, true);
});
test("validate: exactly 16 is fine", () => assert.equal(validate(startPosition()).ok, true));
test("validate: more than 8 pawns", () => {
  const pos = setPiece(setPiece(kings(emptyPosition()), "a3", "P"), "a4", "P");
  let p = pos;
  for (const sq of ["b3", "c3", "d3", "e3", "f3", "g3", "h3"]) p = setPiece(p, sq, "P");
  assert.match(validate(p).errors.join(" "), /more than 8 pawns/);
});
test("parseFen: errors for junk", () => {
  assert.equal(parseFen("").ok, false);
  assert.equal(parseFen("8/8/8").ok, false);
  assert.equal(parseFen("9/8/8/8/8/8/8/8").ok, false);
  assert.equal(parseFen("x7/8/8/8/8/8/8/8").ok, false);
});
test("editing a copy of a position never touches an ongoing game", async () => {
  const { Game } = await import("../app/lib/game.js");
  const g = new Game();
  g.move({ from: "e2", to: "e4" });
  const fen = g.fen, hist = g.history();
  let pos = parseFen(g.fen).position;
  pos = setPiece(movePiece(setTurn(pos, "b"), "a1", "a5"), "h8", null);
  toFen(pos); validate(pos);
  assert.equal(g.fen, fen);
  assert.deepEqual(g.history(), hist);
});
