import { config } from '../config'
import { clients, isConnected, allSockets, userSockets } from '../api/ws/bus'

const PRESENCE_TTL_MS = 75000 // 2.5x the 30s websocket ping interval

export type PresenceId = { userId?: string; socketId?: string }

export function userKey(userId: string) {
  return `presence:u:${userId}`
}
export function guestKey(socketId: string) {
  return `presence:g:${socketId}`
}
export function keyFor(id: PresenceId): string | undefined {
  if (id.userId) return userKey(id.userId)
  if (id.socketId) return guestKey(id.socketId)
  return undefined
}

function redisActive() {
  return !!config.redis.host && isConnected()
}

// --- Redis seam (pure over a client; unit-tested against a real redis) ---
export type PresenceCmd = {
  zAdd: (key: string, member: { score: number; value: string }) => Promise<number>
  zRem: (key: string, member: string) => Promise<number>
  zCard: (key: string) => Promise<number>
  zRemRangeByScore: (key: string, min: number, max: number) => Promise<number>
  expire: (key: string, seconds: number) => Promise<boolean | number>
}

export async function markRedis(cmd: PresenceCmd, key: string, member: string, nowMs: number) {
  await cmd.zAdd(key, { score: nowMs + PRESENCE_TTL_MS, value: member })
  await cmd.expire(key, Math.ceil(PRESENCE_TTL_MS / 1000) + 5)
}
export async function clearRedis(cmd: PresenceCmd, key: string, member: string) {
  await cmd.zRem(key, member)
}
export async function isPresentRedis(
  cmd: PresenceCmd,
  key: string,
  nowMs: number
): Promise<boolean> {
  await cmd.zRemRangeByScore(key, 0, nowMs)
  const count = await cmd.zCard(key)
  return count > 0
}

// --- Local seam (single-process: the live socket maps ARE the truth) ---
export function isPresentLocal(
  id: PresenceId,
  maps: { allSockets: Map<string, any>; userSockets: Map<string, any[]> }
): boolean {
  if (id.userId) return (maps.userSockets.get(id.userId)?.length || 0) > 0
  if (id.socketId) return maps.allSockets.has(id.socketId)
  return true
}

// --- Public API (socket lifecycle + gate use these) ---
export async function markPresent(id: PresenceId, member: string) {
  if (!redisActive()) return
  const key = keyFor(id)
  if (!key) return
  await markRedis(clients.pub as any, key, member, Date.now()).catch(() => {})
}
export async function clearPresent(id: PresenceId, member: string) {
  if (!redisActive()) return
  const key = keyFor(id)
  if (!key) return
  await clearRedis(clients.pub as any, key, member).catch(() => {})
}

/** True if the requester still has a live connection. Fails OPEN (true) on any error. */
export async function isPresent(id: PresenceId): Promise<boolean> {
  if (!id.userId && !id.socketId) return true
  if (!redisActive()) {
    return isPresentLocal(id, { allSockets, userSockets })
  }
  const key = keyFor(id)!
  try {
    return await isPresentRedis(clients.pub as any, key, Date.now())
  } catch {
    return true
  }
}

let refreshTimer: NodeJS.Timeout | undefined
/** Periodically refresh presence TTLs for all locally-connected sockets. No-op without redis. */
export function startPresenceRefresh(): () => void {
  if (!redisActive()) return () => {}
  refreshTimer = setInterval(() => {
    const now = Date.now()
    for (const [uid, socket] of allSockets) {
      markRedis(clients.pub as any, guestKey(uid), uid, now).catch(() => {})
      const userId = (socket as any).userId
      if (userId) markRedis(clients.pub as any, userKey(userId), uid, now).catch(() => {})
    }
  }, 30000)
  return () => {
    if (refreshTimer) clearInterval(refreshTimer)
  }
}
