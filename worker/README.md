# picchess-share Worker

One Worker, one R2 bucket (`picchess-share`), one KV namespace. Free plan only.
Endpoints: `POST /share`, `GET|POST /hit?src=&p=`, `GET /stats?days=7`.

## Deploy
1. Enable R2 in the Cloudflare dashboard (the account must have R2 enabled; Cloudflare may ask for a payment method for this, in which case stop).
2. `cd worker && npx wrangler r2 bucket create picchess-share`
3. `npx wrangler kv namespace create picchess-share-kv`, paste the id into `wrangler.toml`.
4. `npx wrangler deploy`, note the `*.workers.dev` origin.
5. Put that origin in `app/lib/share.js` (SHARE_ORIGIN) and in `connect-src` of `app/_headers`, then `node tools/stamp-sw.mjs`.
6. Optional: `npx wrangler secret put SALT` (random string) for the IP hash.

Limits: 20 shares per IP per hour (429), 5000 new objects per day (503). KV counters are read-then-write, so limits are approximate under bursts; that is acceptable for a free-tier guard.
