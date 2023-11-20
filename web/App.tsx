import './variables.css'
import './tailwind.css'
import './app.css'
import './dots.css'
import '@melloware/coloris/dist/coloris.css'
import { Component, createMemo, JSX, Show, lazy, onMount } from 'solid-js'
import { Outlet, Route, Router, Routes, useLocation } from '@solidjs/router'
import NavBar from './shared/NavBar'
import Toasts from './Toasts'
import CharacterRoutes from './pages/Character'
import ScenarioRoutes from './pages/Scenario'
import { settingStore } from './store/settings'
import { userStore } from './store/user'
import LoginPage from './pages/Login'
import HomePage from './pages/Home'
import Navigation from './Navigation'
import Loading from './shared/Loading'
import Button from './shared/Button'

import CharacterList from './pages/Character/CharacterList'

import PremiumOptions from './pages/Premium/PremiumOptions'
import ThankYou from './pages/Premium/ThankYou'
import Error from './pages/Premium/Error'
import PremiumInfo from './pages/Premium/Info'

import MatchRoutes from './pages/Match'

import ImpersonateModal from './pages/Character/ImpersonateModal'
import ChubRoutes from './pages/Chub'
import Redirect from './shared/Redirect'
import Maintenance from './shared/Maintenance'
import CharacterChats from './pages/Character/ChatList'
import ChatDetail from './pages/Chat/ChatDetail'
import ChangeLog from './pages/Home/ChangeLog'
import Settings from './pages/Settings'
import ProfilePage, { ProfileModal } from './pages/Profile'
import { chatStore } from './store'
import { usePane } from './shared/hooks'
import { rootModalStore } from './store/root-modal'
import { For } from 'solid-js'
import { css, getMaxChatWidth } from './shared/util'
import FAQ from './pages/Home/FAQ'
import CreateChatForm from './pages/Chat/CreateChatForm'
import Modal from './shared/Modal'
import { ContextProvider } from './store/context'
import PipelineGuide from './pages/Guides/Pipeline'
import MemoryGuide from './pages/Guides/Memory'
import NovelGuide from './pages/Guides/NovelAI'
import { ImageModal } from './pages/Chat/ImageModal'
import PerformanceModal from './pages/Settings/PerformanceModal'
import { CheckoutCancel, CheckoutSuccess } from './pages/Profile/Checkout'
import { markdown } from './shared/markdown'
import SoundsPage from './pages/Sounds'

const App: Component = () => {
  const state = userStore()
  const cfg = settingStore()

  return (
    <Router>
      <Routes>
        <Route path="" component={Layout}>
          <CharacterRoutes />
          <ScenarioRoutes />
          <Route
            path="/discord"
            component={() => <Redirect external="https://discord.gg/8E6FRdsvhg" />}
          />
          <ChubRoutes />
          <Route path="/chats/create/:id?" component={CreateChatForm} />
          <Route path="/chats" component={CharacterChats} />
          <Route path="/chat" component={ChatDetail} />
          <Route path="/chat/:id" component={ChatDetail} />
          <Route path={['/info', '/']} component={HomePage} />
          <Route path="/changelog" component={ChangeLog} />
          <Route path="/presets/:id" component={lazy(() => import('./pages/GenerationPresets'))} />
          <Route
            path="/presets"
            component={lazy(() => import('./pages/GenerationPresets/PresetList'))}
          />
          <Show when={cfg.flags.sounds}>
            <Route path="/sounds" component={SoundsPage} />
          </Show>
          <Route path="/profile" component={ProfilePage} />
          <Route path="/settings" component={Settings} />
          <Route path="/privacy" component={lazy(() => import('./pages/Home/policy'))} />
          <Route path="/help" component={lazy(() => import('./pages/Home/Help'))} />
          <Route path="/terms" component={lazy(() => import('./pages/Home/terms'))} />
          <Route path="/share" component={lazy(() => import('./pages/Home/Share'))} />

          <Route path="/memory" component={lazy(() => import('./pages/Memory/Library'))} />
          <Route
            path="/memory/:id"
            component={lazy(() => import('./pages/Memory/EditMemoryPage'))}
          />
          <Route
            path="/memory/instructions"
            component={lazy(() => import('./pages/Memory/Instructions'))}
          />
          <MatchRoutes />

          <Route
            path="/memory/instructions"
            component={lazy(() => import('./pages/Memory/Instructions'))}
          />
          <Route path="/checkout">
            <Route path="/success" component={CheckoutSuccess} />
            <Route path="/cancel" component={CheckoutCancel} />
          </Route>
          <Route path="/privacy-policy" component={lazy(() => import('./pages/PrivacyPolicy'))} />
          <Route path="/guides">
            <Route path="/pipeline" component={PipelineGuide} />
            <Route path="/memory" component={MemoryGuide} />
            <Route path="/novel" component={NovelGuide} />
          </Route>
          <Show when={state.loggedIn}>
            <Route path="/shop" component={PremiumOptions} />
            <Route path="/thankyou" component={ThankYou} />
            <Route path="/shop/error" component={Error} />
            <Route path="/premium" component={PremiumInfo} />
            <Route path="/invites" component={lazy(() => import('./pages/Invite/InvitesPage'))} />
            <Show when={state.user?.premium}>
              <Route
                path="/presets/:id"
                component={lazy(() => import('./pages/GenerationPresets'))}
              />
              <Route
                path="/presets"
                component={lazy(() => import('./pages/GenerationPresets/PresetList'))}
              />
            </Show>
            <Show when={state.user?.admin}>
              <Route
                path="/admin/metrics"
                component={lazy(() => import('./pages/Admin/Metrics'))}
              />
              <Route
                path="/admin/users"
                component={lazy(() => import('./pages/Admin/UsersPage'))}
              />
              <Route
                path="/admin/shared"
                component={lazy(() => import('./pages/Admin/SharePage'))}
              />
              <Route
                path="/admin/subscriptions"
                component={lazy(() => import('./pages/Admin/SubscriptionList'))}
              />
              <Route
                path="/admin/subscriptions/:id"
                component={lazy(() => import('./pages/Admin/Subscription'))}
              />
              <Route
                path={['/admin/announcements', '/admin/announcements/:id']}
                component={lazy(() => import('./pages/Admin/Announcements'))}
              />
              <Route
                path="/admin/tiers/:id"
                component={lazy(() => import('./pages/Admin/Tiers'))}
              />
            </Show>
          </Show>
          <Show when={cfg.config.canAuth}>
            <Route path={['/login', '/login/remember', '/register']} component={LoginPage} />
          </Show>
          <Route path="/faq" component={FAQ} />
          <Route path="/builder" component={lazy(() => import('./shared/Avatar/Builder'))} />
          <Route path="*" component={HomePage} />
        </Route>
      </Routes>
    </Router>
  )
}

