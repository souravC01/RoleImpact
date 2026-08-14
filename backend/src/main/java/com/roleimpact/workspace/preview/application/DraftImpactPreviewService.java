package com.roleimpact.workspace.preview.application;

import java.util.UUID;

import com.roleimpact.catalog.snapshot.OrganizationSnapshotAssembler;
import com.roleimpact.impactengine.ImpactEngine;
import com.roleimpact.impactengine.ImpactResult;
import com.roleimpact.impactengine.InvalidImpactChangeException;
import com.roleimpact.impactengine.RevokeEmployeeRole;
import com.roleimpact.workspace.application.WorkspaceNotFoundException;
import com.roleimpact.workspace.editor.application.PublishedWorkspaceMutationException;
import com.roleimpact.workspace.editor.persistence.DraftCatalogRepository;
import com.roleimpact.workspace.preview.api.DraftImpactPreviewRequest;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DraftImpactPreviewService {

	private final DraftCatalogRepository catalogRepository;
	private final OrganizationSnapshotAssembler snapshotAssembler;
	private final ImpactEngine impactEngine;

	public DraftImpactPreviewService(
			DraftCatalogRepository catalogRepository,
			OrganizationSnapshotAssembler snapshotAssembler,
			ImpactEngine impactEngine) {
		this.catalogRepository = catalogRepository;
		this.snapshotAssembler = snapshotAssembler;
		this.impactEngine = impactEngine;
	}

	@Transactional(readOnly = true)
	public ImpactResult preview(UUID workspaceId, DraftImpactPreviewRequest request) {
		String status = catalogRepository.findWorkspaceStatus(workspaceId)
				.orElseThrow(() -> new WorkspaceNotFoundException(workspaceId));
		if (!"DRAFT".equals(status)) throw new PublishedWorkspaceMutationException();
		if (!catalogRepository.assignmentExists(workspaceId, request.memberId(), request.roleId())) {
			throw new InvalidImpactChangeException("The selected member does not currently hold this role");
		}
		var snapshot = snapshotAssembler.assemble(workspaceId);
		return impactEngine.analyze(snapshot, new RevokeEmployeeRole(request.memberId(), request.roleId()));
	}
}
