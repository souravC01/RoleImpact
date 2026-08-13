package com.roleimpact.workspace.persistence;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.roleimpact.workspace.api.WorkspaceResource;
import com.roleimpact.workspace.api.WorkspaceResource.WorkspaceCounts;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class WorkspaceRepository {

	private static final String WORKSPACE_SELECT = """
			SELECT o.id, o.slug, o.name, o.workspace_status, o.current_version,
			       o.source_template_organization_id, o.created_at, o.updated_at,
			       (SELECT COUNT(*) FROM teams t WHERE t.organization_id = o.id) AS team_count,
			       (SELECT COUNT(*) FROM employees e WHERE e.organization_id = o.id) AS member_count,
			       (SELECT COUNT(*) FROM roles r WHERE r.organization_id = o.id) AS role_count,
			       (SELECT COUNT(*) FROM permissions p WHERE p.organization_id = o.id) AS permission_count,
			       (SELECT COUNT(*) FROM capabilities c WHERE c.organization_id = o.id) AS capability_count,
			       (SELECT COUNT(*) FROM workflows w WHERE w.organization_id = o.id) AS workflow_count
			FROM organizations o
			""";

	private final JdbcClient jdbcClient;

	public WorkspaceRepository(JdbcClient jdbcClient) {
		this.jdbcClient = jdbcClient;
	}

	public List<WorkspaceResource> findAll() {
		return jdbcClient.sql(WORKSPACE_SELECT + " ORDER BY o.created_at, o.id")
				.query(this::mapWorkspace)
				.list();
	}

	public Optional<WorkspaceResource> findById(UUID id) {
		return jdbcClient.sql(WORKSPACE_SELECT + " WHERE o.id = :id")
				.param("id", id)
				.query(this::mapWorkspace)
				.optional();
	}

	public boolean existsBySlug(String slug) {
		return jdbcClient.sql("SELECT EXISTS (SELECT 1 FROM organizations WHERE slug = :slug)")
				.param("slug", slug)
				.query(Boolean.class)
				.single();
	}

	public Optional<String> findStatus(UUID id) {
		return jdbcClient.sql("SELECT workspace_status FROM organizations WHERE id = :id")
				.param("id", id)
				.query(String.class)
				.optional();
	}

	public void insertDraft(UUID id, String slug, String name, UUID sourceTemplateId) {
		jdbcClient.sql("""
				INSERT INTO organizations (
				    id, slug, name, current_version, workspace_status,
				    source_template_organization_id, created_at, updated_at
				) VALUES (
				    :id, :slug, :name, 0, 'DRAFT', :sourceTemplateId,
				    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
				)
				""")
				.param("id", id)
				.param("slug", slug)
				.param("name", name)
				.param("sourceTemplateId", sourceTemplateId)
				.update();
	}

	public void cloneCatalog(UUID sourceId, UUID targetId) {
		jdbcClient.sql("""
				CREATE TEMP TABLE workspace_clone_ids (
				    entity_type VARCHAR(20) NOT NULL,
				    source_id UUID NOT NULL,
				    target_id UUID NOT NULL,
				    PRIMARY KEY (entity_type, source_id)
				) ON COMMIT DROP
				""").update();

		mapIds("team", "teams", "organization_id", sourceId);
		jdbcClient.sql("""
				INSERT INTO teams (id, organization_id, name, department, manager_employee_id)
				SELECT m.target_id, :targetId, t.name, t.department, NULL
				FROM teams t
				JOIN workspace_clone_ids m ON m.entity_type = 'team' AND m.source_id = t.id
				WHERE t.organization_id = :sourceId
				""").param("targetId", targetId).param("sourceId", sourceId).update();

		mapIds("employee", "employees", "organization_id", sourceId);
		jdbcClient.sql("""
				INSERT INTO employees (
				    id, organization_id, team_id, employee_no, name, email, status, region, shift
				)
				SELECT em.target_id, :targetId, tm.target_id, e.employee_no, e.name, e.email,
				       e.status, e.region, e.shift
				FROM employees e
				JOIN workspace_clone_ids em ON em.entity_type = 'employee' AND em.source_id = e.id
				JOIN workspace_clone_ids tm ON tm.entity_type = 'team' AND tm.source_id = e.team_id
				WHERE e.organization_id = :sourceId
				""").param("targetId", targetId).param("sourceId", sourceId).update();
		jdbcClient.sql("""
				UPDATE teams target_team
				SET manager_employee_id = manager_map.target_id
				FROM teams source_team
				JOIN workspace_clone_ids team_map
				  ON team_map.entity_type = 'team' AND team_map.source_id = source_team.id
				JOIN workspace_clone_ids manager_map
				  ON manager_map.entity_type = 'employee'
				 AND manager_map.source_id = source_team.manager_employee_id
				WHERE target_team.id = team_map.target_id
				  AND source_team.organization_id = :sourceId
				""").param("sourceId", sourceId).update();

		mapIds("role", "roles", "organization_id", sourceId);
		jdbcClient.sql("""
				INSERT INTO roles (id, organization_id, name, description, sensitivity, owner_employee_id)
				SELECT rm.target_id, :targetId, r.name, r.description, r.sensitivity, owner_map.target_id
				FROM roles r
				JOIN workspace_clone_ids rm ON rm.entity_type = 'role' AND rm.source_id = r.id
				LEFT JOIN workspace_clone_ids owner_map
				  ON owner_map.entity_type = 'employee' AND owner_map.source_id = r.owner_employee_id
				WHERE r.organization_id = :sourceId
				""").param("targetId", targetId).param("sourceId", sourceId).update();
		jdbcClient.sql("""
				INSERT INTO employee_roles (employee_id, role_id, assigned_at, assigned_by)
				SELECT em.target_id, rm.target_id, er.assigned_at, 'workspace clone'
				FROM employee_roles er
				JOIN workspace_clone_ids em ON em.entity_type = 'employee' AND em.source_id = er.employee_id
				JOIN workspace_clone_ids rm ON rm.entity_type = 'role' AND rm.source_id = er.role_id
				""").update();

		mapIds("application", "applications", "organization_id", sourceId);
		jdbcClient.sql("""
				INSERT INTO applications (id, organization_id, name, category, owner_employee_id)
				SELECT am.target_id, :targetId, a.name, a.category, owner_map.target_id
				FROM applications a
				JOIN workspace_clone_ids am ON am.entity_type = 'application' AND am.source_id = a.id
				LEFT JOIN workspace_clone_ids owner_map
				  ON owner_map.entity_type = 'employee' AND owner_map.source_id = a.owner_employee_id
				WHERE a.organization_id = :sourceId
				""").param("targetId", targetId).param("sourceId", sourceId).update();

		mapIdsThroughOrganization("resource", "resources", "application_id", "applications", sourceId);
		jdbcClient.sql("""
				INSERT INTO resources (id, application_id, name, resource_type)
				SELECT res_map.target_id, app_map.target_id, r.name, r.resource_type
				FROM resources r
				JOIN workspace_clone_ids res_map ON res_map.entity_type = 'resource' AND res_map.source_id = r.id
				JOIN workspace_clone_ids app_map ON app_map.entity_type = 'application' AND app_map.source_id = r.application_id
				""").update();

		mapIds("permission", "permissions", "organization_id", sourceId);
		jdbcClient.sql("""
				INSERT INTO permissions (
				    id, organization_id, application_id, resource_id, action, sensitivity
				)
				SELECT pm.target_id, :targetId, am.target_id, rm.target_id, p.action, p.sensitivity
				FROM permissions p
				JOIN workspace_clone_ids pm ON pm.entity_type = 'permission' AND pm.source_id = p.id
				JOIN workspace_clone_ids am ON am.entity_type = 'application' AND am.source_id = p.application_id
				JOIN workspace_clone_ids rm ON rm.entity_type = 'resource' AND rm.source_id = p.resource_id
				WHERE p.organization_id = :sourceId
				""").param("targetId", targetId).param("sourceId", sourceId).update();
		jdbcClient.sql("""
				INSERT INTO role_permissions (role_id, permission_id)
				SELECT rm.target_id, pm.target_id
				FROM role_permissions rp
				JOIN workspace_clone_ids rm ON rm.entity_type = 'role' AND rm.source_id = rp.role_id
				JOIN workspace_clone_ids pm ON pm.entity_type = 'permission' AND pm.source_id = rp.permission_id
				""").update();

		mapIds("capability", "capabilities", "organization_id", sourceId);
		jdbcClient.sql("""
				INSERT INTO capabilities (id, organization_id, name, description)
				SELECT cm.target_id, :targetId, c.name, c.description
				FROM capabilities c
				JOIN workspace_clone_ids cm ON cm.entity_type = 'capability' AND cm.source_id = c.id
				WHERE c.organization_id = :sourceId
				""").param("targetId", targetId).param("sourceId", sourceId).update();
		jdbcClient.sql("""
				INSERT INTO capability_permissions (capability_id, permission_id)
				SELECT cm.target_id, pm.target_id
				FROM capability_permissions cp
				JOIN workspace_clone_ids cm ON cm.entity_type = 'capability' AND cm.source_id = cp.capability_id
				JOIN workspace_clone_ids pm ON pm.entity_type = 'permission' AND pm.source_id = cp.permission_id
				""").update();

		mapIds("workflow", "workflows", "organization_id", sourceId);
		jdbcClient.sql("""
				INSERT INTO workflows (id, organization_id, name, criticality, owner_employee_id)
				SELECT wm.target_id, :targetId, w.name, w.criticality, owner_map.target_id
				FROM workflows w
				JOIN workspace_clone_ids wm ON wm.entity_type = 'workflow' AND wm.source_id = w.id
				LEFT JOIN workspace_clone_ids owner_map
				  ON owner_map.entity_type = 'employee' AND owner_map.source_id = w.owner_employee_id
				WHERE w.organization_id = :sourceId
				""").param("targetId", targetId).param("sourceId", sourceId).update();

		mapIdsThroughOrganization("workflow_step", "workflow_steps", "workflow_id", "workflows", sourceId);
		jdbcClient.sql("""
				INSERT INTO workflow_steps (
				    id, workflow_id, step_key, name, position, required_capability_id,
				    minimum_actors, resilience_target, required_department, required_region,
				    required_shift, required_application_id
				)
				SELECT sm.target_id, wm.target_id, s.step_key, s.name, s.position, cm.target_id,
				       s.minimum_actors, s.resilience_target, s.required_department, s.required_region,
				       s.required_shift, am.target_id
				FROM workflow_steps s
				JOIN workspace_clone_ids sm ON sm.entity_type = 'workflow_step' AND sm.source_id = s.id
				JOIN workspace_clone_ids wm ON wm.entity_type = 'workflow' AND wm.source_id = s.workflow_id
				JOIN workspace_clone_ids cm ON cm.entity_type = 'capability' AND cm.source_id = s.required_capability_id
				LEFT JOIN workspace_clone_ids am
				  ON am.entity_type = 'application' AND am.source_id = s.required_application_id
				""").update();

		mapIdsThroughOrganization("constraint", "workflow_constraints", "workflow_id", "workflows", sourceId);
		jdbcClient.sql("""
				INSERT INTO workflow_constraints (id, workflow_id, type, parameters)
				SELECT cm.target_id, wm.target_id, c.type, c.parameters
				FROM workflow_constraints c
				JOIN workspace_clone_ids cm ON cm.entity_type = 'constraint' AND cm.source_id = c.id
				JOIN workspace_clone_ids wm ON wm.entity_type = 'workflow' AND wm.source_id = c.workflow_id
				""").update();
		jdbcClient.sql("""
				INSERT INTO workflow_step_constraints (workflow_step_id, constraint_id)
				SELECT sm.target_id, cm.target_id
				FROM workflow_step_constraints sc
				JOIN workspace_clone_ids sm ON sm.entity_type = 'workflow_step' AND sm.source_id = sc.workflow_step_id
				JOIN workspace_clone_ids cm ON cm.entity_type = 'constraint' AND cm.source_id = sc.constraint_id
				""").update();
	}

	private void mapIds(String entityType, String table, String organizationColumn, UUID sourceId) {
		String sql = "INSERT INTO workspace_clone_ids (entity_type, source_id, target_id) "
				+ "SELECT :entityType, id, gen_random_uuid() FROM " + table
				+ " WHERE " + organizationColumn + " = :sourceId";
		jdbcClient.sql(sql)
				.param("entityType", entityType)
				.param("sourceId", sourceId)
				.update();
	}

	private void mapIdsThroughOrganization(
			String entityType,
			String table,
			String parentColumn,
			String parentTable,
			UUID sourceId) {
		String sql = "INSERT INTO workspace_clone_ids (entity_type, source_id, target_id) "
				+ "SELECT :entityType, child.id, gen_random_uuid() FROM " + table + " child "
				+ "JOIN " + parentTable + " parent ON parent.id = child." + parentColumn + " "
				+ "WHERE parent.organization_id = :sourceId";
		jdbcClient.sql(sql)
				.param("entityType", entityType)
				.param("sourceId", sourceId)
				.update();
	}

	private WorkspaceResource mapWorkspace(java.sql.ResultSet resultSet, int rowNumber) throws java.sql.SQLException {
		Timestamp createdAt = resultSet.getTimestamp("created_at");
		Timestamp updatedAt = resultSet.getTimestamp("updated_at");
		return new WorkspaceResource(
				resultSet.getObject("id", UUID.class),
				resultSet.getString("slug"),
				resultSet.getString("name"),
				resultSet.getString("workspace_status"),
				resultSet.getInt("current_version"),
				resultSet.getObject("source_template_organization_id", UUID.class),
				toInstant(createdAt),
				toInstant(updatedAt),
				new WorkspaceCounts(
						resultSet.getInt("team_count"),
						resultSet.getInt("member_count"),
						resultSet.getInt("role_count"),
						resultSet.getInt("permission_count"),
						resultSet.getInt("capability_count"),
						resultSet.getInt("workflow_count")));
	}

	private Instant toInstant(Timestamp timestamp) {
		return timestamp.toInstant();
	}
}
