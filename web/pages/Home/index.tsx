import { Component, createEffect, Show } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import { adaptersToOptions, setComponentPageTitle } from '../../shared/util'
import { settingStore } from '../../store'
import { markdown } from '../../shared/markdown'
import { A } from '@solidjs/router'
import Divider from '../../shared/Divider'
import logoDark from '../../assets/logoDark.png'
import logo from '../../assets/logo.png'

const text = `

### This website is a simulation

This website does not offer any real people or real dating. It is a simulation.

Our AI is trained on a 300 billion parameter neural network. We will improve the AI over time when we get enough premium users. We make no money of this project, we reinvest if we do.

### How to use this website?

In order to get matches you have to register for a (free) account. Goto [Likes](/likes/list) to see all available characters.

When you find someone you like, click the checkmark and you have a match. You can send your match a message and start a conversation. Remember you are not talking to real people but your are talking to AI. The AI does not realize this (apart from Aiva).

Every character has scenarios that progress the story. Scenarios will progress the more you chat with a character. You can see the progress on the heart symbol next to the character on the [Matches](/character/list) page.

### Chat features

When talking about yourself always refer to yourself as You. Example: Hello there \*you wave\*

When talking about the other person always refer to them by their name. Example: Hello Julia how are you?

You can perform an action by placing the action in between asterisks \*action\*.

If you don't like a reply, you can just reroll it and get another reply. You can even edit the reply to be exactly as you like. This will take away the fun for a large part, so in order to access the edit feaetures, you first have to toggle the switch on top of the chat window to activate them.

When you do not want to answer the character but just want them to continue, just say continue. This can be helpful if the character is telling you a story.

### How to get premium?

[Click here for our shop.](/shop)

Upgrade to our premium service and enjoy the benefits of skipping message queues, as well as having your credits recharge twice as fast. Plus, premium users receive a bonus credit recharge of up to 1,000, compared to the standard 200. Don't miss out on these exclusive perks - become a premium user today!

### Can I create my own characters?

Yes you can. However, you need to goto our Discord to submit the character. All characters are evaluated for quality and age. We do not allow any character under the age of 18.

### About

Artificial Intelligence Virtual Other

Our app is based on [AgnAIstic](https://github.com/luminai-companion/agn-ai).

We run our own AI Horde with a custom trained model. Currenly this is a 2.7b model. We will be upgrading to larger models when we have some premium members. We will continue to reinvest in the AI.

AIVO.CHAT is created by Demandcluster B.V. in the Netherlands, we are a small team of developers and designers.
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
            <div class="w-full px-1 pt-2 sm:flex">
              <img width="200px" src={logo} />
            </div>
          </>
        }
        subtitle={
          <Show when={model.models.length > 0}>
            <div class="markdown">
              Current wait time:&nbsp;
              {model.models[0].eta}s
            </div>
          </Show>
        }
      />

      <div class="markdown">
        <b>Useful Links</b>

        <ul>
          <li>
            <A href="/changelog">Change Log</A>
          </li>
          <li>
            <A
              href="https://github.com/demandcluster/aivo.chat/blob/aivo/instructions/memory.md"
              target="_blank"
            >
              Memory Book Guide
            </A>
          </li>
          <li>
            <A href="/terms">Terms of service</A>
          </li>
          <li>
            <A href="/privacy">Privacy Policy</A>
          </li>
        </ul>
      </div>

      <div class="markdown" innerHTML={markdown.makeHtml(text)} />
    </div>
  )
}

export default HomePage
