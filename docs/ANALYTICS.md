# Analytics (Cloudflare Web Analytics, free, no cookies)

Status 2026-10-14: the beacon is NOT installed yet. Creating the Web Analytics site needs a token with
"Account > Web Analytics > Edit"; the wrangler OAuth login and the thatched read-only token both get
"Authentication error" on POST /accounts/{id}/rum/site_info.

## Enable (one-time, dashboard, needs a human)
Account that owns the Pages project `picchess` (kandukuriagrigroup): Workers & Pages > picchess >
Metrics > Web Analytics > Enable. (Or Web Analytics > Add a site > picchess.pages.dev.) Copy the beacon token,
then add before `</body>` in app/index.html:
`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "TOKEN"}'></script>`
and in app/_headers CSP add `https://static.cloudflareinsights.com` to script-src and
`https://cloudflareinsights.com` to connect-src. Then `node tools/stamp-sw.mjs && npm test`, deploy.

## Read the numbers
Dashboard: Web Analytics > picchess.pages.dev > Visits / Page views, filter by Referer.
API (token with Account Analytics Read), last 24h visits by referrer (GraphQL, POST /client/v4/graphql):
`{viewer{accounts(filter:{accountTag:"ACCOUNT_ID"}){rumPageloadEventsAdaptiveGroups(limit:20,orderBy:[count_DESC],filter:{datetime_geq:"START",datetime_leq:"END",siteTag:"SITE_TAG"}){count dimensions{refererHost}}}}}`
(visits: use rumPageloadEventsAdaptiveGroups sum{visits}.)
