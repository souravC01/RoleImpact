package com.roleimpact.catalog.snapshot;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.roleimpact.shared.model.EmployeeStatus;
import com.roleimpact.shared.model.Region;
import com.roleimpact.shared.model.Sensitivity;
import com.roleimpact.shared.model.WorkflowConstraintType;
import com.roleimpact.shared.model.WorkflowCriticality;
import com.roleimpact.shared.model.WorkShift;

public record OrganizationSnapshot(
		OrganizationNode organization,
		Map<UUID, TeamNode> teams,
		Map<UUID, EmployeeNode> employees,
		Map<UUID, RoleNode> roles,
		Map<UUID, ApplicationNode> applications,
		Map<UUID, ResourceNode> resources,
		Map<UUID, PermissionNode> permissions,
		Map<UUID, CapabilityNode> capabilities,
		Map<UUID, WorkflowNode> workflows,
		Map<UUID, Set<UUID>> roleIdsByEmployeeId,
		Map<UUID, Set<UUID>> permissionIdsByRoleId,
		Map<UUID, Set<UUID>> permissionIdsByCapabilityId,
		Map<UUID, Set<UUID>> constraintIdsByWorkflowStepId) {

	public OrganizationSnapshot {
		teams = immutableMap(teams);
		employees = immutableMap(employees);
		roles = immutableMap(roles);
		applications = immutableMap(applications);
		resources = immutableMap(resources);
		permissions = immutableMap(permissions);
		capabilities = immutableMap(capabilities);
		workflows = immutableMap(workflows);
		roleIdsByEmployeeId = immutableSetMap(roleIdsByEmployeeId);
		permissionIdsByRoleId = immutableSetMap(permissionIdsByRoleId);
		permissionIdsByCapabilityId = immutableSetMap(permissionIdsByCapabilityId);
		constraintIdsByWorkflowStepId = immutableSetMap(constraintIdsByWorkflowStepId);
	}

	private static <K, V> Map<K, V> immutableMap(Map<K, V> source) {
		return Collections.unmodifiableMap(new LinkedHashMap<>(source));
	}

	private static <K, V> Map<K, Set<V>> immutableSetMap(Map<K, Set<V>> source) {
		var copy = new LinkedHashMap<K, Set<V>>();
		source.forEach((key, values) -> copy.put(
				key, Collections.unmodifiableSet(new LinkedHashSet<>(values))));
		return Collections.unmodifiableMap(copy);
	}

	public record OrganizationNode(UUID id, String slug, String name, int version, String contentHash) {
	}

	public record TeamNode(UUID id, String name, String department, UUID managerEmployeeId) {
	}

	public record EmployeeNode(
			UUID id,
			UUID teamId,
			String employeeNumber,
			String name,
			String email,
			EmployeeStatus status,
			Region region,
			WorkShift shift) {
	}

	public record RoleNode(
			UUID id,
			String name,
			String description,
			Sensitivity sensitivity,
			UUID ownerEmployeeId) {
	}

	public record ApplicationNode(UUID id, String name, String category, UUID ownerEmployeeId) {
	}

	public record ResourceNode(UUID id, UUID applicationId, String name, String resourceType) {
	}

	public record PermissionNode(
			UUID id,
			UUID applicationId,
			UUID resourceId,
			String action,
			Sensitivity sensitivity) {
	}

	public record CapabilityNode(UUID id, String name, String description) {
	}

	public record WorkflowNode(
			UUID id,
			String name,
			WorkflowCriticality criticality,
			UUID ownerEmployeeId,
			List<WorkflowStepNode> steps,
			List<WorkflowConstraintNode> constraints) {

		public WorkflowNode {
			steps = List.copyOf(steps);
			constraints = List.copyOf(constraints);
		}
	}

	public record WorkflowStepNode(
			UUID id,
			String key,
			String name,
			int position,
			UUID requiredCapabilityId,
			int minimumActors,
			int resilienceTarget,
			String requiredDepartment,
			Region requiredRegion,
			WorkShift requiredShift,
			UUID requiredApplicationId) {
	}

	public record WorkflowConstraintNode(
			UUID id,
			WorkflowConstraintType type,
			String parametersJson) {
	}
}
