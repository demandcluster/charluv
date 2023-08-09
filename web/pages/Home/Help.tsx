import { A } from '@solidjs/router'
import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import Divider from '../../shared/Divider'
import { setComponentPageTitle } from '../../shared/util'

const LHCScript = () => {
  var LHC_API = LHC_API || {}
  LHC_API.args = {
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
  !function () {
    var po = document.createElement('script')
    po.type = 'text/javascript'
    po.setAttribute('crossorigin', 'anonymous')
    po.async = true
    var date = new Date()
    po.src =
      '//dc.lumolive.com/design/defaulttheme/js/widgetv2/index.js?' +
      ('' + date.getFullYear() + date.getMonth() + date.getDate())
    var s = document.getElementsByTagName('script')[0]
    s.parentNode.insertBefore(po, s)
  }
}

const Help: Component = () => {
  setComponentPageTitle('Helpdesk')

  return (
    <div class="container">
      <PageHeader title="Helpdesk" subtitle="" />

      <div class="markdown w-full" style={{ height: '500px' }}>
        <div id="lhc_status_container_page"></div>
        <script>
          <LHCScript />
        </script>
      </div>
    </div>
  )
}

export default Help
