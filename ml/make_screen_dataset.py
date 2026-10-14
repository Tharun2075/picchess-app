"""Synthetic labelled screenshot dataset for the PicChess square classifier (ticket 06).

One command:  .venv/bin/python ml/make_screen_dataset.py --out data/screens --seed 6
Deterministic: board i of a split depends only on (seed, split, i).

Positions: own code (random pseudo-legal playouts from the start position, plus sparse endgames);
python-chess is NOT used. Rendering: Pillow only.

Outputs per split (train / val / heldout) under --out:
  images/<split>/NNNNN.jpg|png   the rendered, re-compressed board image
  <split>/labels.csv             file,fen,orientation  (same format as data/real_screens/labels.csv)
  <split>/meta.jsonl             full per-board record incl. board box, theme, set, augmentations
  <split>/tiles.bin + tiles.csv  32x32 grey tiles (uint8), rows: board,square,label (square 0=a8 .. 63=h1, FEN order)
Classes: 0 empty, 1..6 = wP wN wB wR wQ wK, 7..12 = bP bN bB bR bQ bK.
"""
import argparse, csv, io, json, random, sys
from multiprocessing import Pool
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import piece_sets

CLASSES = ["empty", "wP", "wN", "wB", "wR", "wQ", "wK", "bP", "bN", "bB", "bR", "bQ", "bK"]
FEN_CHARS = {"P": 1, "N": 2, "B": 3, "R": 4, "Q": 5, "K": 6, "p": 7, "n": 8, "b": 9, "r": 10, "q": 11, "k": 12}
CHAR_OF = {v: k for k, v in FEN_CHARS.items()}
TILE = 32
EMPTY_FLOOR = 8  # keep at least this many empties per board (cap: max(non-empty, floor))

TRAIN_THEMES = {  # name: (light, dark)
    "brown": ((240, 217, 181), (181, 136, 99)), "green": ((238, 238, 210), (118, 150, 86)),
    "blue": ((222, 227, 230), (140, 162, 173)), "grey": ((220, 220, 220), (130, 130, 130)),
    "purple": ((239, 233, 244), (150, 119, 179)), "wood": ((222, 184, 135), (139, 90, 43)),
    "ice": ((235, 245, 250), (120, 160, 200)), "dark_slate": ((110, 118, 128), (60, 66, 74)),
    "dark_olive": ((120, 125, 95), (70, 78, 55)), "midnight": ((90, 96, 120), (40, 44, 66)),
}
HELDOUT_THEMES = {
    "coral": ((255, 228, 214), (214, 120, 100)), "teal": ((214, 240, 236), (60, 140, 140)),
    "sand": ((247, 238, 214), (200, 170, 110)), "dark_red": ((130, 100, 100), (80, 40, 44)),
}
BGS_LIGHT = [(245, 245, 245), (255, 255, 255), (230, 240, 250), (250, 244, 235)]
BGS_DARK = [(38, 36, 33), (22, 21, 18), (49, 46, 43), (18, 18, 28)]

# ---------------------------------------------------------------- positions (own code)
KN = [(1, 2), (2, 1), (-1, 2), (-2, 1), (1, -2), (2, -1), (-1, -2), (-2, -1)]
KG = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
ROOKD, BISHD = KG[:4], KG[4:]


def start_board():
    return list("rnbqkbnr" + "p" * 8 + "." * 32 + "P" * 8 + "RNBQKBNR")


