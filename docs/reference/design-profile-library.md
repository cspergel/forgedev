# Design Profile Library

ForgePlan can import DESIGN.md inspiration profiles from getdesign.md and compose them with local project design docs.

Quick inspection:

```bash
node scripts/list-design-profiles.js
node scripts/list-design-profiles.js --search vercel
node scripts/list-design-profiles.js --category "AI & LLM Platforms"
```

Usage in `.forgeplan/config.yaml`:

```yaml
design:
  profiles:
    - operations-command-center
    - awesome/vercel
  mixins:
    - awesome/linear.app
    - awesome/notion
  blend_notes: >
    Keep Vercel's precision, borrow Linear's density, and use Notion only for editorial softness.
```

Rules:

- The first `design.profiles` entry is the primary north star.
- `design.mixins` are secondary influences, not co-equal replacements.
- Local `DESIGN.md` files override imported profiles on direct conflict.
- Keep one coherent palette, typography system, and interaction tone.

Imported profiles: 66
Source terms: https://getdesign.md/terms

## E-commerce & Retail

- `awesome/airbnb` - Travel marketplace. Warm coral accent, photography-driven, rounded UI
- `awesome/meta` - Tech retail store. Photography-first, binary light/dark surfaces, Meta Blue CTAs
- `awesome/nike` - Athletic retail. Monochrome UI, massive uppercase Futura, full-bleed photography
- `awesome/shopify` - E-commerce platform. Dark-first cinematic, neon green accent, ultra-light display type

## Design & Creative Tools

- `awesome/airtable` - Spreadsheet-database hybrid. Colorful, friendly, structured data aesthetic
- `awesome/clay` - Creative agency. Organic shapes, soft gradients, art-directed layout
- `awesome/figma` - Collaborative design tool. Vibrant multi-color, playful yet professional
- `awesome/framer` - Website builder. Bold black and blue, motion-first, design-forward
- `awesome/miro` - Visual collaboration. Bright yellow accent, infinite canvas aesthetic
- `awesome/webflow` - Visual web builder. Blue-accented, polished marketing site aesthetic

## Media & Consumer Tech

- `awesome/apple` - Consumer electronics. Premium white space, SF Pro, cinematic imagery
- `awesome/ibm` - Enterprise technology. Carbon design system, structured blue palette
- `awesome/nvidia` - GPU computing. Green-black energy, technical power aesthetic
- `awesome/pinterest` - Visual discovery platform. Red accent, masonry grid, image-first
- `awesome/playstation` - Gaming console retail. Three-surface channel layout, cyan hover-scale interaction
- `awesome/spacex` - Space technology. Stark black and white, full-bleed imagery, futuristic
- `awesome/spotify` - Music streaming. Vibrant green on dark, bold type, album-art-driven
- `awesome/theverge` - Tech editorial media. Acid-mint and ultraviolet accents, Manuka display type
- `awesome/uber` - Mobility platform. Bold black and white, tight type, urban energy
- `awesome/wired` - Tech magazine. Paper-white broadsheet density, custom serif, ink-blue links

## Fintech & Crypto

- `awesome/binance` - Crypto exchange. Bold Binance Yellow on monochrome, trading-floor urgency
- `awesome/coinbase` - Crypto exchange. Clean blue identity, trust-focused, institutional feel
- `awesome/kraken` - Crypto trading platform. Purple-accented dark UI, data-dense dashboards
- `awesome/revolut` - Digital banking. Sleek dark interface, gradient cards, fintech precision
- `awesome/stripe` - Payment infrastructure. Signature purple gradients, weight-300 elegance
- `awesome/wise` - International money transfer. Bright green accent, friendly and clear

## Automotive

- `awesome/bmw` - Luxury automotive. Dark premium surfaces, precise German engineering aesthetic
- `awesome/bugatti` - Luxury hypercar. Cinema-black canvas, monochrome austerity, monumental display type
- `awesome/ferrari` - Luxury automotive. Chiaroscuro black-white editorial, Ferrari Red with extreme sparseness
- `awesome/lamborghini` - Luxury automotive. True black cathedral, gold accent, LamboType custom Neo-Grotesk
- `awesome/renault` - French automotive. Vivid aurora gradients, NouvelR proprietary typeface, zero-radius buttons
- `awesome/tesla` - Electric vehicles. Radical subtraction, cinematic full-viewport photography, Universal Sans

## Productivity & SaaS

- `awesome/cal` - Open-source scheduling. Clean neutral UI, developer-oriented simplicity
- `awesome/intercom` - Customer messaging. Friendly blue palette, conversational UI patterns
- `awesome/linear.app` - Project management for engineers. Ultra-minimal, precise, purple accent
- `awesome/mintlify` - Documentation platform. Clean, green-accented, reading-optimized
- `awesome/notion` - All-in-one workspace. Warm minimalism, serif headings, soft surfaces
- `awesome/resend` - Email API for developers. Minimal dark theme, monospace accents
- `awesome/zapier` - Automation platform. Warm orange, friendly illustration-driven

## AI & LLM Platforms

- `awesome/claude` - Anthropic's AI assistant. Warm terracotta accent, clean editorial layout
- `awesome/cohere` - Enterprise AI platform. Vibrant gradients, data-rich dashboard aesthetic
- `awesome/elevenlabs` - AI voice platform. Dark cinematic UI, audio-waveform aesthetics
- `awesome/minimax` - AI model provider. Bold dark interface with neon accents
- `awesome/mistral.ai` - Open-weight LLM provider. French-engineered minimalism, purple-toned
- `awesome/ollama` - Run LLMs locally. Terminal-first, monochrome simplicity
- `awesome/opencode.ai` - AI coding platform. Developer-centric dark theme
- `awesome/replicate` - Run ML models via API. Clean white canvas, code-forward
- `awesome/runwayml` - AI video generation. Cinematic dark UI, media-rich layout
- `awesome/together.ai` - Open-source AI infrastructure. Technical, blueprint-style design
- `awesome/voltagent` - AI agent framework. Void-black canvas, emerald accent, terminal-native
- `awesome/x.ai` - Elon Musk's AI lab. Stark monochrome, futuristic minimalism

## Backend, Database & DevOps

- `awesome/clickhouse` - Fast analytics database. Yellow-accented, technical documentation style
- `awesome/composio` - Tool integration platform. Modern dark with colorful integration icons
- `awesome/hashicorp` - Infrastructure automation. Enterprise-clean, black and white
- `awesome/mongodb` - Document database. Green leaf branding, developer documentation focus
- `awesome/posthog` - Product analytics. Playful hedgehog branding, developer-friendly dark UI
- `awesome/sanity` - Headless CMS. Red accent, content-first editorial layout
- `awesome/sentry` - Error monitoring. Dark dashboard, data-dense, pink-purple accent
- `awesome/supabase` - Open-source Firebase alternative. Dark emerald theme, code-first

## Developer Tools & IDEs

- `awesome/cursor` - AI-first code editor. Sleek dark interface, gradient accents
- `awesome/expo` - React Native platform. Dark theme, tight letter-spacing, code-centric
- `awesome/lovable` - AI full-stack builder. Playful gradients, friendly dev aesthetic
- `awesome/raycast` - Productivity launcher. Sleek dark chrome, vibrant gradient accents
- `awesome/superhuman` - Fast email client. Premium dark UI, keyboard-first, purple glow
- `awesome/vercel` - Frontend deployment platform. Black and white precision, Geist font
- `awesome/warp` - Modern terminal. Dark IDE-like interface, block-based command UI

