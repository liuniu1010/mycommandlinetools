# Google Drive CLI

Personal CLI for Google Drive OAuth, file search, metadata reads, downloads, exports, and browser opening.

## Setup

Create or update `.env` in the repository root:

```bash
GDRIVE_CLIENT_ID=your_google_oauth_client_id
GDRIVE_CLIENT_SECRET=your_google_oauth_client_secret
GDRIVE_CALLBACK_URL=http://localhost:3000/callback
GDRIVE_SCOPES=https://www.googleapis.com/auth/drive
```

Create the OAuth client in Google Cloud Console as a web application, enable the Google Drive API, and add the callback URL above as an authorized redirect URI.
For step-by-step credential setup, see [../../OAUTH_SETUP.md#google-gmail-google-calendar-and-google-drive](../../OAUTH_SETUP.md#google-gmail-google-calendar-and-google-drive).

## Usage

```bash
node tools/gdrive/cli.js auth
node tools/gdrive/cli.js files --query "proposal" --limit 20
node tools/gdrive/cli.js files --text "resident visa" --limit 20
node tools/gdrive/cli.js files --folder <folderId> --limit 20
node tools/gdrive/cli.js files --folder <folderId> --orderBy modifiedTime
node tools/gdrive/cli.js get <fileId>
node tools/gdrive/cli.js download <fileId> --out downloads/gdrive
node tools/gdrive/cli.js download <googleDocId> --mime application/pdf
node tools/gdrive/cli.js open <fileId>
node tools/gdrive/cli.js mkdir --name "Receipts"
node tools/gdrive/cli.js upload ./report.pdf --parent <folderId>
node tools/gdrive/cli.js upload ./report.csv --convert application/vnd.google-apps.spreadsheet
node tools/gdrive/cli.js update-content <fileId> ./report-v2.pdf
node tools/gdrive/cli.js update <fileId> --description "Updated" --starred true
node tools/gdrive/cli.js rename <fileId> --name "New name.pdf"
node tools/gdrive/cli.js move <fileId> --to <folderId>
node tools/gdrive/cli.js copy <fileId> --name "Copy of report.pdf"
node tools/gdrive/cli.js trash <fileId>
node tools/gdrive/cli.js untrash <fileId>
node tools/gdrive/cli.js delete <fileId> --yes
```

OAuth tokens are stored locally in `tools/gdrive/.token.json`. The token file also includes account metadata from Google Drive when available.

The default scope is full Drive access so write commands can work. If you previously authorized with `drive.readonly`, update `GDRIVE_SCOPES`, remove `tools/gdrive/.token.json`, and run `node tools/gdrive/cli.js auth` again.

Use `--query` to search file names and `--text` to search indexed file contents. Blob files are downloaded with Drive `files.get` and `alt=media`; Google Docs, Sheets, Slides, and Drawings are exported with Drive `files.export`. When downloading a Drive shortcut, the CLI resolves the shortcut target and downloads or exports the original target file.

Aliases: `list` and `search` are the same as `files`, `read` is the same as
`get`, `create-folder` is the same as `mkdir`, `replace` is the same as
`update-content`, and `rename` is the same as `update`. `--q` is an alias for
`--query`. File listing also supports `--orderBy` and `--include-trashed`.

Write commands support creating folders, uploading files, replacing file content, updating metadata, moving files, copying files, trashing/untrashing files, and permanent delete. Permanent delete requires `--yes`.
