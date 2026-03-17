type ChatRole = 'user' | 'assistant'

export type ChatHistoryTurn = {
  role: ChatRole
  content: string
}

type ChatProvider = 'ollama' | 'llama_cpp'

type OllamaTagsResponse = {
  models?: Array<{ name?: string }>
}

type OllamaGenerateResponse = {
  response?: string
}

type LlamaCppModelsResponse = {
  data?: Array<{ id?: string }>
}

type LlamaCppCompletionsResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

export type LocalModelStatus = {
  provider: ChatProvider
  model: string
  baseUrl: string
  available: boolean
  reason: string | null
  checkedAt: string
  timeoutMs: number
}

export type LocalChatReply = {
  reply: string
  disclaimer: string
  provider: ChatProvider
  model: string
}

export type ChatRuntimeMetrics = {
  inFlightRequests: number
  maxConcurrent: number
  statusCacheTtlMs: number
}

export class ChatServiceError extends Error {
  code: 'TIMEOUT' | 'MODEL_UNAVAILABLE' | 'RESOURCE_EXHAUSTED' | 'INTERNAL_ERROR'

  constructor(code: 'TIMEOUT' | 'MODEL_UNAVAILABLE' | 'RESOURCE_EXHAUSTED' | 'INTERNAL_ERROR', message: string) {
    super(message)
    this.name = 'ChatServiceError'
    this.code = code
  }
}

const rawProvider = (process.env.CHAT_PROVIDER ?? 'ollama').toLowerCase().trim()
const chatProvider: ChatProvider = rawProvider === 'llama_cpp' ? 'llama_cpp' : 'ollama'
const configuredModel = process.env.CHAT_MODEL?.trim() || 'llama3.2:3b'
const ollamaBaseUrl = normalizeBaseUrl(process.env.OLLAMA_BASE_URL, 'http://127.0.0.1:11434')
const llamaCppBaseUrl = normalizeBaseUrl(process.env.LLAMA_CPP_BASE_URL, 'http://127.0.0.1:8080')
const fallbackDisclaimer = 'Assistant local informatif uniquement. Ne remplace pas un avis medical professionnel.'
const chatDisclaimer = process.env.CHAT_DISCLAIMER?.trim() || fallbackDisclaimer
const ollamaKeepAlive = process.env.OLLAMA_KEEP_ALIVE?.trim() || '30m'

export const chatTimeoutMs = parsePositiveInt(process.env.CHAT_TIMEOUT_MS, 15000)
export const chatStatusCacheTtlMs = parseNonNegativeInt(process.env.CHAT_STATUS_CACHE_TTL_MS, 5000)
export const chatMaxConcurrent = parsePositiveInt(process.env.CHAT_MAX_CONCURRENT, 2)
const chatMaxTokens = parsePositiveInt(process.env.CHAT_MAX_TOKENS, 120)

let inFlightChatRequests = 0
let cachedStatus: { value: LocalModelStatus, expiresAt: number } | null = null
let statusLookupPromise: Promise<LocalModelStatus> | null = null

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

function parseNonNegativeInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return Math.floor(parsed)
}

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  const raw = value?.trim() || fallback
  return raw.replace(/\/$/, '')
}

function getProviderBaseUrl(provider: ChatProvider) {
  return provider === 'ollama' ? ollamaBaseUrl : llamaCppBaseUrl
}

function isMemoryPressureErrorMessage(message: string) {
  const normalized = message.toLowerCase()

  return normalized.includes('requires more system memory')
    || normalized.includes('not enough memory')
    || normalized.includes('insufficient memory')
    || normalized.includes('out of memory')
}

function getSystemPrompt() {
  return [
    'Tu es l assistant local de MediStock AI.',
    'Tu aides sur le stock, les alertes, les profils, les prises et le renouvellement.',
    'Ne donne jamais de diagnostic medical et ne remplace pas un professionnel de sante.',
    'Si la question est medicale sensible, encourage l utilisateur a consulter un pharmacien ou medecin.',
    'Reponds en francais, de facon concise et actionable.',
  ].join(' ')
}

