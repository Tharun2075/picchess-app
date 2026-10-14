"""Write docs/DATASET.md and data/SOURCES.md from data/screens/stats.json. Usage: make_dataset_card.py [data/screens]"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_screen_dataset as m, piece_sets

root = Path(sys.argv[1] if len(sys.argv) > 1 else "data/screens")
repo = Path(__file__).resolve().parent.parent
s = json.loads((root / "stats.json").read_text())
sp = s["splits"]
L = ["# Dataset card: PicChess synthetic screenshot squares (ticket 06)", "",
     "Synthetic, labelled chessboard screenshots and their 64 tiles each, for the 13-class square classifier.",
     "Generated locally; nothing is downloaded and no image is committed (`data/` is gitignored).", "",
     "## Regenerate (one command)", "", "```", "python3 -m venv .venv && .venv/bin/pip install -r ml/requirements.txt   # once",
     f".venv/bin/python ml/make_screen_dataset.py --out data/screens --seed {s['seed']} && .venv/bin/python ml/make_dataset_card.py", "```", "",
     "Deterministic: board i of a split depends only on (seed, split, i). Takes about 4 minutes on a laptop, about 1.6 GB.", "",
     "## Splits", "", "| split | boards | themes | piece sets | purpose |", "|---|---|---|---|---|"]
purpose = {"train": "training", "val": "validation (same themes and sets, new positions)", "heldout": "held out: themes AND piece sets never seen in training"}
for k, v in sp.items():
    L.append(f"| {k} | {v['boards']} | {', '.join(v['themes'])} | {', '.join(v['piece_sets'])} | {purpose[k]} |")
L += ["", f"Total boards: {sum(v['boards'] for v in sp.values())}.", "", "## Tiles per class (after the empty-square cap)", "",
      "| class | " + " | ".join(sp) + " |", "|---|" + "---|" * len(sp)]
for i, c in enumerate(s["classes"]):
    L.append(f"| {i} {c} | " + " | ".join(str(v["tiles"][i]) for v in sp.values()) + " |")
L.append("| **total** | " + " | ".join(str(sum(v["tiles"])) for v in sp.values()) + " |")
L.append("| empty share | " + " | ".join(f"{100 * v['tiles'][0] / sum(v['tiles']):.1f}%" for v in sp.values()) + " |")
L += ["", "Cap rule: every piece tile is kept; each board keeps at most max(piece count, 8) empty tiles, chosen by a seeded sample. "
      "Acceptance limit is empty <= 60%; the table shows the real share. Full 64-square labels of every board stay in `labels.csv`.", "",
      "## Format", "",
      "- `data/screens/images/<split>/NNNNN.jpg|png`: the board image as saved (JPEG quality 30-95, some double-compressed, some PNG).",
      "- `<split>/labels.csv`: `file,fen,orientation` (fen = piece placement, ranks 8 to 1; orientation `w`/`b` = colour at the bottom). Same format as `data/real_screens/labels.csv`.",
      "- `<split>/meta.jsonl`: per image theme, piece set, square size, scale, board box `[x, y, size]` in pixels, JPEG quality, blur, dark mode, coordinates, arrows, dots, last-move flag.",
      "- `<split>/tiles.bin`: 32x32 8-bit grey tiles, 1024 bytes each, in the order of `tiles.csv` (`board,square,label`; square 0 = a8 .. 63 = h1).",
      "- Classes: 0 empty, 1-6 = wP wN wB wR wQ wK, 7-12 = bP bN bB bR bQ bK.",
      "- Tiles are cut from the saved image using the known board box, so they carry the real compression, blur and scaling.", "",
      "## Augmentations", "",
      "Random legal-ish positions (own pseudo-legal playouts, sparse endings, start position), 20 sizes from 14 px to 80 px squares, scale 0.5x-2x with four resamplers, "
      "Gaussian blur, JPEG re-compression, last-move and selected-square tints (4 colours), legal-move dots, 0-3 arrows, coordinates inside or outside the board, "
      "light and dark mode with dark board themes, UI margin, both orientations, piece size 82-100% of the square.", "",
      "## Themes", "", "Train/val: " + ", ".join(m.TRAIN_THEMES) + ".", "", "Held out: " + ", ".join(m.HELDOUT_THEMES) + ".", "",
      "## Piece sets and licences", "", "| set | source | licence | split |", "|---|---|---|---|"]
for k, (_, src, lic, held) in piece_sets.SETS.items():
    L.append(f"| {k} | {src} | {lic} | {'held out' if held else 'train/val'} |")
L += ["", "Only the Chessnut set is also used by the app (vendored in `app/vendor/chessnut`, Apache-2.0). Font-derived images exist only as local training data and are never copied into `app/`.", "",
      "## Known limits", "",
      "- Five piece sets and 14 themes: real sites have far more. The `data/real_screens/` folder exists to measure that gap.",
      "- Positions come from random playouts: no castling, en passant or check rules, so they are plausible but not game-realistic.",
      "- Grey 32x32 tiles drop colour; a later ticket may keep colour if accuracy needs it.",
      "- No check/mate highlights, no premove or animation frames, no pieces mid-drag.",
      "", "Sample: `docs/dataset-sample.png` (4 boards, 16 tiles).", ""]
(repo / "docs" / "DATASET.md").write_text("\n".join(L))
S = ["# Data sources", "", "| set | source | licence |", "|---|---|---|"]
for k, (_, src, lic, held) in piece_sets.SETS.items():
    S.append(f"| {k} ({'held out' if held else 'train/val'}) | {src} | {lic} |")
S += ["", "Positions: own random-playout code (no third-party data). Nothing was downloaded for this ticket.",
      "CC-BY-SA / GPL sets: none used. Font-derived art is training data only and never goes into app/."]
(repo / "data" / "SOURCES.md").write_text("\n".join(S) + "\n")
print("wrote docs/DATASET.md and data/SOURCES.md")
