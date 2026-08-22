# Organization Deep Linking and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every editable organization a stable public code and refresh-safe nested URL while removing Harborline cloning from the product and backend.

**Architecture:** PostgreSQL keeps UUIDs as internal entity identifiers and gains a unique `public_code` locator on `organizations`. Spring resolves a public code once and continues serving catalog and impact APIs by UUID; React Router becomes the source of truth for home, example, map, inventory, and impact screens.

**Tech Stack:** Java 21, Spring Boot 3.5, Spring JDBC, Flyway, PostgreSQL 17, React 19, TypeScript 6, React Router 7, TanStack Query 5, Vitest, Testing Library, Maven, Vite.

**Spec:** `docs/superpowers/specs/2026-08-21-organization-deep-linking-design.md`

## Global Constraints

- UUID primary and foreign keys remain the internal data model.
- Public organization codes are stable, case-insensitive, random locators in the displayed form `ABC-XXXXXX`.
- The random alphabet excludes `0`, `O`, `1`, and `I`.
- Organization codes do not change when an organization is renamed.
- Anyone with an editable organization link or code can edit it in this portfolio MVP; the UI must warn against entering sensitive data.
- Impact and mitigation results remain temporary and are cleared by an impact-route refresh.
- Harborline remains read-only at `/example` and cannot be opened through the editable code endpoint.
- Previously cloned organizations remain ordinary editable drafts; no organization or catalog record is deleted.
- The all-workspaces endpoint, clone endpoint, clone SQL, clone metadata, and clone-specific UI are removed.
- Existing uncommitted graph and recommendation-transparency changes must be preserved and committed independently from this feature.
- Production code follows test-first red-green-refactor cycles.

---

### Task 1: Add the public-code database contract and remove clone metadata

**Files:**
- Create: `backend/src/main/resources/db/migration/V7__add_organization_public_codes.sql`
- Modify: `backend/src/test/java/com/roleimpact/catalog/persistence/CatalogMigrationIntegrationTest.java`

**Interfaces:**
- Consumes: the `organizations` table produced by migrations V1 through V6.
- Produces: non-null `organizations.public_code VARCHAR(10)`, unique index `uq_organizations_public_code_ci`, and a schema without `source_template_organization_id` or `idx_organizations_source_template`.

- [ ] **Step 1: Add a failing migration-contract test**

Add this test to `CatalogMigrationIntegrationTest`:

```java
@Test
void assignsPublicCodesAndRemovesCloneMetadata() {
	var publicCodes = jdbcClient.sql("SELECT public_code FROM organizations ORDER BY id")
			.query(String.class)
			.list();
	var cloneColumnCount = jdbcClient.sql("""
			SELECT COUNT(*)
			FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name = 'organizations'
			  AND column_name = 'source_template_organization_id'
			""").query(Integer.class).single();

	assertThat(publicCodes).isNotEmpty()
			.allSatisfy(code -> assertThat(code).matches("[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{6}"));
	assertThat(publicCodes.stream().map(String::toUpperCase).distinct().count())
			.isEqualTo(publicCodes.size());
	assertThat(cloneColumnCount).isZero();
}
```

- [ ] **Step 2: Run the migration test and verify the expected failure**

Run:

```powershell
.\backend\mvnw.cmd -f backend\pom.xml -Dtest=CatalogMigrationIntegrationTest#assignsPublicCodesAndRemovesCloneMetadata test
```

Expected: FAIL because `organizations.public_code` does not exist.

- [ ] **Step 3: Add migration V7**

Create the migration with these operations:

```sql
ALTER TABLE organizations ADD COLUMN public_code VARCHAR(10);

CREATE FUNCTION pg_temp.encode_workspace_number(value BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    encoded TEXT := '';
    remainder INTEGER;
BEGIN
    FOR position IN 1..6 LOOP
        remainder := MOD(value, 32);
        encoded := SUBSTRING(alphabet FROM remainder + 1 FOR 1) || encoded;
        value := value / 32;
    END LOOP;
    RETURN encoded;
END;
$$;

WITH ranked_organizations AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS code_number
    FROM organizations
)
UPDATE organizations organization
SET public_code = RPAD(
        SUBSTRING(
            TRANSLATE(
                COALESCE(NULLIF(UPPER(REGEXP_REPLACE(organization.name, '[^A-Za-z0-9]', '', 'g')), ''), 'ORG'),
                'OI01',
                'QJ23'
            )
            FROM 1 FOR 3
        ),
        3,
        'X'
    ) || '-' || pg_temp.encode_workspace_number(ranked.code_number)
FROM ranked_organizations ranked
WHERE ranked.id = organization.id;

ALTER TABLE organizations
    ALTER COLUMN public_code SET NOT NULL,
    ADD CONSTRAINT ck_organizations_public_code_format
        CHECK (public_code ~ '^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{6}$');

CREATE UNIQUE INDEX uq_organizations_public_code_ci
    ON organizations (UPPER(public_code));

DROP INDEX IF EXISTS idx_organizations_source_template;

ALTER TABLE organizations
    DROP CONSTRAINT IF EXISTS ck_organizations_not_own_template,
    DROP COLUMN source_template_organization_id;
```

