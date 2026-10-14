# Third-party code and data

## fenshot
- Author: SORTINO LABS S.R.L. (scoriiu). URL: https://github.com/scoriiu/fenshot. Licence: MIT (vendor/fenshot/LICENSE, vendor/fenshot/packages/fenshot/LICENSE).
- Used: studied and adapted the tile network, loss, optimiser and tile jitter (ml/train_squares.py), the tile slicing and class order "1KQRBNPkqrbnp" (ml/eval_fenshot.py, ml/eval.py). Its ONNX model was run only as a baseline for comparison; it is not shipped.
- Vendored (trimmed to 1.3 MB; the original was 11 MB with demo video, fixtures and web app): LICENSE, README, packages/fenshot/{LICENSE,README.md,model/chess-tiles-v2.onnx,src/*.ts}. The .git directory was removed.

## Lichess piece sets (training images only, never shipped, never committed)
Source: https://github.com/lichess-org/lila (COPYING.md). chessnut Apache-2.0 Alexis Luengas; rhosgfx CC0 RhosGFX; fantasy, spatial, celtic MIT Maurizio Monge (chess-art); kiwen-suwi CC BY 4.0 neverRare; firi CC BY 4.0 James Faure; totoy CC BY 4.0 Kosal Sen; papercut CC BY 4.0 Nikolay Anzarov. CC BY attribution is given here and in docs/MODEL_CARD.md.

## Python tools (development only)
Pillow (HPND), numpy (BSD), onnxruntime (MIT), onnx (Apache-2.0), PyTorch (BSD-3). None ships in the app.
