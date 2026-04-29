import { useState } from 'react'
import { ArrowRight, Bot, CheckCircle2, LoaderCircle, Sparkles } from 'lucide-react'
import { API_BASE_URL } from '../lib/api.js'

const initialForm = {
  purpose: '',
  industry: 'Greenhouse monitoring',
  environment: 'Indoor deployment',
  devices: '',
  needsIntegration: false,
}

export default function CustomPackageBuilder({ onRecommendationSelect }) {
  const [formData, setFormData] = useState(initialForm)
  const [recommendation, setRecommendation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectionMessage, setSelectionMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSelectionMessage('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          devices: formData.devices ? Number(formData.devices) : undefined,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Unable to generate a recommendation right now.')
      }

      setRecommendation({
        ...result.data.recommendation,
        industry: formData.industry,
        environment: formData.environment,
        devices: formData.devices,
        needsIntegration: formData.needsIntegration,
        purpose: formData.purpose,
      })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function handleSelectPackage() {
    if (!recommendation) return

    onRecommendationSelect?.(recommendation)
    setSelectionMessage(`${recommendation.recommendedPackage} is ready in the contact form below.`)
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mx-auto mt-12 grid max-w-6xl gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <form onSubmit={handleSubmit} className="card">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-teal-50 text-teal-700">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">Custom package builder</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">Let AI suggest the right sensors</h3>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-600">
          Describe why you want to use SPECTRON. The assistant will recommend the best sensor mix
          and tell you whether Deployment or Platform is the better package.
        </p>

        <label className="mt-5 grid gap-2 text-sm font-semibold">
          Purpose
          <textarea
            required
            name="purpose"
            rows="6"
            value={formData.purpose}
            onChange={handleChange}
            className="resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            placeholder="Example: We want to monitor greenhouse temperature, humidity, and light so operators get alerts before crop conditions drift."
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Industry
            <select
              name="industry"
              value={formData.industry}
              onChange={handleChange}
              className="rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            >
              <option>Greenhouse monitoring</option>
              <option>Cold storage</option>
              <option>Class attendance</option>
              <option>Facility monitoring</option>
              <option>Warehouse monitoring</option>
              <option>Industrial safety</option>
              <option>Other</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Environment
            <select
              name="environment"
              value={formData.environment}
              onChange={handleChange}
              className="rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            >
              <option>Indoor deployment</option>
              <option>Outdoor or greenhouse</option>
              <option>Cold storage room</option>
              <option>Mixed facility floors</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Devices
            <input
              type="number"
              min="1"
              name="devices"
              value={formData.devices}
              onChange={handleChange}
              className="rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              placeholder="10"
            />
          </label>

          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
            <input
              type="checkbox"
              name="needsIntegration"
              checked={formData.needsIntegration}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Need custom integration or custom module support
          </label>
        </div>

        <button type="submit" className="primary-button mt-5 w-full" disabled={loading}>
          {loading ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Generating recommendation
            </>
          ) : (
            <>
              Get AI sensor suggestion <Bot className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </button>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
      </form>

      <div
        className={
          recommendation?.recommendedPackage === 'Deployment'
            ? 'rounded-lg border border-teal-400/70 bg-slate-950 p-6 text-white shadow-xl shadow-teal-950/20'
            : 'rounded-lg border border-slate-200 bg-white p-6 shadow-sm'
        }
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className={`inline-flex rounded-md px-3 py-1 text-xs font-bold uppercase ${
                recommendation?.recommendedPackage === 'Deployment'
                  ? 'bg-teal-300 text-slate-950'
                  : 'border border-teal-200 bg-teal-50 text-teal-800'
              }`}
            >
              AI package suggestion
            </p>
            <h3
              className={`mt-4 text-2xl font-bold ${
                recommendation?.recommendedPackage === 'Deployment' ? 'text-white' : 'text-slate-950'
              }`}
            >
              {recommendation ? recommendation.recommendedPackage : 'Awaiting your use case'}
            </h3>
          </div>
        </div>

        {recommendation ? (
          <>
            <p
              className={`mt-4 text-sm leading-6 ${
                recommendation.recommendedPackage === 'Deployment' ? 'text-slate-200' : 'text-slate-600'
              }`}
            >
              {recommendation.useCaseSummary}
            </p>

            <div
              className={
                recommendation.recommendedPackage === 'Deployment' ? 'plane-section-dark' : 'plane-section'
              }
            >
              <p
                className={`text-sm font-semibold uppercase ${
                  recommendation.recommendedPackage === 'Deployment' ? 'text-teal-200' : 'text-teal-700'
                }`}
              >
                Why this package
              </p>
              <p
                className={`mt-2 text-sm leading-6 ${
                  recommendation.recommendedPackage === 'Deployment' ? 'text-slate-100' : 'text-slate-700'
                }`}
              >
                {recommendation.packageReason}
              </p>
            </div>

            <div className={recommendation.recommendedPackage === 'Deployment' ? 'plane-section-dark' : 'plane-section'}>
              <p
                className={`text-sm font-semibold uppercase ${
                  recommendation.recommendedPackage === 'Deployment' ? 'text-teal-200' : 'text-teal-700'
                }`}
              >
                Suggested sensors
              </p>
              <div
                className={`mt-4 divide-y ${
                  recommendation.recommendedPackage === 'Deployment' ? 'divide-white/10' : 'divide-slate-200'
                }`}
              >
                {recommendation.sensors.map((sensor) => (
                  <div
                    key={sensor.id}
                    className={`py-4 ${recommendation.recommendedPackage === 'Deployment' ? 'first:pt-0 last:pb-0' : 'first:pt-0 last:pb-0'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p
                          className={`text-sm font-semibold leading-6 ${
                            recommendation.recommendedPackage === 'Deployment' ? 'text-white' : 'text-slate-950'
                          }`}
                        >
                          {sensor.name}
                        </p>
                        <p
                          className={`mt-1 text-[11px] font-medium uppercase tracking-[0.08em] ${
                            recommendation.recommendedPackage === 'Deployment' ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          {sensor.category}
                        </p>
                        <p
                          className={`mt-3 max-w-2xl text-sm leading-6 ${
                            recommendation.recommendedPackage === 'Deployment' ? 'text-slate-200' : 'text-slate-600'
                          }`}
                        >
                          {sensor.why}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                          sensor.priority === 'core'
                            ? 'bg-teal-300 text-slate-950'
                            : recommendation.recommendedPackage === 'Deployment'
                              ? 'bg-white/10 text-slate-200'
                              : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {sensor.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={recommendation.recommendedPackage === 'Deployment' ? 'plane-section-dark' : 'plane-section'}>
              <p
                className={`text-sm font-semibold uppercase ${
                  recommendation.recommendedPackage === 'Deployment' ? 'text-teal-200' : 'text-teal-700'
                }`}
              >
                Configuration notes
              </p>
              <div
                className={`mt-3 divide-y ${
                  recommendation.recommendedPackage === 'Deployment' ? 'divide-white/10' : 'divide-slate-200'
                }`}
              >
                {recommendation.configurationNotes.map((note) => (
                  <div key={note} className="flex gap-3 py-4 text-sm first:pt-0 last:pb-0">
                    <CheckCircle2
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        recommendation.recommendedPackage === 'Deployment' ? 'text-white' : 'text-slate-950'
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={
                        recommendation.recommendedPackage === 'Deployment' ? 'text-slate-100' : 'text-slate-700'
                      }
                    >
                      {note}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <p
                className={`text-sm leading-6 ${
                  recommendation.recommendedPackage === 'Deployment' ? 'text-slate-200' : 'text-slate-600'
                }`}
              >
                {recommendation.callToAction}
              </p>
              <button
                type="button"
                onClick={handleSelectPackage}
                className={recommendation.recommendedPackage === 'Deployment' ? 'secondary-button' : 'primary-button'}
              >
                Select this package <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {selectionMessage ? (
              <p
                className={`mt-4 rounded-lg px-4 py-3 text-sm font-semibold ${
                  recommendation.recommendedPackage === 'Deployment'
                    ? 'bg-teal-300 text-slate-950'
                    : 'bg-teal-50 text-teal-800'
                }`}
              >
                {selectionMessage}
              </p>
            ) : null}
          </>
        ) : (
          <div className="plane-section text-center">
            <p className="text-sm font-semibold uppercase text-slate-500">Custom package preview</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Enter your use case to get AI guidance on which sensors belong in your kit and which
              package you should move forward with.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
