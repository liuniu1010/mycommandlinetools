"use strict";

const path = require("path");

const tools = {
  freelancer: {
    command: "freelancer-cli",
    path: path.join(__dirname, "tools", "freelancer", "cli.js"),
  },
  gcalendar: {
    command: "gcalendar-cli",
    path: path.join(__dirname, "tools", "gcalendar", "cli.js"),
  },
  gdrive: {
    command: "gdrive-cli",
    path: path.join(__dirname, "tools", "gdrive", "cli.js"),
  },
  gmail: {
    command: "gmail-cli",
    path: path.join(__dirname, "tools", "gmail", "cli.js"),
  },
  linkedin: {
    command: "linkedin-cli",
    path: path.join(__dirname, "tools", "linkedin", "cli.js"),
  },
  notion: {
    command: "notion-cli",
    path: path.join(__dirname, "tools", "notion", "cli.js"),
  },
  onedrive: {
    command: "onedrive-cli",
    path: path.join(__dirname, "tools", "onedrive", "cli.js"),
  },
  outlook: {
    command: "outlook-cli",
    path: path.join(__dirname, "tools", "outlook", "cli.js"),
  },
  upwork: {
    command: "upwork-cli",
    path: path.join(__dirname, "tools", "upwork", "cli.js"),
  },
};

module.exports = {
  tools,
};
