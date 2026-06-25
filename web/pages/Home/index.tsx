import './blog.css'
import nsfwTools from '../../asset/featured-on-badge-b.avif?url'
import { Component, For, Show, createMemo, onMount } from 'solid-js'
import {
  ComponentEmitter,
  createEmitter,
  getAssetUrl,
  setComponentPageTitle,
  uniqueBy,
} from '../../shared/util'
import { announceStore, chatStore, userStore } from '../../store'
import { A, useNavigate } from '@solidjs/router'
import { MoveRight, Plus, Heart, Users } from '/web/icons'
import AvatarIcon from '/web/shared/AvatarIcon'
import { elapsedSince } from '/common/util'
import { markdown } from '/web/shared/markdown'
import Slot from '/web/shared/Slot'
import { useRef } from '/web/shared/hooks'

const taaftHTML = `<a href="https://theresanaiforthat.com/ai/charluv/?ref=featured&v=2416874" target="_blank" rel="nofollow"><img width="300" src="https://media.theresanaiforthat.com/featured-on-taaft.png?width=600"></a>`

const itchHTML = `<iframe frameborder="0" src="https://itch.io/embed/2216072?bg_color=55b89c&amp;fg_color=fff" width="552" height="167"><a href="https://rongames.itch.io/charluv">Charluv by Charluv</a></iframe>`

const BlogPage: Component = () => {
  const [topRef, onTopRef] = useRef()
  const [midRef, onMidRef] = useRef()
  setComponentPageTitle('News')

  const user = userStore()
  const announce = announceStore()

  const announcements = createMemo(() => {
    return announce.list.filter((ann) => {
      if (ann.location && ann.location !== 'home') return false

      const level = ann.userLevel ?? -1
      const userPremium = user.user?.premium ? 10 : -1
      const premiumLevel = Math.max(user.userLevel, userPremium)
      return premiumLevel >= level
    })
  })

  const emitter = createEmitter('loaded')

  onMount(() => {
    announceStore.getAll()
  })

  return (
    <div class="blg-root">
      <header class="blg-head">
        <h1 class="blg-title">
          News &amp; <em>Updates</em>
        </h1>
        <p class="blg-tag">
          Charluv is a virtual dating chat service where you can even create your own characters.
          Membership is free; premium gives you priority and near-unlimited messages. Your
          conversations are completely private and never shared with anyone unless you invite them.
        </p>
      </header>

      <div class="blg-ad" ref={onTopRef}>
        <Slot slot="leaderboard" parent={topRef()} />
      </div>

      <Show when={announcements().length > 0}>
        <section class="blg-feed" aria-label="Announcements">
          <For each={announcements()}>
            {(item) => (
              <article class="blg-post">
                <div class="blg-post-head">
                  <h2 class="blg-post-title">{item.title}</h2>
                  <span class="blg-post-date">{elapsedSince(item.showAt)} ago</span>
                </div>
                <div
                  class="blg-post-body rendered-markdown"
                  innerHTML={markdown.makeHtml(item.content)}
                />
              </article>
            )}
          </For>
        </section>
      </Show>

      <RecentChats emitter={emitter} />

      <div class="blg-ad" ref={onMidRef}>
        <Slot slot="content" parent={midRef()} />
      </div>

      <Features />

      <section class="blg-card" aria-label="Getting started">
        <h2 class="blg-card-title">Getting Started</h2>
        <p>
          Looking for help getting started? Check out the{' '}
          <a class="blg-link-inline" href="https://guide.charluv.com" target="_blank">
            Official Guide
          </a>{' '}
          or head to the{' '}
          <a class="blg-link-inline" href="https://charluv.com/discord" target="_blank">
            Charluv Discord
          </a>
          .
        </p>
      </section>

      <nav class="blg-links" aria-label="Links">
        <A class="blg-pill" href="/guides/memory">
          Memory Book
        </A>
        <a class="blg-pill" href="/discord" target="_blank">
          Discord
        </a>
        <A class="blg-pill" href="/terms">
          Terms of Service
        </A>
        <A class="blg-pill" href="/privacy">
          Privacy Policy
        </A>
      </nav>

      <footer class="blg-footer">
        <div class="blg-foot-group" innerHTML={itchHTML} />
        <div class="blg-foot-group">
          <div innerHTML={taaftHTML} />
          <a href="https://nsfw.tools" target="_blank" rel="nofollow">
            <img width="250" src={nsfwTools} alt="Featured on nsfw.tools" />
          </a>
        </div>
      </footer>
    </div>
  )
}

export default BlogPage

