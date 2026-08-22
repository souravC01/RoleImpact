package com.roleimpact.workspace.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import com.roleimpact.workspace.api.WorkspaceRequest;
import com.roleimpact.workspace.api.WorkspaceResource;
import com.roleimpact.workspace.persistence.WorkspaceRepository;

import org.junit.jupiter.api.Test;
class WorkspaceServiceTest {

	@Test
	void retriesAPublicCodeCollisionWithoutChangingTheSlug() {
		var repository = mock(WorkspaceRepository.class);
		var workspaceCode = mock(WorkspaceCode.class);
		when(repository.existsBySlug("northstar-medical-supplies")).thenReturn(false);
		when(workspaceCode.generate("Northstar Medical Supplies"))
				.thenReturn("NMS-AAAAAA", "NMS-AAAAAB");
		when(repository.insertDraft(
				any(UUID.class),
				eq("northstar-medical-supplies"),
				eq("Northstar Medical Supplies"),
				eq("NMS-AAAAAA"))).thenReturn(false);
		when(repository.insertDraft(
				any(UUID.class),
				eq("northstar-medical-supplies"),
				eq("Northstar Medical Supplies"),
				eq("NMS-AAAAAB"))).thenReturn(true);
		when(repository.findById(any(UUID.class))).thenAnswer(invocation -> Optional.of(
				workspace(invocation.getArgument(0), "NMS-AAAAAB")));

		var service = new WorkspaceService(repository, workspaceCode);
		var created = service.createBlank(new WorkspaceRequest("Northstar Medical Supplies", null));

		assertThat(created.publicCode()).isEqualTo("NMS-AAAAAB");
	}

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
}
