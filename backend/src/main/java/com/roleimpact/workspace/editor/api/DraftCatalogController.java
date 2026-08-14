package com.roleimpact.workspace.editor.api;

import java.util.UUID;

import com.roleimpact.workspace.editor.application.DraftCatalogService;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/catalog")
public class DraftCatalogController {

	private final DraftCatalogService service;

	public DraftCatalogController(DraftCatalogService service) {
		this.service = service;
	}

	@GetMapping
	public DraftCatalogResource get(@PathVariable UUID workspaceId) {
		return service.get(workspaceId);
	}

	@PostMapping("/teams")
	public DraftCatalogResource createTeam(
			@PathVariable UUID workspaceId,
			@Valid @RequestBody TeamRequest request) {
		return service.createTeam(workspaceId, request);
	}

	@PutMapping("/teams/{teamId}")
	public DraftCatalogResource updateTeam(@PathVariable UUID workspaceId, @PathVariable UUID teamId,
			@Valid @RequestBody TeamRequest request) {
		return service.updateTeam(workspaceId, teamId, request);
	}

	@DeleteMapping("/teams/{teamId}")
	public DraftCatalogResource deleteTeam(@PathVariable UUID workspaceId, @PathVariable UUID teamId) {
		return service.deleteTeam(workspaceId, teamId);
	}

	@PostMapping("/members")
	public DraftCatalogResource createMember(
			@PathVariable UUID workspaceId,
			@Valid @RequestBody MemberRequest request) {
		return service.createMember(workspaceId, request);
	}

	@PutMapping("/members/{memberId}")
	public DraftCatalogResource updateMember(@PathVariable UUID workspaceId, @PathVariable UUID memberId,
			@Valid @RequestBody MemberRequest request) {
		return service.updateMember(workspaceId, memberId, request);
	}

	@DeleteMapping("/members/{memberId}")
	public DraftCatalogResource deleteMember(@PathVariable UUID workspaceId, @PathVariable UUID memberId) {
		return service.deleteMember(workspaceId, memberId);
	}

	@PostMapping("/roles")
	public DraftCatalogResource createRole(
			@PathVariable UUID workspaceId,
			@Valid @RequestBody RoleRequest request) {
		return service.createRole(workspaceId, request);
	}

	@PutMapping("/roles/{roleId}")
	public DraftCatalogResource updateRole(@PathVariable UUID workspaceId, @PathVariable UUID roleId,
			@Valid @RequestBody RoleRequest request) {
		return service.updateRole(workspaceId, roleId, request);
	}

	@DeleteMapping("/roles/{roleId}")
	public DraftCatalogResource deleteRole(@PathVariable UUID workspaceId, @PathVariable UUID roleId) {
		return service.deleteRole(workspaceId, roleId);
	}

	@PutMapping("/members/{memberId}/roles")
	public DraftCatalogResource replaceMemberRoles(
			@PathVariable UUID workspaceId,
			@PathVariable UUID memberId,
			@Valid @RequestBody RoleAssignmentRequest request) {
		return service.replaceMemberRoles(workspaceId, memberId, request);
	}

	@PostMapping("/workflows/quick")
	public DraftCatalogResource createQuickWorkflow(
			@PathVariable UUID workspaceId,
			@Valid @RequestBody QuickWorkflowRequest request) {
		return service.createQuickWorkflow(workspaceId, request);
	}

	@PostMapping("/workflows/{workflowId}/requirements")
	public DraftCatalogResource addWorkflowRequirement(
			@PathVariable UUID workspaceId,
			@PathVariable UUID workflowId,
			@Valid @RequestBody WorkflowRequirementRequest request) {
		return service.addWorkflowRequirement(workspaceId, workflowId, request);
	}

	@DeleteMapping("/workflows/{workflowId}")
	public DraftCatalogResource deleteWorkflow(
			@PathVariable UUID workspaceId,
			@PathVariable UUID workflowId) {
		return service.deleteWorkflow(workspaceId, workflowId);
	}
}
