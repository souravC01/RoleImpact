package com.roleimpact.impactengine;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.roleimpact.catalog.snapshot.OrganizationSnapshot;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.ApplicationNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.CapabilityNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.EmployeeNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.OrganizationNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.PermissionNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.ResourceNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.RoleNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.TeamNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.WorkflowConstraintNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.WorkflowNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.WorkflowStepNode;
import com.roleimpact.impactengine.ImpactResult.CandidateExclusion;
import com.roleimpact.impactengine.ImpactResult.CandidateExclusionReasonCode;
import com.roleimpact.impactengine.ImpactResult.RecommendationAction;
import com.roleimpact.impactengine.ImpactResult.RecommendationEvidence;
import com.roleimpact.impactengine.ImpactResult.ResultStatus;
import com.roleimpact.impactengine.ImpactResult.Severity;
import com.roleimpact.impactengine.ImpactResult.TechnicalImpact;
import com.roleimpact.impactengine.ImpactResult.WorkflowStatus;
import com.roleimpact.shared.model.EmployeeStatus;
import com.roleimpact.shared.model.Region;
import com.roleimpact.shared.model.Sensitivity;
import com.roleimpact.shared.model.WorkflowConstraintType;
import com.roleimpact.shared.model.WorkflowCriticality;
import com.roleimpact.shared.model.WorkShift;

import org.junit.jupiter.api.Test;

class DeterministicImpactEngineTest {

	private static final UUID ORGANIZATION_ID = id("00000000", 1);
	private static final UUID FINANCE_TEAM_ID = id("10000000", 1);
	private static final UUID PRIYA_ID = id("20000000", 1);
	private static final UUID BOB_ID = id("20000000", 2);
	private static final UUID OLIVIA_ID = id("20000000", 3);
	private static final UUID DYLAN_ID = id("20000000", 4);
	private static final UUID INEZ_ID = id("20000000", 5);
	private static final UUID FINANCE_ANALYST_ID = id("30000000", 1);
	private static final UUID FINANCE_APPROVER_ID = id("30000000", 2);
	private static final UUID CLOSE_BACKUP_ID = id("30000000", 3);
	private static final UUID LEDGER_PRO_ID = id("40000000", 1);
	private static final UUID PAYMENTS_RESOURCE_ID = id("50000000", 1);
	private static final UUID LEDGER_RESOURCE_ID = id("50000000", 2);
	private static final UUID LEDGER_READ_ID = id("60000000", 1);
	private static final UUID PAYMENT_CREATE_ID = id("60000000", 2);
	private static final UUID PAYMENT_APPROVE_ID = id("60000000", 3);
	private static final UUID LEDGER_CLOSE_ID = id("60000000", 4);
	private static final UUID CREATE_PAYMENT_CAPABILITY_ID = id("70000000", 1);
	private static final UUID APPROVE_PAYMENT_CAPABILITY_ID = id("70000000", 2);
	private static final UUID CLOSE_PERIOD_CAPABILITY_ID = id("70000000", 3);
	private static final UUID VENDOR_PAYMENT_WORKFLOW_ID = id("80000000", 1);
	private static final UUID MONTH_END_WORKFLOW_ID = id("80000000", 2);
	private static final UUID CREATE_PAYMENT_STEP_ID = id("90000000", 1);
	private static final UUID APPROVE_PAYMENT_STEP_ID = id("90000000", 2);
	private static final UUID CLOSE_PERIOD_STEP_ID = id("90000000", 3);
	private static final UUID DIFFERENT_ACTORS_ID = id("a0000000", 1);

	private final ImpactEngine engine = new DeterministicImpactEngine();

