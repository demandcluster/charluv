import * as express from 'express'
import { AppSchema } from '../../common/types/schema'
import { AppLog } from '../logger'

export function handle(handler: Handler): express.RequestHandler {
  const wrapped = async (req: AppRequest, res: express.Response, next: express.NextFunction) => {
    let nextCalled = false
    const wrappedNext = (err?: any) => {
      nextCalled = true
      next(err)
    }
    let ip = ''
    if (req.headers && req.headers['x-forwarded-for']) {
      if (typeof req.headers['x-forwarded-for'] === 'string') {
        ip = req.headers['x-forwarded-for']
      } else {
        ip = req.headers['x-forwarded-for'][0]
      }
    } else if (req.connection.remoteAddress) {
      ip = req.connection.remoteAddress
    }

    const reqWithIp: AppRequest = {
      ...req,
      ip: ip,
    }

    try {
      const result = await handler(reqWithIp as any, res, wrappedNext)
      if (!res.headersSent && !nextCalled && !!result) {
        res.json(result)
      }
    } catch (ex) {
      req.log.error({ err: ex }, 'Error occurred handling request')
      if (!res.headersSent) next(ex)
    }
  }

  return wrapped as any as express.RequestHandler
}

export const wrap = handle

export class StatusError extends Error {
  constructor(public msg: string, public status: number) {
    super(msg)
  }
}

export type Handler = (req: AppRequest, res: express.Response, next: express.NextFunction) => any

export type AppRequest = Omit<express.Request, 'log'> & {
  user?: AppSchema.Token
  requestId: string
  userId: string
  log: AppLog
  socketId: string
  scopes?: string[]
  fullUser?: AppSchema.User
}

export const errors = {
  NotFound: new StatusError('Resource not found', 404),
  Unauthorized: new StatusError('Unauthorized', 401),
  Forbidden: new StatusError('Forbidden/Premium', 403),
  BadRequest: new StatusError('Bad request', 400),
  MissingCredits: new StatusError('Not enough credits', 402),
}
