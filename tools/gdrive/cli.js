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
const DRIVE_ENDPOINT = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3";
const DEFAULT_CALLBACK_URL = "http://localhost:3000/callback";
const DEFAULT_SCOPES = ["https://www.googleapis.com/auth/drive"];
const GOOGLE_DOC_MIME_PREFIX = "application/vnd.google-apps.";
const SHORTCUT_MIME_TYPE = "application/vnd.google-apps.shortcut";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DEFAULT_EXPORTS = {
  "application/vnd.google-apps.document": {
    mime: "application/pdf",
    ext: ".pdf",
  },
  "application/vnd.google-apps.drawing": {
    mime: "image/png",
    ext: ".png",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/pdf",
    ext: ".pdf",
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: ".xlsx",
  },
};
const EXPORT_EXTENSIONS = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv",
  "text/plain": ".txt",
  "text/html": ".html",
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

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
    clientId: process.env.GDRIVE_CLIENT_ID,
    clientSecret: process.env.GDRIVE_CLIENT_SECRET,
    callbackUrl: process.env.GDRIVE_CALLBACK_URL || DEFAULT_CALLBACK_URL,
    scopes: (process.env.GDRIVE_SCOPES || DEFAULT_SCOPES.join(" ")).split(/\s+/).filter(Boolean),
  };

  const missing = [];
  if (!config.clientId) missing.push("GDRIVE_CLIENT_ID");
  if (!config.clientSecret) missing.push("GDRIVE_CLIENT_SECRET");
  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")} in ${ENV_FILE}`);
  }
  return config;
}

function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("No saved token. Run: node tools/gdrive/cli.js auth");
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

async function getDriveProfile(accessToken) {
  const res = await fetch(`${DRIVE_ENDPOINT}/about?fields=user(emailAddress,displayName)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`Google Drive profile request failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return {
    account_email: body.user?.emailAddress,
    account_name: body.user?.displayName,
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
    throw new Error("Saved token has no refresh token. Run: node tools/gdrive/cli.js auth");
  }
  const refreshed = await requestToken({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: token.refresh_token,
  });
  const profile = await getDriveProfile(refreshed.access_token);
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
        res.end(`Google Drive authorization failed: ${error}`);
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
      const profile = await getDriveProfile(token.access_token);
      writeToken(token, {}, profile);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Google Drive CLI authorization complete. You can close this tab.");
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

async function drive(pathname, options = {}) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${DRIVE_ENDPOINT}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`Google Drive request failed (${res.status}): ${JSON.stringify(body, null, 2)}`);
  }
  return body;
}

async function driveUpload(pathname, metadata, media) {
  const accessToken = await getAccessToken();
  const boundary = `gdrive-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(
      [
        `--${boundary}`,
        "Content-Type: application/json; charset=utf-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${media.mimeType}`,
        "",
        "",
      ].join("\r\n")
    ),
    media.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(`${DRIVE_UPLOAD_ENDPOINT}${pathname}`, {
    method: media.method || "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Google Drive upload failed (${res.status}): ${JSON.stringify(parsed, null, 2)}`);
  }
  return parsed;
}