The ranked Base32-style suffix makes every backfilled code unique without relying on a truncated UUID collision probability. V7 never updates organization IDs or dependent catalog rows.

- [ ] **Step 4: Run the migration test and the full migration suite**

Run:

```powershell
.\backend\mvnw.cmd -f backend\pom.xml -Dtest=CatalogMigrationIntegrationTest test
```

Expected: PASS, including the public-code schema assertions and all seed-data assertions.

- [ ] **Step 5: Commit the migration contract**

```powershell
git add backend/src/main/resources/db/migration/V7__add_organization_public_codes.sql backend/src/test/java/com/roleimpact/catalog/persistence/CatalogMigrationIntegrationTest.java
git commit -m "feat: add stable organization public codes"
```

---

### Task 2: Implement public-code generation, lookup, and clone removal in Spring

**Files:**
- Create: `backend/src/main/java/com/roleimpact/workspace/application/WorkspaceCode.java`
- Create: `backend/src/test/java/com/roleimpact/workspace/application/WorkspaceCodeTest.java`
- Create: `backend/src/test/java/com/roleimpact/workspace/application/WorkspaceServiceTest.java`
- Modify: `backend/src/main/java/com/roleimpact/workspace/api/WorkspaceController.java`
- Modify: `backend/src/main/java/com/roleimpact/workspace/api/WorkspaceResource.java`
- Modify: `backend/src/main/java/com/roleimpact/workspace/application/WorkspaceNotFoundException.java`
- Modify: `backend/src/main/java/com/roleimpact/workspace/application/WorkspaceService.java`
- Modify: `backend/src/main/java/com/roleimpact/workspace/persistence/WorkspaceRepository.java`
- Modify: `backend/src/main/java/com/roleimpact/workspace/editor/application/DraftCatalogService.java`
- Modify: `backend/src/main/java/com/roleimpact/workspace/editor/application/PublishedWorkspaceMutationException.java`
- Modify: `backend/src/test/java/com/roleimpact/workspace/WorkspaceIntegrationTest.java`

**Interfaces:**
- Consumes: `organizations.public_code` from Task 1.
- Produces: `WorkspaceCode.generate(String)`, `WorkspaceCode.normalize(String)`, `WorkspaceService.getEditableByCode(String)`, `WorkspaceRepository.findDraftByPublicCode(String)`, and `GET /api/v1/workspaces/by-code/{publicCode}`.
- Produces: `WorkspaceResource.publicCode()` and removes `sourceTemplateOrganizationId()`.

- [ ] **Step 1: Write failing unit tests for the code value object**

Create `WorkspaceCodeTest` with concrete cases:

```java
class WorkspaceCodeTest {
	@Test
	void normalizesTypedCodesWithOrWithoutTheHyphen() {
		assertThat(WorkspaceCode.normalize(" nsm-7k4p9d ")).isEqualTo("NSM-7K4P9D");
		assertThat(WorkspaceCode.normalize("nsm7k4p9d")).isEqualTo("NSM-7K4P9D");
	}

	@Test
	void rejectsMalformedOrAmbiguousCodes() {
		assertThat(WorkspaceCode.normalize("NSM-7K4P0D")).isNull();
		assertThat(WorkspaceCode.normalize("not-a-code")).isNull();
	}

	@Test
	void generatesANamePrefixAndAllowedRandomSuffix() {
		var code = new WorkspaceCode(new java.security.SecureRandom()).generate("Northstar Medical Supplies");
		assertThat(code).matches("NMS-[A-HJ-NP-Z2-9]{6}");
	}
}
```

- [ ] **Step 2: Run the unit test and verify the expected failure**

Run:

