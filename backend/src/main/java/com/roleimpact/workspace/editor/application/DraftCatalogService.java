package com.roleimpact.workspace.editor.application;

import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

import com.roleimpact.workspace.application.WorkspaceNotFoundException;
import com.roleimpact.workspace.editor.api.DraftCatalogResource;
import com.roleimpact.workspace.editor.api.MemberRequest;
import com.roleimpact.workspace.editor.api.RoleAssignmentRequest;
import com.roleimpact.workspace.editor.api.RoleRequest;
import com.roleimpact.workspace.editor.api.TeamRequest;
import com.roleimpact.workspace.editor.api.QuickWorkflowRequest;
import com.roleimpact.workspace.editor.api.WorkflowRequirementRequest;
import com.roleimpact.workspace.editor.persistence.DraftCatalogRepository;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DraftCatalogService {

	private final DraftCatalogRepository repository;

	public DraftCatalogService(DraftCatalogRepository repository) {
		this.repository = repository;
	}

	@Transactional(readOnly = true)
	public DraftCatalogResource get(UUID workspaceId) {
		requireWorkspace(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource createTeam(UUID workspaceId, TeamRequest request) {
		requireDraft(workspaceId);
		mutate(() -> repository.insertTeam(workspaceId, request), "A team with this name already exists");
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource deleteTeam(UUID workspaceId, UUID teamId) {
		requireDraft(workspaceId);
		requireTeam(workspaceId, teamId);
		if (repository.countTeamMembers(workspaceId, teamId) > 0) {
			throw new DraftCatalogConflictException("Move or remove this team's members before deleting the team");
		}
		repository.deleteTeam(workspaceId, teamId);
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource updateTeam(UUID workspaceId, UUID teamId, TeamRequest request) {
		requireDraft(workspaceId);
		requireTeam(workspaceId, teamId);
		mutate(() -> { repository.updateTeam(workspaceId, teamId, request); return teamId; },
				"A team with this name already exists");
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource createMember(UUID workspaceId, MemberRequest request) {
		requireDraft(workspaceId);
		requireTeam(workspaceId, request.teamId());
		mutate(() -> repository.insertMember(workspaceId, request),
				"Employee number and email must be unique within this workspace");
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource deleteMember(UUID workspaceId, UUID memberId) {
		requireDraft(workspaceId);
		requireMember(workspaceId, memberId);
		repository.deleteMember(workspaceId, memberId);
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource updateMember(UUID workspaceId, UUID memberId, MemberRequest request) {
		requireDraft(workspaceId);
		requireMember(workspaceId, memberId);
		requireTeam(workspaceId, request.teamId());
		mutate(() -> { repository.updateMember(workspaceId, memberId, request); return memberId; },
				"Employee number and email must be unique within this workspace");
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource createRole(UUID workspaceId, RoleRequest request) {
		requireDraft(workspaceId);
		if (request.ownerMemberId() != null) requireMember(workspaceId, request.ownerMemberId());
		requireHolders(workspaceId, request.holderMemberIds());
		UUID roleId = mutate(() -> repository.insertRole(workspaceId, request), "A role with this name already exists");
		if (request.holderMemberIds() != null) repository.replaceRoleHolders(roleId, request.holderMemberIds());
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource deleteRole(UUID workspaceId, UUID roleId) {
		requireDraft(workspaceId);
		requireRole(workspaceId, roleId);
		if (repository.countWorkflowsForRole(workspaceId, roleId) > 0) {
			throw new DraftCatalogConflictException("Delete or reconfigure workflows that depend on this role first");
		}
		repository.deleteRole(workspaceId, roleId);
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource updateRole(UUID workspaceId, UUID roleId, RoleRequest request) {
		requireDraft(workspaceId);
		requireRole(workspaceId, roleId);
		if (request.ownerMemberId() != null) requireMember(workspaceId, request.ownerMemberId());
		requireHolders(workspaceId, request.holderMemberIds());
		mutate(() -> { repository.updateRole(workspaceId, roleId, request); return roleId; },
				"A role with this name already exists");
		if (request.holderMemberIds() != null) repository.replaceRoleHolders(roleId, request.holderMemberIds());
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource replaceMemberRoles(
			UUID workspaceId,
			UUID memberId,
			RoleAssignmentRequest request) {
		requireDraft(workspaceId);
		requireMember(workspaceId, memberId);
		Set<UUID> roleIds = request.roleIds();
		if (repository.countMatchingRoles(workspaceId, roleIds) != roleIds.size()) {
			throw new DraftCatalogNotFoundException("Role", roleIds.stream()
					.filter(roleId -> !repository.roleExists(workspaceId, roleId))
					.findFirst().orElseThrow());
		}
		repository.replaceAssignments(memberId, roleIds);
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource createQuickWorkflow(UUID workspaceId, QuickWorkflowRequest request) {
		requireDraft(workspaceId);
		requireRole(workspaceId, request.roleId());
		requireCoverage(request.minimumActors(), request.resilienceTarget());
		mutate(() -> repository.insertQuickWorkflow(workspaceId, request),
				"This workflow already exists. Open it and add another role requirement instead");
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource addWorkflowRequirement(
			UUID workspaceId,
			UUID workflowId,
			WorkflowRequirementRequest request) {
		requireDraft(workspaceId);
		if (!repository.workflowExists(workspaceId, workflowId)) {
			throw new DraftCatalogNotFoundException("Workflow", workflowId);
		}
		if (!repository.quickWorkflowExists(workspaceId, workflowId)) {
			throw new DraftCatalogConflictException("The example workflow is read-only for now; clone its pattern into a custom workflow to edit requirements");
		}
		requireRole(workspaceId, request.roleId());
		requireCoverage(request.minimumActors(), request.resilienceTarget());
		mutate(() -> repository.insertWorkflowRequirement(workspaceId, workflowId, request),
				"This responsibility already exists in the workflow");
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	@Transactional
	public DraftCatalogResource deleteWorkflow(UUID workspaceId, UUID workflowId) {
		requireDraft(workspaceId);
		if (!repository.workflowExists(workspaceId, workflowId)) {
			throw new DraftCatalogNotFoundException("Workflow", workflowId);
		}
		repository.deleteWorkflow(workspaceId, workflowId);
		touch(workspaceId);
		return repository.findCatalog(workspaceId);
	}

	private void requireWorkspace(UUID workspaceId) {
		repository.findWorkspaceStatus(workspaceId)
				.orElseThrow(() -> new WorkspaceNotFoundException(workspaceId));
	}

	private void requireDraft(UUID workspaceId) {
		String status = repository.findWorkspaceStatus(workspaceId)
				.orElseThrow(() -> new WorkspaceNotFoundException(workspaceId));
		if (!"DRAFT".equals(status)) throw new PublishedWorkspaceMutationException();
	}

	private void requireTeam(UUID workspaceId, UUID teamId) {
		if (!repository.teamExists(workspaceId, teamId)) {
			throw new DraftCatalogNotFoundException("Team", teamId);
		}
	}

	private void requireMember(UUID workspaceId, UUID memberId) {
		if (!repository.memberExists(workspaceId, memberId)) {
			throw new DraftCatalogNotFoundException("Member", memberId);
		}
	}

	private void requireRole(UUID workspaceId, UUID roleId) {
		if (!repository.roleExists(workspaceId, roleId)) {
			throw new DraftCatalogNotFoundException("Role", roleId);
		}
	}

	private void requireHolders(UUID workspaceId, Set<UUID> holderMemberIds) {
		if (holderMemberIds == null || repository.countMatchingMembers(workspaceId, holderMemberIds) == holderMemberIds.size()) return;
		UUID unknownMemberId = holderMemberIds.stream()
				.filter(memberId -> !repository.memberExists(workspaceId, memberId))
				.findFirst()
				.orElseThrow();
		throw new DraftCatalogNotFoundException("Member", unknownMemberId);
	}

	private void requireCoverage(int minimumActors, int resilienceTarget) {
		if (resilienceTarget < minimumActors) {
			throw new DraftCatalogConflictException("Healthy coverage cannot be lower than the minimum people required");
		}
	}

	private UUID mutate(Supplier<UUID> mutation, String conflictMessage) {
		try {
			return mutation.get();
		}
		catch (DataIntegrityViolationException exception) {
			throw new DraftCatalogConflictException(conflictMessage);
		}
	}

	private void touch(UUID workspaceId) {
		repository.touchWorkspace(workspaceId);
	}
}
