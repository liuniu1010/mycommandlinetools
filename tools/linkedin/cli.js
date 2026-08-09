#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const TOOL_DIR = __dirname;
const ENV_FILE = path.join(ROOT, ".env");
const TOKEN_FILE = path.join(TOOL_DIR, ".token.json");
const JOBS_SEARCH_URL = "https://www.linkedin.com/jobs/search/";
const DEVELOPER_APPS_URL = "https://www.linkedin.com/developers/apps";
const AUTH_ENDPOINT = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_ENDPOINT = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_ENDPOINT = "https://api.linkedin.com/v2/userinfo";
const POSTS_ENDPOINT = "https://api.linkedin.com/rest/posts";
const IMAGES_ENDPOINT = "https://api.linkedin.com/rest/images?action=initializeUpload";
const DEFAULT_SCOPES = "openid profile email w_member_social";
const DEFAULT_API_VERSION = "202607";
const MEMBER_POST_SCOPE = "w_member_social";

const IMAGE_CONTENT_TYPES = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

const DATE_POSTED = {
  day: "r86400",
  week: "r604800",
  month: "r2592000",
};

const WORKPLACE_TYPE = {
  onsite: "1",
  "on-site": "1",
  remote: "2",
  hybrid: "3",
};

const JOB_TYPE = {
  fulltime: "F",
  "full-time": "F",
  parttime: "P",
  "part-time": "P",
  contract: "C",
  temporary: "T",
  internship: "I",
  volunteer: "V",
  other: "O",
};

const EXPERIENCE_LEVEL = {
  internship: "1",
  entry: "2",
  associate: "3",
  mid: "4",
  senior: "4",
  director: "5",
  executive: "6",
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
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    callbackUrl: process.env.LINKEDIN_CALLBACK_URL,
    scopes: process.env.LINKEDIN_SCOPES || DEFAULT_SCOPES,
    apiVersion: process.env.LINKEDIN_API_VERSION || DEFAULT_API_VERSION,
  };
  const missing = [];
  if (!config.clientId) missing.push("LINKEDIN_CLIENT_ID");
  if (!config.clientSecret) missing.push("LINKEDIN_CLIENT_SECRET");
  if (!config.callbackUrl) missing.push("LINKEDIN_CALLBACK_URL");
  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")} in ${ENV_FILE}`);
  }
  try {
    new URL(config.callbackUrl);
  } catch {
    throw new Error("LINKEDIN_CALLBACK_URL must be an absolute URL");
  }
  if (!config.scopes.trim()) {
    throw new Error("LINKEDIN_SCOPES must contain at least one approved scope");
  }
  if (!/^\d{6}$/.test(config.apiVersion)) {
    throw new Error("LINKEDIN_API_VERSION must use YYYYMM format");
  }
  return config;
}

function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("No saved token. Run: node tools/linkedin/cli.js auth");
  }
  return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
}

