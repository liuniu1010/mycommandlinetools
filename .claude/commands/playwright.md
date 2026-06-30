You are automating a Chromium browser via the CLI at `tools/playwright/cli.js`. Run all commands from the repository root. Playwright must be installed (`npm install`) and Chromium binaries present (`npx playwright install chromium`).

## Sessions

Most commands require a running session. Start one first:

```
# Visible browser (preferred for login, MFA, or manual inspection)
node tools/playwright/cli.js session start --name work --headless false

# Headless browser
node tools/playwright/cli.js session start --name work --headless true

# With custom viewport or user-agent
node tools/playwright/cli.js session start --name work --headless false --viewport 1280x720
```

Check or stop a session:
```
node tools/playwright/cli.js session status --name work
node tools/playwright/cli.js session stop --name work
node tools/playwright/cli.js session stop --name work --force   # remove stale metadata without contacting server
```

If `--session` is omitted, commands use the `default` session.

## Navigation

```
node tools/playwright/cli.js goto https://example.com --session work
```

## Reading page content

```
# Full body text
node tools/playwright/cli.js text --session work

# Text from a specific element
node tools/playwright/cli.js text --selector main --session work
node tools/playwright/cli.js text --role heading --name "Welcome" --session work

# Raw HTML
node tools/playwright/cli.js html --session work
node tools/playwright/cli.js html --selector article --session work

# All links (default limit 50)
node tools/playwright/cli.js links --session work --limit 20

# Compact page snapshot for agent use (URL, title, body text, interactive elements)
node tools/playwright/cli.js snapshot --session work
node tools/playwright/cli.js snapshot --session work --json
```

## Clicking, filling, and interacting — ALWAYS require user confirmation first

**Never run click, fill, press, select, check, or uncheck without confirming with the user first.**

Before executing any interaction, show what will be done and ask the user to approve.

```
# Click by role, label, text, CSS selector, etc.
node tools/playwright/cli.js click --role button --name "Sign in" --session work
node tools/playwright/cli.js click --selector ".submit-btn" --session work
node tools/playwright/cli.js click --text "Accept" --session work

# Fill an input
node tools/playwright/cli.js fill --label "Email" --value user@example.com --session work
node tools/playwright/cli.js fill --placeholder "Search..." --value "query" --session work

# Press a key
node tools/playwright/cli.js press Enter --session work
node tools/playwright/cli.js press Tab --session work

# Select a dropdown option
node tools/playwright/cli.js select --label "Country" --value "NZ" --session work

# Check or uncheck a checkbox
node tools/playwright/cli.js check --label "Remember me" --session work
node tools/playwright/cli.js uncheck --label "Subscribe" --session work
```

## Waiting

```
node tools/playwright/cli.js wait --text "Dashboard" --session work
node tools/playwright/cli.js wait --selector ".modal" --state hidden --session work
node tools/playwright/cli.js wait --load-state networkidle --session work
```

## Checking element existence

```
node tools/playwright/cli.js exists --text "Error" --session work
```
Exit code 2 means not found; exit code 0 means found.

## Screenshots — confirm output path with user first

```
node tools/playwright/cli.js screenshot --out downloads/playwright/page.png --session work
node tools/playwright/cli.js screenshot --out downloads/playwright/page.png --session work --full-page
```

## Tabs

```
node tools/playwright/cli.js tabs --session work
node tools/playwright/cli.js tab use --index 1 --session work
```

## One-shot reads (no session needed)

Read-only commands can use `--url` to launch a temporary headless browser for a single action:

```
node tools/playwright/cli.js text --url https://example.com --selector main
node tools/playwright/cli.js links --url https://example.com --limit 20
node tools/playwright/cli.js exists --url https://example.com --text "Example Domain"
node tools/playwright/cli.js screenshot --url https://example.com --out downloads/playwright/example.png
node tools/playwright/cli.js html --url https://example.com --selector body
```

Interaction commands (`click`, `fill`, `press`, `select`, `check`, `uncheck`, `goto`, `snapshot`) require a session and cannot use `--url`.

## Locators

Use exactly one locator type per command:

| Flag | Matches |
|------|---------|
| `--selector <css>` | CSS selector |
| `--text <text>` | visible text content |
| `--role <role> --name <name>` | ARIA role + accessible name (both required) |
| `--label <label>` | form label text |
| `--placeholder <text>` | input placeholder |
| `--title <text>` | element title attribute |
| `--test-id <id>` | data-testid attribute |

Modifiers (combine with any locator):
- `--nth <index>` — zero-based index when multiple elements match
- `--frame <css>` — target an iframe by CSS selector before resolving the locator

## Flow files

Run a sequence of steps from a JSON file against an existing session:

```json
{
  "session": "work",
  "steps": [
    { "goto": "https://example.com" },
    { "wait": { "text": "Example Domain" } },
    { "text": { "selector": "body", "saveAs": "bodyText" } },
    { "screenshot": "downloads/playwright/example.png" }
  ]
}
```

```
node tools/playwright/cli.js flow downloads/example-flow.json
```

## Notes

- Browser profiles are stored under `tools/playwright/.profiles/`. Do not commit them.
- Session metadata is stored under `tools/playwright/.sessions/`. Do not commit it.
- The session server listens only on `127.0.0.1` with a per-session token — it is not exposed externally.
- `snapshot` masks raw input field values by design; do not attempt to read passwords or secrets from it.
- For login pages, always use a headed session (`--headless false`) and let the user type credentials directly into the browser. Never ask for passwords through chat.
- Screenshots write to `downloads/playwright/` by convention; confirm the output path before running.
