package com.roleimpact.shared.api;

import java.util.List;
import java.util.UUID;

import com.roleimpact.catalog.snapshot.OrganizationNotFoundException;
import com.roleimpact.impactengine.ImpactEntityNotFoundException;
import com.roleimpact.impactengine.InvalidImpactChangeException;
import com.roleimpact.simulation.application.RecommendationNotFoundException;
import com.roleimpact.simulation.application.SimulationConflictException;
import com.roleimpact.simulation.application.SimulationNotFoundException;
import com.roleimpact.simulation.application.SimulationValidationException;
import com.roleimpact.workspace.application.WorkspaceConflictException;
import com.roleimpact.workspace.application.WorkspaceNotFoundException;
import com.roleimpact.workspace.application.WorkspaceValidationException;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

	@ExceptionHandler({OrganizationNotFoundException.class, ImpactEntityNotFoundException.class,
			RecommendationNotFoundException.class, SimulationNotFoundException.class,
			WorkspaceNotFoundException.class})
	ResponseEntity<ErrorEnvelope> handleNotFound(RuntimeException exception) {
		return error(HttpStatus.NOT_FOUND, "ENTITY_NOT_FOUND", exception.getMessage(), List.of());
	}

	@ExceptionHandler({InvalidImpactChangeException.class, SimulationValidationException.class})
	ResponseEntity<ErrorEnvelope> handleUnprocessable(RuntimeException exception) {
		return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_SIMULATION", exception.getMessage(), List.of());
	}

	@ExceptionHandler(SimulationConflictException.class)
	ResponseEntity<ErrorEnvelope> handleConflict(SimulationConflictException exception) {
		return error(HttpStatus.CONFLICT, "SIMULATION_CONFLICT", exception.getMessage(), List.of());
	}

	@ExceptionHandler(WorkspaceValidationException.class)
	ResponseEntity<ErrorEnvelope> handleWorkspaceValidation(WorkspaceValidationException exception) {
		return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_WORKSPACE", exception.getMessage(), List.of());
	}

	@ExceptionHandler(WorkspaceConflictException.class)
	ResponseEntity<ErrorEnvelope> handleWorkspaceConflict(WorkspaceConflictException exception) {
		return error(HttpStatus.CONFLICT, "WORKSPACE_CONFLICT", exception.getMessage(), List.of());
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ResponseEntity<ErrorEnvelope> handleValidation(MethodArgumentNotValidException exception) {
		var fieldErrors = exception.getBindingResult().getFieldErrors().stream()
				.map(error -> new FieldError(error.getField(), error.getDefaultMessage()))
				.toList();
		return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Request validation failed", fieldErrors);
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	ResponseEntity<ErrorEnvelope> handleUnreadable(HttpMessageNotReadableException exception) {
		return error(HttpStatus.BAD_REQUEST, "MALFORMED_JSON", "Request JSON could not be read", List.of());
	}

	private static ResponseEntity<ErrorEnvelope> error(
			HttpStatus status,
			String code,
			String message,
			List<FieldError> fieldErrors) {
		return ResponseEntity.status(status).body(new ErrorEnvelope(
				code,
				message,
				UUID.randomUUID().toString(),
				fieldErrors,
				List.of()));
	}

	public record ErrorEnvelope(
			String code,
			String message,
			String traceId,
			List<FieldError> fieldErrors,
			List<String> entityRefs) {

		public ErrorEnvelope {
			fieldErrors = List.copyOf(fieldErrors);
			entityRefs = List.copyOf(entityRefs);
		}
	}

	public record FieldError(String field, String message) {
	}
}
