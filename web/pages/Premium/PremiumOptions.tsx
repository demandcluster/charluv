import { Component, createEffect, createSignal, createMemo, For, Show } from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import PageHeader from '../../shared/PageHeader'
import Divider from '../../shared/Divider'
import { cartStore } from '../../store'
import { CalendarHeart, Coins, ShoppingCart } from 'lucide-solid'
import logo from '../../asset/logo.png'
import Modal from '../../shared/Modal'
import { setComponentPageTitle } from '../../shared/util'
import { loadScript } from '@paypal/paypal-js'

const PremiumOptions: Component = () => {
  setComponentPageTitle('Shop')
  const items = cartStore((state) => state.items)
  const cartItems = cartStore((state) => state.cartItems)
  const [cartSignal, setCartSignal] = createSignal(cartItems)
  const [orderId, setOrderId] = createSignal(null)
  const navigate = useNavigate()
  const [paypal, setPaypal] = createSignal(null)

  let paypalButtons

  const renderButtons = (id) => {
    paypal()
      .Buttons({
        createOrder: function (data, actions) {
          // Set up the transaction details
          return id
        },
        onApprove: function (data, actions) {
          // Capture the payment
          return actions.order.capture().then(function (details) {
            // Show a success message to the buyer
            setOrderId(null)
            navigate('/thankyou')
            // alert('Transaction completed by ' + details.payer.name.given_name + '!');
          })
        },
      })
      .render(paypalButtons)
  }

  createEffect(() => {
    cartStore.getItems()
    cartStore.getCartItems()
    loadScript({
      'client-id':
        'AcfzQbmT9qPEf7Ab8lTpKxLGkEI_EG_bmg5DyuECpcliXUjB4DhWEoK_76P_7sqp1GtnQkaqbXiqz7ik',
      currency: 'EUR',
    }).then((paypalObject) => {
      setPaypal(paypalObject)
    })
  })

  const addToCart = (item) => {
    console.log('adding', item)
    cartStore.addToCart(item).then(() => {
      cartStore.getCartItems()
      setCartSignal(cartItems)
    })
  }

  const removeFromCart = (item) => {
    cartStore.removeFromCart(item).then(() => {
      cartStore.getCartItems()
      setCartSignal(cartItems)
    })
  }

  const cartTotal = createMemo(
    () => {
      if (!cartItems.loaded || cartItems.list?.length === 0) return 0.0

      return cartItems.list
        .reduce((total, item) => {
          return total + item?.price
        }, 0)
        .toFixed(2)
    },
    { on: cartItems }
  )

  const checkoutCart = (id) => {
    cartStore.checkoutCart().then(() => {
      const id = cartItems?.orderId || ''
      setOrderId(id)
      console.log(id)
      renderButtons(orderId())
    })
  }

  return (
    <div class="container">
      <PageHeader title="Shop" subtitle="Premium & Credit Options" />
      <section>
        <h4 class="text-bold mt-4 pb-4">
          None of our store options are reoccurring. Please renew yourself when you want to, they
          are not subscriptions.
        </h4>
        <em>We slighty increased the monthly price, but have decreased the other prices.</em>

        <Show when={!orderId()}>
          <div class="grid columns-3 grid-cols-1 gap-x-6 gap-y-10 shadow sm:grid-cols-2 xl:grid-cols-4 xl:gap-x-8">
            <For each={items.list}>
              {(item) => (
                <Item
                  item={item}
                  cartItems={cartSignal()}
                  addToCart={addToCart}
                  removeFromCart={removeFromCart}
                />
              )}
            </For>
          </div>
        </Show>
      </section>
      <Divider />

      <Show when={cartSignal()?.list?.length > 0}>
        <h2 class="mb-4 text-xl text-gray-400">Cart</h2>

        <section class="flex flex-col gap-4">
          <For each={cartSignal()?.list}>
            {(item) => (
              <div class="flex flex-row justify-between">
                <div class="text-lg font-bold">{item.name}</div>
                <div class="text-lg font-bold">€ {item.price}</div>
              </div>
            )}
          </For>
        </section>
        <Divider />
        <section class="flex flex-col gap-4">
          <div class="flex flex-row justify-between">
            <div class="text-lg font-bold">Total</div>
            <div class="text-lg font-bold">€ {cartTotal()}</div>
          </div>
        </section>
        <Divider />
      </Show>
      <Show when={cartSignal()?.list?.length > 0 && !orderId()}>
        <div class="flex flex-row">
          <button
            class="rounded-md bg-teal-600 px-4 py-2 font-bold text-white"
            onClick={checkoutCart}
          >
            <ShoppingCart /> Checkout
          </button>
        </div>
      </Show>
      <Divider />
      {cartSignal()?.list?.length > 0 && (
        <section>
          <h2 class="mb-4 text-xl text-gray-400">Checkout</h2>

          <div id="paypal-buttons-container" ref={paypalButtons}></div>
        </section>
      )}
    </div>
  )
}

const Item: Component<{
  item: any
  cartItems: any
  addToCart: any
  removeFromCart: any
}> = (props) => {
  const isItemInCart = () => {
    return (
      (Array.isArray(props.cartItems?.list) &&
        props.cartItems?.list?.some((cartItem) => cartItem._id === props.item._id)) ||
      false
    )
  }

  return (
    <div
      class={`group rounded-md  p-4 ${
        isItemInCart()
          ? 'cursor-not-allowed bg-yellow-500 text-gray-500 opacity-90'
          : 'cursor-pointer bg-teal-500'
      }`}
      onClick={() => {
        if (!isItemInCart()) {
          props.addToCart(props.item)
        } else {
          props.removeFromCart(props.item)
        }
      }}
    >
      <h3 class="text-md mt-1 text-gray-100">
        {props.item?.days ? <CalendarHeart /> : ''}
        {props.item?.credits ? <Coins /> : ''}
        {props.item?.name}
      </h3>
      <p class="mt-1 text-lg font-medium text-gray-200">€ {props.item?.price}</p>
    </div>
  )
}

export default PremiumOptions
