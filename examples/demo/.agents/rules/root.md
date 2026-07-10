# Demo Root Rules

## DEMO-ROOT-001

- Scope: dependency management
- Applies when: installing packages or running package scripts
- Severity: MUST
- Rule: Use pnpm for package operations and do not commit npm or yarn lockfiles.

## DEMO-ROOT-002

- Scope: configuration
- Applies when: changing environment variables, build configuration, or deployment settings
- Severity: MUST
- Rule: Document every required environment variable in `.env.example` in the same change that introduces it.

## DEMO-ROOT-003

- Scope: application code
- Applies when: editing server or client JavaScript
- Severity: SHOULD
- Rule: Keep route handlers thin by moving reusable behavior into `src/lib/` modules.

## DEMO-ROOT-004

- Scope: accessibility
- Applies when: changing user-visible forms, buttons, links, or navigation
- Severity: SHOULD
- Rule: Preserve accessible names and keyboard navigation for interactive UI elements.
