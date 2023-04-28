import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import { markdown } from '../../shared/markdown'
import { setComponentPageTitle } from '../../shared/util'

const text = `
# Change Log

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

KNOWN ISSUES:
- Progress of character is not visible atm, character still progresses and scenarios are still updated nevertheless.
- Profile page of characters not reachable from matches page

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
