import { v4 } from 'uuid'
import { loadItem, localApi } from './storage'

export async function getSwipe() {
  const swipe = await loadItem('swipe')
  return { lastid: swipe, loaded: true, error: undefined }
}

export async function setSwipe(lastid: string) {
  localApi.saveSwipe(lastid)
  return { result: true, error: undefined }
}
