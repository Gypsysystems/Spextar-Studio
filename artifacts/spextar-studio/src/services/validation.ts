import { z } from 'zod';
import type { DemoSession } from '@/domain/types';

export const workspaceInputSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(400),
});
export const projectInputSchema = workspaceInputSchema.extend({
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/),
  product: z.string().trim().max(120),
});
const demoSessionSchema = z.object({
  mode: z.literal('demo'), userId: z.string().min(1), name: z.string().min(1),
  email: z.string().email(), initials: z.string().min(1), role: z.string().min(1),
  organizationId: z.string().min(1), startedAt: z.string().datetime(),
});
export function isDemoSession(value: unknown): value is DemoSession {
  return demoSessionSchema.safeParse(value).success;
}

const timestamp = z.string().datetime();
const source = z.enum(['fixture', 'created', 'imported']);
const workspaceSchema = z.object({
  id: z.string().min(1), organizationId: z.string().min(1), name: z.string(),
  description: z.string(), memberCount: z.number().int().nonnegative(),
  createdAt: timestamp, updatedAt: timestamp, source,
});
const projectSchema = z.object({
  id: z.string().min(1), workspaceId: z.string().min(1), name: z.string(), key: z.string(),
  description: z.string(), product: z.string(), owner: z.string(),
  status: z.enum(['active', 'in-review', 'archived']), createdAt: timestamp, updatedAt: timestamp, source,
});
const documentSchema = z.object({
  id: z.string().min(1), projectId: z.string().min(1), title: z.string(),
  type: z.enum(['guide', 'procedure', 'reference', 'release-notes']),
  status: z.enum(['draft', 'in-review', 'approved']), owner: z.string(), version: z.string(),
  summary: z.string(), updatedAt: timestamp,
  topics: z.array(z.object({
    id: z.string().min(1), title: z.string(), kind: z.enum(['concept', 'task', 'reference']),
    level: z.number().int().min(1).max(4), body: z.array(z.string()),
  })),
});
export const isWorkspaceArray = (value: unknown): value is import('@/domain/types').Workspace[] =>
  z.array(workspaceSchema).safeParse(value).success;
export const isProjectArray = (value: unknown): value is import('@/domain/types').Project[] =>
  z.array(projectSchema).safeParse(value).success;
export const isDocumentArray = (value: unknown): value is import('@/domain/types').DocumentRecord[] =>
  z.array(documentSchema).safeParse(value).success;
