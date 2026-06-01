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
const DEFAULT_SCOPES = ["offline_access", "User.Read", "Files.ReadWrite.All"];
const FOLDER_CONFLICT_BEHAVIOR = "rename";
const FILE_CONFLICT_BEHAVIOR = "rename";

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
    clientId: process.env.ONEDRIVE_CLIENT_ID,
    clientSecret: process.env.ONEDRIVE_CLIENT_SECRET,
    callbackUrl: process.env.ONEDRIVE_CALLBACK_URL || DEFAULT_CALLBACK_URL,
    scopes: (process.env.ONEDRIVE_SCOPES || DEFAULT_SCOPES.join(" ")).split(/\s+/).filter(Boolean),
  };

  const missing = [];
  if (!config.clientId) missing.push("ONEDRIVE_CLIENT_ID");
  if (!config.clientSecret) missing.push("ONEDRIVE_CLIENT_SECRET");
  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")} in ${ENV_FILE}`);
  }
  return config;
}

function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("No saved token. Run: node tools/onedrive/cli.js auth");
  }
  return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
}

function writeToken(token, previous = {}, metadata = {}) {
  const expiresAt = Date.now() + Math.max(0, Number(token.expires_in || 0) - 60) * 1000;
  const payload = {
    account_email: metadata.account_email || previous.account_email,
    account_name: metadata.account_name || previous.account_name,
    account_id: metadata.account_id || previous.account_id,
    drive_id: metadata.drive_id || previous.drive_id,
    drive_type: metadata.drive_type || previous.drive_type,
    drive_owner: metadata.drive_owner || previous.drive_owner,
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

async function getOneDriveProfile(accessToken) {
  const profileRes = await fetch(`${GRAPH_ENDPOINT}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profileText = await profileRes.text();
  const profile = profileText ? JSON.parse(profileText) : {};
  if (!profileRes.ok) {
    throw new Error(`OneDrive profile request failed (${profileRes.status}): ${JSON.stringify(profile)}`);
  }

  const driveRes = await fetch(`${GRAPH_ENDPOINT}/me/drive`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const driveText = await driveRes.text();
  const drive = driveText ? JSON.parse(driveText) : {};
  if (!driveRes.ok) {
    throw new Error(`OneDrive drive request failed (${driveRes.status}): ${JSON.stringify(drive)}`);
  }

  return {
    account_email: profile.mail || profile.userPrincipalName,
    account_name: profile.displayName,
    account_id: profile.id,
    drive_id: drive.id,
    drive_type: drive.driveType,
    drive_owner: drive.owner?.user?.displayName || drive.owner?.user?.email,
  };
}

async function getAccessToken() {
  const config = requireConfig();
  const token = readToken();
  if (token.access_token && token.expires_at && token.expires_at > Date.now()) {
    return token.access_token;
  }
  if (!token.refresh_token) {
    throw new Error("Saved token has no refresh token. Run: node tools/onedrive/cli.js auth");
  }
  const refreshed = await requestToken({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: token.refresh_token,
    scope: config.scopes.join(" "),
  });
  const profile = await getOneDriveProfile(refreshed.access_token);
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
        res.end(`OneDrive authorization failed: ${error}`);
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
      const profile = await getOneDriveProfile(token.access_token);
      writeToken(token, {}, profile);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OneDrive CLI authorization complete. You can close this tab.");
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
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    ...(options.headers || {}),
  };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`OneDrive request failed (${res.status}): ${JSON.stringify(body, null, 2)}`);
  }
  return body;
}

async function graphBinary(pathname) {
  const accessToken = await getAccessToken();
  const url = pathname.startsWith("https://") ? pathname : `${GRAPH_ENDPOINT}${pathname}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    throw new Error(`OneDrive download failed (${res.status}): ${JSON.stringify(body, null, 2)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function graphJsonOptions(method, payload) {
  return {
    method,
    body: JSON.stringify(payload),
  };
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

function itemSelect() {
  return [
    "id",
    "name",
    "size",
    "file",
    "folder",
    "package",
    "remoteItem",
    "lastModifiedDateTime",
    "webUrl",
    "parentReference",
    "@microsoft.graph.downloadUrl",
  ].join(",");
}

function appendSelect(params) {
  params.set("$select", itemSelect());
}

function childrenPath(folderId) {
  if (!folderId || folderId === "root") return "/me/drive/root/children";
  return `/me/drive/items/${encodeURIComponent(folderId)}/children`;
}

function searchPath(query) {
  return `/me/drive/root/search(q='${escapeSearchArgument(query)}')`;
}

function escapeSearchArgument(value) {
  return String(value).replace(/'/g, "''");
}

function itemPath(itemId) {
  return `/me/drive/items/${encodeURIComponent(itemId)}`;
}

function contentUploadPath(parentId, filename) {
  const name = encodeURIComponent(filename).replace(/%2F/gi, "/");
  if (!parentId || parentId === "root") return `/me/drive/root:/${name}:/content`;
  return `/me/drive/items/${encodeURIComponent(parentId)}:/${name}:/content`;
}

async function account() {
  const token = readToken();
  const payload = {
    account_email: token.account_email,
    account_name: token.account_name,
    account_id: token.account_id,
    drive_id: token.drive_id,
    drive_type: token.drive_type,
    drive_owner: token.drive_owner,
    scope: token.scope,
    expires_at: token.expires_at,
  };
  console.log(JSON.stringify(payload, null, 2));
}

async function files(args) {
  const options = parseOptions(args);
  const params = new URLSearchParams({
    $top: String(Math.min(Math.max(Number(options.limit || 10), 1), 100)),
  });
  appendSelect(params);
  if (options.orderBy) params.set("$orderby", options.orderBy);

  let pathname;
  if (options.query || options.q || options.text) {
    pathname = searchPath(options.query || options.q || options.text);
  } else {
    pathname = childrenPath(options.folder);
  }

  const data = await graph(`${pathname}?${params.toString()}`);
  const items = data.value || [];
  console.log(`Found ${items.length} file(s).\n`);
  items.forEach((item, index) => printItem(item, index + 1));
}

async function get(args) {
  const itemId = args[0];
  if (!itemId) throw new Error("Usage: node tools/onedrive/cli.js get <itemId>");
  const params = new URLSearchParams();
  appendSelect(params);
  const data = await graph(`${itemPath(itemId)}?${params.toString()}`);
  console.log(JSON.stringify(data, null, 2));
}

async function mkdir(args) {
  const options = parseOptions(args);
  const name = options.name || options._[0];
  if (!name) {
    throw new Error("Usage: node tools/onedrive/cli.js mkdir --name <folderName> [--parent <folderId>]");
  }
  const params = new URLSearchParams();
  appendSelect(params);
  const payload = {
    name,
    folder: {},
    "@microsoft.graph.conflictBehavior": FOLDER_CONFLICT_BEHAVIOR,
  };
  const data = await graph(`${childrenPath(options.parent)}?${params.toString()}`, graphJsonOptions("POST", payload));
  printItem(data, 1);
}

async function upload(args) {
  const filePath = args[0];
  if (!filePath) {
    throw new Error(
      "Usage: node tools/onedrive/cli.js upload <localFile> [--name <driveName>] [--parent <folderId>] [--mime <mimeType>]"
    );
  }
  const options = parseOptions(args.slice(1));
  const fullPath = path.resolve(ROOT, filePath);
  if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);
  if (!fs.statSync(fullPath).isFile()) throw new Error(`Not a file: ${filePath}`);

  const filename = options.name || path.basename(fullPath);
  const params = new URLSearchParams({
    "@microsoft.graph.conflictBehavior": FILE_CONFLICT_BEHAVIOR,
  });
  const pathname = `${contentUploadPath(options.parent, filename)}?${params.toString()}`;
  const data = await graph(pathname, {
    method: "PUT",
    headers: { "Content-Type": options.mime || mimeTypeForFile(fullPath) },
    body: fs.readFileSync(fullPath),
  });
  printItem(data, 1);
}

async function updateContent(args) {
  const itemId = args[0];
  const filePath = args[1];
  if (!itemId || !filePath) {
    throw new Error(
      "Usage: node tools/onedrive/cli.js update-content <itemId> <localFile> [--mime <mimeType>]"
    );
  }
  const options = parseOptions(args.slice(2));
  const fullPath = path.resolve(ROOT, filePath);
  if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);
  if (!fs.statSync(fullPath).isFile()) throw new Error(`Not a file: ${filePath}`);

  const data = await graph(`${itemPath(itemId)}/content`, {
    method: "PUT",
    headers: { "Content-Type": options.mime || mimeTypeForFile(fullPath) },
    body: fs.readFileSync(fullPath),
  });
  printItem(data, 1);
}

async function updateMetadata(args) {
  const itemId = args[0];
  if (!itemId) {
    throw new Error("Usage: node tools/onedrive/cli.js update <itemId> [--name <name>]");
  }
  const options = parseOptions(args.slice(1));
  const payload = {};
  if (options.name) payload.name = options.name;
  if (Object.keys(payload).length === 0) throw new Error("No update fields provided.");

  const params = new URLSearchParams();
  appendSelect(params);
  const data = await graph(`${itemPath(itemId)}?${params.toString()}`, graphJsonOptions("PATCH", payload));
  printItem(data, 1);
}

async function move(args) {
  const itemId = args[0];
  if (!itemId) throw new Error("Usage: node tools/onedrive/cli.js move <itemId> --to <folderId>");
  const options = parseOptions(args.slice(1));
  if (!options.to) throw new Error("Missing --to <folderId>");

  const params = new URLSearchParams();
  appendSelect(params);
  const payload = {
    parentReference: {
      id: options.to,
    },
  };
  if (options.name) payload.name = options.name;
  const data = await graph(`${itemPath(itemId)}?${params.toString()}`, graphJsonOptions("PATCH", payload));
  printItem(data, 1);
}

async function copy(args) {
  const itemId = args[0];
  if (!itemId) throw new Error("Usage: node tools/onedrive/cli.js copy <itemId> [--name <copyName>] [--parent <folderId>]");
  const options = parseOptions(args.slice(1));
  const payload = {};
  if (options.name) payload.name = options.name;
  if (options.parent) payload.parentReference = { id: options.parent };

  await graph(`${itemPath(itemId)}/copy`, graphJsonOptions("POST", payload));
  console.log(`Copy accepted for ${itemId}. OneDrive completes copy operations asynchronously.`);
}

async function deleteItem(args, command) {
  const itemId = args[0];
  const options = parseOptions(args.slice(1));
  if (!itemId) throw new Error(`Usage: node tools/onedrive/cli.js ${command} <itemId>${command === "delete" ? " --yes" : ""}`);
  if (command === "delete" && !options.yes) {
    throw new Error("Delete requires --yes. OneDrive usually moves deleted items to the recycle bin.");
  }
  await graph(itemPath(itemId), { method: "DELETE" });
  console.log(`Deleted ${itemId}`);
}

function printItem(item, index) {
  console.log(`${index}. ${item.name || "(no name)"}`);
  console.log(`   id: ${item.id}`);
  console.log(`   type: ${item.folder ? "folder" : "file"}`);
  if (item.file?.mimeType) console.log(`   mime: ${item.file.mimeType}`);
  if (item.size != null) console.log(`   size: ${item.size} bytes`);
  if (item.lastModifiedDateTime) console.log(`   modified: ${item.lastModifiedDateTime}`);
  if (item.webUrl) console.log(`   url: ${item.webUrl}`);
  if (item.parentReference?.id) console.log(`   parent: ${item.parentReference.id}`);
  if (item.parentReference?.path) console.log(`   path: ${item.parentReference.path}`);
  console.log("");
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
    ".md": "text/markdown",
    ".mp3": "audio/mpeg",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
  };
  return types[ext] || "application/octet-stream";
}

function safeFilename(filename) {
  const cleaned = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return cleaned || "onedrive-file";
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

async function download(args) {
  const itemId = args[0];
  if (!itemId) {
    throw new Error("Usage: node tools/onedrive/cli.js download <itemId> [--out downloads/onedrive]");
  }
  const options = parseOptions(args.slice(1));
  const params = new URLSearchParams();
  appendSelect(params);
  const item = await graph(`${itemPath(itemId)}?${params.toString()}`);
  if (item.folder) throw new Error(`Folders cannot be downloaded directly: ${item.name || itemId}`);

  const outputDir = path.resolve(ROOT, options.out || "downloads/onedrive");
  fs.mkdirSync(outputDir, { recursive: true });

  const data = await graphBinary(`${itemPath(itemId)}/content`);
  const target = uniquePath(outputDir, safeFilename(item.name || itemId));
  fs.writeFileSync(target, data);
  console.log(`Saved ${path.relative(ROOT, target)}`);
}

async function open(args) {
  const itemId = args[0];
  if (!itemId) throw new Error("Usage: node tools/onedrive/cli.js open <itemId>");
  const params = new URLSearchParams();
  params.set("$select", "webUrl");
  const data = await graph(`${itemPath(itemId)}?${params.toString()}`);
  if (!data.webUrl) throw new Error(`OneDrive item has no webUrl: ${itemId}`);
  console.log(data.webUrl);
  openBrowser(data.webUrl);
}

function help() {
  console.log(`
Usage:
  node tools/onedrive/cli.js auth
  node tools/onedrive/cli.js account                                             (alias: me)
  node tools/onedrive/cli.js files [--query "invoice"] [--folder <folderId>] [--limit 10] [--orderBy lastModifiedDateTime]
  node tools/onedrive/cli.js get <itemId>                                        (alias: read)
  node tools/onedrive/cli.js download <itemId> [--out downloads/onedrive]
  node tools/onedrive/cli.js open <itemId>
  node tools/onedrive/cli.js mkdir --name <folderName> [--parent <folderId>]    (alias: create-folder)
  node tools/onedrive/cli.js upload <localFile> [--name <driveName>] [--parent <folderId>] [--mime <mimeType>]
  node tools/onedrive/cli.js update-content <itemId> <localFile> [--mime <mimeType>]  (alias: replace)
  node tools/onedrive/cli.js update <itemId> [--name <name>]                    (alias: rename)
  node tools/onedrive/cli.js move <itemId> --to <folderId> [--name <name>]
  node tools/onedrive/cli.js copy <itemId> [--name <copyName>] [--parent <folderId>]
  node tools/onedrive/cli.js trash <itemId>
  node tools/onedrive/cli.js delete <itemId> --yes

Notes:
  --query and --text both search via the Microsoft Graph search API (names and content).
  files, list, search are aliases. --query and --q are aliases.
  Folders cannot be downloaded directly.

Examples:
  node tools/onedrive/cli.js auth
  node tools/onedrive/cli.js account
  node tools/onedrive/cli.js files --query "proposal" --limit 20
  node tools/onedrive/cli.js files --folder root --limit 20
  node tools/onedrive/cli.js get 01ABCDEF234567
  node tools/onedrive/cli.js download 01ABCDEF234567 --out downloads/onedrive
  node tools/onedrive/cli.js open 01ABCDEF234567
  node tools/onedrive/cli.js mkdir --name "Receipts"
  node tools/onedrive/cli.js upload ./report.pdf --parent 01FOLDERID
  node tools/onedrive/cli.js update-content 01ABCDEF234567 ./report-v2.pdf
  node tools/onedrive/cli.js rename 01ABCDEF234567 --name "New name.pdf"
  node tools/onedrive/cli.js move 01ABCDEF234567 --to 01TARGETFOLDER
  node tools/onedrive/cli.js copy 01ABCDEF234567 --name "Copy of report.pdf"
  node tools/onedrive/cli.js trash 01ABCDEF234567
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }
  if (command === "auth") return auth();
  if (command === "account" || command === "me") return account();
  if (command === "files" || command === "list" || command === "search") return files(args);
  if (command === "get" || command === "read") return get(args);
  if (command === "download") return download(args);
  if (command === "open") return open(args);
  if (command === "mkdir" || command === "create-folder") return mkdir(args);
  if (command === "upload") return upload(args);
  if (command === "update-content" || command === "replace") return updateContent(args);
  if (command === "update" || command === "rename") return updateMetadata(args);
  if (command === "move") return move(args);
  if (command === "copy") return copy(args);
  if (command === "trash") return deleteItem(args, "trash");
  if (command === "delete") return deleteItem(args, "delete");
  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
