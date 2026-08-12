package com.roleimpact.shared.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;

class HealthControllerTest {

	@Test
	void reportsTheApiAsAvailable() {
		var response = new HealthController().health();

		assertEquals("UP", response.status());
		assertEquals("roleimpact-api", response.service());
		assertNotNull(response.checkedAt());
	}
}
