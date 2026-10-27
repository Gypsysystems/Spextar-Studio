import {
  BookMarked,
  Files,
  History,
  Home,
  Palette,
  PenLine,
  Puzzle,
  Rocket,
  Settings,
  SpellCheck,
  SquareCheckBig,
  Variable,
  type LucideIcon,
} from 'lucide-react';

export type SectionId =
  | 'home'
  | 'documents'
  | 'author'
  | 'review'
  | 'publish'
  | 'reusable-content'
  | 'variables-conditions'
  | 'style-guide'
  | 'history'
  | 'brand-outputs'
  | 'settings';

export interface ProjectSection {
  id: SectionId;
  label: string;
  path: string;
  icon: LucideIcon;
  group: 'Content' | 'Workflow' | 'Governance' | 'Project';
  description: string;
  planned: string[];
}

export const PROJECT_SECTIONS: ProjectSection[] = [
  { id: 'home', label: 'Project Home', path: '', icon: Home, group: 'Content', description: 'Overview of this project.', planned: [] },
  { id: 'documents', label: 'Documents', path: '/documents', icon: Files, group: 'Content', description: 'Every document in the project and its topic structure.', planned: [] },
  { id: 'author', label: 'Author', path: '/author', icon: PenLine, group: 'Content', description: 'Write and structure topics.', planned: [] },
  {
    id: 'review', label: 'Review', path: '/review', icon: SquareCheckBig, group: 'Workflow',
    description: 'Route documents to subject-matter experts and track sign-off.',
    planned: ['Reviewer assignment per document', 'Inline comments anchored to topics', 'Approval with audit record'],
  },
  {
    id: 'publish', label: 'Publish', path: '/publish', icon: Rocket, group: 'Workflow',
    description: 'Produce deliverables from approved documents.',
    planned: ['Publication targets (HTML portal, PDF)', 'Version baselines and release labels', 'Publish history with rollback'],
  },
  {
    id: 'reusable-content', label: 'Reusable content', path: '/reusable-content', icon: Puzzle, group: 'Governance',
    description: 'Shared snippets and topics referenced across documents.',
    planned: ['Snippet library with usage counts', 'Reference tracking across documents', 'Change impact preview'],
  },
  {
    id: 'variables-conditions', label: 'Variables & conditions', path: '/variables-conditions', icon: Variable, group: 'Governance',
    description: 'Product names, values and conditional text for each audience or variant.',
    planned: ['Variable sets per product variant', 'Condition tags for audience and platform', 'Resolution preview'],
  },
  {
    id: 'style-guide', label: 'Style guide', path: '/style-guide', icon: SpellCheck, group: 'Governance',
    description: 'Terminology and writing rules for this project.',
    planned: ['Approved and forbidden terms', 'Rule-based checks (non-AI)', 'Per-project overrides'],
  },
  {
    id: 'brand-outputs', label: 'Brand outputs', path: '/brand-outputs', icon: Palette, group: 'Governance',
    description: 'Templates and brand profiles applied when publishing.',
    planned: ['Output templates for PDF and HTML', 'Brand profile assignment', 'Template preview with sample content'],
  },
  {
    id: 'history', label: 'History', path: '/history', icon: History, group: 'Project',
    description: 'Change history for documents and topics.',
    planned: ['Per-topic revision list', 'Side-by-side comparison', 'Restore a previous revision'],
  },
  {
    id: 'settings', label: 'Settings', path: '/settings', icon: Settings, group: 'Project',
    description: 'Project details, members and permissions.',
    planned: ['Rename project and change key', 'Members and roles', 'Archive project'],
  },
];

export const SECTION_BY_ID = Object.fromEntries(PROJECT_SECTIONS.map((s) => [s.id, s])) as Record<SectionId, ProjectSection>;

export const projectBase = (workspaceId: string, projectId: string) =>
  `/workspaces/${workspaceId}/projects/${projectId}`;

export { BookMarked as DocumentIcon };
