import { listInventory, InventoryRow, listProfiles, ProfileRow, listAlerts, AlertRow, listMovements, MovementRow, getDashboard, DashboardStats, listNotifications, NotificationRow } from '../../db.js'

type ChatRole = 'user' | 'assistant'

export type ChatHistoryTurn = {
  role: ChatRole
  content: string
}

// Types for categorized inventory
type CategorizedInventory = {
  critical: InventoryRow[]
  expiring: InventoryRow[]
  outOfStock: InventoryRow[]
  normal: InventoryRow[]
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

export const chatTimeoutMs = parsePositiveInt(process.env.CHAT_TIMEOUT_MS, 45000)
export const chatStatusCacheTtlMs = parseNonNegativeInt(process.env.CHAT_STATUS_CACHE_TTL_MS, 5000)
export const chatMaxConcurrent = parsePositiveInt(process.env.CHAT_MAX_CONCURRENT, 1)
const chatMaxTokens = parsePositiveInt(process.env.CHAT_MAX_TOKENS, 600)

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

function categorizeInventory(items: InventoryRow[]): CategorizedInventory {
  const categorized: CategorizedInventory = {
    critical: [],
    expiring: [],
    outOfStock: [],
    normal: [],
  }

  const now = new Date()
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  items.forEach((item) => {
    const expiryDate = new Date(item.expiryDate)
    
    if (item.quantity === 0) {
      categorized.outOfStock.push(item)
    } else if (item.quantity <= item.criticalThreshold) {
      categorized.critical.push(item)
    } else if (expiryDate <= thirtyDaysLater && expiryDate > now) {
      categorized.expiring.push(item)
    } else {
      categorized.normal.push(item)
    }
  })

  return categorized
}

function generateSmartInsights(inventory: CategorizedInventory, alerts: AlertRow[], notifications: NotificationRow[]): string {
  const parts: string[] = []

  if (inventory.critical.length > 0) {
    parts.push(`🚨 ${inventory.critical.length} CRITIQUE`)
  }
  if (inventory.outOfStock.length > 0) {
    parts.push(`🔴 ${inventory.outOfStock.length} RUPTURE`)
  }
  if (inventory.expiring.length > 0) {
    parts.push(`⏰ ${inventory.expiring.length} EXPIR`)
  }

  const unread = notifications.filter((n) => !n.isRead).length
  if (unread > 0) {
    parts.push(`📢 ${unread} notif`)
  }

  if (parts.length === 0) {
    parts.push(`✅ Stock OK`)
  }

  return parts.join(' | ')
}

function formatInventoryContext(items: InventoryRow[]): string {
  if (items.length === 0) {
    return '📦 Aucun médicament'
  }

  const categorized = categorizeInventory(items)

  // Only show critical/rupture, rest is summary
  const critical = categorized.critical.slice(0, 3)
  const rupture = categorized.outOfStock.slice(0, 2)

  const lines: string[] = []

  if (critical.length > 0) {
    lines.push('🔴 CRITIQUE:')
    critical.forEach((i) => lines.push(`  ${i.medicineName}: ${i.quantity}/${i.criticalThreshold}`))
  }

  if (rupture.length > 0) {
    lines.push('❌ RUPTURE:')
    rupture.forEach((i) => lines.push(`  ${i.medicineName}`))
  }

  lines.push(`✅ Normal: ${categorized.normal.length} | 🟡 Expir: ${categorized.expiring.length}`)

  return lines.join('\n')
}

function formatProfilesContext(profiles: ProfileRow[]): string {
  if (profiles.length === 0) {
    return ''
  }

  const list = profiles.map((p) => {
    const a = p.allergies ? ` A:${p.allergies.substring(0, 15)}` : ''
    return `${p.name}(${p.role})${a}`
  }).join(' | ')

  return `👥 ${list}`
}

function formatAlertsContext(alerts: AlertRow[]): string {
  if (alerts.length === 0) {
    return ''
  }

  const critical = alerts.filter((a) => a.severity === 'critical').slice(0, 1)
  const warnings = alerts.filter((a) => a.severity === 'warning').slice(0, 1)

  const parts: string[] = []
  if (critical.length > 0) {
    parts.push(`🔴 ${critical[0].title}`)
  }
  if (warnings.length > 0) {
    parts.push(`🟡 ${warnings[0].title}`)
  }

  return parts.join(' | ')
}

function formatMovementsContext(movements: MovementRow[]): string {
  if (movements.length === 0) {
    return ''
  }

  const recent = movements.slice(0, 2)
  const list = recent.map((m) => {
    const icon = m.type === 'prise' ? '💊' : '➕'
    const d = m.occurredAt.substring(0, 10)
    return `${icon} ${m.medicineName} ${d}`
  }).join(' | ')

  return `📜 ${list}`
}

function formatStatsContext(stats: DashboardStats): string {
  return `📊 ${stats.totalMedicines}🩺 | 🔴${stats.criticalCount} | ❌${stats.outOfStockCount} | 🟡${stats.expiringCount}`
}

type DeterministicIntent =
  | 'urgent_renewal'
  | 'next_renewal'
  | 'stock_status'
  | 'medicine_lookup'
  | 'allergies'
  | 'expiring'
  | 'history'
  | 'none'

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9\s]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function getDaysUntilExpiry(expiryDate: string): number {
  const date = new Date(expiryDate)
  return Math.ceil((date.valueOf() - Date.now()) / (1000 * 60 * 60 * 24))
}

