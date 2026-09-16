package com.roleimpact.workspace.application;

import java.text.Normalizer;
import java.util.Locale;
import java.util.UUID;

import com.roleimpact.workspace.api.WorkspaceRequest;
import com.roleimpact.workspace.api.WorkspaceResource;
import com.roleimpact.workspace.persistence.WorkspaceRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkspaceService {

	private final WorkspaceRepository workspaceRepository;
	private final WorkspaceCode workspaceCode;

	public WorkspaceService(WorkspaceRepository workspaceRepository, WorkspaceCode workspaceCode) {
		this.workspaceRepository = workspaceRepository;
		this.workspaceCode = workspaceCode;
	}

	@Transactional(readOnly = true)
	public WorkspaceResource get(UUID id) {
		return workspaceRepository.findById(id)
				.orElseThrow(() -> new WorkspaceNotFoundException(id));
	}

	@Transactional(readOnly = true)
	public WorkspaceResource getEditableByCode(String rawCode) {
		String publicCode = WorkspaceCode.normalize(rawCode);
		if (publicCode == null) {
			throw new WorkspaceNotFoundException(rawCode);
		}
		return workspaceRepository.findDraftByPublicCode(publicCode)
				.orElseThrow(() -> new WorkspaceNotFoundException(rawCode));
	}

	@Transactional
	public WorkspaceResource createBlank(WorkspaceRequest request) {
		String name = request.name().trim();
		String baseSlug = resolveSlug(request, name);
		boolean generatedSlug = request.slug() == null;
		if (!generatedSlug && workspaceRepository.existsBySlug(baseSlug)) {
			throw slugConflict(baseSlug);
		}

		String slug = baseSlug;
		for (int attempt = 0; attempt < 5; attempt++) {
			UUID workspaceId = UUID.randomUUID();
			String publicCode = workspaceCode.generate(name);
			if (workspaceRepository.insertDraft(workspaceId, slug, name, publicCode)) {
				return get(workspaceId);
			}
			if (workspaceRepository.existsBySlug(slug)) {
				if (!generatedSlug) {
					throw slugConflict(slug);
				}
				slug = collisionSafeSlug(baseSlug, workspaceId);
			}
		}
		throw new WorkspaceConflictException("A unique organization ID could not be generated; try again");
	}

	private String collisionSafeSlug(String baseSlug, UUID workspaceId) {
		String suffix = "-" + workspaceId.toString().substring(0, 8);
		return baseSlug.substring(0, Math.min(baseSlug.length(), 80 - suffix.length())) + suffix;
	}

	private WorkspaceConflictException slugConflict(String slug) {
		return new WorkspaceConflictException("A workspace with slug '" + slug + "' already exists");
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
