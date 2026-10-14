// "Scan image" panel: pick / take / paste / drop a picture, find the board grid, let the user fix the
// 4 corners, then read the position with the square classifier (onnxruntime-web, loaded on first use).
// Everything stays in this page unless the user ticks "Help improve PicChess" (see lib/share.js).
import { findBoard, boxCorners } from "./lib/grid.js";
import { recognise } from "./lib/recognise.js";
import { loadModel } from "./lib/model.js";
import { isShareOn, setShareOn, encodeJpeg, countScan } from "./lib/share.js";
import { computeHomography, applyHomography, warpQuad, sliceTiles, squareNames } from "./lib/homography.js";

const $ = (id) => document.getElementById(id);
const MAX_SIDE = 1024; // downscale big photos/screenshots before any work
const HANDLE = 14;

export function initScan({ onOpen, onClose, onUseGrid }) {
  const canvas = $("scan-canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
  const st = { img: null, corners: null, tiles: null, board: null, drag: -1, found: null, t0: 0, manualBottom: false, reading: false, source: "screenshot" };

  const bottom = () => document.querySelector("input[name=scan-bottom]:checked").value;
  const turn = () => document.querySelector("input[name=scan-turn]:checked").value;
  const say = (t, bad = false) => { $("scan-msg").textContent = t; $("scan-msg").className = bad ? "bad" : ""; };

  function open() { $("scan").hidden = false; onOpen(); }
  function close() { $("scan").hidden = true; onClose(); }

  async function loadBlob(blob) {
    st.t0 = performance.now(); st.manualBottom = false;
    if (!blob || !blob.type.startsWith("image/")) return say("That is not an image.", true);
    open();
    say("Reading image...");
    let bmp;
    try { bmp = await createImageBitmap(blob); } catch {
      bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); }).catch(() => null);
    }
    if (!bmp) return say("Could not read that image.", true);
    const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const w = Math.round(w0 * k), h = Math.round(h0 * k);
    canvas.width = w; canvas.height = h;
    ctx.drawImage(bmp, 0, 0, w, h);
    st.img = ctx.getImageData(0, 0, w, h);
    st.base = ctx.getImageData(0, 0, w, h);
    countScan();
    detect();
    if (st.found && st.found.confidence >= 0.35) readPosition(); // confident grid: go straight to the check step
  }

  // grid -> 64 tiles -> model -> position; hands the result to the editor ("check the board" step)
  async function readPosition() {
    if (st.reading || !st.corners) return;
    st.reading = true; $("scan-use").disabled = true;
    try {
      say("Reading the position...");
      const tm = performance.now();
      const run = await loadModel();
      const loadMs = performance.now() - tm, tr = performance.now();
      const result = await recognise(st.img, st.corners, run, { bottom: st.manualBottom ? bottom() : null });
      const t = { loadMs, readMs: performance.now() - tr };
      document.querySelector(`input[name=scan-bottom][value=${result.bottom}]`).checked = true;
      close();
      onUseGrid({ turn: turn(), result, t0: st.t0, timing: t });
    } catch (e) {
      console.error(e);
      say("Could not read the position. You can still set the pieces by hand.", true);
    } finally { st.reading = false; $("scan-use").disabled = false; }
  }

  function detect() {
    const r = findBoard(st.img);
    st.found = r;
    if (r && r.confidence >= 0.35) {
      st.corners = boxCorners(r);
      say(`Board found (${Math.round(r.confidence * 100)}% sure). Check the grid; drag a corner dot if it is off.`);
    } else {
      const m = Math.round(Math.min(st.img.width, st.img.height) * 0.1), s = Math.min(st.img.width, st.img.height) - 2 * m;
      st.corners = boxCorners({ x: (st.img.width - s) / 2, y: (st.img.height - s) / 2, size: s });
      say("Not sure where the board is. Drag the 4 corner dots onto the board corners.", true);
    }
    refresh();
  }

  function refresh() {
    st.board = warpQuad(st.img, st.corners, 512);
    st.tiles = sliceTiles(st.board, bottom());
    drawOverlay();
    drawTiles();
    $("scan-use").disabled = false;
  }

  function drawOverlay() {
    ctx.putImageData(st.base, 0, 0);
    const H = computeHomography([[0, 0], [8, 0], [8, 8], [0, 8]], st.corners);
    const px = Math.max(1.5, canvas.width / 300);
    ctx.lineWidth = px; ctx.strokeStyle = "rgba(255,40,120,.95)";
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const [a, b] = [applyHomography(H, [i, 0]), applyHomography(H, [i, 8])];
      const [c, d] = [applyHomography(H, [0, i]), applyHomography(H, [8, i])];
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    }
    ctx.stroke();
    const r = HANDLE * (canvas.width / canvas.clientWidth || 1);
    for (const [x, y] of st.corners) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = "rgba(255,210,0,.9)"; ctx.fill();
      ctx.lineWidth = px; ctx.strokeStyle = "#000"; ctx.stroke();
    }
  }

  function drawTiles() {
    const box = $("scan-tiles");
    const names = squareNames();
    if (box.children.length !== 64) {
      box.replaceChildren(...names.map((n) => { const c = document.createElement("canvas"); c.width = c.height = 64; c.title = n; c.setAttribute("aria-label", n); return c; }));
    }
    st.tiles.forEach((t, i) => box.children[i].getContext("2d").putImageData(new ImageData(t.data, t.width, t.height), 0, 0));
    $("scan-tiles-note").textContent = `64 tiles, ${bottom() === "w" ? "White" : "Black"} at the bottom: a8 first, h1 last.`;
  }

  // corner dragging
  const toImg = (e) => { const b = canvas.getBoundingClientRect(); return [((e.clientX - b.left) * canvas.width) / b.width, ((e.clientY - b.top) * canvas.height) / b.height]; };
  canvas.addEventListener("pointerdown", (e) => {
    if (!st.corners) return;
    const [x, y] = toImg(e), scale = canvas.width / canvas.clientWidth;
    let best = -1, bd = 36 * scale;
    st.corners.forEach(([cx, cy], i) => { const d = Math.hypot(cx - x, cy - y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { st.drag = best; canvas.setPointerCapture(e.pointerId); e.preventDefault(); }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (st.drag < 0) return;
    const [x, y] = toImg(e);
    st.corners[st.drag] = [Math.max(0, Math.min(canvas.width, x)), Math.max(0, Math.min(canvas.height, y))];
    drawOverlay();
  });
  const endDrag = () => { if (st.drag >= 0) { st.drag = -1; try { refresh(); } catch { say("Those corners do not make a board shape.", true); } } };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // inputs: picker, camera, paste, drop
  for (const id of ["scan-file", "scan-cam"]) $(id).addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; st.source = id === "scan-cam" ? "photo" : "screenshot"; if (f) loadBlob(f); });
  document.addEventListener("paste", (e) => {
    const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (it) { e.preventDefault(); st.source = "screenshot"; loadBlob(it.getAsFile()); }
  });
  const drop = $("scan-drop");
  for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith("image/")); if (f) { st.source = "screenshot"; loadBlob(f); } });
  for (const r of document.querySelectorAll("input[name=scan-bottom]")) r.addEventListener("change", () => { st.manualBottom = true; if (st.corners) refresh(); });
  $("scan-redo").addEventListener("click", () => st.img && detect());
  $("scan-open").addEventListener("click", open);
  $("scan-close").addEventListener("click", close);
  $("scan-use").addEventListener("click", readPosition);

  // opt-in sharing: the choice lives in localStorage; nothing is sent from here, main.js sends after the user confirms
  const tick = $("scan-share");
  tick.checked = isShareOn();
  tick.addEventListener("change", () => setShareOn(tick.checked));
  async function shareContext() {
    if (!st.img || !st.corners) return null;
    // only the warped, straightened board leaves the device: nothing outside the corner quad, and no corner numbers
    const board = warpQuad(st.img, st.corners, 512);
    const c = document.createElement("canvas"); c.width = board.width; c.height = board.height;
    c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(board.data), board.width, board.height), 0, 0);
    const image = await encodeJpeg(c, 250 * 1024);
    return { image, source: st.source };
  }

  // ?scan=<same-origin image url> opens the panel on that image (used by the proof run and for quick tries)
  async function loadUrl(url) { try { await loadBlob(await (await fetch(url)).blob()); } catch { say("Could not load that image.", true); } }

  return { loadBlob, loadUrl, state: st, open, close, shareContext };
}
