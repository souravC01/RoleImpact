package com.roleimpact.workspace.editor.api;

import java.util.UUID;

import com.roleimpact.shared.model.WorkflowCriticality;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record QuickWorkflowRequest(
		@NotBlank @Size(max = 160) String name,
		@NotNull WorkflowCriticality criticality,
		@NotBlank @Size(max = 160) String requirementName,
		@NotNull UUID roleId,
		@Min(1) int minimumActors,
		@Min(1) int resilienceTarget) {
}
