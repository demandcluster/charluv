import { Menu } from 'lucide-solid'
import { Component, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { settingStore } from '../store'
import logoDark from '../assets/logoDark.png'

const NavBar: Component = () => {
  const cfg = settingStore()

  return (
    <Show when={!cfg.fullscreen}>
      <span
        data-header=""
        class="flex justify-between gap-4 border-b-2 border-[var(--bg-800)] bg-[var(--bg-900)] px-4 py-5 max-sm:p-3 sm:hidden"
      >
        <span class="flex w-full items-center justify-between gap-2 font-semibold sm:justify-start">
          <div class="w-16 sm:hidden" onClick={settingStore.menu}>
            <Menu class="focusable-icon-button cursor-pointer" size={32} />
          </div>
          <div class="px-2 py-2" style="background:#55b89cff;">
            <A href="/">
              <img width="150px" src={logoDark} alt="Charluv" />
            </A>
          </div>
          <div class="w-8 sm:hidden"></div>
        </span>
      </span>
    </Show>
  )
}
export default NavBar
