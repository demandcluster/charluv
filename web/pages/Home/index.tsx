import { Component, createEffect, Show } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import { adaptersToOptions, setComponentPageTitle } from '../../shared/util'
import { settingStore } from '../../store'
import { markdown } from '../../shared/markdown'
import { A } from '@solidjs/router'
import Divider from '../../shared/Divider'
import Button from '../../shared/Button'
import logoDark from '../../assets/logoDark.png'
import logo from '../../assets/logo.png'
import discordLogo from '../../assets/discord-logo-blue.svg'
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

When you do not want to answer the character but just want them to continue, press \`Generate more\` on the chat options (right of chat input). This can be helpful if the character is telling you a story.

You can use the same chat options button to get the \`Generate image\` option. This will generate an image based on the current chat history. 

### How to get premium?

[Click here for our shop.](/shop)

Upgrade to our premium service and enjoy the benefits of skipping message queues, as well as having your credits recharge twice as fast. Plus, premium users receive a bonus credit recharge of up to 1,000, compared to the standard 200. Don't miss out on these exclusive perks - become a premium user today!

### Can I create my own characters?

Yes you can. However, you need to goto our Discord to submit the character. All characters are evaluated for quality and age. We do not allow any character under the age of 18.

### Survival Goals

In order to survive as a website we need ***€800,--*** before summer 2023. So far we got ***€56,--***. 
All proceeds will be used to pay for the server and the AI. We will not take any money out of this project.

### About

Charluv

Our app is based on [AgnAIstic](https://github.com/luminai-companion/agn-ai).

We run our own AI Horde on a massive 13B model!

Charluv is created by Demandcluster B.V. in the Netherlands, we are a small team of developers and designers.
`
function toItem(model: HordeModel) {
  return {
    label: `${model.name} - (queue: ${model.queued}, eta: ${model.eta}, count: ${model.count})`,
    value: model.name,
  }
}
const HomePage: Component = () => {
  setComponentPageTitle('Information')
  const cfg = settingStore((cfg) => ({ adapters: adaptersToOptions(cfg.config.adapters) }))
  const model = settingStore()
  const refreshHorde = () => {
    settingStore.getHordeModels()
    settingStore.getHordeWorkers()
  }
  createEffect(() => {
    refreshHorde()
  })

  return (
    <div>
      <PageHeader
        title={
          <>
            <div
              class="w-full pt-3 pl-4 pb-3 text-2xl text-white sm:flex"
              style="background:#55b89cff;"
            >
              Charluv Virtual Dating
            </div>
          </>
        }
        subtitle={
          <Show when={model.models.length > 0}>
            <div class="markdown px-4 text-gray-400">
              Current wait time:&nbsp;
              {model.models[0].eta}s
            </div>
          </Show>
        }
      />

      <div class="markdown px-4">
        <b>Useful Links</b>

        <ul>
          <li>
            <A href="/help">Chatbot based helpdesk</A>
          </li>
          <li>
            <A href="/changelog">Change Log</A>
          </li>
          <li>
            <A href="/memory/instructions" target="_blank">
              Memory Book Guide
            </A>
          </li>
          <li>
            <A href="/terms">Terms of service</A>
          </li>
          <li>
            <A href="/privacy">Privacy Policy</A>
          </li>
          <li>
            <Button class="my-4 bg-white fill-white shadow shadow-emerald-500 drop-shadow-xl">
              <a href="https://discord.gg/vr8M57PDwH" target="blank">
                {' '}
                <img src={discordLogo} alt="discord" class="w-24 max-w-xs fill-white" />
              </a>
            </Button>
          </li>
        </ul>
      </div>

      <div class="markdown px-4" innerHTML={markdown.makeHtml(text)} />
    </div>
  )
}

export default HomePage
