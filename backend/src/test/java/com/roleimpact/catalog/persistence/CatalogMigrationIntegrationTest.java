package com.roleimpact.catalog.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.roleimpact.catalog.snapshot.OrganizationSnapshotAssembler;
import com.roleimpact.impactengine.ImpactEngine;
import com.roleimpact.impactengine.ImpactResult.PathNodeType;
import com.roleimpact.impactengine.ImpactResult.Severity;
import com.roleimpact.impactengine.ImpactResult.WorkflowStatus;
import com.roleimpact.impactengine.RevokeEmployeeRole;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers
@AutoConfigureMockMvc
class CatalogMigrationIntegrationTest {

	private static final UUID HARBORLINE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
	private static final UUID PRIYA_ID = UUID.fromString("20000000-0000-0000-0000-000000000001");
	private static final UUID BOB_ID = UUID.fromString("20000000-0000-0000-0000-000000000002");
	private static final UUID FINANCE_APPROVER_ID = UUID.fromString("30000000-0000-0000-0000-000000000002");

	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine")
			.withDatabaseName("roleimpact")
			.withUsername("roleimpact")
			.withPassword("roleimpact");

	@Autowired
	private JdbcClient jdbcClient;

	@Autowired
	private OrganizationRepository organizationRepository;

	@Autowired
	private EmployeeRepository employeeRepository;

	@Autowired
	private RoleRepository roleRepository;

	@Autowired
	private WorkflowRepository workflowRepository;

	@Autowired
	private OrganizationSnapshotAssembler snapshotAssembler;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private ImpactEngine impactEngine;

	@Autowired
	private ObjectMapper objectMapper;

	@Test
	void appliesSchemaAndLoadsTheCompleteHarborlineBaseline() {
		assertThat(count("organizations")).isEqualTo(1);
		assertThat(count("teams")).isEqualTo(5);
		assertThat(count("employees")).isEqualTo(25);
		assertThat(count("roles")).isEqualTo(8);
		assertThat(count("applications")).isEqualTo(6);
		assertThat(count("permissions")).isEqualTo(23);
		assertThat(count("capabilities")).isEqualTo(10);
		assertThat(count("workflows")).isEqualTo(4);
		assertThat(count("workflow_steps")).isEqualTo(11);
		assertThat(count("workflow_constraints")).isEqualTo(3);

		var successfulMigrations = jdbcClient.sql("""
				SELECT COUNT(*)
				FROM flyway_schema_history
				WHERE success = TRUE AND type = 'SQL'
				""")
				.query(Integer.class)
				.single();

		assertThat(successfulMigrations).isEqualTo(3);
	}

	@Test
	void mapsSeededCatalogDataThroughJpa() {
		var organization = organizationRepository.findBySlug("harborline-commerce").orElseThrow();
		var priya = employeeRepository.findByOrganizationIdAndName(HARBORLINE_ID, "Priya Sharma").orElseThrow();
		var financeApprover = roleRepository.findByOrganizationIdAndName(HARBORLINE_ID, "Finance Approver").orElseThrow();
		var workflows = workflowRepository.findAllByOrganizationIdOrderByName(HARBORLINE_ID);

		assertThat(organization.getName()).isEqualTo("Harborline Commerce");
		assertThat(organization.getCurrentVersion()).isEqualTo(1);
		assertThat(priya.getShift().name()).isEqualTo("EVENING");
		assertThat(financeApprover.getSensitivity().name()).isEqualTo("CRITICAL");
		assertThat(workflows).extracting(WorkflowEntity::getName)
				.containsExactly("Customer Refund", "Month-End Close", "Production Deployment", "Vendor Payment");
	}

