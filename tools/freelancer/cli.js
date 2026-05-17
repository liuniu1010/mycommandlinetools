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
const DEFAULT_BASE_URL = "https://www.freelancer.com";
const AUTH_ENDPOINT = "https://accounts.freelancer.com/oauth/authorise";
const TOKEN_ENDPOINT = "https://accounts.freelancer.com/oauth/token";

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

function requireConfig(options = {}) {
  loadEnv();
  const config = {
    clientId: process.env.FREELANCER_CLIENT_ID,
    clientSecret: process.env.FREELANCER_CLIENT_SECRET,
    callbackUrl: process.env.FREELANCER_CALLBACK_URL || "http://localhost:3000/callback",
    scope: process.env.FREELANCER_SCOPE || "basic",
    advancedScopes: process.env.FREELANCER_ADVANCED_SCOPES || "",
    baseUrl: process.env.FREELANCER_BASE_URL || DEFAULT_BASE_URL,
  };

  const missing = [];
  if (!config.clientId) missing.push("FREELANCER_CLIENT_ID");
  if (!options.noSecret && !config.clientSecret) missing.push("FREELANCER_CLIENT_SECRET");
  if (missing.length) throw new Error(`Missing ${missing.join(", ")} in ${ENV_FILE}`);
  return config;
}

function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("No saved token. Run: npm run freelancer:auth");
  }
  return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
}

