import AnimatedSection from './AnimatedSection.jsx'
import Icon from './Icon.jsx'
import SectionHeading from './SectionHeading.jsx'
import { sensorModules } from '../data/siteData.js'

export default function SensorModules() {
  return (
    <AnimatedSection id="modules" className="bg-[#f7f4ec] py-20 sm:py-24">
      <div className="section-shell">
        <SectionHeading
          eyebrow="Available modules"
          title="Sensor modules available in the current SPECTRON lineup."
          description="These are the modules the frontend now displays directly, and they match the recommendation flow used by the package builder."
          align="center"
        />

        <div className="mx-auto mt-12 grid max-w-6xl gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sensorModules.map((module) => (
            <div
              key={module.name}
              className={
                isGreenModule(module)
                  ? 'flex h-full flex-col rounded-lg border border-emerald-200 bg-emerald-50/80 p-6 shadow-sm'
                  : 'card flex h-full flex-col'
              }
            >
              <div className="flex items-start gap-4">
                <span
                  className={
                    isGreenModule(module)
                      ? 'grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-800'
                      : 'grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-800'
                  }
                >
                  <Icon name={module.icon} />
                </span>
                <div>
                  <p
                    className={
                      isGreenModule(module)
                        ? 'text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700'
                        : 'text-xs font-semibold uppercase tracking-[0.08em] text-teal-700'
                    }
                  >
                    {module.category}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-slate-950">{module.name}</h3>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-600">{module.summary}</p>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Example use cases
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {module.useCases.map((useCase) => (
                    <span
                      key={useCase}
                      className={
                        isGreenModule(module)
                          ? 'rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-800'
                          : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700'
                      }
                    >
                      {useCase}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  )
}

function isGreenModule(module) {
  const name = module.name.toLowerCase()
  return name.includes('temperature') || name.includes('humidity') || name.includes('pressure')
}