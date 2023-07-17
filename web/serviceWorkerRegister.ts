import serviceWorker from './serviceWorker'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register(serviceWorker).then(
      function (registration) {
        console.log(
          'Charluv ServiceWorker registration successful with scope: ',
          registration.scope
        )
      },
      function (err) {
        console.error('ServiceWorker registration failed: ', err)
      }
    )
  })
}
