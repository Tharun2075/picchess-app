"""Render synthetic flat "screenshot" test images from random FENs.

Pieces: Chessnut set (Apache-2.0, app/vendor/chessnut), pre-rasterised to ml/assets/pieces/*.png.
Usage: .venv/bin/python ml/render_screens.py [out_dir] [count]
Writes out_dir/NNN.png and out_dir/truth.json (true board box [x, y, size] in pixels per image).
"""
import json, random, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
THEMES = {  # light, dark
    "brown": ((240, 217, 181), (181, 136, 99)),
    "green": ((238, 238, 210), (118, 150, 86)),
    "blue": ((222, 227, 230), (140, 162, 173)),
    "grey": ((220, 220, 220), (130, 130, 130)),
    "purple": ((239, 233, 244), (150, 119, 179)),
}
BGS = [(38, 36, 33), (22, 21, 18), (245, 245, 245), (255, 255, 255), (49, 46, 43), (230, 240, 250), (18, 18, 28)]
PIECES = {}


def load_pieces():
    for n in ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"]:
        PIECES[n] = Image.open(HERE / "assets" / "pieces" / f"{n}.png").convert("RGBA")


def random_fen_board(rng):
    board = [[None] * 8 for _ in range(8)]
    if rng.random() < 0.15:  # start position
        rows = ["rnbqkbnr", "pppppppp", None, None, None, None, "PPPPPPPP", "RNBQKBNR"]
        return [list(r) if r else [None] * 8 for r in rows]
    cells = [(r, c) for r in range(8) for c in range(8)]
    rng.shuffle(cells)
    it = iter(cells)
    for k in "Kk":
        r, c = next(it); board[r][c] = k
    for _ in range(rng.randint(2, 30)):
        r, c = next(it)
        p = rng.choice("QRRBBNNPPPPPPqrrbbnnpppppp")
        if p in "Pp" and r in (0, 7):
            p = "N" if p == "P" else "n"
        board[r][c] = p
    return board


def fen_of(board):
    out = []
    for row in board:
        s, n = "", 0
        for p in row:
            if p is None: n += 1
            else:
                s += (str(n) if n else "") + p; n = 0
        out.append(s + (str(n) if n else ""))
    return "/".join(out)


def draw_board(board, theme, size, flipped, coords, font):
    light, dark = THEMES[theme]
    sq = size // 8
    img = Image.new("RGB", (sq * 8, sq * 8))
    d = ImageDraw.Draw(img)
    for r in range(8):
        for c in range(8):
            col = light if (r + c) % 2 == 0 else dark
            d.rectangle([c * sq, r * sq, c * sq + sq - 1, r * sq + sq - 1], fill=col)
    for r in range(8):
        for c in range(8):
            br, bc = (7 - r, 7 - c) if flipped else (r, c)
            p = board[br][bc]
            if p:
                key = ("w" if p.isupper() else "b") + p.upper()
                pc = PIECES[key].resize((sq, sq), Image.LANCZOS)
                img.paste(pc, (c * sq, r * sq), pc)
    if coords and font:
        for i in range(8):
            fl = "abcdefgh"[7 - i] if flipped else "abcdefgh"[i]
            rk = str(i + 1) if flipped else str(8 - i)
            lc = THEMES[theme][1] if i % 2 == 1 else THEMES[theme][0]
            d.text((i * sq + sq - sq // 5, 8 * sq - sq // 4), fl, fill=THEMES[theme][1] if i % 2 == 0 else THEMES[theme][0], font=font)
            d.text((2, i * sq + 1), rk, fill=THEMES[theme][1] if i % 2 == 0 else THEMES[theme][0], font=font)
    return img


def render_one(rng, font):
    board = random_fen_board(rng)
    theme = rng.choice(list(THEMES))
    flipped = rng.random() < 0.5
    kind = rng.choice(["phone", "phone", "desktop", "square", "crop"])
    if kind == "phone":
        W, H = rng.choice([(390, 844), (414, 896), (360, 780)])
        side = int(W * rng.uniform(0.9, 1.0))
    elif kind == "desktop":
        W, H = rng.choice([(1000, 640), (900, 600), (1100, 700)])
        side = int(H * rng.uniform(0.7, 0.88))
    elif kind == "square":
        W = H = rng.choice([500, 600, 640])
        side = int(W * rng.uniform(0.8, 1.0))
    else:
        W, H = rng.choice([(600, 420), (560, 560), (640, 480)])
        side = int(min(W, H) * rng.uniform(0.72, 0.95))
    side = side // 8 * 8
    bg = rng.choice(BGS)
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    bimg = draw_board(board, theme, side, flipped, rng.random() < 0.6, font)
    x = (W - side) // 2 if kind != "desktop" else rng.randint(20, W - side - 20)
    y = (H - side) // 2 + (rng.randint(-40, 40) if kind in ("phone", "crop") else 0)
    y = max(0, min(H - side, y))
    fg = (200, 200, 200) if sum(bg) < 380 else (60, 60, 60)
    if rng.random() < 0.5 and y >= 24:  # player bars above and below
        d.rectangle([x, y - 22, x + side, y - 4], fill=tuple(min(255, c + 20) for c in bg), outline=fg)
        d.text((x + 6, y - 20), "player_one  1500", fill=fg, font=font)
    if y + side + 22 < H and rng.random() < 0.5:
        d.text((x + 6, y + side + 6), "player_two  1620   12:34", fill=fg, font=font)
    if rng.random() < 0.35:  # frame border around the board
        bw = rng.randint(2, 6)
        bc = rng.choice([(90, 60, 30), (20, 20, 20), (200, 200, 200), (60, 90, 60)])
        d.rectangle([x - bw, y - bw, x + side + bw - 1, y + side + bw - 1], outline=bc, width=bw)
    img.paste(bimg, (x, y))
    if kind == "desktop":  # move list panel on the side
        px = x + side + 30
        for i in range(0, min(14, (H - 60) // 20)):
            d.text((px, 30 + i * 20), f"{i+1}. e4 e5   Nf3 Nc6", fill=fg, font=font)
    return img, dict(box=[x, y, side], fen=fen_of(board), theme=theme, flipped=flipped, kind=kind)


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "data/screens")
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 200
    out.mkdir(parents=True, exist_ok=True)
    load_pieces()
    try:
        font = ImageFont.load_default(size=12)
    except TypeError:
        font = ImageFont.load_default()
    rng = random.Random(5)
    truth = {}
    for i in range(n):
        img, t = render_one(rng, font)
        name = f"{i:03d}.png"
        img.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out / name, optimize=True)  # palette PNG keeps fixtures small
        truth[name] = t
    (out / "truth.json").write_text(json.dumps(truth, indent=1))
    print(f"wrote {n} images to {out}")


if __name__ == "__main__":
    main()
