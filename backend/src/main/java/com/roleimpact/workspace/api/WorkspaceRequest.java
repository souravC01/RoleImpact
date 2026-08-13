package com.roleimpact.workspace.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record WorkspaceRequest(
		@NotBlank @Size(max = 160) String name,
		@Size(min = 3, max = 80)
		@Pattern(regexp = "^[a-z0-9]+(?:-[a-z0-9]+)*$", message = "must be a lowercase URL slug")
		String slug) {
}
