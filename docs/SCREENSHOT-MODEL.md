# Screenshot model (ticket 07)

Goal: read a chess position from a board screenshot, in the browser, with no server. Output is a 13-class label per square; the board is cropped by a separate step.

## Fenshot vs ours (same boards, same crop, same tiles, onnxruntime)
| model | val square | val whole board | held-out square | held-out whole board |
|---|---|---|---|---|
| fenshot chess-tiles-v2 (MIT, third-party) | 95.0% | 51.1% | 93.2% | 44.3% |
| ours (squares-screen.onnx) | 99.67% | 90.0% | 90.8% | 0.2% |

(Fenshot on the earlier hand-drawn dataset: val 84.4% / 25%, held-out 81.0% / 0%.) The held-out set is celtic, papercut and geo pieces on 4 unseen themes. Fenshot is better on those held-out sets, ours is better on the sets we trained on.

## Decision
We ship our own model: it is higher on the trained piece sets (99.67% vs 95.0% per square) and we know its training data and licences exactly. Fenshot is rejected as the shipped model for the screenshots we render; it stays vendored as the baseline and its code is credited (docs/THIRD-PARTY.md). Note honestly that fenshot generalises better to unseen art (44% vs 0.2% whole boards on held-out): a later ticket could ensemble them or add real screenshots to training.

## Licences
Fenshot MIT (SORTINO LABS S.R.L.). Piece sets: all ten audited against lila's COPYING.md, all allow use and derivatives (Apache-2.0, CC0, MIT, CC BY 4.0); list in data/SOURCES.md and docs/MODEL_CARD.md. Images are training-only and never ship.

## Honest limits
- Hand-drawn / unfamiliar piece art: unseen-set accuracy is 87-94% per square and 0-0.5% whole board, so one wrong square per board is typical. The app must show the result and let the user correct it (the board editor does this).
- Real screenshots are unmeasured. Whole-board accuracy on trained sets is 90%, weakest on firi (54.7%).
- Only grey tiles, 32x32. Input must be a cropped board.
- Probe: removing the "spatial" set from training gives 98.5% square / 28.8% whole board on spatial; removing the "purple" theme gives 99.5% / 78.4%. New themes are cheap, new piece sets are not.
