import { useQuery } from '@tanstack/react-query';
import { queryKeys, useRepositories } from '@/repositories';

export function useOffers() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.offers, queryFn: () => repos.content.getOffers(), staleTime: 10 * 60_000 });
}
