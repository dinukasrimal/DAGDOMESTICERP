# Repository Guidelines

## Project Structure & Module Organization
- `src/`: App code (TypeScript/React).
  - `components/`: UI and feature components (PascalCase files).
  - `pages/`: Route-level views.
  - `services/`: Data/services (Supabase, Google Sheets, Odoo integrations).
  - `hooks/`: Reusable React hooks (`useX` pattern).
  - `integrations/supabase/`: Client/types; DB schema lives in `src/lib/supabase-schema.sql`.
  - `utils/`, `lib/`, `types/`: Helpers, shared types, utilities.
- `public/`: Static assets.
- `supabase/`: Edge functions and SQL migrations.
- `dist/`: Build output (ignored).

## Build, Test, and Development Commands
- `npm i`: Install dependencies.
- `npm run dev`: Start Vite dev server on port 8080.
- `npm run build`: Production build to `dist/`.
- `npm run preview`: Preview the built app locally.
- `npm run lint`: Run ESLint (TypeScript + React rules).

## Coding Style & Naming Conventions
- TypeScript, React function components, hooks-first.
- Indentation: 2 spaces; semicolons required; prefer single quotes.
- Components: PascalCase (e.g., `ProductionPlanner.tsx`). Hooks: `useX` (e.g., `useAuth.tsx`).
- Paths: use `@/` alias to `src/` (e.g., `@/components/...`).
- Keep side effects in services/hooks; keep components presentational where feasible.

## Testing Guidelines
- No formal test runner is configured yet. If adding tests, prefer Vitest + React Testing Library:
  - Location: `src/__tests__/` or alongside files.
  - Names: `*.test.ts` / `*.test.tsx`.
  - Aim for critical path coverage (services, hooks, data transforms).

## Commit & Pull Request Guidelines
- Commits: clear, imperative summaries. Prefer Conventional Commits where possible (e.g., `feat:`, `fix:`, `chore:`).
- PRs: include purpose, scope, and screenshots/GIFs for UI changes; link issues; list any migrations or env changes.
- For DB changes, include SQL in `supabase/migrations/` and describe rollout/rollback.

## Security & Configuration Tips
- Environment: `.env` for local dev (Supabase keys, external APIs). Do not commit secrets—rotate if exposed.
- Supabase: config in `supabase/config.toml`; Edge Functions in `supabase/functions/*`.
- Avoid placing secrets in client code; proxy via secure functions/services when needed.