```powershell
.\backend\mvnw.cmd -f backend\pom.xml -Dtest=WorkspaceCodeTest test
```

Expected: FAIL because `WorkspaceCode` does not exist.

- [ ] **Step 3: Implement the code value object**

Implement `WorkspaceCode` as a Spring component with:

```java
@Component
public class WorkspaceCode {
	private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	private static final Pattern DISPLAYED = Pattern.compile("^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{6}$");
	private final SecureRandom random;

	public WorkspaceCode() {
		this(new SecureRandom());
	}

	WorkspaceCode(SecureRandom random) {
		this.random = random;
	}

	public String generate(String organizationName) {
		String asciiName = Normalizer.normalize(organizationName, Normalizer.Form.NFD)
				.replaceAll("\\p{M}", "")
				.toUpperCase(Locale.ROOT);
		String initials = Arrays.stream(asciiName.split("[^A-Z0-9]+"))
				.filter(token -> !token.isBlank())
				.map(token -> token.substring(0, 1))
				.collect(Collectors.joining());
		String compact = asciiName.replaceAll("[^A-Z0-9]", "");
		String prefixSeed = sanitize(initials + compact + "ORG");
		StringBuilder suffix = new StringBuilder(6);
		for (int index = 0; index < 6; index++) {
			suffix.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
		}
		return prefixSeed.substring(0, 3) + "-" + suffix;
	}

	public static String normalize(String rawCode) {
		if (rawCode == null) return null;
		String candidate = rawCode.trim().toUpperCase(Locale.ROOT);
		if (candidate.matches("^[A-HJ-NP-Z2-9]{9}$")) {
			candidate = candidate.substring(0, 3) + "-" + candidate.substring(3);
		}
		return DISPLAYED.matcher(candidate).matches() ? candidate : null;
	}

	private static String sanitize(String value) {
		return value.replace('O', 'Q').replace('I', 'J').replace('0', '2').replace('1', '3')
				.replaceAll("[^A-HJ-NP-Z2-9]", "");
	}
}
```

Import `Normalizer`, `SecureRandom`, `Arrays`, `Locale`, `Pattern`, and `Collectors`. Appending the compact name and `ORG` guarantees a three-character prefix; `sanitize` removes ambiguous characters from the complete code.

- [ ] **Step 4: Run `WorkspaceCodeTest` and verify it passes**

Run:

```powershell
.\backend\mvnw.cmd -f backend\pom.xml -Dtest=WorkspaceCodeTest test
```

Expected: PASS.

- [ ] **Step 5: Add a failing service test for public-code collision retry**

Use Mockito to make the first generated code collide and the second succeed:

```java
@ExtendWith(MockitoExtension.class)
class WorkspaceServiceTest {
	@Mock WorkspaceRepository repository;
	@Mock WorkspaceCode workspaceCode;

	@Test
	void retriesAPublicCodeCollisionWithoutChangingTheSlug() {
		when(repository.existsBySlug("northstar-medical-supplies")).thenReturn(false);
		when(workspaceCode.generate("Northstar Medical Supplies"))
				.thenReturn("NMS-AAAAAA", "NMS-AAAAAB");
		doThrow(new DataIntegrityViolationException("public code collision"))
				.doNothing()
				.when(repository).insertDraft(any(UUID.class), eq("northstar-medical-supplies"),
						eq("Northstar Medical Supplies"), anyString());
		when(repository.existsByPublicCode("NMS-AAAAAA")).thenReturn(true);
		when(repository.findById(any(UUID.class))).thenAnswer(invocation -> Optional.of(
				workspace(invocation.getArgument(0), "NMS-AAAAAB")));

		var service = new WorkspaceService(repository, workspaceCode);
		var created = service.createBlank(new WorkspaceRequest("Northstar Medical Supplies", null));

		assertThat(created.publicCode()).isEqualTo("NMS-AAAAAB");
		verify(repository).insertDraft(any(UUID.class), eq("northstar-medical-supplies"),
				eq("Northstar Medical Supplies"), eq("NMS-AAAAAA"));
		verify(repository).insertDraft(any(UUID.class), eq("northstar-medical-supplies"),
				eq("Northstar Medical Supplies"), eq("NMS-AAAAAB"));
	}
}
```

Define the fixture in the same test class:

