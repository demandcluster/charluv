import type Stripe from 'stripe'
import { AppSchema, Patreon } from '../../common/types/schema'
import { EVENTS, events } from '../emitter'
import { api, isImpersonating, revertAuth, setAltAuth } from './api'
import { createStore } from './create'
import { toastStore } from './toasts'
import type { SubsAgg } from '/srv/domains/subs/types'

type UserInfo = {
  userId: string
  chats: number
  characters: number
  handle: string
  avatar: string
  state: SubsAgg
  username: string
  sub: AppSchema.User['sub']
  manualSub: AppSchema.User['manualSub']
  billing: AppSchema.User['billing']
  patreon: AppSchema.User['patreon']
  stripeSessions?: string[]
  creditsRestricted?: boolean
  restrictedReason?: 'ip' | 'fingerprint' | 'both'
}

type AdminState = {
  users: AppSchema.User[]
  info?: UserInfo
  published?: AppSchema.Character[]
  reports?: any[]
  metrics?: {
    totalUsers: number
    connected: number
    versioned: number
    maxLiveCount: number
    each: Array<{ count: number; date: string; hostname: string; max: number }>
    shas: Record<string, number>
  }
  products: Stripe.Product[]
  prices: Stripe.Price[]
  patreonTiers: Patreon.Tier[]
  impersonating: boolean
  config?: AppSchema.Configuration
  promos: AppSchema.PromoCode[]
}

