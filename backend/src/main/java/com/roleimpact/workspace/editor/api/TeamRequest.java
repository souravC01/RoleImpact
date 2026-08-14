package com.roleimpact.workspace.editor.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TeamRequest(
		@NotBlank @Size(max = 120) String name,
		@NotBlank @Size(max = 120) String department) {
}
