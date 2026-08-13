package com.roleimpact.simulation.api;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

public record SimulationBranchRequest(@NotNull UUID recommendationId) {
}
