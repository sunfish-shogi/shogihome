# ShogiHome Project Memory

## Translation Policy

- `ja.ts` and `en.ts` are maintained by the developer.
- `zh_tw.ts` (Traditional Chinese) and `vi.ts` (Vietnamese) are maintained by **human translators**, not machine translation.
- During feature development, new strings are written in Japanese with `// TODO: Translate` in non-ja/non-en locale files.
- AI tools may translate `zh_tw.ts` / `vi.ts` entries only when they are simple, common UI words (e.g. "OK", "Cancel", "Save") or obviously determined by existing translations in the same file. Everything else stays `// TODO: Translate` for human translators.
- Never modify existing human translations; when in doubt, do not translate.
- Policy is documented in: `.claude/CLAUDE.md`, `.coderabbit.yaml`, and at the top of each locale file.
