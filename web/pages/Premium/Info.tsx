import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import { markdown } from '../../shared/markdown'
import { setComponentPageTitle } from '../../shared/util'
import logo from '../../assets/logo.png'
import logoDark from '../../assets/logoDark.png'

const text = `

# Why get premium?

Premium members get their credits refilled upto **1,000 credits** and at a much faster rate than regular members do. Their messages are handled with higher priority (they skip the queue if there is one). They also get access to some premium characters that have custom ElevenLabs voices *(more to premium characters to be added)*. Most features are available for free members and if you have the patience there is no need to pay. However we can not survive if everybody has patience.
*At this time, we do not have enough premium members to cover the costs...*

# Can I support you in other ways?

Yes, you can! Tell everyone about us, Reddit, Twitter, YouTube, Facebook, Instagram, TikTok, whatever you use. The more people know about us, the more likely we will survive.
We also looking for new characters that can be used as matches, if you created a character that you want to contribute, share the ID with us on [Discord](https://aivo.chat/discord) and if it passes moderation, we add it to the matches and reward you with 1,000 credits.
Since Matches have scripted scenarios (other than the self-made characters), we will do that step for you.

## Credits overview

| Feature          | Credits |
| ---------------- | -------:|
| Send message     |       10|
| Regenerate msg   |       10|
| Generate image   |       20|
| Regenerate img   |       20|
| Create character |       50|
| Edit character   |       20|

## Recharge rate

The recharge rate for regular members is dynamic and based on the average total amount of users we have online. 
|                   |  Regular   | Premium  |
| ----------------- | ---------: | -------: |
| Increase every    | 3 minutes  | 2 minutes |
| Amount increase   | 10         | 20        |
| Capped at*   | 200 | 1000|

**Can be charged manual from shop to any amount*

## Shop

The [shop](/shop) is where you can buy credits and premium membership. 
For support about the shop, please contact us on [Discord](https://aivo.chat/discord).
Transactions are handled external by Paypal and you don't fill any details on our site, so it is safe.
There is no subscriptions, you would have to renew your membership manually. We don't like subscriptions, you might forget about them and we don't want to charge you if you don't use our site.

`

const PremiumInfo: Component = () => {
  setComponentPageTitle('Premium')
  return (
    <>
      <PageHeader title="Premium" />
      <img
        width="180px"
        style="background:#55b89cff;"
        class="py-2 px-8"
        alt="Charluv"
        src={logoDark}
      />
      <div class="markdown" innerHTML={markdown.makeHtml(text)}></div>
    </>
  )
}

export default PremiumInfo