export const adminStore = createStore<AdminState>('admin', {
  users: [],
  products: [],
  prices: [],
  patreonTiers: [],
  impersonating: isImpersonating(),
  promos: [],
})((_) => {
  return {
    async impersonate(_, userId: string) {
      const res = await api.post(`/admin/impersonate/${userId}`)
      if (res.error) {
        toastStore.error(`Error: ${res.error}`)
        return
      }

      const token = res.result.token
      setAltAuth(token)
    },

    async getPublished() {
      const res = await api.get<{ characters: AppSchema.Character[] }>('/admin/published')
      if (res.error) toastStore.error(`Failed to load published characters: ${res.error}`)
      if (res.result) return { published: res.result.characters }
    },
    async moderatePublished(
      _,
      charId: string,
      action: 'reviewed' | 'unpublish' | 'delete',
      reason?: string
    ) {
      const res = await api.post(`/admin/published/${charId}`, { action, reason })
      if (res.error) toastStore.error(`Action failed: ${res.error}`)
      if (res.result?.success) toastStore.success(`Done`)
      return res.result?.success
    },
    async getReports() {
      const res = await api.get<{ reports: any[] }>('/admin/reports')
      if (res.error) toastStore.error(`Failed to load reports: ${res.error}`)
      if (res.result) return { reports: res.result.reports }
    },
    async resolveReport(
      _,
      charId: string,
      action: 'dismiss' | 'hide' | 'delete',
      reason?: string
    ) {
      const res = await api.post(`/admin/reports/${charId}`, { action, reason })
      if (res.error) toastStore.error(`Action failed: ${res.error}`)
      if (res.result?.success) toastStore.success(`Done`)
      return res.result?.success
    },
    unimpersonate(state) {
      if (!state.impersonating) return
      revertAuth()
    },

    async updateServerConfig(
      _,
      update: Omit<AppSchema.Configuration, 'kind' | 'tosUpdated' | 'privacyUpdated'>
    ) {
      const res = await api.post('/admin/configuration', update)
      if (res.result) {
        toastStore.success('Server configuration updated')
        events.emit(EVENTS.configUpdated, res.result)
      }
      if (res.error) {
        toastStore.error(`Configuration updated failed: ${res.error}`)
      }
    },
    async getUsers(
      _,
      opts: { username: string; subscribed: boolean; customerId: string },
      page = 0
    ) {
      const res = await api.post<{ users: AppSchema.User[] }>('/admin/users', { ...opts, page })
      if (res.error) return toastStore.error(`Unable to retrieve users: ${res.error}`)
      if (res.result) {
        return { users: res.result.users }
      }
    },
    async setPassword(_, userId: string, password: string, onSuccess?: Function) {
      const res = await api.post('/admin/user/password', { userId, password })
      if (res.error) return toastStore.error(`Failed to update user: ${res.error}`)
      if (res.result) toastStore.success(`Update user settings`)
      onSuccess?.()
    },
    async getInfo(_, userId: string) {
      const res = await api.get<UserInfo>(`/admin/users/${userId}/info`)
      if (res.error) toastStore.error(`Failed to get user info: ${res.error}`)
      if (res.result) return { info: res.result }
    },
    async clearRestriction(_, userId: string, onSuccess?: () => void) {
      const res = await api.post(`/admin/users/${userId}/clear-restriction`)
      if (res.error) return toastStore.error(`Failed to clear restriction: ${res.error}`)
      if (res.result) {
        toastStore.success('Restriction cleared')
        onSuccess?.()
      }
    },
    async getMetrics() {
      const res = await api.get('/admin/metrics')
      if (res.result) {
        return { metrics: res.result }
      }
    },
    async sendAll(_, message: string, level: number, onSuccess?: Function) {
      const res = await api.post(`/admin/notify`, { message, level })

      if (!res.error) {
        onSuccess?.()
      } else {
        toastStore.error(`Failed to send: ${res.error}`)
      }
    },
    async changeUserTier(_, userId: string, tierId: string) {
      const res = await api.post(`/admin/users/${userId}/tier`, { tierId })
      if (res.error) toastStore.error(`Failed to update user: ${res.error}`)
      if (res.result) toastStore.success(`User updated`)
    },
    async assignSubscription(_, userId: string, subscriptionId: string) {
      const res = await api.post(`/admin/billing/subscribe/admin-manual`, {
        userId,
        subscriptionId,
      })
      if (res.error) toastStore.error(res.error)
      if (res.result) toastStore.success(`Successfully assigned subscription`)
    },
    async assignGift(_, userId: string, tierId: string, expiresAt: Date) {
      const res = await api.post(`/admin/billing/subscribe/admin-gift`, {
        userId,
        tierId,
        expiresAt: expiresAt.toISOString(),
      })
      if (res.error) toastStore.error(res.error)
      if (res.result) toastStore.success(`Successfully assigned subscription`)
    },
    async viewSession(_, sessionId: string, cb: (session: Stripe.Checkout.Session) => void) {
      const res = await api.post(`/admin/billing/subscribe/session`, { sessionId })
      if (res.error) return toastStore.error(res.error)
      if (res.result) cb(res.result)
    },
    async createTier(
      _,
      create: OmitId<AppSchema.SubscriptionTier, Dates>,
      onSuccess?: (res: AppSchema.SubscriptionTier) => void
    ) {
      const res = await api.post(`/admin/tiers`, create)
      if (res.result) {
        toastStore.success('Tier created')
        onSuccess?.(res.result)
        events.emit(EVENTS.tierReceived, res.result)
      }

      if (res.error) {
        toastStore.error(`Failed to create tier: ${res.error}`)
      }
    },
    async updateTier(_, id: string, update: Partial<OmitId<AppSchema.SubscriptionTier, Dates>>) {
      const res = await api.post(`/admin/tiers/${id}`, update)
      if (res.result) {
        toastStore.success('Tier updated')
        events.emit(EVENTS.tierReceived, res.result)
      }

      if (res.error) {
        toastStore.error(`Failed to update tier: ${res.error}`)
      }
    },
    async *getProducts() {
      yield { products: [], prices: [] }
      const res = await api.get('/admin/billing/products')
      if (res.result) {
        yield {
          products: res.result.products,
          prices: res.result.prices,
          patreonTiers: res.result.tiers || [],
        }
      }

      if (res.error) {
        toastStore.error(`Failed to retrieve products: ${res.error}`)
      }
    },
    async getConfiguration() {
      const res = await api.get('/settings')
      if (res.result) {
        return { config: res.result.serverConfig }
      }
    },
    async getPromos() {
      const res = await api.get('/admin/promo')
      if (res.result) return { promos: res.result.codes }
      if (res.error) toastStore.error(`Failed to load promo codes: ${res.error}`)
    },
    async createPromo(_, input: Partial<AppSchema.PromoCode>, onSuccess?: () => void) {
      const res = await api.post('/admin/promo', input)
      if (res.error) return toastStore.error(`Failed to create code: ${res.error}`)
      if (res.result) {
        toastStore.success('Promo code created')
        adminStore.getPromos()
        onSuccess?.()
      }
    },
    async updatePromo(_, id: string, patch: Partial<AppSchema.PromoCode>, onSuccess?: () => void) {
      const res = await api.post(`/admin/promo/${id}`, patch)
      if (res.error) return toastStore.error(`Failed to update code: ${res.error}`)
      if (res.result) {
        toastStore.success('Promo code updated')
        adminStore.getPromos()
        onSuccess?.()
      }
    },
    async deletePromo(_, id: string, onSuccess?: () => void) {
      const res = await api.method('delete', `/admin/promo/${id}`)
      if (res.error) return toastStore.error(`Failed to delete code: ${res.error}`)
      if (res.result) {
        toastStore.success('Promo code deleted')
        adminStore.getPromos()
        onSuccess?.()
      }
    },
  }
})
