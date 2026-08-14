package com.roleimpact.workspace.editor.api;

import java.util.UUID;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record WorkflowRequirementRequest(
		@NotBlank @Size(max = 160) String name,
		@NotNull UUID roleId,
		@Min(1) int minimumActors,
		@Min(1) int resilienceTarget) {
}
