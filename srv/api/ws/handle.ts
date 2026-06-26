import { AppSocket } from './types'
import { handlers, WebMessage } from './handlers'
import { allSockets } from './bus'
import { markPresent, clearPresent } from '../../queue/presence'

export function handleMessage(client: AppSocket) {
  client.on('message', (data) => {
    const payload = parse(data) as WebMessage
    if (!payload) return
    if (typeof payload !== 'object') return
    if ('type' in payload === false) return

    const handler = handlers[payload.type]
    if (!handler) return

    handler(client, payload as any)
  })

  client.dispatch = (data) => {
    client.send(JSON.stringify(data))
  }

  client.on('close', () => {
    clearPresent({ socketId: client.uid }, client.uid)
    handlers.logout(client, { type: 'logout' })
  })

  client.on('error', () => {
    clearPresent({ socketId: client.uid }, client.uid)
    handlers.logout(client, { type: 'logout' })
  })

  client.on('ping', () => {
    client.send('pong')
  })

  allSockets.set(client.uid, client)
  markPresent({ socketId: client.uid }, client.uid)
}

function parse(data: any) {
  try {
    const json = JSON.parse(data)
    return json
  } catch (ex) {
    return
  }
}
