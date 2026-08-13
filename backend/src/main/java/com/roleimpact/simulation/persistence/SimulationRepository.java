package com.roleimpact.simulation.persistence;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.roleimpact.impactengine.ImpactResult;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class SimulationRepository {

	private final JdbcClient jdbcClient;
	private final ObjectMapper objectMapper;

	public SimulationRepository(JdbcClient jdbcClient, ObjectMapper objectMapper) {
		this.jdbcClient = jdbcClient;
		this.objectMapper = objectMapper;
	}

	public boolean insert(NewSimulation simulation) {
		var insertedRows = jdbcClient.sql("""
				INSERT INTO simulations (
				    id, organization_id, parent_simulation_id, baseline_version, engine_version,
				    idempotency_key, request_hash, change_type, change_payload, result_status,
				    result_payload, severity, created_at, completed_at
				) VALUES (
				    :id, :organizationId, :parentSimulationId, :baselineVersion, :engineVersion,
				    :idempotencyKey, :requestHash, :changeType, CAST(:changePayload AS jsonb),
				    :resultStatus, CAST(:resultPayload AS jsonb), :severity, :createdAt, :completedAt
				)
				ON CONFLICT (organization_id, idempotency_key) DO NOTHING
				""")
				.param("id", simulation.id())
				.param("organizationId", simulation.organizationId())
				.param("parentSimulationId", simulation.parentSimulationId())
				.param("baselineVersion", simulation.baselineVersion())
				.param("engineVersion", simulation.result().diagnostics().engineVersion())
				.param("idempotencyKey", simulation.idempotencyKey())
				.param("requestHash", simulation.requestHash())
				.param("changeType", simulation.result().changeSet().type())
				.param("changePayload", simulation.changePayload())
				.param("resultStatus", simulation.result().resultStatus().name())
				.param("resultPayload", writeResult(simulation.result()))
				.param("severity", simulation.result().overallSeverity().name())
				.param("createdAt", OffsetDateTime.ofInstant(simulation.createdAt(), ZoneOffset.UTC))
				.param("completedAt", OffsetDateTime.ofInstant(simulation.completedAt(), ZoneOffset.UTC))
				.update();
		return insertedRows == 1;
	}

	public Optional<StoredSimulation> findById(UUID simulationId) {
		return jdbcClient.sql("""
					SELECT id, organization_id, parent_simulation_id, baseline_version, request_hash,
					       result_payload::text AS result_payload, created_at, completed_at
					FROM simulations
					WHERE id = :simulationId
					""")
					.param("simulationId", simulationId)
					.query((resultSet, rowNumber) -> mapStoredSimulation(
							resultSet.getObject("id", UUID.class),
							resultSet.getObject("organization_id", UUID.class),
							resultSet.getObject("parent_simulation_id", UUID.class),
							resultSet.getInt("baseline_version"),
						resultSet.getString("request_hash"),
						resultSet.getString("result_payload"),
						resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
						resultSet.getObject("completed_at", OffsetDateTime.class).toInstant()))
				.optional();
	}

	public Optional<StoredSimulation> findByIdempotencyKey(UUID organizationId, String idempotencyKey) {
		return jdbcClient.sql("""
					SELECT id, organization_id, parent_simulation_id, baseline_version, request_hash,
					       result_payload::text AS result_payload, created_at, completed_at
					FROM simulations
					WHERE organization_id = :organizationId AND idempotency_key = :idempotencyKey
					""")
					.param("organizationId", organizationId)
					.param("idempotencyKey", idempotencyKey)
					.query((resultSet, rowNumber) -> mapStoredSimulation(
							resultSet.getObject("id", UUID.class),
							resultSet.getObject("organization_id", UUID.class),
							resultSet.getObject("parent_simulation_id", UUID.class),
							resultSet.getInt("baseline_version"),
						resultSet.getString("request_hash"),
						resultSet.getString("result_payload"),
						resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
						resultSet.getObject("completed_at", OffsetDateTime.class).toInstant()))
				.optional();
	}

	private StoredSimulation mapStoredSimulation(
			UUID id,
			UUID organizationId,
			UUID parentSimulationId,
			int baselineVersion,
			String requestHash,
			String resultPayload,
			Instant createdAt,
			Instant completedAt) {
		try {
			return new StoredSimulation(
					id,
					organizationId,
					parentSimulationId,
					baselineVersion,
					requestHash,
					objectMapper.readValue(resultPayload, ImpactResult.class),
					createdAt,
					completedAt);
		}
		catch (JsonProcessingException exception) {
			throw new IllegalStateException("Saved simulation result cannot be read", exception);
		}
	}

	private String writeResult(ImpactResult result) {
		try {
			return objectMapper.writeValueAsString(result);
		}
		catch (JsonProcessingException exception) {
			throw new IllegalStateException("Simulation result cannot be serialized", exception);
		}
	}

	public record NewSimulation(
			UUID id,
			UUID organizationId,
			UUID parentSimulationId,
			int baselineVersion,
			String idempotencyKey,
			String requestHash,
			String changePayload,
			ImpactResult result,
			Instant createdAt,
			Instant completedAt) {
	}

	public record StoredSimulation(
			UUID id,
			UUID organizationId,
			UUID parentSimulationId,
			int baselineVersion,
			String requestHash,
			ImpactResult result,
			Instant createdAt,
			Instant completedAt) {
	}
}
