# Deploying PicChess (manual, free static hosting)

Nothing here has been run. PicChess is plain static files in `app/`: no build step, no server code, no keys.
Before every deploy run `node tools/stamp-sw.mjs && npm test` so the service worker's precache list and
cache version match the files (the test fails if they do not).

Largest file is the engine .wasm (about 1.8 MB), far below the 25 MiB per-file limit (checked by tests/sw.test.mjs).

## Cloudflare Pages (free plan)

Option A, connect a git repo (dashboard):
1. Push this repo to GitHub/GitLab yourself (not done by any build).
2. Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git; pick the repo.
3. Framework preset: None. Build command: leave empty (none). Build output directory: `app`. Root directory: `/` (repo root).
4. Save and Deploy. `app/_headers` is picked up automatically (it sits in the output directory).
5. Open the *.pages.dev URL, load once online, then check DevTools > Application > Service Workers is "activated",
   and Network shows `application/wasm` for `stockfish-19-lite-single.wasm`.

Option B, direct upload: dashboard > Workers & Pages > Create > Pages > Upload assets, then drag the `app/` folder.

Notes: the `_headers` file supports `Content-Type: application/wasm`, CSP and no-cache for `sw.js`. The commented
`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` lines are only for a future multi-threaded engine
(SharedArrayBuffer); the current single-threaded engine does not need them.

## Vercel Hobby (free)

`vercel.json` at the repo root already sets `outputDirectory: "app"`, no build command, and the same headers.
1. Vercel dashboard > Add New > Project > import the git repo.
2. Framework preset: Other. Build command: empty. Install command: empty. Output directory: `app` (pre-filled from vercel.json).
3. Deploy. Then do the offline check from step 5 above.

Keep to the Hobby (free) plan; Hobby is for non-commercial use, so check Vercel's terms if the app is ever monetised.

## After deploying

- Any change to an `app/` file needs `node tools/stamp-sw.mjs` again, otherwise returning users keep the old cached copy
  (the cache name is `picchess-<hash of all precached files>`; a new hash installs a new cache and deletes the old one).
- Installing: Android Chrome shows "Install app" in the menu; iOS Safari: Share > Add to Home Screen.
