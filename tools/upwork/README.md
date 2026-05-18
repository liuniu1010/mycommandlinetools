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

## Usage

```bash
node tools/upwork/cli.js auth
node tools/upwork/cli.js search "node.js openai api" --limit 20
node tools/upwork/cli.js search "aws lambda" --verified-only
node tools/upwork/cli.js open <jobId-or-ciphertext>
```

OAuth tokens are stored locally in `tools/upwork/.token.json`. The token file also includes account metadata when the Upwork API key has permission to read the current user.
