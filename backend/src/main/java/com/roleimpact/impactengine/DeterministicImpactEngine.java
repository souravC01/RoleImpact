package com.roleimpact.impactengine;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Stream;

import com.roleimpact.catalog.snapshot.OrganizationSnapshot;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.EmployeeNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.PermissionNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.WorkflowNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.WorkflowStepNode;
import com.roleimpact.impactengine.ImpactResult.ActorRef;
import com.roleimpact.impactengine.ImpactResult.CandidateExclusion;
import com.roleimpact.impactengine.ImpactResult.CandidateExclusionReason;
import com.roleimpact.impactengine.ImpactResult.CandidateExclusionReasonCode;
import com.roleimpact.impactengine.ImpactResult.ChangeSet;
import com.roleimpact.impactengine.ImpactResult.Diagnostics;
import com.roleimpact.impactengine.ImpactResult.EntityRef;
import com.roleimpact.impactengine.ImpactResult.ExecutiveSummary;
import com.roleimpact.impactengine.ImpactResult.ExplanationPath;
import com.roleimpact.impactengine.ImpactResult.PathNode;
import com.roleimpact.impactengine.ImpactResult.PathNodeType;
import com.roleimpact.impactengine.ImpactResult.PermissionImpact;
import com.roleimpact.impactengine.ImpactResult.Recommendation;
import com.roleimpact.impactengine.ImpactResult.RecommendationAction;
import com.roleimpact.impactengine.ImpactResult.RecommendationEvidence;
import com.roleimpact.impactengine.ImpactResult.ResultStatus;
import com.roleimpact.impactengine.ImpactResult.Severity;
import com.roleimpact.impactengine.ImpactResult.StepImpact;
import com.roleimpact.impactengine.ImpactResult.StepStatus;
import com.roleimpact.impactengine.ImpactResult.TechnicalImpact;
import com.roleimpact.impactengine.ImpactResult.WorkflowImpact;
import com.roleimpact.impactengine.ImpactResult.WorkflowStatus;
import com.roleimpact.shared.model.EmployeeStatus;
import com.roleimpact.shared.model.WorkflowConstraintType;
import com.roleimpact.shared.model.WorkflowCriticality;

public final class DeterministicImpactEngine implements ImpactEngine {

	public static final String REQUEST_SCHEMA_VERSION = "1.0";
	public static final String RESULT_SCHEMA_VERSION = "1.1";
	public static final String SCHEMA_VERSION = REQUEST_SCHEMA_VERSION;
	public static final String ENGINE_VERSION = "1.1.0";

	private static final int MAX_RECOMMENDATIONS = 2;
	private static final Comparator<UUID> UUID_ORDER = Comparator.comparing(UUID::toString);
	private static final Comparator<EntityRef> ENTITY_ORDER = Comparator
			.comparing(EntityRef::name)
			.thenComparing(EntityRef::id, UUID_ORDER);
	private static final Comparator<EmployeeNode> EMPLOYEE_ORDER = Comparator
			.comparing(EmployeeNode::name)
			.thenComparing(EmployeeNode::id, UUID_ORDER);
	private static final Comparator<CandidateEvaluation> RECOMMENDATION_ORDER = Comparator
			.comparingInt((CandidateEvaluation candidate) -> candidate.gainedPermissionIds().size())
			.thenComparing(candidate -> !candidate.sameTeam())
			.thenComparing(candidate -> !candidate.sameDepartment())
			.thenComparing(candidate -> !candidate.sameRegion())
			.thenComparing(candidate -> !candidate.sameShift())
			.thenComparing(
					(CandidateEvaluation candidate) -> candidate.restoredWorkflowSteps().size(),
					Comparator.reverseOrder())
			.thenComparing(candidate -> candidate.candidate().id(), UUID_ORDER);

	@Override
	public ImpactResult analyze(OrganizationSnapshot baseline, SimulationChange change) {
		if (baseline == null) {
			throw new InvalidImpactChangeException("Baseline snapshot is required");
		}
		if (change instanceof RevokeEmployeeRole revokeEmployeeRole) {
			return analyzeRoleChange(
					baseline,
					revokeEmployeeRole.employeeId(),
					revokeEmployeeRole.roleId(),
					null,
					true);
		}
		if (change instanceof RevokeAndAssignEmployeeRole revokeAndAssign) {
			return analyzeRoleChange(
					baseline,
					revokeAndAssign.employeeId(),
					revokeAndAssign.roleId(),
					revokeAndAssign.replacementEmployeeId(),
					false);
		}
		throw new InvalidImpactChangeException("Unsupported simulation change");
	}

