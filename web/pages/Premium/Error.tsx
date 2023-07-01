import { A } from '@solidjs/router'
import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import Divider from '../../shared/Divider'

import logo from '../../asset/logo.png'

const Error: Component = () => {
    return (
        <>
          <PageHeader title="Error" subtitle="There was an error processing your order" />
          <div class="container">
            <div class="flex flex-col items-center justify-center w-full h-full">
                The transaction failed. Please try again.
            </div>
         </div>
        </>
    )
}
export default Error