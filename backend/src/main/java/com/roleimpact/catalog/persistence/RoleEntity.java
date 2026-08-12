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
@Table(name = "roles")
public class RoleEntity {

	@Id
	private UUID id;

	@Column(name = "organization_id", nullable = false)
	private UUID organizationId;

	@Column(nullable = false, length = 120)
	private String name;

	@Column(nullable = false)
	private String description;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private Sensitivity sensitivity;

	@Column(name = "owner_employee_id")
	private UUID ownerEmployeeId;

	protected RoleEntity() {
	}

	public UUID getId() {
		return id;
	}

	public UUID getOrganizationId() {
		return organizationId;
	}

	public String getName() {
		return name;
	}

	public String getDescription() {
		return description;
	}

	public Sensitivity getSensitivity() {
		return sensitivity;
	}

	public UUID getOwnerEmployeeId() {
		return ownerEmployeeId;
	}
}