function writeToken(token, previous = {}, metadata = {}) {
  const expiresAt = token.expires_in
    ? Date.now() + Math.max(0, Number(token.expires_in) - 60) * 1000
    : null;
  const payload = {
    account_email: metadata.account_email || previous.account_email,
    account_name: metadata.account_name || previous.account_name,
    account_id: metadata.account_id || previous.account_id,
    access_token: token.access_token,
    refresh_token: token.refresh_token || previous.refresh_token,
    token_type: token.token_type || previous.token_type || "Bearer",
    expires_at: expiresAt,
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

async function getFreelancerProfile(accessToken, baseUrl = DEFAULT_BASE_URL) {
  const res = await fetch(new URL("/api/users/0.1/self/", baseUrl), {
    headers: {
      "Freelancer-OAuth-V1": accessToken,
      "User-Agent": "personal-toolset freelancer-cli",
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok || body.status === "error") {
    throw new Error(`Freelancer profile request failed (${res.status}): ${JSON.stringify(body)}`);
  }
  const user = body.result || body.user || body;
  return {
    account_email: user.email,
    account_name: user.display_name || user.public_name || user.username,
    account_id: user.id == null ? undefined : String(user.id),
  };
}

async function tryGetFreelancerProfile(accessToken, baseUrl) {
  try {
    return await getFreelancerProfile(accessToken, baseUrl);
  } catch (err) {
    console.warn(`Could not save Freelancer account metadata: ${err.message}`);
    return {};
  }
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
  if (token.access_token && (!token.expires_at || token.expires_at > Date.now())) {
    return token.access_token;
  }
  if (!token.refresh_token) {
    throw new Error("Saved token has expired and has no refresh token. Run: npm run freelancer:auth");
  }
  const refreshed = await requestToken({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: token.refresh_token,
  });
  const profile = await tryGetFreelancerProfile(refreshed.access_token, config.baseUrl);
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

async function auth(args) {
  const options = parseOptions(args);
  const config = requireConfig();

  if (options["client-credentials"]) {
    const token = await requestToken({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: config.scope,
    });
    writeToken(token, {}, { account_name: "client_credentials" });
    console.log(`Saved OAuth token to ${TOKEN_FILE}`);
    return;
  }

  const callback = new URL(config.callbackUrl);
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const authorizeUrl = new URL(AUTH_ENDPOINT);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.callbackUrl);
  authorizeUrl.searchParams.set("scope", config.scope);
  authorizeUrl.searchParams.set("prompt", "select_account consent");
  authorizeUrl.searchParams.set("state", state);
  if (config.advancedScopes) {
    authorizeUrl.searchParams.set("advanced_scopes", config.advancedScopes);
  }

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
        res.end(`Freelancer authorization failed: ${error}`);
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
      const profile = await tryGetFreelancerProfile(token.access_token, config.baseUrl);
      writeToken(token, {}, profile);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Freelancer CLI authorization complete. You can close this tab.");
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

async function apiGet(pathname, params = {}) {
  const config = requireConfig({ noSecret: true });
  const accessToken = await getAccessToken();
  const url = new URL(pathname, config.baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === false || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(`${key}[]`, item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, {
    headers: {
      "Freelancer-OAuth-V1": accessToken,
      "User-Agent": "personal-toolset freelancer-cli",
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok || body.status === "error") {
    throw new Error(`API request failed (${res.status}): ${JSON.stringify(body, null, 2)}`);
  }
  return body;
}

function projectUrl(project) {
  const seo = project.seo_url || project.url;
  if (seo && /^https?:\/\//.test(seo)) return seo;
  if (seo && seo.startsWith("/")) return `${DEFAULT_BASE_URL}${seo}`;
  if (seo) return `${DEFAULT_BASE_URL}/projects/${seo}`;
  return `${DEFAULT_BASE_URL}/projects/${project.id}`;
}

function formatBudget(project) {
  const budget = project.budget || {};
  const currency = budget.currency?.code || budget.currency?.sign || project.currency?.code || "";
  const min = budget.minimum ?? project.budget_minimum;
  const max = budget.maximum ?? project.budget_maximum;
  if (min != null && max != null) return `${min}-${max} ${currency}`.trim();
  if (min != null) return `${min}+ ${currency}`.trim();
  if (max != null) return `up to ${max} ${currency}`.trim();
  return "";
}

function printProjects(projects) {
  console.log(`Showing ${projects.length} project(s).\n`);
  projects.forEach((project, index) => {
    const jobs = (project.jobs || [])
      .map((job) => job.name)
      .filter(Boolean)
      .slice(0, 8)
      .join(", ");
    const budget = formatBudget(project);
    console.log(`${index + 1}. ${project.title || "(untitled project)"}`);
    console.log(`   id: ${project.id}`);
    if (project.submitdate) {
      console.log(`   posted: ${new Date(Number(project.submitdate) * 1000).toISOString()}`);
    }
    if (project.type || budget) console.log(`   terms: ${[project.type, budget].filter(Boolean).join(" | ")}`);
    if (project.bid_stats?.bid_count != null) console.log(`   bids: ${project.bid_stats.bid_count}`);
    if (jobs) console.log(`   skills: ${jobs}`);
    if (project.preview_description) console.log(`   preview: ${project.preview_description}`);
    console.log(`   url: ${projectUrl(project)}`);
    console.log("");
  });
}

async function search(args) {
  const options = parseOptions(args);
  const query = options._.join(" ").trim();
  if (!query) {
    throw new Error('Usage: node tools/freelancer/cli.js search "java spring" [--limit 20] [--offset 0]');
  }

  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 100);
  const offset = Math.max(Number(options.offset || 0), 0);
  const body = await apiGet("/api/projects/0.1/projects/active/", {
    query,
    limit,
    offset,
    sort_field: options.sort || "time_updated",
    compact: options.compact === true ? true : "",
    full_description: options["full-description"] === true,
    job_details: true,
    user_details: options["user-details"] === true,
    location_details: options["location-details"] === true,
  });
  printProjects(body.result?.projects || body.projects || body.result || []);
}

async function project(args) {
  const id = args[0];
  if (!id) throw new Error("Usage: node tools/freelancer/cli.js project <projectId>");
  const body = await apiGet(`/api/projects/0.1/projects/${encodeURIComponent(id)}/`, {
    full_description: true,
    job_details: true,
    user_details: true,
    location_details: true,
  });
  console.log(JSON.stringify(body.result || body, null, 2));
}

function openProject(args) {
  const id = args[0];
  if (!id) throw new Error("Usage: node tools/freelancer/cli.js open <projectId-or-url>");
  const url = /^https?:\/\//.test(id) ? id : `${DEFAULT_BASE_URL}/projects/${id}`;
  console.log(url);
  openBrowser(url);
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
  npm run freelancer:auth
  node tools/freelancer/cli.js auth --client-credentials
  npm run freelancer:search -- "keywords" [--limit 10] [--offset 0] [--sort time_updated]
  node tools/freelancer/cli.js project <projectId>
  node tools/freelancer/cli.js open <projectId-or-url>

Examples:
  npm run freelancer:auth
  npm run freelancer:search -- "java spring boot" --limit 20
  node tools/freelancer/cli.js project 123456789
  node tools/freelancer/cli.js open 123456789
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }
  if (command === "auth") return auth(args);
  if (command === "search") return search(args);
  if (command === "project") return project(args);
  if (command === "open") return openProject(args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
