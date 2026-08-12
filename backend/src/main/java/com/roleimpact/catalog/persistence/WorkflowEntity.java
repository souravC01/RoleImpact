package com.roleimpact.catalog.persistence;

import java.util.UUID;

import com.roleimpact.shared.model.WorkflowCriticality;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "workflows")
public class WorkflowEntity {

	@Id
	private UUID id;

	@Column(name = "organization_id", nullable = false)
	private UUID organizationId;

	@Column(nullable = false, length = 160)
	private String name;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private WorkflowCriticality criticality;

	@Column(name = "owner_employee_id")
	private UUID ownerEmployeeId;

	protected WorkflowEntity() {
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

	public WorkflowCriticality getCriticality() {
		return criticality;
	}

	public UUID getOwnerEmployeeId() {
		return ownerEmployeeId;
	}
}
