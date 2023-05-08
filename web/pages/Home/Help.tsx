import { A } from '@solidjs/router'
import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import Divider from '../../shared/Divider'
import { setComponentPageTitle } from '../../shared/util'

const Help: Component = () => {
  setComponentPageTitle('Helpdesk')
  return (
    <div class="container">
      <PageHeader title="Helpdesk" subtitle="" />

      <div class="markdown w-full" style={{ height: '500px' }}>
        <iframe
          src={`https://ora.sh/embed/60f0a599-3a63-437e-937e-512d6a0a72a6`}
          width="100%"
          height="100%"
          style={{ border: '0', borderRadius: '4px' }}
        />
      </div>
    </div>
  )
}

export default Help
