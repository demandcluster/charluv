import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'

const ThankYou: Component = () => {
  return (
    <>
      <PageHeader title="Order Complete" subtitle="Thank you for supporting Charluv" />
      <div class="container">
        <div class="flex h-full w-full flex-col items-center justify-center">
          Your order has been processed. Thank you for your support!
        </div>
      </div>
    </>
  )
}
export default ThankYou
