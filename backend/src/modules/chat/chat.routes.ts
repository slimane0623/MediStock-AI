import { Router } from 'express'
import { z } from 'zod'
import { ChatServiceError, chatTimeoutMs, generateLocalChatReply, getChatRuntimeMetrics, getLocalModelStatus } from './chat.service.js'

export const chatRouter = Router()

const chatRoleSchema = z.enum(['user', 'assistant'])
const chatProviderSchema = z.enum(['ollama', 'llama_cpp'])

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  history: z.array(z.object({
    role: chatRoleSchema,
    content: z.string().trim().min(1).max(1200),
  })).max(24).optional(),
  requestId: z.string().trim().min(1).max(80).optional(),
})

const chatStatusResponseSchema = z.object({
  ok: z.literal(true),
  provider: chatProviderSchema,
  model: z.string().min(1),
  baseUrl: z.string().min(1),
  available: z.boolean(),
  reason: z.string().nullable(),
  checkedAt: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  runtime: z.object({
    inFlightRequests: z.number().int().nonnegative(),
    maxConcurrent: z.number().int().positive(),
    statusCacheTtlMs: z.number().int().nonnegative(),
  }),
})

const chatMetaSuccessSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  latencyMs: z.number().int().nonnegative(),
  timeoutMs: z.number().int().positive(),
  runtime: z.object({
    inFlightRequests: z.number().int().nonnegative(),
    maxConcurrent: z.number().int().positive(),
  }),
})

const chatSuccessResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string().nullable(),
  reply: z.string().min(1),
  disclaimer: z.string().min(1),
  meta: chatMetaSuccessSchema,
})

const chatMetaFailureSchema = z.object({
  provider: z.string().nullable(),
  model: z.string().nullable(),
  latencyMs: z.number().int().nonnegative(),
  timeoutMs: z.number().int().positive(),
  runtime: z.object({
    inFlightRequests: z.number().int().nonnegative(),
    maxConcurrent: z.number().int().positive(),
  }),
})

const chatFailureResponseSchema = z.object({
  ok: z.literal(false),
  requestId: z.string().nullable(),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
  meta: chatMetaFailureSchema,
})

chatRouter.get('/status', async (_request, response) => {
  const status = await getLocalModelStatus()
  const runtime = getChatRuntimeMetrics()

  const payload = chatStatusResponseSchema.parse({
    ok: true,
    ...status,
    runtime,
  })

  response.json(payload)
})

chatRouter.post('/', async (request, response) => {
  const parsed = chatRequestSchema.safeParse(request.body)

  if (!parsed.success) {
    const runtime = getChatRuntimeMetrics()

    const payload = chatFailureResponseSchema.parse({
      ok: false,
      requestId: null,
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'Invalid chat payload',
      },
      meta: {
        provider: null,
        model: null,
        latencyMs: 0,
        timeoutMs: chatTimeoutMs,
        runtime: {
          inFlightRequests: runtime.inFlightRequests,
          maxConcurrent: runtime.maxConcurrent,
        },
      },
    })

    response.status(400).json(payload)
    return
  }

  const startedAt = Date.now()

  try {
    const reply = await generateLocalChatReply({
      message: parsed.data.message,
      history: parsed.data.history,
    })
    const runtime = getChatRuntimeMetrics()

    const payload = chatSuccessResponseSchema.parse({
      ok: true,
      requestId: parsed.data.requestId ?? null,
      reply: reply.reply,
      disclaimer: reply.disclaimer,
      meta: {
        provider: reply.provider,
        model: reply.model,
        latencyMs: Date.now() - startedAt,
        timeoutMs: chatTimeoutMs,
        runtime: {
          inFlightRequests: runtime.inFlightRequests,
          maxConcurrent: runtime.maxConcurrent,
        },
      },
    })

    response.json(payload)
  } catch (error) {
    const isChatError = error instanceof ChatServiceError
    const code = isChatError ? error.code : 'INTERNAL_ERROR'
    let statusCode = 500

    if (code === 'TIMEOUT') {
      statusCode = 504
    } else if (code === 'MODEL_UNAVAILABLE' || code === 'RESOURCE_EXHAUSTED') {
      statusCode = 503
    }

    const message = isChatError
      ? error.message
      : 'Erreur interne du service de chat local.'
    const runtime = getChatRuntimeMetrics()

    const payload = chatFailureResponseSchema.parse({
      ok: false,
      requestId: parsed.data.requestId ?? null,
      error: {
        code,
        message,
      },
      meta: {
        provider: null,
        model: null,
        latencyMs: Date.now() - startedAt,
        timeoutMs: chatTimeoutMs,
        runtime: {
          inFlightRequests: runtime.inFlightRequests,
          maxConcurrent: runtime.maxConcurrent,
        },
      },
    })

    response.status(statusCode).json(payload)
  }
})
