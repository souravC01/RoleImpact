package com.roleimpact.workspace.preview.application;

import static java.util.concurrent.TimeUnit.SECONDS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.roleimpact.workspace.editor.api.DraftCatalogResource;
import com.roleimpact.workspace.editor.persistence.DraftCatalogRepository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers
@AutoConfigureMockMvc
class DraftContinuityProjectionConcurrencyIntegrationTest {

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
	private DraftContinuityProjectionService projectionService;

	@MockitoSpyBean
	private DraftCatalogRepository catalogRepository;

	@Test
	void projectsOneCommittedCatalogStateWhenRoleHoldersChangeBetweenItsReads() throws Exception {
		UUID workspaceId = createWorkspace("Concurrent Projection Workspace");
		UUID teamId = createTeam(workspaceId);
		UUID originalHolderId = createMember(workspaceId, teamId, "Original Holder");
		UUID replacementHolderId = createMember(workspaceId, teamId, "Replacement Holder");
		UUID roleId = createRole(workspaceId, originalHolderId);
		createWorkflow(workspaceId, roleId);

		var pauseProjection = new AtomicBoolean(true);
		var catalogRead = new CountDownLatch(1);
		var continueProjection = new CountDownLatch(1);
		doAnswer(invocation -> {
			DraftCatalogResource catalog = (DraftCatalogResource) invocation.callRealMethod();
			if (pauseProjection.compareAndSet(true, false)) {
				catalogRead.countDown();
				if (!continueProjection.await(10, SECONDS)) {
					throw new AssertionError("Timed out waiting for the concurrent holder replacement");
				}
			}
			return catalog;
		}).when(catalogRepository).findCatalog(workspaceId);

		var executor = Executors.newSingleThreadExecutor();
		try {
			CompletableFuture<java.util.List<com.roleimpact.workspace.preview.api.DraftContinuityRiskResource>> projection =
					CompletableFuture.supplyAsync(() -> projectionService.project(workspaceId), executor);
			assertThat(catalogRead.await(10, SECONDS)).as("projection reached the catalog/snapshot boundary").isTrue();

			mockMvc.perform(put("/api/v1/workspaces/{workspaceId}/catalog/roles/{roleId}", workspaceId, roleId)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "name":"Release Manager", "description":"Approves production releases",
								  "sensitivity":"HIGH", "ownerMemberId":"%s",
								  "holderMemberIds":["%s"]
								}
								""".formatted(originalHolderId, replacementHolderId)))
					.andExpect(status().isOk());
			continueProjection.countDown();

			var risks = projection.get(10, SECONDS);

			assertThat(risks).hasSize(1);
			assertThat(risks.getFirst().members())
					.extracting(member -> member.id(), member -> member.name())
					.containsExactly(org.assertj.core.groups.Tuple.tuple(originalHolderId, "Original Holder"));
			assertThat(risks.getFirst().eligibleMembers())
					.extracting(member -> member.id(), member -> member.name())
					.containsExactly(org.assertj.core.groups.Tuple.tuple(originalHolderId, "Original Holder"));
			assertThat(catalogRepository.findCatalog(workspaceId).members().stream()
					.filter(member -> member.roleIds().contains(roleId))
					.map(DraftCatalogResource.MemberItem::id))
					.containsExactly(replacementHolderId);
		}
		finally {
			continueProjection.countDown();
			executor.shutdownNow();
		}
	}

	private UUID createWorkspace(String name) throws Exception {
		var response = mockMvc.perform(post("/api/v1/workspaces")
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"name\":\"%s\"}".formatted(name)))
				.andExpect(status().isCreated())
				.andReturn();
		return UUID.fromString(objectMapper.readTree(response.getResponse().getContentAsString()).path("id").asText());
	}

	private UUID createTeam(UUID workspaceId) throws Exception {
		JsonNode catalog = responseJson(mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/catalog/teams", workspaceId)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"name\":\"Platform\",\"department\":\"Technology\"}"))
				.andExpect(status().isOk())
				.andReturn());
		return findId(catalog, "teams", "Platform");
	}

	private UUID createMember(UUID workspaceId, UUID teamId, String name) throws Exception {
		JsonNode catalog = responseJson(mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/catalog/members", workspaceId)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{
							  "teamId":"%s", "name":"%s", "status":"ACTIVE",
							  "region":"NORTH_AMERICA", "shift":"DAY"
							}
							""".formatted(teamId, name)))
				.andExpect(status().isOk())
				.andReturn());
		return findId(catalog, "members", name);
	}

	private UUID createRole(UUID workspaceId, UUID originalHolderId) throws Exception {
		JsonNode catalog = responseJson(mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/catalog/roles", workspaceId)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{
							  "name":"Release Manager", "description":"Approves production releases",
							  "sensitivity":"HIGH", "ownerMemberId":"%s",
							  "holderMemberIds":["%s"]
							}
							""".formatted(originalHolderId, originalHolderId)))
				.andExpect(status().isOk())
				.andReturn());
		return findId(catalog, "roles", "Release Manager");
	}

	private void createWorkflow(UUID workspaceId, UUID roleId) throws Exception {
		mockMvc.perform(post("/api/v1/workspaces/{workspaceId}/catalog/workflows/quick", workspaceId)
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{
							  "name":"Production Deployment", "criticality":"CRITICAL",
							  "requirementName":"Approve production release", "roleId":"%s",
							  "minimumActors":1, "resilienceTarget":1
							}
							""".formatted(roleId)))
				.andExpect(status().isOk());
	}

	private JsonNode responseJson(org.springframework.test.web.servlet.MvcResult response) throws Exception {
		return objectMapper.readTree(response.getResponse().getContentAsString());
	}

	private UUID findId(JsonNode catalog, String collection, String name) {
		for (JsonNode item : catalog.path(collection)) {
			if (name.equals(item.path("name").asText())) return UUID.fromString(item.path("id").asText());
		}
		throw new AssertionError("Missing " + name + " in " + collection);
	}
}
