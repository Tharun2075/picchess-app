// Pure editor model (no DOM). A position is a plain object:
//   { board: Array(64) of piece letter|null (index 0 = a8, 63 = h1; FEN letters, uppercase = White),
//     turn: "w"|"b", castling: "KQkq" subset, ep: "-" | square like "e3" }
// Every function returns a new object; inputs are never mutated.

const FILES = "abcdefgh";
export const PIECES = ["K", "Q", "R", "B", "N", "P", "k", "q", "r", "b", "n", "p"];
export const START_PLACEMENT = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

export const idx = (sq) => (8 - Number(sq[1])) * 8 + FILES.indexOf(sq[0]);
export const sqName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
const isSquare = (sq) => typeof sq === "string" && /^[a-h][1-8]$/.test(sq);
const colorOf = (p) => (p === p.toUpperCase() ? "w" : "b");

export function emptyPosition() {
  return { board: Array(64).fill(null), turn: "w", castling: "", ep: "-" };
}

export function startPosition() {
  return parseFen(`${START_PLACEMENT} w KQkq - 0 1`).position;
}

/** Returns {ok, position} or {ok:false, error}. Accepts a bare placement field. */
export function parseFen(fen) {
  const parts = String(fen ?? "").trim().split(/\s+/);
  if (!parts[0]) return { ok: false, error: "Empty FEN." };
  const rows = parts[0].split("/");
  if (rows.length !== 8) return { ok: false, error: "FEN needs 8 ranks separated by /." };
  const board = [];
  for (const row of rows) {
    let n = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) { n += Number(ch); for (let k = 0; k < Number(ch); k++) board.push(null); }
      else if (PIECES.includes(ch)) { n++; board.push(ch); }
      else return { ok: false, error: `Unknown character "${ch}" in FEN.` };
    }
    if (n !== 8) return { ok: false, error: "Each FEN rank must have 8 squares." };
  }
  const turn = parts[1] === "b" ? "b" : "w";
  const position = { board, turn, castling: "", ep: isSquare(parts[3]) ? parts[3] : "-" };
  position.castling = inferCastling(board, parts[2] && parts[2] !== "-" ? parts[2] : parts[2] === "-" ? "" : "KQkq");
  return { ok: true, position };
}

/** Place a piece (or null to erase) on a square. Castling rights that became impossible are dropped. */
export function setPiece(pos, sq, piece) {
  if (!isSquare(sq)) throw new Error(`Bad square: ${sq}`);
  if (piece !== null && !PIECES.includes(piece)) throw new Error(`Bad piece: ${piece}`);
  const board = pos.board.slice();
  board[idx(sq)] = piece;
  return normalize({ ...pos, board });
}

/** Move whatever stands on `from` to `to` (replacing anything there). */
export function movePiece(pos, from, to) {
  const p = pos.board[idx(from)];
  if (!p || from === to) return pos;
  return setPiece(setPiece(pos, from, null), to, p);
}

export function setTurn(pos, turn) {
  return normalize({ ...pos, turn: turn === "b" ? "b" : "w" });
}

/** Tick or untick one castling right ("K","Q","k","q"). Impossible rights stay off. */
export function setCastling(pos, right, on) {
  const set = new Set(pos.castling);
  if (on) set.add(right); else set.delete(right);
  return normalize({ ...pos, castling: [...set].join("") });
}

export function setEp(pos, sq) {
  return { ...pos, ep: sq && legalEpSquares(pos).includes(sq) ? sq : "-" };
}

// Drop castling rights / ep square that no longer make sense after an edit.
function normalize(pos) {
  const next = { ...pos, castling: inferCastling(pos.board, pos.castling) };
  if (next.ep !== "-" && !legalEpSquares(next).includes(next.ep)) next.ep = "-";
  return next;
}

/** Keep only those rights in `wanted` (default all) whose king and rook stand on their home squares. */
export function inferCastling(board, wanted = "KQkq") {
  const at = (sq) => board[idx(sq)];
  const can = {
    K: at("e1") === "K" && at("h1") === "R",
    Q: at("e1") === "K" && at("a1") === "R",
    k: at("e8") === "k" && at("h8") === "r",
    q: at("e8") === "k" && at("a8") === "r",
  };
  return [..."KQkq"].filter((r) => can[r] && wanted.includes(r)).join("");
}

