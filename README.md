# RoleImpact

RoleImpact is a deterministic access-change impact simulator. It helps teams
understand which technical permissions and business workflows would be affected
before they offboard an employee, revoke a role, or remove a permission.

## Current milestone

The repository contains the local foundation and its first complete simulation
and mitigation vertical slice:

- React and TypeScript frontend
- Spring Boot and Java 21 API
- PostgreSQL 17 through Docker Compose
- Versioned, immutable `OrganizationSnapshot` assembly
- Organization dashboard API and UI
- Deterministic revoke-role impact analysis with stable result hashing
- Ranked, evidence-backed replacement recommendations
- Persisted parent/child mitigation simulations with idempotent replay
- Stateless impact and mitigation previews for user-built draft organizations
- Stable public organization IDs and refresh-safe links for reopening editable
  organization maps, inventories, and impact screens
- Draft recommendations that verify eligibility and workflow recovery after the
  proposed role assignment, even when the candidate does not already have the
  access that the new role would grant
- Before-and-after workflow comparison in the UI
- Interactive impact map where teams, members, roles, responsibilities, and
  workflows reveal their complete connected paths and contextual test actions
- Workflow-focused and full-organization views with removed, blocked, degraded,
  candidate, and restored relationship states
- Direct member selection for inspecting and testing recommended, alternative,
  or excluded replacements without changing the organization baseline
- Selectable graph nodes, original/mitigation toggling, and an accessible text
  representation of every relationship path
- Flyway-managed relational schema with published Northstar demo data
- Backend unit and real-PostgreSQL integration tests
- Frontend unit tests

## Published Northstar demo

The public version 1 demo models Northstar Medical Supplies with six employees,
two teams, four roles, and the critical Vendor Payment Run. Daniel Brooks is the
only Bank Payment Releaser, so removing that assignment blocks the bank-release
step. Nia Kapoor is ranked first as a safe replacement because she is active,
works in the same Treasury Operations team, already has Bank Portal access, and
restores the workflow without worsening another process. The published snapshot
is read-only. The older Harborline seed remains available for regression coverage
but is no longer presented as the product demo.

## Prerequisites

- Java 21
- Node.js LTS and npm
- Docker Desktop
- Git

## Run locally

From the repository root, start PostgreSQL:

```powershell
docker compose up -d
```

In a second terminal, start the API:

```powershell
\.\backend\mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=dev
```

With the `dev` profile active, Boot UI is available at <http://localhost:8080/bootui>.

In a third terminal, install and start the frontend:

```powershell
npm --prefix frontend install
npm --prefix frontend run dev
```

Open <http://localhost:5173>. Choose **Explore the live demo**, inspect the
Northstar dependency graph, test Daniel Brooks's access removal, and verify Nia
Kapoor's mitigation to see the restored green relationship graph.

Editable organizations can be reopened from the homepage using their public ID
with or without the displayed hyphen. Anyone with an organization ID or link can
edit that organization in this portfolio MVP, so do not enter confidential or
personal data.

## Frontend routes

- `/example` opens the read-only, graph-first Northstar continuity demo.
- `/organizations/{publicCode}/map` opens an editable organization map.
- `/organizations/{publicCode}/inventory` opens its detailed inventory.
- `/organizations/{publicCode}/impact` opens a fresh impact-testing screen.

Refreshing any of these routes keeps the same organization and screen. Impact
and mitigation results are intentionally temporary, so refreshing the impact
route clears the previous result while preserving the selected screen. Vite's
development and preview servers provide the required history fallback locally.
Production hosting must rewrite non-asset, non-API routes to
`frontend/index.html` so pasted organization links load correctly.

## API endpoints

- `GET /api/v1/dashboard` loads the default Northstar Medical Supplies dashboard.
- `GET /api/v1/dashboard?organization={slug}` loads another organization or
  returns `404` when the slug does not exist.
- `POST /api/v1/simulations` runs and saves a revoke-role simulation.
- `GET /api/v1/simulations/{simulationId}` retrieves an immutable saved result.
- `POST /api/v1/simulations/{simulationId}/branches` tests and saves a
  recommendation as a child mitigation simulation.
- `POST /api/v1/workspaces` creates a blank editable organization and returns
  its stable public code.
- `GET /api/v1/workspaces/by-code/{publicCode}` resolves an editable
  organization. The Harborline example is intentionally excluded.
- `GET /api/v1/workspaces/{workspaceId}/catalog` loads the editable catalog
  after the public code has been resolved.
- `POST /api/v1/workspaces/{workspaceId}/impact-previews` tests a role removal
  against the current draft without changing it.
- `POST /api/v1/workspaces/{workspaceId}/impact-previews/mitigations` verifies a
  user-selected replacement against the same draft snapshot and returns the
  original and mitigated outcomes for comparison.
- `GET /api/v1/health` reports API availability.

## Tests

```powershell
.\backend\mvnw.cmd test
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

Backend integration tests use Testcontainers and therefore require Docker
Desktop to be running.

## Local configuration

The checked-in defaults are safe for local development. Copy `.env.example` to
`.env` only if you need to override them. Never commit `.env` or real database
credentials.
