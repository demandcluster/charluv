import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { logMiddleware } from './middleware'
import api, { keyedRouter } from './api'
import { errors } from './api/wrap'
import { resolve } from 'path'
import { setupSockets } from './api/ws'
import { config } from './config'
import { createServer } from './server'
import pipeline from './api/pipeline'
import { getDb } from './db/client'
import { isConnected } from './api/ws/bus'

export function createApp() {
  const upload = multer({
    limits: {
      fileSize: config.limits.upload * 1024 * 1024,
      fieldSize: config.limits.upload * 1024 * 1024,
    },
  })

  const app = express()
  const server = createServer(app)

  // Behind a reverse proxy (charluv.com) the client IP arrives via
  // X-Forwarded-For. Trust the configured number of hops so the rate limiter
  // keys on the real client, not the proxy.
  app.set('trust proxy', config.trustProxy)

  // Per-IP rate limit covering every route (API, keyed API, and the static SPA
  // fallback). WebSocket traffic is served off the raw http server and bypasses
  // this. Generous default; tune via RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS.
  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      limit: config.rateLimit.max,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    })
  )

  app.use(express.urlencoded({ limit: `${config.limits.upload}mb`, extended: false }))
  app.use(express.json({ limit: `${config.limits.payload}mb` }))
  app.use(logMiddleware())
  const allowedOrigins = new Set(config.corsOrigins)
  app.use(
    cors({
      // Auth is carried in the Authorization header (not cookies), so we never
      // enable credentials. Cross-origin browser callers are restricted to the
      // configured allowlist; same-origin SPA requests and server-side API-key
      // callers are unaffected.
      origin: (origin, callback) => {
        // Non-browser / same-origin requests have no Origin header.
        if (!origin) return callback(null, true)
        callback(null, allowedOrigins.has(origin))
      },
      optionsSuccessStatus: 200,
    })
  )
  app.use(upload.any())

  const baseFolder = resolve(__dirname, '..')

  setupSockets(server)

  const index = resolve(baseFolder, 'dist', 'index.html')

  app.use('/v1', keyedRouter)
  app.use('/api', api)

  app.get('/healthcheck', (_, res) => {
    const dbHost = config.db.host || config.db.uri
    if (!config.redis.host && !dbHost) {
      return res.status(200).json({ message: 'ok', status: true, db: false, redis: false })
    }

    let db = !config.db.host

    try {
      if (dbHost) getDb()
      db = true

      if (!!config.redis.host && !isConnected()) {
        throw new Error('Redis not ready')
      }

      res
        .status(200)
        .json({ message: 'ok', status: true, db: !!dbHost, redis: !!config.redis.host })
    } catch (ex) {
      res
        .status(503)
        .json({ message: 'Database(s) not ready', status: false, db, redis: !isConnected() })
    }
  })

  if (config.pipelineProxy) {
    app.use('/pipeline', pipeline)
  }

  if (!config.storage.enabled) {
    app.use('/assets', express.static(config.assetFolder))
    app.use('/', express.static(config.assetFolder))
    app.use('/', express.static(resolve(baseFolder, 'assets')))
  }

  app.use('/', express.static(resolve(baseFolder, 'dist')))
  app.use('/', express.static(resolve(baseFolder, 'extras')))
  if (config.extraFolder) {
    app.use('/', express.static(config.extraFolder))
  }

  app.use((req, res, next) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/v1')) {
      return next(errors.NotFound)
    }

    // The static middleware above already served any file that exists. A request
    // for something with a file extension that reaches here is a MISSING asset —
    // most commonly a stale hashed chunk (e.g. /assets/index-OLDHASH.js) after a
    // redeploy cleaned the old build. Return 404, never the SPA shell: handing the
    // browser index.html for a .js fails with "MIME type text/html" and blanks the
    // page. Extension-less paths are client routes, so they still get the shell.
    if (/\.[^/]+$/.test(req.path)) {
      return next(errors.NotFound)
    }

    return res.sendFile(index)
  })
  app.use((err: any, _req: any, res: express.Response, _next: any) => {
    if (err.status > 0) {
      res.status(err.status)
    } else {
      res.status(500)
    }

    res.json({ message: err?.message || err || 'Internal server error' })
  })

  return { server, app }
}