const Layout: Component = () => {
  const state = userStore()
  const cfg = settingStore()
  const location = useLocation()
  const chat = chatStore()
  const paneOrPopup = usePane()
  const isPaneOpen = createMemo(() => paneOrPopup() === 'pane' && !!chat.opts.pane)

  const maxW = createMemo((): string => {
    if (isPaneOpen()) return 'max-w-full'

    return getMaxChatWidth(state.ui.chatWidth)
  })
  const rootModals = rootModalStore()

  const reload = () => {
    settingStore.init()
  }

  onMount(() => {
    settingStore.init()
    settingStore.getConfig()
    settingStore.getHordePerformance()
  })

  const isChat = createMemo(() => {
    return location.pathname.startsWith('/chat/')
  })

  const bg = createMemo(() => {
    const styles: JSX.CSSProperties = {
      'background-image':
        state.background && !cfg.anonymize ? `url(${state.background})` : undefined,
      'background-repeat': 'no-repeat',
      'background-size': 'cover',
      'background-position': 'center',
      'background-color': isChat() ? undefined : '',
    }
    return styles
  })

  return (
    <ContextProvider>
      <style>{css}</style>
      <div class="scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-[var(--hl-900)] app flex flex-col justify-between">
        <NavBar />
        <div class="flex w-full grow flex-row overflow-y-hidden">
          <Navigation />
          <main class="w-full overflow-y-auto" data-background style={bg()}>
            <div
              class={`mx-auto h-full min-h-full ${isChat() ? maxW() : 'max-w-8xl'} px-2 sm:px-3`}
              classList={{
                'content-background': !isChat(),
              }}
            >
              <Show when={cfg.init}>
                <Outlet />
                <Maintenance />
              </Show>
              <Show when={!cfg.init && cfg.initLoading}>
                <div class="flex h-[80vh] items-center justify-center">
                  <Loading />
                </div>
              </Show>

              <Show when={!cfg.init && !cfg.initLoading}>
                <div class="flex flex-col items-center gap-2">
                  <div>Charluv failed to load</div>
                  <div>
                    <Button onClick={reload}>Try Again</Button>
                  </div>
                </div>
              </Show>
            </div>
          </main>
        </div>
      </div>
      <Toasts />
      <ImpersonateModal
        show={cfg.showImpersonate}
        close={() => settingStore.toggleImpersonate(false)}
      />
      <PerformanceModal
        show={cfg.showPerformance}
        close={() => settingStore.togglePerformance(false)}
      />
      <InfoModal />
      <ProfileModal />
      <For each={rootModals.modals}>{(modal) => modal.element}</For>
      <ImageModal />

      <div
        class="absolute bottom-0 left-0 right-0 top-0 z-10 h-[100vh] w-full bg-black bg-opacity-5"
        classList={{ hidden: !cfg.overlay }}
        onClick={() => settingStore.toggleOverlay(false)}
      ></div>
    </ContextProvider>
  )
}

const InfoModal: Component = (props) => {
  const state = rootModalStore()

  return (
    <Modal
      title={state.infoTitle || 'Information'}
      show={state.info}
      close={() => rootModalStore.closeInfo()}
      maxWidth="half"
    >
      <Show when={typeof state.info === 'string'} fallback={state.info}>
        <div class="markdown" innerHTML={markdown.makeHtml(state.info)} />
      </Show>
    </Modal>
  )
}

export default App
