import { z } from 'zod'

export const settingsSchema = z.object({
  voice: z.string().refine(
    (value) =>
      value === 'system-default' ||
      // Preserve existing manuscripts and audio manifests; availability is validated before synthesis.
      /^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9]+Neural$/.test(value) ||
      /^(?:piper|sapi32|sapi64):[a-f0-9]{64}$/.test(value),
    'Voz no válida.'
  ),
  speed: z.number().min(0.5).max(1.75),
  pitch: z.number().int().min(-30).max(30),
  volume: z.number().min(0.3).max(1)
})
export const draftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  text: z.string(),
  settings: settingsSchema,
  projectId: z.uuid().nullable().optional(),
  pauseMs: z.number().int().min(0).max(3000).optional(),
  blockOverrides: z
    .record(
      z.string().regex(/^[a-f0-9]+-\d+$/),
      z.object({
        voice: settingsSchema.shape.voice.optional(),
        pauseMs: z.number().int().min(0).max(3000).optional()
      })
    )
    .optional()
})
export const startSchema = draftSchema.extend({
  text: z
    .string()
    .refine((value) => value.trim().length > 0, 'Escribe o importa un texto primero.'),
  preview: z.boolean().optional()
})
export const idSchema = z.uuid()