def pseudo_moves(b, white):
    """Pseudo-legal moves (no check test, no castling, no en passant). Never captures a king."""
    out = []
    for i, p in enumerate(b):
        if p == "." or p.isupper() != white:
            continue
        r, c = divmod(i, 8)
        t = p.upper()

        def add(rr, cc, cap_ok=True, cap_only=False):
            if not (0 <= rr < 8 and 0 <= cc < 8):
                return False
            q = b[rr * 8 + cc]
            if q == ".":
                if not cap_only:
                    out.append((i, rr * 8 + cc))
                return True
            if cap_ok and q.isupper() != white and q.upper() != "K":
                out.append((i, rr * 8 + cc))
            return False
        if t == "P":
            d = -1 if white else 1
            if add(r + d, c, cap_ok=False) and r == (6 if white else 1):
                add(r + 2 * d, c, cap_ok=False)
            for dc in (-1, 1):
                if 0 <= c + dc < 8 and 0 <= r + d < 8 and b[(r + d) * 8 + c + dc] != ".":
                    add(r + d, c + dc, cap_only=True)
        elif t in "NK":
            for dr, dc in (KN if t == "N" else KG):
                add(r + dr, c + dc)
        else:
            for dr, dc in ({"R": ROOKD, "B": BISHD, "Q": KG}[t]):
                rr, cc = r + dr, c + dc
                while add(rr, cc):
                    rr, cc = rr + dr, cc + dc
    return out


def random_position(rng):
    mode = rng.random()
    b = start_board()
    if mode < 0.08:
        return "".join(b)
    if mode < 0.18:  # sparse random placement, kings kept
        b = ["."] * 64
        cells = rng.sample(range(64), rng.randint(2, 24))
        b[cells[0]], b[cells[1]] = "K", "k"
        for i in cells[2:]:
            p = rng.choice("QRRBBNNPPPPPPqrrbbnnpppppp")
            if p in "Pp" and i // 8 in (0, 7):
                p = "N" if p == "P" else "n"
            b[i] = p
        return "".join(b)
    white = True
    for _ in range(rng.randint(4, 110)):
        mv = pseudo_moves(b, white)
        if not mv:
            break
        a, z = rng.choice(mv)
        b[z], b[a] = b[a], "."
        if b[z] == "P" and z < 8: b[z] = "Q"
        if b[z] == "p" and z >= 56: b[z] = "q"
        white = not white
    return "".join(b)


def board_to_fen(b):
    rows = []
    for r in range(8):
        s, n = "", 0
        for p in b[r * 8:(r + 1) * 8]:
            if p == ".": n += 1
            else: s += (str(n) if n else "") + p; n = 0
        rows.append(s + (str(n) if n else ""))
    return "/".join(rows)


def fen_to_board(fen):
    b = []
    for ch in fen.split()[0]:
        if ch == "/": continue
        b.extend("." * int(ch) if ch.isdigit() else ch)
    assert len(b) == 64, fen
    return b


# ---------------------------------------------------------------- rendering
_SPRITES = {}
_FONT = None


def sprites(name):
    if name not in _SPRITES:
        _SPRITES[name] = piece_sets.SETS[name][0]()
    return _SPRITES[name]


def font(size):
    global _FONT
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def blend(img, box, rgb, alpha):
    ov = Image.new("RGB", (box[2] - box[0], box[3] - box[1]), rgb)
    img.paste(Image.blend(img.crop(box), ov, alpha), box[:2])


