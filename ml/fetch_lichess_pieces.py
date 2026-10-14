"""Fetch permissively licensed lichess piece sets (lila repo) and rasterise them to transparent sheets.

Sheets land in data/lichess_pieces/sheet_<set>.png (12 pieces x 128 px, order wK wQ wR wB wN wP bK bQ bR bB bN bP).
Rendering uses headless Chrome (no cairo needed). Licences per lila COPYING.md (checked 2026-10-14):
  Apache-2.0: chessnut (shipped in ml/assets) | CC0: rhosgfx | MIT: fantasy, spatial, celtic (maurimo/chess-art)
  CC BY 4.0 (attribution): kiwen-suwi, firi, totoy, papercut
Training images only; no image is committed and none is shipped in app/.
"""
import subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/lichess_pieces"
SETS = ["rhosgfx", "fantasy", "spatial", "celtic", "kiwen-suwi", "firi", "totoy", "papercut"]
PIECES = "wK wQ wR wB wN wP bK bQ bR bB bN bP".split()
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
RAW = "https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/{}/{}.svg"


def main():
    for s in SETS:
        d = OUT / s
        d.mkdir(parents=True, exist_ok=True)
        for p in PIECES:
            f = d / f"{p}.svg"
            if not f.exists():
                f.write_bytes(urllib.request.urlopen(RAW.format(s, p)).read())
        html = OUT / f"sheet_{s}.html"
        imgs = "".join(f"<img src='{s}/{p}.svg' width=128 height=128>" for p in PIECES)
        html.write_text(f"<body style='margin:0;background:transparent;width:1536px;height:128px;display:flex'>{imgs}</body>")
        png = OUT / f"sheet_{s}.png"
        subprocess.run([CHROME, "--headless=new", "--allow-file-access-from-files", "--default-background-color=00000000",
                        "--hide-scrollbars", f"--screenshot={png}", "--window-size=1536,128", f"file://{html}"],
                       check=True, capture_output=True)
        print("ok", s)


if __name__ == "__main__":
    sys.exit(main())
