import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useRepositories } from '@/repositories';
import type { CateringEnquiryRequest } from '@/types';

export function useCateringPackages() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.cateringPackages, queryFn: () => repos.catering.getPackages(), staleTime: 30 * 60_000 });
}

export function useCateringEnquiries() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.cateringEnquiries, queryFn: () => repos.catering.getEnquiries() });
}

export function useCreateCateringEnquiry() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CateringEnquiryRequest) => repos.catering.createEnquiry(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cateringEnquiries }),
  });
}
