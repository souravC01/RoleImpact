package com.roleimpact.workspace.editor.persistence;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.roleimpact.workspace.editor.api.DraftCatalogResource;
import com.roleimpact.workspace.editor.api.DraftCatalogResource.MemberItem;
import com.roleimpact.workspace.editor.api.DraftCatalogResource.RoleItem;
import com.roleimpact.workspace.editor.api.DraftCatalogResource.TeamItem;
import com.roleimpact.workspace.editor.api.DraftCatalogResource.WorkflowRequirementItem;
import com.roleimpact.workspace.editor.api.MemberRequest;
import com.roleimpact.workspace.editor.api.RoleRequest;
import com.roleimpact.workspace.editor.api.TeamRequest;
import com.roleimpact.workspace.editor.api.QuickWorkflowRequest;
import com.roleimpact.workspace.editor.api.WorkflowRequirementRequest;
import com.roleimpact.workspace.editor.api.DraftCatalogResource.WorkflowItem;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class DraftCatalogRepository {

	private final JdbcClient jdbcClient;

	public DraftCatalogRepository(JdbcClient jdbcClient) {
		this.jdbcClient = jdbcClient;
	}

	public Optional<String> findWorkspaceStatus(UUID workspaceId) {
		return jdbcClient.sql("SELECT workspace_status FROM organizations WHERE id = :workspaceId")
				.param("workspaceId", workspaceId)
				.query(String.class)
				.optional();
	}

	public DraftCatalogResource findCatalog(UUID workspaceId) {
		List<TeamItem> teams = jdbcClient.sql("""
				SELECT t.id, t.name, t.department, COUNT(e.id) AS member_count
				FROM teams t
				LEFT JOIN employees e ON e.team_id = t.id
				WHERE t.organization_id = :workspaceId
				GROUP BY t.id, t.name, t.department
				ORDER BY t.name, t.id
				""").param("workspaceId", workspaceId)
				.query((rs, row) -> new TeamItem(
						rs.getObject("id", UUID.class), rs.getString("name"),
						rs.getString("department"), rs.getInt("member_count")))
				.list();

		Map<UUID, Set<UUID>> assignments = new LinkedHashMap<>();
		jdbcClient.sql("""
				SELECT er.employee_id, er.role_id
				FROM employee_roles er
				JOIN employees e ON e.id = er.employee_id
				WHERE e.organization_id = :workspaceId
				ORDER BY er.employee_id, er.role_id
				""").param("workspaceId", workspaceId)
				.query((rs, row) -> new Assignment(
						rs.getObject("employee_id", UUID.class), rs.getObject("role_id", UUID.class)))
				.list()
				.forEach(assignment -> assignments
						.computeIfAbsent(assignment.memberId(), ignored -> new LinkedHashSet<>())
						.add(assignment.roleId()));

		List<MemberItem> members = jdbcClient.sql("""
				SELECT id, team_id, employee_no, name, email, status, region, shift
				FROM employees
				WHERE organization_id = :workspaceId
				ORDER BY name, id
				""").param("workspaceId", workspaceId)
				.query((rs, row) -> {
					UUID id = rs.getObject("id", UUID.class);
					return new MemberItem(
							id,
							rs.getObject("team_id", UUID.class),
							rs.getString("employee_no"),
							rs.getString("name"),
							rs.getString("email"),
							rs.getString("status"),
							rs.getString("region"),
							rs.getString("shift"),
							assignments.getOrDefault(id, Set.of()));
				})
				.list();

		List<RoleItem> roles = jdbcClient.sql("""
				SELECT r.id, r.name, r.description, r.sensitivity, r.owner_employee_id,
				       COUNT(er.employee_id) AS member_count
				FROM roles r
				LEFT JOIN employee_roles er ON er.role_id = r.id
				WHERE r.organization_id = :workspaceId
				GROUP BY r.id, r.name, r.description, r.sensitivity, r.owner_employee_id
				ORDER BY r.name, r.id
				""").param("workspaceId", workspaceId)
				.query((rs, row) -> new RoleItem(
						rs.getObject("id", UUID.class),
						rs.getString("name"),
						rs.getString("description"),
						rs.getString("sensitivity"),
						rs.getObject("owner_employee_id", UUID.class),
						rs.getInt("member_count")))
				.list();

		List<WorkflowRow> workflowRows = jdbcClient.sql("""
				SELECT w.id AS workflow_id, w.name AS workflow_name, w.criticality,
				       ws.id AS step_id, ws.name AS step_name, ws.position,
				       ws.minimum_actors, ws.resilience_target, ws.required_department,
				       ws.required_region, ws.required_shift, rp.role_id,
				       COALESCE(a.category = 'Business Workflow', FALSE) AS quick_managed
				FROM workflows w
				LEFT JOIN workflow_steps ws ON ws.workflow_id = w.id
				LEFT JOIN applications a ON a.id = ws.required_application_id
				LEFT JOIN capability_permissions cp ON cp.capability_id = ws.required_capability_id
				LEFT JOIN role_permissions rp ON rp.permission_id = cp.permission_id
				WHERE w.organization_id = :workspaceId
				ORDER BY w.name, w.id, ws.position, ws.id, rp.role_id
				""").param("workspaceId", workspaceId)
				.query((rs, row) -> new WorkflowRow(
						rs.getObject("workflow_id", UUID.class), rs.getString("workflow_name"),
						rs.getString("criticality"), rs.getObject("step_id", UUID.class),
						rs.getString("step_name"), rs.getInt("position"),
						rs.getInt("minimum_actors"), rs.getInt("resilience_target"),
						rs.getString("required_department"), rs.getString("required_region"),
						rs.getString("required_shift"), rs.getObject("role_id", UUID.class),
						rs.getBoolean("quick_managed")))
				.list();
		Map<UUID, WorkflowAccumulator> workflowAccumulators = new LinkedHashMap<>();
		for (WorkflowRow row : workflowRows) {
			WorkflowAccumulator workflow = workflowAccumulators.computeIfAbsent(row.workflowId(),
					ignored -> new WorkflowAccumulator(row.workflowId(), row.workflowName(), row.criticality()));
			workflow.quickManaged |= row.quickManaged();
			if (row.stepId() == null) continue;
			RequirementAccumulator requirement = workflow.requirements.computeIfAbsent(row.stepId(),
					ignored -> new RequirementAccumulator(row));
			if (row.roleId() != null) requirement.roleIds.add(row.roleId());
		}
		List<WorkflowItem> workflows = workflowAccumulators.values().stream()
				.map(WorkflowAccumulator::toItem)
				.toList();

		return new DraftCatalogResource(workspaceId, teams, members, roles, workflows);
	}

	public UUID insertTeam(UUID workspaceId, TeamRequest request) {
		UUID id = UUID.randomUUID();
		jdbcClient.sql("""
				INSERT INTO teams (id, organization_id, name, department)
				VALUES (:id, :workspaceId, :name, :department)
				""").param("id", id).param("workspaceId", workspaceId)
				.param("name", request.name().trim()).param("department", request.department().trim()).update();
		return id;
	}

	public boolean teamExists(UUID workspaceId, UUID teamId) {
		return exists("teams", workspaceId, teamId);
	}

	public void updateTeam(UUID workspaceId, UUID teamId, TeamRequest request) {
		jdbcClient.sql("""
				UPDATE teams SET name = :name, department = :department
				WHERE organization_id = :workspaceId AND id = :teamId
				""").param("name", request.name().trim()).param("department", request.department().trim())
				.param("workspaceId", workspaceId).param("teamId", teamId).update();
	}

	public int countTeamMembers(UUID workspaceId, UUID teamId) {
		return jdbcClient.sql("""
				SELECT COUNT(*) FROM employees WHERE organization_id = :workspaceId AND team_id = :teamId
				""").param("workspaceId", workspaceId).param("teamId", teamId).query(Integer.class).single();
	}

	public void deleteTeam(UUID workspaceId, UUID teamId) {
		jdbcClient.sql("DELETE FROM teams WHERE organization_id = :workspaceId AND id = :teamId")
				.param("workspaceId", workspaceId).param("teamId", teamId).update();
	}

	public UUID insertMember(UUID workspaceId, MemberRequest request) {
		UUID id = UUID.randomUUID();
		jdbcClient.sql("""
				INSERT INTO employees (
				    id, organization_id, team_id, employee_no, name, email, status, region, shift
				) VALUES (
				    :id, :workspaceId, :teamId, :employeeNumber, :name, :email, :status, :region, :shift
				)
				""").param("id", id).param("workspaceId", workspaceId).param("teamId", request.teamId())
				.param("employeeNumber", nullableEmployeeNumber(request.employeeNumber()))
				.param("name", request.name().trim())
				.param("email", nullableEmail(request.email())).param("status", request.status().name())
				.param("region", request.region().name()).param("shift", request.shift().name()).update();
		return id;
	}

	public boolean memberExists(UUID workspaceId, UUID memberId) {
		return exists("employees", workspaceId, memberId);
	}

	public void updateMember(UUID workspaceId, UUID memberId, MemberRequest request) {
		jdbcClient.sql("""
				UPDATE employees
				SET team_id = :teamId, employee_no = :employeeNumber, name = :name,
				    email = :email, status = :status, region = :region, shift = :shift
				WHERE organization_id = :workspaceId AND id = :memberId
				""").param("teamId", request.teamId())
				.param("employeeNumber", nullableEmployeeNumber(request.employeeNumber()))
				.param("name", request.name().trim()).param("email", nullableEmail(request.email()))
				.param("status", request.status().name()).param("region", request.region().name())
				.param("shift", request.shift().name()).param("workspaceId", workspaceId)
				.param("memberId", memberId).update();
	}

	public void deleteMember(UUID workspaceId, UUID memberId) {
		jdbcClient.sql("UPDATE teams SET manager_employee_id = NULL WHERE organization_id = :workspaceId AND manager_employee_id = :memberId")
				.param("workspaceId", workspaceId).param("memberId", memberId).update();
		jdbcClient.sql("UPDATE roles SET owner_employee_id = NULL WHERE organization_id = :workspaceId AND owner_employee_id = :memberId")
				.param("workspaceId", workspaceId).param("memberId", memberId).update();
		jdbcClient.sql("UPDATE applications SET owner_employee_id = NULL WHERE organization_id = :workspaceId AND owner_employee_id = :memberId")
				.param("workspaceId", workspaceId).param("memberId", memberId).update();
		jdbcClient.sql("UPDATE workflows SET owner_employee_id = NULL WHERE organization_id = :workspaceId AND owner_employee_id = :memberId")
				.param("workspaceId", workspaceId).param("memberId", memberId).update();
		jdbcClient.sql("DELETE FROM employee_roles WHERE employee_id = :memberId")
				.param("memberId", memberId).update();
		jdbcClient.sql("DELETE FROM employees WHERE organization_id = :workspaceId AND id = :memberId")
				.param("workspaceId", workspaceId).param("memberId", memberId).update();
	}

	public UUID insertRole(UUID workspaceId, RoleRequest request) {
		UUID id = UUID.randomUUID();
		jdbcClient.sql("""
				INSERT INTO roles (id, organization_id, name, description, sensitivity, owner_employee_id)
				VALUES (:id, :workspaceId, :name, :description, :sensitivity, :ownerMemberId)
				""").param("id", id).param("workspaceId", workspaceId).param("name", request.name().trim())
				.param("description", request.description().trim()).param("sensitivity", request.sensitivity().name())
				.param("ownerMemberId", request.ownerMemberId()).update();
		return id;
	}

	public boolean roleExists(UUID workspaceId, UUID roleId) {
		return exists("roles", workspaceId, roleId);
	}

	public void updateRole(UUID workspaceId, UUID roleId, RoleRequest request) {
		jdbcClient.sql("""
				UPDATE roles
				SET name = :name, description = :description, sensitivity = :sensitivity,
				    owner_employee_id = :ownerMemberId
				WHERE organization_id = :workspaceId AND id = :roleId
				""").param("name", request.name().trim()).param("description", request.description().trim())
				.param("sensitivity", request.sensitivity().name()).param("ownerMemberId", request.ownerMemberId())
				.param("workspaceId", workspaceId).param("roleId", roleId).update();
	}

	public void deleteRole(UUID workspaceId, UUID roleId) {
		jdbcClient.sql("DELETE FROM employee_roles WHERE role_id = :roleId").param("roleId", roleId).update();
		jdbcClient.sql("DELETE FROM role_permissions WHERE role_id = :roleId").param("roleId", roleId).update();
		jdbcClient.sql("DELETE FROM roles WHERE organization_id = :workspaceId AND id = :roleId")
				.param("workspaceId", workspaceId).param("roleId", roleId).update();
	}

	public int countWorkflowsForRole(UUID workspaceId, UUID roleId) {
		return jdbcClient.sql("""
				SELECT COUNT(DISTINCT w.id)
				FROM workflows w
				JOIN workflow_steps ws ON ws.workflow_id = w.id
				JOIN capability_permissions cp ON cp.capability_id = ws.required_capability_id
				JOIN role_permissions rp ON rp.permission_id = cp.permission_id
				WHERE w.organization_id = :workspaceId AND rp.role_id = :roleId
				""").param("workspaceId", workspaceId).param("roleId", roleId)
				.query(Integer.class).single();
	}

	public int countMatchingRoles(UUID workspaceId, Set<UUID> roleIds) {
		if (roleIds.isEmpty()) return 0;
		return jdbcClient.sql("SELECT COUNT(*) FROM roles WHERE organization_id = :workspaceId AND id IN (:roleIds)")
				.param("workspaceId", workspaceId).param("roleIds", roleIds).query(Integer.class).single();
	}

	public void replaceAssignments(UUID memberId, Set<UUID> roleIds) {
		jdbcClient.sql("DELETE FROM employee_roles WHERE employee_id = :memberId").param("memberId", memberId).update();
		for (UUID roleId : roleIds) {
			jdbcClient.sql("""
					INSERT INTO employee_roles (employee_id, role_id, assigned_at, assigned_by)
					VALUES (:memberId, :roleId, CURRENT_TIMESTAMP, 'workspace editor')
					""").param("memberId", memberId).param("roleId", roleId).update();
		}
	}

	public boolean assignmentExists(UUID workspaceId, UUID memberId, UUID roleId) {
		return jdbcClient.sql("""
				SELECT EXISTS (
				    SELECT 1 FROM employee_roles er
				    JOIN employees e ON e.id = er.employee_id
				    JOIN roles r ON r.id = er.role_id
				    WHERE e.organization_id = :workspaceId
				      AND r.organization_id = :workspaceId
				      AND er.employee_id = :memberId
				      AND er.role_id = :roleId
				)
				""").param("workspaceId", workspaceId).param("memberId", memberId).param("roleId", roleId)
				.query(Boolean.class).single();
	}

	public UUID insertQuickWorkflow(UUID workspaceId, QuickWorkflowRequest request) {
		UUID workflowId = UUID.randomUUID();
		String name = request.name().trim();
		jdbcClient.sql("INSERT INTO workflows (id, organization_id, name, criticality) VALUES (:id, :workspaceId, :name, :criticality)")
				.param("id", workflowId).param("workspaceId", workspaceId).param("name", name)
				.param("criticality", request.criticality().name()).update();
		insertWorkflowRequirement(workspaceId, workflowId, new WorkflowRequirementRequest(
				request.requirementName(), request.roleId(), request.minimumActors(), request.resilienceTarget()));
		return workflowId;
	}

	public UUID insertWorkflowRequirement(
			UUID workspaceId,
			UUID workflowId,
			WorkflowRequirementRequest request) {
		UUID applicationId = UUID.randomUUID();
		UUID resourceId = UUID.randomUUID();
		UUID permissionId = UUID.randomUUID();
		UUID capabilityId = UUID.randomUUID();
		UUID stepId = UUID.randomUUID();
		String workflowName = jdbcClient.sql("SELECT name FROM workflows WHERE organization_id = :workspaceId AND id = :workflowId")
				.param("workspaceId", workspaceId).param("workflowId", workflowId).query(String.class).single();
		String workflowCriticality = jdbcClient.sql("SELECT criticality FROM workflows WHERE organization_id = :workspaceId AND id = :workflowId")
				.param("workspaceId", workspaceId).param("workflowId", workflowId).query(String.class).single();
		String requirementName = request.name().trim();
		int position = jdbcClient.sql("SELECT COALESCE(MAX(position), 0) + 1 FROM workflow_steps WHERE workflow_id = :workflowId")
				.param("workflowId", workflowId).query(Integer.class).single();
		String action = limited(slugAction(workflowName) + "." + slugAction(requirementName) + ".execute", 120);
		String stepKey = (slugAction(requirementName).replace('.', '_') + "_" + position);
		if (stepKey.length() > 80) stepKey = stepKey.substring(0, 80);

		jdbcClient.sql("INSERT INTO applications (id, organization_id, name, category) VALUES (:id, :workspaceId, :name, 'Business Workflow')")
				.param("id", applicationId).param("workspaceId", workspaceId)
				.param("name", limited(workflowName + " · " + requirementName + " [" + position + "]", 160)).update();
		jdbcClient.sql("INSERT INTO resources (id, application_id, name, resource_type) VALUES (:id, :applicationId, :name, 'WORKFLOW')")
				.param("id", resourceId).param("applicationId", applicationId).param("name", requirementName).update();
		jdbcClient.sql("""
				INSERT INTO permissions (id, organization_id, application_id, resource_id, action, sensitivity)
				VALUES (:id, :workspaceId, :applicationId, :resourceId, :action, :sensitivity)
				""").param("id", permissionId).param("workspaceId", workspaceId).param("applicationId", applicationId)
				.param("resourceId", resourceId).param("action", action).param("sensitivity", workflowCriticality).update();
		jdbcClient.sql("INSERT INTO role_permissions (role_id, permission_id) VALUES (:roleId, :permissionId)")
				.param("roleId", request.roleId()).param("permissionId", permissionId).update();
		jdbcClient.sql("INSERT INTO capabilities (id, organization_id, name, description) VALUES (:id, :workspaceId, :name, :description)")
				.param("id", capabilityId).param("workspaceId", workspaceId)
				.param("name", limited(workflowName + ": " + requirementName, 160))
				.param("description", "Capability generated by the quick workflow builder").update();
		jdbcClient.sql("INSERT INTO capability_permissions (capability_id, permission_id) VALUES (:capabilityId, :permissionId)")
				.param("capabilityId", capabilityId).param("permissionId", permissionId).update();
		jdbcClient.sql("""
				INSERT INTO workflow_steps (
				    id, workflow_id, step_key, name, position, required_capability_id,
				    minimum_actors, resilience_target, required_application_id
				) VALUES (
				    :id, :workflowId, :stepKey, :name, :position, :capabilityId,
				    :minimumActors, :resilienceTarget, :applicationId
				)
				""").param("id", stepId).param("workflowId", workflowId).param("stepKey", stepKey)
				.param("name", requirementName).param("position", position)
				.param("capabilityId", capabilityId).param("minimumActors", request.minimumActors())
				.param("resilienceTarget", request.resilienceTarget())
				.param("applicationId", applicationId).update();
		return stepId;
	}

	public void deleteWorkflow(UUID workspaceId, UUID workflowId) {
		List<GeneratedBundle> generatedBundles = jdbcClient.sql("""
				SELECT DISTINCT ws.required_capability_id AS capability_id,
				       p.id AS permission_id, p.application_id
				FROM workflow_steps ws
				JOIN applications a ON a.id = ws.required_application_id AND a.category = 'Business Workflow'
				JOIN capability_permissions cp ON cp.capability_id = ws.required_capability_id
				JOIN permissions p ON p.id = cp.permission_id AND p.application_id = a.id
				WHERE ws.workflow_id = :workflowId
				""").param("workflowId", workflowId)
				.query((rs, row) -> new GeneratedBundle(
						rs.getObject("capability_id", UUID.class),
						rs.getObject("permission_id", UUID.class),
						rs.getObject("application_id", UUID.class)))
				.list();
		jdbcClient.sql("""
				DELETE FROM workflow_step_constraints
				WHERE workflow_step_id IN (SELECT id FROM workflow_steps WHERE workflow_id = :workflowId)
				""").param("workflowId", workflowId).update();
		jdbcClient.sql("DELETE FROM workflow_steps WHERE workflow_id = :workflowId")
				.param("workflowId", workflowId).update();
		jdbcClient.sql("DELETE FROM workflow_constraints WHERE workflow_id = :workflowId")
				.param("workflowId", workflowId).update();
		jdbcClient.sql("DELETE FROM workflows WHERE organization_id = :workspaceId AND id = :workflowId")
				.param("workspaceId", workspaceId).param("workflowId", workflowId).update();
		for (GeneratedBundle bundle : generatedBundles) {
			jdbcClient.sql("DELETE FROM capability_permissions WHERE capability_id = :capabilityId")
					.param("capabilityId", bundle.capabilityId()).update();
			jdbcClient.sql("DELETE FROM capabilities WHERE organization_id = :workspaceId AND id = :capabilityId")
					.param("workspaceId", workspaceId).param("capabilityId", bundle.capabilityId()).update();
			jdbcClient.sql("DELETE FROM role_permissions WHERE permission_id = :permissionId")
					.param("permissionId", bundle.permissionId()).update();
			jdbcClient.sql("DELETE FROM permissions WHERE organization_id = :workspaceId AND id = :permissionId")
					.param("workspaceId", workspaceId).param("permissionId", bundle.permissionId()).update();
		}
		generatedBundles.stream().map(GeneratedBundle::applicationId).distinct().forEach(applicationId -> {
			jdbcClient.sql("DELETE FROM resources WHERE application_id = :applicationId")
					.param("applicationId", applicationId).update();
			jdbcClient.sql("DELETE FROM applications WHERE organization_id = :workspaceId AND id = :applicationId")
					.param("workspaceId", workspaceId).param("applicationId", applicationId).update();
		});
	}

	public boolean workflowExists(UUID workspaceId, UUID workflowId) {
		return exists("workflows", workspaceId, workflowId);
	}

	public boolean quickWorkflowExists(UUID workspaceId, UUID workflowId) {
		return jdbcClient.sql("""
				SELECT EXISTS (
				    SELECT 1 FROM workflows w
				    JOIN workflow_steps ws ON ws.workflow_id = w.id
				    JOIN applications a ON a.id = ws.required_application_id
				    WHERE w.organization_id = :workspaceId AND w.id = :workflowId
				      AND a.category = 'Business Workflow'
				)
				""").param("workspaceId", workspaceId).param("workflowId", workflowId)
				.query(Boolean.class).single();
	}

	public void touchWorkspace(UUID workspaceId) {
		jdbcClient.sql("UPDATE organizations SET updated_at = CURRENT_TIMESTAMP WHERE id = :workspaceId")
				.param("workspaceId", workspaceId).update();
	}

	private boolean exists(String table, UUID workspaceId, UUID entityId) {
		String sql = "SELECT EXISTS (SELECT 1 FROM " + table + " WHERE organization_id = :workspaceId AND id = :entityId)";
		return jdbcClient.sql(sql).param("workspaceId", workspaceId).param("entityId", entityId)
				.query(Boolean.class).single();
	}

	private String nullableEmployeeNumber(String employeeNumber) {
		return employeeNumber == null || employeeNumber.isBlank() ? null : employeeNumber.trim();
	}

	private String nullableEmail(String email) {
		return email == null || email.isBlank() ? null : email.trim().toLowerCase();
	}

	private String slugAction(String value) {
		return value.toLowerCase().replaceAll("[^a-z0-9]+", ".").replaceAll("(^\\.|\\.$)", "");
	}

	private String limited(String value, int maxLength) {
		return value.length() <= maxLength ? value : value.substring(0, maxLength);
	}

	private record Assignment(UUID memberId, UUID roleId) {
	}

	private record GeneratedBundle(UUID capabilityId, UUID permissionId, UUID applicationId) {
	}

	private record WorkflowRow(
			UUID workflowId, String workflowName, String criticality,
			UUID stepId, String stepName, int position, int minimumActors, int resilienceTarget,
			String requiredDepartment, String requiredRegion, String requiredShift,
			UUID roleId, boolean quickManaged) {
	}

	private static final class WorkflowAccumulator {
		private final UUID id;
		private final String name;
		private final String criticality;
		private final Map<UUID, RequirementAccumulator> requirements = new LinkedHashMap<>();
		private boolean quickManaged;

		private WorkflowAccumulator(UUID id, String name, String criticality) {
			this.id = id;
			this.name = name;
			this.criticality = criticality;
		}

		private WorkflowItem toItem() {
			return new WorkflowItem(id, name, criticality,
					requirements.values().stream().map(RequirementAccumulator::toItem).toList(),
					quickManaged);
		}
	}

	private static final class RequirementAccumulator {
		private final WorkflowRow row;
		private final Set<UUID> roleIds = new LinkedHashSet<>();

		private RequirementAccumulator(WorkflowRow row) {
			this.row = row;
		}

		private WorkflowRequirementItem toItem() {
			return new WorkflowRequirementItem(row.stepId(), row.stepName(), row.position(),
					row.minimumActors(), row.resilienceTarget(), row.requiredDepartment(),
					row.requiredRegion(), row.requiredShift(), roleIds);
		}
	}
}
