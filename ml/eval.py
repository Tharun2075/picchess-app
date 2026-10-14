"""Evaluate an ONNX tile classifier (fenshot class order) on whole-board screenshots.

Per-square accuracy, whole-board exact match, per-set / per-theme / per-orientation breakdown and a
13x13 confusion matrix. Held-out = sets and themes never seen in training (see docs/DATASET.md).
Same crop/resize/tile pipeline as ml/eval_fenshot.py, so the two models are compared on identical inputs.

  .venv/bin/python ml/eval.py --model data/model/tilenet.onnx --data data/screens-lichess --splits val heldout --out data/eval_ours.json
"""
import argparse, json
from pathlib import Path
import numpy as np
from PIL import Image
import onnxruntime as ort
from eval_fenshot import FS_CLASSES, fen_grid, tiles_for, ROOT


def run(model, data, split, limit=0):
    sess = ort.InferenceSession(str(model))
    base = ROOT / data
    metas = [json.loads(l) for l in open(base / split / "meta.jsonl")]
    if limit:
        metas = metas[:limit]
    stats, cm = {}, np.zeros((13, 13), dtype=np.int64)
    for m in metas:
        t = tiles_for(Image.open(base / "images" / m["file"]), m["box"])
        pred = sess.run(None, {"tiles": t})[0].argmax(1)
        if m["orientation"] == "b":
            pred = pred[::-1]
        truth = np.array([FS_CLASSES.index(c) for c in fen_grid(m["fen"])])
        ok = int((pred == truth).sum())
        np.add.at(cm, (truth, pred), 1)
        for key in ("all", "o=" + m["orientation"], "set=" + m["piece_set"], "theme=" + m["theme"]):
            s = stats.setdefault(key, [0, 0, 0, 0])
            s[0] += ok; s[1] += 64; s[2] += ok == 64; s[3] += 1
    out = {k: dict(square_acc=v[0] / v[1], board_exact=v[2] / v[3], boards=v[3]) for k, v in sorted(stats.items())}
    out["confusion_rows_truth_cols_pred"] = dict(order=FS_CLASSES, matrix=cm.tolist())
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="data/model/tilenet.onnx")
    ap.add_argument("--data", default="data/screens-lichess")
    ap.add_argument("--splits", nargs="+", default=["val", "heldout"])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    res = {}
    for sp in a.splits:
        res[sp] = run(a.model, a.data, sp, a.limit)
        print(sp)
        for k, v in res[sp].items():
            if k.startswith("confusion"):
                continue
            print(f"   {k} sq={v['square_acc']:.4f} board={v['board_exact']:.4f} n={v['boards']}")
    if a.out:
        Path(a.out).write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
