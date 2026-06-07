# Freelancer CLI

Personal CLI for Freelancer.com via the official OAuth2 API.

## Setup

Create `.env` in the repository root:

```bash
FREELANCER_CLIENT_ID=your_client_id
FREELANCER_CLIENT_SECRET=your_client_secret
FREELANCER_CALLBACK_URL=http://localhost:3000/callback
FREELANCER_SCOPE=basic fln:user:email
FREELANCER_ADVANCED_SCOPES=
```

The callback URL must match the redirect URL configured for your Freelancer.com API app.
Use the minimum scopes needed for your workflow. `basic fln:user:email` lets the CLI save profile metadata when the API permits it; bid submission and account-specific reads may require additional scopes or advanced scopes in your Freelancer app.

## Usage

### Auth

```bash
# Standard user OAuth flow (opens browser)
node tools/freelancer/cli.js auth

# App-only client credentials (no browser, tokens don't expire)
node tools/freelancer/cli.js auth --client-credentials
```

### Search projects

```bash
node tools/freelancer/cli.js search "node.js API" --limit 20
node tools/freelancer/cli.js search "python ml" --limit 10 --offset 20
node tools/freelancer/cli.js search "backend" --full-description --user-details
```

Options: `--limit N`, `--offset N`, `--sort FIELD`, `--full-description`, `--compact`, `--user-details`, `--location-details`

### Get a single project

```bash
node tools/freelancer/cli.js project <projectId>
```

### Open project in browser

```bash
node tools/freelancer/cli.js open <projectId-or-url>
```

### Your profile

```bash
node tools/freelancer/cli.js profile
```

### Look up a user/client

```bash
node tools/freelancer/cli.js user <userId-or-username>
```

### Reviews for a project

```bash
node tools/freelancer/cli.js reviews <projectId>
```

### Your bids

```bash
# List your recent bids
node tools/freelancer/cli.js bids [--limit 10]

# List bids on a specific project
node tools/freelancer/cli.js bids <projectId>
```

### Submit a bid

```bash
node tools/freelancer/cli.js bid <projectId> --amount 150 --period 7 --description "I can build this for you"
```

Options: `--amount N`, `--period <days>`, `--description "text"`, `--milestone-percentage N`

### Search contests

```bash
node tools/freelancer/cli.js contests "logo design" --limit 10
node tools/freelancer/cli.js contests --limit 20   # all active contests
```

### Messages

```bash
node tools/freelancer/cli.js messages [--limit 10] [--project <projectId>]
node tools/freelancer/cli.js project-messages <projectId> [--limit 10] [--offset 0]
```

`project-messages` reads Freelancer's project-scoped messages API. The current official API and SDK do not expose a dedicated Project Public Clarification Board endpoint; use this command only for messages returned to your account by the messages API.

### Notifications

```bash
node tools/freelancer/cli.js notifications [--limit 10] [--unread-only]
```

### Milestones

```bash
node tools/freelancer/cli.js milestones <projectId>
node tools/freelancer/cli.js milestone-requests --bid <bidId> [--limit 10] [--offset 0]
node tools/freelancer/cli.js request-milestone <projectId> --bid <bidId> --amount 320 --description "Working bot and setup guide"
```

`milestone-requests` reads pending or historical milestone payment requests. Freelancer's API is most reliable when filtering by bid ID.

`request-milestone` asks the client to create/fund a milestone payment for your bid. This is a side-effecting account action and should only be run after confirming the project, bid ID, amount, and description.

## Notes

- Tokens stored in `tools/freelancer/.token.json` (mode 0600)
- Freelancer uses `Freelancer-OAuth-V1` header instead of `Bearer` — handled automatically
- `bid` submits a proposal and requires explicit user intent plus user OAuth, not client credentials
- `messages`, `notifications`, `bids`, and `milestones` require user OAuth for full access