```java
private WorkspaceResource workspace(UUID id, String publicCode) {
	var timestamp = Instant.parse("2026-08-21T12:00:00Z");
	return new WorkspaceResource(
			id,
			"northstar-medical-supplies",
			"Northstar Medical Supplies",
			"DRAFT",
			0,
			publicCode,
			timestamp,
			timestamp,
			new WorkspaceResource.WorkspaceCounts(0, 0, 0, 0, 0, 0));
}
```

- [ ] **Step 6: Run the collision test and verify the expected failure**

Run:

```powershell
.\backend\mvnw.cmd -f backend\pom.xml -Dtest=WorkspaceServiceTest test
```

Expected: FAIL because `WorkspaceService` does not yet accept `WorkspaceCode` or retry a collision.

- [ ] **Step 7: Replace the clone integration test with failing creation and lookup tests**

In `WorkspaceIntegrationTest`, replace `createsBlankAndClonedDraftsWithoutChangingThePublishedTemplate` with tests that assert:

```java
@Test
void createsAndResolvesAnEditableDraftByPublicCode() throws Exception {
	var created = mockMvc.perform(post("/api/v1/workspaces")
			.contentType(MediaType.APPLICATION_JSON)
			.content(workspaceRequest("Northstar Medical Supplies", null)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.publicCode").value(org.hamcrest.Matchers.matchesPattern("NMS-[A-HJ-NP-Z2-9]{6}")))
			.andReturn();
	var resource = objectMapper.readTree(created.getResponse().getContentAsString());
	var publicCode = resource.path("publicCode").asText();

	mockMvc.perform(get("/api/v1/workspaces/by-code/{publicCode}", publicCode.toLowerCase()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.id").value(resource.path("id").asText()))
			.andExpect(jsonPath("$.status").value("DRAFT"));
}
```

Also add tests proving:

```java
mockMvc.perform(get("/api/v1/workspaces/by-code/{publicCode}", "bad-code"))
		.andExpect(status().isNotFound());
mockMvc.perform(get("/api/v1/workspaces/by-code/{publicCode}", harborlinePublicCode))
		.andExpect(status().isNotFound());
mockMvc.perform(get("/api/v1/workspaces"))
		.andExpect(status().isMethodNotAllowed());
mockMvc.perform(post("/api/v1/workspaces/{sourceWorkspaceId}/clones", HARBORLINE_ID)
		.contentType(MediaType.APPLICATION_JSON)
		.content(workspaceRequest("Removed Clone", null)))
		.andExpect(status().isNotFound());
```

- [ ] **Step 8: Run the Spring integration test and verify the expected failures**

Run:

```powershell
.\backend\mvnw.cmd -f backend\pom.xml -Dtest=WorkspaceIntegrationTest test
```

Expected: FAIL because the resource has no public code, lookup is absent, and list/clone endpoints still exist.

- [ ] **Step 9: Implement repository and service behavior**

Change the workspace select and mapper to read `o.public_code`. Add:

```java
public Optional<WorkspaceResource> findDraftByPublicCode(String publicCode) {
	return jdbcClient.sql(WORKSPACE_SELECT + " WHERE UPPER(o.public_code) = :publicCode AND o.workspace_status = 'DRAFT'")
			.param("publicCode", publicCode)
			.query(this::mapWorkspace)
			.optional();
}

public boolean existsByPublicCode(String publicCode) {
	return jdbcClient.sql("SELECT EXISTS (SELECT 1 FROM organizations WHERE UPPER(public_code) = :publicCode)")
			.param("publicCode", publicCode)
			.query(Boolean.class)
			.single();
}

public void insertDraft(UUID id, String slug, String name, String publicCode) {
	jdbcClient.sql("""
			INSERT INTO organizations (
			    id, slug, name, current_version, workspace_status, public_code, created_at, updated_at
			) VALUES (
			    :id, :slug, :name, 0, 'DRAFT', :publicCode, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
			)
			""")
			.param("id", id)
			.param("slug", slug)
			.param("name", name)
			.param("publicCode", publicCode)
			.update();
}
```

Inject `WorkspaceCode` beside `WorkspaceRepository`. Change `WorkspaceService.createBlank` to generate a code and retry a public-code collision up to five times:

