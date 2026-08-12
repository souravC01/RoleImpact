package com.roleimpact.catalog.persistence;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "applications")
public class ApplicationEntity {

	@Id
	private UUID id;

	@Column(name = "organization_id", nullable = false)
	private UUID organizationId;

	@Column(nullable = false, length = 120)
	private String name;

	@Column(nullable = false, length = 80)
	private String category;

	@Column(name = "owner_employee_id")
	private UUID ownerEmployeeId;

	protected ApplicationEntity() {
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

	public String getCategory() {
		return category;
	}

	public UUID getOwnerEmployeeId() {
		return ownerEmployeeId;
	}
}
