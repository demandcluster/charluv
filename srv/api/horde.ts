import { Router } from 'express'
import { HordeModel, HordeWorker } from '../../common/adapters'
import { Performance } from '../../common/performance'
import { get } from './request'
import { handle } from './wrap'
import { FindUserResponse } from '/common/horde-gen'

export const HORDE_GUEST_KEY = '0000000000'

const router = Router()

const CACHE_TTL_MS = 360000
const PCACHE_TTL_MS = 30000

let TEXT_CACHE: HordeModel[] = []
let WORKER_CACHE: HordeWorker[] = []

let PERFORMANCE_CACHE: Performance

updateModelCache()
setInterval(updateModelCache, CACHE_TTL_MS)
updatePerformanceCache()
setInterval(updatePerformanceCache, PCACHE_TTL_MS)

export const getModels = handle(async (req) => {
  return { models: TEXT_CACHE }
})

export const getPerformance = handle(async (req) => {
  return { performance: PERFORMANCE_CACHE }
})

router.get('/performance', getPerformance)
router.get('/models', getModels)

export default router

export async function findUser(apikey: string) {
  const user = get<FindUserResponse>({ url: `/find_user`, apikey })
  return user
}

async function updatePerformanceCache() {
  const performance = await get<Performance>({ url: '/status/performance' })
  if (performance?.result) {
    PERFORMANCE_CACHE = performance.result
  }
}

async function updateModelCache() {
  const [models, workers] = await Promise.all([
    get<HordeModel[]>({ url: `/status/models?type=text` }).catch(() => null),
    get<HordeWorker[]>({ url: `/workers?type=text` }),
  ])

  if (models?.result) {
    TEXT_CACHE = models.result.filter((model) => model.type !== 'image')
  }

  if (workers.result) {
    WORKER_CACHE = workers.result
  }
}

export function getHordeWorkers() {
  return WORKER_CACHE.slice()
}

export function getHoredeModels() {
  return TEXT_CACHE.slice()
}
