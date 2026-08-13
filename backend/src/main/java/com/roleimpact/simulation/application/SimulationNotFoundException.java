package com.roleimpact.simulation.application;

import java.util.UUID;

public class SimulationNotFoundException extends RuntimeException {

	public SimulationNotFoundException(UUID simulationId) {
		super("Simulation not found: " + simulationId);
	}
}
