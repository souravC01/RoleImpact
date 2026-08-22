package com.roleimpact.workspace.persistence;

import java.sql.Timestamp;
import java.time.Instant;
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
			       o.public_code, o.created_at, o.updated_at,
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

	public Optional<WorkspaceResource> findById(UUID id) {
		return jdbcClient.sql(WORKSPACE_SELECT + " WHERE o.id = :id")
				.param("id", id)
				.query(this::mapWorkspace)
				.optional();
	}

	public Optional<WorkspaceResource> findDraftByPublicCode(String publicCode) {
		return jdbcClient.sql(WORKSPACE_SELECT
				+ " WHERE UPPER(o.public_code) = :publicCode AND o.workspace_status = 'DRAFT'")
				.param("publicCode", publicCode)
				.query(this::mapWorkspace)
				.optional();
	}

	public boolean existsBySlug(String slug) {
		return jdbcClient.sql("SELECT EXISTS (SELECT 1 FROM organizations WHERE slug = :slug)")
				.param("slug", slug)
				.query(Boolean.class)
				.single();
	}

	public boolean insertDraft(UUID id, String slug, String name, String publicCode) {
		return jdbcClient.sql("""
				INSERT INTO organizations (
				    id, slug, name, current_version, workspace_status,
				    public_code, created_at, updated_at
				) VALUES (
				    :id, :slug, :name, 0, 'DRAFT', :publicCode,
				    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
				)
				ON CONFLICT DO NOTHING
				""")
				.param("id", id)
				.param("slug", slug)
				.param("name", name)
				.param("publicCode", publicCode)
				.update() == 1;
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
				resultSet.getString("public_code"),
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
