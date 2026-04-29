import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import AnimatedSection from './AnimatedSection.jsx'
import SectionHeading from './SectionHeading.jsx'
import { problemPoints, solutionPoints } from '../data/siteData.js'

export default function ProblemSolution() {
  return (
    <AnimatedSection id="problem" className="bg-white py-20 sm:py-24">
      <div className="section-shell">
        <SectionHeading
          eyebrow="Problem vs solution"
          title="Rigid IoT hardware slows down real monitoring work."
          description="The slide reference frames the gap clearly: monitoring needs change, but single-purpose devices make every change feel like a new project. SPECTRON makes sensing modular instead."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
          <div className="card border-red-100 bg-red-50/60 hover:border-red-200 hover:shadow-red-950/10">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-red-100 text-red-700">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase text-red-700">The problem</p>
                <h3 className="text-xl font-bold text-slate-950">Single-purpose hardware</h3>
              </div>
            </div>
            <ul className="mt-6 space-y-4">
              {problemPoints.map((point) => (
                <li key={point} className="flex gap-3 text-slate-700">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="hidden items-center justify-center lg:flex">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-950 text-white shadow-lg">
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>

          <div className="card border-teal-100 bg-teal-50/60">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-teal-100 text-teal-800">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase text-teal-800">The SPECTRON solution</p>
                <h3 className="text-xl font-bold text-slate-950">A reusable modular platform</h3>
              </div>
            </div>
            <ul className="mt-6 space-y-4">
              {solutionPoints.map((point) => (
                <li key={point} className="flex gap-3 text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AnimatedSection>
  )
}
