import { randomUUID } from 'node:crypto'
import { atomicJson, readJson } from './core/files'
import {
  librarySchema,
  projectInputSchema,
  EMPTY_LIBRARY,
  type LibraryState
} from '../shared/library'

/** Project membership lives outside immutable audio manifests, including while a worker writes them. */
export class ProjectStore {
  private value: LibraryState = structuredClone(EMPTY_LIBRARY)
  private pending: Promise<unknown> = Promise.resolve()
  constructor(
    private file: string,
    private changed: (value: LibraryState) => void = () => {}
  ) {}
  snapshot() {
    return structuredClone(this.value)
  }
  async load() {
    try {
      this.value = librarySchema.parse(await readJson(this.file))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  requireProject(id: string | null | undefined) {
    if (id && !this.value.projects.some((project) => project.id === id))
      throw new Error('El proyecto ya no existe. Elige otro proyecto.')
  }
  private commit(edit: (value: LibraryState) => void): Promise<LibraryState> {
    const operation = this.pending
      .catch(() => {})
      .then(async () => {
        const next = this.snapshot()
        edit(next)
        librarySchema.parse(next)
        await atomicJson(this.file, next)
        this.value = next
        this.changed(this.snapshot())
        return this.snapshot()
      })
    this.pending = operation
    return operation
  }
  save(raw: unknown) {
    const input = projectInputSchema.parse(raw)
    return this.commit((state) => {
      if (
        state.projects.some(
          (project) =>
            project.id !== input.id &&
            project.name.toLocaleLowerCase() === input.name.toLocaleLowerCase()
        )
      )
        throw new Error('Ya existe un proyecto con ese nombre.')
      if (input.id) {
        const project = state.projects.find((project) => project.id === input.id)
        if (!project) throw new Error('El proyecto ya no existe.')
        Object.assign(project, input)
      } else
        state.projects.push({ ...input, id: randomUUID(), createdAt: new Date().toISOString() })
    })
  }
  remove(id: string) {
    return this.commit((state) => {
      if (!state.projects.some((project) => project.id === id))
        throw new Error('El proyecto ya no existe.')
      state.projects = state.projects.filter((project) => project.id !== id)
      for (const [job, project] of Object.entries(state.assignments))
        if (project === id) delete state.assignments[job]
    })
  }
  assign(job: string, project: string | null) {
    return this.commit((state) => {
      if (project && !state.projects.some((item) => item.id === project))
        throw new Error('El proyecto ya no existe.')
      if (project) state.assignments[job] = project
      else delete state.assignments[job]
    })
  }
  async close() {
    await this.pending.catch(() => {})
  }
}
