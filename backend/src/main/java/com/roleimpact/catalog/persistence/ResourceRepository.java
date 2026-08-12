package com.roleimpact.catalog.persistence;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ResourceRepository extends JpaRepository<ResourceEntity, UUID> {

	List<ResourceEntity> findAllByApplicationIdInOrderByName(Collection<UUID> applicationIds);
}