function stringifyHistory(history: ChatHistoryTurn[] | undefined, message: string) {
  const turns = [...(history ?? []), { role: 'user' as const, content: message }]

  const historyText = turns
    .map((turn) => `${turn.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${turn.content}`)
    .join('\n')

  return `${getSystemPrompt()}\n\n${historyText}\nAssistant:`
}

async function requestJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const requestHeaders = init.headers
      ? {
          'Content-Type': 'application/json',
          ...init.headers,
        }
      : {
          'Content-Type': 'application/json',
        }

    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: requestHeaders,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')

      if (response.status === 500 && isMemoryPressureErrorMessage(errorText)) {
        throw new ChatServiceError(
          'RESOURCE_EXHAUSTED',
          'Memoire insuffisante pour ce modele local. Installe un modele plus leger (ex: "ollama pull llama3.2:1b") puis definis CHAT_MODEL=llama3.2:1b.',
        )
      }

      const errorSnippet = errorText ? ` - ${errorText.slice(0, 180)}` : ''
      throw new ChatServiceError('INTERNAL_ERROR', `HTTP ${response.status}${errorSnippet}`)
    }

    return response.json() as Promise<T>
  } catch (error) {
    if (error instanceof ChatServiceError) {
      throw error
    }

    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))) {
      throw new ChatServiceError('TIMEOUT', 'Le modele local met trop de temps a repondre. Reessaie.')
    }

    throw new ChatServiceError('INTERNAL_ERROR', 'Echec de communication avec le moteur IA local.')
  } finally {
    clearTimeout(timeoutId)
  }
}

async function resolveOllamaStatus(): Promise<LocalModelStatus> {
  const checkedAt = new Date().toISOString()

  try {
    const tags = await requestJson<OllamaTagsResponse>(`${ollamaBaseUrl}/api/tags`, { method: 'GET' }, Math.min(chatTimeoutMs, 5000))
    const modelNames = (tags.models ?? []).map((entry) => entry.name?.trim()).filter((name): name is string => Boolean(name))

    if (modelNames.length === 0) {
      return {
        provider: 'ollama',
        model: configuredModel,
        baseUrl: ollamaBaseUrl,
        available: false,
        reason: 'Aucun modele Ollama detecte. Lance "ollama pull <modele>".',
        checkedAt,
        timeoutMs: chatTimeoutMs,
      }
    }

    const selectedModel = modelNames.includes(configuredModel) ? configuredModel : modelNames[0]
    const reason = modelNames.includes(configuredModel)
      ? null
      : `Modele configure introuvable. Utilisation de "${selectedModel}".`

    return {
      provider: 'ollama',
      model: selectedModel,
      baseUrl: ollamaBaseUrl,
      available: true,
      reason,
      checkedAt,
      timeoutMs: chatTimeoutMs,
    }
  } catch (error) {
    const reason = error instanceof Error
      ? `Ollama indisponible (${error.message}).`
      : 'Ollama indisponible.'

    return {
      provider: 'ollama',
      model: configuredModel,
      baseUrl: ollamaBaseUrl,
      available: false,
      reason,
      checkedAt,
      timeoutMs: chatTimeoutMs,
    }
  }
}

async function resolveLlamaCppStatus(): Promise<LocalModelStatus> {
  const checkedAt = new Date().toISOString()

  try {
    const models = await requestJson<LlamaCppModelsResponse>(`${llamaCppBaseUrl}/v1/models`, { method: 'GET' }, Math.min(chatTimeoutMs, 5000))
    const modelIds = (models.data ?? []).map((entry) => entry.id?.trim()).filter((id): id is string => Boolean(id))

    if (modelIds.length === 0) {
      return {
        provider: 'llama_cpp',
        model: configuredModel,
        baseUrl: llamaCppBaseUrl,
        available: false,
        reason: 'Serveur llama.cpp atteint mais aucun modele n est charge.',
        checkedAt,
        timeoutMs: chatTimeoutMs,
      }
    }

    const selectedModel = modelIds.includes(configuredModel) ? configuredModel : modelIds[0]
    const reason = modelIds.includes(configuredModel)
      ? null
      : `Modele configure introuvable. Utilisation de "${selectedModel}".`

    return {
      provider: 'llama_cpp',
      model: selectedModel,
      baseUrl: llamaCppBaseUrl,
      available: true,
      reason,
      checkedAt,
      timeoutMs: chatTimeoutMs,
    }
  } catch (error) {
    const reason = error instanceof Error
      ? `llama.cpp indisponible (${error.message}).`
      : 'llama.cpp indisponible.'

    return {
      provider: 'llama_cpp',
      model: configuredModel,
      baseUrl: llamaCppBaseUrl,
      available: false,
      reason,
      checkedAt,
      timeoutMs: chatTimeoutMs,
    }
  }
}

