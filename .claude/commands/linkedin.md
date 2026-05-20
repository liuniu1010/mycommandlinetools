You are building LinkedIn job search URLs via the CLI at `tools/linkedin/cli.js`. Run all commands from the repository root.

**Important:** This tool only constructs URLs and optionally opens them in a browser. It does NOT scrape LinkedIn, make API calls, or automate any browser interaction.

## Building a search URL
```
# Basic keyword search
node tools/linkedin/cli.js search "software engineer"

# With filters
node tools/linkedin/cli.js search "frontend developer" \
  --location "Auckland, New Zealand" \
  --date week \
  --workplace remote \
  --type full-time \
  --experience mid

# Open the URL in browser immediately
node tools/linkedin/cli.js search "data scientist" --location "New Zealand" --open

# Multiple comma-separated values for workplace/type/experience
node tools/linkedin/cli.js search "developer" --workplace remote,hybrid --type full-time,contract
```

### Options
| Flag | Values | Notes |
|------|--------|-------|
| `--location TEXT` | Any location string | e.g. "Auckland" or "New Zealand" |
| `--date` | `day`, `week`, `month` | Posted within time range |
| `--workplace` | `remote`, `hybrid`, `onsite` | Comma-separated for multiple |
| `--type` | `full-time`, `part-time`, `contract`, `temporary`, `internship` | Comma-separated |
| `--experience` | `entry`, `associate`, `mid`, `senior`, `director`, `executive` | Comma-separated |
| `--start N` | Number | Pagination offset |
| `--open` | Boolean flag | Open URL in system browser |

All option values are case-insensitive. Both `onsite` and `on-site` work.

## Open LinkedIn developer page
```
node tools/linkedin/cli.js developer
```

## Notes
- The command prints the constructed URL; use `--open` to also launch the browser
- This tool cannot retrieve job listings — it only builds the search URL for the user to browse
- When the user asks to search LinkedIn, always print the URL and ask if they want it opened
