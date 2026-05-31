#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const TOOLS_DIR = path.join(ROOT, "tools");

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.copyFileSync(path.join(ROOT, "index.js"), path.join(DIST, "index.js"));

for (const entry of fs.readdirSync(TOOLS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const source = path.join(TOOLS_DIR, entry.name);
  const target = path.join(DIST, "tools", entry.name);
  fs.mkdirSync(target, { recursive: true });
  for (const file of fs.readdirSync(source)) {
    if (file === ".token.json") continue;
    const sourceFile = path.join(source, file);
    const targetFile = path.join(target, file);
    if (fs.statSync(sourceFile).isFile()) fs.copyFileSync(sourceFile, targetFile);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const distPackage = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  type: packageJson.type,
  bin: packageJson.bin,
  dependencies: packageJson.dependencies,
};

fs.writeFileSync(path.join(DIST, "package.json"), `${JSON.stringify(distPackage, null, 2)}\n`);
console.log(`Built CLI package files in ${path.relative(ROOT, DIST)}/.`);
