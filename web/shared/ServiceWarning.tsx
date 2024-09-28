import { Component, Match, Switch, createMemo } from 'solid-js'
import { userStore } from '../store/user'
import { A } from '@solidjs/router'
import { TitleCard } from './Card'
import { settingStore } from '../store'
import { AppSchema } from '/common/types'

const ServiceWarning: Component<{ preset?: Partial<AppSchema.GenSettings> }> = (props) => {
  const user = userStore((s) => ({ ...s.user, sub: s.sub, userLevel: s.userLevel }))
  const cfg = settingStore((s) => s.config)

  const noSub = createMemo(() => {
    if (!props.preset) return false
    return false
    if (props.preset.service !== 'agnaistic') return false
    if (!user.sub) return false
    const premiumLevel = user.premium ? 10 : -1
    const userLevel = user.admin ? Infinity : Math.max(premiumLevel, user.userLevel)
    const sub = cfg.subs.find(
      (sub) => sub._id === props.preset?.registered?.agnaistic?.subscriptionId
    )

    if (!sub) return false
    const ineligible = userLevel < sub.level
    return ineligible
  })

  const isKeySet = createMemo(() => {
    if (!props.preset) return true
    const svc = props.preset.service
    if (!svc) return true

    if (svc === 'openai' && !user.oaiKeySet && !user.oaiKey) return false
    if (svc === 'novel' && !user.novelVerified && !user.novelApiKey) return false
    if (svc === 'claude' && !user.claudeApiKeySet && !user.claudeApiKey) return false
    if (svc === 'scale' && !user.scaleApiKeySet && !user.scaleApiKey) return false
    if (
      svc === 'goose' &&
      !user.adapterConfig?.goose?.apiKeySet &&
      !user.adapterConfig?.goose?.apiKey
    )
      return false

    return true
  })

  return <></>
}

export default ServiceWarning