function detectDeterministicIntent(message: string): DeterministicIntent {
  const normalizedMessage = normalizeText(message)

  if ([
    'allergie',
    'allergies',
  ].some((keyword) => normalizedMessage.includes(keyword))) {
    return 'allergies'
  }

  if ([
    '10 derniers jours',
    'historique',
    'mouvements',
    'que s est il passe',
    'qu est ce qui s est passe',
    'recemment',
  ].some((keyword) => normalizedMessage.includes(keyword))) {
    return 'history'
  }

  if ([
    'expire',
    'expiration',
    'peremption',
    'perime',
  ].some((keyword) => normalizedMessage.includes(keyword))) {
    return 'expiring'
  }

  if ([
    'prochain renouvel',
    'prochaine renouvel',
    'prochain reappro',
    'prochaine commande',
  ].some((keyword) => normalizedMessage.includes(keyword))) {
    return 'next_renewal'
  }

  if ([
    'stock faible',
    'etat du stock',
    'etat stock',
    'niveau de stock',
    'rupture',
  ].some((keyword) => normalizedMessage.includes(keyword))) {
    return 'stock_status'
  }

  if ([
    'renouvel',
    'urgence',
    'urgent',
    'reappro',
    'reapprovision',
  ].some((keyword) => normalizedMessage.includes(keyword))) {
    return 'urgent_renewal'
  }

  if ([
    'est ce que',
    'y a',
    'dans mon stock',
    'quantite',
    'combien',
    'disponible',
    'en stock',
  ].some((keyword) => normalizedMessage.includes(keyword))) {
    return 'medicine_lookup'
  }

  return 'none'
}

function formatItemStatus(item: InventoryRow): string {
  if (item.quantity === 0) {
    return 'RUPTURE'
  }

  if (item.quantity <= item.criticalThreshold) {
    return 'CRITIQUE'
  }

  const daysLeft = getDaysUntilExpiry(item.expiryDate)
  if (daysLeft <= 30) {
    return `EXPIRE_BIENTOT (${Math.max(daysLeft, 0)}j)`
  }

  return 'OK'
}

function buildStockStatusReply(items: InventoryRow[]): string {
  const categorized = categorizeInventory(items)
  const total = items.length

  const criticalNames = categorized.critical.slice(0, 4).map((item) => item.medicineName).join(', ')
  const ruptureNames = categorized.outOfStock.slice(0, 4).map((item) => item.medicineName).join(', ')

  const lines = [
    `Etat actuel du stock (${total} medicaments):`,
    `- Rupture: ${categorized.outOfStock.length}`,
    `- Critique: ${categorized.critical.length}`,
    `- Expiration <30j: ${categorized.expiring.length}`,
    `- Normal: ${categorized.normal.length}`,
  ]

  if (ruptureNames) {
    lines.push(`- En rupture: ${ruptureNames}`)
  }

  if (criticalNames) {
    lines.push(`- Faible stock: ${criticalNames}`)
  }

  lines.push('Action: prioriser les ruptures puis les niveaux critiques.')
  return lines.join('\n')
}

function buildUrgentRenewalReply(items: InventoryRow[]): string {
  const categorized = categorizeInventory(items)
  const urgent = [...categorized.outOfStock, ...categorized.critical, ...categorized.expiring]

  if (urgent.length === 0) {
    return [
      'Aucun renouvellement urgent detecte actuellement.',
      'Le stock est stable pour le moment.',
    ].join(' ')
  }

  const lines = urgent.slice(0, 8).map((item) => {
    const status = formatItemStatus(item)
    return `- ${item.medicineName}: ${item.quantity} ${item.unit} (seuil ${item.criticalThreshold}, statut ${status})`
  })

  return [
    'Medicaments a renouveler en priorite:',
    ...lines,
  ].join('\n')
}

