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
FREELANCER_BASE_URL=https://www.freelancer.com
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

### Profile skills

Freelancer's API calls profile skills `jobs`. The CLI exposes them as
`profile-skills` because that matches the website wording.

```bash
# List current profile skills
node tools/freelancer/cli.js profile-skills list

# Add skills by Freelancer job/skill ID
node tools/freelancer/cli.js profile-skills add 2894 2916 2925

# Remove skills by Freelancer job/skill ID
node tools/freelancer/cli.js profile-skills remove 962 301

# Replace the entire profile skill list
node tools/freelancer/cli.js profile-skills set 7 31 500 1087
```

`add`, `remove`, and `set` change your Freelancer profile. Freelancer limits the
number of selected profile skills; if `add` would exceed the limit, remove less
relevant skills first or use `set` with the exact final list.

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

Options: `--amount N`, `--period <days>`, `--description "text"`, and
`--milestone-percentage N`.

`--milestone-percentage` sets only the bid's percentage field. Freelancer's
documented public bid API does not expose the description-and-amount rows from
the website's "Request milestone payments" proposal form. The separate
`request-milestone` command creates a pending payment request; it does not fill
or edit those proposal-form rows. Set proposal-form milestone rows on the
Freelancer website when they are required.

### Retract a bid

```bash
node tools/freelancer/cli.js retract-bid <bidId>
```

`withdraw-bid` is an alias for `retract-bid`. Retracting changes remote account
state and requires explicit confirmation of the bid ID before use. Freelancer
only allows retraction while the project is open for bidding. A retracted bid
does not restore the consumed bid allowance, and paid bid upgrades are not
refunded.

### Search contests

```bash
node tools/freelancer/cli.js contests "logo design" --limit 10
node tools/freelancer/cli.js contests --limit 20   # all active contests
```

### Services

```bash
# List your own Freelancer Services
node tools/freelancer/cli.js services [--limit 10] [--offset 0]

# List services for another user
node tools/freelancer/cli.js services --owner <userId> [--limit 10]

# Fetch specific service IDs
node tools/freelancer/cli.js services <serviceId> [serviceId ...] [--json]
```

Services are read-only in this CLI. Freelancer exposes a confirmed service read endpoint under `/api/projects/0.1/services/`, but the public SDK/docs checked here do not expose a safe creation payload for publishing Services.

### Portfolios

```bash
# List your own portfolio items
node tools/freelancer/cli.js portfolios [--limit 10] [--offset 0]

# List another user's portfolio items
node tools/freelancer/cli.js portfolios <userId> [--limit 10] [--offset 0]

# Print raw JSON
node tools/freelancer/cli.js portfolios [userId] --json
```

Portfolios are read-only in this CLI. The official SDK exposes portfolio retrieval through `/api/users/0.1/portfolios/`, but write probes against this API version returned `405` for create and `404` for update/delete paths. Create or edit portfolio items through the Freelancer website.

### Messages

```bash
node tools/freelancer/cli.js messages [--limit 10] [--project <projectId>]
node tools/freelancer/cli.js project-messages <projectId> [--limit 10] [--offset 0]
```

`project-messages` reads Freelancer's project-scoped messages API. The current official API and SDK do not expose a dedicated Project Public Clarification Board endpoint; use this command only for messages returned to your account by the messages API.

`messages` lists message threads. Without `--project`, it lists all available threads, including support or private chat threads returned by Freelancer's API.

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

`milestone-requests` reads pending or historical milestone payment requests. Freelancer's API is most reliable when filtering by bid ID; filtering only by project may be denied.

`request-milestone` asks the client to create/fund a milestone payment for your bid. This is a side-effecting account action and should only be run after confirming the project, bid ID, amount, and description.

## Notes

- Tokens stored in `tools/freelancer/.token.json` (mode 0600)
- Freelancer uses `Freelancer-OAuth-V1` header instead of `Bearer` — handled automatically
- `bid` submits a proposal and requires explicit user intent plus user OAuth, not client credentials
- `retract-bid` and `withdraw-bid` retract a proposal and require explicit user intent plus user OAuth
- `bid --milestone-percentage` sets only the bid percentage field and does not fill the website's proposal milestone schedule
- `request-milestone` creates a separate pending payment request; do not use it as a substitute for the website's proposal milestone schedule
- `request-milestone` submits a milestone payment request to the client and requires explicit user intent plus user OAuth
- `profile-skills add`, `profile-skills remove`, and `profile-skills set` update profile skills and require explicit user intent plus user OAuth
- `services`, `portfolios`, `messages`, `milestone-requests`, `bids`, and `milestones` require user OAuth for full access
- `notifications` is implemented, but Freelancer's notifications endpoint may return 404 depending on current API availability; use `messages` for supporter/client thread checks when notifications are unavailable
