# @acme/web

The customer-facing Next.js app.

## Conventions

- Styling is Tailwind only; do not add CSS modules or styled-components.
- Data fetching uses TanStack Query; never call `fetch` directly inside components.
- Feature flags are read through `useFlag()`; do not read the flags config object directly.
- Images must use `next/image`; raw `<img>` tags fail review.
