package com.roleimpact.workspace.editor.api;

import java.util.Set;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;

public record RoleAssignmentRequest(@NotNull Set<UUID> roleIds) {

	public RoleAssignmentRequest {
		roleIds = roleIds == null ? null : Set.copyOf(roleIds);
	}
}
