import { Router } from 'express'
import { z } from 'zod'

export const chatRouter = Router()

const chatRoleSchema = z.enum(['user', 'assistant'])

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  history: z.array(z.object({
    role: chatRoleSchema,
    content: z.string().trim().min(1).max(1200),
  })).max(24).optional(),
  requestId: z.string().trim().min(1).max(80).optional(),
})

const CHAT_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS ?? 8000)

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function generateLocalReply(message: string) {
  const lowerMessage = message.toLowerCase()
  const simulatedDelayMs = lowerMessage.includes('lent') || lowerMessage.includes('timeout')
    ? CHAT_TIMEOUT_MS + 1200
    : Math.min(4200, 650 + message.length * 18)
  await wait(simulatedDelayMs)

  let answer = 'Je peux aider pour le stock, les alertes et les profils. L avis d un professionnel de sante reste indispensable.'

  if (lowerMessage.includes('stock')) {
    answer = 'Le stock est gere localement. Je peux t aider a verifier les medicaments critiques et ceux proches de la peremption.'
  } else if (lowerMessage.includes('prise')) {
    answer = 'Pour enregistrer une prise, selectionne un medicament dans l inventaire puis utilise l action rapide correspondante.'
  } else if (lowerMessage.includes('interaction')) {
    answer = 'Je peux signaler des points d attention, mais je ne remplace pas un pharmacien ni un medecin.'
  } else if (lowerMessage.includes('renouvellement')) {
    answer = 'Pour anticiper un renouvellement, surveille les niveaux critiques et les dates de peremption dans l inventaire.'
  }

  return answer
}

chatRouter.post('/', async (request, response) => {
  const parsed = chatRequestSchema.safeParse(request.body)

  if (!parsed.success) {
    response.status(400).json({
      ok: false,
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'Invalid chat payload',
      },
    })
    return
  }

  const startedAt = Date.now()

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('CHAT_TIMEOUT')), CHAT_TIMEOUT_MS)
    })

    const reply = await Promise.race([
      generateLocalReply(parsed.data.message),
      timeoutPromise,
    ])

    response.json({
      ok: true,
      requestId: parsed.data.requestId ?? null,
      reply,
      disclaimer: 'Assistant local informatif uniquement. Ne remplace pas un avis medical professionnel.',
      meta: {
        model: 'local-mock',
        latencyMs: Date.now() - startedAt,
        timeoutMs: CHAT_TIMEOUT_MS,
      },
    })
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === 'CHAT_TIMEOUT'

    response.status(isTimeout ? 504 : 500).json({
      ok: false,
      requestId: parsed.data.requestId ?? null,
      error: {
        code: isTimeout ? 'TIMEOUT' : 'INTERNAL_ERROR',
        message: isTimeout
          ? 'Le modele local met trop de temps a repondre. Reessaie.'
          : 'Erreur interne du service de chat local.',
      },
      meta: {
        model: 'local-mock',
        latencyMs: Date.now() - startedAt,
        timeoutMs: CHAT_TIMEOUT_MS,
      },
    })
  }
})
