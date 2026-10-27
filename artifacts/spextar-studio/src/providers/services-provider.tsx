import { createContext, useContext, type ReactNode } from 'react';
import type { Services } from '@/services/contracts';

const ServicesContext = createContext<Services | null>(null);

/** Demo and Supabase adapters share a UI contract; tests inject isolated services. */
export function ServicesProvider({ children, services }: { children: ReactNode; services: Services }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices must be used inside <ServicesProvider>');
  return ctx;
}
