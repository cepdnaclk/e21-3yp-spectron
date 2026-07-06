import { BriefcaseBusiness, Code2, RadioTower } from 'lucide-react'
import { navigation } from '../data/siteData.js'

export default function Footer({ onNavigate, copy }) {
  function handleNavigate(event, href) {
    if (!onNavigate) return
    event.preventDefault()
    onNavigate(href)
  }

  return (
    <footer className="border-t border-slate-200 bg-[#f4efe6] py-10">
      <div className="section-shell">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/assets/spectron-logo.svg"
              alt=""
              className="h-11 w-11 shrink-0 object-contain"
              aria-hidden="true"
            />
            <div>
              <p className="font-bold uppercase text-slate-950">SPECTRON</p>
              <p className="text-sm text-slate-600">{copy.footerCopy}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {navigation.map((item) => (
              <a
              key={item.href}
              href={item.href}
              onClick={(event) => handleNavigate(event, item.href)}
              className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950"
            >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-5 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {copy.footerNote}
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
      className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-amber-400 hover:text-amber-700"
    >
      {children}
    </a>
  )
}