async function driveBinary(pathname) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${DRIVE_ENDPOINT}${pathname}`, {
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
    throw new Error(`Google Drive download failed (${res.status}): ${JSON.stringify(body, null, 2)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function driveJsonOptions(method, payload) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
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

function fileFields() {
  return [
    "id",
    "name",
    "mimeType",
    "size",
    "modifiedTime",
    "webViewLink",
    "webContentLink",
    "parents",
    "capabilities/canDownload",
    "shortcutDetails(targetId,targetMimeType)",
  ].join(",");
}

function queryFor(options) {
  const filters = [];
  if (options.query || options.q) {
    filters.push(`name contains '${escapeDriveQuery(options.query || options.q)}'`);
  }
  if (options.text) {
    filters.push(`fullText contains '${escapeDriveQuery(options.text)}'`);
  }
  if (options.folder) {
    filters.push(`'${escapeDriveQuery(options.folder)}' in parents`);
  }
  if (!options["include-trashed"]) {
    filters.push("trashed = false");
  }
  return filters.join(" and ");
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function files(args) {
  const options = parseOptions(args);
  const params = new URLSearchParams({
    pageSize: String(Math.min(Math.max(Number(options.limit || 10), 1), 100)),
    fields: `files(${fileFields()}),nextPageToken`,
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  });
  const query = queryFor(options);
  if (query) params.set("q", query);
  if (options.orderBy) params.set("orderBy", options.orderBy);

  const data = await drive(`/files?${params.toString()}`);
  const items = data.files || [];
  console.log(`Found ${items.length} file(s).\n`);
  items.forEach((item, index) => printFile(item, index + 1));
}

async function get(args) {
  const fileId = args[0];
  if (!fileId) throw new Error("Usage: node tools/gdrive/cli.js get <fileId>");
  const params = new URLSearchParams({
    fields: fileFields(),
    supportsAllDrives: "true",
  });
  const data = await drive(`/files/${encodeURIComponent(fileId)}?${params.toString()}`);
  console.log(JSON.stringify(data, null, 2));
}

async function mkdir(args) {
  const options = parseOptions(args);
  const name = options.name || options._[0];
  if (!name) throw new Error("Usage: node tools/gdrive/cli.js mkdir --name <folderName> [--parent <folderId>]");
  const params = new URLSearchParams({
    fields: fileFields(),
    supportsAllDrives: "true",
  });
  const payload = {
    name,
    mimeType: FOLDER_MIME_TYPE,
  };
  if (options.parent) payload.parents = [options.parent];
  const data = await drive(`/files?${params.toString()}`, driveJsonOptions("POST", payload));
  printFile(data, 1);
}

async function upload(args) {
  const filePath = args[0];
  if (!filePath) {
    throw new Error("Usage: node tools/gdrive/cli.js upload <localFile> [--name <driveName>] [--parent <folderId>] [--mime <mimeType>]");
  }
  const options = parseOptions(args.slice(1));
  const fullPath = path.resolve(ROOT, filePath);
  if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);
  if (!fs.statSync(fullPath).isFile()) throw new Error(`Not a file: ${filePath}`);

  const params = new URLSearchParams({
    uploadType: "multipart",
    fields: fileFields(),
    supportsAllDrives: "true",
  });
  const metadata = {
    name: options.name || path.basename(fullPath),
  };
  if (options.parent) metadata.parents = [options.parent];
  if (options.convert) metadata.mimeType = options.convert;
  const data = await driveUpload(`/files?${params.toString()}`, metadata, {
    mimeType: options.mime || mimeTypeForFile(fullPath),
    data: fs.readFileSync(fullPath),
  });
  printFile(data, 1);
}

async function updateContent(args) {
  const fileId = args[0];
  const filePath = args[1];
  if (!fileId || !filePath) {
    throw new Error("Usage: node tools/gdrive/cli.js update-content <fileId> <localFile> [--name <driveName>] [--mime <mimeType>]");
  }
  const options = parseOptions(args.slice(2));
  const fullPath = path.resolve(ROOT, filePath);
  if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);
  if (!fs.statSync(fullPath).isFile()) throw new Error(`Not a file: ${filePath}`);

  const params = new URLSearchParams({
    uploadType: "multipart",
    fields: fileFields(),
    supportsAllDrives: "true",
  });
  const metadata = {};
  if (options.name) metadata.name = options.name;
  const data = await driveUpload(`/files/${encodeURIComponent(fileId)}?${params.toString()}`, metadata, {
    method: "PATCH",
    mimeType: options.mime || mimeTypeForFile(fullPath),
    data: fs.readFileSync(fullPath),
  });
  printFile(data, 1);
}

