import { Router } from 'express'
import { z } from 'zod'
import {
  createProfile,
  deleteProfile,
  listProfiles,
  updateProfile,
} from '../../db.js'

export const profilesRouter = Router()

const roleEnum = z.enum([
  'Gestionnaire principal',
  'Patient chronique',
  'Senior',
  'Aidant familial',
])

const profileBodySchema = z.object({
  name: z.string().trim().min(1),
  role: roleEnum,
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  allergies: z.string().trim().default('Aucune'),
  notes: z.string().trim().default(''),
})

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

profilesRouter.get('/', (_request, response) => {
  response.json(listProfiles())
})

profilesRouter.post('/', (request, response) => {
  const parsedBody = profileBodySchema.safeParse(request.body)

  if (!parsedBody.success) {
    response.status(400).json({ error: 'Invalid profile payload' })
    return
  }

  const created = createProfile(parsedBody.data)

  response.status(201).json(created)
})

profilesRouter.put('/:id', (request, response) => {
  const parsedParams = paramsSchema.safeParse(request.params)
  const parsedBody = profileBodySchema.safeParse(request.body)

  if (!parsedParams.success || !parsedBody.success) {
    response.status(400).json({ error: 'Invalid profile payload' })
    return
  }

  const updated = updateProfile(parsedParams.data.id, parsedBody.data)

  if (!updated) {
    response.status(404).json({ error: 'Profile not found' })
    return
  }

  response.json(updated)
})

profilesRouter.delete('/:id', (request, response) => {
  const parsedParams = paramsSchema.safeParse(request.params)

  if (!parsedParams.success) {
    response.status(400).json({ error: 'Invalid profile id' })
    return
  }

  const deleted = deleteProfile(parsedParams.data.id)

  if (!deleted) {
    response.status(404).json({ error: 'Profile not found' })
    return
  }

  response.status(204).send()
})
