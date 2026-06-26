# Acme Web — agent guidelines

A Next.js app. Please follow these when working here.

- We use **pnpm**, never npm or yarn. Run `pnpm install` after pulling, and `pnpm dev` to start.
- All code is formatted with Prettier: single quotes, no semicolons, trailing commas. Don't hand-format against it.
- Every new React component must ship with a test (`*.test.tsx`) — do not open a PR without one.
- Use the `@/` import alias for everything under `src/`. Never write deep relative imports like `../../../lib/x`.
- API route handlers live under `src/app/api/**`. Validate every request body with a zod schema before using it.
- Never log secrets, tokens, or full request headers. Redact auth values in error output.
- Database access goes through the repository layer in `src/db/repositories`; components and routes must not import the Prisma client directly.
- Prefer server components; only add `'use client'` when the component needs interactivity or browser APIs.
