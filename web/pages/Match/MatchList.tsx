import { Component, createEffect, createSignal, For, Show } from 'solid-js'
import Button from '../../shared/Button'
import PageHeader from '../../shared/PageHeader'
import { Check } from 'lucide-solid'
import { AppSchema } from '../../../srv/db/schema'
import { A, useNavigate } from '@solidjs/router'
import AvatarIcon from '../../shared/AvatarIcon'
import { matchStore, userStore } from '../../store'

const MatchList: Component<{ character: AppSchema.Character; match: Any }> = (props) => {
  return (
    <div class="flex w-full gap-2">
      <div class="flex h-12 w-full flex-row items-center gap-4 rounded-xl bg-[var(--bg-800)]">
        <A
          class="ml-4 flex h-3/4 cursor-pointer items-center rounded-2xl  sm:w-9/12"
          href={`/likes/${props.character._id}/profile`}
        >
          <AvatarIcon avatarUrl={props.character.avatar} class="mx-4 h-10 w-10 rounded-md" />
          <div class="text-lg">
            <span class="font-bold">{props.character.name}</span>
          </div>
        </A>
      </div>
      <div class="flex flex-row items-center justify-center gap-2 sm:w-3/12">
        <Button
          class="ml-4 flex h-3/4 cursor-pointer items-center rounded-2xl sm:w-9/12"
          onClick={() => props.match(props.character._id)}
        >
          MATCH <Check class="cursor-pointer text-white/25 hover:text-white" />
        </Button>
      </div>
    </div>
  )
}

export default MatchList
