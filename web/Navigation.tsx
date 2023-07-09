import { A, useNavigate } from '@solidjs/router'
import {
  Activity,
  Bell,
  Book,
  Bot,
  Github,
  Heart,
  Home,
  HeartHandshake,
  HelpCircle,
  LogIn,
  LogOut,
  MailPlus,
  MessageCircle,
  ShoppingCart,
  Moon,
  Settings,
  ShoppingBag,
  Sliders,
  Sun,
  Sword,
  User,
  Users,
  VenetianMask,
  X,
} from 'lucide-solid'
import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  JSX,
  Match,
  Show,
  Switch,
} from 'solid-js'
import AvatarIcon, { CharacterAvatar } from './shared/AvatarIcon'
import {
  characterStore,
  chatStore,
  inviteStore,
  settingStore,
  toastStore,
  userStore,
} from './store'
import Slot from './shared/Slot'
import { useEffect, useWindowSize } from './shared/hooks'
import logo from './asset/logo.png'
import logoDark from './asset/logoDark.png'
import WizardIcon from './icons/WizardIcon'
import Badge from './shared/Badge'

const MobileNavHeader = () => (
  <div class="flex h-8 justify-between sm:hidden">
    <div class="w-8"></div>
    <div>
      {' '}
      <div class="hidden w-full items-center justify-center sm:flex" style="background:#55b89cff;">
        <A href="/">
          <img width="180px" class="px-0 py-2" alt="Charluv" src={logoDark} />
        </A>
      </div>
    </div>
    <div class="w-8">
      <div class="icon-button">
        <X onClick={settingStore.menu} />
      </div>
    </div>
  </div>
)

const Navigation: Component = () => {
  let parent: any
  let content: any
  const state = settingStore()
  const user = userStore()
  const chars = characterStore()
  const chat = chatStore()
  const nav = useNavigate()

  const logout = () => {
    nav('/')
    userStore.logout()
  }

  useEffect(() => {
    const interval = setInterval(() => {
      if (!parent || !content) return

      parent.setAttribute('style', '')
      content.setAttribute('style', '')
    }, 50)

    return () => clearInterval(interval)
  })

  const hide = createMemo(() => {
    if (!!chat.opts.pane && !state.showMenu) return 'drawer--hide'
    if (state.showMenu) return ''
    return 'drawer--hide'
  })

  const fullscreen = createMemo(() => (state.fullscreen ? 'hidden' : ''))

  return (
    <>
      <div ref={parent} class={`drawer bg-800 flex flex-col gap-2 pt-2 ${hide()} ${fullscreen()}`}>
        <div
          ref={content}
          class="drawer__content sm:text-md text-md flex flex-col gap-0 px-4 sm:gap-1"
        >
          <div
            class="hidden w-full items-center justify-center sm:flex"
            style={user.ui?.mode === 'light' ? 'background:#55b89cff;' : 'background:#1f4439ff;'}
          >
            <A href="/">
              <img
                width="180px"
                class="px-0 py-2"
                alt="Charluv"
                src={user.ui?.mode === 'light' ? logoDark : logo}
              />
            </A>
          </div>

          <MobileNavHeader />

          <Show when={user.loggedIn} fallback={<GuestNavigation />}>
            <UserNavigation />
          </Show>
        </div>

        <div class="absolute bottom-0 flex h-16 w-full flex-col items-center justify-between border-t-2 border-[var(--bg-700)] px-4">
          <div class="ellipsis my-auto flex w-full items-center justify-between">
            <div
              class="flex max-w-[calc(100%-32px)] items-center gap-2"
              onClick={() => {
                settingStore.toggleImpersonate(true)
                settingStore.closeMenu()
              }}
            >
              <Switch>
                <Match when={chars.impersonating}>
                  <CharacterAvatar
                    char={chars.impersonating!}
                    format={{ corners: 'circle', size: 'md' }}
                  />
                </Match>

                <Match when>
                  <AvatarIcon
                    avatarUrl={chars.impersonating?.avatar || user.profile?.avatar}
                    format={{ corners: 'circle', size: 'md' }}
                  />
                </Match>
              </Switch>
              <div class="ellipsis flex cursor-pointer items-center justify-end rounded-lg bg-[var(--bg-700)] px-2 py-1">
                <div class="ellipsis flex flex-col">
                  <span>
                    {chars.impersonating?.name || user.profile?.handle}
                    {user.user?.premium ? ' ⭐' : ''}
                  </span>
                </div>
                <Show when={!!chars.impersonating}>
                  <VenetianMask size={16} class="ml-2" />
                </Show>
              </div>
              <div id="credits" class="text-bold pr-2">
                {user.user?.credits}
              </div>
            </div>
            <div onClick={logout} class="icon-button cursor-pointer ">
              <LogOut />
            </div>
          </div>
          <div class="text-500 mb-1 text-[0.6rem] italic">{state.config.version}</div>
        </div>
      </div>
    </>
  )
}

