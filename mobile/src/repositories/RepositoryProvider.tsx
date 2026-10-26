import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Repositories } from './contracts';
import { createRepositories } from './createRepositories';

const RepositoryContext = createContext<Repositories | null>(null);

/** Provides the active repositories. Tests pass their own `repositories`. */
export function RepositoryProvider({ repositories, children }: { repositories?: Repositories; children: ReactNode }) {
  const value = useMemo(() => repositories ?? createRepositories(), [repositories]);
  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): Repositories {
  const repos = useContext(RepositoryContext);
  if (!repos) throw new Error('useRepositories must be used inside <RepositoryProvider>');
  return repos;
}
