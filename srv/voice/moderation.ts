import needle from 'needle'
import { AppSchema } from '../../common/types/schema'
import { StatusError, errors } from '../api/wrap'
import { Validator } from '/common/valid'
import { config } from '../config'

export const textModeration = async (text: String | undefined) => {
  const { moderationKey } = config

  const { body } = await needle(
    'post',
    'https://api.openai.com/v1/moderations',
    {
      input: text,
    },
    {
      headers: {
        Authorization: `Bearer ${moderationKey}`,
        'Content-Type': 'application/json',
      },
    }
  )
  if (body.results[0].flagged) {
    throw new StatusError('Voice can not be generated due to prohibited context.', 400)
  }

  return true
}
