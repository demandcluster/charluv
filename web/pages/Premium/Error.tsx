import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'

const Error: Component = () => {
  return (
    <>
      <PageHeader title="Error" subtitle="There was an error processing your order" />
      <div class="container">
        <div class="flex h-full w-full flex-col items-center justify-center">
          The transaction failed. Please try again.
        </div>
      </div>
    </>
  )
}
export default Error
