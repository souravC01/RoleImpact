package com.roleimpact.catalog.persistence;

import java.util.UUID;

import com.roleimpact.shared.model.Sensitivity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "permissions")
public class PermissionEntity {

	@Id
	private UUID id;

	@Column(name = "organization_id", nullable = false)
	private UUID organizationId;

	@Column(name = "application_id", nullable = false)
	private UUID applicationId;

	@Column(name = "resource_id", nullable = false)
	private UUID resourceId;

	@Column(nullable = false, length = 120)
	private String action;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private Sensitivity sensitivity;

	protected PermissionEntity() {
	}

	public UUID getId() {
		return id;
	}

	public UUID getOrganizationId() {
		return organizationId;
	}

	public UUID getApplicationId() {
		return applicationId;
	}

	public UUID getResourceId() {
		return resourceId;
	}

	public String getAction() {
		return action;
	}

	public Sensitivity getSensitivity() {
		return sensitivity;
	}
}
