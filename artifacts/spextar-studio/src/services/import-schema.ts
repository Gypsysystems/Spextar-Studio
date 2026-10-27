import { z } from 'zod';

/**
 * SPEXTAR demo import contract, version 1. Documented in README.md.
 *
 * {
 *   "spextarImport": 1,
 *   "project": {
 *     "name": "Meridian X5 Quick Start",
 *     "key": "MX5",                       // optional, 2–10 chars, A–Z then A–Z/0–9
 *     "description": "…",                 // optional
 *     "product": "Meridian X5",           // optional
 *     "documents": [                      // optional, max 50
 *       { "title": "Unboxing", "type": "guide",
 *         "topics": [ { "title": "Package contents", "kind": "reference", "level": 1, "body": ["…"] } ] }
 *     ]
 *   }
 * }
 */

export const MAX_IMPORT_BYTES = 1024 * 1024;

const topicSchema = z.object({
  title: z.string().trim().min(1, 'Topic title is required').max(160),
  kind: z.enum(['concept', 'task', 'reference']).default('concept'),
  level: z.number().int().min(1).max(4).default(1),
  body: z.union([z.string(), z.array(z.string())]).optional(),
});

const documentSchema = z.object({
  title: z.string().trim().min(1, 'Document title is required').max(160),
  type: z.enum(['guide', 'procedure', 'reference', 'release-notes']).default('guide'),
  summary: z.string().max(400).optional(),
  topics: z.array(topicSchema).max(200).default([]),
});

export const importSchema = z.object({
  spextarImport: z.literal(1, {
    errorMap: () => ({ message: 'Missing "spextarImport": 1 version marker' }),
  }),
  project: z.object({
    name: z.string().trim().min(3, 'Project name must be at least 3 characters').max(80),
    key: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Key must be 2–10 uppercase letters or digits, starting with a letter')
      .optional(),
    description: z.string().max(400).default(''),
    product: z.string().max(80).default(''),
    documents: z.array(documentSchema).max(50).default([]),
  }),
});

export type ImportPayload = z.infer<typeof importSchema>;

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((i) => {
    const path = i.path.length ? i.path.join('.') : 'root';
    return `${path}: ${i.message}`;
  });
}

export const IMPORT_EXAMPLE = {
  spextarImport: 1,
  project: {
    name: 'Meridian X5 Quick Start',
    key: 'MX5',
    description: 'Short-form setup guide shipped in the X5 accessory box.',
    product: 'Meridian X5',
    documents: [
      {
        title: 'First power-on',
        type: 'procedure',
        topics: [
          { title: 'Before you begin', kind: 'concept', level: 1, body: ['Allow the unit to reach room temperature for 2 hours.'] },
          { title: 'Connect the power module', kind: 'task', level: 2, body: ['Seat the PSU-24 connector until it clicks.'] },
        ],
      },
    ],
  },
};
