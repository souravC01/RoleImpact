package com.roleimpact.catalog.snapshot;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.NOT_FOUND)
public class OrganizationNotFoundException extends RuntimeException {

	public OrganizationNotFoundException(String slug) {
		super("Organization not found: " + slug);
	}
}