	private ImpactResult analyzeRoleChange(
			OrganizationSnapshot baseline,
			UUID employeeId,
			UUID roleId,
			UUID replacementEmployeeId,
			boolean includeRecommendations) {
		var employee = requireEmployee(baseline, employeeId);
		var role = baseline.roles().get(roleId);
		if (role == null) {
			throw new ImpactEntityNotFoundException("Role", roleId);
		}
		var replacement = replacementEmployeeId == null
				? null
				: requireEmployee(baseline, replacementEmployeeId);
		if (replacement != null && replacement.id().equals(employee.id())) {
			throw new InvalidImpactChangeException("Replacement employee must differ from the source employee");
		}

		var baselineAssignments = copyAssignments(baseline.roleIdsByEmployeeId());
		var employeeRoles = baselineAssignments.getOrDefault(employee.id(), Set.of());
		if (!employeeRoles.contains(role.id())) {
			throw new InvalidImpactChangeException(
					role.name() + " is not assigned to " + employee.name());
		}
		if (replacement != null
				&& baselineAssignments.getOrDefault(replacement.id(), Set.of()).contains(role.id())) {
			throw new InvalidImpactChangeException(
					role.name() + " is already assigned to " + replacement.name());
		}

		var scenarioAssignments = copyAssignments(baselineAssignments);
		scenarioAssignments.computeIfAbsent(employee.id(), ignored -> new LinkedHashSet<>()).remove(role.id());
		if (replacement != null) {
			scenarioAssignments.computeIfAbsent(replacement.id(), ignored -> new LinkedHashSet<>()).add(role.id());
		}

		var baselinePermissions = effectivePermissions(baseline, baselineAssignments);
		var scenarioPermissions = effectivePermissions(baseline, scenarioAssignments);
		var lostPermissionIds = sortedDifference(
				baselinePermissions.getOrDefault(employee.id(), Set.of()),
				scenarioPermissions.getOrDefault(employee.id(), Set.of()));
		var gainedPermissionIds = replacement == null
				? List.<UUID>of()
				: sortedDifference(
						scenarioPermissions.getOrDefault(replacement.id(), Set.of()),
						baselinePermissions.getOrDefault(replacement.id(), Set.of()));

		var technicalImpact = buildTechnicalImpact(
				baseline, employee, replacement, role.id(), lostPermissionIds, gainedPermissionIds);
		var workflowImpacts = evaluateWorkflows(baseline, baselinePermissions, scenarioPermissions);
		var explanationPaths = buildExplanationPaths(
				baseline, role.id(), employee, role.name(), lostPermissionIds, workflowImpacts);
		var severity = calculateSeverity(workflowImpacts);
		var blockedCount = countNewStatus(workflowImpacts, WorkflowStatus.BLOCKED);
		var degradedCount = countNewStatus(workflowImpacts, WorkflowStatus.DEGRADED);
		var summary = new ExecutiveSummary(
				1,
				lostPermissionIds.size(),
				blockedCount,
				degradedCount,
				messageKey(severity));
		var changeSet = new ChangeSet(
				replacement == null
						? "REVOKE_EMPLOYEE_ROLE"
						: "REVOKE_EMPLOYEE_ROLE_AND_ASSIGN_REPLACEMENT",
				new EntityRef(employee.id(), employee.name()),
				new EntityRef(role.id(), role.name()),
				replacement == null ? null : new EntityRef(replacement.id(), replacement.name()));

		var recommendationOutcome = includeRecommendations
				? recommendMitigations(
						baseline,
						employee,
						role.id(),
						baselineAssignments,
						scenarioAssignments,
						baselinePermissions,
						scenarioPermissions,
						lostPermissionIds,
						workflowImpacts)
				: RecommendationOutcome.empty();
		var canonical = canonicalPayload(
				baseline,
				severity,
				summary,
				changeSet,
				technicalImpact,
				workflowImpacts,
				explanationPaths,
				recommendationOutcome.recommendations(),
				recommendationOutcome.exclusions());
		var diagnostics = new Diagnostics(ENGINE_VERSION, sha256(canonical));

		return new ImpactResult(
				RESULT_SCHEMA_VERSION,
				baseline.organization().id(),
				baseline.organization().version(),
				ResultStatus.COMPLETE,
				severity,
				summary,
				changeSet,
				technicalImpact,
				workflowImpacts,
				explanationPaths,
				recommendationOutcome.recommendations(),
				recommendationOutcome.exclusions(),
				diagnostics);
	}

	private static EmployeeNode requireEmployee(OrganizationSnapshot baseline, UUID employeeId) {
		var employee = baseline.employees().get(employeeId);
		if (employee == null) {
			throw new ImpactEntityNotFoundException("Employee", employeeId);
		}
		return employee;
	}

	private static Map<UUID, Set<UUID>> copyAssignments(Map<UUID, Set<UUID>> source) {
		var copy = new LinkedHashMap<UUID, Set<UUID>>();
		source.entrySet().stream()
				.sorted(Map.Entry.comparingByKey(UUID_ORDER))
				.forEach(entry -> copy.put(entry.getKey(), new LinkedHashSet<>(entry.getValue())));
		return copy;
	}

	private static Map<UUID, Set<UUID>> effectivePermissions(
			OrganizationSnapshot snapshot,
			Map<UUID, Set<UUID>> assignments) {
		var effective = new LinkedHashMap<UUID, Set<UUID>>();
		snapshot.employees().keySet().stream().sorted(UUID_ORDER).forEach(employeeId -> {
			var permissionIds = new TreeSet<>(UUID_ORDER);
			assignments.getOrDefault(employeeId, Set.of()).stream().sorted(UUID_ORDER)
					.forEach(roleId -> permissionIds.addAll(
							snapshot.permissionIdsByRoleId().getOrDefault(roleId, Set.of())));
			effective.put(employeeId, new LinkedHashSet<>(permissionIds));
		});
		return effective;
	}

	private static List<UUID> sortedDifference(Collection<UUID> before, Collection<UUID> after) {
		var difference = new ArrayList<>(before);
		difference.removeAll(after);
		difference.sort(UUID_ORDER);
		return List.copyOf(difference);
	}

	private static TechnicalImpact buildTechnicalImpact(
			OrganizationSnapshot snapshot,
			EmployeeNode employee,
			EmployeeNode replacement,
			UUID removedRoleId,
			List<UUID> lostPermissionIds,
			List<UUID> gainedPermissionIds) {
		var lostPermissionImpacts = permissionImpacts(snapshot, lostPermissionIds);
		var gainedPermissionImpacts = permissionImpacts(snapshot, gainedPermissionIds);
		var applicationRefs = Stream.concat(lostPermissionImpacts.stream(), gainedPermissionImpacts.stream())
				.map(PermissionImpact::application)
				.distinct()
				.sorted(ENTITY_ORDER)
				.toList();
		var resourceRefs = Stream.concat(lostPermissionImpacts.stream(), gainedPermissionImpacts.stream())
				.map(PermissionImpact::resource)
				.distinct()
				.sorted(ENTITY_ORDER)
				.toList();
		var role = snapshot.roles().get(removedRoleId);
		var roleRef = new EntityRef(role.id(), role.name());
		var affectedEmployees = new ArrayList<EntityRef>();
		affectedEmployees.add(new EntityRef(employee.id(), employee.name()));
		if (replacement != null) {
			affectedEmployees.add(new EntityRef(replacement.id(), replacement.name()));
		}

		return new TechnicalImpact(
				affectedEmployees,
				List.of(roleRef),
				lostPermissionImpacts,
				applicationRefs,
				resourceRefs,
				replacement == null ? List.of() : List.of(roleRef),
				gainedPermissionImpacts);
	}

