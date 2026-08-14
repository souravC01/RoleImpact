package com.roleimpact.workspace.preview.api;

import java.util.UUID;

import com.roleimpact.impactengine.ImpactResult;
import com.roleimpact.workspace.preview.application.DraftImpactPreviewService;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/impact-previews")
public class DraftImpactPreviewController {

	private final DraftImpactPreviewService service;

	public DraftImpactPreviewController(DraftImpactPreviewService service) {
		this.service = service;
	}

	@PostMapping
	public ImpactResult create(
			@PathVariable UUID workspaceId,
			@Valid @RequestBody DraftImpactPreviewRequest request) {
		return service.preview(workspaceId, request);
	}
}
