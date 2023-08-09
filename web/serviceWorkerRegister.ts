import serviceWorker from './asset/serviceWorker.ts'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register(new URL('./asset/serviceWorker.ts', import.meta.url), { type: 'module' })
      .then(
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
