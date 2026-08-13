package com.roleimpact.simulation.application;

import java.time.Clock;

import com.roleimpact.impactengine.DeterministicImpactEngine;
import com.roleimpact.impactengine.ImpactEngine;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SimulationConfiguration {

	@Bean
	ImpactEngine impactEngine() {
		return new DeterministicImpactEngine();
	}

	@Bean
	Clock simulationClock() {
		return Clock.systemUTC();
	}
}
