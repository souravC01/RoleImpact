package com.roleimpact.catalog.persistence;

import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.roleimpact.shared.model.WorkflowConstraintType;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "workflow_constraints")
public class WorkflowConstraintEntity {

	@Id
	private UUID id;

	@Column(name = "workflow_id", nullable = false)
	private UUID workflowId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 40)
	private WorkflowConstraintType type;

	@JdbcTypeCode(SqlTypes.JSON)
	@Column(nullable = false, columnDefinition = "jsonb")
	private JsonNode parameters;

	protected WorkflowConstraintEntity() {
	}

	public UUID getId() {
		return id;
	}

	public UUID getWorkflowId() {
		return workflowId;
	}

	public WorkflowConstraintType getType() {
		return type;
	}

	public JsonNode getParameters() {
		return parameters;
	}
}
