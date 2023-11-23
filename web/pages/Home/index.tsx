import './home.scss'
import { Component, For, Match, Show, Switch, createSignal, onMount } from 'solid-js'
import logoDark from '../../asset/logoDark.png'
import logo from '../../asset/logo.png'
import discordLogo from '../../asset/discord-logo-blue.svg'
import PageHeader from '../../shared/PageHeader'
import { adaptersToOptions, getAssetUrl, setComponentPageTitle } from '../../shared/util'
import { announceStore, userStore, chatStore, settingStore } from '../../store'
import { A, useNavigate } from '@solidjs/router'
import { AlertTriangle, MoveRight, Plus, Settings, Heart, Users } from 'lucide-solid'
import { Card, Pill, SolidCard, TitleCard } from '/web/shared/Card'
import Modal from '/web/shared/Modal'
import AvatarIcon from '/web/shared/AvatarIcon'
import { elapsedSince } from '/common/util'
import { AppSchema } from '/common/types'
import { markdown } from '/web/shared/markdown'
import WizardIcon from '/web/icons/WizardIcon'
import Button from '/web/shared/Button'
import Slot from '/web/shared/Slot'

const enum Sub {
  None,
  OpenAI,
  NovelAI,
  Horde,
}

const text = `

### This website is a simulation

This website does not offer any real people or real dating. It is a simulation.

Our AI is trained on a large neural network. Average response time is around 20 seconds.

### How to register?

[Click here to register](/register)

You need an early access code which you can find on the register page, if that ran out, visit our Discord to get one automaticly.
We need to use these codes in order to be able to limit registrations. For your privacy, we do not require an email or any PII. 

### How to use this website?

In order to get matches you have to register for a (free) account. Goto [Likes](/likes/list) to see all available characters.

When you find someone you like, click the checkmark and you have a match. You can send your match a message and start a conversation. Remember you are not talking to real people but your are talking to AI. The AI does not realize this (apart from Aiva).

Every character has scenarios that progress the story. Scenarios will progress the more you chat with a character. You can see the progress on the heart symbol next to the character on the [Matches](/character/list) page.

### Chat features

When talking about yourself always refer to yourself as You. Example: Hello there \*you wave\*

When talking about the other person always refer to them by their name. Example: Hello Julia how are you?

You can perform an action by placing the action in between asterisks \*action\*.

If you don't like a reply, you can just reroll it and get another reply. You can even edit the reply to be exactly as you like. This will take away the fun for a large part, so in order to access the edit feaetures, you first have to toggle the switch on top of the chat window to activate them.


### Credits

Our app is based on [AgnAIstic](https://github.com/luminai-companion/agn-ai).
The source code for our version can be found [here](https://github.com/demandcluster/charluv)

We run our [own AI Horde](https://github.com/demandcluster/aivohorde) on a massive 13B model.

The software we use for the Horde is made possible by [db0](https://dbzer0.com/).

Charluv is created by Demandcluster B.V. in the Netherlands, we are a small team of developers and designers.
`
function toItem(model: HordeModel) {
  return {
    label: `${model.name} - (queue: ${model.queued}, eta: ${model.eta}, count: ${model.count})`,
    value: model.name,
  }
}
const HomePage: Component = () => {
  let ref: any
  setComponentPageTitle('Virtual Date an AI')
  const [sub, setSub] = createSignal(Sub.None)
  const user = userStore()
  const closeSub = () => setSub(Sub.None)
  const cfg = settingStore((cfg) => ({
    adapters: adaptersToOptions(cfg.config.adapters),
    guest: cfg.guestAccessAllowed,
    config: cfg.config,
  }))

  const announce = announceStore()

  onMount(() => {
    announceStore.getAll()
  })

  return (
    <div>
      <PageHeader
        title={
          <>
            <div
              class="w-full pb-3 pl-4 pt-3 text-2xl text-white sm:flex"
              style="background:#55b89cff;"
            >
              Charluv Virtual Dating
            </div>
          </>
        }
      />

      <div class="flex flex-col gap-4 text-lg">
        <div class="flex justify-center text-6xl" style="background: #55b89cff;">
          <img src={logoDark} alt="Charluv Virtual Dating" class="w-4/12 p-8" />
        </div>
        <div class="w-full" ref={ref}>
          <Slot slot="leaderboard" parent={ref} />
        </div>
        <Card border>
          <div class="leading-6">
            <b>Charluv</b> is a virtual dating chat service where you can even create your own
            characters. Membership is free, premium membership gives you priority and near unlimited
            messages. Your conversations are completely private and never shared with anyone unless
            you invite them to your chat.
          </div>
        </Card>

        <RecentChats />

        <Show when={announce.list.length > 0}>
          <Announcements list={announce.list} />
        </Show>

        <div class="home-cards">
          <TitleCard type="bg" title="Guides" class="" center ariaRole="region" ariaLabel="Guides">
            <div class="flex flex-wrap justify-center gap-2">
              <A href="/guides/memory">
                <Pill>Memory Book</Pill>
              </A>
            </div>
          </TitleCard>

          <TitleCard type="bg" title="Links" center ariaRole="region" ariaLabel="Links">
            <div class="flex flex-wrap justify-center gap-2">
              <a href="/discord" target="_blank">
                <Pill inverse>Charluv Discord</Pill>
              </a>

              <A class="link" href="/changelog">
                <Pill inverse>Change Log</Pill>
              </A>

              <A class="link" href="/terms">
                <Pill>Terms of Service</Pill>
              </A>

              <A class="link" href="/privacy">
                <Pill>Privacy Policy</Pill>
              </A>
            </div>
          </TitleCard>
        </div>

        <Card border>
          <div class="flex justify-center text-xl font-bold">Notable Features</div>
          <div class="flex flex-col gap-2 leading-6">
            <p>
              <b class="highlight">Charluv</b> is completely free to use. It is free to register.
              Your data will be kept private and you can permanently delete your data at any time.
              We take your privacy very seriously. You can get premium membership to skip the queue
              and get more credits. It will also help us survive.
            </p>
            <p>
              <b class="highlight">Unique model</b> trained for understanding virtual dating and
              character progression.
            </p>
            <p>
              <b class="highlight">Register</b> to have your data available on all of your devices.
            </p>
            <p>Chat with multiple users and multiple characters at the same time</p>
            <p>
              Create <b class="highlight">Memory Books</b> to give your characters information about
              their world.
            </p>
            <p>
              <b class="highlight">Image generation</b> - Generate images in your chats.
            </p>
            <p>
              <b class="highlight">Voice</b> - Give your characters a voice and speak back to them.
            </p>
          </div>
        </Card>

        <Card border>
          <div class="mb-2 flex justify-center text-xl font-bold">Credits</div>
          <div class=" gap-2 leading-6">
            Our app is based on{' '}
            <a class="link" href="https://github.com/luminai-companion/agn-ai" target="_blank">
              AgnAIstic
            </a>
            .<br />
            The source code for our version can be found{' '}
            <a href="https://github.com/demandcluster/charluv" class="link" target="_blank">
              here
            </a>
            <br />
            <br />
            We run our{' '}
            <a href="https://github.com/demandcluster/aivohorde" class="link" target="_blank">
              own AI Horde
            </a>{' '}
            on a massive fine-tuned 20B model{' '}
            <a
              href="[https://huggingface.co/TheBloke/MLewd-ReMM-L2-Chat-20B-GGUF"
              class="link"
              target="_blank"
            >
              MLewd-ReMM-L2-Chat-20B
            </a>
            !<br />
            The software we use for the Horde is made possible by{' '}
            <a href="https://dbzer0.com" class="link" target="_blank">
              db0
            </a>
            <br />
            <br />
            Charluv is created by Demandcluster B.V. in the Netherlands, we are a small team of
            developers and designers.
          </div>
        </Card>
      </div>

      <Switch>
        <Match when={sub() === Sub.Horde}>
          <HordeGuide close={closeSub} />
        </Match>

        <Match when={sub() === Sub.OpenAI}>
          <OpenAIGuide close={closeSub} />
        </Match>
      </Switch>
    </div>
  )
}

