import { env } from '../config/env.js'

const sensorCatalog = [
  {
    id: 'sht30',
    name: 'SHT30 Temperature and Humidity Sensor',
    category: 'environment',
    useCases: [
      'temperature',
      'humidity',
      'room comfort monitoring',
      'greenhouse climate',
      'cold-room monitoring',
      'medicine storage',
      'archive preservation',
      'museum preservation',
      'server heat monitoring',
      'electrical cabinet heat monitoring',
      'poultry comfort',
      'livestock comfort',
      'incubator monitoring',
      'drying room monitoring',
      'indoor comfort',
      'cold storage',
      'facility monitoring',
      'warehousing',
    ],
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
    useCases: [
      'gas leakage',
      'industrial safety',
      'storage monitoring',
      'odour',
      'odor',
      'garbage odor monitoring',
      'restroom cleaning need',
      'kitchen waste room smell escalation',
      'sewer odor alert',
      'drain odor alert',
      'indoor air nuisance alert',
      'gas leak',
      'unsafe air warning',
    ],
  },
  {
    id: 'hlk-ld2410b',
    name: 'HLK-LD2410B Presence and Motion Sensor',
    category: 'presence',
    useCases: ['class attendance', 'occupancy', 'facility monitoring', 'security'],
  },
  {
    id: 'bmp388',
    name: 'BMP388 Pressure Sensor',
    category: 'pressure',
    useCases: [
      'pressure',
      'barometric monitoring',
      'environment trend monitoring',
      'sealed-room drift',
      'cabinet condition drift',
      'ventilation filter trend',
      'process pressure trend',
      'tank pressure trend',
      'line pressure trend',
    ],
  },
  {
    id: 'jsn-sr04t',
    name: 'Ultrasonic Distance Sensor',
    category: 'level',
    useCases: [
      'ultrasonic',
      'garbage bin fill level',
      'water tank level',
      'silo level',
      'container level',
      'material storage level',
      'parking slot occupancy',
      'doorway presence',
      'queue buildup',
      'occupancy zone monitoring',
      'classroom seat presence',
      'simple occupancy',
    ],
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
    return buildLocalRecommendation(payload, 'Gemini API key is not configured; using local recommendation fallback.')
  }

  try {
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
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return buildLocalRecommendation(
          payload,
          `Gemini API key was rejected (${response.status}); using local recommendation fallback.`,
        )
      }

      const error = new Error(`Gemini recommendation request failed: ${errorBody}`)
      error.statusCode = response.status
      error.expose = true
      throw error
    }

    const result = await response.json()
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!rawText) {
      return buildLocalRecommendation(payload, 'Gemini returned an empty response; using local recommendation fallback.')
    }

    const recommendation = JSON.parse(rawText)

    return {
      ...recommendation,
      sensors: recommendation.sensors.map((sensor) => ({
        ...sensor,
        category: sensorCatalog.find((item) => item.id === sensor.id)?.category || 'custom',
      })),
    }
  } catch (error) {
    console.warn(error instanceof Error ? error.message : error)
    return buildLocalRecommendation(payload, 'Gemini request failed; using local recommendation fallback.')
  }
}

function buildLocalRecommendation(payload, fallbackReason) {
  const summary = summarizeUseCase(payload)
  const recommendedPackage = shouldUsePlatform(payload) ? 'Platform' : 'Deployment'
  const sensors = selectSensors(payload)

  return {
    useCaseSummary: summary,
    recommendedPackage,
    packageReason: fallbackReason + ' ' + (recommendedPackage === 'Platform'
      ? 'The request includes integration or custom-module requirements.'
      : 'The request fits the standard sensor modules in the current catalog.'),
    sensors,
    configurationNotes: recommendedPackage === 'Platform'
      ? [
          'Confirm integration points and backend handoff requirements.',
          'Review sensor calibration values before rollout.',
          'Start with a small pilot deployment before scaling.',
        ]
      : [
          'Use the default sensor pack and verify environmental thresholds.',
          'Start with a pilot device on the target site.',
          'Confirm alert delivery and dashboard access before scale-up.',
        ],
    callToAction: 'Use this suggestion as a starting point, then send the request from the contact form to confirm the deployment details.',
  }
}

function summarizeUseCase(payload) {
  const purpose = String(payload.purpose || '').trim()
  if (!purpose) {
    return 'A modular SPECTRON deployment with reusable sensor hardware.'
  }

  return purpose.length > 220 ? `${purpose.slice(0, 217).trimEnd()}...` : purpose
}

function shouldUsePlatform(payload) {
  const text = normalizePayloadText(payload)
  return Boolean(
    payload.needsIntegration ||
    text.includes('custom') ||
    text.includes('integration') ||
    text.includes('enterprise') ||
    text.includes('api') ||
    text.includes('module') ||
    text.includes('onboarding'),
  )
}

function selectSensors(payload) {
  const text = normalizePayloadText(payload)
  const matches = sensorCatalog.filter((sensor) =>
    sensor.useCases.some((useCase) => text.includes(useCase)),
  )

  const chosen = matches.length > 0 ? matches : defaultSensorSet(text)

  return chosen.slice(0, 4).map((sensor, index) => ({
    id: sensor.id,
    name: sensor.name,
    category: sensor.category,
    why: sensor.useCases.some((useCase) => text.includes(useCase))
      ? `Matches the stated use case for ${sensor.useCases.find((useCase) => text.includes(useCase))}.`
      : 'Provides broad coverage for the requested monitoring scenario.',
    priority: index === 0 ? 'core' : 'optional',
  }))
}

function defaultSensorSet(text) {
  const sensors = []

  if (
    text.includes('temperature') ||
    text.includes('humidity') ||
    text.includes('greenhouse') ||
    text.includes('cold storage') ||
    text.includes('comfort') ||
    text.includes('medicine storage') ||
    text.includes('archive') ||
    text.includes('museum') ||
    text.includes('incubator') ||
    text.includes('drying room')
  ) {
    sensors.push(sensorCatalog[0])
  }

  if (text.includes('light')) {
    sensors.push(sensorCatalog[1])
  }

  if (
    text.includes('gas') ||
    text.includes('safety') ||
    text.includes('leak') ||
    text.includes('odour') ||
    text.includes('odor') ||
    text.includes('smell') ||
    text.includes('air nuisance')
  ) {
    sensors.push(sensorCatalog[2])
  }

  if (text.includes('attendance') || text.includes('presence') || text.includes('motion') || text.includes('occupancy') || text.includes('security')) {
    sensors.push(sensorCatalog[3])
  }

  if (
    text.includes('pressure') ||
    text.includes('barometric') ||
    text.includes('sealed-room') ||
    text.includes('sealed room') ||
    text.includes('ventilation') ||
    text.includes('filter') ||
    text.includes('tank pressure') ||
    text.includes('line pressure')
  ) {
    sensors.push(sensorCatalog[4])
  }

  if (
    text.includes('ultrasonic') ||
    text.includes('fill level') ||
    text.includes('water tank') ||
    text.includes('silo') ||
    text.includes('container level') ||
    text.includes('parking') ||
    text.includes('doorway') ||
    text.includes('queue') ||
    text.includes('seat presence')
  ) {
    sensors.push(sensorCatalog[5])
  }

  if (sensors.length === 0) {
    sensors.push(sensorCatalog[0], sensorCatalog[3], sensorCatalog[4])
  }

  return sensors
}

function normalizePayloadText(payload) {
  return [payload.purpose, payload.industry, payload.environment]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
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
