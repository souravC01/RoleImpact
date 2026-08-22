package com.roleimpact.workspace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest
@Testcontainers
@AutoConfigureMockMvc
class WorkspaceIntegrationTest {

	private static final UUID HARBORLINE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

	@Container
	@ServiceConnection
	static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine")
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
	void createsAndResolvesAnEditableDraftByPublicCode() throws Exception {
		var blankResponse = mockMvc.perform(post("/api/v1/workspaces")
						.contentType(MediaType.APPLICATION_JSON)
						.content(workspaceRequest("Northstar Medical Supplies", null)))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", org.hamcrest.Matchers.containsString("/api/v1/workspaces/by-code/")))
				.andExpect(jsonPath("$.slug").value("northstar-medical-supplies"))
				.andExpect(jsonPath("$.status").value("DRAFT"))
				.andExpect(jsonPath("$.currentVersion").value(0))
				.andExpect(jsonPath("$.publicCode")
						.value(org.hamcrest.Matchers.matchesPattern("NMS-[A-HJ-NP-Z2-9]{16}")))
				.andExpect(jsonPath("$.counts.members").value(0))
				.andExpect(jsonPath("$.counts.workflows").value(0))
				.andReturn();
		var blankJson = objectMapper.readTree(blankResponse.getResponse().getContentAsString());
		UUID blankId = UUID.fromString(blankJson.path("id").asText());
		String publicCode = blankJson.path("publicCode").asText();

		mockMvc.perform(get("/api/v1/workspaces/by-code/{publicCode}", publicCode.toLowerCase()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(blankId.toString()))
				.andExpect(jsonPath("$.publicCode").value(publicCode));

		assertThat(workspaceState(HARBORLINE_ID)).isEqualTo("PUBLISHED|1");
		assertThat(workspaceState(blankId)).isEqualTo("DRAFT|0");
	}

	@Test
	void hidesPublishedAndUnknownOrganizationsFromPublicCodeLookup() throws Exception {
		String harborlinePublicCode = jdbcClient.sql("SELECT public_code FROM organizations WHERE id = :id")
				.param("id", HARBORLINE_ID)
				.query(String.class)
				.single();

		mockMvc.perform(get("/api/v1/workspaces/by-code/{publicCode}", harborlinePublicCode))
				.andExpect(status().isNotFound());
		mockMvc.perform(get("/api/v1/workspaces/by-code/{publicCode}", "BAD-CODE"))
				.andExpect(status().isNotFound());
		mockMvc.perform(get("/api/v1/workspaces/by-code/{publicCode}", "NMS-AAAAAA"))
				.andExpect(status().isNotFound());
	}

	@Test
	void removesWorkspaceListingAndCloningEndpoints() throws Exception {
		mockMvc.perform(get("/api/v1/workspaces"))
				.andExpect(status().isMethodNotAllowed());
		mockMvc.perform(post("/api/v1/workspaces/{sourceWorkspaceId}/clones", HARBORLINE_ID)
						.contentType(MediaType.APPLICATION_JSON)
						.content(workspaceRequest("Removed Clone", null)))
				.andExpect(status().isNotFound());
	}

	@Test
	void buildsTeamsMembersAndRolesInsideADraftOnly() throws Exception {
		var workspaceResponse = mockMvc.perform(post("/api/v1/workspaces")
						.contentType(MediaType.APPLICATION_JSON)
						.content(workspaceRequest("Atlas Editor Test", "atlas-editor-test")))
				.andExpect(status().isCreated())
				.andReturn();
		UUID workspaceId = responseId(workspaceResponse.getResponse().getContentAsString());

		var teamResponse = mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/catalog/teams", workspaceId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"name":"Platform","department":"Engineering"}
								"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.teams[0].name").value("Platform"))
				.andExpect(jsonPath("$.teams[0].memberCount").value(0))
				.andReturn();
		UUID teamId = UUID.fromString(objectMapper.readTree(teamResponse.getResponse().getContentAsString())
				.path("teams").get(0).path("id").asText());

