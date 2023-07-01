import { db } from './client'
import { AppSchema } from '../../common/types/schema'
import { FindOneAndUpdateOptions } from 'mongodb'

async function getNextOrderNumber() {
  const result = await db('order-count').findOneAndUpdate(
    { _id: 'order2023' },
    { $inc: { sequence_value: 1 } },
    { returnOriginal: false, upsert: true } as FindOneAndUpdateOptions
  )
  return result.value?.sequence_value || 0
}

export async function addShopOrder(order: AppSchema.ShopOrder) {
  const ordernumber = await getNextOrderNumber()
  order.order = ordernumber
  await db('order').insertOne(order)
  return { success: true }
}
export async function updateShopOrder(order: AppSchema.ShopOrder) {
  const updateObj = { $set: { status: order.status, updatedAt: order.updatedAt, name: order.name } }
  await db('order').findOneAndUpdate({ kind: 'order', _id: order._id }, updateObj)
  return { success: true }
}

export async function getShopOrder(id: string) {
  const order = await db('order').find({ kind: 'order', _id: id }).toArray()
  return order[0] || null
}

export async function getItems() {
  const items = await db('shop').find({ kind: 'shop' }).sort({ price: 1 }).toArray()

  return items || []
}
