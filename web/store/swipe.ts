import { AppSchema } from '../../srv/db/schema'
import { createStore } from './create'
import { getSwipe, setSwipe } from './data/swipe'
import { toastStore } from './toasts'
import { userStore } from './user'

type swipeState = {
  lastid: string
  loaded: boolean
}
export const swipeStore = createStore<swipeState>('swipe', { lastid: '', loaded: false })(
  (get, set) => {
    return {
      getSwipe: async () => {
        const res = await getSwipe()
        if (res.error) toastStore.error('Failed to retrieve swipe')
        return res
      },
      setSwipe: async (_, lastid: lastid, onSuccess?: () => void) => {
        const res = await setSwipe(lastid)
        if (res.error) toastStore.error(`Failed to set swipe: ${res.error}`)
        if (res.result) {
          onSuccess?.()
        }
      },
    }
  }
)
