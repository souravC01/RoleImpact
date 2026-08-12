# RoleImpact Project Context

Last updated: August 12, 2026

## Purpose

RoleImpact is a portfolio project designed to demonstrate full-stack development, relationship-rich data modeling, deterministic graph/rule evaluation, explainable results, and product thinking.

The product lets an IT or access manager simulate an access change before approving it. It explains what technical access disappears, which business workflows become blocked or fragile, why the impact occurs, and what minimal reassignment could restore coverage.

## Product direction agreed in the conversation

- Continue with the original RoleImpact concept. Existing commercial products validate the problem and do not prevent this from being a strong portfolio project.
- Do not reproduce another product's interface, terminology, or implementation. Use an original data model, UI, business scenarios, scoring rules, graph representation, and recommendation logic.
- Make business consequences prominent without changing the project into a different product category.
- Use a synthetic organization for the MVP. Do not connect to or modify real enterprise permissions.
- Keep the implementation focused and credible rather than trying to build a complete IAM platform.

## Core product promise

Before an employee, role, or permission is removed, RoleImpact shows:

- what roles, permissions, applications, and resources are affected;
- which business workflows become blocked or degraded;
- the relationship path that caused each result;
- whether a single-person dependency or separation-of-duties issue was introduced; and
- one or two deterministic mitigation options when a safe option exists.

## Primary user flow

1. Open the dashboard.
2. Start a new simulation.
3. Select one of three changes: offboard employee, revoke role from employee, or remove permission from role.
4. Select the target and review its current access and workflow participation.
5. Confirm and run the isolated simulation.
6. Inspect the executive verdict, business impact, technical impact, explanation paths, and before/after graph.
7. Test a recommended reassignment as a branched scenario.
8. Save or export the result.

## MVP scope

- Approximately 25 fictional employees across five teams.
- Eight roles, six applications, and roughly 18-24 permissions.
- Three workflows: Vendor Payment, Customer Refund, and Production Deployment.
- Workflow statuses: operational, degraded, and blocked.
- Deterministic impact and recommendation logic.
- Organization Explorer, entity details, simulation flow, results, and scenario history.

## Main demonstration scenario

Revoke the Finance Approver role from Priya Sharma. Priya is the only evening-shift employee who can approve vendor payments above $25,000. RoleImpact should identify the resulting workflow coverage failure, explain the path from Priya to the workflow step, and recommend Bob Chen only if he satisfies the department, application, shift, and separation-of-duties rules.

## Explicit MVP non-goals

- Live identity-provider, HR, cloud, ERP, or production integrations.
- Applying, provisioning, or approving real access changes.
- Machine-learning-based recommendations or role mining.
- Enterprise billing, multi-tenancy, or a complete IAM/IGA/PAM platform.
- Supporting every RBAC, ABAC, and policy-language edge case.

## Current files

- `docs/RoleImpact_PRD_v0.1.docx`: detailed product requirements document for review.
- `docs/Portfolio_Project_Strategy.docx`: earlier portfolio-project strategy document.
- `tools/build_roleimpact_prd.py`: reproducible PRD builder.
- `tools/rasterize_roleimpact_prd.py`: internal PRD rendering helper.

## Current status

The user flow and draft PRD are complete. No application code has been started. The PRD contains a short list of decisions for review, including whether recommendation testing and report export should be P0 or P1, whether the three workflows are final, and whether the fictional company name should remain Harborline Commerce.

## Next step

Review and revise the PRD. After approval, create low-fidelity wireframes and a technical design covering the final data schema, impact-engine contract, API boundaries, test strategy, implementation stack, and phased build plan.
