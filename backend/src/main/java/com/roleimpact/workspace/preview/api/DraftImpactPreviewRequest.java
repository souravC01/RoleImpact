package com.roleimpact.workspace.preview.api;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

public record DraftImpactPreviewRequest(
		@NotNull UUID memberId,
		@NotNull UUID roleId) {
}
