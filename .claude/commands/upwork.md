You are searching Upwork jobs via the CLI at `tools/upwork/cli.js`. Run all commands from the repository root.

## Auth
```
node tools/upwork/cli.js auth
```
Opens a browser OAuth flow (Upwork OAuth2 / GraphQL API). Token saved to `tools/upwork/.token.json`. Run if any command returns an auth error.

## Searching jobs
```
# Basic search
node tools/upwork/cli.js search "node.js developer"

# With options
node tools/upwork/cli.js search "react typescript" --limit 20
node tools/upwork/cli.js search "python data science" --sort relevance
node tools/upwork/cli.js search "backend API" --verified-only
node tools/upwork/cli.js search "full stack" --limit 10 --offset 20   # pagination
```

Options:
- `--limit N` — results to return (1–50, default 10)
- `--offset N` — pagination offset (default 0)
- `--sort recency|relevance` — sort order (default: recency)
- `--verified-only` — only jobs from payment-verified clients

Output fields per job: title, id, posted date, type/budget, applicant count, client (verification, hires, rating, location), skills (up to 8), URL.

## Getting a single job
```
node tools/upwork/cli.js job <jobId>
```
Returns full JSON including description, timestamps, status. Job ID is the numeric `id` from search results.

## Opening a job in browser
```
node tools/upwork/cli.js open <jobId>
node tools/upwork/cli.js open <ciphertext>
```
Both numeric job ID and Upwork ciphertext formats are accepted.

## Notes
- Budget display: fixed-price shows "min–max CURRENCY"; hourly shows "$X–$Y/hr USD"
- Client rating is a float (e.g., 4.87); hires is the total number of past contracts
- GraphQL is used internally; the tool handles token refresh automatically
- When the user asks to search without keywords, prompt them for a search term first
