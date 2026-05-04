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

Check source syntax:

```bash
npm run verify
```

Equivalent test command:

```bash
npm test
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

