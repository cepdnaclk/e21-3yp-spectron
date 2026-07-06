import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Menu, X } from 'lucide-react'
import { navigation } from '../data/siteData.js'

const languages = [
  { code: 'en', label: 'EN' },
  { code: 'si', label: 'සිං' },
  { code: 'ta', label: 'தமிழ்' },
]

export default function Navbar({ activePath = '/', onNavigate, language = 'en', onLanguageChange }) {
  const [open, setOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const languageMenuRef = useRef(null)

  useEffect(() => {
    function handleWindowClick(event) {
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target)) {
        setLanguageOpen(false)
      }
    }

    function handleWindowKeyDown(event) {
      if (event.key === 'Escape') setLanguageOpen(false)
    }

    window.addEventListener('click', handleWindowClick)
    window.addEventListener('keydown', handleWindowKeyDown)

    return () => {
      window.removeEventListener('click', handleWindowClick)
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [])

  function handleNavigate(event, href) {
    if (!onNavigate) return
    event.preventDefault()
    onNavigate(href)
    setOpen(false)
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/60 bg-[#f4efe6]/88 backdrop-blur-xl">
      <nav className="section-shell flex h-[4.5rem] items-center justify-between">
        <a href="/" className="flex items-center gap-3" aria-label="SPECTRON home" onClick={(event) => handleNavigate(event, '/')}>
          <img
            src="/assets/spectron-logo.svg"
            alt=""
            className="h-10 w-10 shrink-0 object-contain"
            aria-hidden="true"
          />
          <span>
            <span className="block text-sm font-bold uppercase tracking-[0.18em] text-slate-950">SPECTRON</span>
            <span className="block text-xs font-medium text-slate-500">Sri Lankan agriculture storefront</span>
          </span>
        </a>

        <div className="hidden items-center gap-1 lg:flex">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(event) => handleNavigate(event, item.href)}
              className={`rounded-full px-3 py-2 text-sm font-medium transition hover:bg-white hover:text-slate-950 ${
                activePath === item.href ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-700'
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <div ref={languageMenuRef} className="relative">
            <button
              type="button"
              className="toolbar-button h-10 min-w-[5.5rem] justify-between gap-2 px-3 text-xs uppercase tracking-[0.16em]"
              onClick={() => setLanguageOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={languageOpen}
            >
              <span>{languages.find((item) => item.code === language)?.label || 'EN'}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${languageOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            <AnimatePresence>
              {languageOpen ? (
                <motion.div
                  className="absolute right-0 mt-2 w-28 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-950/10"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  role="menu"
                >
                  {languages.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] transition ${
                        language === item.code
                          ? 'bg-slate-950 text-white'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                      }`}
                      onClick={() => {
                        onLanguageChange?.(item.code)
                        setLanguageOpen(false)
                      }}
                      role="menuitem"
                    >
                      {item.label}
                    </button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <a href="/contact" className="primary-button hidden lg:inline-flex" onClick={(event) => handleNavigate(event, '/contact')}>
            Request quote
          </a>
        </div>

        <button
          type="button"
          className="toolbar-button h-11 w-11 rounded-2xl lg:hidden"
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
            className="border-t border-slate-200 bg-[#f4efe6] px-5 py-4 shadow-xl lg:hidden"
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
                  className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                    activePath === item.href ? 'bg-slate-950 text-white' : 'bg-white text-slate-800'
                  }`}
                  onClick={(event) => handleNavigate(event, item.href)}
                >
                  {item.label}
                </a>
              ))}
              <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                <div className="relative">
                  <button
                    type="button"
                    className="toolbar-button h-10 w-full justify-between px-3 text-xs uppercase tracking-[0.16em]"
                    onClick={() => setLanguageOpen((current) => !current)}
                    aria-haspopup="menu"
                    aria-expanded={languageOpen}
                  >
                    <span>{languages.find((item) => item.code === language)?.label || 'EN'}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${languageOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  <AnimatePresence>
                    {languageOpen ? (
                      <motion.div
                        className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-10 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-950/10"
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.16 }}
                        role="menu"
                      >
                        {languages.map((item) => (
                          <button
                            key={item.code}
                            type="button"
                            className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] transition ${
                              language === item.code
                                ? 'bg-slate-950 text-white'
                                : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                            }`}
                            onClick={() => {
                              onLanguageChange?.(item.code)
                              setLanguageOpen(false)
                              setOpen(false)
                            }}
                            role="menuitem"
                          >
                            {item.label}
                          </button>
                        ))}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
              <a href="/contact" className="primary-button mt-2" onClick={(event) => handleNavigate(event, '/contact')}>
                Request quote
              </a>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
