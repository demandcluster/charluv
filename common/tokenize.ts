// Lightweight token counting (cl100k_base) for prompt-budget estimates on the
// web. Previously routed through the client embeddings worker; that worker is
// retired, so we load js-tiktoken directly. js-tiktoken is ESM-only, so it's
// imported dynamically (this file is type-checked under the CommonJS srv
// config even though only the web bundle uses it).
let encoder: any
let loading: Promise<any> | null = null

async function enc() {
  if (encoder) return encoder
  if (!loading) {
    loading = import('js-tiktoken').then((m) => {
      encoder = m.getEncoding('cl100k_base')
      return encoder
    })
  }
  return loading
}

export async function encode(text: string): Promise<number[]> {
  return (await enc()).encode(text)
}

export async function decode(tokens: number[]): Promise<string> {
  return (await enc()).decode(tokens)
}

export async function tokenize(text: string) {
  return (await enc()).encode(text).length
}

export async function getEncoder() {
  const e = await enc()
  return (text: string) => e.encode(text).length as number
}

export async function countTokens(text: string) {
  return (await enc()).encode(text).length
}
