import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import { markdown } from '../../shared/markdown'
import { setComponentPageTitle } from '../../shared/util'

const text = `
_17 June 2023_
- Added character creation,import,export,overrides in chat, and more!

_6 June 2023_
- Add background color to customizable colors

_3 June 2023_
- Add "message background color", "chat text color", and "chat emphasis color" to UI settings

_1 June 2023_
- Character impersonation! You can now speak as characters that you create. Click on your avatar/name in the menu.

_31 May 2023_
- Migrate to "prompt templates" - More to come on this functionality soon

_20-28 May 2023_
- Remember chat input "drafts"
- Fixed shop checkout, it was impossible to purchase anything from the shop
- Started implementing tags to replace the dating filter in settings

_19 May 2023_
- Image retry uses previous prompt (only applies to new images)
- Clicking an avatar in chat opens the avatar in the image viewer modal

_15 May 2023_
- Add 'avatar wrap-around'. Enable this in the UI settings will allow text to wrap around avatars in messages.
- Fix 'failing to send a message' after editing the chat.

_13 May 2023_
- Introduce "multiple character" capability. Add characters to your chats using the 'Participants' option.
  - Multi-user + Multi-character is supported.
- Add 'OOC toggle' adjacent to message input for multi-user rooms

_10 May 2023_
- Fix issues with Voice playback.

_8 May 2023_
- Add "out of character" mode for group chats

_7 May 2023_
- First steps on rebranding to Charluv
- Implemented 13B model

_6 May 2023_
- Added text-to-speech, speech-to-text
- Fixed issue with memory books for authed users
- Reduced bundle size (from 7MB to 1MB)

_2 May 2023_
- Improved mobile view

_1 May 2023_
- Fixed XP on matches page (list view only)

_30 April 2023_
- Fixed iOS height
- Improved character filter

_28 April 2023_
- Merged with upstream Agnaistic
- Added current wait time for text on information page (premium users skip the queue)
- Started rebranding due to stupid aivo.co

_Older changes are not listed here._

`

const ChangeLog: Component = () => {
  setComponentPageTitle('Changelog')
  return (
    <>
      <PageHeader title="Change Log" />

      <div class="markdown" innerHTML={markdown.makeHtml(text)}></div>
    </>
  )
}

export default ChangeLog
