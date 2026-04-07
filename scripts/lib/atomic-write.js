// scripts/lib/atomic-write.js
// Shared atomic JSON write utility — write to .tmp, rename to final.
// Extracted from post-tool-use.js, stop-hook.js, session-start.js (Sprint 9).
"use strict";
const fs = require("fs");

function atomicWriteJson(filePath, data) {
  const tmp = filePath + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    try {
      fs.renameSync(tmp, filePath);
    } catch (renameErr) {
      // Windows: target may be locked by antivirus/file indexer; retry once after 200ms
      if (renameErr.code === "EPERM" || renameErr.code === "EBUSY" || renameErr.code === "EACCES") {
        const start = Date.now();
        while (Date.now() - start < 200) { /* busy wait */ }
        fs.renameSync(tmp, filePath);
      } else {
        throw renameErr;
      }
    }
  } catch (err) {
    // Clean up .tmp file on failure
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore cleanup errors */ }
    throw err;
  }
}

module.exports = { atomicWriteJson };
