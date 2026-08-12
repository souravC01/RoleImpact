package com.roleimpact.catalog.persistence;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ApplicationRepository extends JpaRepository<ApplicationEntity, UUID> {

	List<ApplicationEntity> findAllByOrganizationIdOrderByName(UUID organizationId);
}
