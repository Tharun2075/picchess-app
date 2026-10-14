import { Chessboard, COLOR, INPUT_EVENT_TYPE, POINTER_EVENTS } from "./vendor/cm-chessboard/src/Chessboard.js";
import { Markers, MARKER_TYPE } from "./vendor/cm-chessboard/src/extensions/markers/Markers.js";
import { Game, START_FEN } from "./lib/game.js";
import { Engine } from "./lib/engine.js";
import * as P from "./lib/position.js";
import { exportPgn, importText } from "./lib/pgn.js";
import { initScan } from "./scan.js";
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
  if (editing) return;
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

// ---- PGN export / import ----
const pgnMsg = (t, bad = false) => { $("pgn-msg").textContent = t; $("pgn-msg").className = bad ? "bad" : ""; };
$("pgn-copy").addEventListener("click", async () => {
  const text = exportPgn(game);
  $("pgn-text").value = text;
  try { await navigator.clipboard.writeText(text); pgnMsg("PGN copied."); }
  catch { $("pgn-text").select(); pgnMsg("Copy blocked here: the text is selected, press copy on your keyboard.", true); }
});
$("pgn-download").addEventListener("click", () => {
  const text = exportPgn(game);
  $("pgn-text").value = text;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/x-chess-pgn" }));
  a.download = "picchess.pgn";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  pgnMsg("Downloaded picchess.pgn.");
});
$("pgn-load").addEventListener("click", () => {
  const r = importText($("pgn-text").value);
  if (!r.ok) return pgnMsg(r.error, true);
  const l = game.loadLine(r.startFen, r.moves);
  if (!l.ok) return pgnMsg(l.error, true);
  pgnMsg(`Loaded ${r.moves.length} move(s).`);
  render(false);
});

// ---- Board editor ----
// The editor works on its own copy (`edit`). `game` is only replaced when "Play this position" succeeds.
let scanned = null; // set while the editor shows a fresh scan: { fen, flagged, turn }
let editing = false, edit = null, iPlay = "w", tool = "move";
const pieceSvg = (letter, cls = "") => {
  const key = (letter === letter.toUpperCase() ? "w" : "b") + letter.toLowerCase();
  return `<svg viewBox="0 0 40 40"><g transform="scale(0.05)">${(PIECE_SVG[key] || "").replace(/^<g[^>]*>|<\/g>$/g, "")}</g></svg>`;
};

function buildPalette() {
  const box = $("palette");
  box.replaceChildren();
  const add = (id, label, html) => {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.tool = id; b.setAttribute("aria-label", label); b.innerHTML = html;
    b.addEventListener("click", () => setTool(id));
    box.appendChild(b);
  };
  add("move", "Move pieces by dragging", '<span class="txt">Drag</span>');
  for (const p of P.PIECES) add(p, `${p === p.toUpperCase() ? "White" : "Black"} ${{ k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" }[p.toLowerCase()]}`, pieceSvg(p));
  add("erase", "Eraser", '<span class="txt">Erase</span>');
}

function setTool(t) {
  tool = t;
  for (const b of $("palette").children) b.setAttribute("aria-pressed", String(b.dataset.tool === t));
  board.disableMoveInput();
  if (board.isSquareSelectEnabled()) board.disableSquareSelect(POINTER_EVENTS.pointerdown);
  if (!editing) return;
  if (t === "move") {
    board.enableMoveInput((e) => {
      if (e.type === INPUT_EVENT_TYPE.moveInputStarted) return !!e.piece;
      if (e.type === INPUT_EVENT_TYPE.validateMoveInput) {
        if (e.squareFrom !== e.squareTo) { edit = P.movePiece(edit, e.squareFrom, e.squareTo); setTimeout(renderEdit, 0); }
        return false;
      }
    });
  } else {
    board.enableSquareSelect(POINTER_EVENTS.pointerdown, (e) => {
      if (!e.square) return;
      const want = t === "erase" ? null : t;
      edit = P.setPiece(edit, e.square, edit.board[P.idx(e.square)] === want ? null : want); // tap the same piece again to remove it
      renderEdit();
    });
  }
}

