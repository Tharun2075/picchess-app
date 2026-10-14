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
