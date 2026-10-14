"""Train the 13-class square classifier on the lichess-only synthetic dataset (MPS, CPU fallback).

Network, loss, optimiser and tile jitter are adapted from fenshot's tools/tile-classifier/train.py
(MIT, (c) 2026 SORTINO LABS S.R.L.; see vendor/fenshot/LICENSE and docs/THIRD-PARTY.md).
Changes: reads our tiles.bin/tiles.csv, early stopping, val split = our val split, fixed seed, logs JSON metrics.

Output class order is fenshot's "1KQRBNPkqrbnp" so the same decoder works for both models.
Input: float32 [N,1024], a 32x32 grey tile, row-major, scaled 0..1. Output: softmax [N,13].

  .venv/bin/python ml/train_squares.py --data data/screens-lichess --out data/model
"""
import argparse, json, time
from pathlib import Path
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as F

LABELS = "1KQRBNPkqrbnp"
OURS_TO_FS = np.array([0, 6, 5, 4, 3, 2, 1, 12, 11, 10, 9, 8, 7])  # ours 0 empty,1-6 wPNBRQK,7-12 bPNBRQK -> fenshot idx


class TileNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1, self.bn1 = nn.Conv2d(1, 32, 3, padding=1), nn.BatchNorm2d(32)
        self.conv2, self.bn2 = nn.Conv2d(32, 64, 3, padding=1), nn.BatchNorm2d(64)
        self.conv3, self.bn3 = nn.Conv2d(64, 64, 3, padding=1), nn.BatchNorm2d(64)
        self.fc1, self.drop, self.fc2 = nn.Linear(64 * 4 * 4, 256), nn.Dropout(0.2), nn.Linear(256, 13)

    def forward(self, x):
        x = x.reshape(-1, 1, 32, 32)
        for c, b in ((self.conv1, self.bn1), (self.conv2, self.bn2), (self.conv3, self.bn3)):
            x = F.max_pool2d(F.relu(b(c(x))), 2)
        return self.fc2(self.drop(F.relu(self.fc1(x.flatten(1)))))


class ExportNet(nn.Module):
    def __init__(self, net):
        super().__init__()
        self.net = net

    def forward(self, x):
        return F.softmax(self.net(x), dim=1)


def load(data, split):
    d = Path(data) / split
    x = np.fromfile(d / "tiles.bin", dtype=np.uint8).reshape(-1, 1024)
    y = np.loadtxt(d / "tiles.csv", delimiter=",", skiprows=1, usecols=2, dtype=np.int64)
    assert len(x) == len(y)
    return x, OURS_TO_FS[y]


def augment(x, gen):
    """Per-tile random affine (scale/rotate/shear/shift), blur, gamma, gain/bias, noise. Forces style-robustness."""
    n = x.shape[0]
    r = lambda lo, hi, *sh: lo + (hi - lo) * torch.rand(n, *sh, device=x.device, generator=gen)
    img = x.reshape(n, 1, 32, 32)
    ang, sc, sh = r(-0.12, 0.12), r(0.82, 1.18), r(-0.12, 0.12)
    tx, ty = r(-0.14, 0.14), r(-0.14, 0.14)
    th = torch.zeros(n, 2, 3, device=x.device)
    th[:, 0, 0] = torch.cos(ang) / sc; th[:, 0, 1] = -torch.sin(ang) / sc + sh; th[:, 0, 2] = tx
    th[:, 1, 0] = torch.sin(ang) / sc; th[:, 1, 1] = torch.cos(ang) / sc; th[:, 1, 2] = ty
    grid = F.affine_grid(th, img.shape, align_corners=False)
    # pad with the tile's own corner colour so the warp does not add black borders
    fill = img[:, :, :2, :2].mean((2, 3), keepdim=True)
    img = F.grid_sample(img - fill, grid, padding_mode="zeros", align_corners=False) + fill
    k = torch.tensor([[1., 2., 1.], [2., 4., 2.], [1., 2., 1.]], device=x.device).div(16).reshape(1, 1, 3, 3)
    blur = (r(0, 1) < 0.35).float().reshape(n, 1, 1, 1)
    img = blur * F.conv2d(F.pad(img, (1, 1, 1, 1), mode="replicate"), k) + (1 - blur) * img
    img = img.clamp(0, 1) ** r(0.7, 1.4).reshape(n, 1, 1, 1)
    img = img * (1.0 + (r(0, 1, 1) - 0.5) * 0.4).reshape(n, 1, 1, 1) + (r(0, 1, 1) - 0.5).reshape(n, 1, 1, 1) * 0.16
    img = img + torch.randn(img.shape, device=x.device, generator=gen) * 0.015
    return img.clamp(0, 1).reshape(n, 1024)


