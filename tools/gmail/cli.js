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
const GMAIL_ENDPOINT = "https://gmail.googleapis.com/gmail/v1";
const DEFAULT_CALLBACK_URL = "http://localhost:3001/callback";
const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

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
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    callbackUrl: process.env.GMAIL_CALLBACK_URL || DEFAULT_CALLBACK_URL,
    scopes: (process.env.GMAIL_SCOPES || DEFAULT_SCOPES.join(" ")).split(/\s+/).filter(Boolean),
  };

  const missing = [];
  if (!config.clientId) missing.push("GMAIL_CLIENT_ID");
  if (!config.clientSecret) missing.push("GMAIL_CLIENT_SECRET");
  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")} in ${ENV_FILE}`);
  }
  return config;
}

function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("No saved token. Run: npm run gmail:auth");
  }
  return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
}

function writeToken(token, previous = {}) {
  const expiresAt = Date.now() + Math.max(0, Number(token.expires_in || 0) - 60) * 1000;
  const payload = {
    access_token: token.access_token,
    refresh_token: token.refresh_token || previous.refresh_token,
    token_type: token.token_type || previous.token_type || "Bearer",
    scope: token.scope || previous.scope,
    expires_at: expiresAt,
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
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
    throw new Error("Saved token has no refresh token. Run: npm run gmail:auth");
  }
  const refreshed = await requestToken({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: token.refresh_token,
  });
  writeToken(refreshed, token);
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
        res.end(`Gmail authorization failed: ${error}`);
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
      writeToken(token);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Gmail CLI authorization complete. You can close this tab.");
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

async function gmail(pathname, options = {}) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${GMAIL_ENDPOINT}${pathname}`, {
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
    throw new Error(`Gmail request failed (${res.status}): ${JSON.stringify(body, null, 2)}`);
  }
  return body;
}

async function list(args) {
  const options = parseOptions(args);
  const params = new URLSearchParams({
    maxResults: String(Math.min(Math.max(Number(options.limit || 10), 1), 50)),
  });
  if (options.query || options.q) params.set("q", options.query || options.q);
  if (options.label) params.set("labelIds", options.label);

  const data = await gmail(`/users/me/messages?${params.toString()}`);
  const messages = data.messages || [];
  console.log(`Found ${data.resultSizeEstimate ?? messages.length} estimated result(s). Showing ${messages.length}.\n`);
  for (const message of messages) {
    const detail = await gmail(`/users/me/messages/${message.id}?format=metadata`);
    const headers = Object.fromEntries((detail.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
    console.log(`${message.id}`);
    console.log(`  from: ${headers.from || ""}`);
    console.log(`  subject: ${headers.subject || ""}`);
    console.log(`  date: ${headers.date || ""}`);
    console.log(`  snippet: ${detail.snippet || ""}`);
    console.log("");
  }
}

async function labels() {
  const data = await gmail("/users/me/labels");
  const items = data.labels || [];
  console.log(`Found ${items.length} label(s).\n`);
  items
    .sort((left, right) => {
      const leftType = left.type || "";
      const rightType = right.type || "";
      if (leftType !== rightType) return leftType.localeCompare(rightType);
      return (left.name || "").localeCompare(right.name || "");
    })
    .forEach((label) => {
      console.log(`${label.id}`);
      console.log(`  name: ${label.name || ""}`);
      console.log(`  type: ${label.type || ""}`);
      console.log("");
    });
}

function collectAttachments(part, attachments = []) {
  if (!part) return attachments;
  const filename = part.filename || "";
  const attachmentId = part.body?.attachmentId;
  if (filename && attachmentId) {
    attachments.push({
      partId: part.partId || "",
      filename,
      mimeType: part.mimeType || "",
      size: part.body?.size || 0,
      attachmentId,
    });
  }
  for (const child of part.parts || []) collectAttachments(child, attachments);
  return attachments;
}

async function getMessageAttachments(messageId) {
  const message = await gmail(`/users/me/messages/${encodeURIComponent(messageId)}?format=full`);
  return collectAttachments(message.payload);
}

function safeFilename(filename) {
  const cleaned = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return cleaned || "attachment";
}

function uniquePath(directory, filename) {
  const parsed = path.parse(filename);
  let candidate = path.join(directory, filename);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

function decodeBase64Url(data) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function valuesForOption(options, key) {
  const value = options[key];
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function mimeTypeForFile(file) {
  const ext = path.extname(file).toLowerCase();
  const types = {
    ".csv": "text/csv",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".gif": "image/gif",
    ".htm": "text/html",
    ".html": "text/html",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".txt": "text/plain",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
  };
  return types[ext] || "application/octet-stream";
}

function encodeHeader(value) {
  return String(value || "").replace(/\r?\n/g, " ").trim();
}

function buildMessage({ to, subject, body, attachments: files }) {
  if (files.length === 0) {
    return [
      `To: ${encodeHeader(to)}`,
      `Subject: ${encodeHeader(subject)}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(body, "utf8").toString("base64"),
    ].join("\r\n");
  }

  const boundary = `gmail-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const lines = [
    `To: ${encodeHeader(to)}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf8").toString("base64"),
  ];

  for (const file of files) {
    const fullPath = path.resolve(ROOT, file);
    if (!fs.existsSync(fullPath)) throw new Error(`Attachment not found: ${file}`);
    if (!fs.statSync(fullPath).isFile()) throw new Error(`Attachment is not a file: ${file}`);

    const filename = path.basename(fullPath);
    lines.push(
      `--${boundary}`,
      `Content-Type: ${mimeTypeForFile(fullPath)}; name="${encodeHeader(filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${encodeHeader(filename)}"`,
      "",
      fs.readFileSync(fullPath).toString("base64")
    );
  }

  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

