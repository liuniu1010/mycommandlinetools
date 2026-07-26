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
const NOTION_ENDPOINT = "https://api.notion.com/v1";
const AUTH_ENDPOINT = "https://api.notion.com/v1/oauth/authorize";
const TOKEN_ENDPOINT = "https://api.notion.com/v1/oauth/token";
const DEFAULT_NOTION_VERSION = "2022-06-28";
const DEFAULT_CALLBACK_URL = "http://localhost:3000/callback";
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_ITEMS = 500;
const SUMMARY_MAX_ITEMS = 5000;

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
    clientId: process.env.NOTION_CLIENT_ID,
    clientSecret: process.env.NOTION_CLIENT_SECRET,
    callbackUrl: process.env.NOTION_CALLBACK_URL || DEFAULT_CALLBACK_URL,
    version: process.env.NOTION_VERSION || DEFAULT_NOTION_VERSION,
  };
  const missing = [];
  if (!config.clientId) missing.push("NOTION_CLIENT_ID");
  if (!config.clientSecret) missing.push("NOTION_CLIENT_SECRET");
  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")} in ${ENV_FILE}`);
  }
  return config;
}

function requireOAuthConfig() {
  return requireConfig();
}

function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("No saved token. Run: node tools/notion/cli.js auth");
  }
  return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
}

function writeToken(token, previous = {}, metadata = {}) {
  const expiresIn = Number(token.expires_in || 0);
  const expiresAt = expiresIn > 0 ? Date.now() + Math.max(0, expiresIn - 60) * 1000 : previous.expires_at;
  const payload = {
    workspace_id: token.workspace_id || previous.workspace_id,
    workspace_name: token.workspace_name || previous.workspace_name,
    workspace_icon: token.workspace_icon || previous.workspace_icon,
    bot_id: token.bot_id || metadata.bot_id || previous.bot_id,
    owner: token.owner || previous.owner,
    duplicated_template_id: token.duplicated_template_id || previous.duplicated_template_id,
    access_token: token.access_token,
    refresh_token: token.refresh_token || previous.refresh_token,
    token_type: token.token_type || previous.token_type || "Bearer",
    expires_at: expiresAt,
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

function basicAuth(config) {
  return Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
}

async function requestToken(payload) {
  const config = requireOAuthConfig();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basicAuth(config)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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
  if (fs.existsSync(TOKEN_FILE)) {
    const token = readToken();
    if (token.access_token && (!token.expires_at || token.expires_at > Date.now())) {
      return token.access_token;
    }
    if (!token.refresh_token) {
      throw new Error("Saved token has no refresh token. Run: node tools/notion/cli.js auth");
    }
    const refreshed = await requestToken({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    });
    writeToken(refreshed, token);
    return refreshed.access_token;
  }
  throw new Error("No saved token. Run: node tools/notion/cli.js auth");
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
  const config = requireOAuthConfig();
  const callback = new URL(config.callbackUrl);
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);

  const authorizeUrl = new URL(AUTH_ENDPOINT);
  authorizeUrl.searchParams.set("owner", "user");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.callbackUrl);
  authorizeUrl.searchParams.set("response_type", "code");
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
        res.end(`Notion authorization failed: ${error}`);
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
        code,
        redirect_uri: config.callbackUrl,
      });
      writeToken(token);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Notion CLI authorization complete. You can close this tab.");
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
    } else if (parsed[key] === undefined) {
      parsed[key] = next;
      i += 1;
    } else if (Array.isArray(parsed[key])) {
      parsed[key].push(next);
      i += 1;
    } else {
      parsed[key] = [parsed[key], next];
      i += 1;
    }
  }
  return parsed;
}

function parseJson(value, label) {
  if (value === undefined || value === true) return undefined;
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`Invalid JSON for ${label}: ${err.message}`);
  }
}

function parseJsonFile(file) {
  if (!file || file === true) return undefined;
  return parseJson(fs.readFileSync(path.resolve(file), "utf8"), file);
}

