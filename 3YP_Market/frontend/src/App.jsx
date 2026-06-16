import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  Cpu,
  Mail,
  MapPin,
  Phone,
  Puzzle,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import { API_BASE_URL } from './lib/api.js'
import { pricing, sensorModules } from './data/siteData.js'

const routes = ['/', '/product', '/modules', '/pricing', '/contact']

const imageAssets = [
  {
    src: '/assets/spectron-device-front.jpeg',
    alt: 'SPECTRON device mounted on a wooden frame with red and green indicator lights',
  },
  {
    src: '/assets/spectron-device-side.jpeg',
    alt: 'SPECTRON modular IoT adapter showing side wiring and enclosure',
  },
]

const highlights = [
  ['Reusable core', 'One controller for many sensor jobs'],
  ['Swappable sensors', 'Attach the module required for the site'],
  ['Dashboard setup', 'Change thresholds and sampling without reflashing'],
]

const productPoints = [
  { icon: Puzzle, title: 'Modular adapter', text: 'Sensor packs connect to the same device body.' },
  { icon: Cpu, title: 'ESP32-C3 core', text: 'Compact controller for field-ready IoT pilots.' },
  { icon: BatteryCharging, title: 'Low-power design', text: 'Built for battery-aware sampling and alerts.' },
  { icon: ShieldCheck, title: 'Secure updates', text: 'Supports authenticated cloud links and OTA updates.' },
]

const workflow = ['Pick sensor', 'Attach module', 'Configure rules', 'Monitor online']

