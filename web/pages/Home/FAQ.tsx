import { Component } from 'solid-js'
import PageHeader from '/web/shared/PageHeader'
import { markdown } from '/web/shared/markdown'

const FAQ: Component = () => {
  return (
    <>
      <PageHeader title="FAQ" subtitle="Frequently Asked Questions"></PageHeader>
      <div class="markdown" innerHTML={markdown.makeHtml(faq)}></div>
    </>
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
Yes, you can generate images by clicking the **generate image** button on the chat input.

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
