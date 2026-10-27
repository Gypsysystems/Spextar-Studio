import { format, formatDistanceToNowStrict } from 'date-fns';
import type { DocumentStatus, DocumentType, ProjectStatus } from '@/domain/types';

export function relative(iso: string): string {
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`;
  } catch {
    return '';
  }
}

export function shortDate(iso: string): string {
  try {
    return format(new Date(iso), 'd MMM yyyy');
  } catch {
    return '';
  }
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  'in-review': 'In review',
  archived: 'Archived',
};

export const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: 'Draft',
  'in-review': 'In review',
  approved: 'Approved',
  published: 'Published',
};

export const DOC_TYPE_LABEL: Record<DocumentType, string> = {
  guide: 'Guide',
  procedure: 'Procedure',
  reference: 'Reference',
  'release-notes': 'Release notes',
};

export const statusDot: Record<string, string> = {
  active: 'bg-emerald-500',
  approved: 'bg-emerald-500',
  published: 'bg-emerald-500',
  'in-review': 'bg-amber-500',
  draft: 'bg-[hsl(var(--primary))]',
  archived: 'bg-muted-foreground/50',
};
