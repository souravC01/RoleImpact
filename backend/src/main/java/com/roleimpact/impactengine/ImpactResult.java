package com.roleimpact.impactengine;

import java.util.List;
import java.util.UUID;

import com.roleimpact.shared.model.Sensitivity;
import com.roleimpact.shared.model.WorkflowCriticality;

public record ImpactResult(
		String schemaVersion,
		UUID organizationId,
		int baselineVersion,
		ResultStatus resultStatus,
		Severity overallSeverity,
		ExecutiveSummary executiveSummary,
		ChangeSet changeSet,
		TechnicalImpact technicalImpact,
		List<WorkflowImpact> workflowImpacts,
		List<ExplanationPath> explanationPaths,
		GraphDiff graphDiff,
		List<Recommendation> recommendations,
		List<CandidateExclusion> excludedCandidateReasons,
		Diagnostics diagnostics) {

	public ImpactResult {
		workflowImpacts = immutableList(workflowImpacts);
		explanationPaths = immutableList(explanationPaths);
		graphDiff = graphDiff == null ? GraphDiff.empty() : graphDiff;
		recommendations = immutableList(recommendations);
		excludedCandidateReasons = immutableList(excludedCandidateReasons);
	}

	public ImpactResult(
			String schemaVersion,
			UUID organizationId,
			int baselineVersion,
			ResultStatus resultStatus,
			Severity overallSeverity,
			ExecutiveSummary executiveSummary,
			ChangeSet changeSet,
			TechnicalImpact technicalImpact,
			List<WorkflowImpact> workflowImpacts,
			List<ExplanationPath> explanationPaths,
			List<Recommendation> recommendations,
			List<CandidateExclusion> excludedCandidateReasons,
			Diagnostics diagnostics) {
		this(
				schemaVersion,
				organizationId,
				baselineVersion,
				resultStatus,
				overallSeverity,
				executiveSummary,
				changeSet,
				technicalImpact,
				workflowImpacts,
				explanationPaths,
				GraphDiff.empty(),
				recommendations,
				excludedCandidateReasons,
				diagnostics);
	}

	public ImpactResult(
			String schemaVersion,
			UUID organizationId,
			int baselineVersion,
			ResultStatus resultStatus,
			Severity overallSeverity,
			ExecutiveSummary executiveSummary,
			ChangeSet changeSet,
			TechnicalImpact technicalImpact,
			List<WorkflowImpact> workflowImpacts,
			List<ExplanationPath> explanationPaths,
			Diagnostics diagnostics) {
		this(
				schemaVersion,
				organizationId,
				baselineVersion,
				resultStatus,
				overallSeverity,
				executiveSummary,
				changeSet,
				technicalImpact,
				workflowImpacts,
				explanationPaths,
				GraphDiff.empty(),
				List.of(),
				List.of(),
				diagnostics);
	}

	public enum ResultStatus {
		COMPLETE,
		INCONCLUSIVE
	}

	public enum Severity {
		CRITICAL,
		HIGH,
		MEDIUM,
		LOW,
		NONE
	}

	public enum WorkflowStatus {
		OPERATIONAL,
		DEGRADED,
		BLOCKED
	}

	public enum StepStatus {
		OPERATIONAL,
		DEGRADED,
		BLOCKED
	}

	public enum PathNodeType {
		EMPLOYEE,
		ROLE,
		PERMISSION,
		CAPABILITY,
		WORKFLOW_STEP,
		WORKFLOW
	}

	public enum GraphState {
		UNCHANGED,
		REMOVED,
		ADDED,
		DEGRADED,
		BLOCKED,
		RESTORED
	}

	public enum RecommendationAction {
		ASSIGN_ROLE_TO_EMPLOYEE
	}

	public enum RecommendationEvidence {
		ACTIVE_EMPLOYEE,
		EXISTING_RELEVANT_APPLICATION_ACCESS,
		AFFECTED_STEP_CONSTRAINTS_SATISFIED,
		DIFFERENT_ACTORS_SATISFIED,
		WORSENED_WORKFLOWS_RESTORED,
		NO_WORKFLOW_WORSENED
	}

	public enum CandidateExclusionReasonCode {
		SOURCE_EMPLOYEE,
		CURRENT_ROLE_HOLDER,
		INACTIVE_EMPLOYEE,
		MISSING_RELEVANT_APPLICATION_ACCESS,
		DEPARTMENT_MISMATCH,
		REGION_MISMATCH,
		SHIFT_MISMATCH,
		MISSING_REQUIRED_CAPABILITY,
		MISSING_REQUIRED_APPLICATION,
		DIFFERENT_ACTORS_UNSATISFIED,
		WORKFLOW_BASELINE_NOT_RESTORED,
		WORKFLOW_WORSENED
	}

	public record ExecutiveSummary(
			int rolesRemoved,
			int permissionsLost,
			int workflowsBlocked,
			int workflowsDegraded,
			String messageKey) {
	}

	public record ChangeSet(
			String type,
			EntityRef employee,
			EntityRef role,
			EntityRef replacementEmployee) {

		public ChangeSet(String type, EntityRef employee, EntityRef role) {
			this(type, employee, role, null);
		}
	}

	public record TechnicalImpact(
			List<EntityRef> affectedEmployees,
			List<EntityRef> removedRoles,
			List<PermissionImpact> lostPermissions,
			List<EntityRef> affectedApplications,
			List<EntityRef> affectedResources,
			List<EntityRef> assignedRoles,
			List<PermissionImpact> gainedPermissions) {

		public TechnicalImpact {
			affectedEmployees = immutableList(affectedEmployees);
			removedRoles = immutableList(removedRoles);
			lostPermissions = immutableList(lostPermissions);
			affectedApplications = immutableList(affectedApplications);
			affectedResources = immutableList(affectedResources);
			assignedRoles = immutableList(assignedRoles);
			gainedPermissions = immutableList(gainedPermissions);
		}

		public TechnicalImpact(
				List<EntityRef> affectedEmployees,
				List<EntityRef> removedRoles,
				List<PermissionImpact> lostPermissions,
				List<EntityRef> affectedApplications,
				List<EntityRef> affectedResources) {
			this(
					affectedEmployees,
					removedRoles,
					lostPermissions,
					affectedApplications,
					affectedResources,
					List.of(),
					List.of());
		}
	}

	public record EntityRef(UUID id, String name) {
	}

	public record PermissionImpact(
			UUID id,
			String action,
			Sensitivity sensitivity,
			EntityRef application,
			EntityRef resource) {
	}

	public record WorkflowImpact(
			UUID workflowId,
			String workflowName,
			WorkflowCriticality criticality,
			WorkflowStatus baselineStatus,
			WorkflowStatus scenarioStatus,
			List<StepImpact> steps,
			List<String> failures) {

		public WorkflowImpact {
			steps = immutableList(steps);
			failures = immutableList(failures);
		}
	}

	public record StepImpact(
			UUID stepId,
			String stepKey,
			String stepName,
			EntityRef requiredCapability,
			int minimumActors,
			int resilienceTarget,
			StepStatus baselineStatus,
			StepStatus scenarioStatus,
			List<ActorRef> baselineEligibleActors,
			List<ActorRef> scenarioEligibleActors,
			String consequence) {

		public StepImpact {
			baselineEligibleActors = immutableList(baselineEligibleActors);
			scenarioEligibleActors = immutableList(scenarioEligibleActors);
		}
	}

	public record ActorRef(UUID id, String name) {
	}

	public record ExplanationPath(
			UUID workflowId,
			UUID stepId,
			WorkflowStatus outcome,
			String reason,
			List<PathNode> nodes) {

		public ExplanationPath {
			nodes = immutableList(nodes);
		}
	}

	public record PathNode(PathNodeType type, UUID id, String label) {
	}

	public record GraphDiff(List<GraphNode> nodes, List<GraphEdge> edges) {

		public GraphDiff {
			nodes = immutableList(nodes);
			edges = immutableList(edges);
		}

		public static GraphDiff empty() {
			return new GraphDiff(List.of(), List.of());
		}
	}

	public record GraphNode(
			String id,
			PathNodeType type,
			UUID entityId,
			String label,
			GraphState state,
			String detail) {
	}

	public record GraphEdge(
			String id,
			String sourceNodeId,
			String targetNodeId,
			String relationship,
			GraphState state) {
	}

	public record Recommendation(
			UUID id,
			int rank,
			RecommendationAction action,
			EntityRef candidate,
			EntityRef role,
			RevokeAndAssignEmployeeRole replacementChange,
			List<PermissionImpact> gainedPermissions,
			List<EntityRef> existingApplicationAccess,
			List<EntityRef> restoredWorkflows,
			List<EntityRef> restoredWorkflowSteps,
			List<RecommendationEvidence> evidence) {

		public Recommendation {
			gainedPermissions = immutableList(gainedPermissions);
			existingApplicationAccess = immutableList(existingApplicationAccess);
			restoredWorkflows = immutableList(restoredWorkflows);
			restoredWorkflowSteps = immutableList(restoredWorkflowSteps);
			evidence = immutableList(evidence);
		}
	}

	public record CandidateExclusion(
			EntityRef candidate,
			List<CandidateExclusionReason> reasons) {

		public CandidateExclusion {
			reasons = immutableList(reasons);
		}
	}

	public record CandidateExclusionReason(
			CandidateExclusionReasonCode code,
			String detail) {
	}

	public record Diagnostics(String engineVersion, String resultHash) {
	}

	private static <T> List<T> immutableList(List<T> values) {
		return values == null ? List.of() : List.copyOf(values);
	}
}