	@Test
	void recommendsBobWithStableEvidenceAndExplainsUnsafeCandidates() {
		var result = engine.analyze(snapshot(false, false), revokePriyaApprover());

		assertThat(result.schemaVersion()).isEqualTo(DeterministicImpactEngine.RESULT_SCHEMA_VERSION);
		assertThat(result.recommendations()).singleElement().satisfies(recommendation -> {
			assertThat(recommendation.rank()).isEqualTo(1);
			assertThat(recommendation.action()).isEqualTo(RecommendationAction.ASSIGN_ROLE_TO_EMPLOYEE);
			assertThat(recommendation.candidate().id()).isEqualTo(BOB_ID);
			assertThat(recommendation.candidate().name()).isEqualTo("Bob Chen");
			assertThat(recommendation.role().id()).isEqualTo(FINANCE_APPROVER_ID);
			assertThat(recommendation.replacementChange()).isEqualTo(
					new RevokeAndAssignEmployeeRole(PRIYA_ID, FINANCE_APPROVER_ID, BOB_ID));
			assertThat(recommendation.gainedPermissions())
					.extracting(permission -> permission.action())
					.containsExactly("ledger.close", "payment.approve");
			assertThat(recommendation.existingApplicationAccess())
					.extracting(application -> application.name())
					.containsExactly("LedgerPro");
			assertThat(recommendation.restoredWorkflows())
					.extracting(workflow -> workflow.name())
					.containsExactly("Month-End Close", "Vendor Payment");
			assertThat(recommendation.evidence()).containsExactly(
					RecommendationEvidence.ACTIVE_EMPLOYEE,
					RecommendationEvidence.EXISTING_RELEVANT_APPLICATION_ACCESS,
					RecommendationEvidence.AFFECTED_STEP_CONSTRAINTS_SATISFIED,
					RecommendationEvidence.DIFFERENT_ACTORS_SATISFIED,
					RecommendationEvidence.WORSENED_WORKFLOWS_RESTORED,
					RecommendationEvidence.NO_WORKFLOW_WORSENED);
		});
		assertThat(reasonCodes(exclusion(result.excludedCandidateReasons(), DYLAN_ID)))
				.containsExactly(CandidateExclusionReasonCode.SHIFT_MISMATCH);
		assertThat(reasonCodes(exclusion(result.excludedCandidateReasons(), INEZ_ID)))
				.containsExactly(CandidateExclusionReasonCode.INACTIVE_EMPLOYEE);
		assertThat(reasonCodes(exclusion(result.excludedCandidateReasons(), OLIVIA_ID)))
				.containsExactly(CandidateExclusionReasonCode.CURRENT_ROLE_HOLDER);
		assertThat(reasonCodes(exclusion(result.excludedCandidateReasons(), PRIYA_ID)))
				.containsExactly(CandidateExclusionReasonCode.SOURCE_EMPLOYEE);
	}

	@Test
	void producesTheSameResultAndHashRegardlessOfSnapshotInsertionOrder() {
		var first = engine.analyze(snapshot(false, false), revokePriyaApprover());
		var repeated = engine.analyze(snapshot(false, false), revokePriyaApprover());
		var reversed = engine.analyze(snapshot(true, false), revokePriyaApprover());

		assertThat(first).isEqualTo(repeated).isEqualTo(reversed);
		assertThat(first.diagnostics().resultHash())
				.hasSize(64)
				.isEqualTo(reversed.diagnostics().resultHash());
	}

	@Test
	void leavesTheImmutableBaselineUntouchedAcrossRevokeAndBranchAnalysis() {
		var snapshot = snapshot(false, false);
		var assignmentsBefore = mutableAssignmentCopy(snapshot.roleIdsByEmployeeId());

		var revokeResult = engine.analyze(snapshot, revokePriyaApprover());
		engine.analyze(snapshot, revokeResult.recommendations().getFirst().replacementChange());

		assertThat(snapshot.roleIdsByEmployeeId()).isEqualTo(assignmentsBefore);
		assertThat(snapshot.roleIdsByEmployeeId().get(PRIYA_ID)).contains(FINANCE_APPROVER_ID);
		assertThat(snapshot.roleIdsByEmployeeId().get(BOB_ID)).doesNotContain(FINANCE_APPROVER_ID);
	}

	@Test
	void reportsOnlyNetPermissionLossAndGainWhenAccessOverlaps() {
		var result = engine.analyze(snapshot(false, true), revokePriyaApprover());

		assertThat(result.technicalImpact().lostPermissions())
				.extracting(permission -> permission.action())
				.containsExactly("payment.approve");
		assertThat(result.recommendations()).singleElement().satisfies(recommendation ->
				assertThat(recommendation.gainedPermissions())
						.extracting(permission -> permission.action())
						.containsExactly("payment.approve"));
		assertThat(result.workflowImpacts())
				.filteredOn(workflow -> workflow.workflowName().equals("Month-End Close"))
				.singleElement()
				.satisfies(workflow -> {
					assertThat(workflow.baselineStatus()).isEqualTo(WorkflowStatus.OPERATIONAL);
					assertThat(workflow.scenarioStatus()).isEqualTo(WorkflowStatus.OPERATIONAL);
				});
	}

