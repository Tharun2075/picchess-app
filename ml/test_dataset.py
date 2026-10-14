"""Dataset tests. Run: .venv/bin/python ml/test_dataset.py  (also run by `npm test`)."""
import csv, json, random, sys, tempfile, unittest
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_screen_dataset as m
import piece_sets

ROOT = Path(__file__).resolve().parent.parent
TH, PS = m.TRAIN_THEMES, ["chessnut", "glyph", "letters"]


class Dataset(unittest.TestCase):
    def test_three_boards_reassemble_to_source_fen(self):
        with tempfile.TemporaryDirectory() as d:
            for idx in (0, 1, 2):
                rec, img = m.render_image(6, "train", idx, TH, PS, d)
                tiles = m.slice_board(img, rec["box"], rec["orientation"])
                self.assertEqual(len(tiles), 64)
                self.assertEqual(m.fen_from_labels(m.labels_of(rec["fen"])), rec["fen"])
                again = m.fen_from_labels([m.labels_of(rec["fen"])[i] for i in range(64)])
                self.assertEqual(again, rec["fen"])

    def test_tile_squares_follow_orientation(self):
        rng = random.Random(1)
        board = list(m.random_position(rng))
        opts = dict(tint="yellow", piece_scale=0.9, last_move=[], selected=[], dots=[], arrows=[], arrow_color=(0, 0, 0, 0), coords="none")
        a = m.render_board(rng, board, TH["brown"], "chessnut", 40, False, opts)
        b = m.render_board(rng, board, TH["brown"], "chessnut", 40, True, opts)
        ta, tb = m.slice_board(a, [0, 0, 320], "w"), m.slice_board(b, [0, 0, 320], "b")
        for i in range(64):  # same square, same pixels, whichever way the board faces
            self.assertEqual(ImageChops.difference(ta[i], tb[i]).getbbox() is None or ImageStat.Stat(ImageChops.difference(ta[i], tb[i])).mean[0] < 1.0, True, i)

    def test_deterministic(self):
        with tempfile.TemporaryDirectory() as d1, tempfile.TemporaryDirectory() as d2:
            for idx in (3, 4, 5):
                r1, _ = m.render_image(9, "val", idx, TH, PS, d1)
                r2, _ = m.render_image(9, "val", idx, TH, PS, d2)
                self.assertEqual(r1, r2)
                self.assertEqual((Path(d1) / "images" / r1["file"]).read_bytes(), (Path(d2) / "images" / r2["file"]).read_bytes())

    def test_positions_have_two_kings_and_valid_pawns(self):
        rng = random.Random(3)
        for _ in range(300):
            b = m.random_position(rng)
            self.assertEqual((b.count("K"), b.count("k")), (1, 1))
            self.assertFalse(any(b[i] in "Pp" for i in list(range(8)) + list(range(56, 64))))

    def test_heldout_themes_and_sets_unseen(self):
        self.assertFalse(set(m.HELDOUT_THEMES) & set(m.TRAIN_THEMES))
        held = {k for k, v in piece_sets.SETS.items() if v[3]}
        train = {k for k, v in piece_sets.SETS.items() if not v[3]}
        self.assertTrue(held and not held & train)

    def test_generated_data_if_present(self):
        stats = ROOT / "data" / "screens" / "stats.json"
        if not stats.exists():
            self.skipTest("run ml/make_screen_dataset.py first")
        s = json.loads(stats.read_text())
        for split, v in s["splits"].items():
            self.assertLessEqual(v["tiles"][0] / sum(v["tiles"]), 0.6, split)
        d = ROOT / "data" / "screens" / "train"
        labels = list(csv.DictReader(open(d / "labels.csv")))
        rows = {}
        for r in csv.DictReader(open(d / "tiles.csv")):
            if int(r["board"]) < 3: rows.setdefault(int(r["board"]), []).append((int(r["square"]), int(r["label"])))
        for b in (0, 1, 2):
            want = m.labels_of(labels[b]["fen"])
            self.assertTrue(all(want[sq] == lab for sq, lab in rows[b]))
            self.assertTrue(all(want[i] == 0 or i in dict(rows[b]) for i in range(64)))  # every piece tile kept


if __name__ == "__main__":
    unittest.main()
