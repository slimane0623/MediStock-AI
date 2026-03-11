import { Router } from 'express'
import { z } from 'zod'
import { applyInventoryAction, listInventory } from '../../db.js'

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
