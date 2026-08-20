package com.roleimpact.workspace.editor.api;

import java.util.Set;
import java.util.UUID;

import com.roleimpact.shared.model.Sensitivity;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RoleRequest(
		@NotBlank @Size(max = 120) String name,
		@NotBlank @Size(max = 2000) String description,
		@NotNull Sensitivity sensitivity,
		UUID ownerMemberId,
		Set<UUID> holderMemberIds) {
	public RoleRequest {
		if (holderMemberIds != null) holderMemberIds = Set.copyOf(holderMemberIds);
	}
}
