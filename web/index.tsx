import { Component } from 'solid-js'
import { render } from 'solid-js/web'
import App from './App'
import { initPwa } from './pwa'

const AppContainer: Component = () => <App />

render(() => <AppContainer />, document.getElementById('root') as HTMLElement)

// Register the PWA service worker and wire the in-app update prompt (no-op in dev).
void initPwa()
