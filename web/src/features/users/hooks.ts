import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createUser,
  fetchPermissionMatrix,
  fetchRoles,
  fetchUsers,
  type ListUsersParams,
  updateUserProfile,
  updateUserRole,
  updateUserStatus,
} from './api';
import { type CreateUserPayload, type UpdateUserProfilePayload } from './types';

export function useUsersQuery(params: ListUsersParams, enabled = true) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => fetchUsers(params),
    enabled,
  });
}

export function useRolesQuery(enabled = true) {
  return useQuery({
    queryKey: ['roles'],
    queryFn: fetchRoles,
    enabled,
  });
}

export function usePermissionMatrixQuery(enabled = true) {
  return useQuery({
    queryKey: ['permissions', 'matrix'],
    queryFn: fetchPermissionMatrix,
    enabled,
  });
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUserProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserProfilePayload }) =>
      updateUserProfile(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUserStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'locked' }) =>
      updateUserStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUserRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roleCode }: { id: string; roleCode: string }) =>
      updateUserRole(id, roleCode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
