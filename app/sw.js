// Service worker: precaches the app shell (pages, vendor files, Stockfish js+wasm) so the app works offline.
// The recogniser files (onnxruntime-web wasm, the model: LAZY_PREFIXES) go into a second cache that fills the first time a scan runs.
// The block between the markers is rewritten by `node tools/stamp-sw.mjs`; tests/sw.test.mjs fails if it is stale.
// BEGIN GENERATED
const VERSION = "2a4e61816d91";
const ML_VERSION = "1e302798d00f";
const LAZY_PREFIXES = ["./vendor/onnxruntime-web/","./models/"];
const PRECACHE = [
  "./",
  "./engine/COPYING",
  "./engine/SOURCE.md",
  "./engine/stockfish-19-lite-single.js",
  "./engine/stockfish-19-lite-single.wasm",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon.svg",
  "./index.html",
  "./lib/engine.js",
  "./lib/game.js",
  "./lib/grid.js",
  "./lib/homography.js",
  "./lib/model.js",
  "./lib/pgn.js",
  "./lib/position.js",
  "./lib/recognise.js",
  "./lib/share.js",
  "./lib/uci.js",
  "./licenses.html",
  "./main.js",
  "./manifest.webmanifest",
  "./privacy.html",
  "./samples/sample-phone-green.png",
  "./scan.js",
  "./social-card-square.png",
  "./social-card.png",
  "./style.css",
  "./vendor/chess.js/chess.js",
  "./vendor/chess.js/LICENSE",
  "./vendor/chessnut/bB.svg",
  "./vendor/chessnut/bK.svg",
  "./vendor/chessnut/bN.svg",
  "./vendor/chessnut/bP.svg",
  "./vendor/chessnut/bQ.svg",
  "./vendor/chessnut/bR.svg",
  "./vendor/chessnut/LICENSE",
  "./vendor/chessnut/wB.svg",
  "./vendor/chessnut/wK.svg",
  "./vendor/chessnut/wN.svg",
  "./vendor/chessnut/wP.svg",
  "./vendor/chessnut/wQ.svg",
  "./vendor/chessnut/wR.svg",
  "./vendor/cm-chessboard/assets/chessboard.css",
  "./vendor/cm-chessboard/assets/extensions/markers/markers.css",
  "./vendor/cm-chessboard/assets/extensions/markers/markers.scss",
  "./vendor/cm-chessboard/assets/extensions/markers/markers.svg",
  "./vendor/cm-chessboard/assets/pieces/chessnut-sprite.svg",
  "./vendor/cm-chessboard/LICENSE",
  "./vendor/cm-chessboard/src/Chessboard.js",
  "./vendor/cm-chessboard/src/extensions/markers/Markers.js",
  "./vendor/cm-chessboard/src/extensions/markers/README.md",
  "./vendor/cm-chessboard/src/lib/Svg.js",
  "./vendor/cm-chessboard/src/lib/Utils.js",
  "./vendor/cm-chessboard/src/model/ChessboardState.js",
  "./vendor/cm-chessboard/src/model/Extension.js",
  "./vendor/cm-chessboard/src/model/Position.js",
  "./vendor/cm-chessboard/src/view/ChessboardView.js",
  "./vendor/cm-chessboard/src/view/PositionAnimationsQueue.js",
  "./vendor/cm-chessboard/src/view/VisualMoveInput.js",
  "./vendor/README.md",
];
// END GENERATED
const CACHE = `picchess-${VERSION}`;
const ML_CACHE = `picchess-ml-${ML_VERSION}`;
const isLazy = (url) => LAZY_PREFIXES.some((p) => url.pathname.startsWith(new URL(p, self.registration.scope).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("picchess-") && k !== CACHE && k !== ML_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (isLazy(new URL(req.url))) {
    event.respondWith((async () => {
      const cache = await caches.open(ML_CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // ignoreSearch: "index.html?fen=..." is served from the cached shell.
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); }
    catch (e) {
      if (req.mode === "navigate") { const shell = await cache.match("./index.html"); if (shell) return shell; }
      throw e;
    }
  })());
});