/** En passant targets that could really exist: the side to move has a pawn that can capture there. */
export function legalEpSquares(pos) {
  const out = [];
  const { board, turn } = pos;
  const rank = turn === "w" ? 6 : 3; // target rank
  const pawnRow = turn === "w" ? 5 : 4; // rank of the pawn that just moved two squares
  const startRow = turn === "w" ? 7 : 2; // where it came from
  const mine = turn === "w" ? "P" : "p", theirs = turn === "w" ? "p" : "P";
  for (let f = 0; f < 8; f++) {
    const target = FILES[f] + rank;
    if (board[idx(target)] || board[idx(FILES[f] + startRow)]) continue;
    if (board[idx(FILES[f] + pawnRow)] !== theirs) continue;
    const left = f > 0 && board[idx(FILES[f - 1] + pawnRow)] === mine;
    const right = f < 7 && board[idx(FILES[f + 1] + pawnRow)] === mine;
    if (left || right) out.push(target);
  }
  return out;
}

export function toFen(pos, halfmove = 0, fullmove = 1) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let s = "", gap = 0;
    for (let f = 0; f < 8; f++) {
      const p = pos.board[r * 8 + f];
      if (!p) gap++;
      else { if (gap) s += gap; gap = 0; s += p; }
    }
    rows.push(s + (gap || ""));
  }
  const castling = inferCastling(pos.board, pos.castling) || "-";
  const ep = pos.ep !== "-" && legalEpSquares(pos).includes(pos.ep) ? pos.ep : "-";
  return `${rows.join("/")} ${pos.turn} ${castling} ${ep} ${halfmove} ${fullmove}`;
}

/** True if square index `target` is attacked by a piece of colour `by`. */
export function isAttacked(board, target, by) {
  const tr = Math.floor(target / 8), tc = target % 8;
  const at = (r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? board[r * 8 + c] : null);
  const up = by === "w" ? (s) => s.toUpperCase() : (s) => s;
  const has = (r, c, letters) => { const p = at(r, c); return !!p && letters.includes(up(p.toLowerCase())) && colorOf(p) === by; };
  // pawns: White pawns attack towards row-1, so a White attacker sits on the row below the target
  const pr = by === "w" ? tr + 1 : tr - 1;
  if (at(pr, tc - 1) === (by === "w" ? "P" : "p") || at(pr, tc + 1) === (by === "w" ? "P" : "p")) return true;
  for (const [dr, dc] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) if (has(tr + dr, tc + dc, "N")) return true;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && has(tr + dr, tc + dc, "K")) return true;
  const rays = [[1,0,"RQ"],[-1,0,"RQ"],[0,1,"RQ"],[0,-1,"RQ"],[1,1,"BQ"],[1,-1,"BQ"],[-1,1,"BQ"],[-1,-1,"BQ"]];
  for (const [dr, dc, letters] of rays) {
    for (let r = tr + dr, c = tc + dc; r >= 0 && r < 8 && c >= 0 && c < 8; r += dr, c += dc) {
      const p = board[r * 8 + c];
      if (!p) continue;
      if (colorOf(p) === by && letters.includes(p.toUpperCase())) return true;
      break;
    }
  }
  return false;
}

/** Returns {ok, errors:[human-readable strings]}. */
export function validate(pos) {
  const errors = [];
  const count = (p) => pos.board.filter((x) => x === p).length;
  const name = { w: "White", b: "Black" };
  for (const c of ["w", "b"]) {
    const king = c === "w" ? "K" : "k";
    const n = count(king);
    if (n !== 1) errors.push(`${name[c]} needs exactly one king (found ${n}).`);
    const total = pos.board.filter((p) => p && colorOf(p) === c).length;
    if (total > 16) errors.push(`${name[c]} has ${total} pieces; at most 16 are allowed.`);
    if (count(c === "w" ? "P" : "p") > 8) errors.push(`${name[c]} has more than 8 pawns.`);
  }
  const badPawns = pos.board.map((p, i) => (p && p.toLowerCase() === "p" && (i < 8 || i >= 56) ? sqName(i) : null)).filter(Boolean);
  if (badPawns.length) errors.push(`Pawns cannot stand on rank 1 or 8 (${badPawns.join(", ")}).`);
  // The side NOT to move must not be in check (it would mean the last move was illegal).
  const waiting = pos.turn === "w" ? "b" : "w";
  const kingIdx = pos.board.indexOf(waiting === "w" ? "K" : "k");
  if (count(waiting === "w" ? "K" : "k") === 1 && isAttacked(pos.board, kingIdx, pos.turn)) {
    errors.push(`${name[waiting]}'s king is in check but it is ${name[pos.turn]}'s move. Change the side to move or fix the position.`);
  }
  return { ok: errors.length === 0, errors };
}
