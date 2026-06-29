import { Component } from 'solid-js'
import PageHeader from '/web/shared/PageHeader'
import { markdown } from '/web/shared/markdown'
import { Page } from '/web/Layout'

const FAQ: Component = () => {
  return (
    <Page>
      <PageHeader title="FAQ" subtitle="Frequently Asked Questions"></PageHeader>
      <div class="markdown" innerHTML={markdown.makeHtml(faq)}></div>
    </Page>
  )
}

export default FAQ

const faq = `

### Are my responses filtered?
No, Charluv does not make any attempt to filter your responses. However, on model level we have taken measures to prevent CSAM.

### How can I have multiple profiles or change my name in the chat?
This is accomplished by **impersonating a character**. To impersonate, click on your Avatar/Name in the main menu.

### Can I have multiple users and characters in my chat?
Yes. In your **Chat Options**, you can add characters and invite users from **Participants**.

### Can I edit or delete my chat messages?
Yes. In the **Chat Options** enable *Chat Editing* and extra buttons will appear in your chat messages.

### My response was cut off mid-sentence, can I continue it?
Yes. In the **Input Options** you can choose to *Continue*.

### Can I generate images based on my conversation?
Yes, you can generate images by clicking the **generate image** button on the chat input. Image generation (and regeneration) costs **25 credits** — buttons that spend credits show a 🪙 coin with the amount.

### Can I make my character's images look consistent?
Yes. In the character editor, pick 1–4 reference images and use **Build LoRA** to train an image LoRA for that character. Training a LoRA costs **300 credits**.

### How do credits and costs work?
Most actions spend credits, shown as a 🪙 coin on the button before you click:

- Sending a message: **10** (an **Event** turn is **25**)
- Generating or regenerating an image: **25**
- Creating a character: **100**, charged when you finalize on **Create my date** — building the character up to that point is free
- Editing a finished character: **30**
- Training an image LoRA: **300**

Credits refill automatically: free accounts **+5 every 2 minutes** (up to 500), premium **+20 every 2 minutes** (up to 5,000).

### Can I sign in with Google or Patreon?
Yes — with either. If you don't have an account yet, signing in with Google or Patreon creates one. If you already have an account, **link Google or Patreon from your profile**, then sign in with either. To prevent duplicate accounts, if we detect you already have an account on your device we'll ask you to sign in and link it instead of creating a second one.

### Do you support Text-to-Speech?
Yes, In your **Settings -> Voice Settings**, some premium characters include Elevenlabs speech. Free characters include browser based speech.

### Do you support Speech-to-Text?
Yes, In your **Settings -> Voice Settings**, you can enable speech-to-text.

### Can I customise the UI?
Yes, you can change some elements of Charluv in your **Settings -> UI Settings**.

### I forgot my password!
Recovering your account is not guaranteed. You can try to contact us on [Discord](https://charluv.com/discord) to try to recover your account.

### My question isn't answered here, where should I ask?
The best place to get a quick answer is on [Discord](https://charluv.com/discord).


`
