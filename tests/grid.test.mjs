import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./helpers/png.mjs";
import { findBoard, boxCorners } from "../app/lib/grid.js";
import { warpQuad, sliceTiles, squareNames } from "../app/lib/homography.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "screens");
const truth = JSON.parse(fs.readFileSync(path.join(dir, "truth.json"), "utf8"));
const names = Object.keys(truth);

test("fixture set has 200 rendered screenshots with 3+ themes", () => {
  assert.equal(names.length, 200);
  assert.ok(new Set(names.map((n) => truth[n].theme)).size >= 3);
});

test("finder gets the board box within 2% of side on >= 95% of 200 screenshots", () => {
  let ok = 0; const bad = [];
  for (const n of names) {
    const img = decodePng(fs.readFileSync(path.join(dir, n)));
    const r = findBoard(img), [x, y, s] = truth[n].box;
    if (r && [r.x - x, r.y - y, r.size - s].every((d) => Math.abs(d) <= 0.02 * s)) ok++; else bad.push(n);
  }
  assert.ok(ok / names.length >= 0.95, `only ${ok}/${names.length}; misses: ${bad.join(",")}`);
});

test("blank image gives no confident board", () => {
  const w = 300, h = 300, data = new Uint8ClampedArray(w * h * 4).fill(128);
  const r = findBoard({ width: w, height: h, data });
  assert.ok(!r || r.confidence < 0.2);
});

test("warp + slice: 64 tiles in a8..h1 order, tile colours match the board for both orientations", () => {
  const n = names.find((k) => truth[k].kind === "square" && !truth[k].flipped) ?? names[0];
  const img = decodePng(fs.readFileSync(path.join(dir, n)));
  const [x, y, s] = truth[n].box;
  const warped = warpQuad(img, boxCorners({ x, y, size: s }), 512);
  assert.equal(warped.width, 512);
  const w = sliceTiles(warped, "w"), b = sliceTiles(warped, "b");
  assert.equal(w.length, 64);
  assert.equal(w[0].width, 64);
  assert.equal(squareNames()[0], "a8"); assert.equal(squareNames()[63], "h1");
  // same image sliced as black-at-bottom: a8 comes from the bottom-right cell = w[63] pixels
  assert.deepEqual(Array.from(b[0].data), Array.from(w[63].data));
  assert.deepEqual(Array.from(b[63].data), Array.from(w[0].data));
});