def evaluate(model, x, y, dev, bs=4096):
    model.eval()
    pred = []
    with torch.no_grad():
        for i in range(0, len(x), bs):
            pred.append(model(torch.from_numpy(x[i:i + bs]).float().div_(255).to(dev)).argmax(1).cpu().numpy())
    return float((np.concatenate(pred) == y).mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/screens-lichess")
    ap.add_argument("--out", default="data/model")
    ap.add_argument("--epochs", type=int, default=24)
    ap.add_argument("--patience", type=int, default=4)
    ap.add_argument("--batch", type=int, default=1024)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--exclude-set", nargs="*", default=[], help="drop these piece sets from TRAIN (generalisation probe)")
    ap.add_argument("--exclude-theme", nargs="*", default=[], help="drop these board themes from TRAIN (generalisation probe)")
    a = ap.parse_args()
    torch.manual_seed(a.seed); np.random.seed(a.seed)
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    print("device", dev, flush=True)
    xt, yt = load(a.data, "train"); xv, yv = load(a.data, "val")
    if a.exclude_set or a.exclude_theme:
        metas = [json.loads(l) for l in open(Path(a.data) / "train" / "meta.jsonl")]
        drop = np.array([m["piece_set"] in a.exclude_set or m["theme"] in a.exclude_theme for m in metas])
        boards = np.loadtxt(Path(a.data) / "train" / "tiles.csv", delimiter=",", skiprows=1, usecols=0, dtype=np.int64)
        keep = ~drop[boards]
        xt, yt = xt[keep], yt[keep]
        print(f"excluded sets {a.exclude_set} themes {a.exclude_theme}: kept {keep.sum()} of {len(keep)} train tiles", flush=True)
    print(f"train tiles {len(xt)} val tiles {len(xv)}", flush=True)
    model = TileNet().to(dev)
    print("params", sum(p.numel() for p in model.parameters()))
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    steps = (len(xt) + a.batch - 1) // a.batch
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=a.epochs * steps)
    lossf = nn.CrossEntropyLoss(label_smoothing=0.05)
    gen = torch.Generator(device=dev); gen.manual_seed(a.seed)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    best, bad, hist = 0.0, 0, []
    for ep in range(a.epochs):
        model.train(); t0 = time.time(); tot = 0.0
        perm = np.random.permutation(len(xt))
        for i in range(0, len(perm), a.batch):
            idx = np.sort(perm[i:i + a.batch])
            xb = augment(torch.from_numpy(xt[idx]).float().div_(255).to(dev), gen)
            yb = torch.from_numpy(yt[idx]).to(dev)
            opt.zero_grad(); loss = lossf(model(xb), yb); loss.backward(); opt.step(); sched.step()
            tot += loss.item() * len(idx)
        acc = evaluate(model, xv, yv, dev)
        hist.append(dict(epoch=ep + 1, loss=tot / len(perm), val_tile_acc=acc))
        print(f"epoch {ep+1}/{a.epochs} loss {tot/len(perm):.4f} val_tile_acc {acc:.5f} ({time.time()-t0:.0f}s)", flush=True)
        if acc > best:
            best, bad = acc, 0
            torch.save(model.state_dict(), out / "tilenet.pt")
        else:
            bad += 1
            if bad >= a.patience:
                print("early stop"); break
    (out / "train_log.json").write_text(json.dumps(dict(best_val_tile_acc=best, history=hist, seed=a.seed, device=dev), indent=1))
    print("best val_tile_acc", best)


if __name__ == "__main__":
    main()
