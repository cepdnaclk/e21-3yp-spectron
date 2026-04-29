import { useEffect, useMemo, useState } from 'react'
import { Mail, MapPin, Phone, Send } from 'lucide-react'
import AnimatedSection from './AnimatedSection.jsx'
import { API_BASE_URL } from '../lib/api.js'

const initialFormState = {
  name: '',
  email: '',
  industry: 'Greenhouse monitoring',
  devices: '',
  message: '',
}

export default function ContactCTA({ selectedRecommendation }) {
  const [formData, setFormData] = useState(initialFormState)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const recommendationPayload = useMemo(() => {
    if (!selectedRecommendation) return null

    return {
      selectedPackage: selectedRecommendation.recommendedPackage,
      recommendedSensors: selectedRecommendation.sensors.map((sensor) => sensor.name),
      useCaseSummary: selectedRecommendation.useCaseSummary,
      needsIntegration: selectedRecommendation.needsIntegration,
    }
  }, [selectedRecommendation])

  useEffect(() => {
    if (!selectedRecommendation) return

    setFormData((current) => ({
      ...current,
      industry: selectedRecommendation.industry || current.industry,
      devices: selectedRecommendation.devices || current.devices,
      message:
        current.message ||
        `Use case: ${selectedRecommendation.purpose}\nRecommended package: ${selectedRecommendation.recommendedPackage}\nSuggested sensors: ${selectedRecommendation.sensors
          .map((sensor) => sensor.name)
          .join(', ')}`,
    }))
  }, [selectedRecommendation])

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({
      ...current,
      [name]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitted(false)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          ...recommendationPayload,
          devices: formData.devices ? Number(formData.devices) : undefined,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Unable to send your demo request right now.')
      }

      setSubmitted(true)
      setFormData((current) => ({
        ...initialFormState,
        industry: current.industry || initialFormState.industry,
      }))
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatedSection id="contact" className="bg-slate-950 py-20 text-white sm:py-24">
      <div className="section-shell">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="inline-flex rounded-md border border-teal-300/30 bg-teal-300/10 px-3 py-1 text-xs font-semibold uppercase text-teal-100">
              Contact and demo request
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
              Ready to adapt one device to your next monitoring use case?
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-300 sm:text-lg">
              Share your deployment context, sensor needs, and security requirements. The form will
              send your package request to the SPECTRON backend for follow-up.
            </p>

            <div className="mt-8 grid gap-4">
              <ContactLine icon={Mail} label="Email" value="hello@spectron.example" />
              <ContactLine icon={Phone} label="Phone" value="+94 00 000 0000" />
              <ContactLine icon={MapPin} label="Location" value="IoT lab and deployment pilots" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-lg border border-white/10 bg-white p-5 text-slate-950 shadow-2xl sm:p-6">
            {selectedRecommendation ? (
              <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
                <p className="text-xs font-bold uppercase text-teal-800">Selected AI package</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {selectedRecommendation.recommendedPackage}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Sensors: {selectedRecommendation.sensors.map((sensor) => sensor.name).join(', ')}
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                Name
                <input
                  required
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                  placeholder="Your name"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Work email
                <input
                  required
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                  placeholder="you@company.com"
                />
              </label>
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
                  <option>Other</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Device count
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
            </div>
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              What do you want to monitor?
              <textarea
                required
                name="message"
                rows="5"
                value={formData.message}
                onChange={handleChange}
                className="resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                placeholder="Tell us about your sensors, site, alerts, battery needs, and security requirements."
              />
            </label>

            <button type="submit" className="primary-button mt-5 w-full" disabled={submitting}>
              {submitting ? 'Sending request...' : 'Send demo request'} <Send className="h-4 w-4" aria-hidden="true" />
            </button>

            {error ? (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </p>
            ) : null}

            {submitted ? (
              <p className="mt-4 rounded-lg bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">
                Demo request sent successfully. We will contact you soon.
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </AnimatedSection>
  )
}

function ContactLine({ icon: LucideIcon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-300/10 text-teal-200">
        <LucideIcon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
        <p className="font-semibold text-white">{value}</p>
      </div>
    </div>
  )
}
