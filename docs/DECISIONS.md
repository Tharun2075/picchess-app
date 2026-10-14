# Decisions

## Ticket 01: play from FEN
- Pieces: cm-chessboard's bundled sprites are CC BY-SA 3.0 (Cburnett) and CC BY-NC-SA 4.0 (Staunty), so neither is shipped. We use Chessnut (Apache-2.0), 12 SVGs from lichess's copy, merged into one sprite at app/vendor/cm-chessboard/assets/pieces/chessnut-sprite.svg. Licence text in app/vendor/chessnut/LICENSE.
- Trimmed cm-chessboard to the core plus the Markers extension (MIT); dropped arrows, accessibility, persistence and others to keep it small.
- `assetsCache: false`: with the cached sprite, pieces did not render in headless Chrome; referencing the sprite by URL did.
- Promotion picker is our own HTML overlay instead of the library's dialog (which needs its own sprite pieces).
- A FEN with only the placement field is accepted and completed with `w - - 0 1`; whitespace is normalised.
- Invalid FEN never changes the running game.
- Game over disables move input; Undo re-enables it.
- Proof screenshot is taken at 500x1000 because headless Chrome will not go narrower than about 500px; the layout is fluid for 360px phones.
- Headless Chrome with a fresh --user-data-dir hung in this environment; the default profile worked.

## Ticket 02: Stockfish top 3
- Engine: Stockfish 19.0.1 lite single-threaded WASM, unmodified, in app/engine/ (stockfish-19-lite-single.js sha256 ccb130d7…, .wasm ee4f115b…, COPYING 0b383d5a…; full hashes in SOURCE.md). Upstream and GPLv3 notice in app/engine/SOURCE.md. Reached only through a Web Worker speaking UCI text. No JS fallback engine and no fake moves.
- Single-threaded build chosen because it needs no SharedArrayBuffer / COOP-COEP headers, so plain `python3 -m http.server` works.
- Search settings: MultiPV 3, `go movetime 1500`; `ucinewgame` before each search (positions are unrelated jumps, so no stale hash).
- Stop-then-go handshake: a new position sends `stop`, waits for that search's `bestmove`, then starts the next. Output of a stopped search is ignored.
- `info` lines with lowerbound/upperbound, `info string` and currmove lines are ignored; only exact scores are shown.
- Eval is always from White's point of view (converted from the side to move), labelled in the UI. Format +1.2, -0.4, M3, -M2.
- Engine hints toggle is stored in localStorage (`picchess.hints`, default on). When off, no search is requested and a running one is stopped. The worker is only created when hints are on.
- If the worker or WASM fails: "Engine unavailable" is shown and the board stays playable.
- Arrows: best move strongest green, then amber, then grey; drawn in our own SVG overlay (cm-chessboard's arrows extension was trimmed in ticket 01).
- Proof: tools/proof02.mjs drives a headless Chrome over CDP; output in docs/proof-02-stockfish-top3.txt/.png.

## Ticket 03: board editor
- The editor holds its own position copy; `game` is replaced only by "Play this position" (which resets history to the new start). Cancel discards the copy.
- Model in app/lib/position.js is immutable: every function returns a new object. Board is a 64-array in FEN order.
- Castling: rights are auto-removed when king/rook leave their home squares and never auto-ticked; the user ticks them. toFen re-checks, so an impossible right cannot reach the FEN.
- En passant: offered only if the side to move has a pawn that can capture there and the squares behind are empty.
- Validation also rejects more than 8 pawns per side (not required, but impossible).
- Tools: "Drag" (cm-chessboard move input, any piece anywhere), a piece or eraser (square-select tap). Tapping a square already holding the selected piece removes it.
- "I play" sets only the board orientation; it is not part of the FEN.
- Halfmove/fullmove counters are not edited: written as 0 and 1.
- Proof: tools/proof03.mjs (CDP, own-browser) -> docs/proof-03-board-editor.txt/.png (+ -editing.png). Drag itself was not automated.
