import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useRepositories } from '@/repositories';
import type { ID, ReservationRequest } from '@/types';

export function useReservations() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.reservations, queryFn: () => repos.reservations.getReservations() });
}

export function useCreateReservation() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ReservationRequest) => repos.reservations.createReservation(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reservations }),
  });
}

export function useCancelReservation() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => repos.reservations.cancelReservation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reservations }),
  });
}
