# Organization Deep Linking and Recovery Design

**Date:** 2026-08-21
**Status:** Approved in conversation; awaiting written-spec review

## Purpose

RoleImpact currently keeps the active page and workspace in React component state. A browser refresh therefore returns the user to the homepage, and the homepage does not provide a direct way to reopen an existing organization. This design gives every editable organization a stable public code and nested URL routes, while keeping impact previews temporary.

The same change removes Harborline cloning from the product and backend. Users will either explore Harborline as a read-only example, open an organization they already know, or create a blank organization.

## Goals

- Give every editable organization a stable, human-friendly public code.
- Allow an organization to be opened by entering its code on the homepage or by using its URL.
- Preserve the current organization screen across refreshes and direct navigation.
- Keep organization links editable for the portfolio MVP without introducing accounts or authentication.
- Keep impact and mitigation preview results temporary and deterministic.
- Remove the Harborline cloning flow, API, persistence logic, and template-specific UI branches.
- Preserve all existing organization records and catalog data.

## Non-goals

- User accounts, authentication, invitations, or organization membership.
- Separate view-only and edit links.
- Persisted impact-run history or shareable impact-result URLs.
- Restoring an in-progress impact result after refresh.
- Renaming the backend `workspace` package and API vocabulary to `organization` in this change.
- Deleting organizations that were previously created by cloning.

## Product Flow

### Homepage

The homepage presents three actions:

1. **Explore Harborline** opens the existing read-only example.
2. **Open your organization** accepts a public organization code and navigates to its map.
3. **Create a new organization** creates an empty draft and navigates to its map.

The existing **Clone Harborline** card is removed and its space is used by **Open your organization**.

The organization-code form:

- trims surrounding whitespace;
- normalizes letters to uppercase;
- accepts the displayed form with or without its hyphen;
- does not navigate when the code is malformed;
- displays an inline not-found message when no organization matches;
- never lists all organizations from the server.

### Organization creation

Creating a blank organization generates both its internal UUID and public code. The frontend redirects to `/organizations/{code}/map` and displays a persistent onboarding notice containing:

- the organization code;
- a **Copy ID** action;
- a **Copy organization link** action; and
- a reminder that anyone with the link or code can edit the organization in the portfolio MVP.

The organization header continues to expose Copy ID and Copy Link after the onboarding notice is dismissed. Copy Link copies the stable map URL rather than a temporary impact state.

In user-facing language, **Organization ID** means the public organization code. The internal UUID remains an implementation detail and is not shown as the recovery credential.

### Organization navigation

The organization map, inventory, and impact tabs are real nested routes:

- `/organizations/{code}/map`
- `/organizations/{code}/inventory`
- `/organizations/{code}/impact`

`/organizations/{code}` redirects to `/organizations/{code}/map`.

Changing tabs changes the URL. Refreshing or directly opening any valid nested route loads the organization from PostgreSQL and returns to that screen.

Impact selections, results, and mitigation previews remain screen state. Refreshing `/impact` keeps the user on the Test Impact screen but clears the previous result and initializes a valid default workflow, responsibility, and role-holder selection from the current organization.

The Harborline example receives a stable `/example` route so it also survives refresh, but it does not receive an editable organization code.

## Public Organization Code

The database continues using UUID primary keys and foreign keys. A separate `public_code` column is used only for entry and routing.

Code properties:

- generated once when an organization is created;
- never changes when the organization is renamed;
- globally unique;
- case-insensitive;
- random rather than sequential;
- short enough to type accurately;
- excludes visually ambiguous characters such as `0`, `O`, `1`, and `I`.

New codes use a three-letter name-derived prefix followed by a 16-character Base32-style random token (80 bits), for example `NSM-7K4P9D8XM2QR6WBC`. The name prefix is cosmetic and is not recalculated after rename. Existing 32-character IDs remain valid and unchanged until the development database is cleared. The full code is an editable bearer capability, uniqueness is enforced by the database, and the service retries generation on the unlikely event of a collision.

The code is an unguessable locator, not authentication. The UI must state that real or sensitive company information should not be entered until authentication is added.

## Database Migration

A new Flyway migration will:

1. add nullable `public_code` to `organizations`;
2. backfill a unique generated code for every existing organization;
3. make the column non-null;
4. add a case-insensitive unique index;
5. remove the clone-source index and foreign key; and
6. drop `source_template_organization_id`.

Dropping the clone-source metadata does not remove or alter cloned catalog records because cloned organizations already own independent copies of their data.

The Harborline published example also receives an internal code during migration to satisfy the non-null constraint, but that code is not exposed as an editable organization route. Requests that resolve to a published example through the editable organization endpoint are rejected.

## Backend API

Existing catalog and impact endpoints continue to use internal workspace UUIDs after the organization is resolved. This limits the scope of the change and avoids rewriting every established API boundary.

### Retained and changed endpoints

- `POST /api/v1/workspaces`
  - Creates an empty draft.
  - Generates the public code.
  - Returns the public code in `WorkspaceResource`.

- `GET /api/v1/workspaces/by-code/{publicCode}`
  - Normalizes and resolves the code.
  - Returns only editable draft organizations.
  - Returns `404` for unknown, malformed, or published-example codes.

