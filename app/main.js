import { Chessboard, COLOR, INPUT_EVENT_TYPE } from "./vendor/cm-chessboard/src/Chessboard.js";
import { Markers, MARKER_TYPE } from "./vendor/cm-chessboard/src/extensions/markers/Markers.js";
import { Game, START_FEN } from "./lib/game.js";
import { Engine } from "./lib/engine.js";
import { whiteScore, formatScore } from "./lib/uci.js";

const $ = (id) => document.getElementById(id);
const game = new Game();
let promoPending = null;

const board = new Chessboard($("board"), {
  position: game.fen,
  orientation: COLOR.white,
  assetsUrl: "./vendor/cm-chessboard/assets/",
  assetsCache: false, // reference the sprite by URL so pieces never depend on a late XHR
  style: {
    pieces: { file: "pieces/chessnut-sprite.svg", tileSize: 40 },
    animationDuration: 150,
  },
  extensions: [{ class: Markers, props: { sprite: "extensions/markers/markers.svg" } }],
});

function inputHandler(e) {
  switch (e.type) {
    case INPUT_EVENT_TYPE.moveInputStarted: {
      board.removeMarkers(MARKER_TYPE.dot);
      const moves = game.legalMovesFrom(e.squareFrom);
      for (const m of moves) board.addMarker(MARKER_TYPE.dot, m.to);
      return moves.length > 0;
    }
    case INPUT_EVENT_TYPE.validateMoveInput: {
      board.removeMarkers(MARKER_TYPE.dot);
      if (game.isPromotion(e.squareFrom, e.squareTo)) {
        showPromo(e.squareFrom, e.squareTo);
        return false; // piece snaps back; the picker finishes the move
      }
      const ok = game.move({ from: e.squareFrom, to: e.squareTo });
      if (ok) setTimeout(() => render(true), 0);
      return !!ok;
    }
    case INPUT_EVENT_TYPE.moveInputCanceled:
      board.removeMarkers(MARKER_TYPE.dot);
      break;
  }
}

const PIECE_SVG = {};
async function loadPieceSprite() {
  const txt = await (await fetch("./vendor/cm-chessboard/assets/pieces/chessnut-sprite.svg")).text();
  const doc = new DOMParser().parseFromString(txt, "image/svg+xml");
  for (const g of doc.querySelectorAll("g[id]")) PIECE_SVG[g.id] = g.innerHTML;
}