function buildNextRenewalReply(items: InventoryRow[]): string {
  const scored = items
    .map((item) => {
      const daysLeft = getDaysUntilExpiry(item.expiryDate)
      const status = formatItemStatus(item)

      let priority = 3
      if (item.quantity === 0) {
        priority = 0
      } else if (item.quantity <= item.criticalThreshold) {
        priority = 1
      } else if (daysLeft <= 30) {
        priority = 2
      }

      return { item, daysLeft, status, priority }
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority
      }

      if (left.daysLeft !== right.daysLeft) {
        return left.daysLeft - right.daysLeft
      }

      return left.item.medicineName.localeCompare(right.item.medicineName)
    })

  const next = scored.slice(0, 5)
  if (next.length === 0) {
    return 'Aucun medicament a planifier pour le prochain renouvellement.'
  }

  const lines = next.map((entry, index) => {
    let reason = 'prevision'
    if (entry.priority === 0) {
      reason = 'rupture'
    } else if (entry.priority === 1) {
      reason = 'stock critique'
    } else if (entry.priority === 2) {
      reason = `expiration dans ${Math.max(entry.daysLeft, 0)}j`
    }

    return `${index + 1}. ${entry.item.medicineName}: ${entry.item.quantity} ${entry.item.unit} (${reason})`
  })

  return ['Prochain renouvellement recommande:', ...lines].join('\n')
}

function buildExpiringReply(items: InventoryRow[]): string {
  const expiring = items
    .map((item) => {
      const daysLeft = getDaysUntilExpiry(item.expiryDate)
      return { item, daysLeft }
    })
    .filter((entry) => entry.daysLeft <= 30)
    .sort((left, right) => left.daysLeft - right.daysLeft)

  if (expiring.length === 0) {
    return 'Aucun medicament n expire dans les 30 prochains jours.'
  }

  const lines = expiring.slice(0, 8).map((entry) => {
    const daysLeft = Math.max(entry.daysLeft, 0)
    return `- ${entry.item.medicineName}: ${entry.item.quantity} ${entry.item.unit}, expiration dans ${daysLeft}j`
  })

  return ['Medicaments qui expirent bientot:', ...lines].join('\n')
}

function buildAllergiesReply(message: string, profiles: ProfileRow[]): string {
  const normalizedMessage = normalizeText(message)

  const targetedProfiles = profiles.filter((profile) => normalizedMessage.includes(normalizeText(profile.name)))
  const source = targetedProfiles.length > 0 ? targetedProfiles : profiles

  const withAllergies = source.filter((profile) => profile.allergies.trim().length > 0)

  if (withAllergies.length === 0) {
    if (targetedProfiles.length > 0) {
      return `Aucune allergie renseignee pour ${targetedProfiles.map((profile) => profile.name).join(', ')}.`
    }

    return 'Aucune allergie n est renseignee dans les profils.'
  }

  const lines = withAllergies.map((profile) => `- ${profile.name}: ${profile.allergies}`)
  return ['Allergies enregistrees:', ...lines].join('\n')
}

function buildHistoryReply(message: string, movements: MovementRow[]): string {
  const normalizedMessage = normalizeText(message)
  const needsTenDays = normalizedMessage.includes('10 derniers jours')
  const now = Date.now()
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000

  const filteredMovements = needsTenDays
    ? movements.filter((movement) => new Date(movement.occurredAt).valueOf() >= (now - tenDaysMs))
    : movements.slice(0, 8)

  if (filteredMovements.length === 0) {
    return needsTenDays
      ? 'Aucun mouvement enregistre sur les 10 derniers jours.'
      : 'Aucun mouvement disponible.'
  }

  const lines = filteredMovements.slice(0, 8).map((movement) => {
    const date = new Date(movement.occurredAt).toLocaleDateString('fr-FR')
    const profile = movement.profileName ? ` (${movement.profileName})` : ''
    return `- ${date}: ${movement.type} ${movement.quantityDelta} sur ${movement.medicineName}${profile}`
  })

  const title = needsTenDays ? 'Mouvements des 10 derniers jours:' : 'Mouvements recents:'
  return [title, ...lines].join('\n')
}