	private static List<PermissionImpact> permissionImpacts(
			OrganizationSnapshot snapshot,
			List<UUID> permissionIds) {
		return permissionIds.stream()
				.map(permissionId -> permissionImpact(snapshot, permissionId))
				.sorted(Comparator.comparing(PermissionImpact::action).thenComparing(PermissionImpact::id, UUID_ORDER))
				.toList();
	}

	private static PermissionImpact permissionImpact(OrganizationSnapshot snapshot, UUID permissionId) {
		var permission = snapshot.permissions().get(permissionId);
		var application = snapshot.applications().get(permission.applicationId());
		var resource = snapshot.resources().get(permission.resourceId());
		return new PermissionImpact(
				permission.id(),
				permission.action(),
				permission.sensitivity(),
				new EntityRef(application.id(), application.name()),
				new EntityRef(resource.id(), resource.name()));
	}

	private static List<WorkflowImpact> evaluateWorkflows(
			OrganizationSnapshot snapshot,
			Map<UUID, Set<UUID>> baselinePermissions,
			Map<UUID, Set<UUID>> scenarioPermissions) {
		return snapshot.workflows().values().stream()
				.sorted(Comparator.comparing(WorkflowNode::name).thenComparing(WorkflowNode::id, UUID_ORDER))
				.map(workflow -> evaluateWorkflow(snapshot, workflow, baselinePermissions, scenarioPermissions))
				.toList();
	}

	private static WorkflowImpact evaluateWorkflow(
			OrganizationSnapshot snapshot,
			WorkflowNode workflow,
			Map<UUID, Set<UUID>> baselinePermissions,
			Map<UUID, Set<UUID>> scenarioPermissions) {
		var orderedSteps = workflow.steps().stream()
				.sorted(Comparator.comparingInt(WorkflowStepNode::position).thenComparing(WorkflowStepNode::id, UUID_ORDER))
				.toList();
		var baselineActors = eligibleActorsByStep(snapshot, orderedSteps, baselinePermissions);
		var scenarioActors = eligibleActorsByStep(snapshot, orderedSteps, scenarioPermissions);
		var baselineStatus = workflowStatus(snapshot, workflow, baselineActors);
		var scenarioStatus = workflowStatus(snapshot, workflow, scenarioActors);

		var stepImpacts = orderedSteps.stream().map(step -> {
			var before = baselineActors.get(step.id());
			var after = scenarioActors.get(step.id());
			var beforeStatus = stepStatus(step, before.size());
			var afterStatus = stepStatus(step, after.size());
			return new StepImpact(
					step.id(),
					step.key(),
					step.name(),
					capabilityRef(snapshot, step.requiredCapabilityId()),
					step.minimumActors(),
					step.resilienceTarget(),
					beforeStatus,
					afterStatus,
					before,
					after,
					consequence(step, before.size(), after.size(), afterStatus));
		}).toList();

		var failures = stepImpacts.stream()
				.filter(step -> step.scenarioStatus() != StepStatus.OPERATIONAL)
				.map(StepImpact::consequence)
				.toList();

		return new WorkflowImpact(
				workflow.id(),
				workflow.name(),
				workflow.criticality(),
				baselineStatus,
				scenarioStatus,
				stepImpacts,
				failures);
	}

	private static Map<UUID, List<ActorRef>> eligibleActorsByStep(
			OrganizationSnapshot snapshot,
			List<WorkflowStepNode> steps,
			Map<UUID, Set<UUID>> permissionsByEmployee) {
		var result = new LinkedHashMap<UUID, List<ActorRef>>();
		for (var step : steps) {
			var actorRefs = snapshot.employees().values().stream()
					.filter(employee -> isEligible(snapshot, employee, step, permissionsByEmployee))
					.map(employee -> new ActorRef(employee.id(), employee.name()))
					.sorted(Comparator.comparing(ActorRef::name).thenComparing(ActorRef::id, UUID_ORDER))
					.toList();
			result.put(step.id(), actorRefs);
		}
		return result;
	}

	private static boolean isEligible(
			OrganizationSnapshot snapshot,
			EmployeeNode employee,
			WorkflowStepNode step,
			Map<UUID, Set<UUID>> permissionsByEmployee) {
		if (employee.status() != EmployeeStatus.ACTIVE) {
			return false;
		}
		var team = snapshot.teams().get(employee.teamId());
		if (team == null) {
			return false;
		}
		if (step.requiredDepartment() != null && !step.requiredDepartment().equals(team.department())) {
			return false;
		}
		if (step.requiredRegion() != null && step.requiredRegion() != employee.region()) {
			return false;
		}
		if (step.requiredShift() != null && step.requiredShift() != employee.shift()) {
			return false;
		}

		var employeePermissions = permissionsByEmployee.getOrDefault(employee.id(), Set.of());
		var capabilityPermissions = snapshot.permissionIdsByCapabilityId()
				.getOrDefault(step.requiredCapabilityId(), Set.of());
		if (capabilityPermissions.stream().noneMatch(employeePermissions::contains)) {
			return false;
		}
		if (step.requiredApplicationId() == null) {
			return true;
		}
		return hasApplicationAccess(snapshot, employeePermissions, step.requiredApplicationId());
	}

