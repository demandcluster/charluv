import { Router } from 'express'
import needle from 'needle'
import { loggedIn } from './auth'
import { handle, StatusError } from './wrap'

const router = Router()

const CHUB_URL = `https://char-archive.evulid.cc/api/archive/v1/`

export const importCharacter = handle(async (req, res) => {
  const path = req?.body?.path

  if (!path.startsWith(CHUB_URL)) {
    throw new StatusError('Illegal URL', 403)
  }

  try {
    // Fetch the image using Needle
    const response = await needle('get', path, { responseType: 'buffer' })

    // Check if the response is successful
    if (response.statusCode === 200) {
      // Set the appropriate headers
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

      // Send the image as the response
      res.status(200).send(response.body)
    } else {
      // Handle error if image fetching fails
      throw new StatusError('Failed to fetch image', 500)
    }
  } catch (error) {
    // Catch and handle any errors
    res.status(500).json({ error: 'Failed to fetch image' })
  }
})

router.use(loggedIn)

router.post('/', importCharacter)

export default router
