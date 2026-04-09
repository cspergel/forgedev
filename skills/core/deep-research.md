---
name: deep-research
description: 8-phase research pipeline, source credibility scoring (0-100), self-critique, structured output for architecture decisions
when_to_use: During research tasks — package evaluation, architecture pattern selection, technology comparison
priority: 85
source: 199-biotechnologies
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [researcher]
tech_filter: []
---

# Deep Research

## 8-Phase Pipeline

Execute phases sequentially. Never skip phases. Output each phase's result before proceeding.

### Phase 1: Question Decomposition
Break the research question into 3-5 atomic sub-questions. Each must be independently answerable.

Example: "Should we use Supabase or Firebase?" decomposes to:
- What are the auth capabilities of each?
- What are the pricing models at our expected scale?
- What are the migration paths if we outgrow the service?
- What are the TypeScript DX differences?

### Phase 2: Source Identification
For each sub-question, identify 3+ sources. Prioritize:
1. Official documentation (score 90-100)
2. GitHub repo metrics and changelogs (score 80-90)
3. Benchmark posts with reproducible methodology (score 60-80)
4. Community consensus (Stack Overflow, HN with 50+ upvotes) (score 40-60)
5. Individual blog posts (score 20-40)

### Phase 3: Source Credibility Scoring

Score every source 0-100:

| Factor | Weight | Scoring |
|--------|--------|---------|
| Recency | 30% | <6mo: 100, 6-12mo: 70, 1-2y: 40, 2y+: 10 |
| Authority | 25% | Official docs: 100, Core maintainer: 80, Active contributor: 60, Blogger: 30 |
| Reproducibility | 25% | Benchmarks with code: 100, Screenshots: 50, Claims only: 10 |
| Consensus | 20% | 3+ sources agree: 100, 2 agree: 60, Single source: 20 |

**Minimum threshold:** Discard sources scoring below 40. Flag conclusions based on a single source.

### Phase 4: Evidence Collection
For each sub-question, extract concrete evidence:
- Exact version numbers and dates
- Quantitative metrics (bundle size, latency, downloads)
- Code examples demonstrating the pattern
- Known limitations and failure modes

### Phase 5: Contradiction Analysis
Identify where sources disagree. For each contradiction:
- State both positions with their source scores
- Identify the likely cause (outdated info, different context, bias)
- Resolve with: higher-scored source wins, or flag as unresolved

### Phase 6: Self-Critique
Challenge your own emerging conclusions:
- What would change this recommendation? (scale, team size, timeline)
- What am I not seeing? (hidden costs, migration pain, lock-in)
- Is there a simpler option I dismissed too early?
- Am I biased toward familiarity?

### Phase 7: Synthesis
Produce a structured recommendation:

```markdown
## Recommendation: [Choice]
**Confidence:** [HIGH/MEDIUM/LOW] (based on source scores)
**Context:** [When this applies]

### Evidence Summary
- [Key finding 1 — source score X]
- [Key finding 2 — source score Y]

### Risks
- [Risk 1 — mitigation]

### Alternatives Considered
- [Option B — why not]
```

### Phase 8: Actionable Output
Convert research into artifacts the pipeline can consume:
- Package selections with pinned versions
- Architecture decision record (pattern chosen + rationale)
- Configuration snippets ready for implementation
- Known gotchas list for the builder agent

## Research Anti-Patterns

- **Confirmation bias** — searching only for evidence supporting initial intuition
- **Recency bias** — choosing the newest tool over the proven one
- **Popularity bias** — npm downloads are not quality signals
- **Single-source conclusions** — always require 2+ independent sources
- **Scope creep** — answering questions that weren't asked
- **Analysis paralysis** — set a 3-option max for comparison, recommend one

## Output Format

Always structure research output as:
1. **Question** — what was asked
2. **TL;DR** — one-sentence answer
3. **Evidence** — scored sources and findings
4. **Recommendation** — with confidence level
5. **Artifacts** — ready-to-use outputs for downstream agents
