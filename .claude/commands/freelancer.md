You are searching Freelancer.com projects via the CLI at `tools/freelancer/cli.js`. Run all commands from the repository root.

## Auth
```
# Standard user OAuth flow (opens browser)
node tools/freelancer/cli.js auth

# App-only client credentials (no browser, tokens don't expire — use when API key supports it)
node tools/freelancer/cli.js auth --client-credentials
```
Token saved to `tools/freelancer/.token.json`. Note: Freelancer uses `Freelancer-OAuth-V1` header, not Bearer — this is handled automatically.

## Searching projects
```
# Basic search
node tools/freelancer/cli.js search "node.js API"

# With options
node tools/freelancer/cli.js search "python machine learning" --limit 20
node tools/freelancer/cli.js search "react frontend" --limit 10 --offset 10   # pagination
node tools/freelancer/cli.js search "backend developer" --full-description      # include full text
node tools/freelancer/cli.js search "mobile app" --compact                      # omit descriptions
node tools/freelancer/cli.js search "data entry" --user-details                 # include poster metadata
```

Options:
- `--limit N` — results (1–100, default 10)
- `--offset N` — pagination offset (default 0)
- `--sort FIELD` — sort field (default: time_updated)
- `--compact` — omit full descriptions (faster output)
- `--full-description` — include full project descriptions
- `--user-details` — include employer user metadata
- `--location-details` — include location metadata

Output fields: title, id, posted date, type/budget, bid count, skills (up to 8), preview, URL.
Budget format: "min–max CURRENCY", "min+ CURRENCY", or "up to max CURRENCY".

## Getting a single project
```
node tools/freelancer/cli.js project <projectId>
```
Returns full JSON including full_description, job_details, user_details, location_details.

## Opening a project in browser
```
node tools/freelancer/cli.js open <projectId>
node tools/freelancer/cli.js open <project-url>
```
Both numeric project ID and full Freelancer project URLs are accepted.

## Notes
- API errors are returned as `{status: "error", ...}` in the response body (not HTTP errors)
- When the user asks to search without keywords, prompt them for a search term first
- `--client-credentials` is only available if the Freelancer app has it enabled
