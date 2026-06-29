import { AppSchema } from '../types'

type Notifier = {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
  success: (msg: string) => void
}

let notifier: Notifier = {
  info(_msg) {},
  warn(_msg) {},
  error(_msg) {},
  success(_msg) {},
}
let emitter = (_payload: { type: string }) => {}

export function setEmitter(emit: (payload: { type: string }) => void) {
  emitter = emit
}

export function emit<T extends { type: string }>(payload: T) {
  emitter(payload)
}

export function setNotifier(notify: Notifier) {
  notifier = notify
}

export function notify() {
  return notifier
}

export function sanitiseAndTrim(
  text: string,
  prompt: string,
  char: AppSchema.Character,
  characters: Record<string, AppSchema.Character> | undefined,
  members: AppSchema.Profile[]
) {
  const parsed = sanitise(text.replace(prompt, ''))
  const trimmed = trimResponseV2(parsed, char, members, characters, ['END_OF_DIALOG'])
    .split(`${char.name}:`)
    .join('')
  // Return the trimmed text even when it's empty. An empty trim means the reply
  // led with another speaker or "Narrator:"/"Director:" — i.e. the model wrote a
  // foreign turn / a whole scene (common with the chat finetune in event chats).
  // The old `|| parsed` fallback resurrected that raw multi-speaker screenplay,
  // which is exactly the off-the-rails output we want to suppress.
  return trimmed
}

export function sanitise(generated: string) {
  // If want to support code blocks we need to remove the excess whitespace removal as it breaks indents
  return generated.trim()
}

/**
 * Extract a single character's turn from a multi-speaker "screenplay" reply.
 *
 * The chat finetune, in an event/group scene, tends to write the whole scene as
 * one reply — `Narrator: ...`, `Jeremy: ...`, `Julia: ...` — ignoring the "reply
 * only as X" directive. Rather than drop that (empty bubble) or show it raw (off
 * the rails), pull out just the elected speaker's FIRST contiguous turn.
 *
 * Lines are `Name: text` (tolerating leading markdown). The speaker's own lines
 * (and unlabeled continuations of them, plus any leading unlabeled text — the
 * prefilled speaker's words) are kept until another speaker/`Narrator:`/`Director:`
 * label appears, which ends the turn. Returns '' if the speaker never speaks.
 */
export function extractSpeakerTurn(text: string, speakerName: string): string {
  const speaker = speakerName.trim().toLowerCase()
  // "Name:" at the start of a line, tolerating leading markdown (* _ > # -).
  const labelRe = /^[\s*_>#-]*([A-Za-z][A-Za-z0-9 ._'-]{0,29}?)\s*:\s?/
  const out: string[] = []
  let started = false
  let inSpeaker = false

  for (const line of text.split('\n')) {
    const m = line.match(labelRe)
    if (m) {
      const name = m[1].trim().toLowerCase()
      const rest = line.slice(m[0].length)
      if (name === speaker) {
        started = true
        inSpeaker = true
        if (rest.trim()) out.push(rest)
      } else {
        // Another speaker / Narrator / Director. If we already captured the
        // speaker's turn, it's over; otherwise keep scanning for them.
        if (started && out.length) break
        inSpeaker = false
      }
    } else if (inSpeaker) {
      out.push(line)
    } else if (!started) {
      // Leading unlabeled text before any label — the prefilled speaker's own
      // words. Treat it as theirs.
      out.push(line)
      started = true
      inSpeaker = true
    }
  }

  return out.join('\n').trim()
}

export function trimResponseV2(
  generated: string,
  char: AppSchema.Character,
  members: AppSchema.Profile[],
  bots: Record<string, AppSchema.Character> | undefined,
  endTokens: string[] = []
) {
  const allEndTokens = getEndTokens(null, members)

  generated = generated.split(`${char.name} :`).join(`${char.name}:`)

  for (const member of members) {
    if (!member.handle) continue
    generated = generated.split(`${member.handle} :`).join(`${member.handle}:`)
  }

  if (bots) {
    for (const bot of Object.values(bots)) {
      if (!bot) continue
      if (bot?._id === char._id) continue
      endTokens.push(`${bot.name}:`)
    }
  }

  // Scene narration is a separate "Narrator"/"Director" message. Cut a reply that
  // switches into a narration passage (catches the cases the stop sequence misses:
  // no leading newline, or text streamed past the stop). Both the tight and the
  // spaced ("Narrator :") forms, since RP models emit either. Skip if the speaker
  // is itself the narrator/director.
  for (const speaker of ['Narrator', 'Director']) {
    if (char.name === speaker) continue
    endTokens.push(`${speaker}:`, `${speaker} :`)
  }

  let index = -1
  let trimmed = allEndTokens.concat(...endTokens).reduce((prev, endToken) => {
    const idx = generated.indexOf(endToken)

    if (idx === -1) return prev

    const text = generated.slice(0, idx)
    if (index === -1 || idx < index) {
      index = idx
      return text
    }

    return prev
  }, '')

  if (index === -1) {
    return sanitise(generated.split(`${char.name}:`).join(''))
  }

  return sanitise(trimmed.split(`${char.name}:`).join(''))
}

export function getEndTokens(
  char: AppSchema.Character | null,
  members: AppSchema.Profile[],
  endTokens: string[] = []
) {
  const baseEndTokens = ['END_OF_DIALOG', '<END>'].concat(endTokens)

  if (char) {
    baseEndTokens.push(`${char.name}:`, `${char.name} :`)
  }

  for (const member of members) {
    baseEndTokens.push(`${member.handle}:`, `${member.handle} :`)
  }

  const uniqueTokens = Array.from(new Set(baseEndTokens))
  return uniqueTokens
}
