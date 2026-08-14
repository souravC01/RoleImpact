package com.roleimpact.workspace.editor.api;

import java.util.UUID;

import com.roleimpact.shared.model.EmployeeStatus;
import com.roleimpact.shared.model.Region;
import com.roleimpact.shared.model.WorkShift;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MemberRequest(
		@NotNull UUID teamId,
		@Size(max = 40) String employeeNumber,
		@NotBlank @Size(max = 160) String name,
		@Email @Size(max = 254) String email,
		@NotNull EmployeeStatus status,
		@NotNull Region region,
		@NotNull WorkShift shift) {
}
