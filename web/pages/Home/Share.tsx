import { Component } from 'solid-js'
import PageHeader from '/web/shared/PageHeader'
import { markdown } from '/web/shared/markdown'

const Share: Component = () => {
  return (
    <>
      <PageHeader title="Share your characters!" subtitle="get rewarded"></PageHeader>
      <div class="markdown" innerHTML={markdown.makeHtml(share)}></div>
    </>
  )
}

export default Share

const share = `

### Share your characters!
You can now make your characters dateable! Share your characters with the world and get rewarded for it.

### How do I share my characters?
When editting your character, check under  **Advanced Options**, you can enable **Submit for dating**. This will submit your character for review. Once approved, your character will be available for dating.
If the character is accepted you will be rewarded between 1,000 and 2,000 credits depending on the quality of your character.

### How do I increase the chances of my character being accepted?

- Make sure your character is complete and has a good description.
- Make sure your character is not offensive or inappropriate.
- Make sure your character is not a duplicate of an existing character.
- Make sure your character is not a minor.
- Make sure your character is not a real person.

### How will I know if my character is declined?

You will see a notification on the profile of your character (edit it again so you can see the notification).
If your character is declined you can always reset it and try again. 
Visit [Discord](https://aivo.chat/discord) for more information if you don't know what you should improve.

### What happens if my character is accepted for dating?

Your character will be available for dating and you will be rewarded between 1,000 and 2,000 credits depending on the quality of your character.	
This also means you loose the ability to edit your character. If you want to be able to edit it later, make a copy of it before submitting it for dating.

### How can I get more credits?

The amount of credits you get depends on the following factors:
- The quality of your character.
- The quality of the image included with your character.
- Does the character have a dedicated scenario attached?
- Does the character have an elaborate character book attached?

### How do I specify a scenario for my character?

Copy/paste the ID (from the url) of the scenario in Character Version field of your character.
We will soon create UI for this feature.

### Where to get help?

Visit [Discord](https://aivo.chat/discord) for more information.

`
