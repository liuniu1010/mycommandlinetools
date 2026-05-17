# Freelancer CLI

Personal CLI for Freelancer.com OAuth and read-only project search through the official API.

## Setup

Create `.env` in the repository root:

```bash
FREELANCER_CLIENT_ID=your_client_id
FREELANCER_CLIENT_SECRET=your_client_secret
FREELANCER_CALLBACK_URL=http://localhost:3000/callback
FREELANCER_SCOPE=basic
FREELANCER_ADVANCED_SCOPES=
```

The callback URL must match the redirect URL configured for your Freelancer.com API app.

## Usage

Authorize with the browser OAuth flow:

```bash
npm run freelancer:auth
```

If your Freelancer app is configured for owner-only desktop access, client credentials may be available:

```bash
node tools/freelancer/cli.js auth --client-credentials
```

Search active projects:

```bash
npm run freelancer:search -- "java spring boot" --limit 20
node tools/freelancer/cli.js search "ai agent" --limit 10 --offset 20
```

Read a project by ID:

```bash
node tools/freelancer/cli.js project <projectId>
```

Open a project in the browser:

```bash
node tools/freelancer/cli.js open <projectId-or-url>
```

OAuth tokens are stored locally in `tools/freelancer/.token.json`. Browser OAuth tokens also include account metadata when the Freelancer API returns it; client-credentials tokens are labelled as app credentials.
