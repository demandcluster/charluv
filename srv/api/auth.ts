import { NextFunction } from 'express'
import { AppRequest, errors } from './wrap'

export const loggedIn: any = (req: AppRequest, _: any, next: NextFunction) => {
  if (!req.user?.userId) return next(errors.Unauthorized)
  next()
}

export const isAdmin: any = (req: AppRequest, _: any, next: NextFunction) => {
 
  if (!req.user?.admin) return next(errors.Forbidden)
  next()
}

export const isPremium: any = (req: AppRequest, _: any, next: NextFunction) => {
  if (req.user?.premium) return next()
  if (!req.user?.admin) return next(errors.Forbidden)
  next()
}
