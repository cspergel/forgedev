---
name: managing-dependencies
description: Supply chain risk assessment, transitive depth analysis, bus factor evaluation, typosquatting detection for dependency decisions
when_to_use: During research to evaluate packages for security, reliability, and long-term maintenance risk
priority: 80
source: andrew
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [researcher]
tech_filter: []
---

# Managing Dependencies

## Supply Chain Risk Assessment

Every dependency is an attack surface. Evaluate before adding.

### Risk Matrix

| Factor | Low Risk | Medium Risk | High Risk |
|--------|----------|-------------|-----------|
| Weekly downloads | >1M | 100K-1M | <100K |
| Maintainers | 3+ active | 1-2 active | Single maintainer |
| Last publish | <3 months | 3-12 months | >12 months |
| Open issues ratio | <10% of total | 10-30% | >30% |
| Known CVEs | 0 | Patched within 30 days | Unpatched |
| Transitive deps | 0-5 | 6-20 | 20+ |
| Install scripts | None | Has postinstall (builds native) | Has preinstall (runs arbitrary code) |

### Evaluation Checklist
For every new dependency:
- [ ] Check npm audit / Snyk / Socket.dev for known vulnerabilities
- [ ] Read the package's `package.json` — look for `preinstall`/`postinstall` scripts
- [ ] Check GitHub stars trend (growing or dying?)
- [ ] Check last commit date (not just last publish — repo may be active)
- [ ] Look for TypeScript types (built-in preferred over @types/*)
- [ ] Check license compatibility with your project
- [ ] Count transitive dependencies (`npm ls <package> --all`)
- [ ] Check if there's a lighter alternative

## Transitive Dependency Analysis

### Depth Assessment
```bash
# Count total transitive dependencies
npm ls --all --json | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin'));
  function count(deps) {
    if (!deps) return 0;
    return Object.keys(deps).reduce((n, k) => n + 1 + count(deps[k].dependencies), 0);
  }
  console.log('Total transitive deps:', count(data.dependencies));
"

# Find which package pulls in the most transitive deps
npm ls --all 2>/dev/null | head -100
```

### Depth Thresholds

| Depth | Assessment | Action |
|-------|-----------|--------|
| 0 (direct only) | Ideal | None |
| 1-10 transitive | Normal | Audit direct deps only |
| 11-50 transitive | Elevated | Audit direct + check for known-bad transitives |
| 50+ transitive | High risk | Consider alternatives with fewer deps |
| 100+ transitive | Extreme | This dependency brings a supply chain liability |

### Duplicate Detection
Multiple versions of the same package in the tree waste bytes and can cause subtle bugs:
```bash
npm ls --all 2>/dev/null | grep -E "^[^@]+@" | sort | uniq -c | sort -rn | head -20
```

## Bus Factor Assessment

Bus factor = "how many maintainers need to disappear for this project to die?"

### Signals of Low Bus Factor
- [ ] Single GitHub contributor with >90% of commits
- [ ] No PRs merged from external contributors in the last year
- [ ] Maintainer hasn't responded to issues in >3 months
- [ ] No organization ownership (personal repo)
- [ ] No funding model (sponsorship, corporate backing)

### Bus Factor Thresholds

| Bus Factor | Risk | Action |
|-----------|------|--------|
| 1 | HIGH | Plan for fork or replacement. Document API surface used. |
| 2-3 | MEDIUM | Acceptable. Monitor activity quarterly. |
| 4+ or corporate-backed | LOW | Standard maintenance tracking. |

### Mitigation for Low Bus Factor
1. Pin exact version (not range) in package.json
2. Document which features you use (if only 10% of API, replacement is easier)
3. Fork the repo as insurance (don't publish, just preserve source)
4. Evaluate if the functionality is simple enough to internalize

## Typosquatting Detection

### Common Patterns
- Letter swap: `lodash` → `lodasch`
- Hyphen variants: `cross-env` → `crossenv`
- Scope confusion: `@angular/core` → `angular-core`
- Extra character: `express` → `expresss`
- Homoglyph: `crypt0` (zero) vs `crypto` (o)

### Verification Steps
- [ ] Package name matches official documentation exactly
- [ ] Publisher is the expected organization or maintainer
- [ ] First publish date is consistent with the project's age
- [ ] README and homepage link to the expected repository
- [ ] Download count is consistent with the project's popularity

## Dependency Decision Framework

### Add Only When
- It saves >100 lines of non-trivial code
- It solves a problem outside your domain expertise (crypto, parsing, compression)
- It has proven correctness (tests, CVE response track record)
- The maintenance cost of internalizing exceeds dependency tracking

### Internalize When
- You use <20% of the package's API
- The implementation is straightforward (<100 lines)
- The package is unmaintained or has a high bus factor risk
- You need to modify behavior the package doesn't support

### Never Add
- Packages that duplicate language builtins (left-pad, is-odd)
- Packages with preinstall scripts from unknown publishers
- Packages published in the last 30 days without established reputation
- Packages that require native compilation without clear need (use pure-JS alternatives)

## Severity Guide

| Finding | Severity |
|---------|----------|
| Dependency with unpatched CVE | CRITICAL |
| Possible typosquatting (name mismatch) | CRITICAL |
| Preinstall script from untrusted publisher | HIGH |
| Bus factor 1, critical dependency | HIGH |
| 100+ transitive dependencies from single package | MEDIUM |
| Dependency unmaintained >12 months | MEDIUM |
| Duplicate versions in dependency tree | LOW |
