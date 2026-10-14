import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import * as ort from "onnxruntime-node";
import { decodePng } from "./helpers/png.mjs";
import { boxCorners } from "../app/lib/grid.js";
import { recognise, readProbs, flagSquares, guessBottom, placementOf, orient } from "../app/lib/recognise.js";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = path.join(root, "tests", "fixtures", "held");
const truth = JSON.parse(fs.readFileSync(path.join(dir, "truth.json"), "utf8"));
const session = await ort.InferenceSession.create(path.join(root, "app", "models", "squares-screen.onnx"));
const run = async (input) => (await session.run({ tiles: new ort.Tensor("float32", input, [64, 1024]) })).probs.data;

// 30 validation boards: new positions, never in the training split (same piece sets and themes as training; see README).
test("30 held-out rendered screenshots: at least 27 boards exactly right", async () => {
  let exact = 0, sq = 0, orientOk = 0, ms = 0;
  const bad = [];
  for (const [file, t] of Object.entries(truth)) {
    const img = decodePng(fs.readFileSync(path.join(dir, file)));
    const t0 = performance.now();
    const r = await recognise(img, boxCorners({ x: t.box[0], y: t.box[1], size: t.box[2] }), run);
    ms += performance.now() - t0;
    if (r.bottom === t.orientation) orientOk++;
    const want = placementOf([...t.fen.replace(/\d/g, (d) => "1".repeat(d)).replace(/\//g, "")]);
    if (r.fen === want) exact++; else bad.push(`${file} ${t.theme}/${t.piece_set}`);
    sq += r.squares.filter((s, i) => s.piece === [...t.fen.replace(/\d/g, (d) => "1".repeat(d)).replace(/\//g, "")][i]).length;
  }
  console.log(`# exact ${exact}/30, squares ${sq}/1920, orientation ${orientOk}/30, mean ${(ms / 30).toFixed(0)} ms per board (node, wasm cpu); wrong: ${bad.join(", ")}`);
  assert.ok(exact >= 27, `only ${exact}/30 exact: ${bad.join(", ")}`);
  assert.ok(orientOk >= 28, `orientation ${orientOk}/30`);
});

const tile = (piece, conf, second = 0) => ({ piece, conf, margin: conf - second });

test("flagSquares: lowest 4 always, under 0.8, and close top-2", () => {
  const tiles = Array.from({ length: 64 }, (_, i) => tile("1", 0.99 - i * 1e-4));
  assert.deepStrictEqual(flagSquares(tiles), [60, 61, 62, 63]); // lowest four only
  tiles[5] = tile("N", 0.7);                                      // under the threshold
  tiles[9] = tile("p", 0.9, 0.8);                                 // confident-ish but top-2 close
  assert.deepStrictEqual(flagSquares(tiles), [5, 9, 62, 63]);     // 5 and 9 are also among the lowest four
  assert.deepStrictEqual(flagSquares(tiles, { lowest: 0 }), [5, 9]);
  assert.deepStrictEqual(flagSquares(tiles, { lowest: 1, minConf: 0, gap: 0 }), [5]);
});

test("readProbs picks top class and margin", () => {
  const p = new Float32Array(64 * 13);
  p[0 * 13 + 6] = 0.6; p[0 * 13 + 5] = 0.3;
  const t = readProbs(p)[0];
  assert.strictEqual(t.piece, "P"); assert.strictEqual(t.second, "N"); assert.ok(Math.abs(t.margin - 0.3) < 1e-6);
});

test("guessBottom and orient", () => {
  const start = [...("rnbqkbnrpppppppp" + "1".repeat(32) + "PPPPPPPPRNBQKBNR")].map((p) => tile(p, 1));
  assert.strictEqual(guessBottom(start), "w");
  const flipped = orient(start, "b");
  assert.strictEqual(guessBottom(flipped), "b");
  assert.strictEqual(placementOf(orient(flipped, "b").map((t) => t.piece)), "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
});