	private static boolean hasApplicationAccess(
			OrganizationSnapshot snapshot,
			Set<UUID> permissionIds,
			UUID applicationId) {
		return permissionIds.stream()
				.map(snapshot.permissions()::get)
				.filter(java.util.Objects::nonNull)
				.anyMatch(permission -> applicationId.equals(permission.applicationId()));
	}

	private static WorkflowStatus workflowStatus(
			OrganizationSnapshot snapshot,
			WorkflowNode workflow,
			Map<UUID, List<ActorRef>> actorsByStep) {
		var hasBlockedStep = workflow.steps().stream()
				.anyMatch(step -> actorsByStep.getOrDefault(step.id(), List.of()).size() < step.minimumActors());
		if (hasBlockedStep || !constraintsSatisfiable(snapshot, workflow, actorsByStep)) {
			return WorkflowStatus.BLOCKED;
		}
		var hasFragileStep = workflow.steps().stream()
				.anyMatch(step -> actorsByStep.getOrDefault(step.id(), List.of()).size() < step.resilienceTarget());
		return hasFragileStep ? WorkflowStatus.DEGRADED : WorkflowStatus.OPERATIONAL;
	}

	private static boolean constraintsSatisfiable(
			OrganizationSnapshot snapshot,
			WorkflowNode workflow,
			Map<UUID, List<ActorRef>> actorsByStep) {
		for (var constraint : workflow.constraints()) {
			if (constraint.type() != WorkflowConstraintType.DIFFERENT_ACTORS) {
				continue;
			}
			var constrainedSteps = workflow.steps().stream()
					.filter(step -> snapshot.constraintIdsByWorkflowStepId()
							.getOrDefault(step.id(), Set.of()).contains(constraint.id()))
					.sorted(Comparator.comparingInt(WorkflowStepNode::position))
					.toList();
			if (constrainedSteps.size() > 1
					&& !hasDistinctActorAssignment(constrainedSteps, actorsByStep, 0, new HashSet<>())) {
				return false;
			}
		}
		return true;
	}

	private static boolean hasDistinctActorAssignment(
			List<WorkflowStepNode> steps,
			Map<UUID, List<ActorRef>> actorsByStep,
			int index,
			Set<UUID> usedActors) {
		if (index == steps.size()) {
			return true;
		}
		for (var actor : actorsByStep.getOrDefault(steps.get(index).id(), List.of())) {
			if (usedActors.add(actor.id())) {
				if (hasDistinctActorAssignment(steps, actorsByStep, index + 1, usedActors)) {
					return true;
				}
				usedActors.remove(actor.id());
			}
		}
		return false;
	}

	private static StepStatus stepStatus(WorkflowStepNode step, int actorCount) {
		if (actorCount < step.minimumActors()) {
			return StepStatus.BLOCKED;
		}
		if (actorCount < step.resilienceTarget()) {
			return StepStatus.DEGRADED;
		}
		return StepStatus.OPERATIONAL;
	}

	private static EntityRef capabilityRef(OrganizationSnapshot snapshot, UUID capabilityId) {
		var capability = snapshot.capabilities().get(capabilityId);
		return new EntityRef(capability.id(), capability.name());
	}

	private static String consequence(
			WorkflowStepNode step,
			int baselineActors,
			int scenarioActors,
			StepStatus scenarioStatus) {
		if (scenarioStatus == StepStatus.BLOCKED) {
			return step.name() + " has " + scenarioActors + " eligible actors; at least "
					+ step.minimumActors() + " required.";
		}
		if (scenarioStatus == StepStatus.DEGRADED) {
			return step.name() + " coverage falls from " + baselineActors + " to " + scenarioActors
					+ ", below the resilience target of " + step.resilienceTarget() + ".";
		}
		return "Coverage remains operational with " + scenarioActors + " eligible actors.";
	}

	private static List<ExplanationPath> buildExplanationPaths(
			OrganizationSnapshot snapshot,
			UUID roleId,
			EmployeeNode employee,
			String roleName,
			List<UUID> lostPermissionIds,
			List<WorkflowImpact> workflowImpacts) {
		var lostPermissions = new LinkedHashSet<>(lostPermissionIds);
		var paths = new ArrayList<ExplanationPath>();

		for (var workflowImpact : workflowImpacts) {
			if (workflowImpact.baselineStatus() == workflowImpact.scenarioStatus()) {
				continue;
			}
			for (var stepImpact : workflowImpact.steps()) {
				var employeeWasRemoved = stepImpact.baselineEligibleActors().stream()
						.anyMatch(actor -> actor.id().equals(employee.id()))
						&& stepImpact.scenarioEligibleActors().stream()
								.noneMatch(actor -> actor.id().equals(employee.id()));
				if (!employeeWasRemoved || stepImpact.baselineStatus() == stepImpact.scenarioStatus()) {
					continue;
				}
				var qualifyingPermission = snapshot.permissionIdsByCapabilityId()
						.getOrDefault(stepImpact.requiredCapability().id(), Set.of()).stream()
						.filter(lostPermissions::contains)
						.map(snapshot.permissions()::get)
						.filter(java.util.Objects::nonNull)
						.sorted(Comparator.comparing(PermissionNode::action).thenComparing(PermissionNode::id, UUID_ORDER))
						.findFirst()
						.orElse(null);
				if (qualifyingPermission == null) {
					continue;
				}
				paths.add(new ExplanationPath(
						workflowImpact.workflowId(),
						stepImpact.stepId(),
						workflowImpact.scenarioStatus(),
						"Removing " + roleName + " from " + employee.name() + " removes "
								+ qualifyingPermission.action() + " and leaves " + stepImpact.stepName()
								+ " with " + stepImpact.scenarioEligibleActors().size() + " eligible actors.",
						List.of(
								new PathNode(PathNodeType.EMPLOYEE, employee.id(), employee.name()),
								new PathNode(PathNodeType.ROLE, roleId, roleName),
								new PathNode(PathNodeType.PERMISSION, qualifyingPermission.id(), qualifyingPermission.action()),
								new PathNode(
										PathNodeType.CAPABILITY,
										stepImpact.requiredCapability().id(),
										stepImpact.requiredCapability().name()),
								new PathNode(PathNodeType.WORKFLOW_STEP, stepImpact.stepId(), stepImpact.stepName()),
								new PathNode(
										PathNodeType.WORKFLOW,
										workflowImpact.workflowId(),
										workflowImpact.workflowName()))));
			}
		}
		return List.copyOf(paths);
	}

