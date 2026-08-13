package com.roleimpact.simulation.api;

import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record SimulationRequest(
		@NotBlank String schemaVersion,
		@NotNull UUID organizationId,
		@Positive int baselineVersion,
		@NotNull @Valid ChangeRequest change) {

	public enum ChangeType {
		REVOKE_EMPLOYEE_ROLE
	}

	public record ChangeRequest(
			@NotNull ChangeType type,
			@NotNull UUID employeeId,
			@NotNull UUID roleId) {
	}
}
