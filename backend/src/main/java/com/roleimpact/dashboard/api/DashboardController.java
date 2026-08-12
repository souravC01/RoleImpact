package com.roleimpact.dashboard.api;

import com.roleimpact.dashboard.application.DashboardQueryService;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {

	private final DashboardQueryService dashboardQueryService;

	public DashboardController(DashboardQueryService dashboardQueryService) {
		this.dashboardQueryService = dashboardQueryService;
	}

	@GetMapping
	public DashboardResponse getDashboard(
			@RequestParam(name = "organization", defaultValue = "harborline-commerce") String organizationSlug) {
		return dashboardQueryService.getDashboard(organizationSlug);
	}
}
