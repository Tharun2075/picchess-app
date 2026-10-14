# PicChess

Paste a chess position (a FEN) and keep playing it. Two people share one phone, pass-and-play.
Plain web page, no build step, no server, nothing leaves the browser.

## Who it is for
- "Take a picture of a chessboard ... converts it into an actual living chessboard": this ticket is the living board; the photo step comes in later tickets.
- "Two people sit on two sides of the phone and keep playing": pass-and-play, flip board button, both sides movable.
- "Screenshot of games from Instagram, Twitter": once a position is read out as FEN, paste it here.
- "Zero-fee product": no accounts, no API, no cost. Engine hints show the three best moves, from Stockfish running in your browser.

## What works (ticket 01)
- Board from a pasted FEN, with a clear error for bad input; "Start position"; "Flip board".
- Legal moves only, by drag or tap-tap (legal targets shown as dots), for both colours.
- Promotion picker, castling, en passant, check / checkmate / stalemate / draw banner.
- Undo and a move list in SAN (numbering follows the loaded FEN).
- `?fen=...` in the URL pre-loads a position.

## What works (ticket 02)
- "Engine hints" toggle (remembered in the browser, default on): up to 3 arrows on the board (best move strongest green) and a list with move, eval and depth.
- Eval is from White's point of view: +1.2 means White is better, -0.4 Black is slightly better, M3 means White mates in 3.
- Switch off and no search runs at all.
- Stockfish 19.0.1 lite (GPLv3, unmodified, in app/engine/, source link in app/engine/SOURCE.md). If it cannot load, the page says "Engine unavailable" and the board still works.

## What works (ticket 03)
- "Edit position" opens the board editor on a copy of the current position: piece palette (12 pieces + eraser), tap a square to place (tap the same piece again to remove), "Drag" tool to move pieces, "Clear", "Start position".
- Inputs: side to move, "I play" (board flips so your side is at the bottom), castling boxes (greyed out and unticked when king/rook are off their home squares), en passant dropdown (only squares that could really exist).
- Live FEN with a Copy button.
- "Play this position" is disabled with plain-language errors until: one king each, no pawns on rank 1/8, side not to move not in check, at most 16 pieces (and 8 pawns) per side.
- The running game and its move list are untouched until "Play this position"; Cancel throws the edit away.
- Pure model in app/lib/position.js (setPiece, movePiece, toFen, validate, inferCastling, legalEpSquares).

