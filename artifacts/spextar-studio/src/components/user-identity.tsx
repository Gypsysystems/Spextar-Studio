import { useQuery } from '@tanstack/react-query';
import { useStudioSession } from '@/providers/session-provider';
import { useServices } from '@/providers/services-provider';
import { identityLabel, isIdentityId } from '@/lib/presentation';

export function useIdentityLabels(ids: string[]) {
  const services = useServices();
  const { data: session } = useStudioSession();
  const requested = [...new Set(ids.filter(Boolean))].sort();
  const query = useQuery({
    queryKey: ['identity-labels', services.mode, session?.userId, session?.organizationId, requested],
    queryFn: () => services.identities!.resolve(requested),
    enabled: !!session && services.mode === 'backend' && !!services.identities && requested.length > 0,
    retry: false,
    staleTime: 60_000,
  });
  return (id?: string | null, name?: string | null) => {
    if (id && query.data?.[id]) return identityLabel(query.data[id]);
    if (id && id === session?.userId) return identityLabel(session.name, session.email);
    return identityLabel(name);
  };
}

export function UserIdentity({ userId, name }: { userId?: string | null; name?: string | null }) {
  const id = userId || (isIdentityId(name) ? name : undefined);
  const label = useIdentityLabels(id ? [id] : []);
  return <span className="break-words [overflow-wrap:anywhere]">{label(id, name)}</span>;
}
