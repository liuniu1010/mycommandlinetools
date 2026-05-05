# Google Calendar CLI

Personal CLI for Google Calendar OAuth, calendar listing, event reads, and event updates.

## Setup

Create or update `.env` in the repository root:

```bash
GCALENDAR_CLIENT_ID=your_google_oauth_client_id
GCALENDAR_CLIENT_SECRET=your_google_oauth_client_secret
GCALENDAR_CALLBACK_URL=http://localhost:3001/callback
```

Create the OAuth client in Google Cloud Console as a web application, enable the Google Calendar API, and add the callback URL above as an authorized redirect URI.

## Usage

```bash
npm run gcalendar:auth
npm run gcalendar:calendars
npm run gcalendar:events -- --calendar primary --limit 10
node tools/gcalendar/cli.js add-event --summary "Test" --start 2026-05-05T10:00:00+12:00 --end 2026-05-05T10:30:00+12:00
node tools/gcalendar/cli.js update-event <eventId> --summary "Updated title"
node tools/gcalendar/cli.js delete-event <eventId>
```

OAuth tokens are stored locally in `tools/gcalendar/.token.json`.
