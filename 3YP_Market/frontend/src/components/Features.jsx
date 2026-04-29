import AnimatedSection from './AnimatedSection.jsx'
import Icon from './Icon.jsx'
import SectionHeading from './SectionHeading.jsx'
import { features } from '../data/siteData.js'

export default function Features() {
  return (
    <AnimatedSection id="features" className="bg-white py-20 sm:py-24">
      <div className="section-shell">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <SectionHeading
            eyebrow="Main features"
            title="Everything needed to move from prototype to field deployment."
            description="The platform combines modular hardware, configurable firmware behavior, dashboard visibility, and secure update paths into one product experience."
          />

          <div className="grid gap-5 sm:grid-cols-2">
            {features.map((feature) => (
              <div key={feature.title} className="card">
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-teal-50 text-teal-800">
                  <Icon name={feature.icon} />
                </span>
                <h3 className="mt-5 text-lg font-bold text-slate-950">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AnimatedSection>
  )
}
