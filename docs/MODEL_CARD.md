# Model card: squares-screen (screenshot square classifier)

File: app/models/squares-screen.onnx, 1,288,341 bytes (1.23 MB), sha256 `d52db71ece09ad72535c2a32b57d36dacadb96d732fab02864dbe08e04f8b9a8`. Manifest: app/models/squares-screen.json.
Network: 3 conv layers (32/64/64, batch norm, max pool) + 2 dense layers, 321,805 parameters, adapted from fenshot's tile classifier (MIT). Trained by us from scratch.

## Input and output
- Input `tiles`: float32 [n, 1024]. Each row is one 32x32 grey tile, row-major, values 0..1 (divide the 8-bit grey by 255; no mean/std). The model reshapes to [n,1,32,32] (NCHW) itself.
- Preparation: crop the board square, grey = 0.299R+0.587G+0.114B, resize to 256x256 (bilinear), cut into 8x8 tiles of 32x32, row-major from the top-left of the image. If black is at the bottom, reverse the 64 results.
- Output `probs`: float32 [n, 13], softmax already applied. ONNX opset 17, dynamic n.
- Class order: 0 = empty, 1 K, 2 Q, 3 R, 4 B, 5 N, 6 P (white, uppercase), 7 k, 8 q, 9 r, 10 b, 11 n, 12 p (black, lowercase). Same as fenshot ("1KQRBNPkqrbnp").

## Training data (all synthetic, rendered locally, nothing shipped)
Own random-playout positions rendered on 10 board themes with 7 piece sets (train/val), with screenshot damage (JPEG, blur, scale, dark mode, arrows, highlights, coordinates). 18,000 train boards (894,733 tiles), 1,200 val boards (unseen positions, same sets and themes), 1,800 held-out boards (3 unseen piece sets, 4 unseen themes). Training uses heavy per-tile augmentation (affine, blur, gamma, noise).
Licences (details in data/SOURCES.md): chessnut Apache-2.0 (Alexis Luengas); rhosgfx CC0 (RhosGFX); fantasy, spatial MIT (Maurizio Monge); kiwen-suwi CC BY 4.0 (neverRare); firi CC BY 4.0 (James Faure); totoy CC BY 4.0 (Kosal Sen). Held out only: celtic MIT (Maurizio Monge), papercut CC BY 4.0 (Nikolay Anzarov), geo own CC0.

## Metrics (onnxruntime, shipped file, ml/eval.py; whole board = all 64 squares right)
| split | square | whole board |
|---|---|---|
| val (trained sets, unseen positions) | 99.67% | 90.0% (1200 boards) |
| held out celtic (unseen set) | 91.2% | 0.0% |
| held out papercut (unseen set) | 93.9% | 0.5% |
| held out geo (unseen hand-drawn set) | 87.0% | 0.0% |
| probe: spatial removed from training, tested on spatial | 98.5% | 28.8% |
| probe: purple theme removed from training, tested on purple | 99.5% | 78.4% |
Per set on val, whole board: chessnut 97.7, fantasy 96.8, spatial 96.8, totoy 98.0, rhosgfx 94.8, kiwen-suwi 91.9, firi 54.7 (firi is the weakest; its pieces are easy to mix up). The probe models are not shipped.
Fenshot's own model on the same val boards: 95.0% square, 51.1% whole board (see docs/SCREENSHOT-MODEL.md).

## Limits
Unfamiliar piece art drops to about 90% per square and almost never gives a fully right board, so the app needs the user's correction step. Real screenshots are unmeasured (data/real_screens is empty). Grey tiles only: colour carries no information, so pieces whose side is told only by colour hue could be confused. int8 quantisation was tried and not shipped (ConvInteger is not supported by onnxruntime CPU).
