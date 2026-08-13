package com.roleimpact.catalog.snapshot;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.roleimpact.catalog.persistence.ApplicationEntity;
import com.roleimpact.catalog.persistence.ApplicationRepository;
import com.roleimpact.catalog.persistence.CapabilityEntity;
import com.roleimpact.catalog.persistence.CapabilityRepository;
import com.roleimpact.catalog.persistence.CatalogEdgeRepository;
import com.roleimpact.catalog.persistence.CatalogEdgeRepository.IdEdge;
import com.roleimpact.catalog.persistence.EmployeeEntity;
import com.roleimpact.catalog.persistence.EmployeeRepository;
import com.roleimpact.catalog.persistence.OrganizationEntity;
import com.roleimpact.catalog.persistence.OrganizationRepository;
import com.roleimpact.catalog.persistence.PermissionEntity;
import com.roleimpact.catalog.persistence.PermissionRepository;
import com.roleimpact.catalog.persistence.ResourceEntity;
import com.roleimpact.catalog.persistence.ResourceRepository;
import com.roleimpact.catalog.persistence.RoleEntity;
import com.roleimpact.catalog.persistence.RoleRepository;
import com.roleimpact.catalog.persistence.TeamEntity;
import com.roleimpact.catalog.persistence.TeamRepository;
import com.roleimpact.catalog.persistence.WorkflowConstraintEntity;
import com.roleimpact.catalog.persistence.WorkflowConstraintRepository;
import com.roleimpact.catalog.persistence.WorkflowEntity;
import com.roleimpact.catalog.persistence.WorkflowRepository;
import com.roleimpact.catalog.persistence.WorkflowStepEntity;
import com.roleimpact.catalog.persistence.WorkflowStepRepository;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.ApplicationNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.CapabilityNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.EmployeeNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.OrganizationNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.PermissionNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.ResourceNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.RoleNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.TeamNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.WorkflowConstraintNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.WorkflowNode;
import com.roleimpact.catalog.snapshot.OrganizationSnapshot.WorkflowStepNode;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrganizationSnapshotAssembler {

	private final OrganizationRepository organizationRepository;
	private final TeamRepository teamRepository;
	private final EmployeeRepository employeeRepository;
	private final RoleRepository roleRepository;
	private final ApplicationRepository applicationRepository;
	private final ResourceRepository resourceRepository;
	private final PermissionRepository permissionRepository;
	private final CapabilityRepository capabilityRepository;
	private final WorkflowRepository workflowRepository;
	private final WorkflowStepRepository workflowStepRepository;
	private final WorkflowConstraintRepository workflowConstraintRepository;
	private final CatalogEdgeRepository edgeRepository;

	public OrganizationSnapshotAssembler(
			OrganizationRepository organizationRepository,
			TeamRepository teamRepository,
			EmployeeRepository employeeRepository,
			RoleRepository roleRepository,
			ApplicationRepository applicationRepository,
			ResourceRepository resourceRepository,
			PermissionRepository permissionRepository,
			CapabilityRepository capabilityRepository,
			WorkflowRepository workflowRepository,
			WorkflowStepRepository workflowStepRepository,
			WorkflowConstraintRepository workflowConstraintRepository,
			CatalogEdgeRepository edgeRepository) {
		this.organizationRepository = organizationRepository;
		this.teamRepository = teamRepository;
		this.employeeRepository = employeeRepository;
		this.roleRepository = roleRepository;
		this.applicationRepository = applicationRepository;
		this.resourceRepository = resourceRepository;
		this.permissionRepository = permissionRepository;
		this.capabilityRepository = capabilityRepository;
		this.workflowRepository = workflowRepository;
		this.workflowStepRepository = workflowStepRepository;
		this.workflowConstraintRepository = workflowConstraintRepository;
		this.edgeRepository = edgeRepository;
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public OrganizationSnapshot assemble(String organizationSlug) {
		var organization = organizationRepository.findBySlug(organizationSlug)
				.orElseThrow(() -> new OrganizationNotFoundException(organizationSlug));
		return assemble(organization);
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public OrganizationSnapshot assemble(UUID organizationId) {
		var organization = organizationRepository.findById(organizationId)
				.orElseThrow(() -> new OrganizationNotFoundException(organizationId.toString()));
		return assemble(organization);
	}

	private OrganizationSnapshot assemble(OrganizationEntity organization) {
		var organizationId = organization.getId();

		var teamEntities = teamRepository.findAllByOrganizationIdOrderByName(organizationId);
		var employeeEntities = employeeRepository.findAllByOrganizationIdOrderByName(organizationId);
		var roleEntities = roleRepository.findAllByOrganizationIdOrderByName(organizationId);
		var applicationEntities = applicationRepository.findAllByOrganizationIdOrderByName(organizationId);
		var applicationIds = applicationEntities.stream().map(ApplicationEntity::getId).toList();
		var resourceEntities = applicationIds.isEmpty()
				? List.<ResourceEntity>of()
				: resourceRepository.findAllByApplicationIdInOrderByName(applicationIds);
		var permissionEntities = permissionRepository.findAllByOrganizationIdOrderByAction(organizationId);
		var capabilityEntities = capabilityRepository.findAllByOrganizationIdOrderByName(organizationId);
		var workflowEntities = workflowRepository.findAllByOrganizationIdOrderByName(organizationId);
		var workflowIds = workflowEntities.stream().map(WorkflowEntity::getId).toList();
		var stepEntities = workflowIds.isEmpty()
				? List.<WorkflowStepEntity>of()
				: workflowStepRepository.findAllByWorkflowIdInOrderByWorkflowIdAscPositionAsc(workflowIds);
		var constraintEntities = workflowIds.isEmpty()
				? List.<WorkflowConstraintEntity>of()
				: workflowConstraintRepository.findAllByWorkflowIdInOrderByWorkflowIdAsc(workflowIds);

		var stepsByWorkflowId = stepEntities.stream()
				.collect(Collectors.groupingBy(
						WorkflowStepEntity::getWorkflowId,
						LinkedHashMap::new,
						Collectors.mapping(this::toStepNode, Collectors.toList())));
		var constraintsByWorkflowId = constraintEntities.stream()
				.collect(Collectors.groupingBy(
						WorkflowConstraintEntity::getWorkflowId,
						LinkedHashMap::new,
						Collectors.mapping(this::toConstraintNode, Collectors.toList())));

		var workflows = index(workflowEntities, WorkflowEntity::getId, entity -> new WorkflowNode(
				entity.getId(),
				entity.getName(),
				entity.getCriticality(),
				entity.getOwnerEmployeeId(),
				stepsByWorkflowId.getOrDefault(entity.getId(), List.of()),
				constraintsByWorkflowId.getOrDefault(entity.getId(), List.of())));

		return new OrganizationSnapshot(
				new OrganizationNode(
						organizationId,
						organization.getSlug(),
						organization.getName(),
						organization.getCurrentVersion(),
						edgeRepository.findContentHash(organizationId, organization.getCurrentVersion())),
				index(teamEntities, TeamEntity::getId, this::toTeamNode),
				index(employeeEntities, EmployeeEntity::getId, this::toEmployeeNode),
				index(roleEntities, RoleEntity::getId, this::toRoleNode),
				index(applicationEntities, ApplicationEntity::getId, this::toApplicationNode),
				index(resourceEntities, ResourceEntity::getId, this::toResourceNode),
				index(permissionEntities, PermissionEntity::getId, this::toPermissionNode),
				index(capabilityEntities, CapabilityEntity::getId, this::toCapabilityNode),
				workflows,
				groupEdges(edgeRepository.findEmployeeRoles(organizationId)),
				groupEdges(edgeRepository.findRolePermissions(organizationId)),
				groupEdges(edgeRepository.findCapabilityPermissions(organizationId)),
				groupEdges(edgeRepository.findWorkflowStepConstraints(organizationId)));
	}

	private TeamNode toTeamNode(TeamEntity entity) {
		return new TeamNode(entity.getId(), entity.getName(), entity.getDepartment(), entity.getManagerEmployeeId());
	}

	private EmployeeNode toEmployeeNode(EmployeeEntity entity) {
		return new EmployeeNode(
				entity.getId(),
				entity.getTeamId(),
				entity.getEmployeeNumber(),
				entity.getName(),
				entity.getEmail(),
				entity.getStatus(),
				entity.getRegion(),
				entity.getShift());
	}

	private RoleNode toRoleNode(RoleEntity entity) {
		return new RoleNode(
				entity.getId(),
				entity.getName(),
				entity.getDescription(),
				entity.getSensitivity(),
				entity.getOwnerEmployeeId());
	}

	private ApplicationNode toApplicationNode(ApplicationEntity entity) {
		return new ApplicationNode(entity.getId(), entity.getName(), entity.getCategory(), entity.getOwnerEmployeeId());
	}

	private ResourceNode toResourceNode(ResourceEntity entity) {
		return new ResourceNode(entity.getId(), entity.getApplicationId(), entity.getName(), entity.getResourceType());
	}

	private PermissionNode toPermissionNode(PermissionEntity entity) {
		return new PermissionNode(
				entity.getId(),
				entity.getApplicationId(),
				entity.getResourceId(),
				entity.getAction(),
				entity.getSensitivity());
	}

	private CapabilityNode toCapabilityNode(CapabilityEntity entity) {
		return new CapabilityNode(entity.getId(), entity.getName(), entity.getDescription());
	}

	private WorkflowStepNode toStepNode(WorkflowStepEntity entity) {
		return new WorkflowStepNode(
				entity.getId(),
				entity.getStepKey(),
				entity.getName(),
				entity.getPosition(),
				entity.getRequiredCapabilityId(),
				entity.getMinimumActors(),
				entity.getResilienceTarget(),
				entity.getRequiredDepartment(),
				entity.getRequiredRegion(),
				entity.getRequiredShift(),
				entity.getRequiredApplicationId());
	}

	private WorkflowConstraintNode toConstraintNode(WorkflowConstraintEntity entity) {
		return new WorkflowConstraintNode(entity.getId(), entity.getType(), entity.getParameters().toString());
	}

	private static Map<UUID, Set<UUID>> groupEdges(Collection<IdEdge> edges) {
		var grouped = new LinkedHashMap<UUID, Set<UUID>>();
		edges.forEach(edge -> grouped
				.computeIfAbsent(edge.sourceId(), ignored -> new LinkedHashSet<>())
				.add(edge.targetId()));
		return grouped;
	}

	private static <T, R> Map<UUID, R> index(
			Collection<T> source,
			Function<T, UUID> idExtractor,
			Function<T, R> mapper) {
		var indexed = new LinkedHashMap<UUID, R>();
		for (var item : source) {
			var id = idExtractor.apply(item);
			if (indexed.put(id, mapper.apply(item)) != null) {
				throw new IllegalStateException("Duplicate catalog ID: " + id);
			}
		}
		return indexed;
	}
}
