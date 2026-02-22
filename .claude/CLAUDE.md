# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShogiHome is a cross-platform GUI application for Japanese chess (Shogi). It supports playing against USI protocol-compatible engines, editing/analyzing game records (kifu), and multiple file formats (KIF, KIFU, KI2, CSA, JKF). Built with Electron for desktop and also runs as a web/PWA app.

## Common Commands

```bash
# Development
npm run electron:serve    # Electron app with hot reload
npm run serve             # Web app dev server (http://localhost:5173, add ?mobile for mobile view)

# Testing
npm test                  # Run unit tests
npm run coverage          # Generate coverage report
npm run test:ui           # Interactive Vitest UI

# Building
npm run electron:build    # Electron installer
npm run electron:portable # Windows portable executable
npm run build             # Web app to docs/webapp

# Code Quality
npm run lint              # TypeScript check + ESLint fix + Prettier format
```

## Architecture

### Module Separation (Strictly Enforced)

The codebase has three main modules with **strict import boundaries** enforced by ESLint:

```
src/
├── renderer/     # Vue 3 frontend (Electron renderer / web app)
├── background/   # Electron main process (Node.js)
├── common/       # Shared types and utilities
└── command/      # CLI tools (usi-csa-bridge)
```

**Critical rules:**

- `renderer/` and `background/` cannot import from each other directly
- Only `common/` code can be imported by both renderer and background
- No relative imports using `../` (enforced by ESLint)
- No import cycles allowed

### IPC Communication

Renderer and background communicate via IPC through the preload script:

- `src/renderer/ipc/preload.ts` - Exposes safe API to renderer
- Request-response pattern for all cross-process communication

### Key Directories

- `src/renderer/view/` - Vue components
- `src/renderer/store/` - Vue 3 Composition API state management
- `src/background/usi/` - USI engine communication
- `src/background/csa/` - CSA protocol support
- `src/common/i18n/` - Internationalization (ja, en, zh_tw, vi)
- `src/common/settings/` - App/game/research settings types
- `src/tests/` - Unit tests with mock data in `testdata/`

### Translation Policy (IMPORTANT for AI tools)

**Do NOT automatically translate or suggest translations for non-Japanese/non-English locale files.**

- `src/common/i18n/locales/ja.ts` — Maintained by the developer (Japanese)
- `src/common/i18n/locales/en.ts` — Maintained by the developer (English)
- `src/common/i18n/locales/zh_tw.ts` — Maintained by a **human translator** (Traditional Chinese)
- `src/common/i18n/locales/vi.ts` — Maintained by a **human translator** (Vietnamese)

When new UI strings are added during feature development, they are written in Japanese and tagged with `// TODO: Translate` in the non-Japanese locale files. This is intentional. These `// TODO: Translate` entries must **not** be auto-translated by AI tools — they are left for human translators.

**Rules for AI tools (Claude Code, Codex, CodeRabbitAI, etc.):**
- Do not auto-translate `// TODO: Translate` entries in `zh_tw.ts` or `vi.ts`
- Do not suggest machine translations for those entries
- Do not flag `// TODO: Translate` comments as issues or warnings
- Only touch `zh_tw.ts` and `vi.ts` when explicitly instructed by the maintainer

### Key Dependencies

- `tsshogi` - Core Shogi logic library for game rules and record handling
- Vue 3 with Composition API (`<script setup>` style)
- Vite for web builds, Webpack for Electron main/preload

## Code Style

- TypeScript strict mode
- Prettier with 100 character line width
- No `console.*` in production code (use log4js in background)
- Vue 3 Composition API preferred

## Running Single Test

```bash
npx vitest run src/tests/path/to/test.spec.ts
```