function writeToken(token, previous = {}, metadata = {}) {
  const expiresIn = Number(token.expires_in || 0);
  const expiresAt = expiresIn > 0
    ? Date.now() + Math.max(0, expiresIn - 60) * 1000
    : previous.expires_at;
  const payload = {
    account_id: metadata.account_id || previous.account_id,
    account_name: metadata.account_name || previous.account_name,
    account_email: metadata.account_email || previous.account_email,
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

async function getLinkedInProfile(accessToken) {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`LinkedIn profile request failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

function profileMetadata(profile) {
  return {
    account_id: profile.sub,
    account_name: profile.name,
    account_email: profile.email,
  };
}

async function tryGetLinkedInProfile(accessToken) {
  try {
    return profileMetadata(await getLinkedInProfile(accessToken));
  } catch (err) {
    console.warn(`Could not save LinkedIn account metadata: ${err.message}`);
    return {};
  }
}

function tokenScopes(token) {
  return String(token.scope || "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function requireTokenScope(token, scope) {
  if (!scope || tokenScopes(token).includes(scope)) return;
  throw new Error(
    `Saved token does not include ${scope}. Enable the LinkedIn product, add the scope to ` +
      "LINKEDIN_SCOPES, and run auth again."
  );
}

async function getAuthContext(requiredScope) {
  const config = requireConfig();
  let token = readToken();
  if (token.access_token && (!token.expires_at || token.expires_at > Date.now())) {
    requireTokenScope(token, requiredScope);
    return { accessToken: token.access_token, config, token };
  }
  if (!token.refresh_token) {
    throw new Error("LinkedIn token expired. Run: node tools/linkedin/cli.js auth");
  }
  const refreshed = await requestToken({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: token.refresh_token,
  });
  const metadata = await tryGetLinkedInProfile(refreshed.access_token);
  writeToken(refreshed, token, metadata);
  token = readToken();
  requireTokenScope(token, requiredScope);
  return { accessToken: token.access_token, config, token };
}

async function getAccessToken() {
  return (await getAuthContext()).accessToken;
}

function openBrowser(url) {
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(opener, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function parseCallbackResponse(value, config, state) {
  if (!value) throw new Error("No callback URL was provided");
  let callbackResponse;
  try {
    callbackResponse = new URL(value);
  } catch {
    throw new Error("Paste the complete callback URL, including the code and state parameters");
  }
  const configuredCallback = new URL(config.callbackUrl);
  if (
    callbackResponse.origin !== configuredCallback.origin ||
    callbackResponse.pathname !== configuredCallback.pathname
  ) {
    throw new Error("Callback URL does not match LINKEDIN_CALLBACK_URL");
  }
  if (callbackResponse.searchParams.get("state") !== state) {
    throw new Error("OAuth state mismatch");
  }
  const error = callbackResponse.searchParams.get("error");
  if (error) {
    const description = callbackResponse.searchParams.get("error_description");
    throw new Error(`LinkedIn authorization failed: ${description || error}`);
  }
  const code = callbackResponse.searchParams.get("code");
  if (!code) throw new Error("Missing authorization code in callback URL");
  return code;
}

async function auth() {
  const config = requireConfig();
  const state = crypto.randomBytes(32).toString("hex");
  const authorizeUrl = new URL(AUTH_ENDPOINT);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.callbackUrl);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", config.scopes.trim().split(/\s+/).join(" "));

  console.log("Open this URL in your browser and approve access:");
  console.log(authorizeUrl.toString());
  console.log("");
  console.log("After LinkedIn redirects, copy the complete URL from the browser address bar.");
  openBrowser(authorizeUrl.toString());

  const callbackResponse = await prompt("Callback URL: ");
  const code = parseCallbackResponse(callbackResponse, config, state);
  const token = await requestToken({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.callbackUrl,
  });
  if (!token.scope) token.scope = config.scopes;
  const metadata = await tryGetLinkedInProfile(token.access_token);
  writeToken(token, {}, metadata);
  console.log(`Saved OAuth token to ${TOKEN_FILE}`);
}

async function profile() {
  const accessToken = await getAccessToken();
  const body = await getLinkedInProfile(accessToken);
  console.log(JSON.stringify(body, null, 2));
}

function authStatus() {
  loadEnv();
  if (!fs.existsSync(TOKEN_FILE)) {
    console.log(JSON.stringify({ authenticated: false, token_file: TOKEN_FILE }, null, 2));
    return;
  }
  const token = readToken();
  const expiresAt = Number(token.expires_at || 0);
  console.log(JSON.stringify({
    authenticated: Boolean(token.access_token),
    account_id: token.account_id,
    account_name: token.account_name,
    account_email: token.account_email,
    scopes: tokenScopes(token),
    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    expired: expiresAt ? expiresAt <= Date.now() : null,
    refresh_token_available: Boolean(token.refresh_token),
    api_version: process.env.LINKEDIN_API_VERSION || DEFAULT_API_VERSION,
  }, null, 2));
}

function requiredText(value, optionName) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`Missing required --${optionName} value`);
  return text;
}

function httpUrl(value, optionName) {
  let url;
  try {
    url = new URL(requiredText(value, optionName));
  } catch {
    throw new Error(`--${optionName} must be an absolute HTTP or HTTPS URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`--${optionName} must be an absolute HTTP or HTTPS URL`);
  }
  return url.toString();
}