```java
@Transactional
public WorkspaceResource createBlank(WorkspaceRequest request) {
	String name = request.name().trim();
	String slug = resolveSlug(request, name);
	if (workspaceRepository.existsBySlug(slug)) {
		throw new WorkspaceConflictException("A workspace with slug '" + slug + "' already exists");
	}

	for (int attempt = 0; attempt < 5; attempt++) {
		UUID workspaceId = UUID.randomUUID();
		String publicCode = workspaceCode.generate(name);
		try {
			workspaceRepository.insertDraft(workspaceId, slug, name, publicCode);
			return get(workspaceId);
		}
		catch (DataIntegrityViolationException exception) {
			if (workspaceRepository.existsBySlug(slug)) {
				throw new WorkspaceConflictException("A workspace with slug '" + slug + "' already exists");
			}
			if (!workspaceRepository.existsByPublicCode(publicCode)) {
				throw exception;
			}
		}
	}
	throw new WorkspaceConflictException("A unique organization ID could not be generated; try again");
}
```

Add code lookup:

```java
@Transactional(readOnly = true)
public WorkspaceResource getEditableByCode(String rawCode) {
	String code = WorkspaceCode.normalize(rawCode);
	if (code == null) throw new WorkspaceNotFoundException(rawCode);
	return workspaceRepository.findDraftByPublicCode(code)
			.orElseThrow(() -> new WorkspaceNotFoundException(rawCode));
}
```

Remove `list`, `clonePublished`, `findAll`, `findStatus`, `cloneCatalog`, and the clone-ID mapping helpers.

- [ ] **Step 10: Update the REST resource and controller**

Replace `sourceTemplateOrganizationId` with `String publicCode` in `WorkspaceResource`. Add:

```java
@GetMapping("/by-code/{publicCode}")
public WorkspaceResource getByCode(@PathVariable String publicCode) {
	return workspaceService.getEditableByCode(publicCode);
}
```

Remove the list and clone mappings. Set the create response Location header to `/api/v1/workspaces/by-code/{publicCode}`.

- [ ] **Step 11: Remove clone-specific messages**

Change published mutation guidance to “Published examples are read-only; create a new organization to make changes.” Change the example workflow guidance to instruct users to create a custom workflow without mentioning cloning.

- [ ] **Step 12: Run backend tests**

Run:

```powershell
.\backend\mvnw.cmd -f backend\pom.xml test
```

Expected: PASS with no references to the removed clone endpoint or metadata.

- [ ] **Step 13: Commit the backend API boundary**

```powershell
git add backend/src
git commit -m "feat: resolve editable organizations by public code"
```

---

### Task 3: Replace homepage cloning with organization-code access

**Files:**
- Modify: `frontend/src/api/workspaces.ts`
- Modify: `frontend/src/components/workspaces/WorkspaceWelcome.tsx`
- Modify: `frontend/src/App.css`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/workspaces/by-code/{publicCode}` and `POST /api/v1/workspaces` from Task 2.
- Produces: `normalizeWorkspaceCode(rawCode): string | null`, `fetchWorkspaceByCode(rawCode, signal?)`, and a homepage with Explore, Open, and Create choices.

- [ ] **Step 1: Add failing homepage tests**

Update the test renderer to include `MemoryRouter` and accept `initialEntries`. Add tests that:

```tsx
const linkedWorkspaceFixture: Workspace = {
  id: '10000000-0000-0000-0000-000000000001',
  slug: 'northstar-medical-supplies',
  name: 'Northstar Medical Supplies',
  status: 'DRAFT',
  currentVersion: 0,
  publicCode: 'NMS-7K4P9D',
  createdAt: '2026-08-21T12:00:00Z',
  updatedAt: '2026-08-21T12:00:00Z',
  counts: { teams: 0, members: 0, roles: 0, permissions: 0, capabilities: 0, workflows: 0 },
}
```

```tsx
it('opens an existing organization by a normalized code', async () => {
  const user = userEvent.setup()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input.toString()
    if (url.endsWith('/api/v1/dashboard')) return jsonResponse(dashboardFixture)
    if (url.endsWith('/api/v1/workspaces/by-code/NMS-7K4P9D')) {
      return jsonResponse(linkedWorkspaceFixture)
    }
    if (url.endsWith('/catalog')) return jsonResponse(blankCatalogFixture)
    if (url.endsWith('/impact-previews/continuity')) return jsonResponse([])
    return new Response(null, { status: 404 })
  })
  renderApp(['/'])
  await user.type(screen.getByLabelText('Organization ID'), ' nms7k4p9d ')
  await user.click(screen.getByRole('button', { name: 'Open organization' }))
  expect(await screen.findByRole('heading', { name: 'Northstar Medical Supplies' })).toBeInTheDocument()
  expect(screen.getByText('NMS-7K4P9D')).toBeInTheDocument()
})
```

Add assertions that the homepage has no “Clone Harborline” or “Clone and customize”, malformed codes show an inline message without a fetch, unknown codes show “Organization not found”, and a successful blank creation navigates to the new organization.

- [ ] **Step 2: Run the homepage tests and verify the expected failures**

Run:

```powershell
npm --prefix frontend test -- --run src/App.test.tsx
```

Expected: FAIL because the homepage still lists workspaces and clones Harborline.

- [ ] **Step 3: Replace the workspace API client**

Change `Workspace` to include `publicCode: string` and remove `sourceTemplateOrganizationId`. Remove `fetchWorkspaces` and `cloneWorkspace`. Add:

```ts
export function normalizeWorkspaceCode(rawCode: string): string | null {
  const compact = rawCode.trim().toUpperCase().replace('-', '')
  if (!/^[A-HJ-NP-Z2-9]{9}$/.test(compact)) return null
  return `${compact.slice(0, 3)}-${compact.slice(3)}`
}

