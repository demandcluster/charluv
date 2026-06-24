import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import { markdown } from '../../shared/markdown'
import { setComponentPageTitle } from '../../shared/util'
import logoDark from '../../asset/logoDark.png'

const text = `

# Premium via Patreon

Premium is available through our [Patreon](https://patreon.com/charluv) Premium tier — that's the only way to subscribe. Everything is handled on Patreon; you never enter payment details on our site.

# Why go premium?

- A larger, faster-refilling credit pool — chat and create more without running dry.
- Longer responses and more conversation memory.
- Access to premium characters, including ones with custom voices.

# Support us in other ways

Join the free tier on [Patreon](https://patreon.com/charluv), and tell people about us — Reddit, X, YouTube, TikTok, wherever you are. The more people who find us, the better our odds of sticking around.

You can also **publish your own characters**. Create a character, open it from **My AI**, and hit **Make Public**. If it passes the automated check it goes live in Discover for everyone and you earn a one-time **500 credit** reward — it's fully self-serve, nothing to send us.

## Credits

| Action | Credits |
| ------ | ------: |
| Send or regenerate a message | 10 |
| Generate or regenerate an image | 25 |
| Create a character | 100 |
| Edit a character | 30 |
| Publish a character *(one-time reward)* | **+500** |

## Recharge

Credits top up automatically every 2 minutes:

|              | Free | Premium |
| ------------ | ---: | ------: |
| Per top-up   |  +5  |   +20   |
| Refills up to | 500 | 5,000 |

## Managing your subscription

Manage or cancel your subscription from your [profile](/profile). For help, reach us on [Discord](https://charluv.com/discord) or [Patreon](https://patreon.com/charluv).

`

const PremiumInfo: Component = () => {
  setComponentPageTitle('Premium')
  return (
    <>
      <PageHeader title="Premium" />
      <img
        width="180px"
        style="background:#55b89cff;"
        class="px-8 py-2"
        alt="Charluv"
        src={logoDark}
      />
      <div class="markdown" innerHTML={markdown.makeHtml(text)}></div>
    </>
  )
}

export default PremiumInfo
