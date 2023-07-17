const CHARLUV_CACHE = 'charluv-service-cache'

self.addEventListener('activate', function (event) {
  console.log('ServiceWorker activated.')
})

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CHARLUV_CACHE).then(function (cache) {
      return cache.addAll([])
    })
  )
})

self.addEventListener('fetch', (e) => {})
