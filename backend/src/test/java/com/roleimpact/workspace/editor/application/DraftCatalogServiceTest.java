package com.roleimpact.workspace.editor.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.roleimpact.shared.model.Sensitivity;
import com.roleimpact.workspace.editor.api.RoleRequest;
import com.roleimpact.workspace.editor.persistence.DraftCatalogRepository;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DraftCatalogServiceTest {

	@Mock
	private DraftCatalogRepository repository;

	@Test
	void createsRoleAfterValidatingEveryHolderAndReplacesTheCompleteHolderSetOnce() {
		UUID workspaceId = UUID.fromString("00000000-0000-0000-0000-000000000101");
		UUID roleId = UUID.fromString("00000000-0000-0000-0000-000000000102");
		Set<UUID> holderIds = Set.of(
				UUID.fromString("00000000-0000-0000-0000-000000000103"),
				UUID.fromString("00000000-0000-0000-0000-000000000104"));
		RoleRequest request = roleRequest(holderIds);
		DraftCatalogService service = serviceForDraft(workspaceId);
		when(repository.countMatchingMembers(workspaceId, holderIds)).thenReturn(2);
		when(repository.insertRole(workspaceId, request)).thenReturn(roleId);

		service.createRole(workspaceId, request);

		InOrder order = inOrder(repository);
		order.verify(repository).countMatchingMembers(workspaceId, holderIds);
		order.verify(repository).insertRole(workspaceId, request);
		order.verify(repository).replaceRoleHolders(roleId, holderIds);
		order.verify(repository).touchWorkspace(workspaceId);
	}

	@Test
	void updatesRoleWithAnExplicitEmptyHolderSetByClearingAllHolders() {
		UUID workspaceId = UUID.fromString("00000000-0000-0000-0000-000000000111");
		UUID roleId = UUID.fromString("00000000-0000-0000-0000-000000000112");
		Set<UUID> holderIds = Set.of();
		RoleRequest request = roleRequest(holderIds);
		DraftCatalogService service = serviceForDraft(workspaceId);
		when(repository.roleExists(workspaceId, roleId)).thenReturn(true);
		when(repository.countMatchingMembers(workspaceId, holderIds)).thenReturn(0);

		service.updateRole(workspaceId, roleId, request);

		verify(repository).updateRole(workspaceId, roleId, request);
		verify(repository).replaceRoleHolders(roleId, holderIds);
	}

	@Test
	void updatesRoleWithoutHolderIdsWithoutChangingCurrentHolders() {
		UUID workspaceId = UUID.fromString("00000000-0000-0000-0000-000000000121");
		UUID roleId = UUID.fromString("00000000-0000-0000-0000-000000000122");
		RoleRequest request = roleRequest(null);
		DraftCatalogService service = serviceForDraft(workspaceId);
		when(repository.roleExists(workspaceId, roleId)).thenReturn(true);

		service.updateRole(workspaceId, roleId, request);

		verify(repository).updateRole(workspaceId, roleId, request);
		verify(repository, never()).countMatchingMembers(eq(workspaceId), any());
		verify(repository, never()).replaceRoleHolders(any(), any());
	}

	@Test
	void rejectsUnknownHolderBeforeChangingRoleMetadataOrAssignments() {
		UUID workspaceId = UUID.fromString("00000000-0000-0000-0000-000000000131");
		UUID roleId = UUID.fromString("00000000-0000-0000-0000-000000000132");
		Set<UUID> holderIds = Set.of(
				UUID.fromString("00000000-0000-0000-0000-000000000133"),
				UUID.fromString("00000000-0000-0000-0000-000000000134"));
		RoleRequest request = roleRequest(holderIds);
		DraftCatalogService service = serviceForDraft(workspaceId);
		when(repository.roleExists(workspaceId, roleId)).thenReturn(true);
		when(repository.countMatchingMembers(workspaceId, holderIds)).thenReturn(1);

		assertThatThrownBy(() -> service.updateRole(workspaceId, roleId, request))
				.isInstanceOf(DraftCatalogNotFoundException.class);

		verify(repository, never()).updateRole(workspaceId, roleId, request);
		verify(repository, never()).replaceRoleHolders(any(), any());
		verify(repository, never()).touchWorkspace(workspaceId);
	}

	@Test
	void copiesSuppliedHolderIdsSoCallersCannotMutateTheRequestAfterConstruction() {
		Set<UUID> suppliedIds = new LinkedHashSet<>();
		suppliedIds.add(UUID.fromString("00000000-0000-0000-0000-000000000141"));
		RoleRequest request = roleRequest(suppliedIds);

		suppliedIds.add(UUID.fromString("00000000-0000-0000-0000-000000000142"));

		assertThat(request.holderMemberIds()).containsExactly(UUID.fromString("00000000-0000-0000-0000-000000000141"));
	}

	private DraftCatalogService serviceForDraft(UUID workspaceId) {
		when(repository.findWorkspaceStatus(workspaceId)).thenReturn(Optional.of("DRAFT"));
		return new DraftCatalogService(repository);
	}

	private RoleRequest roleRequest(Set<UUID> holderMemberIds) {
		return new RoleRequest("Release Manager", "Approves production releases", Sensitivity.HIGH, null, holderMemberIds);
	}
}