	private static RecommendationOutcome recommendMitigations(
			OrganizationSnapshot snapshot,
			EmployeeNode sourceEmployee,
			UUID roleId,
			Map<UUID, Set<UUID>> baselineAssignments,
			Map<UUID, Set<UUID>> revokedAssignments,
			Map<UUID, Set<UUID>> baselinePermissions,
			Map<UUID, Set<UUID>> revokedPermissions,
			List<UUID> lostPermissionIds,
			List<WorkflowImpact> revocationImpacts) {
		var newlyWorsened = revocationImpacts.stream()
				.filter(impact -> isWorse(impact.scenarioStatus(), impact.baselineStatus()))
				.toList();
		if (newlyWorsened.isEmpty() || lostPermissionIds.isEmpty()) {
			return RecommendationOutcome.empty();
		}

		var relevantApplications = relevantApplications(snapshot, lostPermissionIds);
		var affectedSteps = affectedSteps(snapshot, sourceEmployee.id(), newlyWorsened);
		var safeCandidates = new ArrayList<CandidateEvaluation>();
		var exclusions = new ArrayList<CandidateExclusion>();

		for (var candidate : snapshot.employees().values().stream().sorted(EMPLOYEE_ORDER).toList()) {
			var hardExclusion = hardExclusion(
					candidate, sourceEmployee.id(), roleId, baselineAssignments);
			if (hardExclusion != null) {
				exclusions.add(new CandidateExclusion(
						new EntityRef(candidate.id(), candidate.name()),
						List.of(hardExclusion)));
				continue;
			}

			var candidatePermissions = baselinePermissions.getOrDefault(candidate.id(), Set.of());
			var missingApplications = relevantApplications.stream()
					.filter(application -> !hasApplicationAccess(snapshot, candidatePermissions, application.id()))
					.toList();
			if (!missingApplications.isEmpty()) {
				exclusions.add(new CandidateExclusion(
						new EntityRef(candidate.id(), candidate.name()),
						List.of(new CandidateExclusionReason(
								CandidateExclusionReasonCode.MISSING_RELEVANT_APPLICATION_ACCESS,
								"Missing existing access to: " + joinedNames(missingApplications)))));
				continue;
			}

			var branchAssignments = copyAssignments(revokedAssignments);
			branchAssignments.computeIfAbsent(candidate.id(), ignored -> new LinkedHashSet<>()).add(roleId);
			var branchPermissions = effectivePermissions(snapshot, branchAssignments);
			var prerequisiteReasons = prerequisiteReasons(
					snapshot,
					candidate,
					affectedSteps,
					branchPermissions.getOrDefault(candidate.id(), Set.of()));
			if (!prerequisiteReasons.isEmpty()) {
				exclusions.add(new CandidateExclusion(
						new EntityRef(candidate.id(), candidate.name()),
						prerequisiteReasons));
				continue;
			}

			var branchImpacts = evaluateWorkflows(snapshot, baselinePermissions, branchPermissions);
			var safetyReasons = branchSafetyReasons(snapshot, newlyWorsened, branchImpacts);
			if (!safetyReasons.isEmpty()) {
				exclusions.add(new CandidateExclusion(
						new EntityRef(candidate.id(), candidate.name()),
						safetyReasons));
				continue;
			}

			var gainedPermissionIds = sortedDifference(
					branchPermissions.getOrDefault(candidate.id(), Set.of()),
					baselinePermissions.getOrDefault(candidate.id(), Set.of()));
			var restoredWorkflows = newlyWorsened.stream()
					.map(impact -> new EntityRef(impact.workflowId(), impact.workflowName()))
					.sorted(ENTITY_ORDER)
					.toList();
			var restoredWorkflowSteps = affectedSteps.stream()
					.map(affected -> new EntityRef(affected.step().id(), affected.step().name()))
					.distinct()
					.sorted(ENTITY_ORDER)
					.toList();
			var sourceTeam = snapshot.teams().get(sourceEmployee.teamId());
			var candidateTeam = snapshot.teams().get(candidate.teamId());
			safeCandidates.add(new CandidateEvaluation(
					candidate,
					gainedPermissionIds,
					relevantApplications,
					restoredWorkflows,
					restoredWorkflowSteps,
					sourceEmployee.teamId().equals(candidate.teamId()),
					sourceTeam != null && candidateTeam != null
							&& sourceTeam.department().equals(candidateTeam.department()),
					sourceEmployee.region() == candidate.region(),
					sourceEmployee.shift() == candidate.shift(),
					hasDifferentActorsConstraint(snapshot, newlyWorsened)));
		}

		var role = snapshot.roles().get(roleId);
		var orderedCandidates = safeCandidates.stream()
				.sorted(RECOMMENDATION_ORDER)
				.limit(MAX_RECOMMENDATIONS)
				.toList();
		var recommendations = new ArrayList<Recommendation>();
		for (var index = 0; index < orderedCandidates.size(); index++) {
			var candidate = orderedCandidates.get(index);
			var evidence = new ArrayList<RecommendationEvidence>();
			evidence.add(RecommendationEvidence.ACTIVE_EMPLOYEE);
			evidence.add(RecommendationEvidence.EXISTING_RELEVANT_APPLICATION_ACCESS);
			evidence.add(RecommendationEvidence.AFFECTED_STEP_CONSTRAINTS_SATISFIED);
			if (candidate.differentActorsSatisfied()) {
				evidence.add(RecommendationEvidence.DIFFERENT_ACTORS_SATISFIED);
			}
			evidence.add(RecommendationEvidence.WORSENED_WORKFLOWS_RESTORED);
			evidence.add(RecommendationEvidence.NO_WORKFLOW_WORSENED);
			recommendations.add(new Recommendation(
					recommendationId(snapshot, sourceEmployee.id(), role.id(), candidate.candidate().id()),
					index + 1,
					RecommendationAction.ASSIGN_ROLE_TO_EMPLOYEE,
					new EntityRef(candidate.candidate().id(), candidate.candidate().name()),
					new EntityRef(role.id(), role.name()),
					new RevokeAndAssignEmployeeRole(sourceEmployee.id(), role.id(), candidate.candidate().id()),
					permissionImpacts(snapshot, candidate.gainedPermissionIds()),
					candidate.existingApplicationAccess(),
					candidate.restoredWorkflows(),
					candidate.restoredWorkflowSteps(),
					evidence));
		}
		return new RecommendationOutcome(recommendations, exclusions);
	}

