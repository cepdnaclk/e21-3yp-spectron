import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, CheckCircle2, Gauge, PlayCircle, Zap } from 'lucide-react'
import { heroStats } from '../data/siteData.js'

const capabilityTags = ['ESP32-C3 ready', 'Signed OTA', 'Battery aware', 'Web dashboard']

export default function Hero() {
  const { scrollYProgress } = useScroll()
  const imageY = useTransform(scrollYProgress, [0, 0.4], [0, 60])

  return (
    <section id="top" className="hero-glow relative isolate overflow-hidden pt-28 sm:pt-32">
      <div className="tech-grid absolute inset-0 opacity-70" />
      <motion.div
        aria-hidden="true"
        className="absolute left-8 top-40 h-24 w-24 rounded-full border border-teal-500/30"
        animate={{ scale: [1, 1.16, 1], opacity: [0.45, 0.8, 0.45] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute right-6 top-28 h-14 w-14 rounded-full border border-[#94663f]/40"
        animate={{ y: [0, 18, 0], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="section-shell relative grid gap-12 pb-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:pb-[4.5rem]">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="eyebrow">
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            Standardized modular IoT adapter kit
          </p>
          <h1 className="mt-6 max-w-4xl text-5xl font-bold leading-none text-slate-950 sm:text-6xl lg:text-7xl">
            SPECTRON
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700 sm:text-xl">
            One reusable device core for multiple sensing applications. Attach different sensor
            modules, configure behavior through a dashboard, and deploy secure monitoring without
            rebuilding the full system.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#contact" className="primary-button">
              Request demo <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a href="#features" className="secondary-button">
              <PlayCircle className="h-4 w-4" aria-hidden="true" /> Explore platform
            </a>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {capabilityTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-2 rounded-md border border-white bg-white/75 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4 text-teal-700" aria-hidden="true" />
                {tag}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div style={{ y: imageY }} className="relative">
          <div className="relative overflow-hidden rounded-lg border border-white/70 bg-white/45 p-3 shadow-2xl shadow-slate-950/15 backdrop-blur">
            <img
              src="/assets/spectron-hero.png"
              alt="SPECTRON modular IoT device with swappable sensor modules and dashboard preview"
              className="h-auto w-full rounded-md object-cover"
            />
            <motion.div
              className="absolute left-5 top-5 rounded-lg border border-slate-200 bg-white/90 p-4 shadow-lg backdrop-blur"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6 }}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
                  <Gauge className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Live device</p>
                  <p className="text-sm font-bold text-slate-950">Greenhouse Node A7</p>
                </div>
              </div>
            </motion.div>
            <motion.div
              className="absolute bottom-5 right-5 rounded-lg border border-teal-200 bg-slate-950/92 p-4 text-white shadow-xl backdrop-blur"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
            >
              <p className="text-xs font-semibold uppercase text-teal-200">Alert rule</p>
              <p className="mt-1 text-sm font-bold">Battery optimized sampling</p>
            </motion.div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {heroStats.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-white bg-white/70 p-4 shadow-sm">
                <p className="text-2xl font-bold text-slate-950">{stat.value}</p>
                <p className="mt-1 text-xs font-semibold uppercase leading-5 text-slate-500">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
