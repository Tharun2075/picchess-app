// PGN export / import (no DOM). Wraps chess.js; custom start positions get [SetUp "1"] + [FEN].
import { Chess, DEFAULT_POSITION } from "../vendor/chess.js/chess.js";
import { validateFen } from "./game.js";

function result(chess) {
  if (chess.isCheckmate()) return chess.turn() === "w" ? "0-1" : "1-0";
  if (chess.isDraw()) return "1/2-1/2";
  return "*";
}

/** PGN text for a Game (see game.js). */
export function exportPgn(game, { date = new Date() } = {}) {
  const src = game.chess;
  const c = new Chess(game.startFen);
  for (const san of src.history()) c.move(san);
  const d = date.toISOString().slice(0, 10).replace(/-/g, ".");
  const headers = { Event: "PicChess game", Site: "PicChess", Date: d, Round: "-", White: "?", Black: "?", Result: result(c) };
  const custom = game.startFen !== DEFAULT_POSITION;
  if (custom) { headers.SetUp = "1"; headers.FEN = game.startFen; }
  for (const [k, v] of Object.entries(headers)) c.setHeader(k, v);
  return c.pgn({ newline: "\n" }).trim() + "\n";
}

/**
 * Parse PGN text, or a bare FEN. Returns {ok, startFen, moves[]} or {ok:false, error}.
 * A PGN without a FEN header starts from the standard position.
 */
export function importText(text) {
  const t = String(text ?? "").trim();
  if (!t) return { ok: false, error: "Paste a PGN or FEN first." };
  if (!t.includes("[") && !/\d\.|\*|1-0|0-1|1\/2/.test(t) || /^[rnbqkpRNBQKP1-8]+(\/[rnbqkpRNBQKP1-8]+){7}(\s|$)/.test(t)) {
    const v = validateFen(t);
    return v.ok ? { ok: true, startFen: v.fen, moves: [] } : v;
  }
  try {
    const c = new Chess();
    c.loadPgn(t);
    const startFen = c.getHeaders().FEN || DEFAULT_POSITION;
    return { ok: true, startFen, moves: c.history() };
  } catch (e) {
    return { ok: false, error: `Invalid PGN: ${String(e.message).split("\n")[0]}` };
  }
}
