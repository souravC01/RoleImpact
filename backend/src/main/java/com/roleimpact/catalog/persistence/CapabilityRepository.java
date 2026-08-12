package com.roleimpact.catalog.persistence;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CapabilityRepository extends JpaRepository<CapabilityEntity, UUID> {

	List<CapabilityEntity> findAllByOrganizationIdOrderByName(UUID organizationId);
}
