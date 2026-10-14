import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { shareBoard, countVisit, SHARE_URL, SHARE_ORIGIN, isShareOn, setShareOn } from "../app/lib/share.js";
import { FEN, jpegB64 } from "./worker/helpers.mjs";

const ctx = { image: jpegB64(), source: "screenshot", corners: [[0, 0], [1, 0], [1, 1], [0, 1]], predictedFen: "" };
const mkFetch = (log, ok = true) => async (url, init) => { log.push({ url, init }); return { ok }; };

test("POSTs once when ticked and confirmed, with the right fields", async () => {
  const log = []; let done = 0;
  assert.equal(await shareBoard({ ctx, correctedFen: FEN, orientation: "w", enabled: true, fetchFn: mkFetch(log), onDone: () => done++ }), true);
  assert.equal(log.length, 1); assert.equal(log[0].url, SHARE_URL); assert.equal(done, 1);
  const b = JSON.parse(log[0].init.body);
  assert.equal(b.corners, null); assert.equal(b.sideToMove, "b"); assert.equal(b.orientation, "white"); assert.equal(b.predictedFen, "");
});
test("never posts when unticked or before confirmation (no context)", async () => {
  const log = [];
  assert.equal(await shareBoard({ ctx, correctedFen: FEN, orientation: "w", enabled: false, fetchFn: mkFetch(log) }), false);
  assert.equal(await shareBoard({ ctx: null, correctedFen: FEN, orientation: "w", enabled: true, fetchFn: mkFetch(log) }), false);
  assert.equal(await shareBoard({ ctx, correctedFen: "", orientation: "w", enabled: true, fetchFn: mkFetch(log) }), false);
  assert.equal(log.length, 0);
});
test("failures are silent, no retry", async () => {
  const log = []; let done = 0;
  assert.equal(await shareBoard({ ctx, correctedFen: FEN, orientation: "b", enabled: true, fetchFn: mkFetch(log, false), onDone: () => done++ }), false);
  assert.equal(await shareBoard({ ctx, correctedFen: FEN, orientation: "b", enabled: true, fetchFn: async () => { throw new Error("net"); }, onDone: () => done++ }), false);
  assert.equal(log.length, 1); assert.equal(done, 0);
});
test("photo keeps corners", async () => {
  const log = [];
  await shareBoard({ ctx: { ...ctx, source: "photo" }, correctedFen: FEN, orientation: "black", enabled: true, fetchFn: mkFetch(log) });
  assert.equal(JSON.parse(log[0].init.body).corners.length, 4);
});
test("choice is remembered; default off", () => {
  const m = new Map(); const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(isShareOn(st), false); setShareOn(true, st); assert.equal(isShareOn(st), true);
});
test("visit beacon sends utm_source and strips utm_* from the URL", () => {
  const sent = []; let url = null;
  countVisit({ loc: { search: "?utm_source=Reddit&utm_medium=x&fen=abc", pathname: "/", hash: "" }, hist: { replaceState: (a, b, u) => (url = u) }, beacon: (u) => sent.push(u) });
  assert.match(sent[0], /\/hit\?src=Reddit&p=%2F$/); assert.equal(url, "/?fen=abc");
  countVisit({ loc: { search: "", pathname: "/", hash: "" }, hist: { replaceState: () => assert.fail("no change") }, beacon: (u) => sent.push(u) });
  assert.match(sent[1], /src=direct/);
});
test("CSP connect-src names exactly the Worker origin; page text and defaults", () => {
  const h = fs.readFileSync(new URL("../app/_headers", import.meta.url), "utf8");
  assert.match(h, new RegExp(`connect-src 'self' ${SHARE_ORIGIN.replace(/\./g, "\\.")};`));
  const html = fs.readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
  assert.ok(html.includes("Stays on this device unless you tick 'Help improve PicChess'."));
  assert.ok(html.includes("Help improve PicChess: share this board and my corrections as free, public training data"));
  assert.doesNotMatch(html, /id="scan-share"[^>]*checked/);
});
