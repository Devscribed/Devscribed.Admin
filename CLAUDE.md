# Devscribed.Admin

Multi-tenant organization management platform.

## Tech Stack

- **Backend:** .NET 10 API, SQLite, Entity Framework Core, BCrypt for passwords
- **Frontend:** Next.js (App Router, TypeScript, Tailwind CSS)
- **Testing:** xUnit (unit + integration with in-memory SQLite), Playwright (E2E)

## Project Structure

```
src/
  Devscribed.Admin.Api/            # ASP.NET Core Web API (endpoints, auth middleware)
  Devscribed.Admin.Domain/         # Entities, enums, validators, services (no deps)
  Devscribed.Admin.Infrastructure/ # EF Core DbContext, data access
tests/
  Devscribed.Admin.Tests.Unit/     # Unit tests (Domain layer)
  Devscribed.Admin.Tests.Integration/ # Integration tests (API + in-memory SQLite)
frontend/
  src/app/                         # Next.js App Router pages
  e2e/                             # Playwright E2E tests
specs/
  user-management/                 # Feature specifications
```

## Architecture Decisions

- Clean Architecture: Domain has no dependencies. Infrastructure depends on Domain. API depends on both.
- Cookie-based auth with SecurityStamp for session revocation (not JWT).
- API proxy: Next.js rewrites `/api/*` to `http://localhost:5000/api/*`.
- Single-org-per-user model. Four roles: admin, manager, user, viewer.
- Soft-delete for members (active/removed status).
- All tokens (reset, invite, email confirmation) stored as SHA-256 hashes, 32-byte random, URL-safe base64.

## Commands

```bash
# Backend
dotnet build                                   # Build all
dotnet test                                    # Run all tests
dotnet test tests/Devscribed.Admin.Tests.Unit  # Unit tests only
dotnet test tests/Devscribed.Admin.Tests.Integration  # Integration tests (in-memory SQLite, no Docker)
dotnet run --project src/Devscribed.Admin.Api  # Run API on port 5000

# Frontend
cd frontend && npm run dev                     # Dev server on port 3000
cd frontend && npx playwright test             # E2E tests

# Database
dotnet ef migrations add <Name> --project src/Devscribed.Admin.Infrastructure --startup-project src/Devscribed.Admin.Api
```

## Conventions

- TDD: write ONE test, implement to pass, repeat. Never bulk-write tests.
- Tests verify behavior through public interfaces (API endpoints), not internal implementation.
- Integration tests use `IntegrationTestFixture` (in-memory SQLite, shared connection).
- All API endpoints return JSON. Validation errors use consistent message format from specs.
- Passwords hashed with BCrypt. Never stored in plaintext.
- Emails normalized to lowercase. Case-insensitive lookups.
- data-testid attributes on all interactive UI elements (defined per spec).
- Security is a top priority: parameterized queries, input validation, CSRF protection via SameSite cookies.

## Shared Validation Rules (cross-spec)

- Password: min 8, max 128, ≥1 letter + ≥1 digit
- Name: 1-50 chars, letters/hyphens/apostrophes/spaces only
- Email: valid format, max 254 chars, normalized to lowercase
- Organization name: required, max 100 chars
- Job title: optional, max 100 chars
