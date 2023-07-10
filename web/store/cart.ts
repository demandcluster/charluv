import { HordeModel, HordeWorker } from '../../common/adapters'
import { AppSchema } from '../../common/types/schema'
import { api } from './api'
import { createStore } from './create'
import { toastStore } from './toasts'
import { loadItem, localApi } from './data/storage'

type CartStore = {
  showPending: boolean
  redirURL: string
  items: []
  cart: []
  loaded: boolean
}

export const cartStore = createStore<CartStore>('cart', {
  showPending: false,
  orderId: '',
  items: [],
  cartItems: [],
  loaded: false,
})((set) => ({
  async getItems() {
    const res = await api.get('/shop')
    if (res.error) toastStore.error('Failed to fetch store items')

    if (res.result) {
      return { items: { list: res.result, loaded: true } }
    }
    return { items: { list: [], loaded: true } }
  },
  async getCartItems() {
    const cItems = await loadItem('cartItems')

    if (cItems) return { cartItems: { list: cItems, loaded: true } }

    return { cartItems: { list: [], loaded: true } }
  },
  async removeFromCart(cartItems, item: any) {
    console.log('remove')
    const existingItems = cartItems.cartItems?.list || []
    const updatedItems = existingItems.filter((cartItem) => cartItem._id !== item._id)
    await localApi.saveCartItem(updatedItems)
    return { cartItems: { list: updatedItems, loaded: true } }
  },
  async checkoutCart(service: string = '') {
    const existingItems = await loadItem('cartItems')
    const itemIds = existingItems.map((item) => item._id)
    const res = await api.post('/shop/checkout', {
      cart: JSON.stringify(itemIds),
      service: service ? service : false,
    })
    if (res.error) {
      toastStore.error('Failed to checkout')
      return cartItems
    }
    //  await local.saveCartItem([])
    return {
      cartItems: {
        list: existingItems,
        loaded: true,
        showPending: true,
        orderId: res.result?.orderId,
      },
    }
  },

  async addToCart(cartItems, newItem: any) {
    console.log('newItem', newItem)
    const existingItems = cartItems.cartItems?.list || []
    const isItemAlreadyInCart = existingItems.some((item) => item._id === newItem._id)

    if (isItemAlreadyInCart) {
      console.log('already in cart')
      console.log(cartItems)
      return cartItems // Return original cart items if item is already in cart
    }

    const newCart = [...existingItems, newItem]
    console.log('going to save', newCart)

    await localApi.saveCartItem(newCart)
    return { cartItems: { list: newCart, loaded: true } }
  },
}))