function buildMedicineLookupReply(message: string, items: InventoryRow[]): string {
  const normalizedMessage = normalizeText(message)

  const matches = items.filter((item) => {
    const name = normalizeText(item.medicineName)
    if (normalizedMessage.includes(name)) {
      return true
    }

    const tokens = name.split(' ').filter((token) => token.length >= 4)
    return tokens.some((token) => normalizedMessage.includes(token))
  })

  if (matches.length === 0) {
    const topNames = items.slice(0, 8).map((item) => item.medicineName).join(', ')
    return `Je ne trouve pas ce medicament dans votre stock actuel. Medicaments disponibles: ${topNames}.`
  }

  const lines = matches.slice(0, 6).map((item) => {
    const status = formatItemStatus(item)
    return `- ${item.medicineName}: ${item.quantity} ${item.unit} (statut ${status})`
  })

  return ['Resultat stock en temps reel:', ...lines].join('\n')
}

function tryBuildDeterministicReply(
  message: string,
  items: InventoryRow[],
  profiles: ProfileRow[],
  movements: MovementRow[],
): string | null {
  const intent = detectDeterministicIntent(message)

  switch (intent) {
    case 'urgent_renewal':
      return buildUrgentRenewalReply(items)
    case 'next_renewal':
      return buildNextRenewalReply(items)
    case 'stock_status':
      return buildStockStatusReply(items)
    case 'medicine_lookup':
      return buildMedicineLookupReply(message, items)
    case 'allergies':
      return buildAllergiesReply(message, profiles)
    case 'expiring':
      return buildExpiringReply(items)
    case 'history':
      return buildHistoryReply(message, movements)
    default:
      return null
  }
}

function getSystemPrompt(contextData: { inventory: string; insights: string; profiles: string; alerts: string; movements: string; stats: string; timestamp: string }): string {
  return [
    '🏥 MediStock - Assistant stock',
    contextData.insights,
    contextData.inventory,
    contextData.stats,
    contextData.profiles,
    (contextData.alerts ? `⚠️ ${contextData.alerts}` : ''),
    (contextData.movements ? `${contextData.movements}` : ''),
    '',
    '📌 Tu: Assistant stock local.',
    '✓ Analyse données réelles stock/profils',
    '✓ Recommande actions renouvellement',
    '✗ JAMAIS diagnos médical/dosage',
    '✗ Recommande toujours pharmacien si sensible',
    '',
    '💬 Réponse: Direct, français, actionnable, avec détails du contexte au-dessus',
  ].join('\n')
}

function stringifyHistory(history: ChatHistoryTurn[] | undefined, message: string, systemPrompt: string) {
  const turns = [...(history ?? []), { role: 'user' as const, content: message }]

  const historyText = turns
    .map((turn) => `${turn.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${turn.content}`)
    .join('\n')

  return `${systemPrompt}\n\n${historyText}\nAssistant:`
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

async function generateWithOllama(model: string, message: string, history: ChatHistoryTurn[] | undefined, systemPrompt: string) {
  const payload = {
    model,
    prompt: stringifyHistory(history, message, systemPrompt),
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

async function generateWithLlamaCpp(model: string, message: string, history: ChatHistoryTurn[] | undefined, systemPrompt: string) {
  const payload = {
    model,
    temperature: 0.2,
    max_tokens: chatMaxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
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

    // 🚀 FETCH MINIMAL DATA FOR SPEED
    const { items: inventoryItems } = listInventory('', undefined, { limit: 50 })
    const profiles = listProfiles()
    const alerts = listAlerts()
    const movements = listMovements().slice(0, 5)
    const dashboardData = getDashboard()
    const notifications = listNotifications()

    // Categorize inventory for smart analysis
    const categorizedInventory = categorizeInventory(inventoryItems)

    // Format data - ultra-compact version
    const contextData = {
      inventory: formatInventoryContext(inventoryItems),
      insights: generateSmartInsights(categorizedInventory, alerts, notifications),
      profiles: formatProfilesContext(profiles),
      alerts: formatAlertsContext(alerts),
      movements: formatMovementsContext(movements),
      stats: formatStatsContext(dashboardData.stats),
      timestamp: '',
    }

    const deterministicReply = tryBuildDeterministicReply(input.message, inventoryItems, profiles, movements)
    if (deterministicReply) {
      return {
        reply: deterministicReply,
        disclaimer: chatDisclaimer,
        provider: status.provider,
        model: status.model,
      }
    }

    const systemPrompt = getSystemPrompt(contextData)

    const reply = status.provider === 'ollama'
      ? await generateWithOllama(status.model, input.message, input.history, systemPrompt)
      : await generateWithLlamaCpp(status.model, input.message, input.history, systemPrompt)

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