export async function fetchWorkspaceByCode(rawCode: string, signal?: AbortSignal): Promise<Workspace> {
  const code = normalizeWorkspaceCode(rawCode)
  if (!code) throw new Error('Enter an organization ID such as NMS-7K4P9D')
  const response = await fetch(`${apiBaseUrl}/api/v1/workspaces/by-code/${code}`, { signal })
  return readResponse(response, 'Organization not found')
}
```

- [ ] **Step 4: Rebuild `WorkspaceWelcome` around the three approved choices**

Use `fetchDashboard` for Harborline counts. Use `useNavigate` for navigation. On open success navigate to `/organizations/${workspace.publicCode}/map`; on create success navigate to the same path with `{ state: { newlyCreated: true } }`.

The organization code form must use:

```tsx
<label htmlFor="organization-code">Organization ID</label>
<input
  id="organization-code"
  value={organizationCode}
  onChange={(event) => setOrganizationCode(event.target.value)}
  placeholder="NMS-7K4P9D"
/>
<button type="submit" disabled={openMutation.isPending || !organizationCode.trim()}>
  {openMutation.isPending ? 'Opening…' : 'Open organization'}
</button>
```

Keep Harborline exploration independent of dashboard-count failure: show em dashes for unavailable counts while leaving the Explore action available.

- [ ] **Step 5: Update homepage styles**

Reuse `.workspace-choice` structure. Add an inline organization-code hint and error treatment without introducing a new page layout. Keep the three cards usable at existing responsive breakpoints.

- [ ] **Step 6: Run the homepage tests**

Run:

```powershell
npm --prefix frontend test -- --run src/App.test.tsx
```

Expected: homepage access and creation tests PASS; route-shell tests may still fail until Task 4.

- [ ] **Step 7: Commit the homepage access flow**

```powershell
git add frontend/src/api/workspaces.ts frontend/src/components/workspaces/WorkspaceWelcome.tsx frontend/src/App.css frontend/src/App.test.tsx
git commit -m "feat: open organizations from the homepage"
```

---

### Task 4: Make nested routes the source of truth for organization screens

**Files:**
- Create: `frontend/src/components/workspaces/OrganizationRoute.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/workspaces/DraftWorkspace.tsx`
- Modify: `frontend/src/components/workspaces/editor/DraftEditor.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `fetchWorkspaceByCode` from Task 3.
- Produces: `/`, `/example`, `/organizations/:publicCode`, and `/organizations/:publicCode/:view` where `view` is `map | inventory | impact`.
- Produces: `DraftEditor({ workspaceId, view, onViewChange })` with no internal top-level view state.

- [ ] **Step 1: Add failing direct-navigation and refresh tests**

Add one test per approved route:

```tsx
function mockOrganizationRoute() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input.toString()
    if (url.endsWith('/api/v1/workspaces/by-code/NMS-7K4P9D')) {
      return jsonResponse(linkedWorkspaceFixture)
    }
    if (url.endsWith('/catalog')) return jsonResponse(blankCatalogFixture)
    if (url.endsWith('/impact-previews/continuity')) return jsonResponse([])
    if (url.endsWith('/api/v1/dashboard')) return jsonResponse(dashboardFixture)
    return new Response(null, { status: 404 })
  })
}

it.each([
  ['/organizations/NMS-7K4P9D/map', 'Map how your organization works'],
  ['/organizations/NMS-7K4P9D/inventory', 'Detailed inventory'],
  ['/organizations/NMS-7K4P9D/impact', 'Test a change before it happens'],
])('loads %s directly', async (entry, expectedText) => {
  mockOrganizationRoute()
  renderApp([entry])
  expect(await screen.findByText(expectedText)).toBeInTheDocument()
})
```

