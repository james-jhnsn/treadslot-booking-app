import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let startsAt: string
  let serviceName: string

  try {
    const body = JSON.parse(event.body ?? '{}')
    startsAt = body.startsAt
    serviceName = body.serviceName
    if (!startsAt || !serviceName) throw new Error('missing fields')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) }
  }

  const slotDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(startsAt))

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `Write a single friendly sentence (max 25 words) confirming a ${serviceName} appointment on ${slotDate}. Be warm but concise. No greeting, no sign-off.`,
        },
      ],
    })

    let message: string | null = null
    for (const block of response.content) {
      if (block.type === 'text') {
        message = block.text.trim()
        break
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }
  } catch (err) {
    console.error('Claude API error:', err)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: null }),
    }
  }
}
