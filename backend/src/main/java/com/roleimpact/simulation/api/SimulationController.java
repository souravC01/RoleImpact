package com.roleimpact.simulation.api;

import java.net.URI;
import java.util.UUID;

import com.roleimpact.simulation.application.SimulationApplicationService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/simulations")
public class SimulationController {

	private final SimulationApplicationService simulationService;

	public SimulationController(SimulationApplicationService simulationService) {
		this.simulationService = simulationService;
	}

	@PostMapping
	public ResponseEntity<SimulationResource> create(
			@Valid @RequestBody SimulationRequest request,
			@RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
		return savedResponse(simulationService.create(request, idempotencyKey));
	}

	@PostMapping("/{simulationId}/branches")
	public ResponseEntity<SimulationResource> createBranch(
			@PathVariable UUID simulationId,
			@Valid @RequestBody SimulationBranchRequest request,
			@RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
		return savedResponse(simulationService.createBranch(simulationId, request, idempotencyKey));
	}

	@GetMapping("/{simulationId}")
	public SimulationResource get(@PathVariable UUID simulationId) {
		return simulationService.get(simulationId);
	}

	private static ResponseEntity<SimulationResource> savedResponse(
			SimulationApplicationService.SaveResult saved) {
		if (!saved.created()) {
			return ResponseEntity.ok(saved.resource());
		}
		return ResponseEntity
				.created(URI.create("/api/v1/simulations/" + saved.resource().id()))
				.body(saved.resource());
	}
}