function readPayload(options) {
  const fromFile = parseJsonFile(options["json-file"]);
  const fromBody = parseJson(options["body-json"], "--body-json");
  return {
    ...(fromFile || {}),
    ...(fromBody || {}),
  };
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function outputSuccess(data, metadata) {
  const payload = { success: true, data };
  if (metadata) payload.metadata = metadata;
  printJson(payload);
}

function normalizeNotionId(value) {
  if (!value || typeof value !== "string") {
    throw new Error("Notion ID or URL is required.");
  }
  const trimmed = value.trim();
  if (/^[0-9a-f]{32}$/i.test(trimmed)) {
    return `${trimmed.slice(0, 8)}-${trimmed.slice(8, 12)}-${trimmed.slice(12, 16)}-${trimmed.slice(
      16,
      20
    )}-${trimmed.slice(20)}`.toLowerCase();
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const match = trimmed.match(/([0-9a-f]{32})/i);
  if (match) return normalizeNotionId(match[1]);
  throw new Error("Invalid Notion ID or URL.");
}

function pageSize(value, fallback = DEFAULT_PAGE_SIZE) {
  const size = Number(value || fallback);
  if (!Number.isInteger(size) || size < 1) return fallback;
  return Math.min(size, DEFAULT_PAGE_SIZE);
}

function maxItems(value, fallback = DEFAULT_MAX_ITEMS, max = SUMMARY_MAX_ITEMS) {
  const size = Number(value || fallback);
  if (!Number.isInteger(size) || size < 1) return fallback;
  return Math.min(size, max);
}

async function notion(pathname, options = {}) {
  const config = requireConfig();
  const accessToken = await getAccessToken();
  const res = await fetch(`${NOTION_ENDPOINT}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Notion-Version": config.version,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Notion request failed (${res.status}): ${JSON.stringify(body, null, 2)}`);
  }
  return body;
}

function richTextFromPlain(text) {
  return [{ type: "text", text: { content: text }, plain_text: text }];
}

function extractRichText(value) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => item?.plain_text || item?.text?.content || "").join("").trim();
}

function getPageTitle(page) {
  const properties = page?.properties || {};
  const titleProp = Object.values(properties).find((prop) => prop?.type === "title");
  return extractRichText(titleProp?.title) || "Untitled page";
}

function getDatabaseTitle(database) {
  return extractRichText(database?.title) || "Untitled database";
}

function getPropertyValue(prop) {
  if (!prop || typeof prop !== "object") return null;
  switch (prop.type) {
    case "formula": {
      const formula = prop.formula || {};
      if (formula.type === "string") return formula.string || null;
      if (formula.type === "number") return typeof formula.number === "number" ? formula.number : null;
      if (formula.type === "boolean") return typeof formula.boolean === "boolean" ? String(formula.boolean) : null;
      if (formula.type === "date") return formula.date?.start || null;
      return null;
    }
    case "number":
      return typeof prop.number === "number" ? prop.number : null;
    case "checkbox":
      return typeof prop.checkbox === "boolean" ? String(prop.checkbox) : null;
    case "select":
      return prop.select?.name || null;
    case "status":
      return prop.status?.name || null;
    case "multi_select":
      return Array.isArray(prop.multi_select)
        ? prop.multi_select.map((item) => item?.name).filter(Boolean).join(", ")
        : null;
    case "rich_text":
      return extractRichText(prop.rich_text);
    case "title":
      return extractRichText(prop.title);
    case "people":
      return Array.isArray(prop.people)
        ? prop.people.map((person) => person?.name || person?.id).filter(Boolean).join(", ")
        : null;
    case "created_by":
      return prop.created_by?.name || prop.created_by?.id || null;
    case "last_edited_by":
      return prop.last_edited_by?.name || prop.last_edited_by?.id || null;
    case "email":
      return prop.email || null;
    case "url":
      return prop.url || null;
    case "phone_number":
      return prop.phone_number || null;
    case "date":
      return prop.date?.start || null;
    case "created_time":
      return prop.created_time || null;
    case "last_edited_time":
      return prop.last_edited_time || null;
    case "files":
      return Array.isArray(prop.files)
        ? prop.files.map((file) => file?.name || file?.file?.url || file?.external?.url).filter(Boolean).join(", ")
        : null;
    case "relation":
      return Array.isArray(prop.relation) ? prop.relation.map((rel) => rel?.id).filter(Boolean).join(", ") : null;
    case "rollup": {
      const rollup = prop.rollup || {};
      if (rollup.type === "number") return typeof rollup.number === "number" ? rollup.number : null;
      if (rollup.type === "date") return rollup.date?.start || null;
      if (rollup.type === "array" && Array.isArray(rollup.array)) {
        return rollup.array
          .map((item) => getPropertyValue(item))
          .filter((value) => value !== null && value !== undefined && String(value).trim())
          .join(", ");
      }
      return null;
    }
    default:
      return null;
  }
}