let editSeq = 0;
async function renderEdit() {
  const seq = ++editSeq;
  const fen = P.toFen(edit);
  $("ed-fen").value = fen;
  document.querySelector(`input[name=turn][value=${edit.turn}]`).checked = true;
  document.querySelector(`input[name=iplay][value=${iPlay}]`).checked = true;
  const possible = P.inferCastling(edit.board);
  for (const cb of document.querySelectorAll(".castle")) {
    cb.disabled = !possible.includes(cb.value);
    cb.checked = edit.castling.includes(cb.value);
  }
  const ep = $("ep");
  ep.replaceChildren(new Option("none", "-"));
  for (const sq of P.legalEpSquares(edit)) ep.add(new Option(sq, sq));
  ep.value = edit.ep;
  const v = P.validate(edit);
  const errs = $("ed-errors");
  errs.replaceChildren(...v.errors.map((t) => Object.assign(document.createElement("li"), { textContent: t })));
  $("ed-play").disabled = !v.ok || (scanned && !scanned.confirmed);
  const banner = $("banner");
  banner.className = "";
  banner.textContent = `Editing: ${edit.turn === "w" ? "White" : "Black"} to move, you play ${iPlay === "w" ? "White" : "Black"}.`;
  // board last: these calls are async, and the panel above must already be current
  board.removeMarkers();
  await board.setPosition(P.toFen(edit).split(" ")[0], false);
  if (seq === editSeq && editing) await board.setOrientation(iPlay === "w" ? COLOR.white : COLOR.black);
  if (seq === editSeq && editing && scanned) markFlagged();
}

function enterEdit(startPos = null, startIPlay = null) {
  engine.stop();
  board.disableMoveInput();
  board.removeMarkers();
  drawArrows([], false);
  $("promo").hidden = true;
  if (!startPos) scanned = null;
  edit = startPos || P.parseFen(game.fen).position;
  iPlay = startIPlay || game.orientation;
  editing = true;
  for (const id of ["play-row", "hints", "fen-form", "moves"]) $(id).hidden = true;
  $("editor").hidden = false;
  setTool("move");
  renderEdit();
}

// "Check the board": always shown after a scan. Play stays locked until the user confirms the pieces match their picture.
function markFlagged() {
  board.removeMarkers(MARKER_TYPE.frame);
  if (scanned.confirmed) return;
  for (const i of scanned.flagged) board.addMarker(MARKER_TYPE.frame, P.sqName(i));
}
function startCheck(result) {
  const n = result.flagged.length;
  const box = $("ed-check");
  box.hidden = false; $("ed-recog").hidden = false; $("ed-reset").hidden = false;
  box.replaceChildren();
  const h = Object.assign(document.createElement("strong"), { textContent: "Check the board" });
  const p = Object.assign(document.createElement("p"), { textContent: `Compare it with your picture. ${n} square${n === 1 ? " is" : "s are"} outlined because the reader was unsure. Fix any wrong piece (pick a piece, tap the square), then confirm.` });
  const ok = Object.assign(document.createElement("button"), { type: "button", id: "ed-confirm", textContent: "The board matches my picture" });
  ok.addEventListener("click", () => { scanned.confirmed = true; box.hidden = true; renderEdit(); });
  box.append(h, p, ok);
  $("picker").hidden = true;
  syncBottom();
  renderEdit();
}
function syncBottom() {
  $("ed-bw").setAttribute("aria-pressed", String(iPlay === "w"));
  $("ed-bb").setAttribute("aria-pressed", String(iPlay === "b"));
}
for (const [id, c] of [["ed-bw", "w"], ["ed-bb", "b"]]) $(id).addEventListener("click", () => { iPlay = c; syncBottom(); renderEdit(); });
$("ed-flip").addEventListener("click", () => { iPlay = iPlay === "w" ? "b" : "w"; syncBottom(); renderEdit(); });
$("ed-swap").addEventListener("click", () => {
  const sw = (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase());
  let next = edit;
  for (let i = 0; i < 64; i++) { const sq = P.sqName(i), c = edit.board[i]; if (c) next = P.setPiece(next, sq, sw(c)); }
  setEdit(next);
});
$("ed-reset").addEventListener("click", () => {
  if (!scanned) return;
  scanned.confirmed = false;
  const pos = P.setTurn(P.parseFen(`${scanned.fen} w - - 0 1`).position, scanned.turn);
  enterEdit(pos, iPlay); startCheck({ flagged: scanned.flagged });
});

