import type { ReactNode } from 'react';
import { Redirect, useParams, useSearch } from 'wouter';
import { projectBase } from './sections';

export function LegacyProjectList({ workflow, children, status }: { workflow?: 'review' | 'publish'; children?: ReactNode; status?: 'draft' | 'published' }) {
  const { workspaceId = '', projectId = '' } = useParams();
  const search = useSearch();
  // Retain document-specific workflow links and their evidence/immutable releases.
  if (workflow && new URLSearchParams(search).get('document')) return children;
  const filter = status ?? (workflow === 'review' ? 'in-review' : workflow === 'publish' ? 'approved' : 'all');
  return <Redirect replace to={`${projectBase(workspaceId, projectId)}?status=${filter}`} />;
}
