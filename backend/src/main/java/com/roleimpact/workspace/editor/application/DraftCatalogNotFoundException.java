package com.roleimpact.workspace.editor.application;

import java.util.UUID;

public class DraftCatalogNotFoundException extends RuntimeException {

	public DraftCatalogNotFoundException(String entity, UUID id) {
		super(entity + " not found in this workspace: " + id);
	}
}
