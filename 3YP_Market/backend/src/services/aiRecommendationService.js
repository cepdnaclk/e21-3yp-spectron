import { env } from '../config/env.js'

const sensorCatalog = [
  {
    id: 'sht30',
    name: 'SHT30 Temperature and Humidity Sensor',
    category: 'environment',
    useCases: ['greenhouse', 'cold storage', 'facility monitoring', 'warehousing'],
  },
  {
    id: 'bh1750fvi',
    name: 'BH1750FVI Ambient Light Sensor',
    category: 'light',
    useCases: ['greenhouse', 'classroom', 'facility monitoring'],
  },
  {
    id: 'mq6',
    name: 'MQ-6 Gas Sensor',
    category: 'gas',
    useCases: ['gas leakage', 'industrial safety', 'storage monitoring'],
  },
  {
    id: 'hlk-ld2410b',
    name: 'HLK-LD2410B Presence and Motion Sensor',
    category: 'presence',
    useCases: ['class attendance', 'occupancy', 'facility monitoring', 'security'],
  },
]

const outputSchema = {
  type: 'object',
  properties: {
    useCaseSummary: { type: 'string' },
    recommendedPackage: {
      type: 'string',
      enum: ['Deployment', 'Platform'],
    },
    packageReason: { type: 'string' },
    sensors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            enum: sensorCatalog.map((sensor) => sensor.id),
          },
          name: { type: 'string' },
          why: { type: 'string' },
          priority: {
            type: 'string',
            enum: ['core', 'optional'],
          },
        },
        required: ['id', 'name', 'why', 'priority'],
        additionalProperties: false,
      },
    },
    configurationNotes: {
      type: 'array',
      items: { type: 'string' },
    },
    callToAction: { type: 'string' },
  },
  required: [
    'useCaseSummary',
    'recommendedPackage',
    'packageReason',
    'sensors',
    'configurationNotes',
    'callToAction',
  ],
  additionalProperties: false,
}

export function getSensorCatalog() {
  return sensorCatalog
}

export async function recommendSensors(payload) {
  if (!env.geminiApiKey) {
    const error = new Error('GEMINI_API_KEY is not configured on the backend.')
    error.statusCode = 503
    error.expose = true
    throw error
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.geminiApiKey,
      },
      body: JSON.stringify({
        contents: buildContents(payload),
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: outputSchema,
        },
      }),
    },
  )

  if (!response.ok) {
    const errorBody = await response.text()
    const error = new Error(`Gemini recommendation request failed: ${errorBody}`)
    error.statusCode = response.status
    error.expose = true
    throw error
  }

  const result = await response.json()
  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!rawText) {
    const error = new Error('Gemini returned an empty recommendation response.')
    error.statusCode = 502
    error.expose = true
    throw error
  }

  const recommendation = JSON.parse(rawText)

  return {
    ...recommendation,
    sensors: recommendation.sensors.map((sensor) => ({
      ...sensor,
      category: sensorCatalog.find((item) => item.id === sensor.id)?.category || 'custom',
    })),
  }
}

function buildContents(payload) {
  return [
    {
      role: 'user',
      parts: [
        {
          text: [
            'You are the SPECTRON package advisor.',
            'Recommend only from the provided SPECTRON sensor catalog.',
            'Recommend Deployment when the request fits standard supported modules and normal rollout needs.',
            'Recommend Platform when the user needs custom integration, custom modules, enterprise onboarding, or unusual requirements.',
            'Do not invent sensors outside the catalog.',
            'Keep the recommendation practical and purchase-oriented.',
            `Sensor catalog: ${JSON.stringify(sensorCatalog)}`,
          ].join(' '),
        },
      ],
    },
    {
      role: 'user',
      parts: [
        {
          text: JSON.stringify({
            purpose: payload.purpose,
            industry: payload.industry || null,
            environment: payload.environment || null,
            devices: payload.devices || null,
            needsIntegration: Boolean(payload.needsIntegration),
          }),
        },
      ],
    },
  ]
}