function publicationAccount() {
  const token = readToken();
  return token.account_name || token.account_email || token.account_id || "authenticated member";
}

async function confirmPublication(details) {
  console.log("LinkedIn publication preview:");
  console.log(`  Account: ${publicationAccount()}`);
  for (const [label, value] of Object.entries(details)) {
    if (value) console.log(`  ${label}: ${value}`);
  }
  const answer = await prompt('Type "publish" to confirm: ');
  if (answer.toLowerCase() === "publish") return true;
  console.log("Publication cancelled.");
  return false;
}

async function linkedInApiRequest(url, context, options = {}) {
  const headers = {
    Authorization: `Bearer ${context.accessToken}`,
    "Linkedin-Version": context.config.apiVersion,
    "X-Restli-Protocol-Version": "2.0.0",
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!res.ok) {
    throw new Error(`LinkedIn API request failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return { body, headers: res.headers, status: res.status };
}

async function memberUrn(context) {
  let accountId = context.token.account_id;
  if (!accountId) {
    const metadata = profileMetadata(await getLinkedInProfile(context.accessToken));
    accountId = metadata.account_id;
    writeToken(context.token, context.token, metadata);
  }
  if (!accountId) throw new Error("LinkedIn profile did not return a member identifier");
  return accountId.startsWith("urn:li:person:") ? accountId : `urn:li:person:${accountId}`;
}

function postBody(author, commentary, content) {
  const body = {
    author,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (content) body.content = content;
  return body;
}

async function createPost(commentary, content) {
  const context = await getAuthContext(MEMBER_POST_SCOPE);
  const author = await memberUrn(context);
  const result = await linkedInApiRequest(POSTS_ENDPOINT, context, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postBody(author, commentary, content)),
  });
  const postId = result.headers.get("x-restli-id");
  console.log(postId ? `Published LinkedIn post: ${postId}` : "Published LinkedIn post.");
}

async function postText(args) {
  const options = parseOptions(args);
  const text = requiredText(options.text, "text");
  if (!await confirmPublication({ Type: "Text post", Text: text })) return;
  await createPost(text);
}

async function postLink(args) {
  const options = parseOptions(args);
  const text = requiredText(options.text, "text");
  const source = httpUrl(options.url, "url");
  const title = String(options.title || source).trim();
  const description = String(options.description || "").trim();
  if (!await confirmPublication({
    Type: "Link post",
    Text: text,
    URL: source,
    Title: title,
    Description: description,
  })) return;
  const article = { source, title };
  if (description) article.description = description;
  await createPost(text, { article });
}

function imageFile(value) {
  const file = path.resolve(requiredText(value, "file"));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Image file not found: ${file}`);
  }
  const contentType = IMAGE_CONTENT_TYPES[path.extname(file).toLowerCase()];
  if (!contentType) throw new Error("Image must be a JPG, JPEG, PNG, or GIF file");
  return { contentType, file };
}

