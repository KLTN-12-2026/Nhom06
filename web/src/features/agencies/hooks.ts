import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAgency,
  fetchAgencies,
  type ListAgenciesParams,
  updateAgency,
  updateAgencyStatus,
} from './api';
import {
  type AgencyStatus,
  type CreateAgencyPayload,
  type UpdateAgencyPayload,
} from './types';

export function useAgenciesQuery(params: ListAgenciesParams) {
  return useQuery({
    queryKey: ['agencies', params],
    queryFn: () => fetchAgencies(params),
  });
}

export function useCreateAgencyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAgencyPayload) => createAgency(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agencies'] });
    },
  });
}

export function useUpdateAgencyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateAgencyPayload }) =>
      updateAgency(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agencies'] });
    },
  });
}

export function useUpdateAgencyStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AgencyStatus }) =>
      updateAgencyStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agencies'] });
    },
  });
}