async function attachments(args) {
  const messageId = args[0];
  if (!messageId) throw new Error("Usage: node tools/gmail/cli.js attachments <messageId>");

  const items = await getMessageAttachments(messageId);
  console.log(`Found ${items.length} attachment(s).\n`);
  items.forEach((item, index) => {
    console.log(`${index + 1}. ${item.filename}`);
    console.log(`   mime: ${item.mimeType}`);
    console.log(`   size: ${item.size} bytes`);
    console.log(`   attachmentId: ${item.attachmentId}`);
    console.log(`   partId: ${item.partId}`);
    console.log("");
  });
}

async function downloadAttachments(args) {
  const messageId = args[0];
  if (!messageId) {
    throw new Error("Usage: node tools/gmail/cli.js download-attachments <messageId> [--out downloads/gmail]");
  }

  const options = parseOptions(args.slice(1));
  const outputDir = path.resolve(ROOT, options.out || "downloads/gmail", messageId);
  fs.mkdirSync(outputDir, { recursive: true });

  const items = await getMessageAttachments(messageId);
  console.log(`Found ${items.length} attachment(s).`);
  if (items.length === 0) return;

  for (const item of items) {
    const data = await gmail(
      `/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(item.attachmentId)}`
    );
    const filename = safeFilename(item.filename);
    const target = uniquePath(outputDir, filename);
    fs.writeFileSync(target, decodeBase64Url(data.data || ""));
    console.log(`Saved ${path.relative(ROOT, target)}`);
  }
}

async function read(args) {
  const id = args[0];
  if (!id) throw new Error("Usage: node tools/gmail/cli.js read <messageId>");
  const data = await gmail(`/users/me/messages/${encodeURIComponent(id)}?format=full`);
  console.log(JSON.stringify(data, null, 2));
}

async function send(args) {
  const options = parseOptions(args);
  if (!options.to || !options.subject || !options.body) {
    throw new Error(
      'Usage: node tools/gmail/cli.js send --to you@example.com --subject "Subject" --body "Message" [--attach file]'
    );
  }

  const raw = buildMessage({
    to: options.to,
    subject: options.subject,
    body: options.body,
    attachments: valuesForOption(options, "attach"),
  });
  const encoded = Buffer.from(raw).toString("base64url");
  const data = await gmail("/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: encoded }),
  });
  console.log(`Sent message ${data.id}`);
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
      if (parsed[key] == null) {
        parsed[key] = next;
      } else if (Array.isArray(parsed[key])) {
        parsed[key].push(next);
      } else {
        parsed[key] = [parsed[key], next];
      }
      i += 1;
    }
  }
  return parsed;
}

function help() {
  console.log(`
Usage:
  npm run gmail:auth
  npm run gmail:labels
  npm run gmail:list -- [--query "from:client@example.com"] [--limit 10] [--label INBOX]
  node tools/gmail/cli.js read <messageId>
  node tools/gmail/cli.js attachments <messageId>
  node tools/gmail/cli.js download-attachments <messageId> [--out downloads/gmail]
  node tools/gmail/cli.js send --to you@example.com --subject "Subject" --body "Message" [--attach file]

Examples:
  npm run gmail:auth
  npm run gmail:labels
  npm run gmail:list -- --query "is:unread newer_than:7d" --limit 10
  node tools/gmail/cli.js attachments 18c123abc
  node tools/gmail/cli.js download-attachments 18c123abc --out downloads/gmail
  node tools/gmail/cli.js send --to you@example.com --subject "Hello" --body "Test message"
  node tools/gmail/cli.js send --to you@example.com --subject "Files" --body "Attached." --attach /tmp/file.pdf
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }
  if (command === "auth") return auth();
  if (command === "labels") return labels();
  if (command === "list") return list(args);
  if (command === "read") return read(args);
  if (command === "attachments") return attachments(args);
  if (command === "download-attachments") return downloadAttachments(args);
  if (command === "send") return send(args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
