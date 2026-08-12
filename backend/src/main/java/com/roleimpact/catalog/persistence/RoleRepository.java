package com.roleimpact.catalog.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RoleRepository extends JpaRepository<RoleEntity, UUID> {

	List<RoleEntity> findAllByOrganizationIdOrderByName(UUID organizationId);

	Optional<RoleEntity> findByOrganizationIdAndName(UUID organizationId, String name);
}
