import needle from 'needle'

export default async function makeDemandRequest(prompt: string): Promise<string> {
  const url = 'https://gpt.demandcluster.com/api/v1/workspace/charluv-code/chat'
  const apiKey: string = process.env.DEMAND_GPT_KEY

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  const data = {
    message: prompt,
    mode: 'query',
  }

  try {
    const response = await needle('post', url, data, { headers, json: true })

    if (response.statusCode === 200) {
      return response.body.textResponse || 'No response'
    } else {
      throw new Error(`API request failed with status ${response.statusCode}`)
    }
  } catch (error) {
    console.error('Error:', error)
    throw error
  }
}