Add tests for `/organizations/NMS-7K4P9D` redirecting to `/map`, an invalid nested view redirecting to `/map`, `/example` surviving direct load, and an unknown code rendering recovery actions without redirecting home.

For impact refresh semantics, render directly at `/impact` and assert the Test Impact screen is present while no prior result or mitigation verdict is present.

- [ ] **Step 2: Run the route tests and verify the expected failures**

Run:

```powershell
npm --prefix frontend test -- --run src/App.test.tsx
```

Expected: FAIL because `App` still uses local `AppView` state.

- [ ] **Step 3: Implement route declarations in `App`**

Replace local view state with:

```tsx
<Routes>
  <Route path="/" element={<WorkspaceWelcome />} />
  <Route path="/example" element={<HarborlineDashboard />} />
  <Route path="/organizations/:publicCode" element={<OrganizationIndexRedirect />} />
  <Route path="/organizations/:publicCode/:view" element={<OrganizationRoute />} />
  <Route path="*" element={<RouteNotFound />} />
</Routes>
```

Use `useNavigate` for Harborline’s back action. `OrganizationIndexRedirect` reads `publicCode` and returns `<Navigate replace to={`/organizations/${publicCode}/map`} />`.

- [ ] **Step 4: Implement `OrganizationRoute`**

`OrganizationRoute` must:

```tsx
const validViews = ['map', 'inventory', 'impact'] as const
type OrganizationView = typeof validViews[number]
```

Normalize the route code, fetch the workspace with TanStack Query key `['workspace', normalizedCode]`, redirect an invalid view to the organization map, and render a recovery screen for invalid/unknown codes. Keep connection errors on the route with a Retry action.

Pass `newlyCreated` from `location.state` to `DraftWorkspace`; do not store it in the URL or database.

- [ ] **Step 5: Make `DraftWorkspace` route-aware**

Replace `onBack` with:

```ts
type DraftWorkspaceProps = {
  workspace: Workspace
  view: OrganizationView
  newlyCreated: boolean
  onViewChange: (view: OrganizationView) => void
}
```

Use navigation to return home and pass route view props to `DraftEditor`.

- [ ] **Step 6: Remove top-level view state from `DraftEditor`**

Change the signature to:

```ts
export default function DraftEditor({ workspaceId, view, onViewChange }: {
  workspaceId: string
  view: 'map' | 'impact' | 'inventory'
  onViewChange: (view: 'map' | 'impact' | 'inventory') => void
})
```

Replace `setView('map')`, `setView('impact')`, and `setView('inventory')` with the matching `onViewChange` calls. Retain inventory `stage` as local state. Pass `initialFocus={false}` to `OrganizationCanvas` and remove `isTemplateClone`.

- [ ] **Step 7: Run direct-route tests and the full frontend suite**

Run:

```powershell
npm --prefix frontend test
```

Expected: PASS, including direct map, inventory, impact, example, redirect, and recovery tests.

- [ ] **Step 8: Commit nested routing**

```powershell
git add frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/components/workspaces/OrganizationRoute.tsx frontend/src/components/workspaces/DraftWorkspace.tsx frontend/src/components/workspaces/editor/DraftEditor.tsx
git commit -m "feat: add refresh-safe organization routes"
```

---

### Task 5: Add persistent organization recovery controls and creation onboarding

**Files:**
- Modify: `frontend/src/components/workspaces/DraftWorkspace.tsx`
- Modify: `frontend/src/App.css`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `Workspace.publicCode`, routed organization view, and `newlyCreated` from Task 4.
- Produces: persistent Copy ID and Copy organization link actions plus a dismissible first-creation notice.

- [ ] **Step 1: Add failing copy and onboarding tests**

Mock `navigator.clipboard.writeText`. Add tests asserting:

```tsx
expect(screen.getByText('NMS-7K4P9D')).toBeInTheDocument()
await user.click(screen.getByRole('button', { name: 'Copy organization ID' }))
expect(navigator.clipboard.writeText).toHaveBeenCalledWith('NMS-7K4P9D')
await user.click(screen.getByRole('button', { name: 'Copy organization link' }))
expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
  `${window.location.origin}/organizations/NMS-7K4P9D/map`,
)
```

