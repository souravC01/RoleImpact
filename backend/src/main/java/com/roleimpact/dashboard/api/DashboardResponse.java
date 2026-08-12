package com.roleimpact.dashboard.api;

import java.util.List;
import java.util.UUID;

import com.roleimpact.shared.model.WorkflowCriticality;

public record DashboardResponse(
		OrganizationSummary organization,
		CatalogCounts counts,
		List<WorkflowSummary> workflows) {

	public DashboardResponse {
		workflows = List.copyOf(workflows);
	}

	public record OrganizationSummary(
			UUID id,
			String slug,
			String name,
			int baselineVersion,
			String contentHash) {
	}

	public record CatalogCounts(
			int employees,
			int activeEmployees,
			int teams,
			int roles,
			int applications,
			int permissions,
			int capabilities,
			int workflows) {
	}

	public record WorkflowSummary(
			UUID id,
			String name,
			WorkflowCriticality criticality,
			int stepCount,
			String ownerName) {
	}
}
