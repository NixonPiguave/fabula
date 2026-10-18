import { describe, it, expect } from 'vitest'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ProjectStore } from '../src/main/projects'
import { preferencesSchema } from '../src/shared/studio'
import {
  appearanceVariables,
  COLOR_PRESETS,
  contrastRatio,
  readableText
} from '../src/shared/appearance'

async function folder() {
  const root = join(process.cwd(), '.tools', 'project-tests')
  await mkdir(root, { recursive: true })
  return mkdtemp(join(root, 'case-'))
}

describe('project persistence without changing audio manifests', () => {
  it('serializes concurrent edits and memberships, then survives reload', async () => {
    const path = join(await folder(), 'library.json'),
      store = new ProjectStore(path)
    await store.load()
    await Promise.all([
      store.save({ name: 'Mundo A', color: '#aabbcc' }),
      store.save({ name: 'Mundo B', color: '#bbccdd' })
    ])
    const projects = store.snapshot().projects,
      a = randomUUID(),
      b = randomUUID()
    await Promise.all([store.assign(a, projects[0].id), store.assign(b, projects[0].id)])
    await store.save({ id: projects[0].id, name: 'Saga A', color: '#ccddee' })
    const restored = new ProjectStore(path)
    await restored.load()
    expect(restored.snapshot().projects[0].name).toBe('Saga A')
    expect(restored.snapshot().assignments).toEqual({ [a]: projects[0].id, [b]: projects[0].id })
    await restored.remove(projects[0].id)
    expect(restored.snapshot().assignments).toEqual({})
    expect(restored.snapshot().projects).toHaveLength(1)
  })
  it('rejects duplicate names and unknown IDs without corrupting the previous state', async () => {
    const path = join(await folder(), 'library.json'),
      store = new ProjectStore(path)
    await store.save({ name: 'Una saga', color: '#aabbcc' })
    const previous = await readFile(path, 'utf8')
    await expect(store.save({ name: ' UNA SAGA ', color: '#aaaaaa' })).rejects.toThrow('Ya existe')
    await expect(store.assign(randomUUID(), randomUUID())).rejects.toThrow('ya no existe')
    await expect(store.save({ id: randomUUID(), name: 'Error', color: '#ffffff' })).rejects.toThrow(
      'ya no existe'
    )
    expect(await readFile(path, 'utf8')).toBe(previous)
    await store.save({ name: 'Continúa funcionando', color: '#ddeeff' })
    expect(store.snapshot().projects).toHaveLength(2)
  })
  it('preserves malformed metadata instead of overwriting it on load', async () => {
    const path = join(await folder(), 'library.json')
    await writeFile(path, '{damaged')
    await expect(new ProjectStore(path).load()).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe('{damaged')
  })
})
describe('custom palette compatibility and readable foregrounds', () => {
  it('loads version 0.2 preferences without changing the selected accent', () => {
    const prefs = preferencesSchema.parse({ theme: 'light', accent: 'violet' })
    expect(prefs.customColors.enabled).toBe(false)
    expect(prefs.accent).toBe('violet')
    expect(appearanceVariables(prefs.customColors)).toEqual({})
    expect(
      preferencesSchema.safeParse({
        customColors: { ...prefs.customColors, background: 'url(file:///test)' }
      }).success
    ).toBe(false)
  })
  it('keeps foreground and muted text above 4.5:1 for presets and the RGB color grid', () => {
    const colors = COLOR_PRESETS.flatMap((preset) => [
      preset.background,
      preset.sidebar,
      preset.panel,
      preset.player,
      preset.accent
    ])
    for (let r = 0; r <= 255; r += 17)
      for (let g = 0; g <= 255; g += 17)
        for (let b = 0; b <= 255; b += 17)
          colors.push(
            ('#' +
              [r, g, b]
                .map((value) => value.toString(16).padStart(2, '0'))
                .join('')) as (typeof colors)[number]
          )
    for (const bg of colors) {
      expect(contrastRatio(bg, readableText(bg))).toBeGreaterThanOrEqual(4.5)
      const variables = appearanceVariables({ ...COLOR_PRESETS[0], background: bg, enabled: true })
      expect(contrastRatio(bg, variables['--background-muted'])).toBeGreaterThanOrEqual(4.5)
    }
  })
})
