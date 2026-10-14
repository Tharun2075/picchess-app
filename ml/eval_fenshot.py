"""Evaluate the vendored fenshot ONNX tile classifier on our synthetic screenshots.

Whole boards are cropped with the known board box, resized to 256x256 (bilinear),
cut into 64 tiles of 32x32 grey, and classified in one call, mirroring fenshot's
own extractBoardImage/boardToTiles. Orientation is given (not detected).

  .venv/bin/python ml/eval_fenshot.py --splits heldout val --limit 0
"""
import argparse, csv, json, sys
from pathlib import Path
import numpy as np
from PIL import Image
import onnxruntime as ort

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "vendor/fenshot/packages/fenshot/model/chess-tiles-v2.onnx"
FS_CLASSES = "1KQRBNPkqrbnp"  # fenshot class order, '1' = empty


def expand(row):
    out = []
    for ch in row:
        out.extend("1" * int(ch) if ch.isdigit() else ch)
    return out


def fen_grid(fen):  # 64 chars, a8..h1
    return [c for r in fen.split("/") for c in expand(r)]


def tiles_for(img, box):
    x, y, s = box
    g = np.asarray(img.convert("RGB"), dtype=np.float32)
    g = 0.299 * g[..., 0] + 0.587 * g[..., 1] + 0.114 * g[..., 2]
    gi = Image.fromarray(g)
    b = gi.crop((x, y, x + s, y + s)).resize((256, 256), Image.BILINEAR)
    a = np.asarray(b, dtype=np.float32) / 255.0
    # image-oriented tiles, row-major from top-left (rank order irrelevant, we remap ourselves)
    return a.reshape(8, 32, 8, 32).transpose(0, 2, 1, 3).reshape(64, 1024)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--splits", nargs="+", default=["heldout"])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--model", default=str(MODEL))
    ap.add_argument("--out", default="")
    ap.add_argument("--data", default="data/screens")
    a = ap.parse_args()
    sess = ort.InferenceSession(a.model)
    res = {}
    for split in a.splits:
        base = ROOT / a.data
        metas = [json.loads(l) for l in open(base / split / "meta.jsonl")]
        if a.limit:
            metas = metas[: a.limit]
        stats = {}
        conf = {}
        for m in metas:
            img = Image.open(base / "images" / m["file"])
            t = tiles_for(img, m["box"])
            p = sess.run(None, {"tiles": t})[0]
            pred = [FS_CLASSES[i] for i in p.argmax(1)]
            if m["orientation"] == "b":  # image shows the board rotated 180 degrees
                pred = pred[::-1]
            truth = fen_grid(m["fen"])
            for key in ("all", "o=" + m["orientation"], "set=" + m["piece_set"], "theme=" + m["theme"]):
                s = stats.setdefault(key, [0, 0, 0, 0])
                ok = sum(x == y for x, y in zip(pred, truth))
                s[0] += ok; s[1] += 64; s[2] += ok == 64; s[3] += 1
            for x, y in zip(pred, truth):
                if x != y:
                    conf[(y, x)] = conf.get((y, x), 0) + 1
        res[split] = {k: dict(square_acc=v[0] / v[1], board_exact=v[2] / v[3], boards=v[3]) for k, v in sorted(stats.items())}
        res[split]["top_confusions"] = [f"{t}->{p}:{n}" for (t, p), n in sorted(conf.items(), key=lambda kv: -kv[1])[:10]]
        print(split)
        for k, v in res[split].items():
            print("  ", k, v if isinstance(v, list) else (f"sq={v['square_acc']:.4f} board={v['board_exact']:.4f} n={v['boards']}" if isinstance(v, dict) else v))
    if a.out:
        Path(a.out).write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