	private static CandidateExclusionReason hardExclusion(
			EmployeeNode candidate,
			UUID sourceEmployeeId,
			UUID roleId,
			Map<UUID, Set<UUID>> baselineAssignments) {
		if (candidate.id().equals(sourceEmployeeId)) {
			return new CandidateExclusionReason(
					CandidateExclusionReasonCode.SOURCE_EMPLOYEE,
					"The employee losing the role cannot be the replacement.");
		}
		if (baselineAssignments.getOrDefault(candidate.id(), Set.of()).contains(roleId)) {
			return new CandidateExclusionReason(
					CandidateExclusionReasonCode.CURRENT_ROLE_HOLDER,
					"The role is already assigned to this employee.");
		}
		if (candidate.status() != EmployeeStatus.ACTIVE) {
			return new CandidateExclusionReason(
					CandidateExclusionReasonCode.INACTIVE_EMPLOYEE,
					"Only active employees can be recommended.");
		}
		return null;
	}

	private static List<EntityRef> relevantApplications(
			OrganizationSnapshot snapshot,
			List<UUID> lostPermissionIds) {
		return lostPermissionIds.stream()
				.map(snapshot.permissions()::get)
				.filter(java.util.Objects::nonNull)
				.map(permission -> snapshot.applications().get(permission.applicationId()))
				.filter(java.util.Objects::nonNull)
				.map(application -> new EntityRef(application.id(), application.name()))
				.distinct()
				.sorted(ENTITY_ORDER)
				.toList();
	}

	private static List<AffectedStep> affectedSteps(
			OrganizationSnapshot snapshot,
			UUID sourceEmployeeId,
			List<WorkflowImpact> newlyWorsened) {
		var result = new ArrayList<AffectedStep>();
		for (var impact : newlyWorsened) {
			var workflow = snapshot.workflows().get(impact.workflowId());
			var stepsById = workflow.steps().stream()
					.collect(java.util.stream.Collectors.toMap(WorkflowStepNode::id, step -> step));
			for (var stepImpact : impact.steps()) {
				var sourceWasRemoved = stepImpact.baselineEligibleActors().stream()
						.anyMatch(actor -> actor.id().equals(sourceEmployeeId))
						&& stepImpact.scenarioEligibleActors().stream()
								.noneMatch(actor -> actor.id().equals(sourceEmployeeId));
				if (sourceWasRemoved) {
					result.add(new AffectedStep(stepsById.get(stepImpact.stepId())));
				}
			}
		}
		return List.copyOf(result);
	}

	private static List<CandidateExclusionReason> prerequisiteReasons(
			OrganizationSnapshot snapshot,
			EmployeeNode candidate,
			List<AffectedStep> affectedSteps,
			Set<UUID> permissionsAfterAssignment) {
		var detailsByReason = new EnumMap<CandidateExclusionReasonCode, Set<String>>(
				CandidateExclusionReasonCode.class);
		var team = snapshot.teams().get(candidate.teamId());
		for (var affected : affectedSteps) {
			var step = affected.step();
			if (team == null
					|| (step.requiredDepartment() != null
							&& !step.requiredDepartment().equals(team.department()))) {
				addReason(detailsByReason, CandidateExclusionReasonCode.DEPARTMENT_MISMATCH, step.name());
			}
			if (step.requiredRegion() != null && step.requiredRegion() != candidate.region()) {
				addReason(detailsByReason, CandidateExclusionReasonCode.REGION_MISMATCH, step.name());
			}
			if (step.requiredShift() != null && step.requiredShift() != candidate.shift()) {
				addReason(detailsByReason, CandidateExclusionReasonCode.SHIFT_MISMATCH, step.name());
			}
			var capabilityPermissions = snapshot.permissionIdsByCapabilityId()
					.getOrDefault(step.requiredCapabilityId(), Set.of());
			if (capabilityPermissions.stream().noneMatch(permissionsAfterAssignment::contains)) {
				addReason(detailsByReason, CandidateExclusionReasonCode.MISSING_REQUIRED_CAPABILITY, step.name());
			}
			if (step.requiredApplicationId() != null
					&& !hasApplicationAccess(snapshot, permissionsAfterAssignment, step.requiredApplicationId())) {
				addReason(detailsByReason, CandidateExclusionReasonCode.MISSING_REQUIRED_APPLICATION, step.name());
			}
		}
		return toReasons(detailsByReason);
	}

