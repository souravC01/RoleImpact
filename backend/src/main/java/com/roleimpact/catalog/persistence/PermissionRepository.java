package com.roleimpact.catalog.persistence;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PermissionRepository extends JpaRepository<PermissionEntity, UUID> {

	List<PermissionEntity> findAllByOrganizationIdOrderByAction(UUID organizationId);
}
