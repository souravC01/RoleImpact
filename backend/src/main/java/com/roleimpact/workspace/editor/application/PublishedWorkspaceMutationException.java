package com.roleimpact.workspace.editor.application;

public class PublishedWorkspaceMutationException extends RuntimeException {

	public PublishedWorkspaceMutationException() {
		super("Published workspaces are immutable; clone this workspace before editing it");
	}
}
