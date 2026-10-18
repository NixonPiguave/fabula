import { z } from 'zod'

export const projectInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-f]{6}$/i)
})
export const projectSchema = projectInputSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime()
})
export const librarySchema = z.object({
  projects: z.array(projectSchema).max(500),
  assignments: z.record(z.uuid(), z.uuid())
})
export type ProjectInput = z.infer<typeof projectInputSchema>
export type Project = z.infer<typeof projectSchema>
export type LibraryState = z.infer<typeof librarySchema>
export const EMPTY_LIBRARY: LibraryState = { projects: [], assignments: {} }
