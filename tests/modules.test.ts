import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ModuleManager } from '../src/main/modules'

afterEach(() => vi.unstubAllGlobals())
describe('optional module download integrity and cancellation', () => {
  it('rejects mismatched downloads without installing an executable or model', async () => {
    const root = resolve('.tools/module-tests', randomUUID())
    await mkdir(root, { recursive: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
    )
    const manager = new ModuleManager(root, () => {})
    await expect(manager.install('ocr')).rejects.toThrow('integridad')
    expect(manager.ready('ocr')).toBe(false)
    await expect(readFile(join(root, 'ocr/ready.json'))).rejects.toThrow()
  })
  it('aborts an ongoing stream and leaves the module retryable', async () => {
    const root = resolve('.tools/module-tests', randomUUID())
    let cancelled = false
    const fetchMock = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start() {},
            cancel() {
              cancelled = true
            }
          })
        )
    )
    vi.stubGlobal('fetch', fetchMock)
    const manager = new ModuleManager(root, () => {})
    const installing = manager.install('ocr')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    manager.cancel()
    await expect(installing).rejects.toThrow('cancelada')
    expect(manager.states()[0].status).toBe('failed')
    expect(cancelled).toBe(true)
  })
})