const UserNavigation: Component = () => {
  const user = userStore()
  const menu = settingStore()
  const toasts = toastStore()

  return (
    <>
      {/* <div class="flex justify-center gap-2">
        <Item>
          <MessageSquare />
        </Item>


      </div> */}

      <Item
        onClick={() => {
          settingStore.closeMenu()
          userStore.modal(true)
        }}
      >
        <User /> Profile
      </Item>
      <Show when={user.loggedIn}>
        <Item href="/likes/list">
          <Users /> Likes
        </Item>
        <Item href="/character/list">
          <Heart /> Matches
        </Item>
      </Show>
      <Show when={menu.flags.chub}>
        <Item href="/chub">
          <ShoppingBag />
          CHUB
        </Item>
      </Show>
      <Item href="/chats">
        <MessageCircle fill="var(--bg-100)" /> Chats
      </Item>

      <Item href="/memory">
        <Book /> Memory
      </Item>

      <Show when={menu.flags.events}>
        <Item href="/scenario">
          <Sword /> Scenario
        </Item>
      </Show>

      <Item href="/invites">
        <MailPlus /> Invites <InviteBadge />
      </Item>
      <Show when={user.loggedIn}>
        <Item href="/premium">
          <HeartHandshake /> Premium
        </Item>
      </Show>
      <Show when={user.user?.admin}>
        <Item href="/presets">
          <Sliders /> Presets
        </Item>
      </Show>

      <Show when={user.user?.admin}>
        <Item href="/admin/metrics">
          <Activity /> Metrics
        </Item>
      </Show>

      <div class="flex flex-wrap justify-center gap-[2px] text-sm">
        <Item href="/faq">
          <HelpCircle />
        </Item>

        <Show when={user.loggedIn && !user.user?.admin}>
          <Item href="/shop">
            <ShoppingCart />
          </Item>
        </Show>
        <Item href="/settings">
          <Settings />
        </Item>

        <Item
          onClick={() => {
            userStore.saveUI({ mode: user.ui.mode === 'light' ? 'dark' : 'light' })
          }}
        >
          <Show when={user.ui.mode === 'dark'} fallback={<Sun />}>
            <Moon />
          </Show>
        </Item>

        <Item
          onClick={() => {
            settingStore.closeMenu()
            toastStore.modal(true)
          }}
        >
          <Switch>
            <Match when={toasts.unseen > 0}>
              <div class="relative flex">
                <Bell fill="var(--bg-100)" />
                <span class="absolute bottom-[-0.5rem] right-[-0.5rem]">
                  <Badge>{toasts.unseen > 9 ? '9+' : toasts.unseen}</Badge>
                </span>
              </div>
            </Match>

            <Match when={!toasts.unseen}>
              <Bell color="var(--bg-500)" />
            </Match>
          </Switch>
        </Item>
      </div>
      <Slots />
    </>
  )
}

