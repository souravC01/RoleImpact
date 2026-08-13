package com.roleimpact.workspace.api;

import java.time.Instant;
import java.util.UUID;

public record WorkspaceResource(
		UUID id,
		String slug,
		String name,
		String status,
		int currentVersion,
		UUID sourceTemplateOrganizationId,
		Instant createdAt,
		Instant updatedAt,
		WorkspaceCounts counts) {

	public record WorkspaceCounts(
			int teams,
			int members,
			int roles,
			int permissions,
			int capabilities,
			int workflows) {
	}
}
