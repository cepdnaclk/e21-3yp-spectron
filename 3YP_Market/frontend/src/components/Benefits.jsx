import AnimatedSection from './AnimatedSection.jsx'
import Icon from './Icon.jsx'
import SectionHeading from './SectionHeading.jsx'
import { benefits } from '../data/siteData.js'

export default function Benefits() {
  return (
    <AnimatedSection className="bg-[#f0eee9] py-20 sm:py-24">
      <div className="section-shell">
        <SectionHeading
          eyebrow="Product benefits"
          title="Built for teams that need flexible sensing without hardware churn."
          description="SPECTRON gives operators a stable platform foundation while engineers keep room to evolve sensors, settings, and deployments."
          align="center"
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit) => (
            <div key={benefit.title} className="card">
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-slate-950 text-teal-200">
                <Icon name={benefit.icon} />
              </span>
              <h3 className="mt-5 text-lg font-bold text-slate-950">{benefit.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{benefit.text}</p>
            </div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  )
}
