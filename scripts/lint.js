#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CHECKED_FILES = [
  "tools/gmail/cli.js",
  "tools/upwork/cli.js",
  "scripts/build.js",
  "scripts/lint.js",
  "scripts/type-check.js",
];

let failures = 0;

function fail(file, message) {
  failures += 1;
  console.error(`${file}: ${message}`);
}

for (const relative of CHECKED_FILES) {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) continue;

  const source = fs.readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);

  if (!source.includes('"use strict";')) {
    fail(relative, 'missing "use strict";');
  }
  lines.forEach((line, index) => {
    if (line.includes("\t")) fail(relative, `line ${index + 1}: tabs are not allowed`);
    if (/[ \t]$/.test(line)) fail(relative, `line ${index + 1}: trailing whitespace`);
  });

  if (relative.startsWith("tools/") && !source.startsWith("#!/usr/bin/env node")) {
    fail(relative, "CLI entrypoint must start with a Node shebang");
  }
}

if (failures > 0) process.exit(1);
console.log("Lint checks passed.");