	@Test
	void compositeBranchRestoresPriyaWorkflowsToOperational() {
		var snapshot = snapshot(false, false);
		var revokeResult = engine.analyze(snapshot, revokePriyaApprover());
		var replacementChange = revokeResult.recommendations().getFirst().replacementChange();

		var branchResult = engine.analyze(snapshot, replacementChange);

		assertThat(branchResult.changeSet().type())
				.isEqualTo("REVOKE_EMPLOYEE_ROLE_AND_ASSIGN_REPLACEMENT");
		assertThat(branchResult.changeSet().replacementEmployee().id()).isEqualTo(BOB_ID);
		assertThat(branchResult.technicalImpact().assignedRoles())
				.extracting(role -> role.id())
				.containsExactly(FINANCE_APPROVER_ID);
		assertThat(branchResult.technicalImpact().gainedPermissions())
				.extracting(permission -> permission.action())
				.containsExactly("ledger.close", "payment.approve");
		assertThat(branchResult.workflowImpacts())
				.filteredOn(workflow -> List.of("Vendor Payment", "Month-End Close")
						.contains(workflow.workflowName()))
				.allSatisfy(workflow -> {
					assertThat(workflow.baselineStatus()).isEqualTo(WorkflowStatus.OPERATIONAL);
					assertThat(workflow.scenarioStatus()).isEqualTo(WorkflowStatus.OPERATIONAL);
				});
		assertThat(branchResult.recommendations()).isEmpty();
		assertThat(branchResult.excludedCandidateReasons()).isEmpty();
	}

	@Test
	void normalizesCollectionsAbsentFromOlderPersistedResults() {
		var technicalImpact = new TechnicalImpact(null, null, null, null, null, null, null);
		var result = new ImpactResult(
				"1.0",
				ORGANIZATION_ID,
				1,
				ResultStatus.COMPLETE,
				Severity.LOW,
				null,
				null,
				technicalImpact,
				null,
				null,
				null,
				null,
				null);

		assertThat(result.workflowImpacts()).isEmpty();
		assertThat(result.explanationPaths()).isEmpty();
		assertThat(result.recommendations()).isEmpty();
		assertThat(result.excludedCandidateReasons()).isEmpty();
		assertThat(result.technicalImpact().assignedRoles()).isEmpty();
		assertThat(result.technicalImpact().gainedPermissions()).isEmpty();
	}

	private static RevokeEmployeeRole revokePriyaApprover() {
		return new RevokeEmployeeRole(PRIYA_ID, FINANCE_APPROVER_ID);
	}

	private static CandidateExclusion exclusion(List<CandidateExclusion> exclusions, UUID candidateId) {
		return exclusions.stream()
				.filter(exclusion -> exclusion.candidate().id().equals(candidateId))
				.findFirst()
				.orElseThrow();
	}

	private static List<CandidateExclusionReasonCode> reasonCodes(CandidateExclusion exclusion) {
		return exclusion.reasons().stream().map(reason -> reason.code()).toList();
	}

