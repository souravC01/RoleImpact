package com.roleimpact.simulation.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.roleimpact.catalog.snapshot.OrganizationSnapshotAssembler;
import com.roleimpact.impactengine.DeterministicImpactEngine;
import com.roleimpact.impactengine.ImpactEngine;
import com.roleimpact.impactengine.ImpactResult.Recommendation;
import com.roleimpact.impactengine.ImpactResult.RecommendationAction;
import com.roleimpact.impactengine.RevokeEmployeeRole;
import com.roleimpact.simulation.api.SimulationBranchRequest;
import com.roleimpact.simulation.api.SimulationRequest;
import com.roleimpact.simulation.api.SimulationResource;
import com.roleimpact.simulation.persistence.SimulationRepository;
import com.roleimpact.simulation.persistence.SimulationRepository.NewSimulation;
import com.roleimpact.simulation.persistence.SimulationRepository.StoredSimulation;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SimulationApplicationService {

	private final OrganizationSnapshotAssembler snapshotAssembler;
	private final ImpactEngine impactEngine;
	private final SimulationRepository simulationRepository;
	private final ObjectMapper objectMapper;
	private final Clock clock;

	public SimulationApplicationService(
			OrganizationSnapshotAssembler snapshotAssembler,
			ImpactEngine impactEngine,
			SimulationRepository simulationRepository,
			ObjectMapper objectMapper,
			Clock clock) {
		this.snapshotAssembler = snapshotAssembler;
		this.impactEngine = impactEngine;
		this.simulationRepository = simulationRepository;
		this.objectMapper = objectMapper;
		this.clock = clock;
	}

	@Transactional
	public SaveResult create(SimulationRequest request, String rawIdempotencyKey) {
		validateContract(request);
		var idempotencyKey = normalizeIdempotencyKey(rawIdempotencyKey);
		var requestHash = rootRequestHash(request);
		var replay = replayIfPresent(request.organizationId(), idempotencyKey, requestHash, null);
		if (replay != null) {
			return replay;
		}

		var snapshot = snapshotAssembler.assemble(request.organizationId());
		if (snapshot.organization().version() != request.baselineVersion()) {
			throw new SimulationConflictException(
					"Baseline version " + request.baselineVersion() + " is stale; current version is "
							+ snapshot.organization().version());
		}

		var startedAt = Instant.now(clock);
		var result = impactEngine.analyze(
				snapshot,
				new RevokeEmployeeRole(request.change().employeeId(), request.change().roleId()));
		var completedAt = Instant.now(clock);
		var simulation = new NewSimulation(
				UUID.randomUUID(),
				request.organizationId(),
				null,
				request.baselineVersion(),
				idempotencyKey,
				requestHash,
				writeChangePayload(request),
				result,
				startedAt,
				completedAt);
		return save(simulation);
	}

	@Transactional
	public SaveResult createBranch(
			UUID parentSimulationId,
			SimulationBranchRequest request,
			String rawIdempotencyKey) {
		var parent = simulationRepository.findById(parentSimulationId)
				.orElseThrow(() -> new SimulationNotFoundException(parentSimulationId));
		var idempotencyKey = normalizeIdempotencyKey(rawIdempotencyKey);
		var requestHash = branchRequestHash(parentSimulationId, request.recommendationId());
		var replay = replayIfPresent(
				parent.organizationId(), idempotencyKey, requestHash, parentSimulationId);
		if (replay != null) {
			return replay;
		}

		var recommendation = parent.result().recommendations().stream()
				.filter(candidate -> candidate.id().equals(request.recommendationId()))
				.findFirst()
				.orElseThrow(() -> new RecommendationNotFoundException(
						parentSimulationId, request.recommendationId()));
		validateRecommendation(parent, recommendation);

		var snapshot = snapshotAssembler.assemble(parent.organizationId());
		if (snapshot.organization().version() != parent.baselineVersion()) {
			throw new SimulationConflictException(
					"Parent baseline version " + parent.baselineVersion()
							+ " is no longer the current organization version");
		}

		var startedAt = Instant.now(clock);
		var result = impactEngine.analyze(snapshot, recommendation.replacementChange());
		var completedAt = Instant.now(clock);
		var simulation = new NewSimulation(
				UUID.randomUUID(),
				parent.organizationId(),
				parent.id(),
				parent.baselineVersion(),
				idempotencyKey,
				requestHash,
				writeBranchChangePayload(parent, recommendation),
				result,
				startedAt,
				completedAt);
		return save(simulation);
	}

	@Transactional(readOnly = true)
	public SimulationResource get(UUID simulationId) {
		return simulationRepository.findById(simulationId)
				.map(SimulationApplicationService::toResource)
				.orElseThrow(() -> new SimulationNotFoundException(simulationId));
	}

	private SaveResult save(NewSimulation simulation) {
		if (simulationRepository.insert(simulation)) {
			return new SaveResult(toResource(simulation), true);
		}
		if (simulation.idempotencyKey() == null) {
			throw new IllegalStateException("Simulation insert did not create a row");
		}
		var stored = simulationRepository
				.findByIdempotencyKey(simulation.organizationId(), simulation.idempotencyKey())
				.orElseThrow(() -> new IllegalStateException("Idempotent simulation could not be reloaded"));
		validateReplay(stored, simulation.requestHash(), simulation.parentSimulationId());
		return new SaveResult(toResource(stored), false);
	}

	private SaveResult replayIfPresent(
			UUID organizationId,
			String idempotencyKey,
			String requestHash,
			UUID expectedParentSimulationId) {
		if (idempotencyKey == null) {
			return null;
		}
		var existing = simulationRepository.findByIdempotencyKey(organizationId, idempotencyKey);
		if (existing.isEmpty()) {
			return null;
		}
		validateReplay(existing.get(), requestHash, expectedParentSimulationId);
		return new SaveResult(toResource(existing.get()), false);
	}

	private static void validateReplay(
			StoredSimulation stored,
			String requestHash,
			UUID expectedParentSimulationId) {
		if (!stored.requestHash().equals(requestHash)
				|| !Objects.equals(stored.parentSimulationId(), expectedParentSimulationId)) {
			throw new SimulationConflictException(
					"Idempotency-Key was already used for a different simulation request");
		}
	}

	private static void validateContract(SimulationRequest request) {
		if (!DeterministicImpactEngine.REQUEST_SCHEMA_VERSION.equals(request.schemaVersion())) {
			throw new SimulationValidationException(
					"Unsupported schemaVersion: " + request.schemaVersion());
		}
		if (request.change().type() != SimulationRequest.ChangeType.REVOKE_EMPLOYEE_ROLE) {
			throw new SimulationValidationException("Only REVOKE_EMPLOYEE_ROLE is supported in this slice");
		}
	}

	private static void validateRecommendation(StoredSimulation parent, Recommendation recommendation) {
		var parentChange = parent.result().changeSet();
		var replacement = recommendation.replacementChange();
		var valid = recommendation.action() == RecommendationAction.ASSIGN_ROLE_TO_EMPLOYEE
				&& parentChange != null
				&& "REVOKE_EMPLOYEE_ROLE".equals(parentChange.type())
				&& parentChange.employee() != null
				&& parentChange.role() != null
				&& replacement != null
				&& replacement.employeeId().equals(parentChange.employee().id())
				&& replacement.roleId().equals(parentChange.role().id())
				&& replacement.replacementEmployeeId().equals(recommendation.candidate().id())
				&& recommendation.role().id().equals(parentChange.role().id());
		if (!valid) {
			throw new SimulationValidationException(
					"Saved recommendation is inconsistent with its parent simulation");
		}
	}

	private static String normalizeIdempotencyKey(String rawKey) {
		if (rawKey == null || rawKey.isBlank()) {
			return null;
		}
		var key = rawKey.trim();
		if (key.length() > 160) {
			throw new SimulationValidationException("Idempotency-Key must not exceed 160 characters");
		}
		return key;
	}

	private String writeChangePayload(SimulationRequest request) {
		return writePayload(new PersistedChangePayload(
				request.schemaVersion(),
				request.change().type(),
				request.change().employeeId(),
				request.change().roleId()));
	}

	private String writeBranchChangePayload(StoredSimulation parent, Recommendation recommendation) {
		var replacement = recommendation.replacementChange();
		return writePayload(new PersistedBranchChangePayload(
				DeterministicImpactEngine.REQUEST_SCHEMA_VERSION,
				"REVOKE_EMPLOYEE_ROLE_AND_ASSIGN_REPLACEMENT",
				parent.id(),
				recommendation.id(),
				replacement.employeeId(),
				replacement.roleId(),
				replacement.replacementEmployeeId()));
	}

	private String writePayload(Object payload) {
		try {
			return objectMapper.writeValueAsString(payload);
		}
		catch (JsonProcessingException exception) {
			throw new IllegalStateException("Simulation change cannot be serialized", exception);
		}
	}

	private static String rootRequestHash(SimulationRequest request) {
		return sha256(String.join("|",
				"ROOT",
				request.schemaVersion(),
				request.organizationId().toString(),
				Integer.toString(request.baselineVersion()),
				request.change().type().name(),
				request.change().employeeId().toString(),
				request.change().roleId().toString()));
	}

	private static String branchRequestHash(UUID parentSimulationId, UUID recommendationId) {
		return sha256(String.join(
				"|", "BRANCH_RECOMMENDATION", parentSimulationId.toString(), recommendationId.toString()));
	}

	private static String sha256(String canonical) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
					.digest(canonical.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256 is unavailable", exception);
		}
	}

	private static SimulationResource toResource(NewSimulation simulation) {
		return new SimulationResource(
				simulation.id(),
				simulation.parentSimulationId(),
				simulation.organizationId(),
				simulation.baselineVersion(),
				simulation.createdAt(),
				simulation.completedAt(),
				simulation.result());
	}

	private static SimulationResource toResource(StoredSimulation stored) {
		return new SimulationResource(
				stored.id(),
				stored.parentSimulationId(),
				stored.organizationId(),
				stored.baselineVersion(),
				stored.createdAt(),
				stored.completedAt(),
				stored.result());
	}

	public record SaveResult(SimulationResource resource, boolean created) {
	}

	private record PersistedChangePayload(
			String schemaVersion,
			SimulationRequest.ChangeType type,
			UUID employeeId,
			UUID roleId) {
	}

	private record PersistedBranchChangePayload(
			String schemaVersion,
			String type,
			UUID parentSimulationId,
			UUID recommendationId,
			UUID employeeId,
			UUID roleId,
			UUID replacementEmployeeId) {
	}
}
