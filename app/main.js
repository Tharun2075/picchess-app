import { Chessboard, COLOR, INPUT_EVENT_TYPE } from "./vendor/cm-chessboard/src/Chessboard.js";
import { Markers, MARKER_TYPE } from "./vendor/cm-chessboard/src/extensions/markers/Markers.js";
import { Game, START_FEN } from "./lib/game.js";

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

  board.disableMoveInput();
  if (!st.over) board.enableMoveInput(inputHandler, game.turn === "w" ? COLOR.white : COLOR.black);
}

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
