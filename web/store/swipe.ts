import { createStore } from './create'
import { getSwipe, setSwipe } from './data/swipe'
import { toastStore } from './toasts'

type swipeState = {
  lastid: string
  loaded: boolean
}
export const swipeStore = createStore<swipeState>('swipe', { lastid: '', loaded: false })(
  (_get, _set) => {
    return {
      getSwipe: async (_state: swipeState) => {
        const res = await getSwipe()
        if (res.error) toastStore.error('Failed to retrieve swipe')
        return { lastid: res.lastid as string, loaded: res.loaded }
      },
      setSwipe: async (_state: swipeState, lastid: string, onSuccess?: () => void) => {
        const res = await setSwipe(lastid)
        if (res.error) toastStore.error(`Failed to set swipe: ${res.error}`)
        if (res.result) {
          onSuccess?.()
        }
      },
    }
  }
)
