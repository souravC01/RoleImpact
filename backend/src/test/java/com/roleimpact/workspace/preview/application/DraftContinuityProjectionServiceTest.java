package com.roleimpact.workspace.preview.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.roleimpact.catalog.snapshot.OrganizationSnapshot;
import com.roleimpact.catalog.snapshot.OrganizationSnapshotAssembler;
import com.roleimpact.impactengine.ImpactEngine;
import com.roleimpact.impactengine.ImpactResult;
import com.roleimpact.impactengine.ImpactResult.ActorRef;
import com.roleimpact.impactengine.ImpactResult.StepImpact;
import com.roleimpact.impactengine.ImpactResult.WorkflowImpact;
import com.roleimpact.impactengine.RevokeEmployeeRole;
import com.roleimpact.shared.model.WorkflowCriticality;
import com.roleimpact.workspace.application.WorkspaceNotFoundException;
import com.roleimpact.workspace.editor.api.DraftCatalogResource;
import com.roleimpact.workspace.editor.application.PublishedWorkspaceMutationException;
import com.roleimpact.workspace.editor.persistence.DraftCatalogRepository;

import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;

class DraftContinuityProjectionServiceTest {

	private static final UUID WORKSPACE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
	private static final UUID ALPHA_WORKFLOW_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");
	private static final UUID ZULU_WORKFLOW_ID = UUID.fromString("00000000-0000-0000-0000-000000000020");
	private static final UUID ALPHA_STEP_ID = UUID.fromString("00000000-0000-0000-0000-000000000011");
	private static final UUID ZULU_STEP_ID = UUID.fromString("00000000-0000-0000-0000-000000000021");
	private static final UUID ALPHA_ROLE_ID = UUID.fromString("00000000-0000-0000-0000-000000000012");
	private static final UUID ZULU_ROLE_ID = UUID.fromString("00000000-0000-0000-0000-000000000022");
	private static final UUID AARON_ID = UUID.fromString("00000000-0000-0000-0000-000000000101");
	private static final UUID ZOE_ID = UUID.fromString("00000000-0000-0000-0000-000000000102");
	private static final UUID ENGINE_BACKUP_ID = UUID.fromString("00000000-0000-0000-0000-000000000103");
	private static final UUID ALPHA_HOLDER_ID = UUID.fromString("00000000-0000-0000-0000-000000000104");

	@Test
	void projectsEngineEligibilityAndWorkflowVerdictsInDeterministicOrder() {
		var repository = mock(DraftCatalogRepository.class);
		var snapshots = mock(OrganizationSnapshotAssembler.class);
		var snapshot = mock(OrganizationSnapshot.class);
		when(repository.findWorkspaceStatus(WORKSPACE_ID)).thenReturn(java.util.Optional.of("DRAFT"));
		when(repository.findCatalog(WORKSPACE_ID)).thenReturn(catalog());
		when(snapshots.assemble(WORKSPACE_ID)).thenReturn(snapshot);
		ImpactEngine engine = (baseline, change) -> resultFor((RevokeEmployeeRole) change);

		var service = new DraftContinuityProjectionService(repository, snapshots, engine);

		var risks = service.project(WORKSPACE_ID);

		assertThat(risks).extracting(risk -> risk.workflowName() + ":" + risk.roleName())
				.containsExactly("Alpha workflow:Alpha role", "Zulu workflow:Zulu role");
		var zuluRisk = risks.get(1);
		assertThat(zuluRisk.eligibleMembers())
				.extracting(member -> member.id(), member -> member.name())
				.containsExactly(
						tuple(ENGINE_BACKUP_ID, "Engine Backup"),
						tuple(ZOE_ID, "Zoe Holder"));
		assertThat(zuluRisk.members()).extracting(member -> member.name())
				.containsExactly("Aaron Holder", "Zoe Holder");
		assertThat(zuluRisk.members()).extracting(
				member -> member.eligible(),
				member -> member.losesCoverage(),
				member -> member.remainingEligibleActorCount(),
				member -> member.scenarioStatus())
				.containsExactly(
						tuple(false, false, 2, ImpactResult.WorkflowStatus.OPERATIONAL),
						tuple(true, true, 1, ImpactResult.WorkflowStatus.BLOCKED));
		assertThat(zuluRisk.members().get(1).scenarioStatus()).isEqualTo(ImpactResult.WorkflowStatus.BLOCKED);
	}