export default function App() {
  const [path, setPath] = useState(normalizePath(window.location.pathname))

  useEffect(() => {
    const handlePopState = () => setPath(normalizePath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigate(nextPath) {
    const cleanPath = normalizePath(nextPath)
    if (cleanPath === path) return
    window.history.pushState({}, '', cleanPath)
    setPath(cleanPath)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const Page = pageMap[path] || HomePage

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f4ec] text-slate-950">
      <Navbar activePath={path} onNavigate={navigate} />
      <main>
        <Page onNavigate={navigate} />
      </main>
      <Footer onNavigate={navigate} />
    </div>
  )
}

function HomePage({ onNavigate }) {
  return (
    <>
      <section className="page-pad hero-glow relative overflow-hidden">
        <div className="tech-grid absolute inset-0 opacity-70" />
        <div className="section-shell relative grid gap-10 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-14">
          <div>
            <p className="eyebrow">
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              Modular IoT adapter kit
            </p>
            <h1 className="mt-5 max-w-xl text-4xl font-black leading-[1.02] sm:text-6xl">
              SPECTRON
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-700">
              A compact reusable hardware core for temperature, humidity, pressure, distance,
              odour, light, and presence monitoring.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button type="button" className="primary-button" onClick={() => onNavigate('/product')}>
                View product <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className="secondary-button" onClick={() => onNavigate('/contact')}>
                Request demo
              </button>
            </div>
          </div>

          <PhotoPair />
        </div>
      </section>

      <section className="bg-white py-10">
        <div className="section-shell grid gap-4 md:grid-cols-3">
          {highlights.map(([title, text]) => (
            <CompactCard key={title} title={title} text={text} />
          ))}
        </div>
      </section>
    </>
  )
}

function ProductPage({ onNavigate }) {
  return (
    <PageFrame
      eyebrow="Product"
      title="One device body. Multiple monitoring jobs."
      text="SPECTRON keeps the controller, enclosure, power, and network layer consistent while the sensing module changes for each deployment."
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_0.95fr] lg:items-start">
        <div className="grid gap-4 sm:grid-cols-2">
          {productPoints.map((item) => (
            <IconCard key={item.title} {...item} />
          ))}
        </div>
        <img
          src="/assets/spectron-device-front.jpeg"
          alt="SPECTRON installed device with visible status LEDs"
          className="h-full max-h-[560px] w-full rounded-lg object-cover shadow-xl shadow-slate-950/15"
        />
      </div>

      <div className="mt-10 grid gap-3 md:grid-cols-4">
        {workflow.map((step, index) => (
          <div key={step} className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-bold uppercase text-teal-700">Step {index + 1}</p>
            <p className="mt-2 text-lg font-bold">{step}</p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <button type="button" className="primary-button" onClick={() => onNavigate('/modules')}>
          See modules <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </PageFrame>
  )
}

function ModulesPage() {
  const visibleModules = sensorModules.slice(0, 6)

  return (
    <PageFrame
      eyebrow="Modules"
      title="Sensor options for fast pilots."
      text="Start with the module needed for the site, then reuse the same core for another application."
    >
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <img
          src="/assets/spectron-device-side.jpeg"
          alt="SPECTRON side view showing modular wiring"
          className="max-h-[620px] w-full rounded-lg object-cover shadow-xl shadow-slate-950/15"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleModules.map((module) => (
            <CompactCard key={module.name} title={module.name} text={module.summary} />
          ))}
        </div>
      </div>
    </PageFrame>
  )
}

function PricingPage({ onNavigate }) {
  const visiblePricing = pricing.filter((tier) => tier.name !== 'Prototype')

  return (
    <PageFrame
      eyebrow="Pricing"
      title="Simple packages while the product is validated."
      text="Pricing is custom for prototype and deployment requirements."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {visiblePricing.map((tier) => (
          <div
            key={tier.name}
            className={
              tier.highlighted
                ? 'rounded-lg border-2 border-teal-500 bg-slate-950 p-6 text-white shadow-xl shadow-teal-950/20'
                : 'rounded-lg border border-slate-200 bg-white p-6 shadow-sm'
            }
          >
            <p className="text-sm font-bold uppercase text-teal-600">
              {tier.highlighted ? 'Recommended' : 'Option'}
            </p>
            <h2 className="mt-3 text-2xl font-bold">{tier.name}</h2>
            <p className={tier.highlighted ? 'mt-2 text-slate-300' : 'mt-2 text-slate-600'}>
              {tier.description}
            </p>
            <p className="mt-6 text-4xl font-black">{tier.price}</p>
            <ul className="mt-6 grid gap-3">
              {tier.features.map((feature) => (
                <li key={feature} className="flex gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <button type="button" className="primary-button mt-8" onClick={() => onNavigate('/contact')}>
        Talk to us <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </PageFrame>
  )
}

function ContactPage() {
  return (
    <PageFrame
      eyebrow="Contact"
      title="Request a demo."
      text="Share your site and sensor needs. The request is sent to the SPECTRON backend."
    >
      <ContactForm />
    </PageFrame>
  )
}

function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    industry: 'Greenhouse monitoring',
    devices: '',
    message: '',
  })
  const [status, setStatus] = useState({ type: '', message: '' })
  const [submitting, setSubmitting] = useState(false)

  const contactLines = useMemo(
    () => [
      [Mail, 'spectron@gmail.com'],
      [Phone, '+94 76 205 7402'],
      [MapPin, 'Faculty Of Engineering, UOP'],
    ],
    [],
  )

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setStatus({ type: '', message: '' })

    try {
      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          devices: formData.devices ? Number(formData.devices) : undefined,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Unable to send request.')
      setStatus({ type: 'success', message: 'Demo request sent successfully.' })
      setFormData((current) => ({ ...current, name: '', email: '', devices: '', message: '' }))
    } catch (error) {
      setStatus({ type: 'error', message: error.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="grid content-start gap-3">
        {contactLines.map(([Icon, value]) => (
          <div key={value} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="font-semibold text-slate-800">{value}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" name="name" value={formData.name} onChange={handleChange} required />
          <Field label="Email" name="email" type="email" value={formData.email} onChange={handleChange} required />
          <label className="grid gap-2 text-sm font-semibold">
            Industry
            <select
              name="industry"
              value={formData.industry}
              onChange={handleChange}
              className="rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            >
              <option>Greenhouse monitoring</option>
              <option>Cold storage</option>
              <option>Class attendance</option>
              <option>Facility monitoring</option>
              <option>Other</option>
            </select>
          </label>
          <Field label="Device count" name="devices" type="number" value={formData.devices} onChange={handleChange} />
        </div>
        <label className="mt-4 grid gap-2 text-sm font-semibold">
          Message
          <textarea
            required
            name="message"
            rows="4"
            value={formData.message}
            onChange={handleChange}
            className="resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            placeholder="Sensors, site, alerts, and battery needs"
          />
        </label>
        <button type="submit" className="primary-button mt-5 w-full" disabled={submitting}>
          {submitting ? 'Sending...' : 'Send request'}
        </button>
        {status.message ? (
          <p
            className={`mt-4 rounded-lg px-4 py-3 text-sm font-semibold ${
              status.type === 'success' ? 'bg-teal-50 text-teal-800' : 'bg-red-50 text-red-700'
            }`}
          >
            {status.message}
          </p>
        ) : null}
      </form>
    </div>
  )
}

function Field({ label, ...props }) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <input
        {...props}
        className="rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
      />
    </label>
  )
}

function PhotoPair() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {imageAssets.map((image, index) => (
        <img
          key={image.src}
          src={image.src}
          alt={image.alt}
          className={`h-[420px] w-full rounded-lg object-cover shadow-xl shadow-slate-950/15 ${
            index === 1 ? 'sm:mt-12' : ''
          }`}
        />
      ))}
    </div>
  )
}

function PageFrame({ eyebrow, title, text, children }) {
  return (
    <section className="page-pad py-10 sm:py-14">
      <div className="section-shell">
        <div className="mb-9 max-w-3xl">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 text-lg leading-8 text-slate-700">{text}</p>
        </div>
        {children}
      </div>
    </section>
  )
}

function IconCard({ icon: Icon, title, text }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <span className="grid h-11 w-11 place-items-center rounded-lg bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function CompactCard({ title, text }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function normalizePath(pathname) {
  return routes.includes(pathname) ? pathname : '/'
}

const pageMap = {
  '/': HomePage,
  '/product': ProductPage,
  '/modules': ModulesPage,
  '/pricing': PricingPage,
  '/contact': ContactPage,
}
