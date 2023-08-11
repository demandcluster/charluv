import { A } from '@solidjs/router'
import {
  Activity,
  Bell,
  Book,
  HeartHandshake,
  Heart,
  HelpCircle,
  LogIn,
  MailPlus,
  MessageCircle,
  ShoppingCart,
  Moon,
  Bot,
  Star,
  Plus,
  Users,
  Power,
  Settings,
  ShoppingBag,
  Signal,
  Sliders,
  Sun,
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
  onMount,
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

import logo from './asset/logo.png'
import logoDark from './asset/logoDark.png'
import { useEffect, useResizeObserver, useWindowSize } from './shared/hooks'
import WizardIcon from './icons/WizardIcon'
import Badge from './shared/Badge'
import { pipelineApi } from './store/data/pipeline'

const MobileNavHeader = () => (
  <div class="flex min-h-[2rem] justify-between sm:hidden">
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
  const chat = chatStore()
  const size = useWindowSize()

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

  const fullscreen = createMemo(() => {
    if (state.fullscreen) return 'hidden'

    if (chat.opts.pane && size.width() <= 1200) {
      return 'hidden'
    }

    return ''
  })

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
        <div class="absolute bottom-0 flex h-4 w-full flex-col items-center justify-between px-4">
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

      <UserProfile />
      <Show when={user.loggedIn}>
        <Item href="/likes/list">
          <Users /> Likes
        </Item>
        <CharacterLink />
      </Show>
      <Show when={menu.flags.chub}>
        <Item href="/chub">
          <ShoppingBag />
          CHUB
        </Item>
      </Show>

      <ChatLink />

      <Library />

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
    pipelineOnline: s.pipelineOnline,
  }))

  return (
    <>
      <Show when={menu.config.canAuth}>
        <Item href="/login">
          <LogIn /> Login
        </Item>
      </Show>

      <Show when={menu.guest}>
        <UserProfile />

        <CharacterLink />

        <Show when={menu.flags.chub}>
          <Item href="/chub">
            <ShoppingBag />
            CHUB
          </Item>
        </Show>

        <ChatLink />

        <Library />
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

const Item: Component<{ href?: string; children: string | JSX.Element; onClick?: () => void }> = (
  props
) => {
  return (
    <>
      <Show when={!props.href}>
        <div
          class="flex min-h-[2.5rem] cursor-pointer items-center justify-start gap-4 rounded-lg px-2 hover:bg-[var(--bg-700)] sm:min-h-[2.5rem]"
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
          class="flex min-h-[2.5rem] items-center justify-start gap-4 rounded-lg px-2 hover:bg-[var(--bg-700)] sm:min-h-[2.5rem]"
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
        <span
          class={`flex h-6 items-center justify-center rounded-xl bg-red-600 px-2 text-xs text-white`}
        >
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

const Library = () => {
  const cfg = settingStore()

  return (
    <div class="grid w-full gap-2">
      <Item href="/memory">
        <Book /> Library{' '}
      </Item>
    </div>
  )
}

const CharacterLink = () => {
  return (
    <MultiItem>
      <Item href="/character/list">
        <Heart /> Matches
      </Item>
      <EndItem>
        <A class="icon-button" href="/editor">
          <Plus />
        </A>
      </EndItem>
    </MultiItem>
  )
}

const ChatLink = () => {
  return (
    <MultiItem>
      <Item href="/chats">
        <MessageCircle fill="var(--bg-100)" /> Chats
      </Item>
      <EndItem>
        <A class="icon-button" href="/chats/create">
          <Plus />
        </A>
      </EndItem>
    </MultiItem>
  )
}

const UserProfile = () => {
  const chars = characterStore()
  const user = userStore()

  return (
    <>
      <div
        class="grid w-full items-center justify-between gap-2"
        style={{
          'grid-template-columns': '1fr 30px',
        }}
      >
        <Item
          onClick={() => {
            settingStore.closeMenu()
            userStore.modal(true)
          }}
        >
          <Switch>
            <Match when={chars?.impersonating}>
              <CharacterAvatar
                char={chars.impersonating!}
                format={{ corners: 'circle', size: 'xs' }}
              />
            </Match>

            <Match when>
              <AvatarIcon
                avatarUrl={chars.impersonating?.avatar || user.profile?.avatar}
                format={{ corners: 'circle', size: 'xs' }}
              />
            </Match>
          </Switch>
          <span>{chars.impersonating?.name || user.profile?.handle}</span>
          <span class="float-right text-yellow-100"> {user.user?.credits || 0}</span>
          <Show when={user.user?.premium || false}>
            <span class="text-right text-xs text-yellow-300">
              {' '}
              <Star />
            </span>
          </Show>
        </Item>
        <div class="flex items-center">
          <a
            class="icon-button"
            onClick={() => {
              settingStore.toggleImpersonate(true)
              settingStore.closeMenu()
            }}
          >
            <VenetianMask />
          </a>
        </div>
      </div>
    </>
  )
}

const MultiItem: Component<{ children: any }> = (props) => {
  return (
    <div class="grid w-full gap-2" style={{ 'grid-template-columns': '1fr 30px' }}>
      {props.children}
    </div>
  )
}

const EndItem: Component<{ children: any }> = (props) => {
  return <div class="flex items-center">{props.children}</div>
}

const Slots: Component = (props) => {
  let ref: HTMLDivElement
  const state = settingStore()
  const { load } = useResizeObserver()

  onMount(() => {
    load(ref)
  })

  const [rendered, setRendered] = createSignal(false)

  createEffect(() => {
    if (rendered()) return

    if (state.showMenu) {
      setTimeout(() => setRendered(true), 500)
    }
  })

  return (
    <div ref={ref!} class="h-full w-full">
      <Slot parent={ref!} slot="menu" />
    </div>
  )
}
