// Skill Learner — Pattern Detection Engine
// Portable microservice: depends only on fs, path, crypto
// Can be extracted as standalone Claude Code plugin
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Detect recurring code patterns across files.
 * Returns patterns that appear 3+ times.
 *
 * @param {string[]} files - Array of file paths to analyze
 * @param {Object} options - Detection options
 * @param {number} options.minOccurrences - Minimum times a pattern must appear (default: 3)
 * @param {string[]} options.exclude - Glob patterns to exclude
 * @returns {{ patterns: Pattern[], stats: { filesScanned: number, patternsFound: number } }}
 */
function detectPatterns(files, options = {}) {
  const minOccurrences = options.minOccurrences || 3;
  const patterns = {};

  for (const filePath of files) {
    let content;
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 100 * 1024) continue; // skip files >100KB (generated/bundled)
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue; // skip unreadable files
    }

    // Extract structural patterns
    extractImportClusters(content, filePath, patterns);
    extractMiddlewarePatterns(content, filePath, patterns);
    extractErrorHandlingPatterns(content, filePath, patterns);
    extractValidationPatterns(content, filePath, patterns);
    extractRoutePatterns(content, filePath, patterns);
    extractComponentPatterns(content, filePath, patterns);
  }

  // Filter to patterns with minOccurrences+ hits
  const recurring = Object.entries(patterns)
    .filter(([_, p]) => p.occurrences.length >= minOccurrences)
    .map(([key, p]) => ({
      id: key,
      type: p.type,
      description: p.description,
      occurrences: p.occurrences,
      count: p.occurrences.length,
      exampleCode: p.exampleCode,
      hash: crypto.createHash("sha256").update(key + p.type).digest("hex").slice(0, 12),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    patterns: recurring,
    stats: { filesScanned: files.length, patternsFound: recurring.length },
  };
}

// --- Pattern extractors ---

function extractImportClusters(content, filePath, patterns) {
  const imports = [];
  const importRegex = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
  let match;
  while ((match = importRegex.exec(content))) {
    imports.push(match[1] || match[2]);
  }
  if (imports.length < 2) return;

  // Sort imports for consistent keys, take top 5
  const key = imports.sort().slice(0, 5).join("+");
  const patternKey = `import-cluster:${key}`;
  if (!patterns[patternKey]) {
    patterns[patternKey] = {
      type: "import-cluster",
      description: `Files importing: ${imports.slice(0, 5).join(", ")}`,
      occurrences: [],
      exampleCode: imports.map(i => `import ... from "${i}";`).join("\n"),
    };
  }
  patterns[patternKey].occurrences.push(filePath);
}

function extractMiddlewarePatterns(content, filePath, patterns) {
  // Express-style middleware: (req, res, next) =>
  const middlewareRegex = /(?:async\s+)?(?:function\s+\w+)?\s*\(\s*req\s*,\s*res\s*(?:,\s*next)?\s*\)/g;
  const matches = content.match(middlewareRegex);
  if (!matches || matches.length === 0) return;

  const patternKey = "middleware:express-handler";
  if (!patterns[patternKey]) {
    patterns[patternKey] = {
      type: "middleware",
      description: "Express-style route handler (req, res, next)",
      occurrences: [],
      exampleCode: matches[0],
    };
  }
  patterns[patternKey].occurrences.push(filePath);
}

function extractErrorHandlingPatterns(content, filePath, patterns) {
  // try/catch with specific response patterns
  const tryCatchRegex = /try\s*\{[\s\S]*?\}\s*catch\s*\(\w+\)\s*\{[\s\S]*?(?:res\.status|next\(|throw|console\.error)/g;
  const matches = content.match(tryCatchRegex);
  if (!matches) return;

  // Classify by response pattern
  if (/res\.status\(\d+\)\.json/.test(content)) {
    const patternKey = "error-handling:json-response";
    if (!patterns[patternKey]) {
      patterns[patternKey] = {
        type: "error-handling",
        description: "Try/catch with JSON error response (res.status().json())",
        occurrences: [],
        exampleCode: "try { ... } catch (err) { res.status(500).json({ error: err.message }); }",
      };
    }
    patterns[patternKey].occurrences.push(filePath);
  }
  if (/next\(\s*(?:err|error|e)\s*\)/.test(content)) {
    const patternKey = "error-handling:next-error";
    if (!patterns[patternKey]) {
      patterns[patternKey] = {
        type: "error-handling",
        description: "Try/catch forwarding to error middleware (next(err))",
        occurrences: [],
        exampleCode: "try { ... } catch (err) { next(err); }",
      };
    }
    patterns[patternKey].occurrences.push(filePath);
  }
}

function extractValidationPatterns(content, filePath, patterns) {
  // Zod schema usage
  if (/z\.\w+\(\)/.test(content) && /\.parse\(|\.safeParse\(/.test(content)) {
    const patternKey = "validation:zod-parse";
    if (!patterns[patternKey]) {
      patterns[patternKey] = {
        type: "validation",
        description: "Zod schema validation with parse/safeParse",
        occurrences: [],
        exampleCode: "const schema = z.object({ ... }); const result = schema.safeParse(input);",
      };
    }
    patterns[patternKey].occurrences.push(filePath);
  }
}

function extractRoutePatterns(content, filePath, patterns) {
  // Express route definitions
  const routeRegex = /(?:app|router)\.(get|post|put|patch|delete)\s*\(/g;
  const methods = new Set();
  let match;
  while ((match = routeRegex.exec(content))) {
    methods.add(match[1]);
  }
  if (methods.size === 0) return;

  const patternKey = `route:express-${[...methods].sort().join("+")}`;
  if (!patterns[patternKey]) {
    patterns[patternKey] = {
      type: "route",
      description: `Express routes using: ${[...methods].join(", ")}`,
      occurrences: [],
      exampleCode: [...methods].map(m => `router.${m}("/path", handler);`).join("\n"),
    };
  }
  patterns[patternKey].occurrences.push(filePath);
}

function extractComponentPatterns(content, filePath, patterns) {
  // React component with hooks
  if (/import.*React|from\s+['"]react['"]/.test(content)) {
    const hooks = [];
    if (/useState/.test(content)) hooks.push("useState");
    if (/useEffect/.test(content)) hooks.push("useEffect");
    if (/useQuery|useSWR/.test(content)) hooks.push("data-fetching");
    if (/useForm/.test(content)) hooks.push("useForm");

    if (hooks.length >= 2) {
      const patternKey = `component:react-${hooks.sort().join("+")}`;
      if (!patterns[patternKey]) {
        patterns[patternKey] = {
          type: "component",
          description: `React component using: ${hooks.join(", ")}`,
          occurrences: [],
          exampleCode: hooks.map(h => `const [...] = ${h}(...);`).join("\n"),
        };
      }
      patterns[patternKey].occurrences.push(filePath);
    }
  }
}

module.exports = { detectPatterns };