## Run
```
cd app && python3 -m http.server 8000 --bind 127.0.0.1
# open http://127.0.0.1:8000/
```
Must be served over http (ES modules do not load from file://).

## Test
```
npm test
```
Runs `node --test tests/` (game rules, editor model in tests/position.test.mjs, UCI parsing on recorded Stockfish lines, engine on/off with a stub worker).

## Layout
- app/index.html, main.js, style.css: the page
- app/lib/game.js: pure game module (no DOM) wrapping chess.js
- app/lib/position.js: pure board-editor model
- app/lib/uci.js, engine.js: UCI parsing and the Stockfish worker wrapper
- app/engine/: Stockfish files, COPYING, SOURCE.md
- tools/proof02.mjs, proof03.mjs: proof drivers
- app/lib/pgn.js: PGN export / import; app/sw.js, manifest.webmanifest, icons/, _headers, licenses.html: PWA and hosting
- tools/stamp-sw.mjs (precache list + version), make_icons.py, proof04.mjs; docs/DEPLOY.md, vercel.json
- app/vendor/: chess.js, cm-chessboard, Chessnut pieces, each with its LICENSE (see app/vendor/README.md)
- docs/: proof screenshot (docs/screenshot.png), DECISIONS.md

## Known limits
- Engine download is about 1.8 MB; the first search is slower on phones. Each position is searched for 1.5 s.
- Hints stop at game over. Not tested on a real phone.
- Offline needs one online first load; iOS may evict the cache of a site not opened for weeks. Install/offline was proven in desktop headless Chrome only, not on a real iPhone or Android.
- No clocks, no resign/draw offer, no saving a game across reloads.
- Undo goes back to the loaded position only, no redo.
- The proof screenshot shows the FEN loaded via `?fen=`; drag and tap-tap were checked by logic tests of game.js, not by an automated browser run. Test them on a real phone.
- Minimal English-only UI. Mobile Safari not tested here.

- Editor: dragging pieces is wired to the same model as tapping but only tap-placing was driven in the automated browser run (docs/proof-03-board-editor.txt); try drag on a real phone. No FEN import into the editor (paste into "Paste a FEN", then Edit). Move counters are reset to 0 / 1 on Play.

## Decisions made headlessly (ticket 02)
See docs/DECISIONS.md: lite single-threaded build (no special server headers), MultiPV 3 with 1.5 s per position, eval shown from White's side, hints default on.

## Decisions made headlessly (ticket 03)
See docs/DECISIONS.md: editor works on a copy, castling rights only ever auto-removed (never auto-ticked), en passant limited to legal squares.

## Release 1 (ticket 04): PGN, offline install, static hosting
- **PGN**: under the move list, "Copy PGN", "Download .pgn" and "Load PGN / FEN". A game that began from a custom position gets `[SetUp "1"]` and `[FEN "..."]`. The box accepts a full PGN or a bare FEN.
- **Offline / install**: `app/sw.js` precaches the page, vendor files and Stockfish (js + wasm). After one online load the app (including hints) works with no network; browsers offer "Install app" / "Add to Home Screen".
- **Hosting**: `app/_headers` (Cloudflare Pages), `vercel.json` (Vercel Hobby), steps in docs/DEPLOY.md. Not deployed.
- **After editing any file in app/** run `node tools/stamp-sw.mjs`; `npm test` fails if the stamp is stale. Icons: `python3 tools/make_icons.py`.
- Licences: app/licenses.html (linked from the page footer).
- Run: `cd app && python3 -m http.server 8000`, open http://localhost:8000 . Tests: `npm test`.
- Proof: docs/proof-04-pgn-pwa-release1.txt/.png (server killed after first load, app still renders, plays, exports PGN and runs Stockfish hints). Driver: tools/proof04.mjs.

### Who it answers
- "Take a picture of a chessboard ... living chessboard": the editor and FEN/PGN import give the living board; photo recognition is a later ticket.
- "Top three moves ... enable or disable": Stockfish hints with toggle, now offline.
- "Two people sit on two sides of the phone": installable on a phone, pass-and-play, PGN to keep or share a game.
- "Zero-fee product": static files only, free hosting, no accounts, no server calls.

## Scan an image (ticket 05)
"Scan image" (next to Start position) takes a screenshot or photo and finds the 8x8 grid. The picture is shrunk to at most 1024 px in a canvas and never leaves the device.
- Get the picture in with Upload image, Take picture (`capture="environment"`, opens the camera on phones), paste (Ctrl/Cmd+V) or drag-drop.
- Before recognition you answer two things: which colour is at the bottom of the picture, and whose move it is.
- app/lib/grid.js is a classical finder (no ML): it searches for the square whose 9+9 grid lines have the strongest edges and checks the light/dark checker pattern. It returns box + confidence.
- If the box is wrong or not found, drag the 4 yellow corner dots; app/lib/homography.js (4-point DLT) warps the quad to a 512x512 board and cuts 64 tiles in a8..h1 order for the chosen orientation.
- "Use this grid" is a placeholder: there is no piece recognition yet (ONNX classifier is tickets 06-08). It opens the editor with an empty board, the chosen side to move and "I play" set, so pieces are placed by hand.
- ml/render_screens.py makes the 200 synthetic screenshots (5 themes, chrome, margins, borders, flipped boards) in tests/fixtures/screens/ with truth.json. `python3 -m venv .venv && .venv/bin/pip install -r ml/requirements.txt && .venv/bin/python ml/render_screens.py tests/fixtures/screens 200`. Piece art in ml/assets/pieces is the Chessnut set (Apache-2.0) rendered to PNG.
- Proof: docs/proof-05-image-input-screenshot-grid.png/.txt (tools/proof05.mjs).

Example posts this answers:
- "Take a picture of a chessboard ... living chessboard": camera/upload/paste of the board image, grid found, tiles cut; piece recognition comes next.
- "Screenshot of a game, tell me the best move": the screenshot flow starts here; the grid is found, pieces still by hand for now.
- "Two people sit on two sides of the phone": bottom colour and side to move are asked, so either side can scan.

Known limits (ticket 05): the finder gets 197 of 200 synthetic screenshots within 2% of the board side; the 3 misses (038, 063, 158) are off by about one square, and its confidence does not separate them (0.92-1.0), so always glance at the overlay. Real photos with perspective need the corner dots. Only synthetic screenshots tested; not tried on a real iPhone or Android. Run tests with `npm test` (tests/grid.test.mjs, tests/homography.test.mjs).

## Screenshot dataset (ticket 06)
Training data for the screenshot square classifier (tickets 07-08). Nothing here is shipped in the app and no image is committed.
- Make it (about 4 minutes, 1.6 GB in `data/screens/`, same result every time for the same seed):
  ```
  python3 -m venv .venv && .venv/bin/pip install -r ml/requirements.txt
  .venv/bin/python ml/make_screen_dataset.py --out data/screens --seed 6
  .venv/bin/python ml/make_dataset_card.py      # rewrites docs/DATASET.md and data/SOURCES.md
  ```
- Test: `npm test` (runs ml/test_dataset.py through tests/dataset.test.mjs; it skips with a message if `.venv` is missing). Directly: `.venv/bin/python ml/test_dataset.py`.
- 21,000 boards: 18,000 train, 1,200 val (same themes and piece sets), 1,800 held out (4 themes and 2 piece sets never seen in training). 13 classes, 32x32 grey tiles, empty squares about 50% of tiles (cap 60%).
- Real screenshots: drop them in `data/real_screens/` and list them in `labels.csv` (`file,fen,orientation`), see data/real_screens/README.md.
- Card with class counts, themes, piece sets and licences: docs/DATASET.md; sources: data/SOURCES.md; sample: docs/dataset-sample.png.
- Files: ml/make_screen_dataset.py (positions, rendering, slicing), ml/piece_sets.py, ml/make_dataset_card.py, ml/make_sample_sheet.py, ml/test_dataset.py.

Example posts this answers:
- "Take a picture of a chessboard ... living chessboard": the data to teach the browser model to read pieces off a board image.
- "Screenshot of games from Instagram, Twitter": many themes, sizes, JPEG damage, blur, arrows, highlights, dark mode, coordinates.
- "Two people on two sides of the phone": both orientations (white or black at the bottom) are generated and labelled.
- "Zero-fee product": all generated locally with Pillow; no API, no download, no model call.

Known limits (ticket 06): synthetic only, 5 piece sets and 14 themes (some piece art comes from system fonts, used for local training images only); positions are random playouts without castling, en passant or check rules; grey tiles only; accuracy on real screenshots is unmeasured until the owner adds some to `data/real_screens/`.
