package com.roleimpact.catalog.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import com.roleimpact.catalog.snapshot.OrganizationSnapshotAssembler;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
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

		assertThat(successfulMigrations).isEqualTo(2);
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