	@Test
	void preservesThePrimaryPriyaScenarioInTheSeedGraph() {
		var eveningPaymentApprovers = jdbcClient.sql("""
				SELECT e.name
				FROM employees e
				JOIN teams t ON t.id = e.team_id
				JOIN employee_roles er ON er.employee_id = e.id
				JOIN role_permissions rp ON rp.role_id = er.role_id
				JOIN permissions p ON p.id = rp.permission_id
				WHERE e.status = 'ACTIVE'
				  AND e.shift = 'EVENING'
				  AND t.department = 'Finance'
				  AND p.action = 'payment.approve'
				ORDER BY e.id
				""")
				.query(String.class)
				.list();

		var closePeriodActors = jdbcClient.sql("""
				SELECT DISTINCT e.name
				FROM employees e
				JOIN employee_roles er ON er.employee_id = e.id
				JOIN role_permissions rp ON rp.role_id = er.role_id
				JOIN permissions p ON p.id = rp.permission_id
				WHERE e.status = 'ACTIVE' AND p.action = 'ledger.close'
				ORDER BY e.name
				""")
				.query(String.class)
				.list();

		var bobHasLedgerProAccess = jdbcClient.sql("""
				SELECT EXISTS (
				    SELECT 1
				    FROM employees e
				    JOIN employee_roles er ON er.employee_id = e.id
				    JOIN role_permissions rp ON rp.role_id = er.role_id
				    JOIN permissions p ON p.id = rp.permission_id
				    JOIN applications a ON a.id = p.application_id
				    WHERE e.name = 'Bob Chen' AND a.name = 'LedgerPro'
				)
				""")
				.query(Boolean.class)
				.single();

		assertThat(eveningPaymentApprovers).containsExactly("Priya Sharma");
		assertThat(closePeriodActors).containsExactly("Olivia Park", "Priya Sharma");
		assertThat(bobHasLedgerProAccess).isTrue();
	}

	@Test
	void allowsSimulationNotesButRejectsChangesToSavedEvidence() {
		jdbcClient.sql("""
				INSERT INTO simulations (
				    id, organization_id, baseline_version, engine_version, request_hash,
				    change_type, change_payload, result_status, result_payload, severity,
				    created_at, completed_at
				) VALUES (
				    'b0000000-0000-0000-0000-000000000001',
				    '00000000-0000-0000-0000-000000000001',
				    1, 'test-engine',
				    '1111111111111111111111111111111111111111111111111111111111111111',
				    'REVOKE_EMPLOYEE_ROLE',
				    '{"schemaVersion":"1.0"}'::jsonb,
				    'COMPLETE',
				    '{"schemaVersion":"1.0"}'::jsonb,
				    'CRITICAL',
				    '2026-01-05T15:00:00Z',
				    '2026-01-05T15:00:01Z'
				)
				""").update();

		jdbcClient.sql("""
				UPDATE simulations
				SET name = 'Reviewed Priya scenario', reviewer_notes = 'Ready for review'
				WHERE id = 'b0000000-0000-0000-0000-000000000001'
				""").update();

		assertThatThrownBy(() -> jdbcClient.sql("""
				UPDATE simulations
				SET severity = 'LOW'
				WHERE id = 'b0000000-0000-0000-0000-000000000001'
				""").update())
				.hasMessageContaining("Simulation inputs and results are immutable");
	}

	@Test
	void assemblesAnImmutableVersionedOrganizationSnapshot() {
		var snapshot = snapshotAssembler.assemble("harborline-commerce");
		var priya = snapshot.employees().values().stream()
				.filter(employee -> employee.name().equals("Priya Sharma"))
				.findFirst()
				.orElseThrow();
		var financeApprover = snapshot.roles().values().stream()
				.filter(role -> role.name().equals("Finance Approver"))
				.findFirst()
				.orElseThrow();

		assertThat(snapshot.organization().version()).isEqualTo(1);
		assertThat(snapshot.organization().contentHash()).hasSize(64);
		assertThat(snapshot.employees()).hasSize(25);
		assertThat(snapshot.permissions()).hasSize(23);
		assertThat(snapshot.workflows()).hasSize(4);
		assertThat(snapshot.workflows().values())
				.allSatisfy(workflow -> assertThat(workflow.steps()).isNotEmpty());
		assertThat(snapshot.roleIdsByEmployeeId().get(priya.id())).contains(financeApprover.id());
		assertThat(snapshot.permissionIdsByRoleId().get(financeApprover.id())).isNotEmpty();
		assertThatThrownBy(() -> snapshot.employees().clear())
				.isInstanceOf(UnsupportedOperationException.class);
		assertThatThrownBy(() -> snapshot.roleIdsByEmployeeId().get(priya.id()).clear())
				.isInstanceOf(UnsupportedOperationException.class);
	}