	private static List<CandidateExclusionReason> branchSafetyReasons(
			OrganizationSnapshot snapshot,
			List<WorkflowImpact> newlyWorsened,
			List<WorkflowImpact> branchImpacts) {
		var detailsByReason = new EnumMap<CandidateExclusionReasonCode, Set<String>>(
				CandidateExclusionReasonCode.class);
		var branchByWorkflowId = new LinkedHashMap<UUID, WorkflowImpact>();
		branchImpacts.forEach(impact -> branchByWorkflowId.put(impact.workflowId(), impact));

		for (var revoked : newlyWorsened) {
			var branch = branchByWorkflowId.get(revoked.workflowId());
			if (branch.scenarioStatus() == revoked.baselineStatus()) {
				continue;
			}
			var workflow = snapshot.workflows().get(revoked.workflowId());
			if (differentActorsUnsatisfied(snapshot, workflow, branch)) {
				addReason(
						detailsByReason,
						CandidateExclusionReasonCode.DIFFERENT_ACTORS_UNSATISFIED,
						revoked.workflowName());
			}
			else {
				addReason(
						detailsByReason,
						CandidateExclusionReasonCode.WORKFLOW_BASELINE_NOT_RESTORED,
						revoked.workflowName());
			}
		}
		for (var branch : branchImpacts) {
			if (isWorse(branch.scenarioStatus(), branch.baselineStatus())) {
				addReason(
						detailsByReason,
						CandidateExclusionReasonCode.WORKFLOW_WORSENED,
						branch.workflowName());
			}
		}
		return toReasons(detailsByReason);
	}

	private static boolean differentActorsUnsatisfied(
			OrganizationSnapshot snapshot,
			WorkflowNode workflow,
			WorkflowImpact impact) {
		if (workflow.constraints().stream()
				.noneMatch(constraint -> constraint.type() == WorkflowConstraintType.DIFFERENT_ACTORS)) {
			return false;
		}
		var actorsByStep = new LinkedHashMap<UUID, List<ActorRef>>();
		impact.steps().forEach(step -> actorsByStep.put(step.stepId(), step.scenarioEligibleActors()));
		return !constraintsSatisfiable(snapshot, workflow, actorsByStep);
	}

	private static boolean hasDifferentActorsConstraint(
			OrganizationSnapshot snapshot,
			List<WorkflowImpact> impacts) {
		return impacts.stream()
				.map(impact -> snapshot.workflows().get(impact.workflowId()))
				.anyMatch(workflow -> workflow.constraints().stream()
						.anyMatch(constraint -> constraint.type() == WorkflowConstraintType.DIFFERENT_ACTORS));
	}

	private static void addReason(
			EnumMap<CandidateExclusionReasonCode, Set<String>> detailsByReason,
			CandidateExclusionReasonCode reason,
			String detail) {
		detailsByReason.computeIfAbsent(reason, ignored -> new TreeSet<>()).add(detail);
	}

	private static List<CandidateExclusionReason> toReasons(
			EnumMap<CandidateExclusionReasonCode, Set<String>> detailsByReason) {
		var reasons = new ArrayList<CandidateExclusionReason>();
		for (var code : CandidateExclusionReasonCode.values()) {
			var details = detailsByReason.get(code);
			if (details == null) {
				continue;
			}
			var prefix = switch (code) {
				case DEPARTMENT_MISMATCH -> "Department requirement not satisfied for: ";
				case REGION_MISMATCH -> "Region requirement not satisfied for: ";
				case SHIFT_MISMATCH -> "Shift requirement not satisfied for: ";
				case MISSING_REQUIRED_CAPABILITY -> "Role does not provide a required capability for: ";
				case MISSING_REQUIRED_APPLICATION -> "Application requirement not satisfied for: ";
				case DIFFERENT_ACTORS_UNSATISFIED -> "DIFFERENT_ACTORS is not satisfiable for: ";
				case WORKFLOW_BASELINE_NOT_RESTORED -> "Baseline status is not restored for: ";
				case WORKFLOW_WORSENED -> "Workflow is worse than baseline: ";
				default -> "";
			};
			reasons.add(new CandidateExclusionReason(code, prefix + String.join(", ", details)));
		}
		return List.copyOf(reasons);
	}

	private static String joinedNames(List<EntityRef> entities) {
		return String.join(", ", entities.stream().map(EntityRef::name).toList());
	}

	private static UUID recommendationId(
			OrganizationSnapshot snapshot,
			UUID sourceEmployeeId,
			UUID roleId,
			UUID candidateEmployeeId) {
		var canonical = String.join(
				"|",
				snapshot.organization().id().toString(),
				Integer.toString(snapshot.organization().version()),
				sourceEmployeeId.toString(),
				roleId.toString(),
				candidateEmployeeId.toString());
		return UUID.nameUUIDFromBytes(canonical.getBytes(StandardCharsets.UTF_8));
	}

	private static boolean isWorse(WorkflowStatus after, WorkflowStatus before) {
		return after.ordinal() > before.ordinal();
	}

	private static Severity calculateSeverity(List<WorkflowImpact> impacts) {
		var criticalBlocked = impacts.stream().anyMatch(impact ->
				impact.criticality() == WorkflowCriticality.CRITICAL
						&& impact.scenarioStatus() == WorkflowStatus.BLOCKED
						&& impact.baselineStatus() != WorkflowStatus.BLOCKED);
		if (criticalBlocked) {
			return Severity.CRITICAL;
		}
		var highImpact = impacts.stream().anyMatch(impact ->
				(impact.scenarioStatus() == WorkflowStatus.BLOCKED
						&& impact.baselineStatus() != WorkflowStatus.BLOCKED)
						|| (impact.criticality() == WorkflowCriticality.CRITICAL
								&& impact.scenarioStatus() == WorkflowStatus.DEGRADED
								&& impact.baselineStatus() == WorkflowStatus.OPERATIONAL));
		if (highImpact) {
			return Severity.HIGH;
		}
		var degraded = impacts.stream().anyMatch(impact ->
				impact.scenarioStatus() == WorkflowStatus.DEGRADED
						&& impact.baselineStatus() == WorkflowStatus.OPERATIONAL);
		return degraded ? Severity.MEDIUM : Severity.LOW;
	}

