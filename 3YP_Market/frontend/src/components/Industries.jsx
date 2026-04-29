import AnimatedSection from './AnimatedSection.jsx'
import Icon from './Icon.jsx'
import SectionHeading from './SectionHeading.jsx'
import { industries } from '../data/siteData.js'

export default function Industries() {
  return (
    <AnimatedSection className="bg-white py-20 sm:py-24">
      <div className="section-shell">
        <SectionHeading
          eyebrow="Target industries"
          title="One platform, many monitoring contexts."
          description="The presentation reference includes greenhouse, class attendance, and cold storage scenarios. The same modular approach also extends to facilities, warehouses, and industrial pilots."
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((industry) => (
            <div key={industry.title} className="card">
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#f0eee9] text-[#94663f]">
                  <Icon name={industry.icon} />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-950">{industry.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{industry.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  )
}
