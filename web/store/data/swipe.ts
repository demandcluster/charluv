import { v4 } from 'uuid'
import { loadItem, local } from './storage'

export async function getSwipe() {
  const swipe = loadItem('swipe');
  return { lastid:  swipe , loaded:true, error: undefined }
}

export async function setSwipe(lastid: string) {
  local.saveSwipe(lastid)
  return { result: true, error: undefined }
}


