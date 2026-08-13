package com.roleimpact.workspace.api;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import com.roleimpact.workspace.application.WorkspaceService;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@RestController
@RequestMapping("/api/v1/workspaces")
public class WorkspaceController {

	private final WorkspaceService workspaceService;

	public WorkspaceController(WorkspaceService workspaceService) {
		this.workspaceService = workspaceService;
	}

	@GetMapping
	public List<WorkspaceResource> list() {
		return workspaceService.list();
	}

	@GetMapping("/{workspaceId}")
	public WorkspaceResource get(@PathVariable UUID workspaceId) {
		return workspaceService.get(workspaceId);
	}

	@PostMapping
	public ResponseEntity<WorkspaceResource> create(@Valid @RequestBody WorkspaceRequest request) {
		return created(workspaceService.createBlank(request));
	}

	@PostMapping("/{sourceWorkspaceId}/clones")
	public ResponseEntity<WorkspaceResource> clone(
			@PathVariable UUID sourceWorkspaceId,
			@Valid @RequestBody WorkspaceRequest request) {
		return created(workspaceService.clonePublished(sourceWorkspaceId, request));
	}

	private ResponseEntity<WorkspaceResource> created(WorkspaceResource workspace) {
		URI location = ServletUriComponentsBuilder.fromCurrentContextPath()
				.path("/api/v1/workspaces/{id}")
				.buildAndExpand(workspace.id())
				.toUri();
		return ResponseEntity.created(location).body(workspace);
	}
}
