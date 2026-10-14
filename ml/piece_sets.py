"""Piece sets for the screenshot dataset. Each set returns {"wP": RGBA 128px, ...}.

Training sets   : chessnut (Apache-2.0 art, ml/assets/pieces), glyph (Apple Symbols font chess glyphs,
                  local training use only), letters (Arial Bold letters on discs, own drawing code).
Held-out sets   : geo (own shapes, CC0), serif (Times New Roman letters in rounded squares, own drawing code).
Font-derived images are used as training data only and are never copied into app/.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
NAMES = [c + p for c in "wb" for p in "KQRBNP"]
N = 128
FONTS = Path("/System/Library/Fonts")
GLYPHS = {"K": "♚", "Q": "♛", "R": "♜", "B": "♝", "N": "♞", "P": "♟"}
LIGHT, DARK, EDGE_L, EDGE_D = (250, 250, 245, 255), (35, 35, 38, 255), (20, 20, 20, 255), (235, 235, 235, 255)


def _font(path, size):
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:
        return ImageFont.load_default(size=size)


def chessnut():
    return {n: Image.open(HERE / "assets" / "pieces" / f"{n}.png").convert("RGBA") for n in NAMES}


def glyph():
    f = _font(FONTS / "Apple Symbols.ttf", 110)
    out = {}
    for n in NAMES:
        im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        white = n[0] == "w"
        d.text((N // 2, N // 2 + 4), GLYPHS[n[1]], font=f, anchor="mm",
               fill=LIGHT if white else DARK, stroke_width=3, stroke_fill=EDGE_L if white else EDGE_D)
        out[n] = im
    return out


def letters(path="Supplemental/Arial Bold.ttf", shape="disc"):
    f = _font(FONTS / path, 70)
    out = {}
    for n in NAMES:
        im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        white = n[0] == "w"
        box = [14, 14, N - 14, N - 14]
        fill, edge, txt = (LIGHT, EDGE_L, DARK) if white else (DARK, EDGE_D, LIGHT)
        if shape == "disc":
            d.ellipse(box, fill=fill, outline=edge, width=5)
        else:
            d.rounded_rectangle(box, radius=18, fill=fill, outline=edge, width=5)
        d.text((N // 2, N // 2 + 3), n[1], font=f, anchor="mm", fill=txt)
        out[n] = im
    return out


def geo():
    out = {}
    for n in NAMES:
        im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        white = n[0] == "w"
        fill = (245, 235, 200, 255) if white else (60, 50, 90, 255)
        edge = (60, 40, 20, 255) if white else (250, 220, 120, 255)
        k = {"fill": fill, "outline": edge, "width": 4}
        t = n[1]
        d.rectangle([24, 100, 104, 112], **k)  # base
        if t == "P":
            d.ellipse([46, 30, 82, 66], **k); d.polygon([(40, 100), (88, 100), (64, 56)], **k)
        elif t == "R":
            d.rectangle([34, 40, 94, 100], **k)
            for x in (34, 58, 82): d.rectangle([x, 20, x + 12, 40], **k)
        elif t == "B":
            d.polygon([(64, 14), (92, 60), (64, 100), (36, 60)], **k); d.ellipse([56, 6, 72, 22], **k)
        elif t == "N":
            d.polygon([(36, 100), (44, 50), (60, 20), (96, 40), (70, 56), (92, 100)], **k)
        elif t == "Q":
            d.polygon([(30, 100), (22, 30), (46, 60), (64, 20), (82, 60), (106, 30), (98, 100)], **k)
        else:
            d.rectangle([38, 44, 90, 100], **k); d.rectangle([58, 8, 70, 44], **k); d.rectangle([46, 20, 82, 32], **k)
        out[n] = im
    return out


def lichess(name):
    """Lichess set rasterised by ml/fetch_lichess_pieces.py (training images only)."""
    sheet = Image.open(HERE.parent / "data/lichess_pieces" / f"sheet_{name}.png").convert("RGBA")
    pieces = "wK wQ wR wB wN wP bK bQ bR bB bN bP".split()
    return {n: sheet.crop((i * N, 0, (i + 1) * N, N)) for i, n in enumerate(pieces)}


_LICHESS = {"rhosgfx": "CC0-1.0", "fantasy": "MIT", "spatial": "MIT", "celtic": "MIT", "kiwen-suwi": "CC-BY-4.0",
            "firi": "CC-BY-4.0", "totoy": "CC-BY-4.0", "papercut": "CC-BY-4.0"}

SETS = {  # name: (builder, source, licence, held_out)
    "chessnut": (chessnut, "https://github.com/shaack/cm-chessboard (Chessnut set by Alexander Kuzmin)", "Apache-2.0", False),
    "glyph": (glyph, "Apple Symbols font, Unicode chess glyphs U+265A..265F rendered locally", "Apple font licence; local training images only, never redistributed", False),
    "letters": (letters, "Own drawing code (ml/piece_sets.py) + Arial Bold letters rendered locally", "Own code MIT; font glyphs used for local training images only", False),
    "geo": (geo, "Own drawing code (ml/piece_sets.py)", "CC0", True),
    "serif": (lambda: letters("Supplemental/Times New Roman Bold.ttf", "square"), "Own drawing code + Times New Roman Bold letters rendered locally", "Own code MIT; font glyphs used for local training images only", True),
}
for _n, _l in _LICHESS.items():
    SETS[_n] = ((lambda n=_n: lichess(n)), f"https://github.com/lichess-org/lila/tree/master/public/piece/{_n}", _l, _n in ("celtic", "papercut"))

# Preset for the lichess-only dataset (no font-derived sets): train on chessnut + 6 lichess sets, hold out celtic, papercut, geo.
LICHESS_TRAIN = ["chessnut", "rhosgfx", "fantasy", "spatial", "kiwen-suwi", "firi", "totoy"]
LICHESS_HELD = ["celtic", "papercut", "geo"]