def render_board(rng, board, theme, pset, sq, flipped, opts):
    light, dark = theme
    S = sq * 8
    img = Image.new("RGB", (S, S))
    d = ImageDraw.Draw(img)
    cell = lambda r, c: (c * sq, r * sq, c * sq + sq, r * sq + sq)
    view = lambda r, c: (7 - r, 7 - c) if flipped else (r, c)  # view cell -> board cell
    inv = lambda br, bc: (7 - br, 7 - bc) if flipped else (br, bc)
    for r in range(8):
        for c in range(8):
            d.rectangle(cell(r, c), fill=light if (r + c) % 2 == 0 else dark)
    tint = {"yellow": (205, 210, 50), "green": (155, 199, 0), "blue": (20, 85, 190), "orange": (240, 160, 40)}[opts["tint"]]
    for sqi in opts["last_move"] + opts["selected"]:
        r, c = inv(*divmod(sqi, 8))
        blend(img, cell(r, c), tint, 0.5)
    sp = sprites(pset)
    for i, p in enumerate(board):
        if p == ".": continue
        r, c = inv(*divmod(i, 8))
        s = sp[("w" if p.isupper() else "b") + p.upper()]
        sc = opts["piece_scale"]
        px = max(4, int(sq * sc))
        pc = s.resize((px, px), Image.LANCZOS)
        img.paste(pc, (c * sq + (sq - px) // 2, r * sq + (sq - px) // 2), pc)
    d = ImageDraw.Draw(img, "RGBA")
    for i in opts["dots"]:  # legal-move dots on empty squares (label stays empty)
        r, c = inv(*divmod(i, 8))
        m = sq // 2; rad = max(2, sq // 8)
        d.ellipse([c * sq + m - rad, r * sq + m - rad, c * sq + m + rad, r * sq + m + rad], fill=(20, 20, 20, 90))
    for (a, z) in opts["arrows"]:
        ar, ac = inv(*divmod(a, 8)); zr, zc = inv(*divmod(z, 8))
        x0, y0 = ac * sq + sq / 2, ar * sq + sq / 2
        x1, y1 = zc * sq + sq / 2, zr * sq + sq / 2
        dx, dy = x1 - x0, y1 - y0
        L = (dx * dx + dy * dy) ** 0.5 or 1
        ux, uy = dx / L, dy / L
        w = max(2, sq // 7)
        hx, hy = x1 - ux * sq * 0.35, y1 - uy * sq * 0.35
        col = opts["arrow_color"]
        d.line([x0, y0, hx, hy], fill=col, width=w)
        nx, ny = -uy, ux
        d.polygon([(x1, y1), (hx + nx * sq * 0.2, hy + ny * sq * 0.2), (hx - nx * sq * 0.2, hy - ny * sq * 0.2)], fill=col)
    if opts["coords"] == "inside":
        f = font(max(8, sq // 5))
        for i in range(8):
            fl = "abcdefgh"[7 - i] if flipped else "abcdefgh"[i]
            rk = str(i + 1) if flipped else str(8 - i)
            d.text((i * sq + sq - sq // 5, S - sq // 4 - 2), fl, fill=(dark if (i + 7) % 2 == 0 else light) + (255,), font=f)
            d.text((2, i * sq + 1), rk, fill=(dark if i % 2 == 0 else light) + (255,), font=f)
    return img


def draw_outside_coords(img, sq, flipped, bg, fg):
    pad = max(10, sq // 3)
    out = Image.new("RGB", (img.width + 2 * pad, img.height + 2 * pad), bg)
    out.paste(img, (pad, pad))
    d = ImageDraw.Draw(out)
    f = font(max(8, sq // 4))
    for i in range(8):
        fl = "abcdefgh"[7 - i] if flipped else "abcdefgh"[i]
        rk = str(i + 1) if flipped else str(8 - i)
        d.text((pad + i * sq + sq // 2 - 3, pad + img.height + 2), fl, fill=fg, font=f)
        d.text((3, pad + i * sq + sq // 2 - 5), rk, fill=fg, font=f)
    return out, pad


def make_opts(rng, board):
    empties = [i for i, p in enumerate(board) if p == "."]
    squares = list(range(64))
    o = {"tint": rng.choice(["yellow", "green", "blue", "orange"]), "piece_scale": rng.uniform(0.82, 1.0),
         "last_move": [], "selected": [], "dots": [], "arrows": [],
         "arrow_color": rng.choice([(255, 170, 0, 170), (0, 160, 60, 170), (220, 40, 40, 170), (40, 90, 220, 170)]),
         "coords": rng.choice(["inside", "none", "outside"])}
    if rng.random() < 0.6: o["last_move"] = rng.sample(squares, 2)
    if rng.random() < 0.2: o["selected"] = [rng.choice(squares)]
    if rng.random() < 0.25 and empties: o["dots"] = rng.sample(empties, min(len(empties), rng.randint(1, 8)))
    for _ in range(rng.choice([0, 0, 0, 1, 1, 2, 3]) ):
        o["arrows"].append(tuple(rng.sample(squares, 2)))
    return o


def render_image(seed, split, idx, themes, psets, out_dir):
    """Render board idx of a split. Returns (record, Image as saved/reloaded)."""
    rng = random.Random(f"{seed}/{split}/{idx}")
    board = fen_to_board(board_to_fen(list(random_position(rng))))
    tname = rng.choice(sorted(themes))
    pset = rng.choice(sorted(psets))
    dark_mode = tname.startswith("dark") or tname == "midnight" or rng.random() < 0.3
    flipped = rng.random() < 0.5
    sq = rng.choice([14, 18, 22, 28, 34, 40, 48, 56, 64, 80])
    opts = make_opts(rng, board)
    bimg = render_board(rng, board, themes[tname], pset, sq, flipped, opts)
    bg = rng.choice(BGS_DARK if dark_mode else BGS_LIGHT)
    fg = (190, 190, 190) if dark_mode else (70, 70, 70)
    pad = 0
    if opts["coords"] == "outside":
        bimg, pad = draw_outside_coords(bimg, sq, flipped, bg, fg)
    m = rng.choice([0, 0, sq // 2, sq, sq * 2])  # UI margin around the board
    canvas = Image.new("RGB", (bimg.width + 2 * m, bimg.height + 2 * m), bg)
    canvas.paste(bimg, (m, m))
    ox, oy, S = m + pad, m + pad, sq * 8
    scale = rng.choice([1.0, 1.0, 0.5, 0.65, 0.8, 1.25, 1.6, 2.0])
    if sq * scale < 12:
        scale = 1.0
    if scale != 1.0:
        W, H = max(16, round(canvas.width * scale)), max(16, round(canvas.height * scale))
        canvas = canvas.resize((W, H), rng.choice([Image.BILINEAR, Image.BICUBIC, Image.LANCZOS, Image.NEAREST]))
    box = [ox * scale, oy * scale, S * scale]
    blur = rng.choice([0, 0, 0, 0.5, 0.8, 1.2])
    if blur: canvas = canvas.filter(ImageFilter.GaussianBlur(blur))
    fmt = "png" if rng.random() < 0.15 else "jpg"
    q = rng.randint(30, 95)
    name = f"{idx:05d}.{fmt}"
    path = Path(out_dir) / "images" / split / name
    path.parent.mkdir(parents=True, exist_ok=True)
    if fmt == "jpg":
        if rng.random() < 0.3:  # double compression, like a re-shared screenshot
            buf = io.BytesIO(); canvas.save(buf, "JPEG", quality=min(95, q + 10)); buf.seek(0); canvas = Image.open(buf).convert("RGB")
        canvas.save(path, "JPEG", quality=q)
    else:
        canvas.save(path, "PNG")
    rec = dict(file=f"{split}/{name}", fen=board_to_fen(board), orientation="b" if flipped else "w", theme=tname,
               piece_set=pset, square_px=sq, scale=scale, box=[round(v, 3) for v in box], jpeg_quality=q if fmt == "jpg" else None,
               blur=blur, dark_mode=dark_mode, coords=opts["coords"], last_move=bool(opts["last_move"]),
               arrows=len(opts["arrows"]), dots=len(opts["dots"]))
    return rec, Image.open(path).convert("RGB")


def slice_board(img, box, orientation, tile=TILE):
    """64 grey tiles in FEN order (a8..h1) cut from the image using the board box [x, y, size]."""
    x, y, s = box
    g = img.convert("L")
    flipped = orientation == "b"
    tiles = [None] * 64
    for vr in range(8):
        for vc in range(8):
            br, bc = (7 - vr, 7 - vc) if flipped else (vr, vc)
            c = (round(x + vc * s / 8), round(y + vr * s / 8), round(x + (vc + 1) * s / 8), round(y + (vr + 1) * s / 8))
            tiles[br * 8 + bc] = g.crop(c).resize((tile, tile), Image.BILINEAR)
    return tiles


def labels_of(fen):
    return [0 if p == "." else FEN_CHARS[p] for p in fen_to_board(fen)]


def fen_from_labels(labels):
    return board_to_fen(["." if l == 0 else CHAR_OF[l] for l in labels])


def kept_squares(seed, split, idx, labels):
    """Deterministic empty-square cap: keep every piece tile, at most max(pieces, EMPTY_FLOOR) empties."""
    rng = random.Random(f"{seed}/{split}/{idx}/cap")
    ne = [i for i, l in enumerate(labels) if l]
    em = [i for i, l in enumerate(labels) if not l]
    keep_e = set(rng.sample(em, min(len(em), max(len(ne), EMPTY_FLOOR))))
    return [i for i in range(64) if labels[i] or i in keep_e]


def work(args):
    seed, split, idx, themes, psets, out_dir = args
    rec, img = render_image(seed, split, idx, themes, psets, out_dir)
    labels = labels_of(rec["fen"])
    keep = kept_squares(seed, split, idx, labels)
    tiles = slice_board(img, rec["box"], rec["orientation"])
    return rec, [(sqi, labels[sqi], tiles[sqi].tobytes()) for sqi in keep]


def build_split(seed, split, count, themes, psets, out, procs):
    d = Path(out) / split
    d.mkdir(parents=True, exist_ok=True)
    jobs = [(seed, split, i, themes, psets, str(out)) for i in range(count)]
    counts = [0] * 13
    with open(d / "labels.csv", "w", newline="") as lf, open(d / "meta.jsonl", "w") as mf, \
            open(d / "tiles.bin", "wb") as tb, open(d / "tiles.csv", "w", newline="") as tc:
        lw, tw = csv.writer(lf), csv.writer(tc)
        lw.writerow(["file", "fen", "orientation"]); tw.writerow(["board", "square", "label"])
        with Pool(procs) as pool:
            for i, (rec, tl) in enumerate(pool.imap(work, jobs, chunksize=32)):
                lw.writerow([rec["file"], rec["fen"], rec["orientation"]])
                mf.write(json.dumps(rec) + "\n")
                for sqi, lab, data in tl:
                    tb.write(data); tw.writerow([i, sqi, lab]); counts[lab] += 1
                if i % 2000 == 0: print(f"  {split}: {i}/{count}", flush=True)
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/screens")
    ap.add_argument("--seed", type=int, default=6)
    ap.add_argument("--train", type=int, default=18000)
    ap.add_argument("--val", type=int, default=1200)
    ap.add_argument("--heldout", type=int, default=1800)
    ap.add_argument("--procs", type=int, default=0)
    a = ap.parse_args()
    import os
    procs = a.procs or max(1, (os.cpu_count() or 2) - 1)
    train_sets = [k for k, v in piece_sets.SETS.items() if not v[3]]
    held_sets = [k for k, v in piece_sets.SETS.items() if v[3]]
    plan = [("train", a.train, TRAIN_THEMES, train_sets), ("val", a.val, TRAIN_THEMES, train_sets),
            ("heldout", a.heldout, HELDOUT_THEMES, held_sets)]
    stats = {}
    for split, n, th, ps in plan:
        stats[split] = dict(boards=n, themes=sorted(th), piece_sets=ps, tiles=build_split(a.seed, split, n, th, ps, a.out, procs))
    (Path(a.out) / "stats.json").write_text(json.dumps(dict(seed=a.seed, classes=CLASSES, splits=stats), indent=1))
    print("done", a.out)


if __name__ == "__main__":
    main()
