// Pure UCI line parser (no DOM, no Worker).

/** Parse "info depth 12 ... multipv 2 score cp 31 ... pv e2e4 e7e5".
 *  Returns null for anything that is not a usable, exact multipv line
 *  (currency lines, "info string", lowerbound/upperbound bounds, no pv). */
export function parseInfo(line) {
  const t = String(line).trim().split(/\s+/);
  if (t[0] !== "info") return null;
  const out = { multipv: 1 };
  let hasScore = false;
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case "string": return null;
      case "depth": out.depth = Number(t[++i]); break;
      case "seldepth": out.seldepth = Number(t[++i]); break;
      case "multipv": out.multipv = Number(t[++i]); break;
      case "nodes": out.nodes = Number(t[++i]); break;
      case "nps": out.nps = Number(t[++i]); break;
      case "time": out.time = Number(t[++i]); break;
      case "score": {
        const kind = t[++i];
        const value = Number(t[++i]);
        if (kind !== "cp" && kind !== "mate") return null;
        if (!Number.isFinite(value)) return null;
        out.score = { kind, value };
        hasScore = true;
        if (t[i + 1] === "lowerbound" || t[i + 1] === "upperbound") return null;
        break;
      }
      case "pv": out.pv = t.slice(i + 1); i = t.length; break;
    }
  }
  if (!hasScore || !out.pv || !out.pv.length || !Number.isFinite(out.depth)) return null;
  if (!Number.isInteger(out.multipv) || out.multipv < 1) return null;
  out.move = out.pv[0];
  return out;
}

/** "bestmove e2e4 ponder e7e5" -> {move, ponder}; "bestmove (none)" -> {move:null}. */
export function parseBestmove(line) {
  const t = String(line).trim().split(/\s+/);
  if (t[0] !== "bestmove" || !t[1]) return null;
  return { move: t[1] === "(none)" || t[1] === "0000" ? null : t[1], ponder: t[2] === "ponder" ? t[3] ?? null : null };
}

/** Score from the side to move's view -> White's view. turn is "w" or "b". */
export function whiteScore(score, turn) {
  return { kind: score.kind, value: turn === "w" ? score.value : -score.value };
}

/** "+1.2", "-0.4", "M3", "-M2" (White's point of view). */
export function formatScore(score) {
  if (score.kind === "mate") return `${score.value < 0 ? "-" : ""}M${Math.abs(score.value)}`;
  const p = score.value / 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}`;
}
