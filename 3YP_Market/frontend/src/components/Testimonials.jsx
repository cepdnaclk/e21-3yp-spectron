import { Quote } from 'lucide-react'
import AnimatedSection from './AnimatedSection.jsx'
import SectionHeading from './SectionHeading.jsx'
import { testimonials } from '../data/siteData.js'

export default function Testimonials() {
  return (
    <AnimatedSection className="bg-[#f0eee9] py-20 sm:py-24">
      <div className="section-shell">
        <SectionHeading
          eyebrow="Testimonials"
          title="Placeholder proof points for pilots, advisors, and early users."
          description="These can be replaced once the product has named customer quotes, university evaluation notes, or field deployment feedback."
          align="center"
        />

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <figure key={testimonial.person} className="card">
              <Quote className="h-7 w-7 text-teal-700" aria-hidden="true" />
              <blockquote className="mt-5 text-base leading-7 text-slate-700">
                "{testimonial.quote}"
              </blockquote>
              <figcaption className="mt-6 border-t border-slate-200 pt-5">
                <p className="font-bold text-slate-950">{testimonial.person}</p>
                <p className="mt-1 text-sm text-slate-500">{testimonial.role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </AnimatedSection>
  )
}
