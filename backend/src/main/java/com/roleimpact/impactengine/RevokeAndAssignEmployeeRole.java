package com.roleimpact.impactengine;

import java.util.UUID;

public record RevokeAndAssignEmployeeRole(
		UUID employeeId,
		UUID roleId,
		UUID replacementEmployeeId) implements SimulationChange {
}
