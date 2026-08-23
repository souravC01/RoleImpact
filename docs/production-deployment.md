# Production deployment runbook

RoleImpact uses three managed production services:

- the React/Vite frontend runs on Vercel;
- the Spring Boot API runs as a Docker web service on Render;
- PostgreSQL runs in the dedicated `RoleImpact Production` Neon project.

The repository-root `render.yaml` is the source of truth for the API service. Render builds `backend/Dockerfile`, provides HTTPS, monitors `/actuator/health`, and deploys reviewed changes from `main`.

## 1. Merge the deployment configuration

Before creating the service, confirm `render.yaml` exists on the repository's `main` branch and required CI checks pass. Do not deploy an unreviewed feature branch as production.

## 2. Create the Render service

In the Render dashboard, create a Blueprint from the RoleImpact GitHub repository and select **My Workspace**. Review the generated `roleimpact-api` web service before applying it:

- runtime: Docker;
- plan: Free;
- region: Oregon, colocated with the Neon US West database;
- branch: `main`;
- health check: `/actuator/health`;
- auto-deploy: enabled.

Do not create a Render PostgreSQL database. Production data remains in Neon.

## 3. Configure secrets

Enter the following values only in the Render dashboard when the Blueprint requests them:

- `DB_URL`: the Neon JDBC URL with `sslmode=require`;
- `DB_USERNAME`: the Neon database role;
- `DB_PASSWORD`: the Neon database password;
- `CORS_ALLOWED_ORIGIN`: the exact Vercel production origin, including `https://` and no trailing slash.

The Blueprint supplies the remaining non-secret settings, including the production Spring profile, conservative database-pool limits, and Java memory limits for the Free instance. Never put production database credentials in Git, documentation, build arguments, issues, or logs.

## 4. Verify the first API deployment

Watch the Render deploy until its status is **Live**. On the first successful start, Flyway applies the committed migrations to the Neon production database.

Check the public health endpoint:

```text
https://<render-service>.onrender.com/actuator/health
```

It must return HTTP 200 with status `UP`. Review Render logs for Flyway errors, failed database authentication, out-of-memory exits, or repeated health-check failures before connecting the frontend.

## 5. Connect Vercel

In the Vercel production environment, set:

```text
VITE_API_BASE_URL=https://<render-service>.onrender.com
```

Redeploy the frontend after saving the variable. Confirm the API's `CORS_ALLOWED_ORIGIN` exactly matches the final Vercel production URL.

## 6. Production smoke test

From the deployed frontend:

1. create a small organization;
2. copy its organization code and reopen it from the landing page;
3. refresh the organization map URL and confirm the same organization loads;
4. create or assign a role and confirm its member connections persist;
5. run an impact test and inspect its recommendation explanation;
6. refresh the impact route and confirm route recovery works.

Also recheck `/actuator/health` and scan recent Render error logs after the smoke test.

## 7. Updates and rollback

Merging a reviewed change into `main` triggers an automatic Render deployment. Render keeps the previous deployment serving traffic until the new version becomes healthy.

If a release fails, roll back to the most recent healthy deployment in the Render dashboard. Database migrations are forward-only: correct a faulty migration with a reviewed follow-up Flyway migration instead of manually changing production tables.

## Free-plan behavior

The Render Free service can spin down after inactivity. Its first request after an idle period can take longer while the service starts. Before a portfolio demonstration, open the production site once and wait for the API health check to return `UP`.
