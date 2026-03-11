import { Router } from 'express'
import { z } from 'zod'
import { applyInventoryAction, listInventory, createInventory, deleteInventory, updateInventory } from '../../db.js'

export const inventoryRouter = Router()

inventoryRouter.get('/', (request, response) => {
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

const inventoryBodySchema = z.object({
  medicineName: z.string().trim().min(1),
  dosage: z.string().trim().min(1),
  form: z.string().trim().min(1),
  profileId: z.number().int().positive().nullable(),
  quantity: z.number().int().min(0),
  unit: z.string().trim().min(1),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  criticalThreshold: z.number().int().min(0),
  location: z.string().trim().min(1),
  notes: z.string().trim().default(''),
})

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

inventoryRouter.post('/', (request, response) => {
  const parsedBody = inventoryBodySchema.safeParse(request.body)

  if (!parsedBody.success) {
    response.status(400).json({ error: 'Invalid inventory payload' })
    return
  }

  const created = createInventory(parsedBody.data)

  if (!created) {
    response.status(500).json({ error: 'Unable to create inventory item' })
    return
  }

  response.status(201).json(created)
})

inventoryRouter.post('/:id/actions', (request, response) => {
  const paramsSchema = z.object({
    id: z.coerce.number().int().positive(),
  })

  const bodySchema = z.object({
    type: z.enum(['prise', 'ajout']),
    quantity: z.coerce.number().int().positive(),
    profileId: z.coerce.number().int().positive().nullable().optional(),
    note: z.string().trim().max(240).optional(),
  })

  const parsedParams = paramsSchema.safeParse(request.params)
  const parsedBody = bodySchema.safeParse(request.body)

  if (!parsedParams.success || !parsedBody.success) {
    response.status(400).json({ error: 'Invalid inventory action payload' })
    return
  }

  const actionResult = applyInventoryAction({
    stockItemId: parsedParams.data.id,
    type: parsedBody.data.type,
    quantity: parsedBody.data.quantity,
    profileId: parsedBody.data.profileId,
    note: parsedBody.data.note,
  })

  if (!actionResult.ok) {
    if (actionResult.code === 'NOT_FOUND') {
      response.status(404).json({ error: 'Stock item not found' })
      return
    }

    response.status(409).json({ error: 'Insufficient stock for requested action' })
    return
  }

  response.json(actionResult)
})

inventoryRouter.put('/:id', (request, response) => {
  const parsedParams = paramsSchema.safeParse(request.params)
  const parsedBody = inventoryBodySchema.safeParse(request.body)

  if (!parsedParams.success || !parsedBody.success) {
    response.status(400).json({ error: 'Invalid inventory payload' })
    return
  }

  const updated = updateInventory(parsedParams.data.id, parsedBody.data)

  if (!updated) {
    response.status(404).json({ error: 'Inventory item not found' })
    return
  }

  response.json(updated)
})

inventoryRouter.delete('/:id', (request, response) => {
  const parsedParams = paramsSchema.safeParse(request.params)

  if (!parsedParams.success) {
    response.status(400).json({ error: 'Invalid inventory id' })
    return
  }

  const deleted = deleteInventory(parsedParams.data.id)

  if (!deleted) {
    response.status(404).json({ error: 'Inventory item not found' })
    return
  }

  response.status(204).send()
})
