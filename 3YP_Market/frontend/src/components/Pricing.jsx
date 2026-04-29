import { CheckCircle2 } from 'lucide-react'
import AnimatedSection from './AnimatedSection.jsx'
import CustomPackageBuilder from './CustomPackageBuilder.jsx'
import SectionHeading from './SectionHeading.jsx'
import { pricing } from '../data/siteData.js'

export default function Pricing({ onRecommendationSelect }) {
  const visiblePricing = pricing.filter((tier) => tier.name !== 'Prototype')

  return (
    <AnimatedSection id="pricing" className="bg-white py-20 sm:py-24">
      <div className="section-shell">
        <SectionHeading
          eyebrow="Pricing placeholders"
          title="Flexible packages for deployments and platform partnerships."
          description="The frontend is ready for real prices later. For now, the structure supports custom startup pricing while the product scope is validated."
          align="center"
        />

        <div className="mx-auto mt-12 grid max-w-5xl items-stretch gap-5 lg:grid-cols-2">
          {visiblePricing.map((tier) => (
            <div
              key={tier.name}
              className={
                tier.highlighted
                  ? 'flex h-full flex-col rounded-lg border-2 border-teal-500 bg-slate-950 p-6 text-white shadow-xl shadow-teal-950/20'
                  : 'card flex h-full flex-col'
              }
            >
              {tier.highlighted ? (
                <p className="mb-4 inline-flex rounded-md bg-teal-300 px-3 py-1 text-xs font-bold uppercase text-slate-950">
                  Recommended
                </p>
              ) : null}
              <h3 className={`text-2xl font-bold ${tier.highlighted ? 'text-white' : 'text-slate-950'}`}>
                {tier.name}
              </h3>
              <p className={`mt-3 text-sm leading-6 ${tier.highlighted ? 'text-slate-300' : 'text-slate-600'}`}>
                {tier.description}
              </p>
              <p className="mt-6 text-4xl font-bold">{tier.price}</p>
              <ul className="mt-6 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm">
                    <CheckCircle2
                      className={`mt-0.5 h-5 w-5 shrink-0 ${
                        tier.highlighted ? 'text-teal-200' : 'text-teal-700'
                      }`}
                      aria-hidden="true"
                    />
                    <span className={tier.highlighted ? 'text-slate-100' : 'text-slate-700'}>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <a href="#contact" className={tier.highlighted ? 'secondary-button w-full' : 'primary-button w-full'}>
                  Talk to us
                </a>
              </div>
            </div>
          ))}
        </div>

        <CustomPackageBuilder onRecommendationSelect={onRecommendationSelect} />
      </div>
    </AnimatedSection>
  )
}
