package com.roleimpact.dashboard.application;

import java.util.Comparator;

import com.roleimpact.catalog.snapshot.OrganizationSnapshot;
import com.roleimpact.catalog.snapshot.OrganizationSnapshotAssembler;
import com.roleimpact.dashboard.api.DashboardResponse;
import com.roleimpact.dashboard.api.DashboardResponse.CatalogCounts;
import com.roleimpact.dashboard.api.DashboardResponse.OrganizationSummary;
import com.roleimpact.dashboard.api.DashboardResponse.WorkflowSummary;
import com.roleimpact.shared.model.EmployeeStatus;

import org.springframework.stereotype.Service;

@Service
public class DashboardQueryService {

	private final OrganizationSnapshotAssembler snapshotAssembler;

	public DashboardQueryService(OrganizationSnapshotAssembler snapshotAssembler) {
		this.snapshotAssembler = snapshotAssembler;
	}

	public DashboardResponse getDashboard(String organizationSlug) {
		var snapshot = snapshotAssembler.assemble(organizationSlug);
		var organization = snapshot.organization();
		var activeEmployees = snapshot.employees().values().stream()
				.filter(employee -> employee.status() == EmployeeStatus.ACTIVE)
				.count();

		var workflows = snapshot.workflows().values().stream()
				.map(workflow -> new WorkflowSummary(
						workflow.id(),
						workflow.name(),
						workflow.criticality(),
						workflow.steps().size(),
						ownerName(snapshot, workflow.ownerEmployeeId())))
				.sorted(Comparator
						.comparingInt((WorkflowSummary summary) -> criticalityRank(summary.criticality()))
						.thenComparing(WorkflowSummary::name))
				.toList();

		return new DashboardResponse(
				new OrganizationSummary(
						organization.id(),
						organization.slug(),
						organization.name(),
						organization.version(),
						organization.contentHash()),
				new CatalogCounts(
						snapshot.employees().size(),
						Math.toIntExact(activeEmployees),
						snapshot.teams().size(),
						snapshot.roles().size(),
						snapshot.applications().size(),
						snapshot.permissions().size(),
						snapshot.capabilities().size(),
						snapshot.workflows().size()),
				workflows);
	}

	private static String ownerName(OrganizationSnapshot snapshot, java.util.UUID ownerEmployeeId) {
		if (ownerEmployeeId == null) {
			return null;
		}
		var owner = snapshot.employees().get(ownerEmployeeId);
		return owner == null ? null : owner.name();
	}

	private static int criticalityRank(com.roleimpact.shared.model.WorkflowCriticality criticality) {
		return switch (criticality) {
			case CRITICAL -> 0;
			case HIGH -> 1;
			case MEDIUM -> 2;
			case LOW -> 3;
		};
	}
}
