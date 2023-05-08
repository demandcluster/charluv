import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import { markdown } from '../../shared/markdown'
import { setComponentPageTitle } from '../../shared/util'

const text = `
## Change Log

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
