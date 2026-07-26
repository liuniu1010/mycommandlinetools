#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");

const JOBS_SEARCH_URL = "https://www.linkedin.com/jobs/search/";
const DEVELOPER_APPS_URL = "https://www.linkedin.com/developers/apps";

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

function openBrowser(url) {
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(opener, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
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
  node tools/linkedin/cli.js search "keywords" [--location "Auckland, New Zealand"] [--open]
  node tools/linkedin/cli.js search "keywords" [--date day|week|month]
  node tools/linkedin/cli.js search "keywords" [--workplace remote|hybrid|onsite]
  node tools/linkedin/cli.js search "keywords" [--type full-time|part-time|contract|temporary|internship|volunteer|other]
  node tools/linkedin/cli.js search "keywords" [--experience entry|associate|mid|senior|director|executive]
  node tools/linkedin/cli.js developer

Examples:
  node tools/linkedin/cli.js search "java spring boot" --location "Auckland, New Zealand" --date week --open
  node tools/linkedin/cli.js search "ai agent" --workplace remote,hybrid --type contract --experience senior

Notes:
  This tool opens LinkedIn's own job search pages. It does not scrape LinkedIn,
  automate your account, or call restricted LinkedIn Talent APIs.
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }
  if (command === "search") return search(args);
  if (command === "developer") return openDeveloperApps();
  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