const GuestNavigation: Component = () => {
  const toasts = toastStore()
  const user = userStore()
  const menu = settingStore((s) => ({
    showMenu: s.showMenu,
    config: s.config,
    guest: s.guestAccessAllowed,
    flags: s.flags,
  }))

  return (
    <>
      <Show when={menu.config.canAuth}>
        <Item href="/login">
          <LogIn /> Login
        </Item>
      </Show>

      <Show when={menu.guest}>
        <Item
          onClick={() => {
            settingStore.closeMenu()
            userStore.modal(true)
          }}
        >
          <User /> Profile
        </Item>

        <Item href="/character/list">
          <Bot /> Matches
        </Item>

        <Show when={menu.flags.chub}>
          <Item href="/chub">
            <ShoppingBag />
            CHUB
          </Item>
        </Show>

        <Item href="/chats">
          <MessageCircle /> Chats
        </Item>

        <Item href="/memory">
          <Book /> Memory
        </Item>

        <Show when={menu.flags.events}>
          <Item href="/scenario">
            <Sword /> Scenario
          </Item>
        </Show>
      </Show>

      <div class="flex flex-wrap justify-center gap-[2px] text-sm">
        <Item href="/faq">
          <HelpCircle />
        </Item>

        <Item href="/settings">
          <Settings />
        </Item>

        <Item
          onClick={() => {
            userStore.saveUI({ mode: user.ui.mode === 'light' ? 'dark' : 'light' })
          }}
        >
          <Show when={user.ui.mode === 'dark'} fallback={<Sun />}>
            <Moon />
          </Show>
        </Item>

        <Item
          onClick={() => {
            settingStore.closeMenu()
            toastStore.modal(true)
          }}
        >
          <Switch>
            <Match when={toasts.unseen > 0}>
              <div class="relative flex">
                <Bell fill="var(--bg-100)" />
                <span class="absolute bottom-[-0.5rem] right-[-0.5rem]">
                  <Badge>{toasts.unseen > 9 ? '9+' : toasts.unseen}</Badge>
                </span>
              </div>
            </Match>

            <Match when={!toasts.unseen}>
              <Bell color="var(--bg-500)" />
            </Match>
          </Switch>
        </Item>
      </div>

      <Slots />
    </>
  )
}

const Slots: Component = (props) => {
  const state = settingStore()
  const page = useWindowSize()

  const [rendered, setRendered] = createSignal(false)

  createEffect(() => {
    if (rendered()) return

    if (state.showMenu) {
      setTimeout(() => setRendered(true), 500)
    }
  })

  return (
    <Switch>
      <Match when={page.width() < 900}>
        <Show when={rendered()}>
          <Slot slot="menu" />
        </Show>
      </Match>

      <Match when={true}>
        <Slot slot="menu" />
      </Match>
    </Switch>
  )
}

const Item: Component<{ href?: string; children: string | JSX.Element; onClick?: () => void }> = (
  props
) => {
  return (
    <>
      <Show when={!props.href}>
        <div
          class="flex h-10 cursor-pointer items-center justify-start gap-4 rounded-lg px-2 hover:bg-[var(--bg-700)] sm:h-12"
          onClick={() => {
            if (props.onClick) props.onClick()
            else settingStore.closeMenu()
          }}
        >
          {props.children}
        </div>
      </Show>
      <Show when={props.href}>
        <A
          href={props.href!}
          class="flex h-10 items-center justify-start gap-4 rounded-lg px-2 hover:bg-[var(--bg-700)] sm:h-12"
          onClick={settingStore.closeMenu}
        >
          {props.children}
        </A>
      </Show>
    </>
  )
}

const InviteBadge: Component = () => {
  const inv = inviteStore()

  return (
    <>
      <Show when={inv.invites.length}>
        <span class={`flex h-6 items-center justify-center rounded-xl bg-red-900 px-2 text-xs`}>
          {inv.invites.length}
        </span>
      </Show>
    </>
  )
}

export default Navigation

const ExternalLink: Component<{ href: string; newtab?: boolean; children?: any }> = (props) => (
  <a
    class="flex h-10 items-center justify-start gap-4 rounded-xl px-2 hover:bg-[var(--bg-700)] sm:h-12"
    href={props.href}
    target={props.newtab ? '_blank' : ''}
  >
    {props.children}
  </a>
)
