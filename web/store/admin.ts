import { AppSchema } from '../../common/types/schema'
import { api } from './api'
import { createStore } from './create'
import { toastStore } from './toasts'

type UserInfo = {
  userId: string
  chats: number
  characters: number
  handle: string
  avatar: string
}

type AdminState = {
  users: AppSchema.User[]
  info?: UserInfo
  shared?: number
  metrics?: {
    totalUsers: number
    connected: number
    maxLiveCount: number
    each: Array<{ count: number; date: string; hostname: string; max: number }>
  }
}

export const adminStore = createStore<AdminState>('admin', { users: [] })((_) => {
  return {
    async getUsers(_, username: string, page = 0) {
      const res = await api.post<{ users: AppSchema.User[] }>('/admin/users', { username, page })
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
    async getShared() {
      const res = await api.get<{ shared: number }>('/admin/submitted')
      if (res.error) toastStore.error(`Failed to get submitted characters: ${res.error}`)
      if (res.result) return { shared: res.result }
    },
    async declineShared(_, body: string) {
      const res = await api.post('/admin/submitted/declined', body)
      if (res.result?.error) {
        toastStore.error(`Failed to decline character: ${res.result.error}`)
      }
      if (res.result?.success) toastStore.success(`Update Decline Reason`)
      onSucces?.()
    },
    async acceptShared(_, body: string) {
      const res = await api.post('/admin/submitted/accept', body)
      if (res.result?.error) {
        toastStore.error(`Failed to accept character: ${res.result.error}`)
      }
      if (res.result?.success) toastStore.success(`Rewarded User`)
      onSucces?.()
    },
    async getMetrics() {
      const res = await api.get('/admin/metrics')
      if (res.result) {
        return { metrics: res.result }
      }
    },
    async sendAll(_, message: string, onSuccess?: Function) {
      const res = await api.post(`/admin/notify`, { message })

      if (!res.error) {
        onSuccess?.()
      } else {
        toastStore.error(`Failed to send: ${res.error}`)
      }
    },
  }
})