function buildPreview(properties) {
  const preview = {};
  for (const [key, prop] of Object.entries(properties || {})) {
    if (Object.keys(preview).length >= 8) break;
    const value = getPropertyValue(prop);
    if (value !== null && value !== undefined && String(value).trim()) {
      preview[key] = String(value);
    }
  }
  return preview;
}

function buildItem(result) {
  if (result?.object === "page") {
    return {
      id: result.id || "",
      title: getPageTitle(result),
      url: result.url,
      preview: buildPreview(result.properties),
      source: "notion",
    };
  }
  if (result?.object === "database") {
    return {
      id: result.id || "",
      title: getDatabaseTitle(result),
      url: result.url,
      preview: { Type: "Database", ...buildPreview(result.properties) },
      source: "notion",
    };
  }
  return null;
}

function scoreMatch(query, title) {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTitle = title.trim().toLowerCase();
  if (!normalizedQuery || !normalizedTitle) return 0;
  if (normalizedQuery === normalizedTitle) return 1;
  if (normalizedTitle.includes(normalizedQuery)) return 0.8;
  if (normalizedQuery.includes(normalizedTitle)) return 0.6;
  return 0.4;
}

function findTitlePropertyKey(properties) {
  for (const [key, prop] of Object.entries(properties || {})) {
    if (prop && typeof prop === "object" && prop.type === "title") return key;
  }
  return null;
}

