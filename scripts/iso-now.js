#!/usr/bin/env node
"use strict";

const iso = new Date().toISOString();
const compact = iso.replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");

process.stdout.write(
  JSON.stringify(
    {
      iso,
      compact,
    },
    null,
    2
  ) + "\n"
);
