---
name: confidence-scoring
description: 0-100 confidence scoring on judgment dimensions, calibration rules, uncertainty quantification for code review findings
when_to_use: During review to quantify certainty on findings, filter low-confidence noise, and communicate review quality
priority: 80
source: Anthropic methodology
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [reviewer]
tech_filter: []
---

# Confidence Scoring

## Purpose

Every review finding carries a confidence score (0-100). Findings below 75 are filtered in Phase 3 of the sweep pipeline. This prevents low-conviction noise from consuming fix cycles.

## Scoring Dimensions

Rate each dimension independently, then combine.

### 1. Evidence Strength (0-100)

| Score | Evidence Level |
|-------|---------------|
| 90-100 | Code explicitly shows the bug (wrong value, missing check, type mismatch visible) |
| 70-89 | Strong inference from code structure (pattern is known-bad, missing guard clause) |
| 50-69 | Circumstantial (code could fail under specific conditions not tested) |
| 30-49 | Theoretical (possible issue, but depends on runtime behavior not visible in code) |
| 0-29 | Speculation (feels wrong, but no concrete evidence) |

### 2. Impact Certainty (0-100)

| Score | Impact Level |
|-------|-------------|
| 90-100 | Production failure guaranteed if hit (null deref, SQL injection, auth bypass) |
| 70-89 | Production failure likely under normal usage patterns |
| 50-69 | Failure under edge cases or specific configurations |
| 30-49 | Degraded experience, not a failure (slow, ugly, confusing) |
| 0-29 | Cosmetic or theoretical performance issue |

### 3. Spec Alignment (0-100)

| Score | Alignment |
|-------|-----------|
| 90-100 | Spec explicitly requires this and code violates it (cite the AC) |
| 70-89 | Spec implies this through related requirements |
| 50-69 | Industry best practice, but spec is silent |
| 30-49 | Opinion-based improvement |
| 0-29 | Style preference |

### 4. Reproducibility (0-100)

| Score | Reproducibility |
|-------|----------------|
| 90-100 | Can construct a specific input/call sequence that triggers the issue |
| 70-89 | Can describe the triggering condition precisely |
| 50-69 | Knows the general category of trigger but not exact sequence |
| 30-49 | Issue depends on external state (race condition, timing, environment) |
| 0-29 | Cannot articulate when this would actually happen |

## Combining Scores

```
confidence = (evidence * 0.35) + (impact * 0.25) + (spec_alignment * 0.25) + (reproducibility * 0.15)
```

Weights reflect that evidence is most important (is it real?), impact and spec alignment share second priority (does it matter?), and reproducibility is supporting context.

## Thresholds

| Range | Action |
|-------|--------|
| 90-100 | Report as-is. High-conviction finding. |
| 75-89 | Report with recommendation. Solid finding. |
| 50-74 | **Filtered in Phase 3.** Log for reference but do not include in findings report. |
| 25-49 | Discard. Insufficient evidence. |
| 0-24 | Not a finding. Do not mention. |

## Calibration Rules

### Raise Confidence When:
- Multiple independent code paths exhibit the same issue (+10)
- The issue matches a known CVE or documented vulnerability pattern (+15)
- A test exists that SHOULD catch this but doesn't (+10)
- The same finding was flagged by another agent independently (+10)

### Lower Confidence When:
- You haven't read the full calling context (-15)
- The "issue" might be intentional (documented, commented, behind feature flag) (-20)
- The framework/library might handle this automatically (-15)
- You're extrapolating from one example to claim a pattern (-10)
- The issue requires a specific runtime configuration you can't verify (-10)

## Output Format

Every finding includes its score breakdown:

```markdown
## [HIGH] Missing input validation on /api/users/:id — auth.controller.ts:45

**Confidence: 88/100**
- Evidence: 95 (no validation visible in handler or middleware chain)
- Impact: 85 (IDOR if id is not checked against session user)
- Spec: 80 (spec AC-3 requires "user can only access own resources")
- Reproducibility: 90 (GET /api/users/other-user-id with valid session)

**Finding:** The route handler passes `req.params.id` directly to `userService.getById()` without checking that the requesting user owns this resource.
```

## Anti-Patterns in Confidence Scoring

### Confidence Inflation
- Scoring 90+ because the fix is easy (ease of fix is not evidence of bug)
- Scoring 90+ on style issues because you feel strongly about them
- Scoring 90+ on "missing best practice" when code works correctly

### Confidence Deflation
- Scoring 50 on a real bug because you're "not sure" (if code shows the bug, score evidence 90+)
- Scoring low because the issue is in someone else's domain
- Scoring low to avoid conflict

### False Precision
- Don't agonize over 82 vs 84. Round to nearest 5.
- The threshold (75) is what matters, not the exact number.
- Two reviewers scoring the same finding should be within 15 points of each other.

## Batch Calibration

After scoring all findings for a review, do a calibration pass:

1. Sort by confidence descending
2. Check: Is your highest-confidence finding really the most certain?
3. Check: Is your lowest-confidence finding really the least certain?
4. Adjust outliers that seem mis-ranked relative to peers
5. Verify no more than 30% of findings are below threshold (if so, your review may be fishing)