	private static OrganizationSnapshot snapshot(boolean reverseOrder, boolean overlappingClosePermission) {
		var priya = employee(PRIYA_ID, "Priya Sharma", EmployeeStatus.ACTIVE, WorkShift.EVENING);
		var bob = employee(BOB_ID, "Bob Chen", EmployeeStatus.ACTIVE, WorkShift.EVENING);
		var olivia = employee(OLIVIA_ID, "Olivia Park", EmployeeStatus.ACTIVE, WorkShift.DAY);
		var dylan = employee(DYLAN_ID, "Dylan Moore", EmployeeStatus.ACTIVE, WorkShift.DAY);
		var inez = employee(INEZ_ID, "Inez Silva", EmployeeStatus.INACTIVE, WorkShift.EVENING);
		var team = new TeamNode(FINANCE_TEAM_ID, "Finance Operations", "Finance", PRIYA_ID);
		var analyst = new RoleNode(
				FINANCE_ANALYST_ID, "Finance Analyst", "Uses LedgerPro", Sensitivity.MEDIUM, OLIVIA_ID);
		var approver = new RoleNode(
				FINANCE_APPROVER_ID, "Finance Approver", "Approves and closes", Sensitivity.CRITICAL, OLIVIA_ID);
		var backup = new RoleNode(
				CLOSE_BACKUP_ID, "Close Backup", "Overlapping close access", Sensitivity.HIGH, OLIVIA_ID);
		var application = new ApplicationNode(LEDGER_PRO_ID, "LedgerPro", "Finance", OLIVIA_ID);
		var payments = new ResourceNode(PAYMENTS_RESOURCE_ID, LEDGER_PRO_ID, "Payments", "PAYMENT");
		var ledger = new ResourceNode(LEDGER_RESOURCE_ID, LEDGER_PRO_ID, "General Ledger", "LEDGER");
		var ledgerRead = permission(LEDGER_READ_ID, LEDGER_RESOURCE_ID, "ledger.read", Sensitivity.LOW);
		var paymentCreate = permission(PAYMENT_CREATE_ID, PAYMENTS_RESOURCE_ID, "payment.create", Sensitivity.HIGH);
		var paymentApprove = permission(
				PAYMENT_APPROVE_ID, PAYMENTS_RESOURCE_ID, "payment.approve", Sensitivity.CRITICAL);
		var ledgerClose = permission(LEDGER_CLOSE_ID, LEDGER_RESOURCE_ID, "ledger.close", Sensitivity.CRITICAL);
		var createPayment = new CapabilityNode(
				CREATE_PAYMENT_CAPABILITY_ID, "Create vendor payment", "Create a payment");
		var approvePayment = new CapabilityNode(
				APPROVE_PAYMENT_CAPABILITY_ID, "Approve high-value payment", "Approve a payment");
		var closePeriod = new CapabilityNode(
				CLOSE_PERIOD_CAPABILITY_ID, "Close accounting period", "Close the ledger");
		var createStep = new WorkflowStepNode(
				CREATE_PAYMENT_STEP_ID,
				"CREATE_PAYMENT",
				"Create Payment",
				1,
				CREATE_PAYMENT_CAPABILITY_ID,
				1,
				1,
				"Finance",
				null,
				null,
				LEDGER_PRO_ID);
		var approveStep = new WorkflowStepNode(
				APPROVE_PAYMENT_STEP_ID,
				"APPROVE_PAYMENT",
				"High-Value Payment Approval",
				2,
				APPROVE_PAYMENT_CAPABILITY_ID,
				1,
				1,
				"Finance",
				null,
				WorkShift.EVENING,
				LEDGER_PRO_ID);
		var closeStep = new WorkflowStepNode(
				CLOSE_PERIOD_STEP_ID,
				"CLOSE_PERIOD",
				"Close Accounting Period",
				1,
				CLOSE_PERIOD_CAPABILITY_ID,
				1,
				2,
				"Finance",
				null,
				null,
				LEDGER_PRO_ID);
		var differentActors = new WorkflowConstraintNode(
				DIFFERENT_ACTORS_ID,
				WorkflowConstraintType.DIFFERENT_ACTORS,
				"{\"description\":\"Creator cannot approve\"}");
		var vendorPayment = new WorkflowNode(
				VENDOR_PAYMENT_WORKFLOW_ID,
				"Vendor Payment",
				WorkflowCriticality.CRITICAL,
				OLIVIA_ID,
				ordered(reverseOrder, createStep, approveStep),
				List.of(differentActors));
		var monthEnd = new WorkflowNode(
				MONTH_END_WORKFLOW_ID,
				"Month-End Close",
				WorkflowCriticality.HIGH,
				OLIVIA_ID,
				List.of(closeStep),
				List.of());

		var roleAssignments = new LinkedHashMap<UUID, Set<UUID>>();
		roleAssignments.put(PRIYA_ID, linkedSet(FINANCE_ANALYST_ID, FINANCE_APPROVER_ID));
		roleAssignments.put(BOB_ID, linkedSet(FINANCE_ANALYST_ID));
		roleAssignments.put(OLIVIA_ID, linkedSet(FINANCE_APPROVER_ID));
		roleAssignments.put(DYLAN_ID, linkedSet(FINANCE_ANALYST_ID));
		roleAssignments.put(INEZ_ID, linkedSet(FINANCE_ANALYST_ID));
		if (overlappingClosePermission) {
			roleAssignments.get(PRIYA_ID).add(CLOSE_BACKUP_ID);
			roleAssignments.get(BOB_ID).add(CLOSE_BACKUP_ID);
		}

		return new OrganizationSnapshot(
				new OrganizationNode(ORGANIZATION_ID, "harborline", "Harborline Commerce", 1, "fixture-hash"),
				orderedMap(reverseOrder, List.of(Map.entry(FINANCE_TEAM_ID, team))),
				orderedMap(reverseOrder, List.of(
						Map.entry(PRIYA_ID, priya),
						Map.entry(BOB_ID, bob),
						Map.entry(OLIVIA_ID, olivia),
						Map.entry(DYLAN_ID, dylan),
						Map.entry(INEZ_ID, inez))),
				orderedMap(reverseOrder, List.of(
						Map.entry(FINANCE_ANALYST_ID, analyst),
						Map.entry(FINANCE_APPROVER_ID, approver),
						Map.entry(CLOSE_BACKUP_ID, backup))),
				orderedMap(reverseOrder, List.of(Map.entry(LEDGER_PRO_ID, application))),
				orderedMap(reverseOrder, List.of(
						Map.entry(PAYMENTS_RESOURCE_ID, payments),
						Map.entry(LEDGER_RESOURCE_ID, ledger))),
				orderedMap(reverseOrder, List.of(
						Map.entry(LEDGER_READ_ID, ledgerRead),
						Map.entry(PAYMENT_CREATE_ID, paymentCreate),
						Map.entry(PAYMENT_APPROVE_ID, paymentApprove),
						Map.entry(LEDGER_CLOSE_ID, ledgerClose))),
				orderedMap(reverseOrder, List.of(
						Map.entry(CREATE_PAYMENT_CAPABILITY_ID, createPayment),
						Map.entry(APPROVE_PAYMENT_CAPABILITY_ID, approvePayment),
						Map.entry(CLOSE_PERIOD_CAPABILITY_ID, closePeriod))),
				orderedMap(reverseOrder, List.of(
						Map.entry(VENDOR_PAYMENT_WORKFLOW_ID, vendorPayment),
						Map.entry(MONTH_END_WORKFLOW_ID, monthEnd))),
				orderedMap(reverseOrder, new ArrayList<>(roleAssignments.entrySet())),
				orderedMap(reverseOrder, List.of(
						Map.entry(FINANCE_ANALYST_ID, linkedSet(LEDGER_READ_ID, PAYMENT_CREATE_ID)),
						Map.entry(FINANCE_APPROVER_ID, linkedSet(PAYMENT_APPROVE_ID, LEDGER_CLOSE_ID)),
						Map.entry(CLOSE_BACKUP_ID, linkedSet(LEDGER_CLOSE_ID)))),
				orderedMap(reverseOrder, List.of(
						Map.entry(CREATE_PAYMENT_CAPABILITY_ID, linkedSet(PAYMENT_CREATE_ID)),
						Map.entry(APPROVE_PAYMENT_CAPABILITY_ID, linkedSet(PAYMENT_APPROVE_ID)),
						Map.entry(CLOSE_PERIOD_CAPABILITY_ID, linkedSet(LEDGER_CLOSE_ID)))),
				orderedMap(reverseOrder, List.of(
						Map.entry(CREATE_PAYMENT_STEP_ID, linkedSet(DIFFERENT_ACTORS_ID)),
						Map.entry(APPROVE_PAYMENT_STEP_ID, linkedSet(DIFFERENT_ACTORS_ID)))));
	}

