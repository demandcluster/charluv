import { AppSchema } from '../../srv/db/schema'
import { createStore } from './create'
import { data } from './data'
import { toastStore } from './toasts'
import { userStore } from './user'

type swipeState = {
  lastid: string,
  loaded: boolean
}
export const swipeStore = createStore<swipeState>('swipe',  { lastid: '', loaded:false }
)((get, set) => {
  return {
    getSwipe: async () => {
      const res = await data.swipe.getSwipe()
      if (res.error) toastStore.error('Failed to retrieve swipe')
      return res;
    },
    setSwipe: async (_, lastid: lastid, onSuccess?: () => void) => {
      const res = await data.swipe.setSwipe(lastid);
      if (res.error) toastStore.error(`Failed to set swipe: ${res.error}`)
      if (res.result) {
        onSuccess?.()
      }
    },
  }
})