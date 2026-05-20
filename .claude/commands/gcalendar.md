You are operating Google Calendar via the CLI at `tools/gcalendar/cli.js`. Run all commands from the repository root.

## Auth
```
node tools/gcalendar/cli.js auth
```
Opens a browser OAuth flow. Token saved to `tools/gcalendar/.token.json`. Run if any command returns an auth error.

## Listing calendars & events
```
# List all calendars the user has access to
node tools/gcalendar/cli.js calendars

# List upcoming events (default: primary calendar, 10 events, from now)
node tools/gcalendar/cli.js events
node tools/gcalendar/cli.js events --limit 20
node tools/gcalendar/cli.js events --calendar CALENDAR_ID
node tools/gcalendar/cli.js events --from 2025-06-01T00:00:00 --to 2025-06-30T23:59:59
node tools/gcalendar/cli.js events --query "standup"
```
Calendar IDs come from the `id` field in `calendars` output. Use `primary` for the main calendar.
Event output includes start/end times in both UTC (ISO) and local (`toString()`). All-day events show `"all-day"` in the UTC field.

## Creating events
```
node tools/gcalendar/cli.js add-event \
  --summary "Team meeting" \
  --start 2025-06-15T14:00:00 \
  --end 2025-06-15T15:00:00 \
  [--calendar CALENDAR_ID] \
  [--description "Agenda..."] \
  [--location "Zoom link or address"] \
  [--timezone Pacific/Auckland]
```
- `--start` and `--end` are required, ISO 8601 format
- For all-day events use `YYYY-MM-DD` (no time component)
- Timezone defaults to system timezone if omitted

## Updating events
```
node tools/gcalendar/cli.js update-event <eventId> \
  [--summary "New title"] \
  [--start DATETIME] \
  [--end DATETIME] \
  [--description TEXT] \
  [--location TEXT] \
  [--timezone TEXT] \
  [--calendar CALENDAR_ID]
```
Only include flags for fields you want to change.

## Deleting events
```
node tools/gcalendar/cli.js delete-event <eventId> [--calendar CALENDAR_ID]
```
Confirm with the user before deleting — deletions are irreversible.

## Notes
- Event IDs come from the `id` field in `events` output
- Always confirm the event details (time, title, calendar) with the user before creating or deleting
- When adding an event, if the user hasn't specified timezone, use their local system timezone
