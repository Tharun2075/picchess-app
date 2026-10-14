# Data sources

Piece art is TRAINING-ONLY data: images are rendered locally into data/ (gitignored) and never shipped in app/.
Licences per lila's COPYING.md (https://github.com/lichess-org/lila/blob/master/COPYING.md, read 2026-10-14).

| piece set | split | author | licence |
|---|---|---|---|
| chessnut | train/val | Alexis Luengas (https://github.com/LexLuengas/chessnut-pieces) | Apache-2.0 |
| rhosgfx | train/val | RhosGFX (https://rhosgfx.itch.io/) | CC0 1.0 |
| fantasy | train/val | Maurizio Monge (https://github.com/maurimo/chess-art) | MIT |
| spatial | train/val | Maurizio Monge (https://github.com/maurimo/chess-art) | MIT |
| kiwen-suwi | train/val | neverRare (https://github.com/neverRare) | CC BY 4.0 |
| firi | train/val | James Faure (https://github.com/jfaure/Firi-pieceset) | CC BY 4.0 |
| totoy | train/val | Kosal Sen (https://github.com/lichess-org/lila) | CC BY 4.0 |
| celtic | held out only | Maurizio Monge (https://github.com/maurimo/chess-art) | MIT |
| papercut | held out only | Nikolay Anzarov (https://nikoichu.itch.io/) | CC BY 4.0 |
| geo | held out only | Own drawing code (ml/piece_sets.py) | CC0 |

All ten allow use and derivatives; none is non-commercial, no-derivatives or unlicensed, so no set was dropped.
CC BY 4.0 attribution is given here, in docs/MODEL_CARD.md and docs/THIRD-PARTY.md.
Positions: own random-playout code (no third-party data). Board themes: own colour tables.
Earlier glyph / letters / serif font-derived sets are no longer used by the lichess dataset (data/screens-lichess).
Fenshot (MIT, SORTINO LABS S.R.L.): code studied and adapted, its model is NOT used; see docs/THIRD-PARTY.md.
