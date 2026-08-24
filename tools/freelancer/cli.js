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
    throw new Error("No saved token. Run: node tools/freelancer/cli.js auth");
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
    throw new Error("Saved token has expired and has no refresh token. Run: node tools/freelancer/cli.js auth");
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

async function apiPost(pathname, body) {
  const config = requireConfig({ noSecret: true });
  const accessToken = await getAccessToken();
  const url = new URL(pathname, config.baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Freelancer-OAuth-V1": accessToken,
      "User-Agent": "personal-toolset freelancer-cli",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok || parsed.status === "error") {
    throw new Error(`API request failed (${res.status}): ${JSON.stringify(parsed, null, 2)}`);
  }
  return parsed;
}

async function apiPut(pathname, body, params = {}) {
  const config = requireConfig({ noSecret: true });
  const accessToken = await getAccessToken();
  const url = new URL(pathname, config.baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === false || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const headers = {
    "Freelancer-OAuth-V1": accessToken,
    "User-Agent": "personal-toolset freelancer-cli",
  };
  const request = { method: "PUT", headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(body);
  }
  const res = await fetch(url, {
    ...request,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok || parsed.status === "error") {
    throw new Error(`API request failed (${res.status}): ${JSON.stringify(parsed, null, 2)}`);
  }
  return parsed;
}

async function apiDelete(pathname, body) {
  const config = requireConfig({ noSecret: true });
  const accessToken = await getAccessToken();
  const url = new URL(pathname, config.baseUrl);
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      "Freelancer-OAuth-V1": accessToken,
      "User-Agent": "personal-toolset freelancer-cli",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok || parsed.status === "error") {
    throw new Error(`API request failed (${res.status}): ${JSON.stringify(parsed, null, 2)}`);
  }
  return parsed;
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

async function apiPublicGet(pathname, params = {}) {
  loadEnv();
  const baseUrl = process.env.FREELANCER_BASE_URL || DEFAULT_BASE_URL;
  const url = new URL(pathname, baseUrl);
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
    throw new Error(`Public API request failed (${res.status}): ${JSON.stringify(body, null, 2)}`);
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

function printServices(services) {
  console.log(`Showing ${services.length} service(s).\n`);
  services.forEach((service, index) => {
    const currency = service.currency?.code || "";
    console.log(`${index + 1}. ${service.title || "(untitled service)"}`);
    console.log(`   id: ${service.id}`);
    if (service.status || service.sub_status) {
      console.log(`   status: ${[service.status, service.sub_status].filter(Boolean).join(" | ")}`);
    }
    if (service.create_date) {
      console.log(`   created: ${new Date(Number(service.create_date) * 1000).toISOString()}`);
    }
    const price = service.price ?? service.base_cost;
    const durationSeconds = service.duration == null ? null : Number(service.duration);
    const duration = durationSeconds == null
      ? service.base_duration == null ? "" : `${service.base_duration} day(s)`
      : durationSeconds % 86400 === 0
        ? `${durationSeconds / 86400} day(s)`
        : `${durationSeconds} second(s)`;
    if (price != null) {
      console.log(`   price: ${`${price} ${currency}`.trim()}`);
    }
    if (duration) console.log(`   delivery: ${duration}`);
    const jobs = (service.jobs || []).map((job) => job.name).filter(Boolean).slice(0, 8).join(", ");
    if (jobs) console.log(`   skills: ${jobs}`);
    if (service.description) {
      console.log(`   preview: ${String(service.description).replace(/\s+/g, " ").trim().slice(0, 180)}`);
    }
    const seoUrl = String(service.seo_url || "").replace(/^\/+/, "");
    const url = seoUrl
      ? `${DEFAULT_BASE_URL}/service/${seoUrl}`
      : `${DEFAULT_BASE_URL}/services/${service.id}`;
    console.log(`   url: ${url}`);
    console.log("");
  });
}

function printServiceOrders(projects) {
  console.log(`Showing ${projects.length} service order(s).\n`);
  projects.forEach((project, index) => {
    const customer = project.owner_info || {};
    const customerName =
      customer.display_name || customer.public_name || customer.username || project.owner_id;
    const status = project.frontend_project_status || project.status || project.sub_status;
    const submitted = project.submitdate || project.time_submitted;
    const budget = formatBudget(project);

    console.log(`${index + 1}. ${project.title || "(untitled service order)"}`);
    console.log(`   project id: ${project.id}`);
    console.log(`   service offering id: ${project.service_offering_id}`);
    if (customerName) console.log(`   customer: ${customerName}`);
    if (status) console.log(`   status: ${status}`);
    if (submitted) {
      console.log(`   purchased: ${new Date(Number(submitted) * 1000).toISOString()}`);
    }
    if (project.time_updated) {
      console.log(`   updated: ${new Date(Number(project.time_updated) * 1000).toISOString()}`);
    }
    if (project.type || budget) {
      console.log(`   terms: ${[project.type, budget].filter(Boolean).join(" | ")}`);
    }
    console.log(`   url: ${projectUrl(project)}`);
    console.log("");
  });
}

function printPortfolios(portfolios) {
  console.log(`Showing ${portfolios.length} portfolio item(s).\n`);
  portfolios.forEach((portfolio, index) => {
    console.log(`${index + 1}. ${portfolio.title || "(untitled portfolio)"}`);
    console.log(`   id: ${portfolio.id}`);
    if (portfolio.content_type) console.log(`   type: ${portfolio.content_type}`);
    if (portfolio.featured != null) console.log(`   featured: ${portfolio.featured}`);
    if (portfolio.last_modify_date) {
      console.log(`   modified: ${new Date(Number(portfolio.last_modify_date) * 1000).toISOString()}`);
    }
    if (portfolio.description) {
      console.log(`   description: ${String(portfolio.description).replace(/\s+/g, " ").trim()}`);
    }
    const fileNames = (portfolio.files || []).map((file) => file.filename).filter(Boolean);
    if (fileNames.length) console.log(`   files: ${fileNames.join(", ")}`);
    if (portfolio.jobs?.length) console.log(`   skill ids: ${portfolio.jobs.join(", ")}`);
    console.log("");
  });
}

function formatUserLocation(user) {
  const parts = [
    user.location?.city || user.location?.vicinity,
    user.location?.administrative_area,
    user.location?.country?.name,
  ].filter(Boolean);
  return [...new Set(parts)].join(", ");
}

function profileUrl(user) {
  return `${DEFAULT_BASE_URL}/u/${user.username}`;
}

function printUser(user, options = {}) {
  const email = options.email || user.email;
  console.log(`Name:     ${user.display_name || user.public_name || user.username}`);
  console.log(`ID:       ${user.id}`);
  console.log(`Username: ${user.username}`);
  if (email) console.log(`Email:    ${email}`);
  const location = formatUserLocation(user);
  if (location) console.log(`Location: ${location}`);
  if (user.hourly_rate != null) console.log(`Hourly rate: ${user.hourly_rate}`);
  if (user.registration_date) {
    console.log(`Joined:   ${new Date(Number(user.registration_date) * 1000).toISOString().slice(0, 10)}`);
  }

  if (user.reputation?.entire_history) {
    const rep = user.reputation.entire_history;
    console.log(`Freelancer rating: ${rep.overall ?? "n/a"} (${rep.reviews ?? 0} reviews)`);
    if (rep.complete != null || rep.completion_rate != null) {
      const completion = rep.completion_rate == null ? "" : `, ${Math.round(Number(rep.completion_rate) * 100)}% completion`;
      console.log(`Freelancer completed: ${rep.complete ?? "n/a"}${completion}`);
    }
  }
  if (user.employer_reputation?.entire_history) {
    const rep = user.employer_reputation.entire_history;
    if (rep.reviews != null || rep.overall != null) {
      console.log(`Employer rating: ${rep.overall ?? "n/a"} (${rep.reviews ?? 0} reviews)`);
    }
  }

  if (user.status) {
    const status = user.status;
    const verified = [
      status.payment_verified ? "payment" : "",
      status.email_verified ? "email" : "",
      status.phone_verified ? "phone" : "",
      status.identity_verified ? "identity" : "",
    ].filter(Boolean);
    if (verified.length) console.log(`Verified: ${verified.join(", ")}`);
    if (status.linkedin_connected != null) console.log(`LinkedIn connected: ${status.linkedin_connected}`);
    if (status.freelancer_verified_user != null) {
      console.log(`Freelancer verified user: ${status.freelancer_verified_user}`);
    }
    if (status.profile_complete != null) console.log(`Profile complete: ${status.profile_complete}`);
  }

  const jobs = (user.jobs || []).map((j) => j.name).filter(Boolean).slice(0, 12).join(", ");
  console.log(`Skills returned by API: ${jobs || "(none)"}`);

  if (user.tagline) {
    console.log(`Tagline returned by API: ${user.tagline}`);
  } else {
    console.log("Tagline returned by API: (not returned; check the website profile headline)");
  }
  if (user.profile_description) {
    console.log(`Overview returned by API: ${String(user.profile_description).replace(/\s+/g, " ").trim()}`);
  } else {
    console.log("Overview returned by API: (not returned; check the website profile overview)");
  }
  console.log(`Profile: ${profileUrl(user)}`);
}

async function getPublicUser(identifier) {
  const key = /^\d+$/.test(String(identifier)) ? "users" : "usernames";
  const body = await apiGet("/api/users/0.1/users/", {
    [key]: [String(identifier)],
    avatar: true,
    reputation: true,
    employer_reputation: true,
    status: true,
    location_details: true,
    jobs: true,
  });
  const users = body.result?.users || {};
  return users[String(identifier)] || Object.values(users)[0];
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

async function profile() {
  const accessToken = await getAccessToken();
  const config = requireConfig({ noSecret: true });
  const res = await fetch(new URL("/api/users/0.1/self/", config.baseUrl), {
    headers: {
      "Freelancer-OAuth-V1": accessToken,
      "User-Agent": "personal-toolset freelancer-cli",
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok || body.status === "error") {
    throw new Error(`Profile request failed (${res.status}): ${JSON.stringify(body)}`);
  }
  const self = body.result || body;
  const publicUser = self.id ? await getPublicUser(self.id) : null;
  printUser({ ...self, ...(publicUser || {}) }, { email: self.email });
}

function parseJobIds(values) {
  const jobIds = values.map((value) => Number(value));
  const invalid = values.filter((value, index) => !Number.isInteger(jobIds[index]) || jobIds[index] <= 0);
  if (invalid.length) {
    throw new Error(`Skill/job IDs must be positive integers. Invalid: ${invalid.join(", ")}`);
  }
  return jobIds;
}

async function profileSkills(args) {
  const [action, ...values] = args;
  if (!action || action === "list") {
    const accessToken = await getAccessToken();
    const config = requireConfig({ noSecret: true });
    const url = new URL("/api/users/0.1/self/", config.baseUrl);
    url.searchParams.set("jobs", "true");
    const res = await fetch(url, {
      headers: {
        "Freelancer-OAuth-V1": accessToken,
        "User-Agent": "personal-toolset freelancer-cli",
      },
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (!res.ok || body.status === "error") {
      throw new Error(`Profile skills request failed (${res.status}): ${JSON.stringify(body)}`);
    }
    const self = body.result || body;
    const jobs = self.jobs || [];
    if (!jobs.length) {
      console.log("No profile skills returned by API.");
      return;
    }
    jobs.forEach((job) => {
      console.log(`${job.id}: ${job.name}`);
    });
    return;
  }

  if (!["add", "remove", "set"].includes(action) || !values.length) {
    throw new Error("Usage: node tools/freelancer/cli.js profile-skills <list|add|remove|set> [jobId ...]");
  }

  const jobIds = parseJobIds(values);
  const payload = { "jobs[]": jobIds };
  const endpoint = "/api/users/0.1/self/jobs";
  const body =
    action === "add" ? await apiPost(endpoint, payload) :
    action === "remove" ? await apiDelete(endpoint, payload) :
    await apiPut(endpoint, payload);

  console.log(`Profile skills ${action} request succeeded.`);
  console.log(JSON.stringify(body.result || body, null, 2));
}

async function getUser(args) {
  const id = args[0];
  if (!id) throw new Error("Usage: node tools/freelancer/cli.js user <userId-or-username>");
  const user = await getPublicUser(id);
  if (!user) throw new Error(`User ${id} not found`);
  printUser(user);
}

async function reviews(args) {
  const options = parseOptions(args);
  const projectId = options._[0];
  if (!projectId) throw new Error("Usage: node tools/freelancer/cli.js reviews <projectId>");
  const body = await apiGet(`/api/projects/0.1/reviews/projects/${encodeURIComponent(projectId)}/`);
  const list = body.result?.reviews || body.result || [];
  if (!list.length) {
    console.log("No reviews found for this project.");
    return;
  }
  console.log(`Showing ${list.length} review(s).\n`);
  list.forEach((r, i) => {
    console.log(`${i + 1}. Rating: ${r.rating ?? "n/a"}`);
    if (r.comment) console.log(`   Comment: ${r.comment}`);
    if (r.date_reviewed) console.log(`   Date: ${new Date(Number(r.date_reviewed) * 1000).toISOString()}`);
    console.log("");
  });
}

async function bids(args) {
  const options = parseOptions(args);
  const projectId = options._[0];
  const params = { limit: Math.min(Number(options.limit || 10), 100), job_details: true };
  if (projectId) {
    params.projects = [projectId];
  } else {
    const bidderId = readToken().account_id;
    if (!bidderId) {
      throw new Error("Could not determine bidder_id. Run `node tools/freelancer/cli.js profile` first.");
    }
    params.bidders = [bidderId];
  }
  const body = await apiGet("/api/projects/0.1/bids/", params);
  const list = body.result?.bids || body.result || [];
  if (!list.length) {
    console.log("No bids found.");
    return;
  }
  console.log(`Showing ${list.length} bid(s).\n`);
  list.forEach((b, i) => {
    console.log(`${i + 1}. Project ID: ${b.project_id}  Bid ID: ${b.id}`);
    console.log(`   Amount: ${b.amount} ${b.period ? `over ${b.period} days` : ""}`);
    if (b.description) console.log(`   Description: ${b.description.slice(0, 120)}...`);
    if (b.award_status) console.log(`   Status: ${b.award_status}`);
    console.log("");
  });
}

async function bid(args) {
  const options = parseOptions(args);
  const projectId = options._[0];
  if (!projectId || !options.amount || !options.period || !options.description) {
    throw new Error(
      "Usage: node tools/freelancer/cli.js bid <projectId> --amount <n> --period <days> --description \"text\" [--milestone-percentage <n>]"
    );
  }
  const amount = Number(options.amount);
  const period = Number(options.period);
  const numericProjectId = Number(projectId);
  const description = typeof options.description === "string" ? options.description.trim() : "";
  const milestonePercentage = options["milestone-percentage"] == null
    ? undefined
    : Number(options["milestone-percentage"]);
  if (!Number.isSafeInteger(numericProjectId) || numericProjectId <= 0) {
    throw new Error("Project ID must be a positive integer.");
  }
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Bid amount must be a positive number.");
  if (!Number.isInteger(period) || period <= 0) throw new Error("Bid period must be a positive number of days.");
  if (!description) throw new Error("Bid description must not be empty.");
  if (milestonePercentage != null && (
    !Number.isFinite(milestonePercentage) || milestonePercentage < 0 || milestonePercentage > 100
  )) {
    throw new Error("Milestone percentage must be between 0 and 100.");
  }
  const savedToken = readToken();
  const bidderId = Number(options["bidder-id"] || savedToken.account_id);
  if (!bidderId) {
    throw new Error("Could not determine bidder_id. Run `node tools/freelancer/cli.js profile` or pass --bidder-id <userId>.");
  }
  const payload = {
    project_id: numericProjectId,
    bidder_id: bidderId,
    amount,
    period,
    description,
    milestone_percentage: milestonePercentage,
  };
  const body = await apiPost("/api/projects/0.1/bids/", payload);
  const result = body.result || body;
  console.log(`Bid submitted successfully. Bid ID: ${result.id}`);
  console.log(JSON.stringify(result, null, 2));
}

async function retractBid(args) {
  const options = parseOptions(args);
  const bidId = options._[0];
  if (!bidId || !/^\d+$/.test(String(bidId))) {
    throw new Error("Usage: node tools/freelancer/cli.js retract-bid <bidId>");
  }
  await apiPut(`/api/projects/0.1/bids/${bidId}/`, undefined, { action: "retract" });
  console.log(`Bid ${bidId} retracted successfully.`);
}

async function contests(args) {
  const options = parseOptions(args);
  const query = options._.join(" ").trim();
  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 100);
  const offset = Math.max(Number(options.offset || 0), 0);
  const params = { limit, offset, job_details: true, full_description: options["full-description"] === true };
  if (query) params.query = query;
  const body = await apiGet("/api/contests/0.1/contests/active/", params);
  const list = body.result?.contests || body.result || [];
  if (!list.length) {
    console.log("No contests found.");
    return;
  }
  console.log(`Showing ${list.length} contest(s).\n`);
  list.forEach((c, i) => {
    console.log(`${i + 1}. ${c.title || "(untitled)"}`);
    console.log(`   id: ${c.id}`);
    if (c.prize) console.log(`   prize: ${c.prize} ${c.currency?.code || ""}`);
    if (c.entry_count != null) console.log(`   entries: ${c.entry_count}`);
    if (c.time_end) console.log(`   deadline: ${new Date(Number(c.time_end) * 1000).toISOString()}`);
    const skills = (c.jobs || []).map((j) => j.name).filter(Boolean).slice(0, 6).join(", ");
    if (skills) console.log(`   skills: ${skills}`);
    if (c.preview_description) console.log(`   preview: ${c.preview_description}`);
    const seoUrl = c.seo_url || "";
    const url = seoUrl.startsWith("http") ? seoUrl : seoUrl ? `${DEFAULT_BASE_URL}/${seoUrl.replace(/^\//, "")}` : `${DEFAULT_BASE_URL}/contest/${c.id}`;
    console.log(`   url: ${url}`);
    console.log("");
  });
}

async function services(args) {
  const options = parseOptions(args);
  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 100);
  const offset = Math.max(Number(options.offset || 0), 0);
  const params = {
    limit,
    offset,
    job_details: true,
    review_details: options.reviews === true,
    compact: true,
  };
  if (options._.length) {
    const serviceIds = options._.map((value) => Number(value));
    const invalid = options._.filter(
      (value, index) => !Number.isInteger(serviceIds[index]) || serviceIds[index] <= 0
    );
    if (invalid.length) {
      throw new Error(`Service offering IDs must be positive integers. Invalid: ${invalid.join(", ")}`);
    }
    params.ids = serviceIds;
  } else if (options.owner) {
    params.creator_ids = [options.owner];
  } else {
    const savedToken = readToken();
    if (!savedToken.account_id) {
      throw new Error("Could not determine owner ID. Pass service IDs or --owner <userId>.");
    }
    params.creator_ids = [savedToken.account_id];
  }
  const body = await apiPublicGet("/api/service_offerings/0.1/service_offerings", params);
  const list = body.result?.service_offerings || [];
  if (!list.length) {
    console.log("No services found.");
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  printServices(list);
}

async function serviceOrders(args) {
  const options = parseOptions(args);
  const limit = Math.min(Math.max(Number(options.limit || 100), 1), 100);
  const offset = Math.max(Number(options.offset || 0), 0);
  const savedToken = readToken();
  if (!savedToken.account_id) {
    throw new Error("Could not determine your Freelancer user ID. Run `node tools/freelancer/cli.js auth` again.");
  }

  const body = await apiGet("/api/projects/0.1/projects/", {
    bidders: [savedToken.account_id],
    limit,
    offset,
    full_description: true,
    user_details: true,
  });
  const projects = body.result?.projects || [];
  const orders = projects.filter((project) => project.service_offering_id != null);

  if (options.json) {
    console.log(JSON.stringify(orders, null, 2));
    return;
  }
  if (!orders.length) {
    const total = body.result?.total_count;
    const scanned = projects.length;
    const available = total == null ? "" : ` of ${total}`;
    console.log(`No service orders found in ${scanned}${available} account project(s) checked.`);
    if (total != null && offset + scanned < Number(total)) {
      console.log(`More projects are available; rerun with --offset ${offset + scanned}.`);
    }
    return;
  }
  printServiceOrders(orders);
}

async function portfolios(args) {
  const options = parseOptions(args);
  const userId = options.user || options._[0] || readToken().account_id;
  if (!userId) throw new Error("Usage: node tools/freelancer/cli.js portfolios [userId] [--limit 10] [--offset 0] [--json]");
  const body = await apiGet("/api/users/0.1/portfolios/", {
    users: [userId],
    limit: Math.min(Math.max(Number(options.limit || 10), 1), 100),
    offset: Math.max(Number(options.offset || 0), 0),
  });
  const portfoliosByUser = body.result?.portfolios || {};
  const list = portfoliosByUser[String(userId)] || portfoliosByUser[userId] || [];
  if (!list.length) {
    console.log("No portfolio items found.");
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  printPortfolios(list);
}

async function messages(args) {
  const options = parseOptions(args);
  const limit = Math.min(Number(options.limit || 10), 100);
  const params = { limit };
  if (options.project) {
    params.context_type = "project";
    params.context = options.project;
  }
  const body = await apiGet("/api/messages/0.1/threads/", params);
  const threads = body.result?.threads || body.result || [];
  if (!threads.length) {
    console.log("No messages found.");
    return;
  }
  console.log(`Showing ${threads.length} thread(s).\n`);
  threads.forEach((t, i) => {
    console.log(`${i + 1}. Thread ID: ${t.id}  Context: ${t.context?.id || "n/a"}`);
    if (t.message_count != null) console.log(`   Messages: ${t.message_count}`);
    if (t.time_updated) console.log(`   Updated: ${new Date(Number(t.time_updated) * 1000).toISOString()}`);
    if (t.last_message?.message) console.log(`   Last: ${String(t.last_message.message).slice(0, 100)}`);
    console.log("");
  });
}

function formatMessageUser(message, users) {
  const userId = message.from_user || message.sender_id || message.user_id;
  if (userId == null) return "unknown";
  const user = users?.[String(userId)] || users?.[userId];
  return user?.display_name || user?.public_name || user?.username || String(userId);
}

async function projectMessages(args) {
  const options = parseOptions(args);
  const projectId = options._[0];
  if (!projectId) {
    throw new Error("Usage: node tools/freelancer/cli.js project-messages <projectId> [--limit 10] [--offset 0]");
  }
  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 100);
  const offset = Math.max(Number(options.offset || 0), 0);
  const body = await apiGet("/api/messages/0.1/messages/", {
    context_type: "project",
    context: projectId,
    limit,
    offset,
  });
  const result = body.result || {};
  const messagesList = result.messages || [];
  const threads = result.threads || {};
  const users = result.users || {};

  console.log(
    "Note: this reads Freelancer's project-scoped messages API. It is not a dedicated Public Clarification Board endpoint."
  );
  if (!messagesList.length) {
    console.log("No project-scoped messages found for this project.");
    if (Object.keys(threads).length) {
      console.log(`Thread metadata returned: ${Object.keys(threads).length} thread(s).`);
    }
    return;
  }

  console.log(`Showing ${messagesList.length} message(s).\n`);
  messagesList.forEach((message, index) => {
    const threadId = message.thread_id || message.thread?.id || "n/a";
    console.log(`${index + 1}. Thread ID: ${threadId}  From: ${formatMessageUser(message, users)}`);
    if (message.time_created) console.log(`   Created: ${new Date(Number(message.time_created) * 1000).toISOString()}`);
    if (message.message) console.log(`   Message: ${String(message.message).replace(/\s+/g, " ").trim()}`);
    console.log("");
  });
}

async function notifications(args) {
  const options = parseOptions(args);
  const limit = Math.min(Number(options.limit || 10), 100);
  const body = await apiGet("/api/notifications/0.1/notifications/", { limit, unread_only: options["unread-only"] === true });
  const list = body.result?.notifications || body.result || [];
  if (!list.length) {
    console.log("No notifications found.");
    return;
  }
  console.log(`Showing ${list.length} notification(s).\n`);
  list.forEach((n, i) => {
    console.log(`${i + 1}. [${n.is_read ? "read" : "UNREAD"}] ${n.description || n.type || "(no description)"}`);
    if (n.time_created) console.log(`   Time: ${new Date(Number(n.time_created) * 1000).toISOString()}`);
    console.log("");
  });
}

async function milestones(args) {
  const options = parseOptions(args);
  const projectId = options._[0];
  if (!projectId) throw new Error("Usage: node tools/freelancer/cli.js milestones <projectId>");
  const body = await apiGet("/api/projects/0.1/milestones/", { projects: [projectId] });
  const list = body.result?.milestones || body.result || [];
  if (!list.length) {
    console.log("No milestones found for this project.");
    return;
  }
  console.log(`Showing ${list.length} milestone(s).\n`);
  list.forEach((m, i) => {
    console.log(`${i + 1}. ${m.description || "(no description)"}`);
    console.log(`   ID: ${m.id}  Status: ${m.status}`);
    if (m.amount) console.log(`   Amount: ${m.amount} ${m.currency?.code || ""}`);
    if (m.time_created) console.log(`   Created: ${new Date(Number(m.time_created) * 1000).toISOString()}`);
    console.log("");
  });
}

async function createMilestoneRequest(projectId, bidId, amount, description) {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    throw new Error("Milestone project ID must be a positive integer.");
  }
  if (!Number.isSafeInteger(bidId) || bidId <= 0) {
    throw new Error("Milestone bid ID must be a positive integer.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Milestone amount must be a positive number.");
  }
  const normalizedDescription = typeof description === "string" ? description.trim() : "";
  if (!normalizedDescription) throw new Error("Milestone description must not be empty.");
  const payload = {
    project_id: projectId,
    bid_id: bidId,
    amount,
    description: normalizedDescription,
  };
  const body = await apiPost("/api/projects/0.1/milestone_requests/", payload);
  return body.result || body;
}

async function requestMilestone(args) {
  const options = parseOptions(args);
  const projectId = options._[0];
  if (!projectId || !options.bid || !options.amount || !options.description) {
    throw new Error(
      "Usage: node tools/freelancer/cli.js request-milestone <projectId> --bid <bidId> --amount <n> --description \"text\""
    );
  }
  const result = await createMilestoneRequest(
    Number(projectId),
    Number(options.bid),
    Number(options.amount),
    options.description
  );
  console.log(`Milestone request submitted successfully. Request ID: ${result.id || "n/a"}`);
  console.log(JSON.stringify(result, null, 2));
}

async function milestoneRequests(args) {
  const options = parseOptions(args);
  const params = { limit: Math.min(Math.max(Number(options.limit || 10), 1), 100) };
  if (options.offset) params.offset = Math.max(Number(options.offset), 0);
  if (options.bid) params.bids = [options.bid];
  if (options.request) params.milestone_requests = [options.request];
  if (options.project) params.projects = [options.project];
  if (!options.bid && !options.request && !options.project) {
    throw new Error(
      "Usage: node tools/freelancer/cli.js milestone-requests --bid <bidId> [--limit 10] [--offset 0]"
    );
  }
  const body = await apiGet("/api/projects/0.1/milestone_requests/", params);
  const requests = body.result?.milestone_requests || body.result || {};
  const list = Array.isArray(requests) ? requests : Object.values(requests);
  if (!list.length) {
    console.log("No milestone requests found.");
    return;
  }
  console.log(`Showing ${list.length} milestone request(s).\n`);
  list.forEach((request, index) => {
    const currency = request.currency?.code || "";
    console.log(`${index + 1}. Request ID: ${request.id}  Status: ${request.status || "n/a"}`);
    console.log(`   Project ID: ${request.project_id}  Bid ID: ${request.bid_id}`);
    console.log(`   Amount: ${[request.amount, currency].filter(Boolean).join(" ")}`);
    if (request.time_requested) {
      console.log(`   Requested: ${new Date(Number(request.time_requested) * 1000).toISOString()}`);
    }
    if (request.description) console.log(`   Description: ${request.description}`);
    console.log("");
  });
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
  node tools/freelancer/cli.js auth [--client-credentials]
  node tools/freelancer/cli.js search "keywords" [--limit 10] [--offset 0] [--sort time_updated] [--full-description] [--user-details] [--location-details]
  node tools/freelancer/cli.js project <projectId>
  node tools/freelancer/cli.js open <projectId-or-url>
  node tools/freelancer/cli.js profile
  node tools/freelancer/cli.js profile-skills <list|add|remove|set> [jobId ...]
  node tools/freelancer/cli.js user <userId-or-username>
  node tools/freelancer/cli.js reviews <projectId>
  node tools/freelancer/cli.js bids [projectId] [--limit 10]
  node tools/freelancer/cli.js bid <projectId> --amount <n> --period <days> --description "text" [--milestone-percentage <n>]
  node tools/freelancer/cli.js retract-bid <bidId>                    (alias: withdraw-bid)
  node tools/freelancer/cli.js contests ["keywords"] [--limit 10] [--offset 0] [--full-description]
  node tools/freelancer/cli.js services [serviceId ...] [--owner <userId>] [--limit 10] [--offset 0] [--reviews] [--json]
  node tools/freelancer/cli.js service-orders [--limit 100] [--offset 0] [--json]  (alias: service-purchases)
  node tools/freelancer/cli.js portfolios [userId] [--limit 10] [--offset 0] [--json]
  node tools/freelancer/cli.js messages [--limit 10] [--project <projectId>]
  node tools/freelancer/cli.js project-messages <projectId> [--limit 10] [--offset 0]
  node tools/freelancer/cli.js notifications [--limit 10] [--unread-only]
  node tools/freelancer/cli.js milestones <projectId>
  node tools/freelancer/cli.js milestone-requests --bid <bidId> [--limit 10] [--offset 0]
  node tools/freelancer/cli.js request-milestone <projectId> --bid <bidId> --amount <n> --description "text"

Examples:
  node tools/freelancer/cli.js auth --client-credentials
  node tools/freelancer/cli.js search "node.js API" --limit 20 --full-description
  node tools/freelancer/cli.js project 40458235
  node tools/freelancer/cli.js profile
  node tools/freelancer/cli.js profile-skills add 2894 2916 2925 2926 2986
  node tools/freelancer/cli.js user 12345678
  node tools/freelancer/cli.js user liuniu
  node tools/freelancer/cli.js reviews 40458235
  node tools/freelancer/cli.js bids --limit 5
  node tools/freelancer/cli.js bid 40458235 --amount 150 --period 7 --description "I can build this"
  node tools/freelancer/cli.js retract-bid 487249873
  node tools/freelancer/cli.js contests "logo design" --limit 10
  node tools/freelancer/cli.js services
  node tools/freelancer/cli.js services 1 --json
  node tools/freelancer/cli.js service-orders
  node tools/freelancer/cli.js portfolios
  node tools/freelancer/cli.js messages
  node tools/freelancer/cli.js project-messages 40458235
  node tools/freelancer/cli.js notifications --unread-only
  node tools/freelancer/cli.js milestones 40458235
  node tools/freelancer/cli.js milestone-requests --bid 487249873
  node tools/freelancer/cli.js request-milestone 40458235 --bid 487249873 --amount 320 --description "Working bot and setup guide"
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
  if (command === "profile") return profile();
  if (command === "profile-skills") return profileSkills(args);
  if (command === "user") return getUser(args);
  if (command === "reviews") return reviews(args);
  if (command === "bids") return bids(args);
  if (command === "bid") return bid(args);
  if (command === "retract-bid" || command === "withdraw-bid") return retractBid(args);
  if (command === "contests") return contests(args);
  if (command === "services") return services(args);
  if (command === "service-orders" || command === "service-purchases") return serviceOrders(args);
  if (command === "portfolios") return portfolios(args);
  if (command === "messages") return messages(args);
  if (command === "project-messages") return projectMessages(args);
  if (command === "notifications") return notifications(args);
  if (command === "milestones") return milestones(args);
  if (command === "milestone-requests") return milestoneRequests(args);
  if (command === "request-milestone") return requestMilestone(args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