Creation navigation must show “Save this organization ID” and the warning “Anyone with this link or ID can edit this organization.” Directly reopening the same URL must keep header controls but not show the creation notice.

- [ ] **Step 2: Run the focused tests and verify the expected failures**

Run:

```powershell
npm --prefix frontend test -- --run src/App.test.tsx
```

Expected: FAIL because recovery controls and onboarding do not exist.

- [ ] **Step 3: Implement copy controls and creation notice**

In `DraftWorkspace`, derive the canonical map link from `window.location.origin` and `workspace.publicCode`. Keep copy feedback local and non-blocking:

```ts
async function copy(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value)
    setCopyMessage(successMessage)
  } catch {
    setCopyMessage('Copy failed. Select the visible organization ID instead.')
  }
}
```

The persistent header displays the public code and both copy buttons. The dismissible onboarding notice appears only when `newlyCreated` is true and includes the no-sensitive-data warning.

- [ ] **Step 4: Style recovery controls for desktop and mobile**

Add `.organization-recovery`, `.organization-code`, and `.organization-onboarding` styles that use existing colors, border radii, focus treatments, and mobile wrapping behavior.

- [ ] **Step 5: Run the full frontend quality gate**

Run:

```powershell
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all commands PASS without warnings introduced by this feature.

- [ ] **Step 6: Commit recovery controls**

```powershell
git add frontend/src/components/workspaces/DraftWorkspace.tsx frontend/src/App.css frontend/src/App.test.tsx
git commit -m "feat: expose organization recovery controls"
```

---

### Task 6: Verify direct-link hosting behavior and complete clone cleanup

**Files:**
- Modify: `README.md`
- Modify: any test fixture still containing `sourceTemplateOrganizationId` or clone actions.

**Interfaces:**
- Consumes: the complete backend and frontend feature.
- Produces: documented organization URL behavior, deployment fallback requirement, and a repository with no active cloning implementation.

- [ ] **Step 1: Scan for forbidden clone implementation references**

Run:

```powershell
rg -n -i "sourceTemplateOrganizationId|source_template_organization_id|cloneWorkspace|clonePublished|cloneCatalog|/clones|Clone Harborline|Clone and customize" backend/src frontend/src README.md
```

Expected: no matches outside historical migration V4 and the V7 statement that drops the old column. Remove stale test fixtures and product copy if the scan reports them.

- [ ] **Step 2: Update README routes and local verification**

Document:

```markdown
- `GET /api/v1/workspaces/by-code/{publicCode}` resolves an editable organization.
- `/organizations/{publicCode}/map` opens its organization map.
- `/organizations/{publicCode}/inventory` opens its detailed inventory.
- `/organizations/{publicCode}/impact` opens a fresh impact-testing screen.
```

State that production hosting must rewrite non-asset, non-API paths to `frontend/index.html`. Document that Vite dev and preview already provide the SPA history fallback used for local verification.

- [ ] **Step 3: Run all automated checks**

Run:

```powershell
.\backend\mvnw.cmd -f backend\pom.xml test
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: every command PASS.

- [ ] **Step 4: Perform browser acceptance verification**

With PostgreSQL, API, and frontend running:

1. Create a blank organization and record its displayed ID.
2. Refresh its map route and confirm the same organization loads.
3. Navigate to inventory, refresh, and confirm inventory remains selected.
4. Navigate to impact, run a test, refresh, and confirm the impact screen remains while the previous result is cleared.
5. Paste the organization map URL into a fresh tab and confirm it loads.
6. Enter the ID without its hyphen on the homepage and confirm it opens the organization.
7. Open `/example`, refresh, and confirm Harborline remains read-only.
8. Enter an unknown valid-format code and confirm the recovery screen offers Try another ID, Return home, and Create a new organization.

- [ ] **Step 5: Commit documentation and cleanup**

```powershell
git add README.md backend/src frontend/src
git commit -m "docs: document organization deep links"
```

- [ ] **Step 6: Review the final diff**

Run:

```powershell
git status --short
git diff --stat HEAD~5..HEAD
git log --oneline -6
```

Expected: no unintended files, no uncommitted feature changes, and separate commits for schema, backend API, homepage, routing, recovery controls, and documentation.
