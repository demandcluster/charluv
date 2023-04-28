import { A } from '@solidjs/router'
import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import Divider from '../../shared/Divider'

import logo from '../../assets/logo.png'

const ThankYou: Component = () => {
    return (
        <>
          <PageHeader title="Order Complete" subtitle="Thank you for supporting AIVO.CHAT" />
          <div class="container">
            <div class="flex flex-col items-center justify-center w-full h-full">
                Your order has been processed. Thank you for your support!
            </div>
         </div>
        </>
    )
}
export default ThankYou