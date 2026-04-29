import { BriefcaseBusiness, Code2, RadioTower } from 'lucide-react'
import { navigation } from '../data/siteData.js'

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-[#f7f4ec] py-10">
      <div className="section-shell">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-slate-950 text-sm font-bold text-white">
              S
            </span>
            <div>
              <p className="font-bold uppercase text-slate-950">SPECTRON</p>
              <p className="text-sm text-slate-600">A standardized modular IoT adapter kit.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-5 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Copyright 2026 SPECTRON. Frontend concept for demo and product validation.
          </p>
          <div className="flex gap-2">
            <FooterIcon href="#" label="SPECTRON network">
              <RadioTower className="h-4 w-4" aria-hidden="true" />
            </FooterIcon>
            <FooterIcon href="#" label="LinkedIn">
              <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
            </FooterIcon>
            <FooterIcon href="#" label="GitHub">
              <Code2 className="h-4 w-4" aria-hidden="true" />
            </FooterIcon>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterIcon({ href, label, children }) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-teal-400 hover:text-teal-700"
    >
      {children}
    </a>
  )
}
