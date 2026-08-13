package com.roleimpact.workspace.application;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import com.roleimpact.workspace.api.WorkspaceRequest;
import com.roleimpact.workspace.api.WorkspaceResource;
import com.roleimpact.workspace.persistence.WorkspaceRepository;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkspaceService {

	private final WorkspaceRepository workspaceRepository;

	public WorkspaceService(WorkspaceRepository workspaceRepository) {
		this.workspaceRepository = workspaceRepository;
	}

	@Transactional(readOnly = true)
	public List<WorkspaceResource> list() {
		return workspaceRepository.findAll();
	}

	@Transactional(readOnly = true)
	public WorkspaceResource get(UUID id) {
		return workspaceRepository.findById(id)
				.orElseThrow(() -> new WorkspaceNotFoundException(id));
	}

	@Transactional
	public WorkspaceResource createBlank(WorkspaceRequest request) {
		String name = request.name().trim();
		String slug = resolveSlug(request, name);
		UUID workspaceId = UUID.randomUUID();

		insertDraft(workspaceId, slug, name, null);
		return get(workspaceId);
	}

	@Transactional
	public WorkspaceResource clonePublished(UUID sourceId, WorkspaceRequest request) {
		String status = workspaceRepository.findStatus(sourceId)
				.orElseThrow(() -> new WorkspaceNotFoundException(sourceId));
		if (!"PUBLISHED".equals(status)) {
			throw new WorkspaceValidationException("Only a published workspace can be cloned");
		}

		String name = request.name().trim();
		String slug = resolveSlug(request, name);
		UUID workspaceId = UUID.randomUUID();

		insertDraft(workspaceId, slug, name, sourceId);
		workspaceRepository.cloneCatalog(sourceId, workspaceId);
		return get(workspaceId);
	}

	private void insertDraft(UUID id, String slug, String name, UUID sourceTemplateId) {
		if (workspaceRepository.existsBySlug(slug)) {
			throw new WorkspaceConflictException("A workspace with slug '" + slug + "' already exists");
		}
		try {
			workspaceRepository.insertDraft(id, slug, name, sourceTemplateId);
		}
		catch (DataIntegrityViolationException exception) {
			throw new WorkspaceConflictException("A workspace with slug '" + slug + "' already exists");
		}
	}

	private String resolveSlug(WorkspaceRequest request, String name) {
		String slug = request.slug() == null ? slugify(name) : request.slug();
		if (slug.length() < 3 || slug.length() > 80) {
			throw new WorkspaceValidationException("Workspace slug must contain between 3 and 80 characters");
		}
		return slug;
	}

	private String slugify(String value) {
		String normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
				.replaceAll("\\p{M}", "")
				.toLowerCase(Locale.ROOT)
				.replaceAll("[^a-z0-9]+", "-")
				.replaceAll("(^-|-$)", "");
		if (normalized.isBlank()) {
			throw new WorkspaceValidationException("Workspace name must contain letters or numbers");
		}
		return normalized;
	}
}
