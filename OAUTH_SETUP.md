# OAuth Credential Setup

This guide explains where to create the client IDs and client secrets used by
the command-line tools in this repository.

Use the callback URL shown in each section unless you intentionally changed the
matching `*_CALLBACK_URL` value in `.env`.

Do not commit `.env` or any `tools/<tool>/.token.json` files.

## Shared local callback

Most OAuth tools in this repository use a local browser callback:

```text
http://localhost:3000/callback
```

The redirect URI registered in the provider console must match the value in
`.env`. If the provider reports a redirect URI mismatch, compare the registered
URI and `.env` value character by character, including protocol, port, path, and
trailing slash.

## Google: Gmail, Google Calendar, and Google Drive

Gmail, Google Calendar, and Google Drive can use the same Google Cloud project,
but they need the relevant APIs enabled and the scopes requested by each CLI.

Official references:

- https://developers.google.com/workspace/guides/create-credentials
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://support.google.com/googleapi/answer/6158849

Steps:

1. Open Google Cloud Console: https://console.cloud.google.com/
2. Create or select a project.
3. Go to "APIs & Services" > "Library".
4. Enable the APIs you need:
   - Gmail API for `tools/gmail`.
   - Google Calendar API for `tools/gcalendar`.
   - Google Drive API for `tools/gdrive`.
5. Go to "APIs & Services" > "OAuth consent screen".
6. Configure the consent screen. For personal use, "External" with test users is
   usually enough while the app is unpublished.
7. Add your Google account as a test user if the app remains in testing mode.
8. Go to "APIs & Services" > "Credentials".
9. Create credentials, choose "OAuth client ID", and choose "Web application".
10. Add this authorized redirect URI:

```text
http://localhost:3000/callback
```

11. Copy the client ID and client secret into `.env`.

For Gmail:

```bash
GMAIL_CLIENT_ID=your_google_oauth_client_id
GMAIL_CLIENT_SECRET=your_google_oauth_client_secret
GMAIL_CALLBACK_URL=http://localhost:3000/callback
GMAIL_SCOPES=https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send
```

For Google Calendar:

```bash
GCALENDAR_CLIENT_ID=your_google_oauth_client_id
GCALENDAR_CLIENT_SECRET=your_google_oauth_client_secret
GCALENDAR_CALLBACK_URL=http://localhost:3000/callback
GCALENDAR_SCOPES=https://www.googleapis.com/auth/calendar
```

For Google Drive:

```bash
GDRIVE_CLIENT_ID=your_google_oauth_client_id
GDRIVE_CLIENT_SECRET=your_google_oauth_client_secret
GDRIVE_CALLBACK_URL=http://localhost:3000/callback
GDRIVE_SCOPES=https://www.googleapis.com/auth/drive
```

Then authenticate:

```bash
node tools/gmail/cli.js auth
node tools/gcalendar/cli.js auth
node tools/gdrive/cli.js auth
```

Notes:

- If Google says the app is unverified, keep it in testing mode and use a test
  user account for personal automation.
- Gmail scopes can trigger stricter review if you publish the app for general
  external users. For personal use, do not publish unless you need to.

## Microsoft: Outlook Mail

Outlook uses a Microsoft Entra app registration and Microsoft Graph delegated
permissions.

Official references:

- https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app
- https://learn.microsoft.com/en-us/entra/identity-platform/reply-url
- https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview

Steps:

1. Open Microsoft Entra admin center: https://entra.microsoft.com/
2. Go to "Identity" > "Applications" > "App registrations".
3. Create a new registration.
4. Choose the supported account type that matches your mailbox use. For personal
   Microsoft accounts, include personal Microsoft accounts.
5. Add a "Web" redirect URI:

```text
http://localhost:3000/callback
```

6. After registration, copy the "Application (client) ID" into `.env`.
7. Go to "Certificates & secrets" > "Client secrets".
8. Create a new client secret and copy the secret value immediately.
9. Go to "API permissions" > "Add a permission" > "Microsoft Graph" >
   "Delegated permissions".
10. Add the permissions used by this CLI:

```text
offline_access
User.Read
Mail.ReadWrite
Mail.Send
```

11. If your tenant requires admin consent, grant consent or ask an admin to do
    so.