- `GET /api/v1/workspaces/{workspaceId}`
  - Remains available for internal UUID-based consumers and tests.

- Existing `/catalog`, `/impact-previews`, and `/impact-previews/mitigations` endpoints remain UUID-based.

### Removed endpoints

- `POST /api/v1/workspaces/{sourceWorkspaceId}/clones`
- The public all-workspaces listing endpoint, `GET /api/v1/workspaces`, because an unauthenticated list would defeat code-based discovery boundaries.

Harborline homepage counts and example navigation use the existing example/dashboard API rather than finding Harborline through the workspace list.

## Backend Module Changes

- `WorkspaceResource` replaces `sourceTemplateOrganizationId` with `publicCode`.
- `WorkspaceService` generates codes and resolves editable workspaces by code.
- `WorkspaceRepository` adds code lookup and collision-safe insertion.
- `WorkspaceRepository.cloneCatalog` and all temporary clone-ID mapping SQL are removed.
- `WorkspaceService.clonePublished` is removed.
- `WorkspaceController.clone` and `WorkspaceController.list` are removed.
- Template-specific validation messages are rewritten to direct users toward creating a new organization.
- Existing clone tests are deleted or replaced with public-code creation and lookup tests.

## Frontend Routing and State

React Router will become the source of truth for the active top-level screen. `App` will no longer hold a manual `AppView` union in component state.

Route responsibilities:

- `/` renders the homepage.
- `/example` renders the Harborline example.
- `/organizations/:publicCode` redirects to the map.
- `/organizations/:publicCode/:view` resolves the organization and renders the requested organization view.
- unknown routes render a lightweight not-found screen.

The organization route loader/query resolves the code once, obtains the internal UUID, and supplies the `Workspace` to `DraftWorkspace`. `DraftEditor` derives its active view from the route segment rather than local state. Inventory stage selection may remain local state because refreshing the inventory screen, rather than a particular inventory subsection, satisfies the approved requirement.

The frontend workspace API removes cloning and listing functions and adds code lookup. Template-clone props, copy-specific wording, and clone-only branches are removed.

Both the local development server and production host must use an SPA history fallback: any non-API path that does not match a static asset serves `index.html`. This ensures that directly opening or refreshing a nested organization URL reaches React Router instead of returning a host-level 404.

## Error Handling

- A malformed code is rejected on the homepage before a request is made.
- An unknown or published-example code returns a consistent organization-not-found response.
- A direct invalid organization route renders a recovery screen with:
  - **Try another organization ID**;
  - **Return home**; and
  - **Create a new organization**.
- API unavailability renders the existing connection-retry treatment without redirecting home.
- A valid organization with an invalid nested view redirects to its map.
- Clipboard failures display a non-blocking message and leave the code visible for manual copying.

## Compatibility and Recovery

- Existing draft organizations survive the migration and receive generated codes.
- Existing cloned organizations become ordinary drafts after clone metadata is removed.
- Existing catalog UUID relationships, canvas positions, and impact behavior remain unchanged.
- During development handoff, the generated codes for important existing test organizations can be retrieved once from the database so they are not effectively hidden after the all-workspaces list is removed.
- Previously bookmarked root URLs continue to open the homepage; there are no existing organization URLs to redirect.

## Test Strategy

### Backend

- Migration integration test proves every existing organization receives a unique non-null code and clone metadata is removed without catalog loss.
- Service tests cover code generation, normalization, collision retry, draft-only lookup, and not-found behavior.
- Controller integration tests cover create-and-return-code, lookup-by-code, malformed code, unknown code, and published-example rejection.
- Existing catalog and impact tests continue proving that UUID-based downstream endpoints work after code resolution.
- Clone endpoint and clone-catalog tests are removed.

### Frontend

- Homepage tests cover code normalization, successful navigation, malformed code, unknown code, blank creation, and absence of clone controls.
- Routing tests directly load and refresh map, inventory, impact, example, and invalid-code routes.
- Impact-route tests prove refresh keeps the user on Test Impact while prior result panels are absent.
- Header tests cover Copy ID and Copy Link content.
- Existing organization-building, graph, and mitigation tests run through routed organization screens.

### Browser verification

- Create an organization and capture its code.
- Refresh map, inventory, and impact routes independently.
- Open the code in a fresh tab and verify the same organization loads.
- Enter the code on the homepage and verify redirection to the map.
- Confirm the impact result clears on refresh without leaving the impact route.
- Confirm Harborline remains explorable and no clone action remains.

## Acceptance Criteria

- A newly created organization receives a stable public code and map URL.
- Entering that code on the homepage opens the correct editable organization.
- Anyone with the code or link can edit the organization in the portfolio MVP.
- Refreshing map, inventory, impact, or example stays on the same screen.
- Impact previews are not persisted and disappear after impact-route refresh.
- Existing organizations and catalog data remain intact after migration.
- Harborline remains a read-only example.
- No clone card, clone API, cloning service, clone SQL, clone metadata field, or template-specific branch remains.
- Invalid codes and routes provide clear recovery actions.
- Backend tests, frontend tests, lint, production build, and browser verification pass.
