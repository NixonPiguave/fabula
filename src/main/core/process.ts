import { spawn } from 'node:child_process'

export async function command(
  executable: string,
  args: string[],
  options: {
    cwd?: string
    signal?: AbortSignal
    input?: string
    onStderr?: (text: string) => void
    onPid?: (pid: number | undefined) => void
  } = {}
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']
    })
    if (options.input !== undefined) {
      child.stdin?.on('error', () => {})
      child.stdin?.end(options.input, 'utf8')
    }
    let stdout = '',
      stderr = ''
    options.onPid?.(child.pid)
    const abort = () => child.kill()
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) child.kill()
    child.stdout!.on('data', (bytes) => {
      stdout = (stdout + bytes.toString()).slice(-150000)
    })
    child.stderr!.on('data', (bytes) => {
      const text = bytes.toString()
      stderr = (stderr + text).slice(-4000)
      options.onStderr?.(text)
    })
    child.once('error', reject)
    child.once('close', (code) => {
      options.signal?.removeEventListener('abort', abort)
      options.onPid?.(undefined)
      if (options.signal?.aborted) reject(new Error('Operación cancelada.'))
      else if (code !== 0) reject(new Error(`El proceso terminó con código ${code}: ${stderr}`))
      else resolve(stdout)
    })
  })
}
