package com.roleimpact.catalog.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface EmployeeRepository extends JpaRepository<EmployeeEntity, UUID> {

	List<EmployeeEntity> findAllByOrganizationIdOrderByName(UUID organizationId);

	Optional<EmployeeEntity> findByOrganizationIdAndName(UUID organizationId, String name);
}
