# Repository Guidelines

## Project Structure & Module Organization

- `src/main.ts` handles the editor and playback controls; `src/style.css` contains responsive styles.
- `src/engine.ts` loads fonts, lays out text, and builds deterministic stroke timelines. Shared interfaces live in `src/types.ts`.
- `src/export.ts` serializes SVG and registers export adapters. Font registration and translated UI copy live in `src/fonts.ts` and `src/i18n.ts`.
- `public/fonts/` contains Satisfy stroke JSON and license files. Preserve attribution when adding assets.
- `tests/*.spec.ts` contains browser tests. `dist/` is generated output; `wrangler.jsonc` configures Workers Static Assets.

## Build, Test, and Development Commands

Use Node.js 22.12 or newer and the committed npm lockfile.

- `npm ci`: install locked dependencies.
- `npm run dev`: start Vite locally.
- `npm run build`: check strict TypeScript and build `dist/`.
- `npm run preview`: serve the production build.
- `npx playwright install chromium`: install the test browser.
- `npm test`: run browser tests; Playwright starts or reuses Vite on port 5173.
- `npm run worker:dev`: build and preview through Wrangler.
- `npm run deploy:check`: build and validate deployment packaging without publishing.
- `npm run deploy`: build and publish after Cloudflare authentication.

## Coding Style & Naming Conventions

Use two-space indentation, single-quoted TypeScript strings, and semicolons. Use `camelCase` for functions and variables, `PascalCase` for interfaces and classes, and descriptive lowercase module names. Prefer `import type` for type-only imports. No formatter or linter is configured; follow surrounding code.

## Architecture & Scope

Follow the Less is More principle: implement the smallest solution that satisfies the requirements and avoid overengineering.

Keep the application lightweight: native TypeScript, browser processing, and SVG animation. Preview and export share `Scene` data and SVG serialization; avoid separate timing implementations. Put UI strings in `i18n.ts`, fonts in the registry, and future formats behind `ExportAdapter`. Keep additional controls collapsed where practical.

## Testing Guidelines

Playwright runs headless Chromium. Use descriptive behavior names in `tests/<area>.spec.ts`. For behavior changes, run `npm run build` and `npm test`, adding regression coverage for affected layout, playback, export, or input handling. No coverage percentage is enforced. Check mobile layouts for UI changes and deployment packaging for hosting changes.

## Commit & Pull Request Guidelines

After completing each task, automatically commit and push the task's changes. Use Conventional Commits for every commit message, with a concise, imperative description and an appropriate type such as `feat:`, `fix:`, or `docs:`. The initial commit uses `feat: add lightweight handwriting animation tool`. PRs should describe resulting behavior, reference relevant issues, report validation, and include screenshots for UI changes. Exclude generated output, credentials, and local environment files.
