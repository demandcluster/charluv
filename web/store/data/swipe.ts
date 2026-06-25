import { loadItem, localApi } from './storage'

export async function getSwipe() {
  // return;
  const swipe = await loadItem('swipe')
  // console.log('agnaiswipe',swipe);
  return { lastid: swipe, loaded: true, error: undefined }
}

export async function setSwipe(lastid: string) {
  localApi.saveSwipe(lastid)
  return { result: true, error: undefined }
}