const RecentChats: Component<{ emitter: ComponentEmitter<'loaded'> }> = (props) => {
  const nav = useNavigate()
  const user = userStore()
  const state = chatStore((s) => {
    // We want this to occur after the state has propogated
    setTimeout(() => props.emitter.emit.loaded(), 200)

    return {
      chars: s.allChars.list,
      last: uniqueBy(s.allChats, 'characterId')
        .slice()
        .sort((l, r) => (r.updatedAt > l.updatedAt ? 1 : -1))
        .slice(0, 4)
        .map((chat) => ({ chat, char: s.allChars.map[chat.characterId] })),
    }
  })

  return (
    <section class="blg-recent" aria-labelledby="homeRecConversations">
      <h2 id="homeRecConversations" class="blg-recent-title">
        Recent Conversations
      </h2>
      <div class="blg-recent-grid" classList={{ hidden: state.last.length === 0 }}>
        <For each={state.last}>
          {({ chat, char }) => (
            <>
              <div
                role="link"
                aria-label={`Chat with ${char?.name}, ${elapsedSince(chat.updatedAt)} ago ${
                  chat.name
                }`}
                class="hidden h-24 w-full cursor-pointer overflow-hidden rounded-xl border border-[var(--dsc-line)] bg-[var(--dsc-surface)] transition duration-300 hover:border-[var(--dsc-green)] hover:bg-[var(--dsc-bg-2)] sm:flex"
                onClick={() => nav(`/chat/${chat._id}`)}
              >
                <Show when={char?.avatar}>
                  <AvatarIcon
                    noBorder
                    class="flex items-center justify-start"
                    format={{ corners: 'md', size: 'max3xl' }}
                    avatarUrl={getAssetUrl(char?.avatar || '')}
                  />
                </Show>

                <Show when={!char?.avatar}>
                  <div class="flex h-24 w-24 items-center justify-center">
                    <AvatarIcon
                      noBorder
                      format={{ corners: 'md', size: 'xl' }}
                      avatarUrl={getAssetUrl(char?.avatar || '')}
                    />
                  </div>
                </Show>

                <div class="flex w-full flex-col justify-between text-sm" aria-hidden="true">
                  <div class="flex flex-col px-1">
                    <div class="text-sm font-bold">{char?.name}</div>
                    <div class="text-xs text-[var(--dsc-muted)]">
                      {elapsedSince(chat.updatedAt)} ago
                    </div>
                    <Show when={chat.name}>
                      <p class="line-clamp-2 max-h-10 overflow-hidden text-ellipsis">{chat.name}</p>
                    </Show>
                  </div>
                  <div class="flex max-h-10 w-full items-center justify-end px-2">
                    <MoveRight size={14} />
                  </div>
                </div>
              </div>

              <div
                role="link"
                aria-label={`Chat with ${char?.name}, ${elapsedSince(chat.updatedAt)} ago ${
                  chat.name
                }`}
                class="flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-[var(--dsc-line)] bg-[var(--dsc-surface)] transition duration-300 hover:border-[var(--dsc-green)] hover:bg-[var(--dsc-bg-2)] sm:hidden"
                onClick={() => nav(`/chat/${chat._id}`)}
              >
                <div class="flex" aria-hidden="true">
                  <div class="flex items-center justify-center px-1 pt-1">
                    <AvatarIcon
                      noBorder
                      format={{ corners: 'circle', size: 'md' }}
                      avatarUrl={getAssetUrl(char?.avatar || '')}
                    />
                  </div>
                  <div class="flex flex-col overflow-hidden text-ellipsis whitespace-nowrap px-1">
                    <div class="overflow-hidden text-ellipsis text-sm font-bold">{char?.name}</div>
                    <div class="text-xs text-[var(--dsc-muted)]">
                      {elapsedSince(chat.updatedAt)} ago
                    </div>
                  </div>
                </div>

                <div class="flex h-full w-full flex-col justify-between text-sm" aria-hidden="true">
                  <p class="line-clamp-2 max-h-10 overflow-hidden text-ellipsis px-1">
                    {chat.name}
                  </p>

                  <div class="flex max-h-10 w-full items-center justify-end px-2">
                    <MoveRight size={14} />
                  </div>
                </div>
              </div>
            </>
          )}
        </For>

        <Show when={!user?.loggedIn}>
          <BorderCard href="/register">
            <div>Register to Start Chatting</div>
            <Plus size={20} />
          </BorderCard>
        </Show>

        <Show when={state.last.length < 4 && user.loggedIn}>
          <BorderCard href="/discover">
            <div>Find Matches</div>
            <Users size={20} />
          </BorderCard>
        </Show>

        <Show when={state.last.length < 3 && user.loggedIn}>
          <BorderCard href="/chats/create">
            <div>Start a Conversation</div>
            <Plus size={20} />
          </BorderCard>
        </Show>

        <Show when={state.last.length < 2 && user.loggedIn}>
          <BorderCard href="/create">
            <div class="flex w-full items-center justify-center text-center">
              Create a Character
            </div>
            <Heart size={20} />
          </BorderCard>
        </Show>
      </div>
    </section>
  )
}

const BorderCard: Component<{ children: any; href: string; ariaLabel?: string }> = (props) => {
  const nav = useNavigate()
  return (
    <div
      role="button"
      aria-label={props.ariaLabel}
      class="flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[var(--dsc-line)] text-center text-[var(--dsc-muted)] transition duration-300 hover:border-[var(--dsc-green)] hover:bg-[var(--dsc-surface)] hover:text-[var(--dsc-cream)]"
      onClick={() => nav(props.href)}
    >
      {props.children}
    </div>
  )
}

const Features: Component = () => (
  <section class="blg-card" aria-label="Notable features">
    <h2 class="blg-card-title">Notable Features</h2>
    <p>
      <span class="hl">Charluv</span> is completely free to use and free to register. Your data is
      kept private and you can permanently delete it at any time. We take your privacy very
      seriously.
    </p>
    <p>
      <span class="hl">Unique model</span> trained for understanding virtual dating and character
      progression.
    </p>
    <p>
      <span class="hl">Register</span> to have your data available on all of your devices.
    </p>
    <p>Chat with multiple characters at the same time.</p>
    <p>
      Create <span class="hl">Memory Books</span> to give your characters information about their
      world.
    </p>
    <p>
      <span class="hl">Image generation</span> — generate images in your chats.
    </p>
    <p>
      <span class="hl">Voice</span> — give your characters a voice and have them speak back to you.
    </p>
  </section>
)
