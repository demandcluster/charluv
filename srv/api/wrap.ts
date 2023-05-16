import * as express from 'express'
import { AppSchema } from '../db/schema'
import { AppLog } from '../logger'

export function handle(handler: Handler): express.RequestHandler {
  const wrapped = async (req: AppRequest, res: express.Response, next: express.NextFunction) => {
    let nextCalled = false
    const wrappedNext = (err?: any) => {
      nextCalled = true
      next(err)
    }

    try {
      const result = await handler(req as any, res, wrappedNext)
      if (!res.headersSent && !nextCalled && !!result) {
        res.json(result)
      }
    } catch (ex) {
      console.log('I am catching this stuff..')
      if (ex instanceof StatusError) {
        // Handle StatusError explicitly
        if (!res.headersSent) {
          res.status(ex.status).json({ error: ex.msg })
        }
      } else {
        // Handle other errors
        if (!res.headersSent) next(ex)
      }
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
  userId: string
  log: AppLog
  socketId: string
}

export const errors = {
  NotFound: new StatusError('Resource not found', 404),
  Unauthorized: new StatusError('Unauthorized', 401),
  Forbidden: new StatusError('Forbidden', 403),
  BadRequest: new StatusError('Bad request', 400),
  MissingCredits: new StatusError('Not enough credits', 402),
}
