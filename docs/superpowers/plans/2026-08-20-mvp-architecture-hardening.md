# MVP Architecture Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make draft continuity verdicts authoritative and role-holder changes atomic before the MVP is finalized.

**Architecture:** Preserve the deep `ImpactEngine.analyze` interface. A draft continuity projection module maps engine-produced `ImpactResult` values into a compact frontend read model, while role mutations move exact holder-set synchronization into the existing backend transaction.

**Tech Stack:** Java 21, Spring Boot 3.5, Spring JDBC, PostgreSQL/Testcontainers, React 19, TypeScript, TanStack Query, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-20-mvp-architecture-hardening.md`

## Global Constraints

- `ImpactEngine.analyze(OrganizationSnapshot, SimulationChange)` remains the only public impact-engine interface.
- The browser must not calculate employee eligibility or continuity status from catalog fields.
- Existing impact and mitigation preview response contracts remain unchanged.
- Role metadata and a supplied exact holder set commit in one Spring transaction.
- Omitted `holderMemberIds` preserves existing update assignments; an explicitly empty set clears assignments.
- No database migration or new frontend dependency.
- Strict RED-GREEN-REFACTOR evidence is required in every task report.
- Do not restructure the graph projection or split `DeterministicImpactEngine`.

---

### Task 1: Authoritative Draft Continuity Projection

**Files:**
- Create: `backend/src/main/java/com/roleimpact/workspace/preview/api/DraftContinuityRiskResource.java`
- Create: `backend/src/main/java/com/roleimpact/workspace/preview/application/DraftContinuityProjectionService.java`
- Create: `backend/src/test/java/com/roleimpact/workspace/preview/application/DraftContinuityProjectionServiceTest.java`
- Modify: `backend/src/main/java/com/roleimpact/workspace/preview/api/DraftImpactPreviewController.java`
- Modify: `backend/src/test/java/com/roleimpact/workspace/WorkspaceIntegrationTest.java`
- Modify: `frontend/src/api/draftImpact.ts`
- Create: `frontend/src/components/workspaces/editor/continuityRiskPresentation.ts`
- Create: `frontend/src/components/workspaces/editor/continuityRiskPresentation.test.ts`
- Modify: `frontend/src/components/workspaces/editor/DraftEditor.tsx`
- Modify: `frontend/src/components/workspaces/editor/DraftImpactTesting.tsx`
- Modify: `frontend/src/components/workspaces/editor/OrganizationCanvas.tsx`
- Modify: `frontend/src/App.test.tsx`
- Delete: `frontend/src/components/workspaces/editor/workflowRisks.ts`

**Interfaces:**
- Consumes: `ImpactEngine.analyze(snapshot, new RevokeEmployeeRole(memberId, roleId))` and matching `ImpactResult.WorkflowImpact` / `ImpactResult.StepImpact` records.
- Produces: `GET /api/v1/workspaces/{workspaceId}/impact-previews/continuity` returning `List<DraftContinuityRiskResource>`.
- Produces frontend `DraftContinuityRisk` with `key`, workflow/requirement/role facts, `eligibleMembers`, and `members`; each member carries `eligible`, `losesCoverage`, `remainingEligibleActorCount`, and `scenarioStatus` (`OPERATIONAL | DEGRADED | BLOCKED`).

- [ ] **Step 1: Write failing backend projection tests**

Create `DraftContinuityProjectionServiceTest` with hand-built catalog and engine-result fixtures. Prove that the projection:

1. uses `StepImpact.baselineEligibleActors` rather than team/region/shift catalog guesses;
2. exposes the engine's workflow `scenarioStatus`, including `BLOCKED` when the step itself remains operational (the `DIFFERENT_ACTORS` case);
3. marks `losesCoverage` by comparing the selected holder against `scenarioEligibleActors`;
4. sorts workflows, requirements, roles, and holders deterministically;
5. rejects a non-draft or unknown workspace consistently with existing preview behavior.

- [ ] **Step 2: Run the focused backend test and verify RED**

Run the Maven unit test selector for `DraftContinuityProjectionServiceTest`. Expected: compilation/test failure because the projection records and module do not exist.

- [ ] **Step 3: Implement the minimal backend projection**

Add immutable records under `DraftContinuityRiskResource` and a read-only transactional `DraftContinuityProjectionService`. Load one catalog and one immutable snapshot. For every workflow requirement/role/current-holder tuple, call the existing impact engine with `RevokeEmployeeRole`, locate the matching workflow and step, and map only engine-produced eligibility and outcome facts. Add `GET /continuity` to `DraftImpactPreviewController`. Do not copy `DeterministicImpactEngine.isEligible`, `workflowStatus`, or constraint logic.

- [ ] **Step 4: Verify backend GREEN and add endpoint integration coverage**

Run `DraftContinuityProjectionServiceTest` to PASS. Add `WorkspaceIntegrationTest` coverage asserting the continuity endpoint returns engine-derived baseline actors and scenario status for the custom release workflow. Compile integration tests; run them when Docker is available.

- [ ] **Step 5: Write failing frontend presentation and UI tests**

Create literal server-projection fixtures where catalog demographics suggest safety but the supplied status is `BLOCKED`. Prove display-only ranking and labels follow `scenarioStatus`. Extend the app/editor test routing for the continuity GET and assert the risk callout and impact controls use the supplied verdict. Add an assertion that a successful catalog mutation causes the continuity query to be fetched again.

- [ ] **Step 6: Run focused frontend tests and verify RED**

Run the new presentation test and focused editor/App test. Expected: failure because the continuity client/query does not exist and the UI still imports `findWorkflowRisks`.

- [ ] **Step 7: Implement the frontend projection consumer**

Add `fetchDraftContinuityRisks` and exact TypeScript response types to `draftImpact.ts`. Query it from `DraftEditor`, pass authoritative risks to `DraftImpactTesting`, and keep only sorting/wording helpers in `continuityRiskPresentation.ts`. Make loading/error states explicit. Invalidate `['draft-continuity', workspaceId]` after every successful catalog mutation in both editor and map mutation paths. Delete `workflowRisks.ts` and all catalog-based eligibility calculations.

- [ ] **Step 8: Verify frontend GREEN and refactor**

Run focused tests, the full frontend suite, lint, and build. The already-recorded unrelated `Focused impact graph` baseline assertion may be updated only if the current production heading intentionally changed; record that separately in the task report.

- [ ] **Step 9: Commit Task 1**

Commit with subject `refactor: make continuity projection authoritative`.

### Task 2: Atomic Role-Holder Synchronization

**Files:**
- Modify: `backend/src/main/java/com/roleimpact/workspace/editor/api/RoleRequest.java`
- Modify: `backend/src/main/java/com/roleimpact/workspace/editor/application/DraftCatalogService.java`
- Modify: `backend/src/main/java/com/roleimpact/workspace/editor/persistence/DraftCatalogRepository.java`
- Create: `backend/src/test/java/com/roleimpact/workspace/editor/application/DraftCatalogServiceTest.java`
- Modify: `backend/src/test/java/com/roleimpact/workspace/WorkspaceIntegrationTest.java`
- Modify: `frontend/src/api/draftCatalog.ts`
- Modify: `frontend/src/components/workspaces/editor/DraftEditor.tsx`
- Modify: `frontend/src/components/workspaces/editor/OrganizationCanvas.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: existing `POST /catalog/roles` and `PUT /catalog/roles/{roleId}`.
- Extends request: optional `holderMemberIds: Set<UUID> | null`; omitted update preserves holders, present set replaces holders exactly.
- Produces: `DraftCatalogRepository.replaceRoleHolders(UUID roleId, Set<UUID> memberIds)` invoked once inside the role mutation transaction.

