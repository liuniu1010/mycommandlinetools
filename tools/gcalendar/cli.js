#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const TOOL_DIR = __dirname;
const ENV_FILE = path.join(ROOT, ".env");
const TOKEN_FILE = path.join(TOOL_DIR, ".token.json");
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_ENDPOINT = "https://www.googleapis.com/calendar/v3";
const DEFAULT_CALLBACK_URL = "http://localhost:3000/callback";
const DEFAULT_SCOPES = ["https://www.googleapis.com/auth/calendar"];

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function requireConfig() {
  loadEnv();
  const config = {
    clientId: process.env.GCALENDAR_CLIENT_ID,
    clientSecret: process.env.GCALENDAR_CLIENT_SECRET,
    callbackUrl: process.env.GCALENDAR_CALLBACK_URL || DEFAULT_CALLBACK_URL,
    scopes: (process.env.GCALENDAR_SCOPES || DEFAULT_SCOPES.join(" ")).split(/\s+/).filter(Boolean),
  };

  const missing = [];
  if (!config.clientId) missing.push("GCALENDAR_CLIENT_ID");
  if (!config.clientSecret) missing.push("GCALENDAR_CLIENT_SECRET");
  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")} in ${ENV_FILE}`);
  }
  return config;
}

function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("No saved token. Run: npm run gcalendar:auth");
  }
  return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
}

