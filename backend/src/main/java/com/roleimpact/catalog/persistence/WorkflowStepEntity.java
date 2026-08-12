package com.roleimpact.catalog.persistence;

import java.util.UUID;

import com.roleimpact.shared.model.Region;
import com.roleimpact.shared.model.WorkShift;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "workflow_steps")
public class WorkflowStepEntity {

	@Id
	private UUID id;

	@Column(name = "workflow_id", nullable = false)
	private UUID workflowId;

	@Column(name = "step_key", nullable = false, length = 80)
	private String stepKey;

	@Column(nullable = false, length = 160)
	private String name;

	@Column(nullable = false)
	private int position;

	@Column(name = "required_capability_id", nullable = false)
	private UUID requiredCapabilityId;

	@Column(name = "minimum_actors", nullable = false)
	private int minimumActors;

	@Column(name = "resilience_target", nullable = false)
	private int resilienceTarget;

	@Column(name = "required_department", length = 120)
	private String requiredDepartment;

	@Enumerated(EnumType.STRING)
	@Column(name = "required_region", length = 30)
	private Region requiredRegion;

	@Enumerated(EnumType.STRING)
	@Column(name = "required_shift", length = 20)
	private WorkShift requiredShift;

	@Column(name = "required_application_id")
	private UUID requiredApplicationId;

	protected WorkflowStepEntity() {
	}

	public UUID getId() {
		return id;
	}

	public UUID getWorkflowId() {
		return workflowId;
	}

	public String getStepKey() {
		return stepKey;
	}

	public String getName() {
		return name;
	}

	public int getPosition() {
		return position;
	}

	public UUID getRequiredCapabilityId() {
		return requiredCapabilityId;
	}

	public int getMinimumActors() {
		return minimumActors;
	}

	public int getResilienceTarget() {
		return resilienceTarget;
	}

	public String getRequiredDepartment() {
		return requiredDepartment;
	}

	public Region getRequiredRegion() {
		return requiredRegion;
	}

	public WorkShift getRequiredShift() {
		return requiredShift;
	}

	public UUID getRequiredApplicationId() {
		return requiredApplicationId;
	}
}
