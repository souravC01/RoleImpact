package com.roleimpact.workspace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers
@AutoConfigureMockMvc
class WorkspaceIntegrationTest {

	private static final UUID HARBORLINE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine")
			.withDatabaseName("roleimpact")
			.withUsername("roleimpact")
			.withPassword("roleimpact");

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private ObjectMapper objectMapper;

	@Autowired
	private JdbcClient jdbcClient;

	@Test
	void createsBlankAndClonedDraftsWithoutChangingThePublishedTemplate() throws Exception {
		mockMvc.perform(get("/api/v1/workspaces"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].id").value(HARBORLINE_ID.toString()))
				.andExpect(jsonPath("$[0].status").value("PUBLISHED"))
				.andExpect(jsonPath("$[0].currentVersion").value(1))
				.andExpect(jsonPath("$[0].counts.members").value(25))
				.andExpect(jsonPath("$[0].counts.workflows").value(4));

		var blankResponse = mockMvc.perform(post("/api/v1/workspaces")
						.contentType(MediaType.APPLICATION_JSON)
						.content(workspaceRequest("Northstar Labs", null)))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", org.hamcrest.Matchers.containsString("/api/v1/workspaces/")))
				.andExpect(jsonPath("$.slug").value("northstar-labs"))
				.andExpect(jsonPath("$.status").value("DRAFT"))
				.andExpect(jsonPath("$.currentVersion").value(0))
				.andExpect(jsonPath("$.sourceTemplateOrganizationId").doesNotExist())
				.andExpect(jsonPath("$.counts.members").value(0))
				.andExpect(jsonPath("$.counts.workflows").value(0))
				.andReturn();
		UUID blankId = responseId(blankResponse.getResponse().getContentAsString());

		var cloneResponse = mockMvc.perform(post("/api/v1/workspaces/{sourceWorkspaceId}/clones", HARBORLINE_ID)
						.contentType(MediaType.APPLICATION_JSON)
						.content(workspaceRequest("Harborline Sandbox", "harborline-sandbox")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.status").value("DRAFT"))
				.andExpect(jsonPath("$.currentVersion").value(0))
				.andExpect(jsonPath("$.sourceTemplateOrganizationId").value(HARBORLINE_ID.toString()))
				.andExpect(jsonPath("$.counts.teams").value(5))
				.andExpect(jsonPath("$.counts.members").value(25))
				.andExpect(jsonPath("$.counts.roles").value(8))
				.andExpect(jsonPath("$.counts.permissions").value(23))
				.andExpect(jsonPath("$.counts.capabilities").value(10))
				.andExpect(jsonPath("$.counts.workflows").value(4))
				.andReturn();
		UUID cloneId = responseId(cloneResponse.getResponse().getContentAsString());

		mockMvc.perform(get("/api/v1/workspaces/{workspaceId}", cloneId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.slug").value("harborline-sandbox"));

		assertThat(workspaceState(HARBORLINE_ID)).isEqualTo("PUBLISHED|1");
		assertThat(workspaceState(blankId)).isEqualTo("DRAFT|0");
		assertThat(workspaceState(cloneId)).isEqualTo("DRAFT|0");
		assertThat(countOrganizationVersions(cloneId)).isZero();
		assertThat(countSharedEmployeeIds(HARBORLINE_ID, cloneId)).isZero();
		assertThat(countNamedEmployees(cloneId, "Priya Sharma")).isOne();

		mockMvc.perform(post("/api/v1/workspaces")
						.contentType(MediaType.APPLICATION_JSON)
						.content(workspaceRequest("Duplicate", "harborline-sandbox")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("WORKSPACE_CONFLICT"));

		mockMvc.perform(post("/api/v1/workspaces/{sourceWorkspaceId}/clones", blankId)
						.contentType(MediaType.APPLICATION_JSON)
						.content(workspaceRequest("Invalid Clone", null)))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("INVALID_WORKSPACE"));
	}

	private String workspaceRequest(String name, String slug) throws Exception {
		return objectMapper.writeValueAsString(new WorkspaceApiRequest(name, slug));
	}

	private UUID responseId(String response) throws Exception {
		return UUID.fromString(objectMapper.readTree(response).path("id").asText());
	}

	private String workspaceState(UUID id) {
		return jdbcClient.sql("""
				SELECT workspace_status || '|' || current_version
				FROM organizations
				WHERE id = :id
				""").param("id", id).query(String.class).single();
	}

	private int countOrganizationVersions(UUID id) {
		return jdbcClient.sql("SELECT COUNT(*) FROM organization_versions WHERE organization_id = :id")
				.param("id", id).query(Integer.class).single();
	}

	private int countSharedEmployeeIds(UUID sourceId, UUID cloneId) {
		return jdbcClient.sql("""
				SELECT COUNT(*)
				FROM employees source
				JOIN employees clone ON clone.id = source.id
				WHERE source.organization_id = :sourceId AND clone.organization_id = :cloneId
				""").param("sourceId", sourceId).param("cloneId", cloneId).query(Integer.class).single();
	}

	private int countNamedEmployees(UUID organizationId, String name) {
		return jdbcClient.sql("""
				SELECT COUNT(*) FROM employees WHERE organization_id = :organizationId AND name = :name
				""").param("organizationId", organizationId).param("name", name).query(Integer.class).single();
	}

	private record WorkspaceApiRequest(String name, String slug) {
	}
}
