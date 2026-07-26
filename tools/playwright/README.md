# Playwright CLI

Command-line browser automation for common website operations. The tool is
designed for Codex CLI, Claude CLI, and direct terminal use: each command does
one thing, and persistent sessions let commands combine into larger workflows.

Run commands from the repository root.

## Setup

Install dependencies:

```bash
npm install
```

If Chromium is not installed for Playwright yet:

```bash
npx playwright install chromium
```

## Sessions

Start a visible browser session:

```bash
node tools/playwright/cli.js session start --name work --headless false
```

Start a headless session:

```bash
node tools/playwright/cli.js session start --name work --headless true
```

Navigate and inspect the same browser:

```bash
node tools/playwright/cli.js goto https://example.com --session work
node tools/playwright/cli.js text --selector main --session work
node tools/playwright/cli.js screenshot --session work --out downloads/playwright/example.png
```

Check or stop the session:

```bash
node tools/playwright/cli.js session status --name work
node tools/playwright/cli.js session stop --name work
```

If `--session` is omitted, commands use the `default` session.

List tabs and switch the active tab:

```bash
node tools/playwright/cli.js tabs --session work
node tools/playwright/cli.js tab use --index 1 --session work
```

## One-Shot Reads

Read-oriented commands can use `--url` without starting a session. These launch
a temporary browser, run one action, then close it. One-shot mode defaults to
headless and can be changed with `--headless false`.

```bash
node tools/playwright/cli.js text --url https://example.com --selector main
node tools/playwright/cli.js html --url https://example.com --selector main
node tools/playwright/cli.js links --url https://example.com --limit 20
node tools/playwright/cli.js exists --url https://example.com --text "Example Domain"
node tools/playwright/cli.js screenshot --url https://example.com --out downloads/playwright/example.png
```

Commands that mutate page state, such as `click`, `fill`, `press`, `select`,
`check`, and `uncheck`, require a session.

## Locators

Use one locator type per command:

```bash
--selector <css>
--text <text>
--role <role> --name <accessible-name>
--label <label>
--placeholder <placeholder>
--title <title>
--test-id <id>
--nth <index>
--frame <iframe-css-selector>
```

Examples:

```bash
node tools/playwright/cli.js click --role button --name "Sign in" --session work
node tools/playwright/cli.js fill --label Email --value user@example.com --session work
node tools/playwright/cli.js wait --text Dashboard --session work
node tools/playwright/cli.js click --selector ".card" --nth 0 --frame iframe --session work
```

`--nth` is zero-based and chooses one element from the resolved locator.
`--frame` targets an iframe by CSS selector before resolving the locator.

## Page Inspection

Use `snapshot` to get compact page state for an agent:

```bash
node tools/playwright/cli.js snapshot --session work --json
```

Snapshot output includes URL, title, visible body text, and interactive element
metadata. It does not read raw input values, so password and form field contents
are not exposed by default.

For repeated website checks, use targeted inspection commands:

```bash
node tools/playwright/cli.js page-state --session work --json
node tools/playwright/cli.js read-keylines --session work --pattern "submitted|error|Connects" --context 1
node tools/playwright/cli.js controls --session work --pattern "submit|apply|proposal" --json
node tools/playwright/cli.js inspect-form --session work --json
```

`page-state` reports URL, title, viewport, scroll position, likely login/CAPTCHA
blocking, and a compact text preview. `read-keylines` filters visible text by a
regular expression. `controls` lists visible buttons, links, inputs, labels, and
ARIA controls with stable DOM indexes for the current page. `inspect-form` lists
visible form fields and validation messages while avoiding password, hidden, and
file values.

These read-only commands can also use `--url` for one-shot reads:

```bash
node tools/playwright/cli.js read-keylines --url https://example.com --pattern "Example"
node tools/playwright/cli.js inspect-form --url https://example.com --json
```

## Form Workflows

For pages with custom controls or long forms:

```bash
node tools/playwright/cli.js scroll --to bottom --session work
node tools/playwright/cli.js click-index --index 42 --session work
node tools/playwright/cli.js select-combobox --index 44 --option "Never" --session work
node tools/playwright/cli.js fill-textareas --values downloads/playwright/answers.json --session work
node tools/playwright/cli.js submit-check --role button --name "Submit proposal" --session work
```

`click-index` uses indexes from `controls`. `select-combobox` is for modern
non-native dropdowns such as `div role="combobox"` widgets; native `<select>`
elements should still use `select`. `fill-textareas` accepts a JSON array from a
file path or inline JSON string and fills textareas by order. `submit-check`
clicks the explicit submit locator you provide, waits briefly, then prints
success or validation lines.

For actions that submit proposals, send messages, place bids, spend Connects, or
otherwise affect an account, get user confirmation before running the command.

## Flow Files

Flows are JSON files for repeatable sequences against an existing session. Flow
steps use the same command names and options as the CLI commands.

```json
{
  "session": "work",
  "steps": [
    { "goto": "https://example.com" },
    { "wait": { "text": "Example Domain" } },
    { "text": { "selector": "body", "saveAs": "bodyText" } },
    { "click": { "frame": "iframe", "selector": ".card", "nth": 0 } },
    { "screenshot": "downloads/playwright/example.png" }
  ]
}
```

Run:

```bash
node tools/playwright/cli.js flow downloads/example-flow.json
```

## Safety Notes

- Browser profiles are stored under `tools/playwright/.profiles/`.
- Session metadata is stored under `tools/playwright/.sessions/`.
- Do not commit browser profiles, sessions, screenshots, videos, or traces.
- The session server listens only on `127.0.0.1` and uses a per-session token.
- Do not print or share cookies, auth headers, storage state, or tokens.
- Respect each website's terms and automation policies.

## Troubleshooting

If Playwright is missing:

```text
Playwright is not installed. Run: npm install
```

If Chromium is missing:

```text
Playwright browser binaries are missing. Run: npx playwright install chromium
```

If a session is stale:

```bash
node tools/playwright/cli.js session stop --name work --force
node tools/playwright/cli.js session start --name work --headless false
```
