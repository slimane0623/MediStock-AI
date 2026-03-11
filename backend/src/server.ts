import express from 'express'
import cors from 'cors'
import { z } from 'zod'
import { getDashboard, listInventory, listMovements, listProfiles } from './db.js'

const app = express()
const port = Number(process.env.PORT ?? 4000)

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'medistock-api' })
})

app.get('/api/dashboard', (_request, response) => {
  response.json(getDashboard())
})

app.get('/api/profiles', (_request, response) => {
  response.json(listProfiles())
})

app.get('/api/inventory', (request, response) => {
  const querySchema = z.object({
    search: z.string().optional(),
    status: z.enum(['ok', 'critical', 'expiring', 'out']).optional(),
  })

  const parsed = querySchema.safeParse(request.query)

  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid query parameters' })
    return
  }

  response.json(listInventory(parsed.data.search ?? '', parsed.data.status))
})

app.get('/api/history', (_request, response) => {
  response.json(listMovements())
})

app.post('/api/chat', (request, response) => {
  const bodySchema = z.object({
    message: z.string().min(1),
  })

  const parsed = bodySchema.safeParse(request.body)

  if (!parsed.success) {
    response.status(400).json({ error: 'Message is required' })
    return
  }

  const lowerMessage = parsed.data.message.toLowerCase()

  let answer = 'Je peux aider pour le stock, les alertes et les profils. L avis d un professionnel de sante reste indispensable.'

  if (lowerMessage.includes('stock')) {
    answer = 'Le stock est gere localement. Je peux t aider a verifier les medicaments critiques et ceux proches de la peremption.'
  } else if (lowerMessage.includes('prise')) {
    answer = 'Pour enregistrer une prise, selectionne un medicament dans l inventaire puis utilise l action rapide correspondante.'
  } else if (lowerMessage.includes('interaction')) {
    answer = 'Je peux signaler des points d attention, mais je ne remplace pas un pharmacien ni un medecin.'
  }

  response.json({
    reply: answer,
    disclaimer: 'Assistant local informatif uniquement. Ne remplace pas un avis medical professionnel.',
  })
})

app.listen(port, () => {
  console.log(`MediStock API running on http://localhost:${port}`)
})
