import { Component, For, Show } from 'solid-js'
import { AppSchema } from '/common/types/schema'
import { Heart, Moon, Dumbbell, Briefcase, Leaf, Globe2, ChevronsLeft } from '/web/icons'
import { getAssetUrl } from './util'

const ProfileCard: Component<{
  character: AppSchema.Character
  href: string
  navBack?: () => void
}> = (props) => {
  const attrs = (): Record<string, string[]> | undefined =>
    props.character.persona?.attributes as Record<string, string[]> | undefined
  return (
    <>
      <Show when={props.character}>
        <div class="m-auto flex flex-col flex-wrap xl:flex-row xl:flex-nowrap">
          <div class=" ml-auto  mr-auto w-full max-w-3xl px-4 md:w-3/4">
            <div class="text-900 relative mb-6 flex w-full min-w-0 flex-col break-words rounded-lg  border-[var(--hl-900)] bg-[var(--bg-800)] shadow-lg ">
              <ChevronsLeft
                class="absolute h-20 w-20 text-white  hover:cursor-pointer"
                onclick={() => props.navBack?.()}
              />
              <img
                alt={props.character?.name}
                src={getAssetUrl(props.character?.avatar || '')}
                class="min-h-[100px] w-full rounded-t-lg align-middle"
              />
              <div class="shadow-red text-shadow-md relative -bottom-6 right-4 z-10 -mt-20 w-full p-2 text-right text-3xl text-white shadow-teal-900 text-shadow md:-mt-20 sm:text-5xl">
                {props.character?.name} {attrs()?.age ? attrs()?.age[0].split(' ')[0] : ''}
              </div>
              <blockquote class="relative mb-4 p-8">
                <p class="text-md mb-4 mt-2 font-light">{props.character?.description}</p>

                <hr class=" ml-32 mt-8 w-[calc(100%-8rem)] opacity-40" />
                <div class=" relative -top-4 -ml-3  mr-3 inline-block text-shadow  ">
                  <Leaf class="text mr-1 inline w-10 text-[var(--hl-200)]" />
                  Sexuality
                </div>
                <div class=" w-full">
                  <For
                    each={attrs()?.sexuality}
                    fallback={
                      <div class="mx-1 mb-3 inline-block rounded-xl border bg-[var(--bg-900)] p-1 px-2 text-xs first-letter:capitalize">
                        Prefers not to say
                      </div>
                    }
                  >
                    {(sex) => (
                      <div class="mx-1 mb-3 inline-block rounded-xl border bg-[var(--hl-900)] p-1 px-2 text-xs first-letter:capitalize">
                        {sex}
                      </div>
                    )}
                  </For>
                </div>

                <Show when={attrs()?.appearance}>
                  <hr class=" ml-24 mt-8 w-[calc(100%-6rem)] opacity-40" />
                  <div class=" relative -top-4 -ml-3  mr-3 inline-block text-shadow ">
                    <Dumbbell class="mr-1 inline w-10 text-[var(--hl-200)]" />
                    Appearance
                  </div>
                  <div class=" w-full">
                    <For each={attrs()?.appearance}>
                      {(body) => (
                        <div class="mx-1 mb-3 inline-block rounded-xl border bg-[var(--hl-900)] p-1 px-2 text-xs first-letter:capitalize">
                          {body}
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={attrs()?.likes}>
                  <hr class=" ml-24 mt-8 w-[calc(100%-5rem)] opacity-40" />
                  <div class=" relative -top-4 -ml-3  mr-3 inline-block text-shadow">
                    <Heart class="mr-1 inline w-10 text-[var(--hl-200)]" />
                    Likes:
                  </div>
                  <div class=" w-full">
                    <For each={attrs()?.likes}>
                      {(likes) => (
                        <div class="mx-1 mb-3 inline-block rounded-xl border bg-[var(--hl-900)] p-1 px-2 text-xs first-letter:capitalize">
                          {likes}
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={attrs()?.job}>
                  <hr class=" ml-24 mt-8 w-[calc(100%-5rem)] opacity-40" />
                  <div class=" relative -top-4 -ml-3  mr-3 inline-block text-shadow">
                    <Briefcase class="mr-1 inline w-10 text-[var(--hl-200)]" />
                    Job
                  </div>
                  <div class=" w-full">
                    <div class="mx-1 mb-3 inline-block rounded-xl border bg-[var(--hl-900)] p-1 px-2 text-xs first-letter:capitalize">
                      {attrs()?.job || ''}
                    </div>
                  </div>
                </Show>

                <Show when={attrs()?.zodiac}>
                  <hr class=" ml-24 mt-8 w-[calc(100%-5rem)] opacity-40" />
                  <div class=" relative -top-4 -ml-3  mr-3 inline-block text-shadow">
                    <Moon class="mr-1 inline w-10 text-[var(--hl-200)]" />
                    Zodiac
                  </div>
                  <div class=" w-full">
                    <div class="mx-1 mb-3 inline-block rounded-xl border bg-[var(--hl-900)] p-1 px-2 text-xs first-letter:capitalize">
                      {attrs()?.zodiac || ''}
                    </div>
                  </div>
                </Show>

                <Show when={attrs()?.country}>
                  <hr class=" ml-24 mt-8 w-[calc(100%-5rem)] opacity-40" />
                  <div class=" relative -top-4 -ml-3  mr-3 inline-block text-shadow">
                    <Globe2 class="mr-1 inline w-10 text-[var(--hl-200)]" />
                    Country
                  </div>
                  <div class=" w-full">
                    <div class="mx-1 mb-3 inline-block rounded-xl border bg-[var(--hl-900)] p-1 px-2 text-xs first-letter:capitalize">
                      {attrs()?.country || ''}
                    </div>
                  </div>
                </Show>
              </blockquote>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}

export default ProfileCard