export async function getLocalModelStatus() {
  const now = Date.now()

  if (chatStatusCacheTtlMs > 0 && cachedStatus && now < cachedStatus.expiresAt) {
    return cachedStatus.value
  }

  if (statusLookupPromise) {
    return statusLookupPromise
  }

  statusLookupPromise = (async () => {
    const status = chatProvider === 'llama_cpp'
      ? await resolveLlamaCppStatus()
      : await resolveOllamaStatus()

    if (chatStatusCacheTtlMs > 0) {
      cachedStatus = {
        value: status,
        expiresAt: Date.now() + chatStatusCacheTtlMs,
      }
    }

    return status
  })()

  try {
    return await statusLookupPromise
  } finally {
    statusLookupPromise = null
  }
}

export function getChatRuntimeMetrics(): ChatRuntimeMetrics {
  return {
    inFlightRequests: inFlightChatRequests,
    maxConcurrent: chatMaxConcurrent,
    statusCacheTtlMs: chatStatusCacheTtlMs,
  }
}

function acquireChatSlot() {
  if (inFlightChatRequests >= chatMaxConcurrent) {
    return false
  }

  inFlightChatRequests += 1
  return true
}

function releaseChatSlot() {
  inFlightChatRequests = Math.max(0, inFlightChatRequests - 1)
}

async function generateWithOllama(model: string, message: string, history: ChatHistoryTurn[] | undefined) {
  const payload = {
    model,
    prompt: stringifyHistory(history, message),
    stream: false,
    keep_alive: ollamaKeepAlive,
    options: {
      temperature: 0.2,
      num_predict: chatMaxTokens,
    },
  }

  const generated = await requestJson<OllamaGenerateResponse>(`${ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, chatTimeoutMs)

  const text = generated.response?.trim()

  if (!text) {
    throw new ChatServiceError('INTERNAL_ERROR', 'Le modele local a retourne une reponse vide.')
  }

  return text
}

async function generateWithLlamaCpp(model: string, message: string, history: ChatHistoryTurn[] | undefined) {
  const payload = {
    model,
    temperature: 0.2,
    max_tokens: chatMaxTokens,
    messages: [
      { role: 'system', content: getSystemPrompt() },
      ...(history ?? []).map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: message },
    ],
  }

  const completion = await requestJson<LlamaCppCompletionsResponse>(`${llamaCppBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, chatTimeoutMs)

  const text = completion.choices?.[0]?.message?.content?.trim()

  if (!text) {
    throw new ChatServiceError('INTERNAL_ERROR', 'Le modele local a retourne une reponse vide.')
  }

  return text
}

export async function generateLocalChatReply(input: { message: string, history?: ChatHistoryTurn[] }): Promise<LocalChatReply> {
  if (!acquireChatSlot()) {
    throw new ChatServiceError(
      'RESOURCE_EXHAUSTED',
      `Trop de requetes IA simultanees. Reessaie dans quelques secondes (max concurrent: ${chatMaxConcurrent}).`,
    )
  }

  try {
    const status = await getLocalModelStatus()

    if (!status.available) {
      throw new ChatServiceError('MODEL_UNAVAILABLE', status.reason ?? 'Le modele local est indisponible.')
    }

    const reply = status.provider === 'ollama'
      ? await generateWithOllama(status.model, input.message, input.history)
      : await generateWithLlamaCpp(status.model, input.message, input.history)

    return {
      reply,
      disclaimer: chatDisclaimer,
      provider: status.provider,
      model: status.model,
    }
  } finally {
    releaseChatSlot()
  }
}
