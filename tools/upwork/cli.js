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
const AUTH_ENDPOINT = "https://www.upwork.com/ab/account-security/oauth2/authorize";
const TOKEN_ENDPOINT = "https://www.upwork.com/api/v3/oauth2/token";
const GRAPHQL_ENDPOINT = "https://api.upwork.com/graphql";

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
    clientId: process.env.UPWORK_CLIENT_ID,
    clientSecret: process.env.UPWORK_CLIENT_SECRET,
    callbackUrl: process.env.UPWORK_CALLBACK_URL || "http://localhost:3000/callback",
  };

  const missing = [];
  if (!config.clientId) missing.push("UPWORK_CLIENT_ID");
  if (!config.clientSecret) missing.push("UPWORK_CLIENT_SECRET");
  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")} in ${ENV_FILE}`);
  }
  return config;
}

function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("No saved token. Run: node upwork-cli.js auth");
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
    expires_at: expiresAt,
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

async function getUpworkProfile(accessToken) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
        query currentUser {
          user {
            id
            email
            name
          }
        }
      `,
    }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) {
    throw new Error(`Upwork profile request failed (${res.status}): ${JSON.stringify(body)}`);
  }
  const user = body.data?.user || {};
  return {
    account_email: user.email,
    account_name: user.name,
    account_id: user.id == null ? undefined : String(user.id),
  };
}

async function tryGetUpworkProfile(accessToken) {
  try {
    return await getUpworkProfile(accessToken);
  } catch (err) {
    console.warn(`Could not save Upwork account metadata: ${err.message}`);
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
  if (token.access_token && token.expires_at && token.expires_at > Date.now()) {
    return token.access_token;
  }
  if (!token.refresh_token) {
    throw new Error("Saved token has no refresh token. Run: node upwork-cli.js auth");
  }
  const refreshed = await requestToken({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: token.refresh_token,
  });
  const profile = await tryGetUpworkProfile(refreshed.access_token);
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
        res.end(`Upwork authorization failed: ${error}`);
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
      const profile = await tryGetUpworkProfile(token.access_token);
      writeToken(token, {}, profile);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Upwork CLI authorization complete. You can close this tab.");
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

async function graphql(query, variables) {
  const accessToken = await getAccessToken();
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) {
    throw new Error(JSON.stringify(body, null, 2));
  }
  return body.data;
}

function money(value) {
  if (value == null) return "";
  if (typeof value === "number") return `$${value}`;
  if (typeof value === "object") {
    const raw = value.rawValue ?? value.amount ?? value.displayValue;
    const currency = value.currency || "USD";
    return raw == null ? "" : `${raw} ${currency}`;
  }
  return String(value);
}

function jobUrl(job) {
  const id = job.ciphertext || job.id;
  return `https://www.upwork.com/jobs/~${id}`;
}

function printJobs(jobs, totalCount) {
  console.log(`Found ${totalCount ?? jobs.length} result(s). Showing ${jobs.length}.\n`);
  jobs.forEach((job, index) => {
    const budget =
      job.type === "HOURLY"
        ? [job.hourlyBudgetMin, job.hourlyBudgetMax].filter((v) => v != null).map(money).join("-")
        : money(job.amount || job.weeklyBudget);
    const skills = (job.skills || job.ontologySkills || [])
      .map((skill) => skill.prettyName || skill.prefLabel || skill.name)
      .filter(Boolean)
      .slice(0, 8)
      .join(", ");
    const client = job.client
      ? [
          job.client.verificationStatus || job.client.paymentVerificationStatus,
          job.client.totalHires != null ? `${job.client.totalHires} hires` : null,
          job.client.totalFeedback != null ? `${job.client.totalFeedback} rating` : null,
          job.client.location?.country,
        ]
          .filter(Boolean)
          .join(" | ")
      : "";

    console.log(`${index + 1}. ${job.title}`);
    console.log(`   id: ${job.id}`);
    if (job.createdDateTime || job.publishedDateTime) {
      console.log(`   posted: ${job.publishedDateTime || job.createdDateTime}`);
    }
    if (job.type || budget) console.log(`   terms: ${[job.type, budget].filter(Boolean).join(" | ")}`);
    if (job.totalApplicants != null) console.log(`   applicants: ${job.totalApplicants}`);
    if (client) console.log(`   client: ${client}`);
    if (skills) console.log(`   skills: ${skills}`);
    console.log(`   url: ${jobUrl(job)}`);
    console.log("");
  });
}