function leaveEdit() {
  editing = false;
  scanned = null;
  board.removeMarkers(MARKER_TYPE.frame);
  for (const id of ["ed-check", "ed-recog", "ed-reset", "picker"]) $(id).hidden = true;
  board.disableMoveInput();
  if (board.isSquareSelectEnabled()) board.disableSquareSelect(POINTER_EVENTS.pointerdown);
  $("editor").hidden = true;
  for (const id of ["play-row", "hints", "fen-form", "moves"]) $(id).hidden = false;
}

function setEdit(next) { edit = next; renderEdit(); }

$("edit").addEventListener("click", () => enterEdit());
$("ed-cancel").addEventListener("click", () => { leaveEdit(); render(false); });
$("about-open").addEventListener("click", (e) => { e.preventDefault(); $("about").hidden = false; });
$("about-close").addEventListener("click", () => { $("about").hidden = true; });
$("ed-clear").addEventListener("click", () => setEdit(P.emptyPosition()));
$("ed-start").addEventListener("click", () => setEdit(P.startPosition()));
for (const r of document.querySelectorAll("input[name=turn]")) r.addEventListener("change", () => setEdit(P.setTurn(edit, r.value)));
for (const r of document.querySelectorAll("input[name=iplay]")) r.addEventListener("change", () => { iPlay = r.value; renderEdit(); });
for (const cb of document.querySelectorAll(".castle")) cb.addEventListener("change", () => setEdit(P.setCastling(edit, cb.value, cb.checked)));
$("ep").addEventListener("change", () => setEdit(P.setEp(edit, $("ep").value)));
$("ed-copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("ed-fen").value); $("ed-copy").textContent = "Copied"; }
  catch { $("ed-fen").select(); $("ed-copy").textContent = "Select+copy"; }
  setTimeout(() => ($("ed-copy").textContent = "Copy"), 1500);
});
$("ed-play").addEventListener("click", () => {
  const v = P.validate(edit);
  if (!v.ok) return renderEdit();
  const r = game.loadFen(P.toFen(edit)); // only here is the running game replaced
  if (!r.ok) { $("ed-errors").replaceChildren(Object.assign(document.createElement("li"), { textContent: r.error })); return; }
  game.orientation = iPlay;
  leaveEdit();
  $("fen-error").textContent = "";
  render(false);
});
window.__picchess.editor = { get edit() { return edit; }, get editing() { return editing; } };

// ---- Scan image (ticket 05): input + grid finding; recognition comes later ----
const SCAN_HIDE = ["play-row", "hints", "fen-form", "moves", "board-wrap", "banner"];
const scan = initScan({
  onOpen: () => { engine.stop(); for (const id of SCAN_HIDE) $(id).hidden = true; },
  onClose: () => { for (const id of SCAN_HIDE) $(id).hidden = false; },
  onUseGrid: ({ turn, result, t0, timing }) => {
    const pos = P.setTurn(P.parseFen(`${result.fen} w - - 0 1`).position, turn);
    scanned = { fen: result.fen, flagged: result.flagged, turn };
    enterEdit(pos, result.bottom);
    startCheck(result);
    window.__picchess.lastScan = { fen: result.fen, bottom: result.bottom, flagged: result.flagged, ms: Math.round(performance.now() - t0), ...timing };
  },
});
window.__picchess.scan = scan;
const scanUrl = new URLSearchParams(location.search).get("scan");
const scanTarget = scanUrl && new URL(scanUrl, location.href);
if (scanTarget && scanTarget.origin === location.origin) { // same-origin only
  const q = new URLSearchParams(location.search);
  for (const [name, v] of [["scan-bottom", q.get("bottom")], ["scan-turn", q.get("turn")]]) {
    const r = v && document.querySelector(`input[name=${name}][value=${v}]`);
    if (r) r.checked = true;
  }
  scan.loadUrl(scanTarget.href);
}

await loadPieceSprite();
buildPalette();
const initial = new URLSearchParams(location.search).get("fen");
if (initial) { $("fen").value = initial; loadFromBox(); } else render(false);

// ---- Offline (service worker) ----
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").then(
    () => { navigator.serviceWorker.ready.then(() => { $("offline-state").textContent = "Works offline."; }); },
    () => { $("offline-state").textContent = ""; },
  );
}
