package com.roleimpact.catalog.persistence;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class CatalogEdgeRepository {

	private final JdbcClient jdbcClient;

	public CatalogEdgeRepository(JdbcClient jdbcClient) {
		this.jdbcClient = jdbcClient;
	}

	public List<IdEdge> findEmployeeRoles(UUID organizationId) {
		return queryEdges("""
				SELECT er.employee_id AS source_id, er.role_id AS target_id
				FROM employee_roles er
				JOIN employees e ON e.id = er.employee_id
				WHERE e.organization_id = :organizationId
				ORDER BY er.employee_id, er.role_id
				""", organizationId);
	}

	public List<IdEdge> findRolePermissions(UUID organizationId) {
		return queryEdges("""
				SELECT rp.role_id AS source_id, rp.permission_id AS target_id
				FROM role_permissions rp
				JOIN roles r ON r.id = rp.role_id
				WHERE r.organization_id = :organizationId
				ORDER BY rp.role_id, rp.permission_id
				""", organizationId);
	}

	public List<IdEdge> findCapabilityPermissions(UUID organizationId) {
		return queryEdges("""
				SELECT cp.capability_id AS source_id, cp.permission_id AS target_id
				FROM capability_permissions cp
				JOIN capabilities c ON c.id = cp.capability_id
				WHERE c.organization_id = :organizationId
				ORDER BY cp.capability_id, cp.permission_id
				""", organizationId);
	}

	public List<IdEdge> findWorkflowStepConstraints(UUID organizationId) {
		return queryEdges("""
				SELECT wsc.workflow_step_id AS source_id, wsc.constraint_id AS target_id
				FROM workflow_step_constraints wsc
				JOIN workflow_steps ws ON ws.id = wsc.workflow_step_id
				JOIN workflows w ON w.id = ws.workflow_id
				WHERE w.organization_id = :organizationId
				ORDER BY wsc.workflow_step_id, wsc.constraint_id
				""", organizationId);
	}

	public String findContentHash(UUID organizationId, int version) {
		var savedHash = jdbcClient.sql("""
				SELECT content_hash
				FROM organization_versions
				WHERE organization_id = :organizationId AND version = :version
				""")
				.param("organizationId", organizationId)
				.param("version", version)
				.query(String.class)
				.optional();
		if (savedHash.isPresent()) return savedHash.get();
		if (version != 0) {
			throw new IllegalStateException("Organization version " + version + " has no content hash");
		}
		String draftFingerprint = jdbcClient.sql("""
				SELECT id::text || '|' || updated_at::text
				FROM organizations
				WHERE id = :organizationId AND workspace_status = 'DRAFT'
				""").param("organizationId", organizationId).query(String.class).single();
		return sha256(draftFingerprint);
	}

	private String sha256(String value) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
					.digest(value.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256 is unavailable", exception);
		}
	}

	private List<IdEdge> queryEdges(String sql, UUID organizationId) {
		return jdbcClient.sql(sql)
				.param("organizationId", organizationId)
				.query((resultSet, rowNumber) -> new IdEdge(
						resultSet.getObject("source_id", UUID.class),
						resultSet.getObject("target_id", UUID.class)))
				.list();
	}

	public record IdEdge(UUID sourceId, UUID targetId) {
	}
}
