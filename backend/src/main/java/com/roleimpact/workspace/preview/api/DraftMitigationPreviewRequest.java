package com.roleimpact.workspace.preview.api;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

public record DraftMitigationPreviewRequest(
		@NotNull UUID memberId,
		@NotNull UUID roleId,
		@NotNull UUID replacementMemberId) {
}
