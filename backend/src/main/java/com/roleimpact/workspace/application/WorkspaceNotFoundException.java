package com.roleimpact.workspace.application;

import java.util.UUID;

public class WorkspaceNotFoundException extends RuntimeException {

	public WorkspaceNotFoundException(UUID id) {
		super("Workspace not found: " + id);
	}

	public WorkspaceNotFoundException(String publicCode) {
		super("Organization not found: " + publicCode);
	}
}