12. Add the credentials to `.env`:

```bash
OUTLOOK_CLIENT_ID=your_microsoft_oauth_client_id
OUTLOOK_CLIENT_SECRET=your_microsoft_oauth_client_secret
OUTLOOK_CALLBACK_URL=http://localhost:3000/callback
OUTLOOK_SCOPES=offline_access User.Read Mail.ReadWrite Mail.Send
```

Then authenticate:

```bash
node tools/outlook/cli.js auth
```

## Microsoft: OneDrive

OneDrive uses a Microsoft Entra app registration and Microsoft Graph delegated
permissions. The same tool can support personal Microsoft accounts and work or
school OneDrive accounts when the app registration's supported account type
allows them.

Official references:

- https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app
- https://learn.microsoft.com/en-us/entra/identity-platform/reply-url
- https://learn.microsoft.com/en-us/graph/api/resources/driveitem

Steps:

1. Open Microsoft Entra admin center: https://entra.microsoft.com/
2. Go to "Identity" > "Applications" > "App registrations".
3. Create a new registration.
4. Choose the supported account type that matches your OneDrive use. To support
   both personal and business accounts, include personal Microsoft accounts.
5. Add a "Web" redirect URI:

```text
http://localhost:3000/callback
```

6. After registration, copy the "Application (client) ID" into `.env`.
7. Go to "Certificates & secrets" > "Client secrets".
8. Create a new client secret and copy the secret value immediately.
9. Go to "API permissions" > "Add a permission" > "Microsoft Graph" >
   "Delegated permissions".
10. Add the permissions used by this CLI:

```text
offline_access
User.Read
Files.ReadWrite.All
```

11. If your tenant requires admin consent, grant consent or ask an admin to do
    so.
12. Add the credentials to `.env`:

```bash
ONEDRIVE_CLIENT_ID=your_microsoft_oauth_client_id
ONEDRIVE_CLIENT_SECRET=your_microsoft_oauth_client_secret
ONEDRIVE_CALLBACK_URL=http://localhost:3000/callback
ONEDRIVE_SCOPES=offline_access User.Read Files.ReadWrite.All
```

Then authenticate:

```bash
node tools/onedrive/cli.js auth
```

## Upwork

Upwork requires an OAuth 2.0 API key for each application. Upwork may require
approval before the key works.

Official references:

- https://support.upwork.com/hc/en-us/articles/115015933448-API-authentication-and-security
- https://www.upwork.com/developer/documentation/graphql/api/docs/index.html
- https://www.upwork.com/developer/keys/apply

Steps:

1. Sign in to Upwork.
2. Open the API key application page: https://www.upwork.com/developer/keys/apply
3. Apply for a new application key.
4. Choose OAuth 2.0 as the key type if the form asks for a key type.
5. Use this callback URL when the form asks for a callback or redirect URL:

```text
http://localhost:3000/callback
```

6. Wait for Upwork to enable or approve the key if required.
7. Copy the client ID and client secret into `.env`:

```bash
UPWORK_CLIENT_ID=your_client_id
UPWORK_CLIENT_SECRET=your_client_secret
UPWORK_CALLBACK_URL=http://localhost:3000/callback
```

Then authenticate:

```bash
node tools/upwork/cli.js auth
```

## Freelancer.com

Freelancer uses an API application with OAuth credentials. The exact developer
portal flow can change, so treat the Freelancer dashboard as the source of truth
for the current form labels.

Official references:

- https://developers.freelancer.com/
- https://www.freelancer.com/about/apiterms

Steps:

1. Sign in to Freelancer.com.
2. Open the Freelancer developer/API portal: https://developers.freelancer.com/
3. Create or manage an API application.
4. Configure the OAuth redirect URL to match this repository:

```text
http://localhost:3000/callback
```

5. Choose the minimum scopes needed. This CLI supports project search/detail,
   profile and user reads, profile skill management, portfolio and service
   reads, reviews, bid reads/submission/retraction, contests, messages,
   notifications, and milestones. `basic fln:user:email` is the default
   repository example so account metadata can be saved when the API permits it.
   Bid submission and account-specific reads may require additional Freelancer
   scopes or advanced scopes in your app.
6. Copy the client ID and client secret into `.env`:

