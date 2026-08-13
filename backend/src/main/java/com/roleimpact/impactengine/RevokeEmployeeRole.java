package com.roleimpact.impactengine;

import java.util.UUID;

public record RevokeEmployeeRole(UUID employeeId, UUID roleId) implements SimulationChange {
}