	@Test
	void rejectsPublishedAndUnknownWorkspacesBeforeProjecting() {
		var repository = mock(DraftCatalogRepository.class);
		var snapshots = mock(OrganizationSnapshotAssembler.class);
		ImpactEngine engine = (baseline, change) -> null;
		var service = new DraftContinuityProjectionService(repository, snapshots, engine);

		when(repository.findWorkspaceStatus(WORKSPACE_ID)).thenReturn(java.util.Optional.of("PUBLISHED"));
		assertThatThrownBy(() -> service.project(WORKSPACE_ID))
				.isInstanceOf(PublishedWorkspaceMutationException.class);

		UUID unknownWorkspaceId = UUID.fromString("00000000-0000-0000-0000-000000000099");
		when(repository.findWorkspaceStatus(unknownWorkspaceId)).thenReturn(java.util.Optional.empty());
		assertThatThrownBy(() -> service.project(unknownWorkspaceId))
				.isInstanceOf(WorkspaceNotFoundException.class);
	}

	private static DraftCatalogResource catalog() {
		return new DraftCatalogResource(
				WORKSPACE_ID,
				List.of(),
				List.of(
						member(ZOE_ID, "Zoe Holder", ZULU_ROLE_ID),
						member(AARON_ID, "Aaron Holder", ZULU_ROLE_ID),
						member(ALPHA_HOLDER_ID, "Alpha Holder", ALPHA_ROLE_ID)),
				List.of(
						role(ZULU_ROLE_ID, "Zulu role"),
						role(ALPHA_ROLE_ID, "Alpha role")),
				List.of(
						workflow(ZULU_WORKFLOW_ID, "Zulu workflow", ZULU_STEP_ID, "Zulu requirement", ZULU_ROLE_ID),
						workflow(ALPHA_WORKFLOW_ID, "Alpha workflow", ALPHA_STEP_ID, "Alpha requirement", ALPHA_ROLE_ID)));
	}

	private static DraftCatalogResource.MemberItem member(UUID id, String name, UUID roleId) {
		return new DraftCatalogResource.MemberItem(id, null, null, name, null, "INACTIVE", "EUROPE", "NIGHT", Set.of(roleId));
	}

	private static DraftCatalogResource.RoleItem role(UUID id, String name) {
		return new DraftCatalogResource.RoleItem(id, name, "fixture", "HIGH", null, 2);
	}

	private static DraftCatalogResource.WorkflowItem workflow(
			UUID workflowId, String workflowName, UUID requirementId, String requirementName, UUID roleId) {
		return new DraftCatalogResource.WorkflowItem(
				workflowId,
				workflowName,
				"HIGH",
				List.of(new DraftCatalogResource.WorkflowRequirementItem(
						requirementId, requirementName, 1, 1, 2, "Finance", "EUROPE", "NIGHT", Set.of(roleId))),
				true);
	}

	private static ImpactResult resultFor(RevokeEmployeeRole change) {
		if (change.roleId().equals(ALPHA_ROLE_ID)) {
			return result(new WorkflowImpact(
					ALPHA_WORKFLOW_ID, "Alpha workflow", WorkflowCriticality.HIGH,
					ImpactResult.WorkflowStatus.OPERATIONAL, ImpactResult.WorkflowStatus.OPERATIONAL,
					List.of(step(ALPHA_STEP_ID, "Alpha requirement", List.of(), List.of())), List.of()));
		}
		var baselineActors = List.of(new ActorRef(ZOE_ID, "Zoe Holder"), new ActorRef(ENGINE_BACKUP_ID, "Engine Backup"));
		var scenarioActors = change.employeeId().equals(ZOE_ID)
				? List.of(new ActorRef(ENGINE_BACKUP_ID, "Engine Backup"))
				: baselineActors;
		return result(new WorkflowImpact(
				ZULU_WORKFLOW_ID, "Zulu workflow", WorkflowCriticality.HIGH,
				ImpactResult.WorkflowStatus.OPERATIONAL,
				change.employeeId().equals(ZOE_ID) ? ImpactResult.WorkflowStatus.BLOCKED : ImpactResult.WorkflowStatus.OPERATIONAL,
				List.of(step(ZULU_STEP_ID, "Zulu requirement", baselineActors, scenarioActors)), List.of()));
	}

	private static StepImpact step(UUID id, String name, List<ActorRef> baseline, List<ActorRef> scenario) {
		return new StepImpact(id, name.toUpperCase().replace(' ', '_'), name, null, 1, 2,
				ImpactResult.StepStatus.OPERATIONAL, ImpactResult.StepStatus.OPERATIONAL, baseline, scenario, "fixture");
	}

	private static ImpactResult result(WorkflowImpact workflow) {
		return new ImpactResult("1.0", WORKSPACE_ID, 0, ImpactResult.ResultStatus.COMPLETE,
				ImpactResult.Severity.NONE, null, null, null, List.of(workflow), List.of(), List.of(), List.of(), null);
	}

	private static org.assertj.core.groups.Tuple tuple(Object... values) {
		return org.assertj.core.groups.Tuple.tuple(values);
	}
}
