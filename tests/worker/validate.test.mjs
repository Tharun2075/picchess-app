import test from "node:test";
import assert from "node:assert/strict";
import { validateShare, fenOk, cleanSrc, cleanPath, hitKey, corsOrigin } from "../../worker/validate.mjs";
import { good, jpegB64, webpB64, FEN } from "./helpers.mjs";

test("good screenshot and photo payloads pass", () => {
  const a = validateShare(good()); assert.ok(a.ok); assert.equal(a.ext, "jpg");
  const b = validateShare(good({ source: "photo", image: webpB64(), corners: [[0, 0], [1, 0], [1, 1], [0, 1]], predictedFen: "" }));
  assert.ok(b.ok); assert.equal(b.ext, "webp");
  assert.equal("image" in a.value, false);
});
test("image over 1 MB is 413", () => {
  const r = validateShare(good({ image: jpegB64(1024 * 1024 + 10) })); assert.equal(r.ok, false); assert.equal(r.status, 413);
});
test("wrong magic bytes rejected even if claimed jpeg", () => {
  const r = validateShare(good({ image: Buffer.from("GIF89a-not-a-jpeg-at-all").toString("base64") })); assert.equal(r.ok, false); assert.equal(r.status, 400);
});
test("bad fen regex, missing king, wrong square count", () => {
  assert.equal(validateShare(good({ correctedFen: "hello" })).ok, false);
  assert.equal(validateShare(good({ correctedFen: "rnbq1bnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1" })).ok, false);
  assert.equal(validateShare(good({ correctedFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBN b KQkq e3 0 1" })).ok, false);
  assert.equal(validateShare(good({ predictedFen: "8/8/8/8/8/8/8/8" })).ok, false);
  assert.ok(fenOk(FEN));
});
test("bad enums, unknown key, bad corners, bad version", () => {
  assert.equal(validateShare(good({ source: "video" })).ok, false);
  assert.equal(validateShare(good({ orientation: "left" })).ok, false);
  assert.equal(validateShare(good({ sideToMove: "x" })).ok, false);
  assert.equal(validateShare({ ...good(), extra: 1 }).ok, false);
  assert.equal(validateShare(good({ corners: [[0, 0], [1, 0], [1, 1]] })).ok, false);
  assert.equal(validateShare(good({ corners: [[0, 0], [1, 0], [1, 1], [0, 1.5]] })).ok, false);
  assert.equal(validateShare(good({ appVersion: "x".repeat(33) })).ok, false);
  assert.equal(validateShare(good({ appVersion: 3 })).ok, false);
});
test("visit key sanitiser", () => {
  assert.equal(cleanSrc("Twitter"), "twitter");
  assert.equal(cleanSrc("a b|c<script>"), "abcscript");
  assert.equal(cleanSrc("x".repeat(60)).length, 24);
  assert.equal(cleanSrc(""), "direct");
  assert.equal(cleanSrc(null), "direct");
  assert.equal(cleanPath("scan|evil"), "other"); assert.equal(cleanPath("scan"), "scan");
  assert.equal(hitKey("2026-10-14", "X|Y", "/"), "hit|2026-10-14|xy|/");
});
test("cors allow list", () => {
  assert.equal(corsOrigin("https://picchess.pages.dev"), "https://picchess.pages.dev");
  assert.equal(corsOrigin("http://localhost:8765"), "http://localhost:8765");
  assert.equal(corsOrigin("https://evil.example"), null);
  assert.equal(corsOrigin("http://localhost.evil.com"), null);
});
