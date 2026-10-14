// Pure game logic (no DOM) wrapping chess.js.
import { Chess, DEFAULT_POSITION } from "../vendor/chess.js/chess.js";

export const START_FEN = DEFAULT_POSITION;

export function validateFen(fen) {
  const text = String(fen ?? "").trim().replace(/\s+/g, " ");
  if (!text) return { ok: false, error: "Paste a FEN first." };
  // Allow a bare piece-placement field; fill in the rest.
  const full = text.split(" ").length === 1 ? `${text} w - - 0 1` : text;
  try {
    new Chess(full);
  } catch (e) {
    return { ok: false, error: `Invalid FEN: ${String(e.message).replace(/^Invalid FEN:\s*/i, "")}` };
  }
  return { ok: true, fen: full };
}

const m_name = (e) => String(e.message).split("\n")[0];

export class Game {
  constructor(fen = START_FEN) {
    this.orientation = "w";
    this.loadFen(fen);
  }

  /** Returns {ok, error?}. On failure the current game is untouched. */
  loadFen(fen) {
    const v = validateFen(fen);
    if (!v.ok) return v;
    this.chess = new Chess(v.fen);
    this.startFen = v.fen;
    return { ok: true };
  }

  /** Replay a start FEN plus SAN moves (from pgn.js importText). Untouched on failure. */
  loadLine(startFen, moves) {
    const v = validateFen(startFen);
    if (!v.ok) return v;
    const c = new Chess(v.fen);
    try { for (const m of moves) c.move(m); } catch (e) { return { ok: false, error: `Illegal move in PGN: ${m_name(e)}` }; }
    this.chess = c;
    this.startFen = v.fen;
    return { ok: true };
  }

  reset() { return this.loadFen(START_FEN); }

  get fen() { return this.chess.fen(); }
  get turn() { return this.chess.turn(); }

  /** Move by {from,to,promotion?} or SAN. Returns the move object or null if illegal. */
  move(m) {
    try { return this.chess.move(m); } catch { return null; }
  }

  undo() { return this.chess.undo(); }

  /** SAN list of moves played since the loaded position. */
  history() { return this.chess.history(); }

  legalMovesFrom(square) { return this.chess.moves({ square, verbose: true }); }

  /** True if moving from->to would be a pawn promotion. */
  isPromotion(from, to) {
    return this.legalMovesFrom(from).some((m) => m.to === to && m.promotion);
  }

  flip() { this.orientation = this.orientation === "w" ? "b" : "w"; return this.orientation; }

  status() {
    const c = this.chess;
    const turn = c.turn();
    const side = turn === "w" ? "White" : "Black";
    const other = turn === "w" ? "Black" : "White";
    if (c.isCheckmate()) return { state: "checkmate", over: true, turn, text: `Checkmate. ${other} wins.` };
    if (c.isStalemate()) return { state: "stalemate", over: true, turn, text: "Draw by stalemate." };
    if (c.isInsufficientMaterial()) return { state: "draw", over: true, turn, text: "Draw: insufficient material." };
    if (c.isThreefoldRepetition()) return { state: "draw", over: true, turn, text: "Draw by threefold repetition." };
    if (c.isDrawByFiftyMoves?.() ?? c.isDraw()) return { state: "draw", over: true, turn, text: "Draw by the fifty-move rule." };
    if (c.isCheck()) return { state: "check", over: false, turn, text: `${side} is in check.` };
    return { state: "playing", over: false, turn, text: `${side} to move.` };
  }
}
