# MVP Architecture Hardening Specification

## Objective

Remove the two correctness risks approved before MVP completion:

1. Browser-generated workflow continuity verdicts can disagree with the deterministic impact engine.
2. Role-holder edits are applied as a sequence of member mutations and can leave a partial result.

## Authoritative continuity projection

- `ImpactEngine.analyze(OrganizationSnapshot, SimulationChange)` remains the only public impact-engine interface.
- The backend exposes a read-only continuity projection for draft workspaces at
  `GET /api/v1/workspaces/{workspaceId}/impact-previews/continuity`.
- The projection is derived from `ImpactResult` values produced by the existing engine. It must not reimplement employee eligibility, effective-permission, capability, application-access, coverage, or `DIFFERENT_ACTORS` rules.
- Each projection item identifies one workflow requirement and one supporting role and contains:
  - workflow and requirement identity and display names;
  - workflow criticality;
  - minimum actors and resilience target;
  - role identity and display name;
  - baseline eligible members from the engine's matching `StepImpact`;
  - one scenario per current holder of that role, including whether that holder was baseline-eligible, whether the holder loses coverage after revocation, the remaining eligible-actor count, and the engine's workflow scenario status.
- Items and nested members use deterministic ordering.
- The frontend uses this projection for workflow ordering, status labels, continuity callouts, member eligibility text, and post-run explanatory copy.
- The frontend may keep display-only sorting and wording. It must not recompute domain eligibility or coverage from catalog fields.
- If the projection is loading or unavailable, the organization editor remains usable but does not invent a verdict. The impact view presents an explicit loading or retry state.
- Any successful catalog mutation invalidates the continuity projection so it cannot remain stale.
- Delete `frontend/src/components/workspaces/editor/workflowRisks.ts` after all callers consume the server projection.

## Atomic role-holder synchronization

- Role create and role update requests accept optional `holderMemberIds`.
- Omission preserves compatibility: create means no holders; update leaves the current holders unchanged.
- When `holderMemberIds` is present, it is the exact desired holder set, including an explicitly empty set.
- The backend validates that every requested holder belongs to the draft workspace before mutating anything.
- Role metadata and the supplied holder set are committed in the same Spring transaction.
- Persistence replaces the role's complete holder set with one role-centric repository operation. It must not call the member-centric replacement operation in a loop.
- The inventory role form and organization-map quick-create/reuse paths send one role mutation containing the exact holder set.
- Member editing and one-off graph connections may retain the member-centric role-assignment interface because those user intents are member-centric and individually atomic.
- A failed holder validation or persistence operation must leave role metadata and existing assignments unchanged.

## Compatibility and scope

- No database migration is required.
- Existing published-workspace mutation protection remains in force.
- Existing impact and mitigation preview response contracts remain unchanged.
- No new frontend state-management or graph libraries are introduced.
- Do not restructure the graph projection or split `DeterministicImpactEngine` in this work.

## Verification

- Follow strict RED-GREEN-REFACTOR for every production change.
- Backend unit tests must remain runnable without Docker.
- Add PostgreSQL integration coverage for the endpoint and transactional holder replacement; compilation must succeed even if Docker is unavailable locally.
- Frontend tests must prove that server-supplied continuity statuses drive labels and that catalog mutations invalidate the projection.
- Run frontend tests, lint, and build; run backend unit tests and test compilation. Run PostgreSQL integration tests when Docker is available.

