import { v4 as uuid } from 'uuid'
import { GateBackend } from './local'
import { Kind, Priority } from './types'
import { getUserSubscriptionTier } from '/common/util'
import { AppSchema } from '/common/types/schema'

export type GateOpts = {
  kind: Kind
  priority: Priority
  userId?: string
  socketId?: string
  requestId?: string
}

export type PositionEvent = {
  type: 'queue-position'
  kind: Kind
  position: number
  requestId?: string
}

export type Sender = {
  toUser: (userId: string, ev: PositionEvent) => void
  toGuest: (socketId: string, ev: PositionEvent) => void
}

export class PriorityGate {
  constructor(
    private backend: GateBackend,
    private sender: Sender,
    private now: () => number = () => Date.now()
  ) {}

  setPauseText(pause: boolean) {
    this.backend.setPauseText(pause)
  }

  async run<T>(opts: GateOpts, fn: () => Promise<T>): Promise<T> {
    const id = uuid()
    await this.enter(id, opts)
    try {
      return await fn()
    } finally {
      await this.backend.release(id)
    }
  }

  async *gateStream<T>(opts: GateOpts, makeGen: () => AsyncGenerator<T>): AsyncGenerator<T> {
    const id = uuid()
    await this.enter(id, opts)
    try {
      const gen = makeGen()
      for await (const chunk of gen) {
        yield chunk
      }
    } finally {
      await this.backend.release(id)
    }
  }

  private async enter(id: string, opts: GateOpts) {
    await this.backend.acquire({
      id,
      kind: opts.kind,
      priority: opts.priority,
      enqueuedAt: this.now(),
      onPosition: (position) => this.emit(opts, position),
    })
    this.emit(opts, 0) // clear the badge on admission
  }

  private emit(opts: GateOpts, position: number) {
    const ev: PositionEvent = {
      type: 'queue-position',
      kind: opts.kind,
      position,
      requestId: opts.requestId,
    }
    if (opts.userId) this.sender.toUser(opts.userId, ev)
    else if (opts.socketId) this.sender.toGuest(opts.socketId, ev)
  }
}

export function priorityForUser(
  user: Pick<AppSchema.User, '_id' | 'patreon' | 'billing' | 'sub' | 'manualSub' | 'premium' | 'premiumUntil' | 'username'>,
  isGuest: boolean,
  tiers: AppSchema.SubscriptionTier[]
): Priority {
  if (isGuest) return 2
  const sub = getUserSubscriptionTier(user, tiers)
  return sub?.tier ? 0 : 1
}
