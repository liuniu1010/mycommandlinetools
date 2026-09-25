You are automating a Chromium browser via the CLI at `tools/playwright/cli.js`. Run all commands from the repository root. Playwright must be installed (`npm install`) and Chromium binaries present (`npx playwright install chromium`).

## Opening Chrome for the user — ALWAYS use these flags

When the user asks you to "open Chrome", "start a browser", or "open <site>" for browser
work, do **not** let Playwright launch the browser. Launch system Chrome yourself with the
handover flags, then attach:

```
# 1. Reuse the browser if it is already up
curl -s -m 3 http://127.0.0.1:9222/json/version

# 2. Otherwise launch it (on the user's desktop display)
DISPLAY=:10.0 nohup google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-cdp" \
  "<url or about:blank>" > /dev/null 2>&1 &

# 3. Wait for the endpoint, then attach
node tools/playwright/cli.js session start --name work --cdp-url http://127.0.0.1:9222
```

Why, briefly: a Playwright-*launched* browser is stamped `--enable-automation` with
`navigator.webdriver === true`, and Google's sign-in refuses it. A Chrome launched this way
is stamped nothing, so the user can log in by hand and hand the window over.

Rules:

- `$HOME/.chrome-cdp` holds the user's logins. Never delete it, and never swap in a fresh
  profile dir without asking.
- It must stay separate from `~/.config/google-chrome`: Chrome >=136 refuses remote
  debugging on the default profile, and a Chrome the user started from the desktop icon has
  no debugging port and can never be attached.
- Confirm the display before launching (`ls /tmp/.X11-unix`; it is `:10` on this machine).
  Without a display the window cannot be seen, so the user cannot log in.
- If port 9222 is taken by something else, pick another and pass the same port to
  `--cdp-url`.
- Never `--headless` for a browser the user has to log in to.
- Let the user perform every login themselves. Never type credentials and never try to
  automate an OAuth consent screen. If a flow is challenged mid-run, `session stop` (which
  only detaches), let the user click, then attach again.
- `session stop` on an attached browser leaves it running; say so rather than implying the
  browser was closed.
- Flags that only apply at launch (`--profile`, `--executable-path`, `--user-agent`,
  `--viewport`, `--headless`) are rejected together with `--cdp-url`; set them on the Chrome
  command line instead.

Only fall back to a Playwright-launched session (below) when no login is involved, or when
there is no display available.

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