		var memberResponse = mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/catalog/members", workspaceId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "teamId":"%s", "name":"Maya Singh", "status":"ACTIVE",
								  "region":"NORTH_AMERICA", "shift":"DAY"
								}
								""".formatted(teamId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.members[0].name").value("Maya Singh"))
				.andExpect(jsonPath("$.members[0].employeeNumber").doesNotExist())
				.andExpect(jsonPath("$.members[0].email").doesNotExist())
				.andExpect(jsonPath("$.teams[0].memberCount").value(1))
				.andReturn();
		UUID memberId = UUID.fromString(objectMapper.readTree(memberResponse.getResponse().getContentAsString())
				.path("members").get(0).path("id").asText());

		var candidateResponse = mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/catalog/members", workspaceId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "teamId":"%s", "name":"Arjun Mehta", "status":"ACTIVE",
								  "region":"NORTH_AMERICA", "shift":"DAY"
								}
								""".formatted(teamId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.teams[0].memberCount").value(2))
				.andReturn();
		UUID candidateId = findId(
				objectMapper.readTree(candidateResponse.getResponse().getContentAsString()),
				"members",
				"Arjun Mehta");
		var inactiveCandidateResponse = mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/catalog/members", workspaceId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "teamId":"%s", "name":"Dylan Moore", "status":"INACTIVE",
								  "region":"NORTH_AMERICA", "shift":"DAY"
								}
								""".formatted(teamId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.teams[0].memberCount").value(3))
				.andReturn();
		UUID inactiveCandidateId = findId(
				objectMapper.readTree(inactiveCandidateResponse.getResponse().getContentAsString()),
				"members",
				"Dylan Moore");

		var roleResponse = mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/catalog/roles", workspaceId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "name":"Release Manager", "description":"Approves production releases",
								  "sensitivity":"HIGH", "ownerMemberId":"%s",
								  "holderMemberIds":["%s"]
								}
								""".formatted(memberId, memberId)))
						.andExpect(status().isOk())
						.andExpect(jsonPath("$.roles[0].name").value("Release Manager"))
						.andExpect(jsonPath("$.roles[0].memberCount").value(1))
						.andReturn();
		UUID roleId = UUID.fromString(objectMapper.readTree(roleResponse.getResponse().getContentAsString())
				.path("roles").get(0).path("id").asText());
		assertThat(findById(
				objectMapper.readTree(roleResponse.getResponse().getContentAsString()),
				"members",
				memberId).path("roleIds").get(0).asText()).isEqualTo(roleId.toString());

		mockMvc.perform(put("/api/v1/workspaces/{workspaceId}/catalog/teams/{teamId}", workspaceId, teamId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\":\"Platform Operations\",\"department\":\"Technology\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.teams[0].name").value("Platform Operations"));
		var updatedMemberResponse = mockMvc.perform(put("/api/v1/workspaces/{workspaceId}/catalog/members/{memberId}", workspaceId, memberId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "teamId":"%s", "employeeNumber":"AT-001", "name":"Maya Patel",
								  "email":"maya@atlas.test", "status":"ACTIVE",
								  "region":"NORTH_AMERICA", "shift":"DAY"
								}
								""".formatted(teamId)))
				.andExpect(status().isOk())
				.andReturn();
		assertThat(findById(
				objectMapper.readTree(updatedMemberResponse.getResponse().getContentAsString()),
				"members",
				memberId).path("name").asText()).isEqualTo("Maya Patel");
		mockMvc.perform(put("/api/v1/workspaces/{workspaceId}/catalog/roles/{roleId}", workspaceId, roleId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "name":"Production Release Manager", "description":"Approves production releases",
								  "sensitivity":"CRITICAL", "ownerMemberId":"%s",
								  "holderMemberIds":["%s","%s"]
								}
								""".formatted(memberId, memberId, candidateId)))
						.andExpect(status().isOk())
						.andExpect(jsonPath("$.roles[0].name").value("Production Release Manager"))
						.andExpect(jsonPath("$.roles[0].sensitivity").value("CRITICAL"))
						.andExpect(jsonPath("$.roles[0].memberCount").value(2));

		UUID unknownHolderId = UUID.fromString("00000000-0000-0000-0000-000000000999");
		mockMvc.perform(put("/api/v1/workspaces/{workspaceId}/catalog/roles/{roleId}", workspaceId, roleId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "name":"Should Not Persist", "description":"Should not persist",
								  "sensitivity":"LOW", "ownerMemberId":null,
								  "holderMemberIds":["%s","%s"]
								}
								""".formatted(memberId, unknownHolderId)))
						.andExpect(status().isNotFound());
		var catalogAfterRejectedRoleUpdate = objectMapper.readTree(mockMvc.perform(get("/api/v1/workspaces/{workspaceId}/catalog", workspaceId))
						.andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
		assertThat(findById(catalogAfterRejectedRoleUpdate, "roles", roleId).path("name").asText())
				.isEqualTo("Production Release Manager");
		assertThat(findById(catalogAfterRejectedRoleUpdate, "members", memberId).path("roleIds"))
				.extracting(com.fasterxml.jackson.databind.JsonNode::asText).containsExactly(roleId.toString());
		assertThat(findById(catalogAfterRejectedRoleUpdate, "members", candidateId).path("roleIds"))
				.extracting(com.fasterxml.jackson.databind.JsonNode::asText).containsExactly(roleId.toString());

		mockMvc.perform(put("/api/v1/workspaces/{workspaceId}/catalog/roles/{roleId}", workspaceId, roleId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "name":"Production Release Manager", "description":"Approves production releases",
								  "sensitivity":"CRITICAL", "ownerMemberId":"%s",
								  "holderMemberIds":["%s"]
								}
								""".formatted(memberId, memberId)))
						.andExpect(status().isOk())
						.andExpect(jsonPath("$.roles[0].memberCount").value(1));

		var workflowResponse = mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/catalog/workflows/quick", workspaceId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "name":"Production Deployment", "criticality":"CRITICAL",
								  "requirementName":"Approve production release", "roleId":"%s",
								  "minimumActors":1, "resilienceTarget":1
								}
								""".formatted(roleId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.workflows[0].name").value("Production Deployment"))
				.andExpect(jsonPath("$.workflows[0].requirements[0].name").value("Approve production release"))
				.andExpect(jsonPath("$.workflows[0].requirements[0].roleIds[0]").value(roleId.toString()))
				.andExpect(jsonPath("$.workflows[0].quickManaged").value(true))
				.andReturn();
		UUID workflowId = UUID.fromString(objectMapper.readTree(workflowResponse.getResponse().getContentAsString())
				.path("workflows").get(0).path("id").asText());

		assertThat(countForOrganization("applications", workspaceId)).isEqualTo(1);
		assertThat(countForOrganization("permissions", workspaceId)).isEqualTo(1);
		assertThat(countForOrganization("capabilities", workspaceId)).isEqualTo(1);
		assertThat(countForOrganization("workflows", workspaceId)).isEqualTo(1);

		mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/catalog/workflows/{workflowId}/requirements", workspaceId, workflowId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "name":"Deploy release", "roleId":"%s",
								  "minimumActors":1, "resilienceTarget":2
								}
								""".formatted(roleId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.workflows[0].requirements.length()").value(2))
				.andExpect(jsonPath("$.workflows[0].requirements[1].resilienceTarget").value(2));
		assertThat(countForOrganization("applications", workspaceId)).isEqualTo(2);
		assertThat(countForOrganization("permissions", workspaceId)).isEqualTo(2);
		assertThat(countForOrganization("capabilities", workspaceId)).isEqualTo(2);

		var previewResponse = mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/impact-previews", workspaceId)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"memberId":"%s","roleId":"%s"}
							""".formatted(memberId, roleId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.baselineVersion").value(0))
				.andExpect(jsonPath("$.overallSeverity").value("CRITICAL"))
				.andExpect(jsonPath("$.executiveSummary.workflowsBlocked").value(1))
				.andExpect(jsonPath("$.changeSet.employee.name").value("Maya Patel"))
				.andExpect(jsonPath("$.changeSet.role.name").value("Production Release Manager"))
				.andExpect(jsonPath("$.workflowImpacts[0].workflowName").value("Production Deployment"))
				.andExpect(jsonPath("$.workflowImpacts[0].scenarioStatus").value("BLOCKED"))
				.andExpect(jsonPath("$.recommendations[0].candidate.id").value(candidateId.toString()))
				.andReturn();
		assertThat(objectMapper.readTree(previewResponse.getResponse().getContentAsString())
				.path("recommendations").get(0).path("id").asText()).isNotBlank();

		mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/impact-previews/mitigations", workspaceId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
							  "memberId":"%s", "roleId":"%s", "replacementMemberId":"%s"
							}
							""".formatted(memberId, roleId, candidateId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.original.overallSeverity").value("CRITICAL"))
				.andExpect(jsonPath("$.mitigation.overallSeverity").value("LOW"))
				.andExpect(jsonPath("$.mitigation.changeSet.replacementEmployee.id").value(candidateId.toString()))
				.andExpect(jsonPath("$.mitigation.executiveSummary.workflowsBlocked").value(0))
				.andExpect(jsonPath("$.mitigation.workflowImpacts[0].scenarioStatus").value("DEGRADED"));

		mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/impact-previews/mitigations", workspaceId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "memberId":"%s", "roleId":"%s", "replacementMemberId":"%s"
								}
								""".formatted(memberId, roleId, inactiveCandidateId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.mitigation.changeSet.replacementEmployee.id").value(inactiveCandidateId.toString()))
				.andExpect(jsonPath("$.mitigation.overallSeverity").value("CRITICAL"))
				.andExpect(jsonPath("$.mitigation.executiveSummary.workflowsBlocked").value(1));

		mockMvc.perform(get("/api/v1/workspaces/{workspaceId}/impact-previews/continuity", workspaceId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.workflowName == 'Production Deployment' && @.requirementName == 'Approve production release')].eligibleMembers[0].id")
						.value(memberId.toString()))
				.andExpect(jsonPath("$[?(@.workflowName == 'Production Deployment' && @.requirementName == 'Approve production release')].members[0].scenarioStatus")
						.value("BLOCKED"));

		var catalogAfterMitigation = mockMvc.perform(get("/api/v1/workspaces/{workspaceId}/catalog", workspaceId))
				.andExpect(status().isOk())
				.andReturn();
		var catalogAfterMitigationJson = objectMapper.readTree(
				catalogAfterMitigation.getResponse().getContentAsString());
		assertThat(findById(catalogAfterMitigationJson, "members", memberId).path("roleIds"))
				.extracting(JsonNode::asText)
				.containsExactly(roleId.toString());
		assertThat(findById(catalogAfterMitigationJson, "members", candidateId).path("roleIds")).isEmpty();

		mockMvc.perform(delete("/api/v1/workspaces/{workspaceId}/catalog/teams/{teamId}", workspaceId, teamId))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("DRAFT_CATALOG_CONFLICT"));

		mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/catalog/teams", HARBORLINE_ID)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\":\"Illegal\",\"department\":\"Test\"}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("read-only")));

		mockMvc.perform(delete("/api/v1/workspaces/{workspaceId}/catalog/workflows/{workflowId}", workspaceId, workflowId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.workflows").isEmpty());
		assertThat(countForOrganization("applications", workspaceId)).isZero();
		assertThat(countForOrganization("permissions", workspaceId)).isZero();
		assertThat(countForOrganization("capabilities", workspaceId)).isZero();

		mockMvc.perform(delete("/api/v1/workspaces/{workspaceId}/catalog/roles/{roleId}", workspaceId, roleId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.members[0].roleIds").isEmpty());
		mockMvc.perform(delete("/api/v1/workspaces/{workspaceId}/catalog/members/{memberId}", workspaceId, memberId))
				.andExpect(status().isOk());
		mockMvc.perform(delete("/api/v1/workspaces/{workspaceId}/catalog/members/{memberId}", workspaceId, candidateId))
				.andExpect(status().isOk());
		mockMvc.perform(delete("/api/v1/workspaces/{workspaceId}/catalog/members/{memberId}", workspaceId, inactiveCandidateId))
				.andExpect(status().isOk());
		mockMvc.perform(delete("/api/v1/workspaces/{workspaceId}/catalog/teams/{teamId}", workspaceId, teamId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.teams").isEmpty());
	}

	private String workspaceRequest(String name, String slug) throws Exception {
		return objectMapper.writeValueAsString(new WorkspaceApiRequest(name, slug));
	}

	private UUID responseId(String response) throws Exception {
		return UUID.fromString(objectMapper.readTree(response).path("id").asText());
	}

	private UUID findId(com.fasterxml.jackson.databind.JsonNode root, String collection, String name) {
		for (var item : root.path(collection)) {
			if (name.equals(item.path("name").asText())) return UUID.fromString(item.path("id").asText());
		}
		throw new IllegalArgumentException(name + " was not found in " + collection);
	}

	private com.fasterxml.jackson.databind.JsonNode findById(
			com.fasterxml.jackson.databind.JsonNode root,
			String collection,
			UUID id) {
		for (var item : root.path(collection)) {
			if (id.toString().equals(item.path("id").asText())) return item;
		}
		throw new IllegalArgumentException(id + " was not found in " + collection);
	}

	private String workspaceState(UUID id) {
		return jdbcClient.sql("""
				SELECT workspace_status || '|' || current_version
				FROM organizations
				WHERE id = :id
				""").param("id", id).query(String.class).single();
	}

	private int countForOrganization(String table, UUID organizationId) {
		var allowed = java.util.Set.of("applications", "permissions", "capabilities", "workflows");
		if (!allowed.contains(table)) throw new IllegalArgumentException("Unexpected table: " + table);
		return jdbcClient.sql("SELECT COUNT(*) FROM " + table + " WHERE organization_id = :organizationId")
				.param("organizationId", organizationId).query(Integer.class).single();
	}

	private record WorkspaceApiRequest(String name, String slug) {
	}
}
