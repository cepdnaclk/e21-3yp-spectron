import { CheckCircle2, Cloud, Database, KeyRound, ShieldCheck, Workflow } from 'lucide-react'
import AnimatedSection from './AnimatedSection.jsx'
import SectionHeading from './SectionHeading.jsx'
import { securityControls } from '../data/siteData.js'

const architecture = [
  { icon: KeyRound, title: 'Device registry', text: 'Identity, provisioning, mTLS, and access policy.' },
  { icon: Workflow, title: 'Event broker', text: 'Kafka-style stream processing with ACL controls.' },
  { icon: Database, title: 'Secure storage', text: 'Restricted access, backups, and encrypted records.' },
  { icon: Cloud, title: 'Dashboard layer', text: 'Validated sessions, RBAC, and HTTPS delivery.' },
]

export default function Security() {
  return (
    <AnimatedSection id="security" className="dark-mesh py-20 sm:py-24">
      <div className="section-shell">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <SectionHeading
            eyebrow="Security standards"
            title="Designed around authenticated devices, encrypted links, and controlled access."
            description="The architecture follows the security themes in the slide reference: TLS, mTLS, OAuth2/JWT, RBAC, X.509 device identity, ACLs, and protected backend storage."
            dark
          />

          <div className="grid gap-5 sm:grid-cols-2">
            {architecture.map((item) => {
              const LucideIcon = item.icon
              return (
                <div key={item.title} className="dark-card">
                  <span className="grid h-12 w-12 place-items-center rounded-lg bg-teal-300/10 text-teal-200">
                    <LucideIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{item.text}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-12 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-white text-slate-950">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase text-teal-100">Deployment controls</p>
                <p className="text-lg font-bold text-white">Security checklist for real field use</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {securityControls.map((control) => (
                <span
                  key={control}
                  className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-100"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-200" aria-hidden="true" />
                  {control}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AnimatedSection>
  )
}
