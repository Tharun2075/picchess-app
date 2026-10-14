# PicChess

Paste a chess position (a FEN) and keep playing it. Two people share one phone, pass-and-play.
Plain web page, no build step, no server, nothing leaves the browser.

## Who it is for
- "Take a picture of a chessboard ... converts it into an actual living chessboard": this ticket is the living board; the photo step comes in later tickets.
- "Two people sit on two sides of the phone and keep playing": pass-and-play, flip board button, both sides movable.
- "Screenshot of games from Instagram, Twitter": once a position is read out as FEN, paste it here.
- "Zero-fee product": no accounts, no API, no cost. (Engine hints with top three moves come in a later ticket.)

## What works (ticket 01)
- Board from a pasted FEN, with a clear error for bad input; "Start position"; "Flip board".
- Legal moves only, by drag or tap-tap (legal targets shown as dots), for both colours.
- Promotion picker, castling, en passant, check / checkmate / stalemate / draw banner.
- Undo and a move list in SAN (numbering follows the loaded FEN).
- `?fen=...` in the URL pre-loads a position.

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
Runs `node --test tests/` (22 tests on app/lib/game.js).

## Layout
- app/index.html, main.js, style.css: the page
- app/lib/game.js: pure game module (no DOM) wrapping chess.js
- app/vendor/: chess.js, cm-chessboard, Chessnut pieces, each with its LICENSE (see app/vendor/README.md)
- docs/: proof screenshot (docs/screenshot.png), DECISIONS.md

## Known limits
- No PWA manifest or service worker yet (installable app is a later ticket).
- No clocks, no resign/draw offer, no saving a game across reloads.
- Undo goes back to the loaded position only, no redo.
- The proof screenshot shows the FEN loaded via `?fen=`; drag and tap-tap were checked by logic tests of game.js, not by an automated browser run. Test them on a real phone.
- Minimal English-only UI. Mobile Safari not tested here.
