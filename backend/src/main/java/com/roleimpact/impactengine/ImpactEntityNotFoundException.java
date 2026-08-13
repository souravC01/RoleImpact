package com.roleimpact.impactengine;

import java.util.UUID;

public class ImpactEntityNotFoundException extends RuntimeException {

	public ImpactEntityNotFoundException(String entityType, UUID id) {
		super(entityType + " not found in baseline: " + id);
	}
}