function writeToken(token, previous = {}, metadata = {}) {
  const expiresAt = Date.now() + Math.max(0, Number(token.expires_in || 0) - 60) * 1000;
  const payload = {
    account_email: metadata.account_email || previous.account_email,
    account_name: metadata.account_name || previous.account_name,
    access_token: token.access_token,
    refresh_token: token.refresh_token || previous.refresh_token,
    token_type: token.token_type || previous.token_type || "Bearer",
    scope: token.scope || previous.scope,
    expires_at: expiresAt,
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

async function getCalendarProfile(accessToken) {
  const res = await fetch(`${CALENDAR_ENDPOINT}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`Google Calendar profile request failed (${res.status}): ${JSON.stringify(body)}`);
  }
  const calendars = body.items || [];
  const primary = calendars.find((calendar) => calendar.primary === true) || calendars[0] || {};
  return {
    account_email: primary.id,
    account_name: primary.summary,
  };
}

async function requestToken(params) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function getAccessToken() {
  const config = requireConfig();
  const token = readToken();
  if (token.access_token && token.expires_at && token.expires_at > Date.now()) {
    return token.access_token;
  }
  if (!token.refresh_token) {
    throw new Error("Saved token has no refresh token. Run: npm run gcalendar:auth");
  }
  const refreshed = await requestToken({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: token.refresh_token,
  });
  const profile = await getCalendarProfile(refreshed.access_token);
  writeToken(refreshed, token, profile);
  return refreshed.access_token;
}

function openBrowser(url) {
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(opener, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

async function auth() {
  const config = requireConfig();
  const callback = new URL(config.callbackUrl);
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);

  const authorizeUrl = new URL(AUTH_ENDPOINT);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.callbackUrl);
  authorizeUrl.searchParams.set("scope", config.scopes.join(" "));
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("state", state);

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, config.callbackUrl);
      if (requestUrl.pathname !== callback.pathname) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      if (requestUrl.searchParams.get("state") !== state) {
        res.writeHead(400);
        res.end("OAuth state mismatch.");
        return;
      }
      const error = requestUrl.searchParams.get("error");
      if (error) {
        res.writeHead(400);
        res.end(`Google Calendar authorization failed: ${error}`);
        return;
      }
      const code = requestUrl.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("Missing authorization code.");
        return;
      }

      const token = await requestToken({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.callbackUrl,
      });
      const profile = await getCalendarProfile(token.access_token);
      writeToken(token, {}, profile);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Google Calendar CLI authorization complete. You can close this tab.");
      console.log(`Saved OAuth token to ${TOKEN_FILE}`);
      server.close();
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(err.message);
      console.error(err.message);
      server.close();
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(callback.port || 80), callback.hostname, resolve);
  });

  console.log("Open this URL in your browser and approve access:");
  console.log(authorizeUrl.toString());
  openBrowser(authorizeUrl.toString());
}

async function calendar(pathname, options = {}) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${CALENDAR_ENDPOINT}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`Google Calendar request failed (${res.status}): ${JSON.stringify(body, null, 2)}`);
  }
  return body;
}

async function calendars() {
  const data = await calendar("/users/me/calendarList");
  const items = data.items || [];
  console.log(`Found ${items.length} calendar(s).\n`);
  items.forEach((item) => {
    console.log(item.id);
    console.log(`  summary: ${item.summary || ""}`);
    console.log(`  accessRole: ${item.accessRole || ""}`);
    console.log(`  primary: ${item.primary === true ? "yes" : "no"}`);
    console.log("");
  });
}

function eventTime(value) {
  if (!value) {
    return {
      raw: "",
      utc: "",
      local: "",
    };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return {
      raw: value,
      utc: "all-day",
      local: value,
    };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      raw: value,
      utc: "",
      local: "",
    };
  }
  return {
    raw: value,
    utc: date.toISOString(),
    local: date.toString(),
  };
}

async function events(args) {
  const options = parseOptions(args);
  const calendarId = options.calendar || "primary";
  const params = new URLSearchParams({
    maxResults: String(Math.min(Math.max(Number(options.limit || 10), 1), 50)),
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: options.from || new Date().toISOString(),
  });
  if (options.to) params.set("timeMax", options.to);
  if (options.query || options.q) params.set("q", options.query || options.q);

  const data = await calendar(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
  const items = data.items || [];
  console.log(`Found ${items.length} event(s).\n`);
  items.forEach((item, index) => {
    const start = eventTime(item.start?.dateTime || item.start?.date || "");
    const end = eventTime(item.end?.dateTime || item.end?.date || "");
    console.log(`${index + 1}. ${item.summary || "(no title)"}`);
    console.log(`   id: ${item.id}`);
    console.log(`   start: ${start.raw}`);
    console.log(`   start_utc: ${start.utc}`);
    console.log(`   start_local: ${start.local}`);
    console.log(`   end: ${end.raw}`);
    console.log(`   end_utc: ${end.utc}`);
    console.log(`   end_local: ${end.local}`);
    if (item.location) console.log(`   location: ${item.location}`);
    if (item.htmlLink) console.log(`   url: ${item.htmlLink}`);
    console.log("");
  });
}

function eventPayload(options) {
  if (!options.summary) throw new Error("Missing --summary");
  if (!options.start) throw new Error("Missing --start");
  if (!options.end) throw new Error("Missing --end");
  const timezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return {
    summary: options.summary,
    ...(options.description ? { description: options.description } : {}),
    ...(options.location ? { location: options.location } : {}),
    start: datePayload(options.start, timezone),
    end: datePayload(options.end, timezone),
  };
}

function datePayload(value, timezone) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value };
  return { dateTime: value, timeZone: timezone };
}

async function addEvent(args) {
  const options = parseOptions(args);
  const calendarId = options.calendar || "primary";
  const data = await calendar(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(eventPayload(options)),
  });
  console.log(`Created event ${data.id}`);
  if (data.htmlLink) console.log(data.htmlLink);
}

async function updateEvent(args) {
  const eventId = args[0];
  if (!eventId) throw new Error("Usage: node tools/gcalendar/cli.js update-event <eventId> [options]");
  const options = parseOptions(args.slice(1));
  const calendarId = options.calendar || "primary";
  const timezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const payload = {};
  if (options.summary) payload.summary = options.summary;
  if (options.description) payload.description = options.description;
  if (options.location) payload.location = options.location;
  if (options.start) payload.start = datePayload(options.start, timezone);
  if (options.end) payload.end = datePayload(options.end, timezone);
  if (Object.keys(payload).length === 0) throw new Error("No update fields provided.");

  const data = await calendar(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  console.log(`Updated event ${data.id}`);
  if (data.htmlLink) console.log(data.htmlLink);
}

async function deleteEvent(args) {
  const eventId = args[0];
  if (!eventId) throw new Error("Usage: node tools/gcalendar/cli.js delete-event <eventId> [--calendar primary]");
  const options = parseOptions(args.slice(1));
  const calendarId = options.calendar || "primary";
  await calendar(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
  console.log(`Deleted event ${eventId}`);
}

function parseOptions(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function help() {
  console.log(`
Usage:
  npm run gcalendar:auth
  npm run gcalendar:calendars
  npm run gcalendar:events -- [--calendar primary] [--from 2026-05-05T00:00:00+12:00] [--to 2026-05-06T00:00:00+12:00] [--limit 10]
  node tools/gcalendar/cli.js add-event --summary "Title" --start 2026-05-05T10:00:00+12:00 --end 2026-05-05T10:30:00+12:00
  node tools/gcalendar/cli.js update-event <eventId> --summary "New title"
  node tools/gcalendar/cli.js delete-event <eventId>

Examples:
  npm run gcalendar:auth
  npm run gcalendar:calendars
  npm run gcalendar:events -- --calendar primary --limit 20
  node tools/gcalendar/cli.js add-event --summary "Test" --start 2026-05-05T10:00:00+12:00 --end 2026-05-05T10:30:00+12:00 --description "Created from CLI"
  node tools/gcalendar/cli.js delete-event abc123
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }
  if (command === "auth") return auth();
  if (command === "calendars") return calendars();
  if (command === "events") return events(args);
  if (command === "add-event") return addEvent(args);
  if (command === "update-event") return updateEvent(args);
  if (command === "delete-event") return deleteEvent(args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
