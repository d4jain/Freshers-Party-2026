# Development tooling: what was requested, what was used

Checked on 26 Sep 2026 on the build machine. “Used” means actually applied in
this repository; nothing here is claimed from memory.

## Motion Primitives — used

- Source: https://motion-primitives.com/docs · CLI `motion-primitives@0.1.0`
  (`npx motion-primitives@latest add <component>`, per the official installation page).
- Installed: `text-effect`, `animated-group`, `in-view`, `accordion`,
  `transition-panel`, `carousel`, `sliding-number` → `src/components/motion-primitives/`.
- Where: hero title entrance (TextEffect), staggered experience reveal
  (AnimatedGroup, in-view), section reveals (InView), FAQ (Accordion), booking
  steps (TransitionPanel), glimpses gallery (Carousel), countdown digits (SlidingNumber).
- Adaptations (documented in file headers): accordion rebuilt around context
  with `aria-controls`/`region`, content kept in SSR HTML and `inert` when
  closed; AnimatedGroup gained `inView` + `itemClassNames` and typed element
  lookup; carousel index sync moved out of an effect; hydration-safe reduced
  motion everywhere; demo styles replaced by the champagne/midnight tokens.
  Custom (not primitives): cursor glitter canvas, bottle-pop animation.

## Haikei — awaiting exports

Haikei (https://haikei.app/) is a browser app. Its Terms of Service prohibit
“any robot, spider, or other automatic device, process, or means to access
Service”, so it was **not** automated. `public/media/decor/` contains
**temporary hand-made SVG placeholders** (not Haikei output) with the exact
exports requested in `public/media/decor/HAIKEI_EXPORTS.md`.

## TasteSkill · WebDesign Guidelines · Awesome Design — not installed / ambiguous

None of these were installed in `~/.claude/skills` or project skills, and no
source links were supplied, so **none were loaded or applied**. The design
review was done without them. Possible sources (please confirm which you meant):

| Requested | Candidates found (unconfirmed) |
|---|---|
| TasteSkill | `Leonxlnx/taste-skill` (most likely); also `senlindesign/taste-skill`, `h3nryprod01/design-taste` |
| WebDesign Guidelines | `vercel-labs/agent-skills` → `web-design-guidelines` (installs with `npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines`) |
| Awesome Design | ambiguous: `VoltAgent/awesome-design-md`, `VoltAgent/awesome-claude-design`, `bergside/awesome-design-skills` |

Once installed, re-run a design audit with them against `src/app` and `src/components`.

## OmniRoute — installed, server offline (awaiting setup)

- Found: global npm package `omniroute@3.8.50`
  (repo https://github.com/diegosouzapw/OmniRoute, homepage https://omniroute.online),
  data dir `~/.omniroute` (config present).
- What it is: an AI **gateway/router** (OpenAI/Anthropic-compatible endpoint on
  `localhost:20128`) with an **MCP server** — not a native Claude Code plugin.
  Its README documents two Claude Code paths:
  1. **MCP (used here):** HTTP transport at `http://localhost:20128/api/mcp/stream`
     (or stdio via `omniroute --mcp`). This repo ships `.mcp.json` registering it
     as a project-scoped MCP server. Claude Code asks for approval before using
     project servers. Override the URL with `OMNIROUTE_MCP_URL`. If you enable
     OmniRoute API-key auth, add the header locally, e.g.
     `claude mcp add --transport http omniroute http://localhost:20128/api/mcp/stream --header "Authorization: Bearer $OMNIROUTE_API_KEY" --scope local`.
     (The README's `claude mcp add-server … --type http` spelling doesn't match
     current Claude Code docs; use `claude mcp add --transport http`.)
  2. **Gateway routing** (`omniroute run claude`, or pointing Claude Code's base
     URL at OmniRoute) — **deliberately not configured**: it would change the
     model provider path and could send project data to other providers.
- Connectivity check: `npm run omniroute:check` (runs `omniroute doctor`).
  Result on 26 Sep 2026: config, database, runtime and native deps **OK**;
  **server liveness failed — server offline**. So the integration is
  **not active**. Start it yourself with `omniroute serve` when you want it,
  then re-run the check and approve the MCP server in Claude Code.
- No keys were created, no provider/default model changed, no paid routing
  enabled, nothing stored in the repo. The website never depends on OmniRoute.
