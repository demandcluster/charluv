import { v4 as uuid } from 'uuid'
import { GateBackend } from './local'
import { Kind, Priority } from './types'
import { getUserSubscriptionTier } from '/common/util'
import { AppSchema } from '/common/types/schema'
import { logger } from '../middleware'

/** Thrown when an admitted request's client has already disconnected. Consumers
 * treat it like any generation error (no message/credit/image persisted). */
export class ClientGoneError extends Error {
  constructor(message = 'client disconnected before generation') {
    super(message)
    this.name = 'ClientGoneError'
  }
}

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

export type PresenceCheck = (id: { userId?: string; socketId?: string }) => Promise<boolean>

export class PriorityGate {
  constructor(
    private backend: GateBackend,
    private sender: Sender,
    private presence: PresenceCheck = async () => true,
    private now: () => number = () => Date.now()
  ) {}

  setPauseText(pause: boolean) {
    this.backend.setPauseText(pause)
  }

  setBackend(backend: GateBackend) {
    this.backend = backend
  }

  setPresence(presence: PresenceCheck) {
    this.presence = presence
  }

  async run<T>(opts: GateOpts, fn: () => Promise<T>): Promise<T> {
    const id = uuid()
    await this.enter(id, opts)
    try {
      return await fn()
    } finally {
      await this.release(id)
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
      await this.release(id)
    }
  }

  private async release(id: string) {
    try {
      await this.backend.release(id)
    } catch (err) {
      logger.warn({ err }, 'inference gate: release failed, ignoring')
    }
  }

  private async enter(id: string, opts: GateOpts) {
    try {
      await this.backend.acquire({
        id,
        kind: opts.kind,
        priority: opts.priority,
        enqueuedAt: this.now(),
        onPosition: (position) => this.emit(opts, position),
      })
    } catch (err) {
      // Backend (e.g. Redis) unavailable: degrade to ungated rather than failing
      // the inference request. Fulfils the spec's "Redis unavailable -> proceed"
      // fallback. (Abort/disconnect is not wired through the facade in v1.)
      logger.warn({ err }, 'inference gate: acquire failed, proceeding ungated')
      return
    }
    // Admitted — but drop the request if its client has already disconnected,
    // freeing the slot for the next waiter. Fails open (treats as present) on
    // any presence-check error so an outage never wrongly drops requests.
    let present: boolean
    try {
      present = await this.presence({ userId: opts.userId, socketId: opts.socketId })
    } catch {
      present = true
    }
    if (!present) {
      await this.release(id)
      throw new ClientGoneError()
    }
    this.emit(opts, 0) // clear the badge on admission
  }

  private emit(opts: GateOpts, position: number) {
    // Position updates are best-effort; a throwing sender must never leak the
    // slot the caller just acquired.
    try {
      const ev: PositionEvent = {
        type: 'queue-position',
        kind: opts.kind,
        position,
        requestId: opts.requestId,
      }
      if (opts.userId) this.sender.toUser(opts.userId, ev)
      else if (opts.socketId) this.sender.toGuest(opts.socketId, ev)
    } catch (err) {
      logger.warn({ err }, 'inference gate: position emit failed, ignoring')
    }
  }
}

export function priorityForUser(
  user: Pick<
    AppSchema.User,
    '_id' | 'patreon' | 'billing' | 'sub' | 'manualSub' | 'premium' | 'premiumUntil' | 'username'
  >,
  isGuest: boolean,
  tiers: AppSchema.SubscriptionTier[]
): Priority {
  if (isGuest) return 2
  const sub = getUserSubscriptionTier(user, tiers)
  return sub?.tier ? 0 : 1
}
