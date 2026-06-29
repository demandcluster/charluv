import { Router } from 'express'
import { store } from '../db'
import { handle } from './wrap'
import { paypalLogin, giveOrder } from './cart'
import https from 'https'
const router = Router()

const checkPaypalOrders = handle(async () => {
  console.log('checking orders')
  const authToken = await paypalLogin()

  const dayold = new Date()
  dayold.setHours(dayold.getHours() - 2)
  const orders = await store.shop.getShopOrdersFrom(dayold.toISOString())

  orders.forEach((order) => {
    const options = {
      hostname: 'api-m.paypal.com',
      path: '/v2/checkout/orders/' + order.paymentId,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        const orderDataObject = JSON.parse(data)
        if (orderDataObject.status == 'COMPLETED') {
          giveOrder(order)
        }
      })
    })

    req.on('error', (error) => {
      console.log('error', error)
    })

    req.end()
    return true
  })

  return true
})

router.get('/', checkPaypalOrders)

export default router
