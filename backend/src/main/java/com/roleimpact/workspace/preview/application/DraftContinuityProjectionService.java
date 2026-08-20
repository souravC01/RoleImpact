package com.roleimpact.workspace.preview.application;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import com.roleimpact.catalog.snapshot.OrganizationSnapshot;
import com.roleimpact.catalog.snapshot.OrganizationSnapshotAssembler;
import com.roleimpact.impactengine.ImpactEngine;
import com.roleimpact.impactengine.ImpactResult;
import com.roleimpact.impactengine.RevokeEmployeeRole;
import com.roleimpact.shared.model.WorkflowCriticality;
import com.roleimpact.workspace.application.WorkspaceNotFoundException;
import com.roleimpact.workspace.editor.api.DraftCatalogResource;
import com.roleimpact.workspace.editor.application.PublishedWorkspaceMutationException;
import com.roleimpact.workspace.editor.persistence.DraftCatalogRepository;
import com.roleimpact.workspace.preview.api.DraftContinuityRiskResource;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DraftContinuityProjectionService {

	private static final Comparator<String> TEXT_ORDER = Comparator.nullsFirst(String::compareTo);
	private static final Comparator<UUID> ID_ORDER = Comparator.nullsFirst(UUID::compareTo);

	private final DraftCatalogRepository catalogRepository;
	private final OrganizationSnapshotAssembler snapshotAssembler;
	private final ImpactEngine impactEngine;

	public DraftContinuityProjectionService(
			DraftCatalogRepository catalogRepository,
			OrganizationSnapshotAssembler snapshotAssembler,
			ImpactEngine impactEngine) {
		this.catalogRepository = catalogRepository;
		this.snapshotAssembler = snapshotAssembler;
		this.impactEngine = impactEngine;
	}

	@Transactional(readOnly = true)
	public List<DraftContinuityRiskResource> project(UUID workspaceId) {
		validateDraftWorkspace(workspaceId);
		DraftCatalogResource catalog = catalogRepository.findCatalog(workspaceId);
		OrganizationSnapshot snapshot = snapshotAssembler.assemble(workspaceId);
		return catalog.workflows().stream()
				.sorted(Comparator.comparing(DraftCatalogResource.WorkflowItem::name, TEXT_ORDER)
						.thenComparing(DraftCatalogResource.WorkflowItem::id, ID_ORDER))
				.flatMap(workflow -> projectWorkflow(catalog, snapshot, workflow).stream())
				.toList();
	}

	private List<DraftContinuityRiskResource> projectWorkflow(
			DraftCatalogResource catalog,
			OrganizationSnapshot snapshot,
			DraftCatalogResource.WorkflowItem workflow) {
		return workflow.requirements().stream()
				.sorted(Comparator.comparing(DraftCatalogResource.WorkflowRequirementItem::name, TEXT_ORDER)
						.thenComparing(DraftCatalogResource.WorkflowRequirementItem::id, ID_ORDER))
				.flatMap(requirement -> requirement.roleIds().stream()
						.map(roleId -> new RoleReference(roleId, findRole(catalog, roleId)))
						.filter(role -> role.item() != null)
						.sorted(Comparator.comparing((RoleReference role) -> role.item().name(), TEXT_ORDER)
								.thenComparing(RoleReference::id, ID_ORDER))
						.map(role -> projectRole(catalog, snapshot, workflow, requirement, role)))
				.filter(java.util.Optional::isPresent)
				.map(java.util.Optional::get)
				.toList();
	}

	private java.util.Optional<DraftContinuityRiskResource> projectRole(
			DraftCatalogResource catalog,
			OrganizationSnapshot snapshot,
			DraftCatalogResource.WorkflowItem workflow,
			DraftCatalogResource.WorkflowRequirementItem requirement,
			RoleReference role) {
		List<DraftCatalogResource.MemberItem> holders = catalog.members().stream()
				.filter(member -> member.roleIds().contains(role.id()))
				.sorted(Comparator.comparing(DraftCatalogResource.MemberItem::name, TEXT_ORDER)
						.thenComparing(DraftCatalogResource.MemberItem::id, ID_ORDER))
				.toList();
		if (holders.isEmpty()) return java.util.Optional.empty();

		List<Scenario> scenarios = holders.stream()
				.map(holder -> scenarioFor(snapshot, workflow.id(), requirement.id(), holder, role.id()))
				.toList();
		ImpactResult.StepImpact baseline = scenarios.getFirst().step();
		return java.util.Optional.of(new DraftContinuityRiskResource(
				workflow.id() + ":" + requirement.id() + ":" + role.id(),
				workflow.id(),
				workflow.name(),
				WorkflowCriticality.valueOf(workflow.criticality()),
				requirement.id(),
				requirement.name(),
				requirement.minimumActors(),
				requirement.resilienceTarget(),
				role.id(),
				role.item().name(),
				baseline.baselineEligibleActors().stream()
						.sorted(Comparator.comparing(ImpactResult.ActorRef::name, TEXT_ORDER)
								.thenComparing(ImpactResult.ActorRef::id, ID_ORDER))
						.map(actor -> new DraftContinuityRiskResource.EligibleMember(actor.id(), actor.name()))
						.toList(),
				scenarios.stream().map(Scenario::toMemberScenario).toList()));
	}

	private Scenario scenarioFor(
			OrganizationSnapshot snapshot,
			UUID workflowId,
			UUID stepId,
			DraftCatalogResource.MemberItem holder,
			UUID roleId) {
		ImpactResult result = impactEngine.analyze(snapshot, new RevokeEmployeeRole(holder.id(), roleId));
		ImpactResult.WorkflowImpact workflow = result.workflowImpacts().stream()
				.filter(candidate -> candidate.workflowId().equals(workflowId))
				.findFirst()
				.orElseThrow(() -> new IllegalStateException("Impact result did not include workflow " + workflowId));
		ImpactResult.StepImpact step = workflow.steps().stream()
				.filter(candidate -> candidate.stepId().equals(stepId))
				.findFirst()
				.orElseThrow(() -> new IllegalStateException("Impact result did not include workflow step " + stepId));
		return new Scenario(holder, workflow.scenarioStatus(), step);
	}

	private DraftCatalogResource.RoleItem findRole(DraftCatalogResource catalog, UUID roleId) {
		return catalog.roles().stream().filter(role -> role.id().equals(roleId)).findFirst().orElse(null);
	}

	private void validateDraftWorkspace(UUID workspaceId) {
		String status = catalogRepository.findWorkspaceStatus(workspaceId)
				.orElseThrow(() -> new WorkspaceNotFoundException(workspaceId));
		if (!"DRAFT".equals(status)) throw new PublishedWorkspaceMutationException();
	}

	private record RoleReference(UUID id, DraftCatalogResource.RoleItem item) {
	}

	private record Scenario(
			DraftCatalogResource.MemberItem holder,
			ImpactResult.WorkflowStatus workflowStatus,
			ImpactResult.StepImpact step) {

		DraftContinuityRiskResource.MemberScenario toMemberScenario() {
			boolean eligible = step.baselineEligibleActors().stream().anyMatch(actor -> actor.id().equals(holder.id()));
			boolean losesCoverage = eligible && step.scenarioEligibleActors().stream()
					.noneMatch(actor -> actor.id().equals(holder.id()));
			return new DraftContinuityRiskResource.MemberScenario(
					holder.id(), holder.name(), eligible, losesCoverage,
					step.scenarioEligibleActors().size(), workflowStatus);
		}
	}
}