function showPromo(from, to) {
  promoPending = { from, to };
  const color = game.turn;
  const box = $("promo");
  box.replaceChildren();
  for (const p of ["q", "r", "b", "n"]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.piece = p;
    btn.setAttribute("aria-label", { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" }[p]);
    btn.innerHTML = `<svg viewBox="0 0 40 40"><g transform="scale(0.05)">${(PIECE_SVG[color + p] || "").replace(/^<g[^>]*>|<\/g>$/g, "")}</g></svg>`;
    btn.addEventListener("click", () => {
      const { from, to } = promoPending;
      promoPending = null;
      box.hidden = true;
      game.move({ from, to, promotion: p });
      render(true);
    });
    box.appendChild(btn);
  }
  box.hidden = false;
}

function render(animated = false) {
  $("promo").hidden = true;
  promoPending = null;
  board.removeMarkers();
  board.setPosition(game.fen, animated);
  board.setOrientation(game.orientation === "w" ? COLOR.white : COLOR.black);

  const st = game.status();
  const banner = $("banner");
  banner.textContent = st.text;
  banner.className = st.over ? "over" : st.state === "check" ? "check" : "";

  const hist = game.history();
  const startMove = game.startFen.split(" ");
  let n = Number(startMove[5]) || 1;
  let black = startMove[1] === "b";
  const list = $("moves");
  list.replaceChildren();
  hist.forEach((san, i) => {
    const li = document.createElement("li");
    const isWhite = !black;
    const num = isWhite ? `${n}.` : i === 0 ? `${n}...` : "";
    li.innerHTML = `<b>${num}</b>`;
    li.append(san);
    list.appendChild(li);
    if (black) n++;
    black = !black;
  });

  requestHints();
  board.disableMoveInput();
  if (!st.over) board.enableMoveInput(inputHandler, game.turn === "w" ? COLOR.white : COLOR.black);
}

// ---- Engine hints ----
const HINTS_KEY = "picchess.hints";
let hintsOn = localStorage.getItem(HINTS_KEY) !== "off";
const ARROW_COLORS = ["#2e9e44", "#d9a21b", "#7a8794"];
const engine = new Engine(
  () => new Worker("./engine/stockfish-19-lite-single.js"),
  {},
  {
    onUpdate: (u) => { if (u.fen === game.fen) showHints(u); window.__picchessLines = engine.log; },
    onStatus: () => showHints(null),
  },
);
window.__picchess = { engine, game, get lastUpdate() { return lastUpdate; } };
let lastUpdate = null;

function toSan(fen, uciMove) {
  const g = new Game(fen);
  const m = g.move({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), promotion: uciMove[4] });
  return m ? m.san : null;
}

function drawArrows(items, flipped) {
  const svg = $("arrows");
  svg.replaceChildren();
  const NS = "http://www.w3.org/2000/svg";
  const pt = (sq) => {
    const f = sq.charCodeAt(0) - 97, r = Number(sq[1]) - 1;
    return flipped ? [7 - f + 0.5, r + 0.5] : [f + 0.5, 7 - r + 0.5];
  };
  for (const it of [...items].reverse()) { // weakest first so the best is on top
    const [x1, y1] = pt(it.move.slice(0, 2)), [x2, y2] = pt(it.move.slice(2, 4));
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const head = 0.32, w = it.rank === 0 ? 0.16 : 0.11;
    const ex = x2 - ux * head, ey = y2 - uy * head;
    const g = document.createElementNS(NS, "g");
    g.setAttribute("opacity", it.rank === 0 ? "0.9" : "0.7");
    g.dataset.move = it.move;
    const line = document.createElementNS(NS, "line");
    for (const [k, v] of Object.entries({ x1: x1 + ux * 0.2, y1: y1 + uy * 0.2, x2: ex, y2: ey, stroke: ARROW_COLORS[it.rank], "stroke-width": w, "stroke-linecap": "round" })) line.setAttribute(k, v);
    const tri = document.createElementNS(NS, "polygon");
    const px = -uy, py = ux;
    tri.setAttribute("points", `${x2},${y2} ${ex + px * 0.17},${ey + py * 0.17} ${ex - px * 0.17},${ey - py * 0.17}`);
    tri.setAttribute("fill", ARROW_COLORS[it.rank]);
    g.append(line, tri);
    svg.appendChild(g);
  }
}

function showHints(u) {
  const status = $("hints-status"), list = $("hints-list");
  if (u) lastUpdate = u;
  if (!hintsOn) { status.textContent = ""; list.replaceChildren(); drawArrows([], false); return; }
  if (engine.status === "unavailable") {
    status.textContent = "Engine unavailable";
    list.replaceChildren(); drawArrows([], false);
    return;
  }
  const cur = lastUpdate && lastUpdate.fen === game.fen ? lastUpdate : null;
  if (!cur) {
    status.textContent = game.status().over ? "Game over." : engine.status === "ready" ? "Thinking..." : "Loading engine...";
    list.replaceChildren(); drawArrows([], false);
    return;
  }
  status.textContent = cur.done ? "" : "Thinking...";
  const items = cur.lines.map((l, rank) => ({ ...l, rank, san: toSan(cur.fen, l.move) })).filter((l) => l.san);
  list.replaceChildren();
  for (const it of items) {
    const li = document.createElement("li");
    li.style.setProperty("--c", ARROW_COLORS[it.rank]);
    const ev = formatScore(whiteScore(it.score, cur.turn));
    li.innerHTML = `<span class="san"></span><span class="ev"></span><span class="dp"></span>`;
    li.querySelector(".san").textContent = it.san;
    li.querySelector(".ev").textContent = ev;
    li.querySelector(".ev").title = "Evaluation from White's point of view";
    li.querySelector(".dp").textContent = `depth ${it.depth}`;
    list.appendChild(li);
  }
  drawArrows(items, game.orientation === "b");
}

function requestHints() {
  lastUpdate = lastUpdate && lastUpdate.fen === game.fen ? lastUpdate : null;
  if (!hintsOn || game.status().over) { engine.stop(); showHints(null); return; }
  showHints(null);
  engine.analyze(game.fen);
}

const toggle = $("hints-toggle");
toggle.checked = hintsOn;
toggle.addEventListener("change", () => {
  hintsOn = toggle.checked;
  localStorage.setItem(HINTS_KEY, hintsOn ? "on" : "off");
  requestHints();
});

function loadFromBox() {
  const r = game.loadFen($("fen").value);
  $("fen-error").textContent = r.ok ? "" : r.error;
  if (r.ok) render(false);
}

$("fen-form").addEventListener("submit", (e) => { e.preventDefault(); loadFromBox(); });
$("start").addEventListener("click", () => {
  game.loadFen(START_FEN);
  $("fen").value = "";
  $("fen-error").textContent = "";
  render(false);
});
$("flip").addEventListener("click", () => { game.flip(); render(false); });
$("undo").addEventListener("click", () => { game.undo(); render(false); });

await loadPieceSprite();
const initial = new URLSearchParams(location.search).get("fen");
if (initial) { $("fen").value = initial; loadFromBox(); } else render(false);