async function updateMetadata(args) {
  const fileId = args[0];
  if (!fileId) {
    throw new Error("Usage: node tools/gdrive/cli.js update <fileId> [--name <name>] [--description <text>] [--starred true|false]");
  }
  const options = parseOptions(args.slice(1));
  const payload = {};
  if (options.name) payload.name = options.name;
  if (options.description) payload.description = options.description;
  if (options.starred != null) payload.starred = booleanOption(options.starred);
  if (Object.keys(payload).length === 0) throw new Error("No update fields provided.");

  const params = new URLSearchParams({
    fields: fileFields(),
    supportsAllDrives: "true",
  });
  const data = await drive(
    `/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    driveJsonOptions("PATCH", payload)
  );
  printFile(data, 1);
}

async function move(args) {
  const fileId = args[0];
  if (!fileId) throw new Error("Usage: node tools/gdrive/cli.js move <fileId> --to <folderId> [--from <folderId>]");
  const options = parseOptions(args.slice(1));
  if (!options.to) throw new Error("Missing --to <folderId>");

  let previousParents = options.from;
  if (!previousParents) {
    const params = new URLSearchParams({
      fields: "parents",
      supportsAllDrives: "true",
    });
    const file = await drive(`/files/${encodeURIComponent(fileId)}?${params.toString()}`);
    previousParents = (file.parents || []).join(",");
  }

  const params = new URLSearchParams({
    addParents: options.to,
    fields: fileFields(),
    supportsAllDrives: "true",
  });
  if (previousParents) params.set("removeParents", previousParents);
  const data = await drive(`/files/${encodeURIComponent(fileId)}?${params.toString()}`, { method: "PATCH" });
  printFile(data, 1);
}

async function copy(args) {
  const fileId = args[0];
  if (!fileId) throw new Error("Usage: node tools/gdrive/cli.js copy <fileId> [--name <copyName>] [--parent <folderId>]");
  const options = parseOptions(args.slice(1));
  const payload = {};
  if (options.name) payload.name = options.name;
  if (options.parent) payload.parents = [options.parent];
  const params = new URLSearchParams({
    fields: fileFields(),
    supportsAllDrives: "true",
  });
  const data = await drive(
    `/files/${encodeURIComponent(fileId)}/copy?${params.toString()}`,
    driveJsonOptions("POST", payload)
  );
  printFile(data, 1);
}

async function trash(args, trashed) {
  const fileId = args[0];
  const command = trashed ? "trash" : "untrash";
  if (!fileId) throw new Error(`Usage: node tools/gdrive/cli.js ${command} <fileId>`);
  const params = new URLSearchParams({
    fields: fileFields(),
    supportsAllDrives: "true",
  });
  const data = await drive(
    `/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    driveJsonOptions("PATCH", { trashed })
  );
  printFile(data, 1);
}

async function deleteFile(args) {
  const fileId = args[0];
  const options = parseOptions(args.slice(1));
  if (!fileId) throw new Error("Usage: node tools/gdrive/cli.js delete <fileId> --yes");
  if (!options.yes) {
    throw new Error("Permanent delete requires --yes. Use trash <fileId> for reversible removal.");
  }
  const params = new URLSearchParams({
    supportsAllDrives: "true",
  });
  await drive(`/files/${encodeURIComponent(fileId)}?${params.toString()}`, { method: "DELETE" });
  console.log(`Permanently deleted ${fileId}`);
}

function printFile(item, index) {
  console.log(`${index}. ${item.name || "(no name)"}`);
  console.log(`   id: ${item.id}`);
  console.log(`   mime: ${item.mimeType || ""}`);
  if (item.size) console.log(`   size: ${item.size} bytes`);
  if (item.modifiedTime) console.log(`   modified: ${item.modifiedTime}`);
  if (item.webViewLink) console.log(`   url: ${item.webViewLink}`);
  if (item.parents?.length) console.log(`   parents: ${item.parents.join(", ")}`);
  console.log("");
}

