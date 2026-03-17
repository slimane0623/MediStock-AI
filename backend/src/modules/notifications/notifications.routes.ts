import { Router } from 'express'
import { z } from 'zod'
import { listNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '../../db.js'

export const notificationsRouter = Router()

notificationsRouter.get('/', (request, response) => {
  const querySchema = z.object({
    status: z.enum(['all', 'unread', 'read']).optional(),
  })

  const parsed = querySchema.safeParse(request.query)

  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid query parameters' })
    return
  }

  const status = parsed.data.status === 'all' ? undefined : parsed.data.status
  response.json(listNotifications({ status }))
})

notificationsRouter.patch('/read-all', (_request, response) => {
  response.json(markAllNotificationsAsRead())
})

notificationsRouter.patch('/:id/read', (request, response) => {
  const paramsSchema = z.object({
    id: z.coerce.number().int().positive(),
  })

  const parsed = paramsSchema.safeParse(request.params)

  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid notification id' })
    return
  }

  const notification = markNotificationAsRead(parsed.data.id)

  if (!notification) {
    response.status(404).json({ error: 'Notification not found' })
    return
  }

  response.json(notification)
})