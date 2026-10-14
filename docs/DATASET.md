# Dataset card: PicChess synthetic screenshot squares (ticket 06)

Synthetic, labelled chessboard screenshots and their 64 tiles each, for the 13-class square classifier.
Generated locally; nothing is downloaded and no image is committed (`data/` is gitignored).

## Regenerate (one command)

```
python3 -m venv .venv && .venv/bin/pip install -r ml/requirements.txt   # once
.venv/bin/python ml/make_screen_dataset.py --out data/screens --seed 6 && .venv/bin/python ml/make_dataset_card.py
```

Deterministic: board i of a split depends only on (seed, split, i). Takes about 4 minutes on a laptop, about 1.6 GB.

## Splits

| split | boards | themes | piece sets | purpose |
|---|---|---|---|---|
| train | 18000 | blue, brown, dark_olive, dark_slate, green, grey, ice, midnight, purple, wood | chessnut, glyph, letters | training |
| val | 1200 | blue, brown, dark_olive, dark_slate, green, grey, ice, midnight, purple, wood | chessnut, glyph, letters | validation (same themes and sets, new positions) |
| heldout | 1800 | coral, dark_red, sand, teal | geo, serif | held out: themes AND piece sets never seen in training |

Total boards: 21000.

## Tiles per class (after the empty-square cap)

| class | train | val | heldout |
|---|---|---|---|
| 0 empty | 446137 | 29718 | 44622 |
| 1 wP | 102748 | 6871 | 10287 |
| 2 wN | 28809 | 1876 | 2825 |
| 3 wB | 28100 | 1838 | 2781 |
| 4 wR | 31009 | 2088 | 3105 |
| 5 wQ | 13614 | 901 | 1351 |
| 6 wK | 18000 | 1200 | 1800 |
| 7 bP | 102542 | 6878 | 10368 |
| 8 bN | 28947 | 1894 | 2868 |
| 9 bB | 28143 | 1899 | 2800 |
| 10 bR | 30958 | 2081 | 3122 |
| 11 bQ | 13628 | 904 | 1361 |
| 12 bK | 18000 | 1200 | 1800 |
| **total** | 890635 | 59348 | 89090 |
| empty share | 50.1% | 50.1% | 50.1% |

Cap rule: every piece tile is kept; each board keeps at most max(piece count, 8) empty tiles, chosen by a seeded sample. Acceptance limit is empty <= 60%; the table shows the real share. Full 64-square labels of every board stay in `labels.csv`.

## Format

- `data/screens/images/<split>/NNNNN.jpg|png`: the board image as saved (JPEG quality 30-95, some double-compressed, some PNG).
- `<split>/labels.csv`: `file,fen,orientation` (fen = piece placement, ranks 8 to 1; orientation `w`/`b` = colour at the bottom). Same format as `data/real_screens/labels.csv`.
- `<split>/meta.jsonl`: per image theme, piece set, square size, scale, board box `[x, y, size]` in pixels, JPEG quality, blur, dark mode, coordinates, arrows, dots, last-move flag.
- `<split>/tiles.bin`: 32x32 8-bit grey tiles, 1024 bytes each, in the order of `tiles.csv` (`board,square,label`; square 0 = a8 .. 63 = h1).
- Classes: 0 empty, 1-6 = wP wN wB wR wQ wK, 7-12 = bP bN bB bR bQ bK.
- Tiles are cut from the saved image using the known board box, so they carry the real compression, blur and scaling.

## Augmentations

Random legal-ish positions (own pseudo-legal playouts, sparse endings, start position), 20 sizes from 14 px to 80 px squares, scale 0.5x-2x with four resamplers, Gaussian blur, JPEG re-compression, last-move and selected-square tints (4 colours), legal-move dots, 0-3 arrows, coordinates inside or outside the board, light and dark mode with dark board themes, UI margin, both orientations, piece size 82-100% of the square.

## Themes

Train/val: brown, green, blue, grey, purple, wood, ice, dark_slate, dark_olive, midnight.

Held out: coral, teal, sand, dark_red.

## Piece sets and licences

| set | source | licence | split |
|---|---|---|---|
| chessnut | https://github.com/shaack/cm-chessboard (Chessnut set by Alexander Kuzmin) | Apache-2.0 | train/val |
| glyph | Apple Symbols font, Unicode chess glyphs U+265A..265F rendered locally | Apple font licence; local training images only, never redistributed | train/val |
| letters | Own drawing code (ml/piece_sets.py) + Arial Bold letters rendered locally | Own code MIT; font glyphs used for local training images only | train/val |
| geo | Own drawing code (ml/piece_sets.py) | CC0 | held out |
| serif | Own drawing code + Times New Roman Bold letters rendered locally | Own code MIT; font glyphs used for local training images only | held out |

Only the Chessnut set is also used by the app (vendored in `app/vendor/chessnut`, Apache-2.0). Font-derived images exist only as local training data and are never copied into `app/`.

## Known limits

- Five piece sets and 14 themes: real sites have far more. The `data/real_screens/` folder exists to measure that gap.
- Positions come from random playouts: no castling, en passant or check rules, so they are plausible but not game-realistic.
- Grey 32x32 tiles drop colour; a later ticket may keep colour if accuracy needs it.
- No check/mate highlights, no premove or animation frames, no pieces mid-drag.

Sample: `docs/dataset-sample.png` (4 boards, 16 tiles).