- [ ] **Step 1: Write failing backend service tests**

Create `DraftCatalogServiceTest` with controlled repository behavior. Prove:

1. create with holder IDs validates the complete member set and performs one role-centric replacement;
2. update with an explicit empty set clears holders;
3. update with omitted holder IDs does not touch holders;
4. an unknown holder is rejected before role metadata or assignments are mutated.

- [ ] **Step 2: Run the focused backend test and verify RED**

Run the Maven unit test selector for `DraftCatalogServiceTest`. Expected: compilation/test failure because `RoleRequest.holderMemberIds`, member-set validation, and `replaceRoleHolders` do not exist.

- [ ] **Step 3: Implement the atomic backend mutation**

Extend `RoleRequest` with nullable `holderMemberIds` and defensively copy non-null sets. Add repository member-count validation and a role-centric replace method that deletes assignments for the role and inserts the exact desired members. In `createRole` and `updateRole`, validate all holder IDs first, then mutate metadata and holders inside the existing `@Transactional` method. Generalize the existing mutation helper only as needed to return the created role ID.

- [ ] **Step 4: Verify backend GREEN and transactional integration behavior**

Run `DraftCatalogServiceTest` to PASS. Extend `WorkspaceIntegrationTest` to assert create/update exact holder sets and that a mixed valid/unknown holder request leaves prior role metadata and holders unchanged. Compile integration tests; run them when Docker is available.

- [ ] **Step 5: Write failing frontend role-flow tests**

Use request-body assertions against the real frontend mutation functions and role flows. Prove inventory create/edit and organization-map quick-create/reuse send exactly one role request with the complete `holderMemberIds` set and do not issue sequential `/members/{id}/roles` calls.

- [ ] **Step 6: Run focused frontend tests and verify RED**

Run the relevant App tests. Expected: failure because role input has no holder set and both role flows still synchronize members sequentially.

- [ ] **Step 7: Implement the single role mutation in the frontend**

Extend `RoleInput` with optional `holderMemberIds`. Inventory create/edit/reuse and map create/reuse must call `createDraftRole` or `updateDraftRole` once with the exact selected holders. Delete `syncRoleHolders` and `assignRoleToMembers`. Leave member editing and one-off graph connections on `replaceMemberRoles`.

- [ ] **Step 8: Verify frontend GREEN and all available checks**

Run focused tests, full frontend tests, lint, build, backend unit tests, and backend test compilation. Run Testcontainers integration tests only if Docker is available.

- [ ] **Step 9: Commit Task 2**

Commit with subject `refactor: synchronize role holders atomically`.
