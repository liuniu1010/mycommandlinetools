# Upwork CLI

Personal CLI for Upwork OAuth and job search.

## Setup

Create `.env` in the repository root:

```bash
UPWORK_CLIENT_ID=your_client_id
UPWORK_CLIENT_SECRET=your_client_secret
UPWORK_CALLBACK_URL=http://localhost:3000/callback
```

The API key must be enabled by Upwork before OAuth will work.
For step-by-step credential setup, see [../../OAUTH_SETUP.md#upwork](../../OAUTH_SETUP.md#upwork).

## Usage

```bash
node tools/upwork/cli.js auth
node tools/upwork/cli.js search "node.js openai api" --limit 20
node tools/upwork/cli.js search "aws lambda" --verified-only
node tools/upwork/cli.js open <jobId-or-ciphertext>
```

OAuth tokens are stored locally in `tools/upwork/.token.json`. The token file also includes account metadata when the Upwork API key has permission to read the current user.

This CLI is for OAuth, search, lookup, and opening job pages. It does not submit
proposals through the Upwork API. For logged-in website workflows such as reading
proposal forms, filling proposal answers, or checking submit results, use
`node tools/playwright/cli.js ...` with an explicitly confirmed browser session.
