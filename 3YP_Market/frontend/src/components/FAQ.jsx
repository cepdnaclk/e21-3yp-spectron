import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import AnimatedSection from './AnimatedSection.jsx'
import SectionHeading from './SectionHeading.jsx'
import { faqs } from '../data/siteData.js'

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <AnimatedSection id="faq" className="bg-[#f7f4ec] py-20 sm:py-24">
      <div className="section-shell">
        <SectionHeading
          eyebrow="FAQ"
          title="Answers for teams evaluating a modular IoT platform."
          description="Use this section to handle product fit, deployment, sensor compatibility, and security questions before a demo call."
          align="center"
        />

        <div className="mx-auto mt-12 max-w-4xl divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {faqs.map((item, index) => {
            const isOpen = openIndex === index
            return (
              <div key={item.question}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-5 px-5 py-5 text-left text-base font-bold text-slate-950 sm:px-6"
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  aria-expanded={isOpen}
                >
                  {item.question}
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-teal-700 transition ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen ? (
                  <div className="px-5 pb-5 text-sm leading-7 text-slate-600 sm:px-6">{item.answer}</div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </AnimatedSection>
  )
}
