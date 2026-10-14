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
Runs `node --test tests/` (36 tests: game rules, UCI parsing on recorded Stockfish lines, engine on/off with a stub worker).

## Layout
- app/index.html, main.js, style.css: the page
- app/lib/game.js: pure game module (no DOM) wrapping chess.js
- app/lib/uci.js, engine.js: UCI parsing and the Stockfish worker wrapper
- app/engine/: Stockfish files, COPYING, SOURCE.md
- tools/proof02.mjs: proof driver
- app/vendor/: chess.js, cm-chessboard, Chessnut pieces, each with its LICENSE (see app/vendor/README.md)
- docs/: proof screenshot (docs/screenshot.png), DECISIONS.md

## Known limits
- Engine download is about 1.8 MB; the first search is slower on phones. Each position is searched for 1.5 s.
- Hints stop at game over. Not tested on a real phone.
- No PWA manifest or service worker yet (installable app is a later ticket).
- No clocks, no resign/draw offer, no saving a game across reloads.
- Undo goes back to the loaded position only, no redo.
- The proof screenshot shows the FEN loaded via `?fen=`; drag and tap-tap were checked by logic tests of game.js, not by an automated browser run. Test them on a real phone.
- Minimal English-only UI. Mobile Safari not tested here.

## Decisions made headlessly (ticket 02)
See docs/DECISIONS.md: lite single-threaded build (no special server headers), MultiPV 3 with 1.5 s per position, eval shown from White's side, hints default on.
