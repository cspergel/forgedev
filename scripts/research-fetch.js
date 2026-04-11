#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function usage() {
  console.error(
    "Usage:\n" +
    "  node scripts/research-fetch.js url <url> [--out <file>]\n" +
    "  node scripts/research-fetch.js npm-search <query> [--size <n>] [--out <file>]\n" +
    "  node scripts/research-fetch.js npm-package <package-name> [--out <file>]\n" +
    "  node scripts/research-fetch.js npm-downloads <package-name> [--out <file>]"
  );
  process.exit(2);
}

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return null;
  }
  return process.argv[index + 1];
}

function maybeWriteOutput(outPath, content) {
  if (!outPath) {
    return;
  }
  const absPath = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, "utf-8");
}

function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|h5|h6|li|tr|td|th)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "forgeplan-research-fetch/0.1",
      "accept": "application/json, text/plain, text/html;q=0.9, */*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  if (contentType.includes("text/html")) {
    return stripHtml(body);
  }
  return body;
}

async function main() {
  const mode = process.argv[2];
  const value = process.argv[3];
  const outPath = getArg("--out");

  if (!mode || !value) {
    usage();
  }

  let output;
  if (mode === "url") {
    output = await fetchText(value);
  } else if (mode === "npm-search") {
    const size = Number(getArg("--size") || "10");
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(value)}&size=${encodeURIComponent(size)}`;
    output = await fetchText(url);
  } else if (mode === "npm-package") {
    const url = `https://registry.npmjs.org/${encodeURIComponent(value)}`;
    output = await fetchText(url);
  } else if (mode === "npm-downloads") {
    const url = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(value)}`;
    output = await fetchText(url);
  } else {
    usage();
  }

  maybeWriteOutput(outPath, output);
  process.stdout.write(output);
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
