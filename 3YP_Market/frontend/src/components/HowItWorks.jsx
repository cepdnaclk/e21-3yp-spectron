import { motion } from 'framer-motion'
import AnimatedSection from './AnimatedSection.jsx'
import SectionHeading from './SectionHeading.jsx'
import { workflow } from '../data/siteData.js'

export default function HowItWorks() {
  return (
    <AnimatedSection id="workflow" className="bg-[#f7f4ec] py-20 sm:py-24">
      <div className="section-shell">
        <SectionHeading
          eyebrow="How it works"
          title="From sensor choice to secure live monitoring in four steps."
          description="SPECTRON keeps the physical workflow simple for non-technical users while still supporting engineering-grade configuration and security behind the scenes."
          align="center"
        />

        <div className="mt-14 grid gap-5 lg:grid-cols-4">
          {workflow.map((item, index) => (
            <motion.div
              key={item.step}
              className="card relative overflow-hidden"
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ delay: index * 0.08, duration: 0.55 }}
            >
              <span className="text-sm font-bold text-teal-700">{item.step}</span>
              <h3 className="mt-4 text-xl font-bold text-slate-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.text}</p>
              <span className="absolute -right-5 -top-5 h-24 w-24 rounded-full border border-teal-100" />
            </motion.div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  )
}
