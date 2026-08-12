package com.roleimpact.catalog.persistence;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "teams")
public class TeamEntity {

	@Id
	private UUID id;

	@Column(name = "organization_id", nullable = false)
	private UUID organizationId;

	@Column(nullable = false, length = 120)
	private String name;

	@Column(nullable = false, length = 120)
	private String department;

	@Column(name = "manager_employee_id")
	private UUID managerEmployeeId;

	protected TeamEntity() {
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

	public String getDepartment() {
		return department;
	}

	public UUID getManagerEmployeeId() {
		return managerEmployeeId;
	}
}