async function initializeImageUpload(context, owner) {
  const result = await linkedInApiRequest(IMAGES_ENDPOINT, context, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  const value = result.body && result.body.value;
  if (!value || !value.uploadUrl || !value.image) {
    throw new Error("LinkedIn did not return an image upload URL and image identifier");
  }
  return value;
}

async function uploadImage(uploadUrl, image, accessToken) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": image.contentType,
    },
    body: fs.readFileSync(image.file),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn image upload failed (${res.status}): ${text}`);
  }
}

async function postImage(args) {
  const options = parseOptions(args);
  const text = requiredText(options.text, "text");
  const image = imageFile(options.file);
  const altText = String(options.alt || "").trim();
  if (!await confirmPublication({
    Type: "Image post",
    Text: text,
    Image: image.file,
    "Alt text": altText,
  })) return;
  const context = await getAuthContext(MEMBER_POST_SCOPE);
  const author = await memberUrn(context);
  const upload = await initializeImageUpload(context, author);
  await uploadImage(upload.uploadUrl, image, context.accessToken);
  const media = { id: upload.image };
  if (altText) media.altText = altText;
  const result = await linkedInApiRequest(POSTS_ENDPOINT, context, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postBody(author, text, { media })),
  });
  const postId = result.headers.get("x-restli-id");
  console.log(postId ? `Published LinkedIn image post: ${postId}` : "Published LinkedIn image post.");
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

function csvCodes(value, map, optionName) {
  if (!value) return "";
  return String(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => {
      if (!map[item]) throw new Error(`Unsupported --${optionName} value: ${item}`);
      return map[item];
    })
    .join(",");
}

function searchUrl(options) {
  const keywords = options._.join(" ").trim();
  if (!keywords) {
    throw new Error('Usage: node tools/linkedin/cli.js search "java spring" [--location Auckland] [--open]');
  }

  const url = new URL(JOBS_SEARCH_URL);
  url.searchParams.set("keywords", keywords);
  if (options.location) url.searchParams.set("location", options.location);
  if (options.start) url.searchParams.set("start", String(Math.max(Number(options.start), 0)));
  if (options.date) {
    const value = String(options.date).toLowerCase();
    if (!DATE_POSTED[value]) throw new Error(`Unsupported --date value: ${value}`);
    url.searchParams.set("f_TPR", DATE_POSTED[value]);
  }
  const workplace = csvCodes(options.workplace || options.remote, WORKPLACE_TYPE, "workplace");
  if (workplace) url.searchParams.set("f_WT", workplace);
  const jobType = csvCodes(options.type, JOB_TYPE, "type");
  if (jobType) url.searchParams.set("f_JT", jobType);
  const experience = csvCodes(options.experience, EXPERIENCE_LEVEL, "experience");
  if (experience) url.searchParams.set("f_E", experience);
  return url.toString();
}

function search(args) {
  const options = parseOptions(args);
  const url = searchUrl(options);
  console.log(url);
  if (options.open || options.o) openBrowser(url);
}

function openDeveloperApps() {
  console.log(DEVELOPER_APPS_URL);
  openBrowser(DEVELOPER_APPS_URL);
}

function help() {
  console.log(`
Usage:
  node tools/linkedin/cli.js auth
  node tools/linkedin/cli.js auth-status
  node tools/linkedin/cli.js profile
  node tools/linkedin/cli.js post-text --text "Update text"
  node tools/linkedin/cli.js post-link --text "Update text" --url "https://example.com" [--title "Title"] [--description "Description"]
  node tools/linkedin/cli.js post-image --text "Update text" --file image.png [--alt "Alt text"]
  node tools/linkedin/cli.js search "keywords" [--location "Auckland, New Zealand"] [--open]
  node tools/linkedin/cli.js search "keywords" [--date day|week|month]
  node tools/linkedin/cli.js search "keywords" [--workplace remote|hybrid|onsite]
  node tools/linkedin/cli.js search "keywords" [--type full-time|part-time|contract|temporary|internship|volunteer|other]
  node tools/linkedin/cli.js search "keywords" [--experience entry|associate|mid|senior|director|executive]
  node tools/linkedin/cli.js developer

Examples:
  node tools/linkedin/cli.js post-text --text "Sharing a project update"
  node tools/linkedin/cli.js post-link --text "Worth reading" --url "https://example.com" --title "Example article"
  node tools/linkedin/cli.js post-image --text "Project screenshot" --file screenshot.png --alt "Project dashboard"
  node tools/linkedin/cli.js search "java spring boot" --location "Auckland, New Zealand" --date week --open
  node tools/linkedin/cli.js search "ai agent" --workplace remote,hybrid --type contract --experience senior

Notes:
  Publishing requires the Share on LinkedIn product and w_member_social scope.
  Every publishing command previews the content and requires confirmation.
  Job search remains URL-based. This tool does not scrape LinkedIn, automate your
  account, or call restricted LinkedIn Talent APIs.
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }
  if (command === "auth") return auth();
  if (command === "auth-status") return authStatus();
  if (command === "profile") return profile();
  if (command === "post-text") return postText(args);
  if (command === "post-link") return postLink(args);
  if (command === "post-image") return postImage(args);
  if (command === "search") return search(args);
  if (command === "developer") return openDeveloperApps();
  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