	private static int countNewStatus(List<WorkflowImpact> impacts, WorkflowStatus status) {
		return Math.toIntExact(impacts.stream()
				.filter(impact -> impact.scenarioStatus() == status && impact.baselineStatus() != status)
				.count());
	}

	private static String messageKey(Severity severity) {
		return switch (severity) {
			case CRITICAL -> "simulation.revoke-role.critical";
			case HIGH -> "simulation.revoke-role.high";
			case MEDIUM -> "simulation.revoke-role.medium";
			case LOW -> "simulation.revoke-role.low";
			case NONE -> "simulation.revoke-role.none";
		};
	}

	private static String canonicalPayload(
			OrganizationSnapshot snapshot,
			Severity severity,
			ExecutiveSummary summary,
			ChangeSet changeSet,
			TechnicalImpact technicalImpact,
			List<WorkflowImpact> workflowImpacts,
			List<ExplanationPath> explanationPaths,
			List<Recommendation> recommendations,
			List<CandidateExclusion> exclusions) {
		var canonical = new StringBuilder();
		append(canonical, RESULT_SCHEMA_VERSION, ENGINE_VERSION, snapshot.organization().id(),
				snapshot.organization().version(), snapshot.organization().contentHash(), severity,
				summary.rolesRemoved(), summary.permissionsLost(), summary.workflowsBlocked(),
				summary.workflowsDegraded(), changeSet.type(), changeSet.employee().id(), changeSet.role().id(),
				changeSet.replacementEmployee() == null ? null : changeSet.replacementEmployee().id());
		technicalImpact.lostPermissions().forEach(permission -> appendPermission(canonical, "lost", permission));
		technicalImpact.gainedPermissions().forEach(permission -> appendPermission(canonical, "gained", permission));
		technicalImpact.assignedRoles().forEach(role -> append(canonical, "assigned-role", role.id()));
		workflowImpacts.forEach(workflow -> {
			append(canonical, workflow.workflowId(), workflow.baselineStatus(), workflow.scenarioStatus());
			workflow.steps().forEach(step -> {
				append(canonical, step.stepId(), step.baselineStatus(), step.scenarioStatus());
				step.baselineEligibleActors().forEach(actor -> append(canonical, "before", actor.id()));
				step.scenarioEligibleActors().forEach(actor -> append(canonical, "after", actor.id()));
			});
		});
		explanationPaths.forEach(path -> {
			append(canonical, path.workflowId(), path.stepId(), path.outcome(), path.reason());
			path.nodes().forEach(node -> append(canonical, node.type(), node.id(), node.label()));
		});
		recommendations.forEach(recommendation -> {
			var replacement = recommendation.replacementChange();
			append(
					canonical,
					"recommendation",
					recommendation.id(),
					recommendation.rank(),
					recommendation.action(),
					recommendation.candidate().id(),
					recommendation.role().id(),
					replacement.employeeId(),
					replacement.roleId(),
					replacement.replacementEmployeeId());
			recommendation.gainedPermissions()
					.forEach(permission -> appendPermission(canonical, "recommendation-gained", permission));
			recommendation.existingApplicationAccess()
					.forEach(application -> append(canonical, "existing-application", application.id()));
			recommendation.restoredWorkflows()
					.forEach(workflow -> append(canonical, "restored-workflow", workflow.id()));
			recommendation.restoredWorkflowSteps()
					.forEach(step -> append(canonical, "restored-step", step.id()));
			recommendation.evidence()
					.forEach(evidence -> append(canonical, "evidence", evidence));
		});
		exclusions.forEach(exclusion -> {
			append(canonical, "excluded-candidate", exclusion.candidate().id());
			exclusion.reasons().forEach(reason -> append(canonical, reason.code(), reason.detail()));
		});
		return canonical.toString();
	}

	private static void appendPermission(StringBuilder canonical, String direction, PermissionImpact permission) {
		append(
				canonical,
				direction,
				permission.id(),
				permission.action(),
				permission.sensitivity(),
				permission.application().id(),
				permission.resource().id());
	}

	private static void append(StringBuilder builder, Object... values) {
		for (var value : values) {
			builder.append(value).append('\u001f');
		}
		builder.append('\n');
	}

	private static String sha256(String value) {
		try {
			var digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
			return java.util.HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256 is unavailable", exception);
		}
	}

	private record RecommendationOutcome(
			List<Recommendation> recommendations,
			List<CandidateExclusion> exclusions) {

		private RecommendationOutcome {
			recommendations = List.copyOf(recommendations);
			exclusions = List.copyOf(exclusions);
		}

		private static RecommendationOutcome empty() {
			return new RecommendationOutcome(List.of(), List.of());
		}
	}

	private record AffectedStep(WorkflowStepNode step) {
	}

	private record CandidateEvaluation(
			EmployeeNode candidate,
			List<UUID> gainedPermissionIds,
			List<EntityRef> existingApplicationAccess,
			List<EntityRef> restoredWorkflows,
			List<EntityRef> restoredWorkflowSteps,
			boolean sameTeam,
			boolean sameDepartment,
			boolean sameRegion,
			boolean sameShift,
			boolean differentActorsSatisfied) {
	}
}