async function search(args) {
  const options = parseOptions(args);
  const keywords = options._.join(" ").trim();
  if (!keywords) {
    throw new Error('Usage: node upwork-cli.js search "node.js openai" [--limit 20] [--offset 0]');
  }

  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 50);
  const offset = Math.max(Number(options.offset || 0), 0);
  const verifiedOnly = options["verified-only"] === true;

  const query = `
    query marketplaceJobPostingsSearch(
      $marketPlaceJobFilter: MarketplaceJobPostingsSearchFilter,
      $searchType: MarketplaceJobPostingSearchType,
      $sortAttributes: [MarketplaceJobPostingSearchSortAttribute]
    ) {
      marketplaceJobPostingsSearch(
        marketPlaceJobFilter: $marketPlaceJobFilter,
        searchType: $searchType,
        sortAttributes: $sortAttributes
      ) {
        totalCount
        edges {
          node {
            id
            title
            ciphertext
            createdDateTime
            publishedDateTime
            type
            amount { rawValue currency displayValue }
            weeklyBudget { rawValue currency displayValue }
            hourlyBudgetMin { rawValue currency displayValue }
            hourlyBudgetMax { rawValue currency displayValue }
            totalApplicants
            contractorTier
            duration
            durationLabel
            applied
            skills { name prettyName highlighted }
            client {
              totalHires
              totalPostedJobs
              totalFeedback
              totalReviews
              verificationStatus
              location { country city timezone }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  const variables = {
    marketPlaceJobFilter: {
      searchExpression_eq: keywords,
      pagination_eq: { after: String(offset), first: limit },
      ...(verifiedOnly ? { verifiedPaymentOnly_eq: true } : {}),
    },
    searchType: "USER_JOBS_SEARCH",
    sortAttributes: [{ field: options.sort === "relevance" ? "RELEVANCE" : "RECENCY" }],
  };

  const data = await graphql(query, variables);
  const result = data.marketplaceJobPostingsSearch;
  printJobs(result.edges.map((edge) => edge.node), result.totalCount);
}

async function job(args) {
  const id = args[0];
  if (!id) throw new Error("Usage: node upwork-cli.js job <jobId>");

  const query = `
    query marketplaceJobPosting($id: ID!) {
      marketplaceJobPosting(id: $id) {
        id
        title
        ciphertext
        description
        createdDateTime
        publishedDateTime
        jobStatus
      }
    }
  `;
  const data = await graphql(query, { id });
  console.log(JSON.stringify(data.marketplaceJobPosting, null, 2));
}

function openJob(args) {
  const id = args[0];
  if (!id) throw new Error("Usage: node upwork-cli.js open <jobId-or-ciphertext>");
  const url = `https://www.upwork.com/jobs/~${id}`;
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
  npm run upwork:auth
  npm run upwork:search -- "keywords" [--limit 10] [--offset 0] [--sort recency|relevance] [--verified-only]
  node tools/upwork/cli.js job <jobId>
  node tools/upwork/cli.js open <jobId-or-ciphertext>

Examples:
  npm run upwork:auth
  npm run upwork:search -- "node.js openai api" --limit 20 --verified-only
  node tools/upwork/cli.js open 0123456789abcdef
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }
  if (command === "auth") return auth();
  if (command === "search") return search(args);
  if (command === "job") return job(args);
  if (command === "open") return openJob(args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
