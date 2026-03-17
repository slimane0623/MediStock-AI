import { Router, type Express } from 'express'
import { chatRouter } from './chat/chat.routes.js'
import { dashboardRouter } from './dashboard/dashboard.routes.js'
import { healthRouter } from './health/health.routes.js'
import { historyRouter } from './history/history.routes.js'
import { inventoryRouter } from './inventory/inventory.routes.js'
import { notificationsRouter } from './notifications/notifications.routes.js'
import { profilesRouter } from './profiles/profiles.routes.js'

export function registerApiRoutes(app: Express) {
  const apiRouter = Router()

  apiRouter.use('/health', healthRouter)
  apiRouter.use('/dashboard', dashboardRouter)
  apiRouter.use('/profiles', profilesRouter)
  apiRouter.use('/inventory', inventoryRouter)
  apiRouter.use('/history', historyRouter)
  apiRouter.use('/notifications', notificationsRouter)
  apiRouter.use('/chat', chatRouter)

  app.use('/api', apiRouter)
}
