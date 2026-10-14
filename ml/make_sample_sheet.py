"""Write a PNG sample: 4 board images and 16 of their labelled tiles. Usage: make_sample_sheet.py data/screens docs/dataset-sample.png"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_screen_dataset as m

root, outp = Path(sys.argv[1]), sys.argv[2]
rows = [json.loads(l) for l in open(root / "train" / "meta.jsonl")][:4]
sheet = Image.new("RGB", (4 * 200, 200 + 4 * 48 + 8), (30, 30, 30))
d = ImageDraw.Draw(sheet)
tiles = []
for k, r in enumerate(rows):
    img = Image.open(root / "images" / r["file"]).convert("RGB")
    thumb = img.copy(); thumb.thumbnail((190, 190)); sheet.paste(thumb, (k * 200 + 5, 5))
    t = m.slice_board(img, r["box"], r["orientation"]); lab = m.labels_of(r["fen"])
    sel = [i for i in range(64) if lab[i]][:3] + [i for i in range(64) if not lab[i]][:1]
    tiles += [(t[i], m.CLASSES[lab[i]]) for i in sel]
for n, (t, name) in enumerate(tiles):
    x, y = (n % 4) * 200 + 10, 200 + (n // 4) * 48 + 4
    sheet.paste(t.convert("RGB"), (x, y)); d.text((x + 40, y + 14), name, fill=(230, 230, 230))
sheet.save(outp)
