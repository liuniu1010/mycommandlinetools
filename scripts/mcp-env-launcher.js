#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env");
const PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return new Map();

  const values = new Map();
  const lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function expandArgument(argument, fileValues, resolvedValues) {
  return argument.replace(PLACEHOLDER, (placeholder, name) => {
    const value = process.env[name] || fileValues.get(name);
    if (!value) {
      throw new Error(`Missing ${name} in the environment or ${ENV_FILE}`);
    }
    resolvedValues[name] = value;
    return value;
  });
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    throw new Error("Usage: mcp-env-launcher.js <command> [arguments...]");
  }

  const fileValues = readEnvFile();
  const resolvedValues = {};
  const expandedArgs = args.map((argument) =>
    expandArgument(argument, fileValues, resolvedValues)
  );
  const child = spawn(command, expandedArgs, {
    env: { ...process.env, ...resolvedValues },
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(`Unable to start ${command}: ${error.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
