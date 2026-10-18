/** Normalize Unicode fallback bytes before passing RTF to the text parser. */
export function stripUnicodeFallback(input: string): string {
  let output = '',
    index = 0,
    fallbackCount = 1
  const stack: number[] = []
  while (index < input.length) {
    const char = input[index]
    if (char === '{') {
      stack.push(fallbackCount)
      output += char
      index++
      continue
    }
    if (char === '}') {
      fallbackCount = stack.pop() ?? 1
      output += char
      index++
      continue
    }
    if (char !== '\\') {
      output += char
      index++
      continue
    }
    const match = /^\\([a-z]+)(-?\d+)? ?/i.exec(input.slice(index))
    if (!match) {
      const length = input[index + 1] === "'" ? 4 : 2
      output += input.slice(index, index + length)
      index += length
      continue
    }
    const command = match[1],
      argument = Number(match[2])
    index += match[0].length
    if (command === 'uc') fallbackCount = Math.max(0, Math.min(32, argument))
    if (command === 'u' && Number.isFinite(argument)) {
      output += `\\u${argument} `
      for (
        let skipped = 0;
        skipped < fallbackCount && index < input.length && !/[{}]/.test(input[index]);
        skipped++
      ) {
        if (input[index] !== '\\') index++
        else if (input[index + 1] === "'") index += 4
        else {
          const token = /^\\(?:[a-z]+-?\d* ?|.)/i.exec(input.slice(index))
          index += token?.[0].length ?? 1
        }
      }
    } else {
      output += match[0]
      if (command === 'bin' && Number.isFinite(argument) && argument > 0) {
        output += input.slice(index, index + argument)
        index += argument
      }
    }
  }
  return output
}
export function rtfPlain(nodes: { value?: string; content?: any[] }[]): string {
  return nodes
    .map((node) =>
      Array.isArray(node.content) ? `${rtfPlain(node.content)}\n\n` : String(node.value ?? '')
    )
    .join('')
}
