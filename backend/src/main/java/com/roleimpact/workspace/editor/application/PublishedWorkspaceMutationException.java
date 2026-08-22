package com.roleimpact.workspace.editor.application;

public class PublishedWorkspaceMutationException extends RuntimeException {

	public PublishedWorkspaceMutationException() {
		super("Published examples are read-only; create a new organization to make changes");
	}
}