function booleanOption(value) {
  if (value === true) return true;
  const normalized = String(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Expected boolean value, got: ${value}`);
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
  return cleaned || "drive-file";
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

function filenameWithExtension(name, extension) {
  if (!extension) return safeFilename(name);
  const cleaned = safeFilename(name);
  return path.extname(cleaned).toLowerCase() === extension.toLowerCase() ? cleaned : `${cleaned}${extension}`;
}

async function download(args) {
  const fileId = args[0];
  if (!fileId) {
    throw new Error("Usage: node tools/gdrive/cli.js download <fileId> [--out downloads/gdrive] [--mime application/pdf]");
  }
  const options = parseOptions(args.slice(1));
  const metadataParams = new URLSearchParams({
    fields: fileFields(),
    supportsAllDrives: "true",
  });
  const requestedFile = await drive(`/files/${encodeURIComponent(fileId)}?${metadataParams.toString()}`);
  let file = requestedFile;
  let downloadFileId = fileId;
  if (requestedFile.mimeType === SHORTCUT_MIME_TYPE) {
    const targetId = requestedFile.shortcutDetails?.targetId;
    if (!targetId) {
      throw new Error(`Shortcut has no target file ID: ${requestedFile.name || fileId}`);
    }
    file = await drive(`/files/${encodeURIComponent(targetId)}?${metadataParams.toString()}`);
    downloadFileId = targetId;
    console.log(
      `Resolved shortcut ${requestedFile.name || fileId} (${requestedFile.id}) to ${file.name || targetId} (${targetId})`
    );
  }
  if (file.capabilities && file.capabilities.canDownload === false) {
    throw new Error(`File cannot be downloaded: ${file.name || fileId}`);
  }

  const outputDir = path.resolve(ROOT, options.out || "downloads/gdrive");
  fs.mkdirSync(outputDir, { recursive: true });

  let data;
  let filename;
  if (file.mimeType && file.mimeType.startsWith(GOOGLE_DOC_MIME_PREFIX)) {
    const exportInfo = exportInfoFor(file.mimeType, options.mime);
    const params = new URLSearchParams({ mimeType: exportInfo.mime });
    data = await driveBinary(`/files/${encodeURIComponent(downloadFileId)}/export?${params.toString()}`);
    filename = filenameWithExtension(file.name || fileId, exportInfo.ext);
  } else {
    const params = new URLSearchParams({
      alt: "media",
      supportsAllDrives: "true",
    });
    data = await driveBinary(`/files/${encodeURIComponent(downloadFileId)}?${params.toString()}`);
    filename = safeFilename(file.name || fileId);
  }

  const target = uniquePath(outputDir, filename);
  fs.writeFileSync(target, data);
  console.log(`Saved ${path.relative(ROOT, target)}`);
}

function exportInfoFor(mimeType, requestedMime) {
  const fallback = DEFAULT_EXPORTS[mimeType] || {
    mime: "application/pdf",
    ext: ".pdf",
  };
  if (!requestedMime) return fallback;
  return {
    mime: requestedMime,
    ext: EXPORT_EXTENSIONS[requestedMime] || "",
  };
}

async function open(args) {
  const fileId = args[0];
  if (!fileId) throw new Error("Usage: node tools/gdrive/cli.js open <fileId>");
  const params = new URLSearchParams({
    fields: "webViewLink",
    supportsAllDrives: "true",
  });
  const data = await drive(`/files/${encodeURIComponent(fileId)}?${params.toString()}`);
  const url = data.webViewLink || `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
  console.log(url);
  openBrowser(url);
}

function help() {
  console.log(`
Usage:
  node tools/gdrive/cli.js auth
  node tools/gdrive/cli.js files [--query "invoice"] [--text "inside file"] [--folder <folderId>] [--limit 10]
  node tools/gdrive/cli.js get <fileId>
  node tools/gdrive/cli.js download <fileId> [--out downloads/gdrive] [--mime application/pdf]
  node tools/gdrive/cli.js open <fileId>
  node tools/gdrive/cli.js mkdir --name <folderName> [--parent <folderId>]
  node tools/gdrive/cli.js upload <localFile> [--name <driveName>] [--parent <folderId>] [--mime <mimeType>] [--convert <googleMimeType>]
  node tools/gdrive/cli.js update-content <fileId> <localFile> [--name <driveName>] [--mime <mimeType>]
  node tools/gdrive/cli.js update <fileId> [--name <name>] [--description <text>] [--starred true|false]
  node tools/gdrive/cli.js move <fileId> --to <folderId> [--from <folderId>]
  node tools/gdrive/cli.js copy <fileId> [--name <copyName>] [--parent <folderId>]
  node tools/gdrive/cli.js trash <fileId>
  node tools/gdrive/cli.js untrash <fileId>
  node tools/gdrive/cli.js delete <fileId> --yes

Examples:
  node tools/gdrive/cli.js auth
  node tools/gdrive/cli.js files --query "proposal" --limit 20
  node tools/gdrive/cli.js files --text "resident visa" --limit 20
  node tools/gdrive/cli.js files --folder 1abcFolderId --limit 20
  node tools/gdrive/cli.js get 1abcFileId
  node tools/gdrive/cli.js download 1abcFileId --out downloads/gdrive
  node tools/gdrive/cli.js download 1abcGoogleDocId --mime application/vnd.openxmlformats-officedocument.wordprocessingml.document
  node tools/gdrive/cli.js open 1abcFileId
  node tools/gdrive/cli.js mkdir --name "Receipts"
  node tools/gdrive/cli.js upload ./report.pdf --parent 1abcFolderId
  node tools/gdrive/cli.js update-content 1abcFileId ./report-v2.pdf
  node tools/gdrive/cli.js rename 1abcFileId --name "New name.pdf"
  node tools/gdrive/cli.js move 1abcFileId --to 1targetFolderId
  node tools/gdrive/cli.js copy 1abcFileId --name "Copy of report.pdf"
  node tools/gdrive/cli.js trash 1abcFileId

Notes:
  files, list, and search are aliases. get and read are aliases.
  mkdir/create-folder, update-content/replace, and update/rename are aliases.
  --query and --q are aliases.
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }
  if (command === "auth") return auth();
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
  if (command === "trash") return trash(args, true);
  if (command === "untrash") return trash(args, false);
  if (command === "delete") return deleteFile(args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