function hasFields(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function appendQueryParam(params, key, value) {
  if (value !== undefined && value !== true && value !== "") params.set(key, String(value));
}

async function search(args) {
  const options = parseOptions(args);
  const body = readPayload(options);
  if (options.query || options.q) body.query = options.query || options.q;
  if (options.filter) body.filter = { property: "object", value: options.filter };
  if (options["filter-json"]) body.filter = parseJson(options["filter-json"], "--filter-json");
  if (options["sort-json"]) body.sort = parseJson(options["sort-json"], "--sort-json");
  if (options["sort-by"]) {
    body.sort = {
      timestamp: options["sort-by"],
      direction: options["sort-direction"] || "descending",
    };
  }
  body.page_size = pageSize(options.limit || options["page-size"]);
  if (options["start-cursor"]) body.start_cursor = options["start-cursor"];

  const data = await notion("/search", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const items = (data.results || []).map(buildItem).filter(Boolean);
  outputSuccess({ ...data, items }, { renderType: "notion_items", source: "notion" });
}

async function getPage(args) {
  const pageId = normalizeNotionId(args[0]);
  outputSuccess(await notion(`/pages/${encodeURIComponent(pageId)}`));
}

async function createPage(args) {
  const options = parseOptions(args);
  const body = readPayload(options);
  if (options["parent-json"]) body.parent = parseJson(options["parent-json"], "--parent-json");
  if (options["database-id"]) body.parent = { database_id: normalizeNotionId(options["database-id"]) };
  if (options["page-id"]) body.parent = { page_id: normalizeNotionId(options["page-id"]) };
  if (options["properties-json"]) body.properties = parseJson(options["properties-json"], "--properties-json");
  if (options["children-json"]) body.children = parseJson(options["children-json"], "--children-json");
  if (options["icon-json"]) body.icon = parseJson(options["icon-json"], "--icon-json");
  if (options["cover-json"]) body.cover = parseJson(options["cover-json"], "--cover-json");
  if (!body.parent) throw new Error("Missing parent. Use --database-id, --page-id, --parent-json, or --json-file.");
  if (!hasFields(body.properties) && !hasItems(body.children)) {
    throw new Error("Create page requires properties or children.");
  }
  if (body.parent.database_id) body.parent.database_id = normalizeNotionId(body.parent.database_id);
  if (body.parent.page_id) body.parent.page_id = normalizeNotionId(body.parent.page_id);
  if (body.parent.database_id && body.properties) {
    const database = await notion(`/databases/${encodeURIComponent(body.parent.database_id)}`);
    const databaseProperties = database.properties || {};
    const unknownProperties = Object.keys(body.properties).filter((key) => !(key in databaseProperties));
    if (unknownProperties.length) {
      throw new Error(`Unknown database properties: ${unknownProperties.join(", ")}`);
    }
    const titlePropertyKey = findTitlePropertyKey(databaseProperties);
    if (titlePropertyKey && !(titlePropertyKey in body.properties)) {
      throw new Error(`Missing required title property "${titlePropertyKey}".`);
    }
  }
  outputSuccess(await notion("/pages", { method: "POST", body: JSON.stringify(body) }));
}

async function updatePage(args) {
  const pageId = normalizeNotionId(args[0]);
  const options = parseOptions(args.slice(1));
  const body = readPayload(options);
  if (options["properties-json"]) body.properties = parseJson(options["properties-json"], "--properties-json");
  if (options["icon-json"]) body.icon = parseJson(options["icon-json"], "--icon-json");
  if (options["cover-json"]) body.cover = parseJson(options["cover-json"], "--cover-json");
  if (options.archived !== undefined) body.archived = options.archived === true || options.archived === "true";
  if (!hasFields(body)) throw new Error("No update fields provided.");
  outputSuccess(await notion(`/pages/${encodeURIComponent(pageId)}`, { method: "PATCH", body: JSON.stringify(body) }));
}

async function archivePage(args) {
  const pageId = normalizeNotionId(args[0]);
  outputSuccess(await notion(`/pages/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
  }));
}

async function getDatabase(args) {
  const databaseId = normalizeNotionId(args[0]);
  outputSuccess(await notion(`/databases/${encodeURIComponent(databaseId)}`));
}

async function queryDatabase(args) {
  const databaseId = normalizeNotionId(args[0]);
  const options = parseOptions(args.slice(1));
  const body = readPayload(options);
  if (options["filter-json"]) body.filter = parseJson(options["filter-json"], "--filter-json");
  if (options["sorts-json"]) body.sorts = parseJson(options["sorts-json"], "--sorts-json");
  body.page_size = pageSize(options.limit || options["page-size"]);
  if (options["start-cursor"]) body.start_cursor = options["start-cursor"];
  const data = await notion(`/databases/${encodeURIComponent(databaseId)}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const items = (data.results || []).map(buildItem).filter(Boolean);
  outputSuccess({ ...data, items }, { renderType: "notion_items", source: "notion" });
}

async function createDatabase(args) {
  const options = parseOptions(args);
  const body = readPayload(options);
  if (options["parent-json"]) body.parent = parseJson(options["parent-json"], "--parent-json");
  if (options["page-id"]) body.parent = { page_id: normalizeNotionId(options["page-id"]) };
  if (options.title) body.title = richTextFromPlain(options.title);
  if (options["title-json"]) body.title = parseJson(options["title-json"], "--title-json");
  if (options["properties-json"]) body.properties = parseJson(options["properties-json"], "--properties-json");
  if (!body.parent) throw new Error("Create database requires parent.");
  if (!hasItems(body.title)) throw new Error("Create database requires title.");
  if (!hasFields(body.properties)) throw new Error("Create database requires properties.");
  if (body.parent.page_id) body.parent.page_id = normalizeNotionId(body.parent.page_id);
  outputSuccess(await notion("/databases", { method: "POST", body: JSON.stringify(body) }));
}

async function updateDatabase(args) {
  const databaseId = normalizeNotionId(args[0]);
  const options = parseOptions(args.slice(1));
  const body = readPayload(options);
  if (options.title) body.title = richTextFromPlain(options.title);
  if (options["title-json"]) body.title = parseJson(options["title-json"], "--title-json");
  if (options["description-json"]) body.description = parseJson(options["description-json"], "--description-json");
  if (options["properties-json"]) body.properties = parseJson(options["properties-json"], "--properties-json");
  if (!hasFields(body)) throw new Error("No update fields provided.");
  outputSuccess(await notion(`/databases/${encodeURIComponent(databaseId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }));
}

async function listBlockChildren(args) {
  const blockId = normalizeNotionId(args[0]);
  const options = parseOptions(args.slice(1));
  const params = new URLSearchParams();
  appendQueryParam(params, "page_size", pageSize(options.limit || options["page-size"]));
  appendQueryParam(params, "start_cursor", options["start-cursor"]);
  outputSuccess(await notion(`/blocks/${encodeURIComponent(blockId)}/children?${params.toString()}`));
}

async function appendBlockChildren(args) {
  const blockId = normalizeNotionId(args[0]);
  const options = parseOptions(args.slice(1));
  const body = readPayload(options);
  if (options["children-json"]) body.children = parseJson(options["children-json"], "--children-json");
  if (!hasItems(body.children)) throw new Error("Append block children requires children.");
  outputSuccess(await notion(`/blocks/${encodeURIComponent(blockId)}/children`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }));
}

async function updateBlock(args) {
  const blockId = normalizeNotionId(args[0]);
  const options = parseOptions(args.slice(1));
  const body = readPayload(options);
  if (options.archived !== undefined) body.archived = options.archived === true || options.archived === "true";
  if (!hasFields(body)) throw new Error("No update fields provided.");
  outputSuccess(await notion(`/blocks/${encodeURIComponent(blockId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }));
}

async function archiveBlock(args) {
  const blockId = normalizeNotionId(args[0]);
  outputSuccess(await notion(`/blocks/${encodeURIComponent(blockId)}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
  }));
}

async function createComment(args) {
  const options = parseOptions(args);
  const body = readPayload(options);
  if (options["parent-json"]) body.parent = parseJson(options["parent-json"], "--parent-json");
  if (options["page-id"]) body.parent = { page_id: normalizeNotionId(options["page-id"]) };
  if (options["discussion-id"]) body.discussion_id = options["discussion-id"];
  if (options.text) body.rich_text = richTextFromPlain(options.text);
  if (options["rich-text-json"]) body.rich_text = parseJson(options["rich-text-json"], "--rich-text-json");
  if (!body.parent && !body.discussion_id) throw new Error("Create comment requires parent or discussion_id.");
  if (!hasItems(body.rich_text)) throw new Error("Create comment requires rich_text or --text.");
  outputSuccess(await notion("/comments", { method: "POST", body: JSON.stringify(body) }));
}

async function listComments(args) {
  const options = parseOptions(args);
  const blockId = options["block-id"] || args[0];
  if (!blockId) throw new Error("List comments requires <blockId> or --block-id.");
  const params = new URLSearchParams();
  appendQueryParam(params, "block_id", normalizeNotionId(blockId));
  appendQueryParam(params, "page_size", pageSize(options.limit || options["page-size"]));
  appendQueryParam(params, "start_cursor", options["start-cursor"]);
  outputSuccess(await notion(`/comments?${params.toString()}`));
}

async function listUsers(args) {
  const options = parseOptions(args);
  const params = new URLSearchParams();
  appendQueryParam(params, "page_size", pageSize(options.limit || options["page-size"]));
  appendQueryParam(params, "start_cursor", options["start-cursor"]);
  outputSuccess(await notion(`/users?${params.toString()}`));
}

async function getUser(args) {
  const userId = args[0];
  if (!userId) throw new Error("Get user requires <userId>.");
  outputSuccess(await notion(`/users/${encodeURIComponent(userId)}`));
}

async function resolveObject(args, objectType) {
  const options = parseOptions(args);
  const query = options.query || options.q || args[0];
  if (!query) throw new Error(`Resolve ${objectType} requires a query.`);
  const data = await notion("/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      page_size: pageSize(options.limit || options["page-size"]),
      filter: { property: "object", value: objectType },
      sort: options["sort-by"]
        ? { timestamp: options["sort-by"], direction: options["sort-direction"] || "descending" }
        : undefined,
    }),
  });
  const items = (data.results || []).map(buildItem).filter(Boolean);
  const ranked = items
    .map((item) => ({ ...item, score: scoreMatch(query, item.title) }))
    .sort((a, b) => b.score - a.score);
  outputSuccess({
    query,
    best: ranked[0] || null,
    items: ranked,
    has_more: data.has_more,
    next_cursor: data.next_cursor,
  });
}

async function queryDatabaseSummary(args) {
  const databaseId = normalizeNotionId(args[0]);
  const options = parseOptions(args.slice(1));
  const summary = parseJson(options["summary-json"], "--summary-json") || parseJsonFile(options["summary-file"]);
  if (!summary || !Array.isArray(summary.metrics) || summary.metrics.length === 0) {
    throw new Error("Summary requires --summary-json or --summary-file with metrics.");
  }
  const rows = [];
  let cursor = options["start-cursor"];
  let hasMore = true;
  const limit = maxItems(options["max-items"], SUMMARY_MAX_ITEMS, SUMMARY_MAX_ITEMS);
  while (hasMore && rows.length < limit) {
    const body = readPayload(options);
    if (options["filter-json"]) body.filter = parseJson(options["filter-json"], "--filter-json");
    if (options["sorts-json"]) body.sorts = parseJson(options["sorts-json"], "--sorts-json");
    body.page_size = pageSize(options.limit || options["page-size"], 100);
    if (cursor) body.start_cursor = cursor;
    const data = await notion(`/databases/${encodeURIComponent(databaseId)}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    rows.push(...(data.results || []));
    hasMore = !!data.has_more && !!data.next_cursor;
    cursor = data.next_cursor;
  }
  outputSuccess({
    summary: applySummaryMetrics(rows.slice(0, limit), summary),
    totalRows: Math.min(rows.length, limit),
  });
}

function valuesForField(rows, field) {
  return rows.map((row) => getPropertyValue(row?.properties?.[field])).filter((value) => value !== null);
}

function numericValuesForField(rows, field) {
  return valuesForField(rows, field).filter((value) => typeof value === "number");
}

function applySummaryMetrics(rows, summary) {
  const aggregates = {};
  for (const metric of summary.metrics) {
    if (!metric || typeof metric !== "object") continue;
    if (metric.op === "count") {
      const key = metric.field ? `count:${metric.field}` : "count";
      aggregates[key] = rows.length;
      continue;
    }
    if (!metric.field) continue;
    const percentileKey = metric.op === "percentile" ? `:${metric.percentile ?? 0}` : "";
    const key = `${metric.op}:${metric.field}${percentileKey}`;
    if (metric.op === "distinct_count") {
      aggregates[key] = new Set(valuesForField(rows, metric.field).map((value) => String(value))).size;
      continue;
    }
    const values = numericValuesForField(rows, metric.field);
    if (values.length === 0) {
      aggregates[key] = null;
      continue;
    }
    if (metric.op === "sum") aggregates[key] = values.reduce((sum, value) => sum + value, 0);
    if (metric.op === "avg") aggregates[key] = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (metric.op === "min") aggregates[key] = Math.min(...values);
    if (metric.op === "max") aggregates[key] = Math.max(...values);
    if (metric.op === "median") {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      aggregates[key] = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }
    if (metric.op === "percentile") {
      const percentile = Number(metric.percentile || 0);
      const sorted = [...values].sort((a, b) => a - b);
      const index = (percentile / 100) * (sorted.length - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      aggregates[key] = lower === upper
        ? sorted[lower]
        : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
    }
  }
  const countsByGroup = {};
  if (summary.groupBy?.property) {
    const groupProp = summary.groupBy.property;
    rows.forEach((row) => {
      const value = getPropertyValue(row?.properties?.[groupProp]);
      const key = value ? String(value) : "Unspecified";
      countsByGroup[key] = (countsByGroup[key] || 0) + 1;
    });
  }
  return {
    aggregates,
    countsByGroup: summary.groupBy ? countsByGroup : undefined,
  };
}

function help() {
  console.log(`
Usage:
  node tools/notion/cli.js help
  node tools/notion/cli.js auth
  node tools/notion/cli.js search [--query text] [--filter page|database] [--limit 10]
  node tools/notion/cli.js get-page <pageIdOrUrl>
  node tools/notion/cli.js create-page --database-id <databaseId> --properties-json '{...}'
  node tools/notion/cli.js update-page <pageIdOrUrl> --properties-json '{...}'
  node tools/notion/cli.js archive-page <pageIdOrUrl>                 (alias: delete-page)
  node tools/notion/cli.js get-database <databaseIdOrUrl>
  node tools/notion/cli.js query-database <databaseIdOrUrl> [--filter-json '{...}'] [--sorts-json '[...]']
  node tools/notion/cli.js create-database --page-id <pageId> --title "Name" --properties-json '{...}'
  node tools/notion/cli.js update-database <databaseIdOrUrl> [--title "Name"] [--properties-json '{...}']
  node tools/notion/cli.js list-block-children <blockIdOrUrl>
  node tools/notion/cli.js append-block-children <blockIdOrUrl> --children-json '[...]'
  node tools/notion/cli.js update-block <blockIdOrUrl> --body-json '{...}'
  node tools/notion/cli.js archive-block <blockIdOrUrl>
  node tools/notion/cli.js create-comment --page-id <pageId> --text "Comment"
  node tools/notion/cli.js list-comments <blockIdOrUrl>
  node tools/notion/cli.js list-users [--limit 50]
  node tools/notion/cli.js get-user <userId>
  node tools/notion/cli.js resolve-database "database name"
  node tools/notion/cli.js resolve-page "page name"
  node tools/notion/cli.js query-database-summary <databaseIdOrUrl> --summary-json '{...}'

JSON input:
  --body-json '{...}'       Merge raw request body JSON.
  --json-file payload.json  Merge request body JSON from a file.

Setup:
  Add NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, and NOTION_CALLBACK_URL to the root .env file.
  Run auth, then select the Notion pages/databases this connection can access.
`);
}

const commands = {
  auth,
  search,
  "get-page": getPage,
  "create-page": createPage,
  "update-page": updatePage,
  "archive-page": archivePage,
  "delete-page": archivePage,
  "get-database": getDatabase,
  "query-database": queryDatabase,
  "create-database": createDatabase,
  "update-database": updateDatabase,
  "list-block-children": listBlockChildren,
  "append-block-children": appendBlockChildren,
  "update-block": updateBlock,
  "archive-block": archiveBlock,
  "create-comment": createComment,
  "list-comments": listComments,
  "list-users": listUsers,
  "get-user": getUser,
  "resolve-database": (args) => resolveObject(args, "database"),
  "resolve-page": (args) => resolveObject(args, "page"),
  "query-database-summary": queryDatabaseSummary,
};

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }
  if (!commands[command]) throw new Error(`Unknown command: ${command}`);
  await commands[command](args);
}

main().catch((err) => {
  printJson({
    success: false,
    error: err.message,
  });
  process.exit(1);
});
