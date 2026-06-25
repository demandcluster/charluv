import { Component, onMount } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import { setComponentPageTitle } from '../../shared/util'

type LHCApiConfig = {
  mode: string
  lhc_base_url: string
  wheight: number
  wwidth: number
  pheight: number
  pwidth: number
  fresh: boolean
  leaveamessage: boolean
  check_messages: boolean
  lang: string
}

declare global {
  interface Window {
    LHC_API?: LHCApiConfig
  }
}

function loadLHCScript() {
  window.LHC_API = {
    mode: 'embed',
    lhc_base_url: '//dc.lumolive.com/',
    wheight: 450,
    wwidth: 350,
    pheight: 520,
    pwidth: 500,
    fresh: true,
    leaveamessage: true,
    check_messages: false,
    lang: 'eng/',
  }
  const po = document.createElement('script')
  po.type = 'text/javascript'
  po.setAttribute('crossorigin', 'anonymous')
  po.async = true
  const date = new Date()
  po.src =
    '//dc.lumolive.com/design/defaulttheme/js/widgetv2/index.js?' +
    ('' + date.getFullYear() + date.getMonth() + date.getDate())
  const s = document.getElementsByTagName('script')[0]
  if (s && s.parentNode) {
    s.parentNode.insertBefore(po, s)
  }
}

const Help: Component = () => {
  setComponentPageTitle('Helpdesk')

  onMount(() => {
    loadLHCScript()
  })

  return (
    <div class="container">
      <PageHeader title="Helpdesk" subtitle="" />

      <div class="markdown w-full" style={{ height: '500px' }}>
        <div id="lhc_status_container_page"></div>
      </div>
    </div>
  )
}

export default Help