```bash
FREELANCER_CLIENT_ID=your_client_id
FREELANCER_CLIENT_SECRET=your_client_secret
FREELANCER_CALLBACK_URL=http://localhost:3000/callback
FREELANCER_SCOPE=basic fln:user:email
FREELANCER_ADVANCED_SCOPES=
FREELANCER_BASE_URL=https://www.freelancer.com
```

Then authenticate:

```bash
node tools/freelancer/cli.js auth
```

If your Freelancer app is configured for owner-only desktop access, client
credentials may be available:

```bash
node tools/freelancer/cli.js auth --client-credentials
```

## Notion

Notion uses a public connection for OAuth. Users select the pages or databases
the connection can access during authorization.

Official references:

- https://developers.notion.com/guides/get-started/public-connections
- https://developers.notion.com/guides/get-started/authorization

Steps:

1. Open the Notion developer dashboard: https://www.notion.so/profile/integrations
2. Go to the public connections area.
3. Create a new public connection.
4. Add this redirect URI to the OAuth configuration:

```text
http://localhost:3000/callback
```

5. Choose the required connection capabilities, such as reading content,
   updating content, inserting content, comments, or user info, depending on the
   commands you plan to use.
6. After creation, open the connection configuration and copy the OAuth client ID
   and OAuth client secret.
7. Add them to `.env`:

```bash
NOTION_CLIENT_ID=your_notion_oauth_client_id
NOTION_CLIENT_SECRET=your_notion_oauth_client_secret
NOTION_CALLBACK_URL=http://localhost:3000/callback
NOTION_VERSION=2022-06-28
```

Then authenticate and select the pages or databases this connection can access:

```bash
node tools/notion/cli.js auth
```

## LinkedIn

LinkedIn uses OAuth 2.0, but the scopes available to an application depend on
the products and partner programs approved in the LinkedIn Developer Portal.
The self-service **Sign in with LinkedIn using OpenID Connect** product grants
the `openid`, `profile`, and `email` scopes used by this CLI's read-only
`profile` command. The self-service **Share on LinkedIn** product grants
`w_member_social`, which the CLI uses to publish member posts. These scopes do
not provide job search, application submission, or messaging APIs.

Steps:

1. Open https://www.linkedin.com/developers/apps and create an application.
2. Under **Products**, request **Sign in with LinkedIn using OpenID Connect**.
3. Under **Products**, request **Share on LinkedIn** for publishing support.
4. Under **Auth**, copy the Client ID and Client Secret.
5. Add this exact redirect URL under the application's OAuth 2.0 settings:

```text
http://localhost:3000/callback
```

6. Add the credentials and the same redirect URL to `.env`:

```bash
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_CALLBACK_URL=http://localhost:3000/callback
LINKEDIN_SCOPES=openid profile email w_member_social
LINKEDIN_API_VERSION=202607
```

Authenticate:

```bash
node tools/linkedin/cli.js auth
```

The CLI starts a local callback server, opens LinkedIn in the browser, verifies
the OAuth `state`, exchanges the authorization code, and saves the token to
`tools/linkedin/.token.json` with mode `0600`.

Verify the authenticated profile:

```bash
node tools/linkedin/cli.js profile
```

Check the account, granted scopes, and token expiry without exposing tokens:

```bash
node tools/linkedin/cli.js auth-status
```

Publish member posts:

```bash
node tools/linkedin/cli.js post-text --text "Sharing a project update"
node tools/linkedin/cli.js post-link --text "Worth reading" --url "https://example.com" --title "Example article"
node tools/linkedin/cli.js post-image --text "Project screenshot" --file screenshot.png --alt "Project dashboard"
```

Each publishing command requires typed confirmation before the remote write.
The API version is configurable because LinkedIn sunsets versioned Marketing
APIs; update `LINKEDIN_API_VERSION` to a currently supported `YYYYMM` release.

LinkedIn does not issue programmatic refresh tokens to ordinary applications.
If a token expires and no refresh token was granted, run `auth` again.

LinkedIn job-search APIs are not generally available for personal automation.
The CLI continues to build LinkedIn Jobs search URLs and can open those URLs in
a browser, but it must not scrape LinkedIn, automate a logged-in account, submit
applications, or call restricted Talent APIs.

Official references:

- https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api