	private static EmployeeNode employee(
			UUID id,
			String name,
			EmployeeStatus status,
			WorkShift shift) {
		return new EmployeeNode(
				id,
				FINANCE_TEAM_ID,
				"HC-" + id.toString().substring(id.toString().length() - 4),
				name,
				name.toLowerCase().replace(' ', '.') + "@example.test",
				status,
				Region.NORTH_AMERICA,
				shift);
	}

	private static PermissionNode permission(
			UUID id,
			UUID resourceId,
			String action,
			Sensitivity sensitivity) {
		return new PermissionNode(id, LEDGER_PRO_ID, resourceId, action, sensitivity);
	}

	@SafeVarargs
	private static <T> List<T> ordered(boolean reverse, T... values) {
		var result = new ArrayList<>(List.of(values));
		if (reverse) {
			java.util.Collections.reverse(result);
		}
		return List.copyOf(result);
	}

	@SafeVarargs
	private static <T> LinkedHashSet<T> linkedSet(T... values) {
		return new LinkedHashSet<>(List.of(values));
	}

	private static <K, V> Map<K, V> orderedMap(boolean reverse, List<Map.Entry<K, V>> entries) {
		var orderedEntries = new ArrayList<>(entries);
		if (reverse) {
			java.util.Collections.reverse(orderedEntries);
		}
		var result = new LinkedHashMap<K, V>();
		orderedEntries.forEach(entry -> result.put(entry.getKey(), entry.getValue()));
		return result;
	}

	private static Map<UUID, Set<UUID>> mutableAssignmentCopy(Map<UUID, Set<UUID>> source) {
		var result = new LinkedHashMap<UUID, Set<UUID>>();
		source.forEach((employeeId, roleIds) -> result.put(employeeId, new LinkedHashSet<>(roleIds)));
		return result;
	}

	private static UUID id(String prefix, int suffix) {
		return UUID.fromString(prefix + "-0000-0000-0000-" + String.format("%012d", suffix));
	}
}
