# picchess-share Worker

One Worker, two KV namespaces (`KV` = counters and rate limits, `SHARES` = shared board images). Free plan only: no R2, no Durable Objects, no card.
Endpoints: `POST /share`, `GET|POST /hit?src=&p=`, `GET /stats?days=7`.

## Deploy
1. `cd worker && npx wrangler kv namespace create picchess-share-kv` and `npx wrangler kv namespace create picchess-shares`; paste the two ids into `wrangler.toml`.
2. `npx wrangler deploy`, note the `*.workers.dev` origin.
3. Put that origin in `app/lib/share.js` (SHARE_ORIGIN) and in `connect-src` of `app/_headers`, then `node tools/stamp-sw.mjs`.
4. Optional: `npx wrangler secret put SALT` (random string) for the IP hash.

## Storage
One `SHARES` entry per share, key `img/<sha256 of image>.<jpg|webp>`, value = image bytes, KV metadata = JSON
`{sha, source, kind, orientation, bottom, sideToMove, predictedFen, correctedFen, fen, corners, appVersion, license: "CC0", ts, receivedAt}`
(under 1 KB). Export: `node tools/export-dataset.mjs`.

## Limits (KV free tier: 1 GB, 1000 writes/day for the whole account)
- 20 shares per IP per hour (429); 900 new shares per day (503). Each share costs about 3 writes (image, IP counter, daily counter), so the real ceiling is about 330 shares/day; when KV refuses a write the Worker answers 503.
- `/hit` is batched: the first hit per day/source/path in an isolate writes at once, later hits are added at most once per hour. Counts are approximate and can lose a little when an isolate is evicted.
- Counters are read-then-write, so limits are approximate under bursts.
