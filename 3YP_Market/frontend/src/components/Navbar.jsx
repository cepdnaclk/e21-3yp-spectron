import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { navigation } from '../data/siteData.js'

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/50 bg-[#f7f4ec]/85 backdrop-blur-xl">
      <nav className="section-shell flex h-[4.5rem] items-center justify-between">
        <a href="#top" className="flex items-center gap-3" aria-label="SPECTRON home">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-sm font-bold text-white">
            S
          </span>
          <span>
            <span className="block text-sm font-bold uppercase text-slate-950">SPECTRON</span>
            <span className="block text-xs font-medium text-slate-500">Modular IoT Adapter Kit</span>
          </span>
        </a>

        <div className="hidden items-center gap-1 lg:flex">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white hover:text-slate-950"
            >
              {item.label}
            </a>
          ))}
        </div>

        <a href="#contact" className="primary-button hidden lg:inline-flex">
          Request demo
        </a>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-900 lg:hidden"
          onClick={() => setOpen((current) => !current)}
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          title={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="border-t border-slate-200 bg-[#f7f4ec] px-5 py-4 shadow-xl lg:hidden"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mx-auto grid max-w-7xl gap-2">
              {navigation.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-800"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <a href="#contact" className="primary-button mt-2" onClick={() => setOpen(false)}>
                Request demo
              </a>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
