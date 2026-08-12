package com.roleimpact.catalog.persistence;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkflowConstraintRepository extends JpaRepository<WorkflowConstraintEntity, UUID> {

	List<WorkflowConstraintEntity> findAllByWorkflowIdInOrderByWorkflowIdAsc(Collection<UUID> workflowIds);
}
