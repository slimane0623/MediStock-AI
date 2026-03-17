import dotenv from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(currentDir, '..', '.env')
dotenv.config({ path: envPath })

const [{ createApp }, { port }] = await Promise.all([
  import('./core/app.js'),
  import('./core/config.js'),
])

const app = createApp()

app.listen(port, () => {
  console.log(`MediStock API running on http://localhost:${port}`)
})
