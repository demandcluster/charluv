import { Component, Show } from 'solid-js'
import { toChar, toBotMsg, toChat, toUserMsg } from '../../../common/dummy'
import Button from '../../shared/Button'
import Divider from '../../shared/Divider'

import Select from '../../shared/Select'
import { toDropdownItems } from '../../shared/util'
import { AVATAR_CORNERS, AVATAR_SIZES, UI_THEME, userStore } from '../../store'
import Message from '../Chat/components/Message'
import { Toggle } from '../../shared/Toggle'

const themeOptions = UI_THEME.map((color) => ({ label: color, value: color }))

const DateSettings: Component = () => {
  const state = userStore()

  const onBackground = async (results: FileInputResult[]) => {
    if (!results.length) return
    const [result] = results

    userStore.setBackground(result)
  }

  return (
    <>
      <h3 class="text-lg font-bold">Character Style</h3>
      <div class="flex flex-row justify-start gap-4">
        <Toggle
          fieldName="charAnime"
          label="Show Anime"
          value={state.ui?.charAnime ?? false}
          onChange={(enabled) => userStore.updateUI({ charAnime: enabled })}
        />
        <Toggle
          fieldName="charRealistic"
          label="Show Realistic"
          value={state.ui?.charRealistic ?? false}
          onChange={(enabled) => userStore.updateUI({ charRealistic: enabled })}
        />
      </div>
    </>
  )
}

export default DateSettings

function noop() {}
