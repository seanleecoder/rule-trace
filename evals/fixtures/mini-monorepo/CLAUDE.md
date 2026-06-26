# Monorepo guidelines

This is a Turborepo monorepo with a web app and an API service. Package-specific rules live in each package's README.

- Node 20+. The package manager is pnpm with workspaces; install from the repo root only.
- Shared TypeScript config lives in `tsconfig.base.json`; packages extend it and must not redefine `compilerOptions.paths`.
- Run `pnpm turbo lint test` from the root before pushing; CI runs the same.
- Conventional Commits are required for every commit message (`feat:`, `fix:`, `chore:` …).
