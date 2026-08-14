package com.roleimpact.workspace.editor.api;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public record DraftCatalogResource(
		UUID workspaceId,
		List<TeamItem> teams,
		List<MemberItem> members,
		List<RoleItem> roles,
		List<WorkflowItem> workflows) {

	public DraftCatalogResource {
		teams = List.copyOf(teams);
		members = List.copyOf(members);
		roles = List.copyOf(roles);
		workflows = List.copyOf(workflows);
	}

	public record TeamItem(UUID id, String name, String department, int memberCount) {
	}

	public record MemberItem(
			UUID id,
			UUID teamId,
			String employeeNumber,
			String name,
			String email,
			String status,
			String region,
			String shift,
			Set<UUID> roleIds) {
		public MemberItem {
			roleIds = Set.copyOf(roleIds);
		}
	}

	public record RoleItem(
			UUID id,
			String name,
			String description,
			String sensitivity,
			UUID ownerMemberId,
			int memberCount) {
	}

	public record WorkflowItem(
			UUID id,
			String name,
			String criticality,
			List<WorkflowRequirementItem> requirements,
			boolean quickManaged) {
		public WorkflowItem {
			requirements = List.copyOf(requirements);
		}
	}

	public record WorkflowRequirementItem(
			UUID id,
			String name,
			int position,
			int minimumActors,
			int resilienceTarget,
			String requiredDepartment,
			String requiredRegion,
			String requiredShift,
			Set<UUID> roleIds) {
		public WorkflowRequirementItem {
			roleIds = Set.copyOf(roleIds);
		}
	}
}