	@Test
	void servesTheSeededDashboardFromTheSnapshotBoundary() throws Exception {
		mockMvc.perform(get("/api/v1/dashboard"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.organization.slug").value("harborline-commerce"))
				.andExpect(jsonPath("$.organization.baselineVersion").value(1))
				.andExpect(jsonPath("$.counts.employees").value(25))
				.andExpect(jsonPath("$.counts.activeEmployees").value(24))
				.andExpect(jsonPath("$.counts.roles").value(8))
				.andExpect(jsonPath("$.counts.applications").value(6))
				.andExpect(jsonPath("$.counts.permissions").value(23))
				.andExpect(jsonPath("$.counts.workflows").value(4))
				.andExpect(jsonPath("$.workflows[0].name").value("Production Deployment"))
				.andExpect(jsonPath("$.workflows[0].criticality").value("CRITICAL"));
	}

	@Test
	void returnsNotFoundForAnUnknownDashboardOrganization() throws Exception {
		mockMvc.perform(get("/api/v1/dashboard").param("organization", "missing-company"))
				.andExpect(status().isNotFound());
	}

	@Test
	void deterministicallyExplainsThePrimaryPriyaScenarioWithoutMutatingTheBaseline() {
		var snapshot = snapshotAssembler.assemble(HARBORLINE_ID);
		var change = new RevokeEmployeeRole(PRIYA_ID, FINANCE_APPROVER_ID);

		var firstResult = impactEngine.analyze(snapshot, change);
		var secondResult = impactEngine.analyze(snapshot, change);

		assertThat(firstResult).isEqualTo(secondResult);
		assertThat(firstResult.diagnostics().resultHash()).hasSize(64);
		assertThat(firstResult.overallSeverity()).isEqualTo(Severity.CRITICAL);
		assertThat(firstResult.executiveSummary().rolesRemoved()).isEqualTo(1);
		assertThat(firstResult.executiveSummary().permissionsLost()).isEqualTo(2);
		assertThat(firstResult.executiveSummary().workflowsBlocked()).isEqualTo(1);
		assertThat(firstResult.executiveSummary().workflowsDegraded()).isEqualTo(1);
		assertThat(firstResult.technicalImpact().lostPermissions())
				.extracting(permission -> permission.action())
				.containsExactly("ledger.close", "payment.approve");

		var vendorPayment = firstResult.workflowImpacts().stream()
				.filter(workflow -> workflow.workflowName().equals("Vendor Payment"))
				.findFirst()
				.orElseThrow();
		var monthEndClose = firstResult.workflowImpacts().stream()
				.filter(workflow -> workflow.workflowName().equals("Month-End Close"))
				.findFirst()
				.orElseThrow();

		assertThat(vendorPayment.baselineStatus()).isEqualTo(WorkflowStatus.OPERATIONAL);
		assertThat(vendorPayment.scenarioStatus()).isEqualTo(WorkflowStatus.BLOCKED);
		assertThat(monthEndClose.baselineStatus()).isEqualTo(WorkflowStatus.OPERATIONAL);
		assertThat(monthEndClose.scenarioStatus()).isEqualTo(WorkflowStatus.DEGRADED);
		assertThat(firstResult.explanationPaths()).hasSize(2)
				.allSatisfy(path -> {
					assertThat(path.nodes().getFirst().type()).isEqualTo(PathNodeType.EMPLOYEE);
					assertThat(path.nodes().getLast().type()).isEqualTo(PathNodeType.WORKFLOW);
				});
		assertThat(snapshot.roleIdsByEmployeeId().get(PRIYA_ID)).contains(FINANCE_APPROVER_ID);
	}

	@Test
	void savesReplaysAndRetrievesThePriyaSimulationThroughTheApi() throws Exception {
		var request = priyaSimulationRequest(1, PRIYA_ID);
		var idempotencyKey = "test-priya-golden-scenario";

		var created = mockMvc.perform(post("/api/v1/simulations")
						.header("Idempotency-Key", idempotencyKey)
						.contentType(MediaType.APPLICATION_JSON)
						.content(request))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.result.overallSeverity").value("CRITICAL"))
				.andExpect(jsonPath("$.result.executiveSummary.rolesRemoved").value(1))
				.andExpect(jsonPath("$.result.executiveSummary.permissionsLost").value(2))
				.andExpect(jsonPath("$.result.executiveSummary.workflowsBlocked").value(1))
				.andExpect(jsonPath("$.result.executiveSummary.workflowsDegraded").value(1))
				.andExpect(jsonPath("$.result.graphDiff.nodes").isNotEmpty())
				.andExpect(jsonPath("$.result.graphDiff.edges").isNotEmpty())
				.andExpect(jsonPath("$.result.diagnostics.resultHash").isNotEmpty())
				.andReturn();

		var createdJson = objectMapper.readTree(created.getResponse().getContentAsString());
		var simulationId = createdJson.path("id").asText();
		var resultHash = createdJson.path("result").path("diagnostics").path("resultHash").asText();
		assertThat(createdJson.path("result").path("graphDiff").path("nodes").findValues("state"))
				.extracting(node -> node.asText())
				.contains("REMOVED", "DEGRADED", "BLOCKED");

		mockMvc.perform(post("/api/v1/simulations")
						.header("Idempotency-Key", idempotencyKey)
						.contentType(MediaType.APPLICATION_JSON)
						.content(request))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(simulationId))
				.andExpect(jsonPath("$.result.diagnostics.resultHash").value(resultHash));

		mockMvc.perform(get("/api/v1/simulations/{simulationId}", simulationId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.result.overallSeverity").value("CRITICAL"))
				.andExpect(jsonPath("$.result.diagnostics.resultHash").value(resultHash));

		var savedRows = jdbcClient.sql("SELECT COUNT(*) FROM simulations WHERE idempotency_key = :key")
				.param("key", idempotencyKey)
				.query(Integer.class)
				.single();
		assertThat(savedRows).isEqualTo(1);
	}

	@Test
	void createsPersistsReplaysAndRetrievesARecommendedMitigationBranch() throws Exception {
		var parentResponse = mockMvc.perform(post("/api/v1/simulations")
						.contentType(MediaType.APPLICATION_JSON)
						.content(priyaSimulationRequest(1, PRIYA_ID)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.parentSimulationId").doesNotExist())
				.andExpect(jsonPath("$.result.recommendations[0].rank").value(1))
				.andExpect(jsonPath("$.result.recommendations[0].candidate.id").value(BOB_ID.toString()))
				.andExpect(jsonPath("$.result.recommendations[0].action").value("ASSIGN_ROLE_TO_EMPLOYEE"))
				.andReturn();

		var parentJson = objectMapper.readTree(parentResponse.getResponse().getContentAsString());
		var parentId = parentJson.path("id").asText();
		var recommendationId = parentJson.path("result").path("recommendations").get(0).path("id").asText();
		var branchRequest = branchRequest(recommendationId);
		var idempotencyKey = "test-priya-bob-mitigation-branch";

		var branchResponse = mockMvc.perform(post("/api/v1/simulations/{simulationId}/branches", parentId)
						.header("Idempotency-Key", idempotencyKey)
						.contentType(MediaType.APPLICATION_JSON)
						.content(branchRequest))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.parentSimulationId").value(parentId))
				.andExpect(jsonPath("$.result.overallSeverity").value("LOW"))
				.andExpect(jsonPath("$.result.changeSet.type")
						.value("REVOKE_EMPLOYEE_ROLE_AND_ASSIGN_REPLACEMENT"))
				.andExpect(jsonPath("$.result.changeSet.replacementEmployee.id").value(BOB_ID.toString()))
				.andExpect(jsonPath("$.result.executiveSummary.workflowsBlocked").value(0))
				.andExpect(jsonPath("$.result.executiveSummary.workflowsDegraded").value(0))
				.andExpect(jsonPath("$.result.technicalImpact.assignedRoles[0].id")
						.value(FINANCE_APPROVER_ID.toString()))
				.andExpect(jsonPath("$.result.technicalImpact.gainedPermissions[0].action")
						.value("ledger.close"))
				.andExpect(jsonPath("$.result.technicalImpact.gainedPermissions[1].action")
						.value("payment.approve"))
				.andExpect(jsonPath("$.result.graphDiff.nodes").isNotEmpty())
				.andExpect(jsonPath("$.result.graphDiff.edges").isNotEmpty())
				.andExpect(jsonPath("$.result.recommendations").isEmpty())
				.andReturn();

		var branchJson = objectMapper.readTree(branchResponse.getResponse().getContentAsString());
		var branchId = branchJson.path("id").asText();
		var resultHash = branchJson.path("result").path("diagnostics").path("resultHash").asText();

		assertThat(branchJson.path("result").path("workflowImpacts").findValues("scenarioStatus"))
				.extracting(node -> node.asText())
				.containsOnly("OPERATIONAL");
		assertThat(branchJson.path("result").path("graphDiff").path("nodes").findValues("state"))
				.extracting(node -> node.asText())
				.contains("ADDED", "RESTORED");
		assertThat(branchJson.path("result").path("graphDiff").path("edges").findValues("state"))
				.extracting(node -> node.asText())
				.contains("REMOVED", "ADDED", "RESTORED");

		mockMvc.perform(post("/api/v1/simulations/{simulationId}/branches", parentId)
						.header("Idempotency-Key", idempotencyKey)
						.contentType(MediaType.APPLICATION_JSON)
						.content(branchRequest))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(branchId))
				.andExpect(jsonPath("$.result.diagnostics.resultHash").value(resultHash));

		mockMvc.perform(get("/api/v1/simulations/{simulationId}", branchId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.parentSimulationId").value(parentId))
				.andExpect(jsonPath("$.result.overallSeverity").value("LOW"))
				.andExpect(jsonPath("$.result.diagnostics.resultHash").value(resultHash));

		var persistedBranch = jdbcClient.sql("""
				SELECT parent_simulation_id::text || '|' || change_type
				FROM simulations
				WHERE id = :branchId
				""")
				.param("branchId", UUID.fromString(branchId))
				.query(String.class)
				.single();
		assertThat(persistedBranch).isEqualTo(
				parentId + "|REVOKE_EMPLOYEE_ROLE_AND_ASSIGN_REPLACEMENT");

		var savedRows = jdbcClient.sql("SELECT COUNT(*) FROM simulations WHERE idempotency_key = :key")
				.param("key", idempotencyKey)
				.query(Integer.class)
				.single();
		assertThat(savedRows).isEqualTo(1);
	}

	@Test
	void rejectsMissingParentsAndUnknownRecommendationsForMitigationBranches() throws Exception {
		var unknownRecommendation = branchRequest(UUID.randomUUID().toString());

		mockMvc.perform(post("/api/v1/simulations/{simulationId}/branches", UUID.randomUUID())
						.contentType(MediaType.APPLICATION_JSON)
						.content(unknownRecommendation))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("ENTITY_NOT_FOUND"));

		var parentResponse = mockMvc.perform(post("/api/v1/simulations")
						.contentType(MediaType.APPLICATION_JSON)
						.content(priyaSimulationRequest(1, PRIYA_ID)))
				.andExpect(status().isCreated())
				.andReturn();
		var parentId = objectMapper.readTree(parentResponse.getResponse().getContentAsString())
				.path("id").asText();

		mockMvc.perform(post("/api/v1/simulations/{simulationId}/branches", parentId)
						.contentType(MediaType.APPLICATION_JSON)
						.content(unknownRecommendation))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("ENTITY_NOT_FOUND"));
	}

	@Test
	void rejectsInvalidAndStaleSimulationRequestsWithStableErrorCodes() throws Exception {
		mockMvc.perform(post("/api/v1/simulations")
						.contentType(MediaType.APPLICATION_JSON)
						.content(priyaSimulationRequest(1, BOB_ID)))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("INVALID_SIMULATION"));

		mockMvc.perform(post("/api/v1/simulations")
						.contentType(MediaType.APPLICATION_JSON)
						.content(priyaSimulationRequest(99, PRIYA_ID)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("SIMULATION_CONFLICT"));
	}

	private String priyaSimulationRequest(int baselineVersion, UUID employeeId) throws Exception {
		return objectMapper.writeValueAsString(new SimulationApiRequest(
				"1.0",
				HARBORLINE_ID,
				baselineVersion,
				new SimulationChangeRequest("REVOKE_EMPLOYEE_ROLE", employeeId, FINANCE_APPROVER_ID)));
	}

	private String branchRequest(String recommendationId) throws Exception {
		return objectMapper.writeValueAsString(new SimulationBranchApiRequest(
				UUID.fromString(recommendationId)));
	}

	private record SimulationApiRequest(
			String schemaVersion,
			UUID organizationId,
			int baselineVersion,
			SimulationChangeRequest change) {
	}

	private record SimulationChangeRequest(String type, UUID employeeId, UUID roleId) {
	}

	private record SimulationBranchApiRequest(UUID recommendationId) {
	}

	private int count(String table) {
		List<String> allowedTables = List.of(
				"organizations", "teams", "employees", "roles", "applications", "permissions",
				"capabilities", "workflows", "workflow_steps", "workflow_constraints");
		if (!allowedTables.contains(table)) {
			throw new IllegalArgumentException("Unexpected table: " + table);
		}

		return jdbcClient.sql("SELECT COUNT(*) FROM " + table)
				.query(Integer.class)
				.single();
	}
}
