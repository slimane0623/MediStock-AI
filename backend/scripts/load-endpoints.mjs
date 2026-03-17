function parseArgs(argv) {
  const parsed = {
    baseUrl: 'http://localhost:4000',
    duration: 10,
    concurrency: 10,
    timeout: 8000,
    includeChat: false,
  }

  for (const arg of argv) {
    if (arg.startsWith('--base-url=')) {
      parsed.baseUrl = arg.slice('--base-url='.length)
      continue
    }

    if (arg.startsWith('--duration=')) {
      parsed.duration = Number(arg.slice('--duration='.length))
      continue
    }

    if (arg.startsWith('--concurrency=')) {
      parsed.concurrency = Number(arg.slice('--concurrency='.length))
      continue
    }

    if (arg.startsWith('--timeout=')) {
      parsed.timeout = Number(arg.slice('--timeout='.length))
      continue
    }

    if (arg === '--include-chat') {
      parsed.includeChat = true
      continue
    }
  }

  if (!Number.isFinite(parsed.duration) || parsed.duration <= 0) {
    parsed.duration = 10
  }

  if (!Number.isFinite(parsed.concurrency) || parsed.concurrency <= 0) {
    parsed.concurrency = 10
  }

  if (!Number.isFinite(parsed.timeout) || parsed.timeout <= 0) {
    parsed.timeout = 8000
  }

  parsed.baseUrl = parsed.baseUrl.replace(/\/$/, '')

  return parsed
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))
  return sorted[index]
}

function createStats() {
  return {
    total: 0,
    ok: 0,
    timeout: 0,
    network: 0,
    http4xx: 0,
    http5xx: 0,
    latencies: [],
    statusCounts: new Map(),
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2))

  const endpoints = [
    {
      name: 'health',
      method: 'GET',
      path: '/api/health',
      acceptedStatus: new Set([200]),
    },
    {
      name: 'inventory',
      method: 'GET',
      path: '/api/inventory?limit=20&offset=0&sort=medicineName&order=asc',
      acceptedStatus: new Set([200]),
    },
    {
      name: 'search',
      method: 'GET',
      path: '/api/search?q=stock&limit=5',
      acceptedStatus: new Set([200]),
    },
  ]

  if (options.includeChat) {
    endpoints.push({
      name: 'chat',
      method: 'POST',
      path: '/api/chat',
      body: {
        message: 'Rappelle les bonnes pratiques de suivi de stock en 2 phrases.',
      },
      acceptedStatus: new Set([200, 503, 504]),
    })
  }

  const statsByEndpoint = new Map(endpoints.map((endpoint) => [endpoint.name, createStats()]))
  const startedAt = Date.now()
  const endAt = startedAt + options.duration * 1000
  let cursor = 0

  async function hit(endpoint) {
    const stats = statsByEndpoint.get(endpoint.name)

    if (!stats) {
      return
    }

    const url = `${options.baseUrl}${endpoint.path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), options.timeout)
    const requestStartedAt = Date.now()

    try {
      const response = await fetch(url, {
        method: endpoint.method,
        headers: endpoint.body ? { 'Content-Type': 'application/json' } : undefined,
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
        signal: controller.signal,
      })

      const latencyMs = Date.now() - requestStartedAt
      stats.total += 1
      stats.latencies.push(latencyMs)
      stats.statusCounts.set(response.status, (stats.statusCounts.get(response.status) ?? 0) + 1)

      if (endpoint.acceptedStatus.has(response.status)) {
        stats.ok += 1
      } else if (response.status >= 500) {
        stats.http5xx += 1
      } else {
        stats.http4xx += 1
      }

      await response.arrayBuffer().catch(() => undefined)
    } catch (error) {
      stats.total += 1

      if (error instanceof Error && error.name === 'AbortError') {
        stats.timeout += 1
      } else {
        stats.network += 1
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async function worker() {
    while (Date.now() < endAt) {
      const endpoint = endpoints[cursor % endpoints.length]
      cursor += 1
      await hit(endpoint)
    }
  }

  const workers = Array.from({ length: options.concurrency }, () => worker())
  await Promise.all(workers)

  const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000))

  console.log('--- Local Load Test Summary ---')
  console.log(`baseUrl=${options.baseUrl}`)
  console.log(`durationSec=${options.duration}, concurrency=${options.concurrency}, timeoutMs=${options.timeout}`)
  console.log(`includeChat=${options.includeChat}`)
  console.log('')

  let totalRequests = 0
  let totalAccepted = 0
  let totalTimeouts = 0
  let totalNetwork = 0
  let totalHttp4xx = 0
  let totalHttp5xx = 0

  for (const endpoint of endpoints) {
    const stats = statsByEndpoint.get(endpoint.name)

    if (!stats) {
      continue
    }

    totalRequests += stats.total
    totalAccepted += stats.ok
    totalTimeouts += stats.timeout
    totalNetwork += stats.network
    totalHttp4xx += stats.http4xx
    totalHttp5xx += stats.http5xx

    const rps = (stats.total / elapsedSec).toFixed(2)
    const p50 = percentile(stats.latencies, 50)
    const p95 = percentile(stats.latencies, 95)
    const max = stats.latencies.length > 0 ? Math.max(...stats.latencies) : 0

    console.log(`[${endpoint.name}] total=${stats.total} accepted=${stats.ok} timeout=${stats.timeout} network=${stats.network} http4xx=${stats.http4xx} http5xx=${stats.http5xx} rps=${rps} p50=${p50}ms p95=${p95}ms max=${max}ms`)

    if (stats.statusCounts.size > 0) {
      const statuses = Array.from(stats.statusCounts.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([status, count]) => `${status}:${count}`)
        .join(', ')
      console.log(`  status=${statuses}`)
    }
  }

  const acceptedRate = totalRequests > 0 ? ((totalAccepted / totalRequests) * 100).toFixed(2) : '0.00'
  console.log('')
  console.log(`TOTAL total=${totalRequests} accepted=${totalAccepted} acceptedRate=${acceptedRate}% timeout=${totalTimeouts} network=${totalNetwork} http4xx=${totalHttp4xx} http5xx=${totalHttp5xx}`)

  if (totalTimeouts > 0 || totalNetwork > 0) {
    process.exitCode = 1
    console.error('Load test failed: at least one timeout or network error was detected.')
    return
  }

  if (totalHttp5xx > 0) {
    process.exitCode = 1
    console.error('Load test failed: at least one non-accepted 5xx response was detected.')
    return
  }

  console.log('Load test passed: endpoints remained reachable without transport failures.')
}

await run()
