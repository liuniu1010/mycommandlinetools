# LinkedIn CLI

Personal CLI for building LinkedIn Jobs search URLs and opening them in your browser.

## Scope

LinkedIn job-search APIs are not generally available for personal automation. Official Talent Solutions job APIs are restricted to approved partners and focus on job posting/ATS workflows, not personal job search. This tool therefore does not scrape LinkedIn, automate a logged-in browser, or collect job results.

This tool does not need OAuth credentials. For details, see [../../OAUTH_SETUP.md#linkedin](../../OAUTH_SETUP.md#linkedin).

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
