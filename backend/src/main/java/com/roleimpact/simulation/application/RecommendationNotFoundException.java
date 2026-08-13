package com.roleimpact.simulation.application;

import java.util.UUID;

public class RecommendationNotFoundException extends RuntimeException {

	public RecommendationNotFoundException(UUID simulationId, UUID recommendationId) {
		super("Recommendation " + recommendationId + " was not found in simulation " + simulationId);
	}
}
