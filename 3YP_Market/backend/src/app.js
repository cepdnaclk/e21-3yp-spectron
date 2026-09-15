import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import contactRoutes from './routes/contactRoutes.js'
import recommendationRoutes from './routes/recommendationRoutes.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

const app = express()

function isAllowedOrigin(origin) {
  if (!origin || env.corsOrigins.includes(origin)) {
    return true
  }

  if (env.nodeEnv !== 'development') {
    return false
  }

  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true)
      }

      return callback(new Error('Not allowed by CORS'))
    },
  }),
)

app.use(express.json({ limit: '20kb' }))

app.get('/health', (req, res) => {
  res.json({ success: true, message: 'SPECTRON backend is running.' })
})

app.use('/api/contact', contactRoutes)
app.use('/api/recommendations', recommendationRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
