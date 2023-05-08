import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import { markdown } from '../../shared/markdown'
import { setComponentPageTitle } from '../../shared/util'

const text = `
# Change Log
_6 May 2023_
- Added text-to-speech, speech-to-text
- Fixed issue with memory books for authed users
- Reduced bundle size (from 7MB to 1MB)

_5 May 2023_
- Improve character importing: Allow multiple imports and improve error reporting

_21 Apr 2023_
- Added changelog
- Text queue priority for premium

_22 Apr 2023_
- Improved matches page
- Added search filters
- Log prompt to console setting

_23 Apr 2023_
- Updated core AI
- Added new characters (released soon)

_24 Apr 2023_
- Redone information page
- Home page now shows matches
- Image queue priority for premium (zero wait)

_25 Apr 2023_
- Added toggle image/list view on matches page
- Added favorites

_28 Apr 2023_
- Merged with upstream Agnaistic
- Added current wait time for text on information page (premium users skip the queue)
- Started rebranding due to stupid aivo.co

_30 Apr 2023_
- Fixed iOS height
- Improved character filter

_1 May 2023_
- Fixed XP on matches page (list view only)

_2 May 2023_
- Improved mobile view

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
