# Real screenshots (owner drops them here)

Put real screenshots of chess boards in this folder (png/jpg/webp; images are gitignored, never commit them).
List them in `labels.csv`, one row per image:

    file,fen,orientation
    game1.png,rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR,w

- `file`: file name inside this folder.
- `fen`: piece placement only (the first FEN field, ranks 8 to 1), or a full FEN (extra fields are ignored).
- `orientation`: `w` if White is at the bottom of the screenshot, `b` if Black is at the bottom.

The synthetic dataset uses the same three columns in `data/screens/<split>/labels.csv`.
`ml/eval_real.py` is not part of this ticket; a later ticket reads this folder to measure the classifier on real data.
