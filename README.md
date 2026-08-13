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
- Before-and-after workflow comparison in the UI
- Flyway-managed relational schema and Harborline Commerce seed
- Backend unit and real-PostgreSQL integration tests
- Frontend unit tests

## Seeded Harborline baseline

The version 1 baseline contains 25 employees, five teams, eight roles, six
applications, 23 permissions, ten capabilities, four workflows, and eleven
workflow steps. It includes the primary Priya Sharma role-revocation scenario,
Bob Chen as a potential mitigation candidate, and supporting refund and release
coverage scenarios.

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
.\backend\mvnw.cmd spring-boot:run
```

In a third terminal, install and start the frontend:

```powershell
npm --prefix frontend install
npm --prefix frontend run dev
```

Open <http://localhost:5173>. Run the Priya Sharma scenario, review Bob Chen's
recommendation, and test the mitigation to compare the original Critical impact
with the Low residual access impact after all affected workflows are restored.

## API endpoints

- `GET /api/v1/dashboard` loads the default Harborline Commerce dashboard.
- `GET /api/v1/dashboard?organization={slug}` loads another organization or
  returns `404` when the slug does not exist.
- `POST /api/v1/simulations` runs and saves a revoke-role simulation.
- `GET /api/v1/simulations/{simulationId}` retrieves an immutable saved result.
- `POST /api/v1/simulations/{simulationId}/branches` tests and saves a
  recommendation as a child mitigation simulation.
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
