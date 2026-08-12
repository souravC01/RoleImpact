package com.roleimpact.catalog.persistence;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OrganizationRepository extends JpaRepository<OrganizationEntity, UUID> {

	Optional<OrganizationEntity> findBySlug(String slug);
}
