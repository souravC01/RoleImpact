package com.roleimpact.simulation.api;

import java.time.Instant;
import java.util.UUID;

import com.roleimpact.impactengine.ImpactResult;

public record SimulationResource(
		UUID id,
		UUID parentSimulationId,
		UUID organizationId,
		int baselineVersion,
		Instant createdAt,
		Instant completedAt,
		ImpactResult result) {
}
