# @acme/api

The backend API service (Fastify + Postgres).

## Conventions

- Every route is registered through a plugin; do not attach routes to the root instance directly.
- All inputs are validated with the route's JSON schema; unvalidated `request.body` access is forbidden.
- Database migrations are append-only — never edit a committed migration, add a new one.
- Logging uses the shared `logger`; `console.log` is not allowed in committed code.
