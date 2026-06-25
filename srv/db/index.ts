import * as chats from './chats'
import * as characters from './characters'
import * as users from './user'
import * as invites from './invite'
import * as admin from './admin'
import * as presets from './presets'
import * as msgs from './messages'
import * as memory from './memory'
import * as shop from './shop'
import * as matches from './matches'
import * as reports from './reports'
import * as credits from './credits'
import * as scenario from './scenario'
import * as oauth from './oauth'
import * as subs from './subscriptions'
import * as announce from './announcements'
import * as promo from './promo'

export { db } from './client'

export const store = {
  chats,
  characters,
  users,
  invites,
  admin,
  presets,
  msgs,
  memory,
  shop,
  matches,
  reports,
  credits,
  scenario,
  oauth,
  subs,
  announce,
  promo,
}
