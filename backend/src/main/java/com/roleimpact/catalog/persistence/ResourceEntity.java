package com.roleimpact.catalog.persistence;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "resources")
public class ResourceEntity {

	@Id
	private UUID id;

	@Column(name = "application_id", nullable = false)
	private UUID applicationId;

	@Column(nullable = false, length = 140)
	private String name;

	@Column(name = "resource_type", nullable = false, length = 80)
	private String resourceType;

	protected ResourceEntity() {
	}

	public UUID getId() {
		return id;
	}

	public UUID getApplicationId() {
		return applicationId;
	}

	public String getName() {
		return name;
	}

	public String getResourceType() {
		return resourceType;
	}
}
