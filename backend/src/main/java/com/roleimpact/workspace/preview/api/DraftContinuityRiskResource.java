package com.roleimpact.workspace.preview.api;

import java.util.List;
import java.util.UUID;

import com.roleimpact.impactengine.ImpactResult.WorkflowStatus;
import com.roleimpact.shared.model.WorkflowCriticality;

public record DraftContinuityRiskResource(
		String key,
		UUID workflowId,
		String workflowName,
		WorkflowCriticality criticality,
		UUID requirementId,
		String requirementName,
		int minimumActors,
		int resilienceTarget,
		UUID roleId,
		String roleName,
		List<EligibleMember> eligibleMembers,
		List<MemberScenario> members) {

	public DraftContinuityRiskResource {
		eligibleMembers = List.copyOf(eligibleMembers);
		members = List.copyOf(members);
	}

	public record EligibleMember(UUID id, String name) {
	}

	public record MemberScenario(
			UUID id,
			String name,
			boolean eligible,
			boolean losesCoverage,
			int remainingEligibleActorCount,
			WorkflowStatus scenarioStatus) {
	}
}