export default HomePage

const RecentChats: Component = (props) => {
  const user = userStore()

  const nav = useNavigate()
  const state = chatStore((s) => ({
    chars: s.allChars.list,
    last: s.allChats
      .slice()
      .sort((l, r) => (r.updatedAt > l.updatedAt ? 1 : -1))
      .slice(0, 4)
      .map((chat) => ({ chat, char: s.allChars.map[chat.characterId] })),
  }))

  return (
    <section class="flex flex-col" aria-labelledby="homeRecConversations">
      <div id="homeRecConversations" class="text-lg font-bold" aria-hidden="true">
        Recent Conversations
      </div>
      <div
        class="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
        classList={{ hidden: state.last.length === 0 }}
      >
        <For each={state.last}>
          {({ chat, char }) => (
            <>
              <div
                role="link"
                aria-label={`Chat with ${char.name}, ${elapsedSince(chat.updatedAt)} ago ${
                  chat.name
                }`}
                class="bg-800 hover:bg-700 hidden h-24 w-full cursor-pointer rounded-md border-[1px] border-[var(--bg-700)] transition duration-300 sm:flex"
                onClick={() => nav(`/chat/${chat._id}`)}
              >
                <Show when={char?.avatar}>
                  <AvatarIcon
                    noBorder
                    class="flex items-center justify-center"
                    format={{ corners: 'md', size: '3xl' }}
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
                    <div class="text-sm font-bold">{char.name}</div>
                    <div class="text-500 text-xs">{elapsedSince(chat.updatedAt)} ago</div>
                    <Show when={chat.name}>
                      <p class="line-clamp-2 max-h-10 overflow-hidden text-ellipsis">{chat.name}</p>
                    </Show>
                  </div>
                  <div class="flex max-h-10 w-full items-center justify-end px-2">
                    {/* <div class="flex items-center"> */}
                    <MoveRight size={14} />
                    {/* </div> */}
                  </div>
                </div>
              </div>

              <div
                role="link"
                aria-label={`Chat with ${char.name}, ${elapsedSince(chat.updatedAt)} ago ${
                  chat.name
                }`}
                class="bg-800 hover:bg-700 flex w-full cursor-pointer flex-col rounded-md border-[1px] border-[var(--bg-700)] transition duration-300 sm:hidden"
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
                    <div class="overflow-hidden text-ellipsis text-sm font-bold">{char.name}</div>
                    <div class="text-500 text-xs">{elapsedSince(chat.updatedAt)} ago</div>
                  </div>
                </div>

                <div class="flex h-full w-full flex-col justify-between text-sm" aria-hidden="true">
                  <p class="line-clamp-2 max-h-10 overflow-hidden text-ellipsis px-1">
                    {chat.name}
                  </p>

                  <div class="flex max-h-10 w-full items-center justify-end px-2">
                    {/* <div class="flex items-center"> */}
                    <MoveRight size={14} />
                    {/* </div> */}
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
          <BorderCard href="/likes/list">
            <div>Like to Get Matches</div>
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
          <BorderCard href="/editor">
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
      class="bg-800 text-700 hover:bg-600 flex h-24 w-full cursor-pointer flex-col items-center justify-center border-[2px] border-dashed border-[var(--bg-700)] text-center transition duration-300"
      onClick={() => nav(props.href)}
    >
      {props.children}
    </div>
  )
}

const Announcements: Component<{ list: AppSchema.Announcement[] }> = (props) => {
  let ref: any
  return (
    <>
      <section class="flex flex-col gap-2" aria-labelledby="homeAnnouncements">
        <div
          id="homeAnnouncements"
          class="flex items-end font-bold leading-[14px]"
          aria-hidden="true"
        >
          Announcements
        </div>
        <For each={props.list}>
          {(item, i) => (
            <div class="rounded-md border-[1px] border-[var(--hl-500)]">
              <div class="flex flex-col rounded-t-md bg-[var(--hl-800)] p-2">
                <div class="text-lg font-bold" role="heading">
                  {item.title}
                </div>
                <div class="text-700 text-xs">{elapsedSince(item.showAt)} ago</div>
              </div>
              <div
                class="rendered-markdown bg-900 rounded-b-md p-2"
                innerHTML={markdown.makeHtml(item.content)}
              ></div>
            </div>
          )}
        </For>
        <div ref={ref} class="my-1 w-full">
          <Slot slot="content" parent={ref} />
        </div>
      </section>
    </>
  )
}

const HordeGuide: Component<{ close: () => void }> = (props) => (
  <Modal show close={props.close} title="Horde Guide" maxWidth="half" ariaLabel="Horde guide">
    <div class="flex flex-col gap-2">
      <SolidCard bg="hl-900">
        <b>Important!</b> For reliable responses, ensure you have registered at{' '}
        <a href="https://aihorde.net/register" class="link" target="_blank">
          AI Horde
        </a>
        . Once you have your key, add it to your{' '}
        <A href="/settings?tab=ai&service=horde" class="link">
          Horde Settings
        </A>
        .
      </SolidCard>

      <SolidCard bg="hl-900">
        AI Horde is run and powered by a small number of volunteers that provide their GPUs. This is
        a great service, but it can be a little slow. Consider contributing to the Horde!
      </SolidCard>

      <Card>
        Keep your <b>Max New Tokens</b> below 100 unless you know what you're doing!
        <br />
        Using high values for 'Max New Tokens' is the main cause of timeouts and slow replies.
      </Card>
      <Card>
        By default we use anonymous access. You can provide your API key or change the model in the
        Settings page.
      </Card>
    </div>
  </Modal>
)

const OpenAIGuide: Component<{ close: () => void }> = (props) => (
  <Modal show close={props.close} title="OpenAI Guide" maxWidth="half" ariaLabel="OpenAI guide">
    <div class="flex flex-col gap-2">
      <Card>
        OpenAI is a <b>paid service</b>. To use OpenAI, you to need provide your OpenAI API Key in
        your settings:
      </Card>

      <Card>
        Firstly, you will need to{' '}
        <A class="link" href="https://auth0.openai.com/u/signup" target="_blank">
          Register an account OpenAI
        </A>
        .
      </Card>

      <Card>
        Once registered, you will need to{' '}
        <A class="link" href="https://platform.openai.com/account/api-keys" target="_blank">
          generate an API key.
        </A>
      </Card>

      <Card>
        Once you have your API key, head to the{' '}
        <A class="link" href="/settings?tab=ai&service=openai">
          Settings
        </A>{' '}
        page and set your key in the OpenAI area.
      </Card>

      <Card>
        To use OpenAI to generate your responses, ensure your chat is using OpenAI Preset in your{' '}
        <b>Chat Preset settings</b>.
        <br />
        You can access these via the top-right menu in your chat.
      </Card>
    </div>
  </Modal>
)
