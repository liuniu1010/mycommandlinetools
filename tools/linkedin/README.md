# LinkedIn CLI

Personal CLI for LinkedIn OAuth profile reads, confirmed member post publishing, and building LinkedIn Jobs search URLs.

## Scope

LinkedIn job-search APIs are not generally available for personal automation. Official Talent Solutions job APIs are restricted to approved partners and focus on job posting/ATS workflows, not personal job search. This tool therefore does not scrape LinkedIn, automate a logged-in browser, collect job results, or submit job applications.

OAuth uses LinkedIn's authorization-code flow for scopes granted to your developer application. OpenID scopes support the read-only profile command, while `w_member_social` supports publishing posts as the authenticated member. These scopes do not unlock restricted Talent APIs. For setup, see [../../OAUTH_SETUP.md#linkedin](../../OAUTH_SETUP.md#linkedin).

## Setup

Create a LinkedIn developer application, enable **Sign in with LinkedIn using OpenID Connect** and **Share on LinkedIn**, and add its exact redirect URL to `.env`:

```bash
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_CALLBACK_URL=http://localhost:3000/callback
LINKEDIN_SCOPES=openid profile email w_member_social
LINKEDIN_API_VERSION=202607
```

Register the exact callback URL in the LinkedIn Developer Portal. The CLI starts a local callback server, opens the authorization URL, validates OAuth `state`, exchanges the authorization code, and closes the server after saving the token.

Authorize and read the authenticated profile:

```bash
node tools/linkedin/cli.js auth
node tools/linkedin/cli.js auth-status
node tools/linkedin/cli.js profile
```

The token is stored in `tools/linkedin/.token.json` with mode `0600`. Standard LinkedIn applications may not receive refresh tokens; if the access token expires, run `auth` again.

If you add `w_member_social` after authenticating, run `auth` again so the saved token receives the new scope. `LINKEDIN_API_VERSION` selects the current supported LinkedIn Posts and Images API version and should be updated before that version is sunset.

## Publishing

Publish text, a link, or an image as the authenticated member:

```bash
node tools/linkedin/cli.js post-text --text "Sharing a project update"
node tools/linkedin/cli.js post-link --text "Worth reading" --url "https://example.com" --title "Example article" --description "Optional summary"
node tools/linkedin/cli.js post-image --text "Project screenshot" --file screenshot.png --alt "Project dashboard"
```

`post-link` uses the URL as its title when `--title` is omitted. `post-image` accepts JPG, JPEG, PNG, and GIF files. Each publishing command previews the account and complete payload, then requires you to type `publish` before it makes any publishing or upload request.

## Usage

Print a LinkedIn Jobs search URL:

```bash
node tools/linkedin/cli.js search "java spring boot"
```

Open the search in your browser:

```bash
node tools/linkedin/cli.js search "java spring boot" --location "Auckland, New Zealand" --open
```

Use filters:

```bash
node tools/linkedin/cli.js search "ai agent" --date week --workplace remote,hybrid
node tools/linkedin/cli.js search "backend engineer" --type full-time --experience senior
```

Open the LinkedIn developer apps page:

```bash
node tools/linkedin/cli.js developer
```

## Supported Filters

- `--location "Auckland, New Zealand"`
- `--date day|week|month`
- `--workplace remote|hybrid|onsite` (`--remote` is an alias for `--workplace`)
- `--type full-time|part-time|contract|temporary|internship|volunteer|other`
- `--experience entry|associate|mid|senior|director|executive`
- `--start 25` for LinkedIn result pagination offset
- `--open` or `--o` to launch the browser
