#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const TOOL_DIR = __dirname;
const SESSIONS_DIR = path.join(TOOL_DIR, ".sessions");
const PROFILES_DIR = path.join(TOOL_DIR, ".profiles");
const DEFAULT_SESSION = "default";
const DEFAULT_TIMEOUT = 30000;
const SESSION_NAME_RE = /^[A-Za-z0-9._-]+$/;
const EXIT_USAGE = 64;
const EXIT_DEPENDENCY = 69;
const EXIT_SESSION = 70;
const EXIT_STALE_SESSION = 71;

function parseOptions(args) {
  const options = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      options._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    i += 1;
  }
  return options;
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function usageError(message) {
  fail(message, EXIT_USAGE);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function boolOption(value, fallback) {
  if (value == null || value === true) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  usageError(`Expected true or false, got: ${value}`);
}

function numberOption(value, fallback) {
  if (value == null || value === true) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) usageError(`Expected positive number, got: ${value}`);
  return parsed;
}

function integerOption(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) usageError(`Expected non-negative integer for ${label}, got: ${value}`);
  return parsed;
}

function parseViewport(value) {
  if (!value || value === true) return null;
  const match = String(value).match(/^(\d+)x(\d+)$/);
  if (!match) usageError(`Expected viewport like 1280x720, got: ${value}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function validateSessionName(name) {
  if (!name || !SESSION_NAME_RE.test(name)) {
    usageError(`Invalid session name "${name}". Use letters, numbers, dot, underscore, or dash.`);
  }
}

function sessionPath(name) {
  validateSessionName(name);
  return path.join(SESSIONS_DIR, `${name}.json`);
}

function profilePath(name) {
  validateSessionName(name);
  return path.join(PROFILES_DIR, name);
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (err) {
    fail("Playwright is not installed. Run: npm install", EXIT_DEPENDENCY);
  }
}

function isBrowserMissing(err) {
  return /Executable doesn't exist|playwright install/i.test(String(err && err.message));
}

function chromiumLaunchOptions(options = {}) {
  const launchOptions = { ...options };
  if (launchOptions["executable-path"]) {
    launchOptions.executablePath = launchOptions["executable-path"];
    delete launchOptions["executable-path"];
  }
  return {
    ...launchOptions,
    chromiumSandbox: false,
    args: [...(launchOptions.args || []), "--no-sandbox", "--disable-setuid-sandbox"],
  };
}

function normalizeOutFile(file) {
  if (!file || file === true) usageError("--out <file> is required");
  const absolute = path.resolve(ROOT, file);
  ensureDir(path.dirname(absolute));
  return absolute;
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

function writeOutput(data, options) {
  if (options.json) {
    printJson(data);
    return;
  }
  if (data.text != null) {
    console.log(data.text);
    return;
  }
  if (data.html != null) {
    console.log(data.html);
    return;
  }
  if (data.links) {
    data.links.forEach((link) => {
      console.log(`${link.text || "(no text)"}\t${link.href || ""}`);
    });
    return;
  }
  if (data.exists != null) {
    console.log(data.exists ? "Found." : "Not found.");
    return;
  }
  if (data.screenshot) {
    console.log(`Screenshot: ${path.relative(ROOT, data.screenshot)}`);
    return;
  }
  if (data.session) {
    console.log(`Session: ${data.session}`);
    if (data.running != null) console.log(`Running: ${data.running}`);
    if (data.url) console.log(`URL: ${data.url}`);
    if (data.title) console.log(`Title: ${data.title}`);
    if (data.pid) console.log(`PID: ${data.pid}`);
    if (data.port) console.log(`Port: ${data.port}`);
    if (data.headless != null) console.log(`Headless: ${data.headless}`);
    return;
  }
  if (data.tabs) {
    data.tabs.forEach((tab) => {
      const marker = tab.active ? "*" : " ";
      console.log(`${marker} ${tab.index}. ${tab.title || "(untitled)"} ${tab.url || ""}`);
    });
    return;
  }
  if (data.tab != null) {
    console.log(`Active tab: ${data.tab}`);
    if (data.url) console.log(`URL: ${data.url}`);
    if (data.title) console.log(`Title: ${data.title}`);
    return;
  }
  if (data.url) console.log(`URL: ${data.url}`);
  if (data.title) console.log(`Title: ${data.title}`);
  if (data.ok != null) console.log(`OK: ${data.ok}`);
}

function findLocatorOptions(options) {
  const groups = [];
  if (options.role || options.name) groups.push("role");
  if (options.label) groups.push("label");
  if (options.placeholder) groups.push("placeholder");
  if (options.text) groups.push("text");
  if (options.title) groups.push("title");
  if (options["test-id"]) groups.push("test-id");
  if (options.selector) groups.push("selector");
  const unique = [...new Set(groups)];
  if (unique.length > 1) usageError(`Use one locator type, got: ${unique.join(", ")}`);
  if (options.role && !options.name) usageError("--role requires --name");
  if (options.name && !options.role) usageError("--name requires --role");
  return unique[0] || null;
}

function locatorFromOptions(page, options) {
  const type = findLocatorOptions(options);
  if (!type) return null;
  let locator;
  if (type === "role") locator = page.getByRole(options.role, { name: options.name });
  else if (type === "label") locator = page.getByLabel(options.label);
  else if (type === "placeholder") locator = page.getByPlaceholder(options.placeholder);
  else if (type === "text") locator = page.getByText(options.text);
  else if (type === "title") locator = page.getByTitle(options.title);
  else if (type === "test-id") locator = page.getByTestId(options["test-id"]);
  else locator = page.locator(options.selector);
  if (options.nth != null && options.nth !== true) locator = locator.nth(integerOption(options.nth, "--nth"));
  return locator;
}

async function targetFromOptions(page, options) {
  if (!options.frame || options.frame === true) return page;
  const handle = await page
    .locator(options.frame)
    .elementHandle({ timeout: numberOption(options.timeout, DEFAULT_TIMEOUT) });
  if (!handle) throw new Error(`Frame element not found: ${options.frame}`);
  const frame = await handle.contentFrame();
  if (!frame) throw new Error(`Element is not an iframe: ${options.frame}`);
  return frame;
}

async function pageText(page, options) {
  const locator = locatorFromOptions(page, options);
  if (locator) return locator.innerText({ timeout: numberOption(options.timeout, DEFAULT_TIMEOUT) });
  return page.locator("body").innerText({ timeout: numberOption(options.timeout, DEFAULT_TIMEOUT) });
}

async function pageHtml(page, options) {
  const locator = locatorFromOptions(page, options);
  if (locator) {
    return locator.evaluate((element) => element.outerHTML, {
      timeout: numberOption(options.timeout, DEFAULT_TIMEOUT),
    });
  }
  return page.content();
}

async function pageLinks(page, options) {
  const limit = numberOption(options.limit, 50);
  const locator = locatorFromOptions(page, options) || page.locator("body");
  return locator.locator("a").evaluateAll(
    (links, max) =>
      links.slice(0, max).map((link) => ({
        text: (link.innerText || link.textContent || "").replace(/\s+/g, " ").trim(),
        href: link.href,
      })),
    limit
  );
}

async function snapshot(page) {
  const elementSelector = "a, button, input, textarea, select, [role=button], [role=link]";
  const elements = await page.locator(elementSelector).evaluateAll((items) =>
    items.slice(0, 80).map((item) => {
      const text = (
        item.innerText ||
        item.getAttribute("aria-label") ||
        item.getAttribute("placeholder") ||
        item.getAttribute("title") ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      return {
        tag: item.tagName.toLowerCase(),
        text,
        type: item.getAttribute("type"),
        role: item.getAttribute("role"),
        name: item.getAttribute("name"),
        id: item.id || null,
      };
    })
  );
  const text = await page.locator("body").innerText().catch(() => "");
  return {
    url: page.url(),
    title: await page.title(),
    text: text.replace(/\s+/g, " ").trim().slice(0, 1500),
    elements,
    ok: true,
  };
}

async function runAction(page, command, options) {
  const timeout = numberOption(options.timeout, DEFAULT_TIMEOUT);
  page.setDefaultTimeout(timeout);
  const target = await targetFromOptions(page, options);
  if (command === "goto") {
    const url = options.url || options._[0];
    if (!url) usageError("Usage: node tools/playwright/cli.js goto <url> [--session default]");
    await page.goto(url, { waitUntil: options["wait-until"] || "load", timeout });
    return { url: page.url(), title: await page.title(), ok: true };
  }
  if (command === "click") {
    const locator = locatorFromOptions(target, options);
    if (!locator) usageError("click requires locator options");
    await locator.click({ timeout });
    return { url: page.url(), title: await page.title(), ok: true };
  }
  if (command === "fill") {
    const locator = locatorFromOptions(target, options);
    if (!locator) usageError("fill requires locator options");
    if (options.value == null || options.value === true) usageError("fill requires --value <text>");
    await locator.fill(String(options.value), { timeout });
    return { ok: true };
  }
  if (command === "press") {
    const key = options._[0] || options.key;
    if (!key) usageError("Usage: node tools/playwright/cli.js press <key> [--session default]");
    await page.keyboard.press(key);
    return { ok: true };
  }
  if (command === "select") {
    const locator = locatorFromOptions(target, options);
    if (!locator) usageError("select requires locator options");
    if (options.value == null || options.value === true) usageError("select requires --value <value>");
    await locator.selectOption(String(options.value), { timeout });
    return { ok: true };
  }
  if (command === "check" || command === "uncheck") {
    const locator = locatorFromOptions(target, options);
    if (!locator) usageError(`${command} requires locator options`);
    if (command === "check") await locator.check({ timeout });
    else await locator.uncheck({ timeout });
    return { ok: true };
  }
  if (command === "wait") {
    if (options["load-state"]) {
      await page.waitForLoadState(options["load-state"], { timeout });
      return { ok: true };
    }
    const locator = locatorFromOptions(target, options);
    if (!locator) usageError("wait requires locator options or --load-state <state>");
    await locator.waitFor({ state: options.state || "visible", timeout });
    return { ok: true };
  }
  if (command === "text") return { text: await pageText(target, options), ok: true };
  if (command === "html") return { html: await pageHtml(target, options), ok: true };
  if (command === "links") return { links: await pageLinks(target, options), ok: true };
  if (command === "exists") {
    const locator = locatorFromOptions(target, options);
    if (!locator) usageError("exists requires locator options");
    return { exists: (await locator.count()) > 0, ok: true };
  }
  if (command === "screenshot") {
    const out = normalizeOutFile(options.out);
    await page.screenshot({
      path: out,
      fullPage: options["full-page"] === true || options.fullPage === true,
    });
    return { screenshot: out, ok: true };
  }
  if (command === "snapshot") return snapshot(page);
  usageError(`Unknown command: ${command}`);
}

async function listTabs(context, activePage) {
  const pages = context.pages();
  return Promise.all(
    pages.map(async (item, index) => ({
      index,
      active: item === activePage,
      url: item.url(),
      title: await item.title().catch(() => ""),
    }))
  );
}

async function runOneShot(command, options) {
  if (!options.url || options.url === true) usageError(`${command} requires --url <url> or --session <name>`);
  if (["click", "fill", "press", "select", "check", "uncheck", "wait", "goto", "snapshot"].includes(command)) {
    usageError(`${command} requires --session in this version`);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: boolOption(options.headless, true) }));
  const contextOptions = {};
  const viewport = parseViewport(options.viewport);
  if (viewport) contextOptions.viewport = viewport;
  if (options["user-agent"] && options["user-agent"] !== true) contextOptions.userAgent = options["user-agent"];
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  try {
    await page.goto(options.url, {
      waitUntil: options["wait-until"] || "load",
      timeout: numberOption(options.timeout, DEFAULT_TIMEOUT),
    });
    return await runAction(page, command, options);
  } finally {
    await browser.close();
  }
}

function readSession(name) {
  const file = sessionPath(name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function requestSession(name, payload) {
  const session = readSession(name);
  if (!session) {
    fail(
      `No running session named "${name}". Start one with: node tools/playwright/cli.js session start --name ${name}`,
      EXIT_SESSION
    );
  }
  const body = JSON.stringify(payload);
  const response = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: session.port,
        path: "/",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-Playwright-Cli-Token": session.token,
        },
        timeout: 3000,
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = text ? JSON.parse(text) : {};
          } catch {
            parsed = { error: text };
          }
          resolve({ statusCode: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("request timed out"));
    });
    req.write(body);
    req.end();
  }).catch((err) => {
    fail(`Session "${name}" is unavailable or stale: ${err.message}`, EXIT_STALE_SESSION);
  });
  if (response.statusCode >= 400) {
    const message = response.body && response.body.error
      ? response.body.error
      : `Session request failed (${response.statusCode})`;
    fail(message, response.statusCode === 404 ? EXIT_SESSION : 1);
  }
  return response.body;
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForSession(name, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const session = readSession(name);
    if (session) {
      try {
        return await requestSession(name, { command: "status", options: {} });
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  fail(`Timed out waiting for session "${name}" to start.`, EXIT_SESSION);
}

async function startSession(args) {
  const options = parseOptions(args);
  const name = options.name || DEFAULT_SESSION;
  validateSessionName(name);
  if (readSession(name)) {
    fail(`Session "${name}" already exists. Run session status or session stop first.`, EXIT_SESSION);
  }
  ensureDir(SESSIONS_DIR);
  ensureDir(PROFILES_DIR);
  const port = await getFreePort();
  const token = crypto.randomBytes(24).toString("hex");
  const serverArgs = [
    __filename,
    "__session-server",
    "--name",
    name,
    "--port",
    String(port),
    "--token",
    token,
    "--headless",
    String(boolOption(options.headless, false)),
    "--timeout",
    String(numberOption(options.timeout, DEFAULT_TIMEOUT)),
  ];
  if (options.viewport && options.viewport !== true) serverArgs.push("--viewport", options.viewport);
  if (options.profile && options.profile !== true) serverArgs.push("--profile", options.profile);
  if (options["user-agent"] && options["user-agent"] !== true) serverArgs.push("--user-agent", options["user-agent"]);
  if (options["executable-path"] && options["executable-path"] !== true) {
    serverArgs.push("--executable-path", options["executable-path"]);
  }
  const child = spawn(process.execPath, serverArgs, {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  const status = await waitForSession(name, 10000);
  writeOutput(status, options);
}

async function stopSession(args) {
  const options = parseOptions(args);
  const name = options.name || options.session || DEFAULT_SESSION;
  validateSessionName(name);
  const file = sessionPath(name);
  if (!fs.existsSync(file)) {
    console.log(`No session metadata found for "${name}".`);
    return;
  }
  if (options.force) {
    fs.rmSync(file, { force: true });
    console.log(`Removed session metadata for "${name}".`);
    return;
  }
  await requestSession(name, { command: "stop", options: {} });
  fs.rmSync(file, { force: true });
  console.log(`Stopped session "${name}".`);
}

async function sessionStatus(args) {
  const options = parseOptions(args);
  const name = options.name || options.session || DEFAULT_SESSION;
  validateSessionName(name);
  const status = await requestSession(name, { command: "status", options: {} });
  writeOutput(status, options);
}

async function commandWithPage(command, args) {
  const options = parseOptions(args);
  if (options.session && options.url) usageError("Use either --session or --url, not both.");
  if (command === "goto") {
    options.url = options._[0];
    const name = options.session || DEFAULT_SESSION;
    const result = await requestSession(name, { command, options });
    writeOutput(result, options);
    return;
  }
  if (options.session || !options.url) {
    const name = options.session || DEFAULT_SESSION;
    const result = await requestSession(name, { command, options });
    writeOutput(result, options);
    if (command === "exists" && result.exists === false) process.exit(2);
    return;
  }
  try {
    const result = await runOneShot(command, options);
    writeOutput(result, options);
    if (command === "exists" && result.exists === false) process.exit(2);
  } catch (err) {
    if (isBrowserMissing(err)) {
      fail("Playwright browser binaries are missing. Run: npx playwright install chromium", EXIT_DEPENDENCY);
    }
    throw err;
  }
}

async function runFlow(args) {
  const options = parseOptions(args);
  const file = options._[0];
  if (!file) usageError("Usage: node tools/playwright/cli.js flow <file.json> [--session default]");
  const flow = JSON.parse(fs.readFileSync(path.resolve(ROOT, file), "utf8"));
  if (!flow || !Array.isArray(flow.steps)) usageError("Flow file must contain a steps array.");
  const session = options.session || flow.session || DEFAULT_SESSION;
  for (const [index, step] of flow.steps.entries()) {
    const command = Object.keys(step)[0];
    const value = step[command];
    const stepOptions = typeof value === "object" && value !== null ? { ...value } : { value };
    if (command === "goto") stepOptions._ = [String(value)];
    if (command === "screenshot" && typeof value === "string") stepOptions.out = value;
    const result = await requestSession(session, { command, options: stepOptions });
    console.log(`${index + 1}. ${command}: ok`);
    if (stepOptions.saveAs) {
      console.log(`${stepOptions.saveAs}: ${result.text || result.html || JSON.stringify(result)}`);
    }
  }
}

function help() {
  console.log(`
Usage:
  node tools/playwright/cli.js session start [--name default] [--headless false]
  node tools/playwright/cli.js session status [--name default]
  node tools/playwright/cli.js session stop [--name default] [--force]
  node tools/playwright/cli.js goto <url> [--session default]
  node tools/playwright/cli.js click [locator options] [--session default]
  node tools/playwright/cli.js fill [locator options] --value <text> [--session default]
  node tools/playwright/cli.js press <key> [--session default]
  node tools/playwright/cli.js select [locator options] --value <value> [--session default]
  node tools/playwright/cli.js check [locator options] [--session default]
  node tools/playwright/cli.js uncheck [locator options] [--session default]
  node tools/playwright/cli.js wait [locator options] [--state visible|hidden|attached|detached] [--session default]
  node tools/playwright/cli.js text [locator options] [--session default] [--url <url>]
  node tools/playwright/cli.js html [locator options] [--session default] [--url <url>]
  node tools/playwright/cli.js links [locator options] [--session default] [--url <url>] [--limit 50]
  node tools/playwright/cli.js exists [locator options] [--session default] [--url <url>]
  node tools/playwright/cli.js screenshot --out <file> [--session default] [--url <url>] [--full-page]
  node tools/playwright/cli.js snapshot [--session default] [--json]
  node tools/playwright/cli.js tabs [--session default]
  node tools/playwright/cli.js tab use --index <n> [--session default]
  node tools/playwright/cli.js flow <file.json> [--session default]

Locator options:
  --selector <css>
  --text <text>
  --role <role> --name <accessible-name>
  --label <label>
  --placeholder <placeholder>
  --title <title>
  --test-id <id>
  --nth <index>
  --frame <iframe-css-selector>

Examples:
  node tools/playwright/cli.js session start --name work --headless false
  node tools/playwright/cli.js session start --name work --headless false --executable-path /usr/bin/google-chrome
  node tools/playwright/cli.js goto https://example.com --session work
  node tools/playwright/cli.js text --selector main --session work
  node tools/playwright/cli.js click --selector ".card" --nth 0 --frame iframe --session work
  node tools/playwright/cli.js screenshot --session work --out downloads/playwright/example.png
  node tools/playwright/cli.js text --url https://example.com --selector main
`);
}

async function runSessionServer(args) {
  const options = parseOptions(args);
  const name = options.name || DEFAULT_SESSION;
  const port = Number(options.port);
  const token = options.token;
  if (!port || !token) usageError("Session server requires --port and --token");
  const { chromium } = loadPlaywright();
  ensureDir(SESSIONS_DIR);
  ensureDir(PROFILES_DIR);
  const headless = boolOption(options.headless, false);
  const contextOptions = { headless };
  const viewport = parseViewport(options.viewport);
  if (viewport) contextOptions.viewport = viewport;
  if (options["user-agent"] && options["user-agent"] !== true) contextOptions.userAgent = options["user-agent"];
  if (options["executable-path"] && options["executable-path"] !== true) {
    contextOptions["executable-path"] = options["executable-path"];
  }
  const profile = options.profile && options.profile !== true ? options.profile : name;
  const profileDir = profilePath(profile);
  ensureDir(profileDir);
  let context;
  let page;
  try {
    context = await chromium.launchPersistentContext(profileDir, chromiumLaunchOptions(contextOptions));
    page = context.pages()[0] || (await context.newPage());
    context.on("page", (newPage) => {
      page = newPage;
    });
  } catch (err) {
    if (isBrowserMissing(err)) {
      console.error("Playwright browser binaries are missing. Run: npx playwright install chromium");
      process.exit(EXIT_DEPENDENCY);
    }
    throw err;
  }
  const metadata = {
    session: name,
    pid: process.pid,
    port,
    token,
    headless,
    profile,
    executable_path: options["executable-path"] && options["executable-path"] !== true ? options["executable-path"] : null,
    started_at: new Date().toISOString(),
  };
  fs.writeFileSync(sessionPath(name), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });

  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    if (req.headers["x-playwright-cli-token"] !== token) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = raw ? JSON.parse(raw) : {};
        if (payload.command === "status") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              session: name,
              running: true,
              pid: process.pid,
              port,
              headless,
              url: page.url(),
              title: await page.title(),
              last_activity: new Date().toISOString(),
            })
          );
          return;
        }
        if (payload.command === "tabs") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ tabs: await listTabs(context, page), ok: true }));
          return;
        }
        if (payload.command === "tab") {
          const tabOptions = payload.options || {};
          if (tabOptions.action !== "use") {
            throw new Error("Usage: node tools/playwright/cli.js tab use --index <n>");
          }
          const index = integerOption(tabOptions.index, "--index");
          const pages = context.pages();
          if (index >= pages.length) {
            throw new Error(`Invalid tab index ${tabOptions.index}. Run tabs first.`);
          }
          page = pages[index];
          await page.bringToFront().catch(() => {});
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              tab: index,
              url: page.url(),
              title: await page.title(),
              ok: true,
            })
          );
          return;
        }
        if (payload.command === "stop") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          server.close(async () => {
            await context.close();
            fs.rmSync(sessionPath(name), { force: true });
            process.exit(0);
          });
          return;
        }
        const result = await runAction(page, payload.command, payload.options || {});
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  });

  server.listen(port, "127.0.0.1");
}

async function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    help();
    return;
  }
  if (command === "__session-server") {
    await runSessionServer([subcommand, ...rest].filter(Boolean));
    return;
  }
  if (command === "session") {
    if (subcommand === "start") return startSession(rest);
    if (subcommand === "status") return sessionStatus(rest);
    if (subcommand === "stop") return stopSession(rest);
    usageError("Usage: node tools/playwright/cli.js session start|status|stop");
  }
  if (command === "flow") return runFlow([subcommand, ...rest].filter(Boolean));
  if (command === "tabs") {
    const options = parseOptions([subcommand, ...rest].filter(Boolean));
    const result = await requestSession(options.session || DEFAULT_SESSION, {
      command: "tabs",
      options,
    });
    writeOutput(result, options);
    return;
  }
  if (command === "tab") {
    const options = parseOptions(rest);
    if (subcommand !== "use") usageError("Usage: node tools/playwright/cli.js tab use --index <n> [--session default]");
    options.action = "use";
    const result = await requestSession(options.session || DEFAULT_SESSION, {
      command: "tab",
      options,
    });
    writeOutput(result, options);
    return;
  }
  const pageCommands = new Set([
    "goto",
    "click",
    "fill",
    "press",
    "select",
    "check",
    "uncheck",
    "wait",
    "text",
    "html",
    "links",
    "exists",
    "screenshot",
    "snapshot",
  ]);
  if (pageCommands.has(command)) return commandWithPage(command, [subcommand, ...rest].filter(Boolean));
  usageError(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
