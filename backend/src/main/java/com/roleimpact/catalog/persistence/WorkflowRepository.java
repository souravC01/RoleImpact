package com.roleimpact.catalog.persistence;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkflowRepository extends JpaRepository<WorkflowEntity, UUID> {

	List<WorkflowEntity> findAllByOrganizationIdOrderByName(UUID organizationId);
}
