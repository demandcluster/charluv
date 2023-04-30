import { Component, createEffect, createSignal, For, Show, createMemo } from 'solid-js'
import { useParams } from '@solidjs/router'
import Button from '../../shared/Button'
import ProfileCard from '../../shared/ProfileCard'
import PageHeader from '../../shared/PageHeader'
import Modal from '../../shared/Modal'
import { Check } from 'lucide-solid'
import { AppSchema } from '../../../srv/db/schema'
import { A, useNavigate } from '@solidjs/router'
import AvatarIcon from '../../shared/AvatarIcon'
import { characterStore, matchStore } from '../../store'
import { setComponentPageTitle } from '../../shared/util'

const MatchProfile: Component = () => {
  const params = useParams()
  setComponentPageTitle('Profile')
  const chars = characterStore((s) => s.characters)
  const matches = matchStore((s) => s.characters)
  const [char, setChar] = createSignal<AppSchema.Character>()

  createEffect(() => {
    characterStore.getCharacters()
    matchStore.getMatches()
  })

  createEffect(() => {
    let searchChar = false
    if (matches.loaded && matches.list?.length > 0) {
      searchChar = matches?.list?.find((c) => c._id === params?.id) || false
    }
    if (searchChar) {
      setChar(searchChar)
    } else {
      setChar(chars.list.find((c) => c._id === params?.id) || null)
    }
  }, [chars, matches])

  const navigate = useNavigate()

  return (
    <>
      <PageHeader title="Profile" />

      <Show when={!chars.loaded}>
        <div>Loading...</div>
      </Show>
      <Show when={chars.loaded && char()}>
        <div class="flex min-w-full flex-row">
          <ProfileCard
            href={`/likes/${char()._id}/profile}`}
            navBack={navigate(-1)}
            character={char()}
          />
        </div>
      </Show>
    </>
  )
}
export default MatchProfile
