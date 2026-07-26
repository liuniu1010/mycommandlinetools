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
const AUTH_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0";
const DEFAULT_CALLBACK_URL = "http://localhost:3000/callback";
const DEFAULT_SCOPES = ["offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send"];

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
    clientId: process.env.OUTLOOK_CLIENT_ID,
    clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
    callbackUrl: process.env.OUTLOOK_CALLBACK_URL || DEFAULT_CALLBACK_URL,
    scopes: (process.env.OUTLOOK_SCOPES || DEFAULT_SCOPES.join(" ")).split(/\s+/).filter(Boolean),
  };

  const missing = [];
  if (!config.clientId) missing.push("OUTLOOK_CLIENT_ID");
  if (!config.clientSecret) missing.push("OUTLOOK_CLIENT_SECRET");
  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")} in ${ENV_FILE}`);
  }
  return config;
}

function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("No saved token. Run: node tools/outlook/cli.js auth");
  }
  return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
}

function writeToken(token, previous = {}, metadata = {}) {
  const expiresAt = Date.now() + Math.max(0, Number(token.expires_in || 0) - 60) * 1000;
  const payload = {
    account_email: metadata.account_email || previous.account_email,
    account_name: metadata.account_name || previous.account_name,
    account_id: metadata.account_id || previous.account_id,
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

async function getOutlookProfile(accessToken) {
  const res = await fetch(`${GRAPH_ENDPOINT}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`Outlook profile request failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return {
    account_email: body.mail || body.userPrincipalName,
    account_name: body.displayName,
    account_id: body.id,
  };
}

async function getAccessToken() {
  const config = requireConfig();
  const token = readToken();
  if (token.access_token && token.expires_at && token.expires_at > Date.now()) {
    return token.access_token;
  }
  if (!token.refresh_token) {
    throw new Error("Saved token has no refresh token. Run: node tools/outlook/cli.js auth");
  }
  const refreshed = await requestToken({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: token.refresh_token,
    scope: config.scopes.join(" "),
  });
  const profile = await getOutlookProfile(refreshed.access_token);
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
  authorizeUrl.searchParams.set("response_mode", "query");
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
        res.end(`Outlook authorization failed: ${error}`);
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
        scope: config.scopes.join(" "),
      });
      const profile = await getOutlookProfile(token.access_token);
      writeToken(token, {}, profile);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Outlook CLI authorization complete. You can close this tab.");
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

async function graph(pathname, options = {}) {
  const accessToken = await getAccessToken();
  const url = pathname.startsWith("https://") ? pathname : `${GRAPH_ENDPOINT}${pathname}`;
  const res = await fetch(url, {
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
    throw new Error(`Outlook request failed (${res.status}): ${JSON.stringify(body, null, 2)}`);
  }
  return body;
}

function messageTimes(message) {
  const date = new Date(message.receivedDateTime || message.sentDateTime || "");
  if (Number.isNaN(date.getTime())) {
    return {
      utc: "",
      local: "",
    };
  }
  return {
    utc: date.toISOString(),
    local: date.toString(),
  };
}

function folderDisplayName(folder) {
  return folder.displayName || folder.id || "";
}

async function collectFolders(pathname = "/me/mailFolders?$top=100&includeHiddenFolders=true", folders = []) {
  const data = await graph(pathname);
  for (const folder of data.value || []) {
    folders.push(folder);
    if (folder.childFolderCount > 0) {
      await collectFolders(`/me/mailFolders/${encodeURIComponent(folder.id)}/childFolders?$top=100`, folders);
    }
  }
  if (data["@odata.nextLink"]) {
    await collectFolders(data["@odata.nextLink"], folders);
  }
  return folders;
}

async function getFolders() {
  return collectFolders();
}

function findFolder(folders, value) {
  const needle = String(value || "").trim();
  const lower = needle.toLowerCase();
  if (!needle) return null;
  return (
    folders.find((folder) => folder.id === needle) ||
    folders.find((folder) => folder.displayName === needle) ||
    folders.find((folder) => (folder.displayName || "").toLowerCase() === lower) ||
    null
  );
}

async function createFolder(name) {
  return graph("/me/mailFolders", {
    method: "POST",
    body: JSON.stringify({ displayName: name }),
  });
}

async function resolveFolderId(value, { createMissing = false } = {}) {
  const folders = await getFolders();
  const existing = findFolder(folders, value);
  if (existing) return existing.id;
  if (!createMissing) {
    throw new Error(`Folder not found: ${value}`);
  }
  const created = await createFolder(value);
  return created.id;
}

async function labels() {
  const folders = await getFolders();
  console.log(`Found ${folders.length} folder(s).\n`);
  folders
    .sort((left, right) => folderDisplayName(left).localeCompare(folderDisplayName(right)))
    .forEach((folder) => {
      console.log(`${folder.id}`);
      console.log(`  name: ${folder.displayName || ""}`);
      console.log(`  childFolderCount: ${folder.childFolderCount ?? 0}`);
      console.log(`  totalItemCount: ${folder.totalItemCount ?? ""}`);
      console.log(`  unreadItemCount: ${folder.unreadItemCount ?? ""}`);
      console.log("");
    });
}

function appendSelect(params) {
  params.set("$select", "id,subject,from,receivedDateTime,sentDateTime,bodyPreview,hasAttachments,parentFolderId");
}

async function list(args) {
  const options = parseOptions(args);
  const limit = String(Math.min(Math.max(Number(options.limit || 10), 1), 50));
  const params = new URLSearchParams();
  params.set("$top", limit);
  params.set("$orderby", "receivedDateTime desc");
  appendSelect(params);
  if (options.query || options.q) params.set("$search", `"${String(options.query || options.q).replace(/"/g, '\\"')}"`);

  let pathname = `/me/messages?${params.toString()}`;
  if (options.label) {
    const folderId = await resolveFolderId(options.label);
    pathname = `/me/mailFolders/${encodeURIComponent(folderId)}/messages?${params.toString()}`;
  }

  const data = await graph(pathname, options.query || options.q ? { headers: { ConsistencyLevel: "eventual" } } : {});
  const messages = data.value || [];
  console.log(`Found ${messages.length} message(s).\n`);
  for (const message of messages) {
    const times = messageTimes(message);
    console.log(`${message.id}`);
    console.log(`  from: ${message.from?.emailAddress?.address || message.from?.emailAddress?.name || ""}`);
    console.log(`  subject: ${message.subject || ""}`);
    console.log(`  date_utc: ${times.utc}`);
    console.log(`  date_local: ${times.local}`);
    console.log(`  snippet: ${message.bodyPreview || ""}`);
    console.log("");
  }
}

async function move(args) {
  const messageId = args[0];
  const options = parseOptions(args.slice(1));
  if (!messageId || !options.from || !options.to) {
    throw new Error(
      'Usage: node tools/outlook/cli.js move <messageId> --from "Inbox" --to Archive [--create-label]'
    );
  }

  const folders = await getFolders();
  const fromFolder = findFolder(folders, options.from);
  if (!fromFolder) throw new Error(`Folder not found: ${options.from}`);
  const toFolderId = await resolveFolderId(options.to, { createMissing: Boolean(options["create-label"]) });
  const message = await graph(`/me/messages/${encodeURIComponent(messageId)}?$select=id,parentFolderId`);
  if (message.parentFolderId && message.parentFolderId !== fromFolder.id) {
    throw new Error(`Message is not in source folder: ${options.from}`);
  }
  const data = await graph(`/me/messages/${encodeURIComponent(messageId)}/move`, {
    method: "POST",
    body: JSON.stringify({ destinationId: toFolderId }),
  });

  console.log(`Moved message ${data.id}`);
  console.log(`From folder: ${options.from}`);
  console.log(`To folder: ${options.to}`);
}

async function getMessageAttachments(messageId) {
  const data = await graph(`/me/messages/${encodeURIComponent(messageId)}/attachments?$top=100`);
  return data.value || [];
}

async function attachments(args) {
  const messageId = args[0];
  if (!messageId) throw new Error("Usage: node tools/outlook/cli.js attachments <messageId>");

  const items = await getMessageAttachments(messageId);
  console.log(`Found ${items.length} attachment(s).\n`);
  items.forEach((item, index) => {
    console.log(`${index + 1}. ${item.name || item.id}`);
    console.log(`   type: ${item["@odata.type"] || ""}`);
    console.log(`   mime: ${item.contentType || ""}`);
    console.log(`   size: ${item.size || 0} bytes`);
    console.log(`   attachmentId: ${item.id}`);
    console.log("");
  });
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

async function downloadAttachments(args) {
  const messageId = args[0];
  if (!messageId) {
    throw new Error("Usage: node tools/outlook/cli.js download-attachments <messageId> [--out downloads/outlook]");
  }

  const options = parseOptions(args.slice(1));
  const outputDir = path.resolve(ROOT, options.out || "downloads/outlook", messageId);
  fs.mkdirSync(outputDir, { recursive: true });

  const items = await getMessageAttachments(messageId);
  console.log(`Found ${items.length} attachment(s).`);
  if (items.length === 0) return;

  for (const item of items) {
    if (item["@odata.type"] !== "#microsoft.graph.fileAttachment") {
      console.log(`Skipped non-file attachment ${item.name || item.id}`);
      continue;
    }
    const detail = item.contentBytes
      ? item
      : await graph(`/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(item.id)}`);
    const filename = safeFilename(detail.name || item.name || "attachment");
    const target = uniquePath(outputDir, filename);
    fs.writeFileSync(target, Buffer.from(detail.contentBytes || "", "base64"));
    console.log(`Saved ${path.relative(ROOT, target)}`);
  }
}

async function read(args) {
  const id = args[0];
  if (!id) throw new Error("Usage: node tools/outlook/cli.js read <messageId>");
  const data = await graph(`/me/messages/${encodeURIComponent(id)}`);
  const times = messageTimes(data);
  console.log(JSON.stringify({ date_utc: times.utc, date_local: times.local, ...data }, null, 2));
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

function attachmentPayload(file) {
  const fullPath = path.resolve(ROOT, file);
  if (!fs.existsSync(fullPath)) throw new Error(`Attachment not found: ${file}`);
  if (!fs.statSync(fullPath).isFile()) throw new Error(`Attachment is not a file: ${file}`);
  return {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: path.basename(fullPath),
    contentType: mimeTypeForFile(fullPath),
    contentBytes: fs.readFileSync(fullPath).toString("base64"),
  };
}

async function send(args) {
  const options = parseOptions(args);
  if (!options.to || !options.subject || !options.body) {
    throw new Error(
      'Usage: node tools/outlook/cli.js send --to you@example.com --subject "Subject" --body "Message" [--attach file]'
    );
  }

  const attachmentsList = valuesForOption(options, "attach").map(attachmentPayload);
  const message = {
    subject: String(options.subject),
    body: {
      contentType: "Text",
      content: String(options.body),
    },
    toRecipients: valuesForOption(options, "to").map((address) => ({
      emailAddress: { address },
    })),
    ...(attachmentsList.length ? { attachments: attachmentsList } : {}),
  };

  await graph("/me/sendMail", {
    method: "POST",
    body: JSON.stringify({
      message,
      saveToSentItems: true,
    }),
  });
  console.log("Sent message");
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
  node tools/outlook/cli.js auth
  node tools/outlook/cli.js labels
  node tools/outlook/cli.js list [--query "from:client@example.com"] [--limit 10] [--label Inbox]
  node tools/outlook/cli.js read <messageId>
  node tools/outlook/cli.js move <messageId> --from "Inbox" --to Archive [--create-label]
  node tools/outlook/cli.js attachments <messageId>
  node tools/outlook/cli.js download-attachments <messageId> [--out downloads/outlook]
  node tools/outlook/cli.js send --to you@example.com --subject "Subject" --body "Message" [--attach file ...]

Examples:
  node tools/outlook/cli.js auth
  node tools/outlook/cli.js labels
  node tools/outlook/cli.js list --label Inbox --limit 20
  node tools/outlook/cli.js read AAMkAG...
  node tools/outlook/cli.js move AAMkAG... --from Inbox --to Archive
  node tools/outlook/cli.js attachments AAMkAG...
  node tools/outlook/cli.js download-attachments AAMkAG... --out downloads/outlook
  node tools/outlook/cli.js send --to you@example.com --subject "Hello" --body "Test message"
  node tools/outlook/cli.js send --to you@example.com --subject "Files" --body "Attached." --attach /tmp/file.pdf
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
  if (command === "move") return move(args);
  if (command === "attachments") return attachments(args);
  if (command === "download-attachments") return downloadAttachments(args);
  if (command === "send") return send(args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
