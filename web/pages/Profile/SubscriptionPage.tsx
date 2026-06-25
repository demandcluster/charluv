import { Component, For, Match, Show, Switch, createMemo, createSignal, onMount } from 'solid-js'
import { settingStore, userStore } from '/web/store'
import { Pill, SolidCard, TitleCard } from '/web/shared/Card'
import Button from '/web/shared/Button'
import { TierCard } from './TierCard'
import { PatreonControls } from '../Settings/PatreonOauth'
import { getUserSubscriptionTier } from '/common/util'
import { isLoggedIn } from '/web/store/api'
import { useNavigate } from '@solidjs/router'
import TextInput from '/web/shared/TextInput'

export const SubscriptionPage: Component = (props) => {
  const settings = settingStore((s) => s.config)
  const user = userStore()
  const cfg = userStore((s) => {
    const tier = s.user ? getUserSubscriptionTier(s.user, s.tiers) : null

    return {
      type: tier?.type ?? 'none',
      tier: tier?.tier,
      level: tier?.level ?? -1,
      tiers: s.tiers.sort((l, r) => r.level - l.level),
    }
  })

  const nav = useNavigate()
  const [promoCode, setPromoCode] = createSignal('')

  const candidates = createMemo(() => {
    return cfg.tiers
      .filter((t) => {
        const isPatronOf = user.sub?.type === 'patreon' && cfg.tier?._id === t._id
        isPatronOf
        // if (isPatronOf) return false

        const usable = t.level !== user.sub?.level
        return usable && t.enabled && !t.deletedAt && !!t.productId
      })
      .sort((l, r) => l.level - r.level)
  })

  const renews = createMemo(() => {
    if (cfg.type === 'paypal')
      return user.user?.premiumUntil ? new Date(user.user.premiumUntil).toLocaleDateString() : ''
    if (cfg.type === 'manual') {
      const last = new Date(user.user?.manualSub?.expiresAt!)
      return last.toLocaleDateString()
    }
    if (!user.user?.billing) return ''
    if (cfg.type === 'patreon') return ''
    const last = new Date(user.user.billing.validUntil)
    return last.toLocaleDateString()
  })

  const currentText = createMemo(() => {
    if (cfg.type === 'manual') return 'Valid until'
    if (cfg.type === 'patreon') return `Patreon Subscriber`
    if (cfg.type === 'paypal') return `Paypal Subscriber`
    if (user.user?.billing?.status === 'active') {
      if (user.user?.billing?.cancelling) return 'Cancels at'
      return `Renews at`
    }
    return 'Valid until'
  })

  const canResume = createMemo(() => {
    if (!user.user?.billing?.cancelling) return false
    if (user.user.billing.status === 'cancelled') return false

    const threshold = new Date(user.user.billing.validUntil)
    return threshold.valueOf() > Date.now()
  })

  onMount(() => {
    userStore.subscriptionStatus()
  })

  return (
    <>
      <div class="flex flex-col gap-2">
        <div class="flex w-full flex-col items-center gap-4">
          <SolidCard class="flex flex-col gap-2" border>
            <p class="flex flex-wrap justify-center text-[var(--hl-500)]">
              <strong>Why subscribe?</strong>
            </p>
            <p>
              Subscribing grants you access to quicker responses, presets, all chat overrides and
              larger contexts.
            </p>

            <p>Subscribing let's us spend more time developing and enhancing Charluv.</p>
          </SolidCard>

          <SolidCard class="flex w-full flex-col gap-2" border>
            <p class="font-bold text-[var(--hl-500)]">Redeem a promo code</p>
            <p class="text-sm">
              Have a promo code? Enter it below to claim credits or premium membership days.
            </p>
            <div class="flex items-end gap-2">
              <TextInput
                fieldName="promoCode"
                placeholder="PROMO CODE"
                value={promoCode()}
                onInput={(ev) => setPromoCode(ev.currentTarget.value)}
                class="flex-1"
              />
              <Button
                schema="success"
                disabled={!promoCode().trim() || user.subLoading}
                onClick={() => userStore.redeemPromo(promoCode())}
              >
                Redeem
              </Button>
            </div>
          </SolidCard>

          <Show when={settings.serverConfig?.supportEmail}>
            <SolidCard>
              If you require billing or subscription support contact{' '}
              <a class="link" href={`mailto:${settings.serverConfig?.supportEmail}`}>
                {settings.serverConfig?.supportEmail}
              </a>
            </SolidCard>
          </Show>

          <PatreonControls />

          <Show when={user.sub?.level! > 0 || user.user?.premium}>
            <h3 class="font-bold">Current Subscription</h3>
            <TierCard tier={cfg.tier!}>
              <div class="flex flex-col items-center gap-2">
                <div class="text-700 text-sm italic">
                  {currentText()} {renews()}
                </div>
                <Pill type="green">
                  Subscribed via{' '}
                  {user.sub?.type === 'manual'
                    ? 'Gift'
                    : user.sub?.type === 'patreon'
                    ? 'Patreon'
                    : cfg.type === 'paypal'
                    ? 'Paypal'
                    : 'None'}
                </Pill>
                <Switch>
                  <Match when={cfg.type === 'paypal'}>
                    Your membership via PayPal does not auto-renew.
                  </Match>
                  <Match when={canResume()}>
                    Your subscription is currently scheduled to cancel
                    <Button
                      schema="green"
                      onClick={userStore.resumeSubscription}
                      disabled={user.billingLoading}
                    >
                      Resume Subscription
                    </Button>
                  </Match>
                  <Match when={cfg.type === 'manual'}>
                    <SolidCard
                      bg="bg-700"
                      class="flex w-1/2 justify-center text-lg font-bold text-[var(--green-600)]"
                    >
                      Enjoy!
                    </SolidCard>
                  </Match>
                  <Match when>
                    <SolidCard
                      bg="bg-700"
                      class="flex w-1/2 justify-center text-lg font-bold text-[var(--green-600)]"
                    >
                      Subscribed!
                    </SolidCard>
                  </Match>
                </Switch>
              </div>
            </TierCard>
          </Show>

          <Show when={candidates().length > 0}>
            <div class="font-bold">Subscription Options</div>
          </Show>

          <Show when={settings.patreon}>
            <TitleCard center title={<span class="text-[var(--hl-500)]">Patreon</span>}>
              Become a{' '}
              <a class="link font-bold" href="https://patreon.com/charluv" target="_blank">
                Patron
              </a>{' '}
              and link your account or use the options below
            </TitleCard>
          </Show>

          <div class="flex w-full flex-wrap justify-center gap-4">
            <For each={candidates()}>
              {(each) => (
                <>
                  <TierCard tier={each} class="sm:w-1/3">
                    <Show when={user.user?.manualSub?.tierId === each._id}>
                      <Pill type="green">This tier is currently gifted to you</Pill>
                    </Show>
                    <div class="mt-4 flex justify-center">
                      <Switch>
                        <Match when={!isLoggedIn()}>
                          <Button schema="success" onClick={() => nav('/login')}>
                            Login to Subcribe
                          </Button>
                        </Match>
                        <Match when={user.sub?.tier._id === each._id}>
                          <Button schema="success" disabled>
                            Subscribed!
                          </Button>
                        </Match>

                        {/* New subscriptions are Patreon-only. */}
                        <Match when>
                          <a
                            class="link font-bold"
                            href="https://patreon.com/charluv"
                            target="_blank"
                          >
                            <Button schema="success">Subscribe via Patreon</Button>
                          </a>
                        </Match>
                      </Switch>
                    </div>
                  </TierCard>
                </>
              )}
            </For>
          </div>

          <div class="mt-4 flex gap-4">
            {/* <Button onClick={userStore.validateSubscription} disabled={user.billingLoading}>
              Validate
            </Button> */}
          </div>
        </div>
      </div>
    </>
  )
}
