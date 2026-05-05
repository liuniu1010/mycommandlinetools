# Personal Toolset Commands

This repository contains personal command-line tools. Run commands from the
repository root unless a tool says otherwise.

## Setup

Install dependencies:

```bash
npm install
```

Create a root `.env` file for private credentials. Do not commit `.env`.

For Upwork:

```bash
UPWORK_CLIENT_ID=your_client_id
UPWORK_CLIENT_SECRET=your_client_secret
UPWORK_CALLBACK_URL=http://localhost:3000/callback
```

## Verification

Run the full verification pipeline before commits:

```bash
npm run verify
```

This runs syntax checks, lint checks, and a build:

```bash
npm run type-check
npm run lint
npm run build
```

Equivalent test command:

```bash
npm test
```

## Gmail

Implementation:

```text
tools/gmail/cli.js
```

Tool notes:

- Requires a Google Cloud OAuth client with Gmail API access enabled.
- Uses the root `.env` file.
- Saves OAuth tokens locally to `tools/gmail/.token.json`.
- Uses read-only and send scopes by default.

Authenticate with Gmail:

```bash
npm run gmail:auth
```

List messages:

```bash
npm run gmail:list -- --query "is:unread newer_than:7d" --limit 10
```

Read one message:

```bash
node tools/gmail/cli.js read <messageId>
```

Send a plain-text message:

```bash
node tools/gmail/cli.js send --to you@example.com --subject "Hello" --body "Test message"
```

## Upwork

Implementation:

```text
tools/upwork/cli.js
```

Tool notes:

- Requires an enabled Upwork OAuth2 API key.
- Uses the root `.env` file.
- Saves OAuth tokens locally to `tools/upwork/.token.json`.
- Does not submit proposals. Use it to search and inspect jobs, then apply
  manually in the Upwork website.

Authenticate with Upwork:

```bash
npm run upwork:auth
```

Search jobs:

```bash
npm run upwork:search -- "node.js openai api" --limit 20
```

Search by relevance:

```bash
npm run upwork:search -- "node.js openai api" --limit 20 --sort relevance
```

Search only jobs with verified client payment, if supported by the API:

```bash
npm run upwork:search -- "aws lambda" --verified-only
```

Open a job in the browser:

```bash
node tools/upwork/cli.js open <jobId-or-ciphertext>
```

Fetch one job by ID:

```bash
node tools/upwork/cli.js job <jobId>
```

Show Upwork CLI help:

```bash
node tools/upwork/cli.js help
```
