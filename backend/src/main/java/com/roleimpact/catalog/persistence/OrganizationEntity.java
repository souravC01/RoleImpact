package com.roleimpact.catalog.persistence;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "organizations")
public class OrganizationEntity {

	@Id
	private UUID id;

	@Column(nullable = false, unique = true, length = 80)
	private String slug;

	@Column(nullable = false, length = 160)
	private String name;

	@Column(name = "current_version", nullable = false)
	private int currentVersion;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected OrganizationEntity() {
	}

	public UUID getId() {
		return id;
	}

	public String getSlug() {
		return slug;
	}

	public String getName() {
		return name;
	}

	public int getCurrentVersion() {
		return currentVersion;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
