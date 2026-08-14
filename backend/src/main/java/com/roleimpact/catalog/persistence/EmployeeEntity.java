package com.roleimpact.catalog.persistence;

import java.util.UUID;

import com.roleimpact.shared.model.EmployeeStatus;
import com.roleimpact.shared.model.Region;
import com.roleimpact.shared.model.WorkShift;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "employees")
public class EmployeeEntity {

	@Id
	private UUID id;

	@Column(name = "organization_id", nullable = false)
	private UUID organizationId;

	@Column(name = "team_id", nullable = false)
	private UUID teamId;

	@Column(name = "employee_no", unique = true, length = 40)
	private String employeeNumber;

	@Column(nullable = false, length = 160)
	private String name;

	@Column(unique = true, length = 254)
	private String email;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private EmployeeStatus status;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 30)
	private Region region;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private WorkShift shift;

	protected EmployeeEntity() {
	}

	public UUID getId() {
		return id;
	}

	public UUID getOrganizationId() {
		return organizationId;
	}

	public UUID getTeamId() {
		return teamId;
	}

	public String getEmployeeNumber() {
		return employeeNumber;
	}

	public String getName() {
		return name;
	}

	public String getEmail() {
		return email;
	}

	public EmployeeStatus getStatus() {
		return status;
	}

	public Region getRegion() {
		return region;
	}

	public WorkShift getShift() {
		return shift;
	}
}
