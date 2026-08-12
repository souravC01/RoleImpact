package com.roleimpact.catalog.persistence;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkflowStepRepository extends JpaRepository<WorkflowStepEntity, UUID> {

	List<WorkflowStepEntity> findAllByWorkflowIdInOrderByWorkflowIdAscPositionAsc(Collection<UUID> workflowIds);
}
