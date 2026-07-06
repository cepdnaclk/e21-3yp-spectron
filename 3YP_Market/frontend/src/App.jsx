import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Box,
  CircleGauge,
  HelpCircle,
  Mail,
  MapPin,
  Phone,
  Package,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
} from 'lucide-react'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import { API_BASE_URL } from './lib/api.js'
import { collections, ecommerceFaqs, pricing, shopStats } from './data/siteData.js'

const routes = ['/', '/product', '/modules', '/pricing', '/contact']
const heroImage = '/assets/spectron-hero.png'
const LANGUAGE_KEY = 'spectron-language'

const localizedCopy = {
  en: {
    navLabel: 'English',
    language: 'Language',
    requestQuote: 'Request quote',
    buyQuote: 'Buy / Request quote',
    customerName: 'Customer name',
    phoneNumber: 'Phone number',
    address: 'Delivery address',
    compareBundles: 'Compare bundles',
    seeCollections: 'See collections',
    featuredKit: 'Featured kit',
    heroHeading: 'Simple hardware, presented like a premium product.',
    starterBundle: 'Starter bundle for demos and pilot installs',
    heroText:
      'A clean storefront for a reusable agri-tech sensor platform. Browse the product, compare bundles, and request a quote with local support.',
    productTitle: 'Built to look like a real agri-tech product, not a lab prototype.',
    productText:
      'This page keeps the original structure but turns it into a product detail view with a strong image, clean spec blocks, and a clearer purchase path for agriculture buyers.',
    collectionsTitle: 'Curated bundles for different farm buying needs.',
    collectionsText:
      'Instead of a technical module catalog, this page behaves like a simple ecommerce collection view for agriculture buyers.',
    bundlesTitle: 'Simple packages for pilots, estates, and custom builds.',
    bundlesText:
      'These cards keep the original pricing page but present it like an ecommerce bundle selector for agriculture buyers.',
    contactTitle: 'Request a quote or pilot demo.',
    contactText:
      'Use the existing backend form to collect buyer details while keeping the storefront simple and focused on agriculture. Local-language support is available.',
    localSupport: 'English, Sinhala, and Tamil-friendly enquiry support',
    heroBadge: 'Premium agri-tech storefront',
    productCtaTitle: 'Start with a pilot kit or request a custom quote',
    productCtaText:
      'Ideal for growers, estate managers, and farm operators who want a simple listing with a fast purchase path.',
    localHelp: 'We can support enquiries in English, Sinhala, and Tamil for growers, estate teams, and local distributors.',
    footerTag: 'A professional storefront for agriculture.',
    footerCopy: 'A simple professional storefront for Sri Lankan agriculture.',
    footerNote: 'Sri Lankan agriculture storefront demo.',
    supportHeading: 'Local support',
    buyerJourney: 'Built for a simple buyer journey: browse the product, compare bundles, then move to a quote or demo request.',
    productSpecs: [
      {
        title: 'Secure product story',
        text: 'The product page emphasizes device identity, controlled updates, and protected transport.',
      },
      {
        title: 'Readable at a glance',
        text: 'The single hero image and short spec cards make the product easy to scan quickly for farm buyers.',
      },
      {
        title: 'Bundle-ready structure',
        text: 'Each page supports a simple ecommerce path from product detail to bundles and contact.',
      },
      {
        title: 'Premium presentation',
        text: 'The design uses warm neutrals, stronger typography, and a cleaner product-first layout.',
      },
    ],
    collections: [
      { name: 'Paddy starter', summary: 'Best for paddy field demos, early validation, and first-time buyers who need a compact setup.' },
      { name: 'Tea estate pilot', summary: 'Designed for tea estate field trials with enough room to compare performance across sites.' },
      { name: 'Greenhouse deployment', summary: 'Prepared for greenhouse rollouts where consistency, support, and maintenance matter.' },
      { name: 'Irrigation custom build', summary: 'A flexible option for buyers who want their own configuration, branding, or integration needs.' },
      { name: 'Agri education pack', summary: 'A polished option for university demos, thesis work, and farm training showcases.' },
      { name: 'Exporter pack', summary: 'Structured for larger teams that want a simple purchase path and a clean product story.' },
    ],
    pricingCards: [
      { name: 'Starter farm kit', description: 'For small growers, university trials, and first farm deployments.', features: ['1 reusable core', 'Starter sensor module', 'Dashboard setup', 'WhatsApp support'] },
      { name: 'Pilot estate kit', description: 'For tea estates, paddy support teams, and multi-site pilot rollouts.', features: ['Multi-device dashboard', 'Alert policies', 'Signed OTA updates', 'Role-based access'], highlighted: true },
      { name: 'Agri platform', description: 'For cooperatives, exporters, and larger operations that need integration support and custom modules.', features: ['Custom sensor packs', 'API integration', 'Security review', 'Deployment onboarding'] },
    ],
  },
  si: {
    navLabel: 'සිං',
    language: 'භාෂාව',
    requestQuote: 'මිල ගණන් ඉල්ලන්න',
    buyQuote: 'මිලදී ගන්න / මිල ගණන් ඉල්ලන්න',
    customerName: 'පාරිභෝගික නම',
    phoneNumber: 'දුරකථන අංකය',
    address: 'බෙදාහැරීමේ ලිපිනය',
    compareBundles: 'පැකේජ සසඳන්න',
    seeCollections: 'නිෂ්පාදන බලන්න',
    featuredKit: 'විශේෂ පැකේජය',
    heroHeading: 'සරල උපාංගයක්, වෘත්තීය නිෂ්පාදනයක් ලෙස ඉදිරිපත් කර ඇත.',
    starterBundle: 'ප්‍රදර්ශන සහ පළමු පර්යේෂණ සඳහා ආරම්භක පැකේජය',
    heroText:
      'නැවත භාවිතා කළ හැකි කෘෂි-තාක්ෂණ සංවේදක පද්ධතිය සඳහා සරල, වෘත්තීය storefront එකක්. නිෂ්පාදන බලන්න, පැකේජ සසඳන්න, සහ දේශීය සහය සමඟ quote එකක් ඉල්ලන්න.',
    productTitle: 'විද්‍යාගාර prototype එකක් නොව, සැබෑ කෘෂි-තාක්ෂණ නිෂ්පාදනයක් ලෙස ඉදිරිපත් කරලා තිබේ.',
    productText:
      'මෙම පිටුවේ සැකැස්ම පවත්වාගෙන යන අතර, නිෂ්පාදන විස්තර, පැහැදිලි spec blocks, සහ වඩා හොඳ මිලදී ගැනීමේ මාර්ගයක් ලබා දෙයි.',
    collectionsTitle: 'ගොවි අවශ්‍යතා වෙනුවෙන් සකස් කළ පැකේජ.',
    collectionsText:
      'තාක්ෂණික module catalog එකක් වෙනුවට, මෙය කෘෂි-තාක්ෂණ buyer අයට සරල ecommerce collection view එකක් ලෙස ක්‍රියා කරයි.',
    bundlesTitle: 'Pilot, estate, සහ custom build සඳහා සරල පැකේජ.',
    bundlesText:
      'මෙම cards pricing page එක retain කරමින් කෘෂි buyer අයට ගැළපෙන bundle selector එකක් ලෙස ඉදිරිපත් කරයි.',
    contactTitle: 'Quote එකක් හෝ pilot demo එකක් ඉල්ලන්න.',
    contactText:
      'Existing backend form එක භාවිතා කර buyer details එකතු කරන්න. වෙබ් අඩවිය සරලව සහ කෘෂි අවශ්‍යතා මත තබා ඇත. දේශීය භාෂා සහය ලබා ගත හැක.',
    localSupport: 'සිංහල, தமிழ், සහ English enquiry support',
    heroBadge: 'වෘත්තීය කෘෂි-තාක්ෂණ storefront එකක්',
    productCtaTitle: 'Pilot kit එකක් සමඟ ආරම්භ කරන්න හෝ custom quote එකක් ඉල්ලන්න',
    productCtaText:
      'ගොවිජනයින්ට, estate managers ට, සහ farm operators ට වේගවත් purchase path එකක් සහිත සරල listing එකක් වශයෙන් නිර්මාණය කර ඇත.',
    localHelp: 'ගොවීන්, estate teams, සහ local distributors සඳහා English, Sinhala, Tamil support ලබා දෙන්න පුළුවන්.',
    footerTag: 'කෘෂි සඳහා වෘත්තීය storefront එකක්.',
    footerCopy: 'Sri Lankan agriculture සඳහා සරල වෘත්තීය storefront එකක්.',
    footerNote: 'Sri Lankan agriculture storefront demo.',
    supportHeading: 'දේශීය සහය',
    buyerJourney: 'නිෂ්පාදනය බලන්න, පැකේජ සසඳන්න, සහ quote එකක් හෝ demo request එකක් වෙත යන්න.',
    productSpecs: [
      { title: 'ආරක්ෂිත product story', text: 'device identity, controlled updates, සහ protected transport අවධාරණය කරයි.' },
      { title: 'සීග්‍රව තේරුම් ගත හැකි', text: 'single hero image සහ short spec cards නිසා ගොවි buyers ට ඉක්මනින් scan කළ හැක.' },
      { title: 'Bundle-ready structure', text: 'product detail සිට bundles සහ contact දක්වා සරල ecommerce path එකක් සපයයි.' },
      { title: 'වෘත්තීය ඉදිරිපත් කිරීම', text: 'warm neutrals, stronger typography, සහ cleaner product-first layout භාවිතා කරයි.' },
    ],
    collections: [
      { name: 'Paddy starter', summary: 'පළමු පරීක්ෂණ, paddy field demos, සහ compact setup අවශ්‍ය අයට සුදුසුය.' },
      { name: 'Tea estate pilot', summary: 'Tea estate field trials සඳහා නිර්මාණය කර ඇති අතර sites අතර performance compare කළ හැක.' },
      { name: 'Greenhouse deployment', summary: 'Consistency, support, සහ maintenance වැදගත් වන greenhouse rollouts සඳහා සකස් කර ඇත.' },
      { name: 'Irrigation custom build', summary: 'තමන්ගේ configuration, branding, හෝ integration අවශ්‍යතා ඇති buyer අයට නම්‍යශීලී option එකක්.' },
      { name: 'Agri education pack', summary: 'University demos, thesis work, සහ farm training showcases සඳහා polished option එකක්.' },
      { name: 'Exporter pack', summary: 'Simple purchase path එකක් සහ clean product story එකක් අවශ්‍ය larger teams සඳහා.' },
    ],
    pricingCards: [
      { name: 'Starter farm kit', description: 'කුඩා growers, university trials, සහ පළමු farm deployments සඳහා.', features: ['1 reusable core', 'Starter sensor module', 'Dashboard setup', 'WhatsApp support'] },
      { name: 'Pilot estate kit', description: 'Tea estates, paddy support teams, සහ multi-site pilot rollouts සඳහා.', features: ['Multi-device dashboard', 'Alert policies', 'Signed OTA updates', 'Role-based access'], highlighted: true },
      { name: 'Agri platform', description: 'Integration support සහ custom modules අවශ්‍ය cooperatives, exporters, සහ larger operations සඳහා.', features: ['Custom sensor packs', 'API integration', 'Security review', 'Deployment onboarding'] },
    ],
  },
  ta: {
    navLabel: 'தமிழ்',
    language: 'மொழி',
    requestQuote: 'விலை கோரவும்',
    buyQuote: 'வாங்க / விலை கோரவும்',
    customerName: 'வாடிக்கையாளர் பெயர்',
    phoneNumber: 'தொலைபேசி எண்',
    address: 'விநியோக முகவரி',
    compareBundles: 'பொதிகளை ஒப்பிடவும்',
    seeCollections: 'தொகுப்புகளைப் பார்க்க',
    featuredKit: 'சிறப்பு தொகுப்பு',
    heroHeading: 'எளிய hardware, premium product போல வழங்கப்படுகிறது.',
    starterBundle: 'காட்சி மற்றும் முதல் சோதனைகளுக்கான தொடக்க தொகுப்பு',
    heroText:
      'மீண்டும் பயன்படுத்தக்கூடிய agri-tech sensor platform க்கான சுத்தமான storefront. பொருளைப் பார்க்க, பொதிகளை ஒப்பிட, மற்றும் உள்ளூர் உதவியுடன் quote கோரலாம்.',
    productTitle: 'இது laboratory prototype அல்ல, ஒரு உண்மையான agri-tech product போல வடிவமைக்கப்பட்டுள்ளது.',
    productText:
      'இந்தப் பக்கம் original structure ஐ வைத்துக்கொண்டு product detail view, தெளிவான spec blocks, மற்றும் சிறந்த purchase path ஐ வழங்குகிறது.',
    collectionsTitle: 'விவசாய வாங்குதல்களுக்கு ஏற்ப தொகுக்கப்பட்ட பொதிகள்.',
    collectionsText:
      'இது technical module catalog அல்ல; வாடிக்கையாளர்களுக்கான எளிய ecommerce collection view ஆக செயல்படுகிறது.',
    bundlesTitle: 'Pilot, estate, மற்றும் custom build க்கான எளிய பொதிகள்.',
    bundlesText:
      'இந்த cards pricing page ஐ வைத்துக்கொண்டு agriculture buyers க்கான bundle selector போல காட்டுகின்றன.',
    contactTitle: 'Quote அல்லது pilot demo ஒன்றை கோரவும்.',
    contactText:
      'Existing backend form ஐ பயன்படுத்தி buyer details சேகரிக்கலாம். site எளிமையாகவும் agriculture மீது கவனம் செலுத்தியும் உள்ளது. உள்ளூர் மொழி உதவி கிடைக்கும்.',
    localSupport: 'English, Sinhala, மற்றும் தமிழ் enquiry support',
    heroBadge: 'தொழில்முறை agri-tech storefront',
    productCtaTitle: 'Pilot kit ஒன்றுடன் தொடங்கவும் அல்லது custom quote கோரவும்',
    productCtaText:
      'விவசாயிகள், estate managers, மற்றும் farm operators க்கு வேகமான purchase path உடன் எளிய listing ஆக உருவாக்கப்பட்டுள்ளது.',
    localHelp: 'Growers, estate teams, மற்றும் local distributors க்கு English, Sinhala, Tamil support வழங்கலாம்.',
    footerTag: 'விவசாயத்திற்கான தொழில்முறை storefront.',
    footerCopy: 'Sri Lankan agriculture க்கான எளிய தொழில்முறை storefront.',
    footerNote: 'Sri Lankan agriculture storefront demo.',
    supportHeading: 'உள்ளூர் உதவி',
    buyerJourney: 'பொருளைப் பார்த்து, பொதிகளை ஒப்பிட்டு, பிறகு quote அல்லது demo request ஒன்றுக்கு செல்லலாம்.',
    productSpecs: [
      { title: 'பாதுகாப்பான product story', text: 'device identity, controlled updates, மற்றும் protected transport மீது கவனம் செலுத்துகிறது.' },
      { title: 'ஒரு பார்வையில் புரியும்', text: 'single hero image மற்றும் short spec cards மூலம் விவசாய buyers விரைவில் பார்க்கலாம்.' },
      { title: 'Bundle-ready structure', text: 'product detail முதல் bundles மற்றும் contact வரை எளிய ecommerce path வழங்குகிறது.' },
      { title: 'Premium presentation', text: 'warm neutrals, stronger typography, மற்றும் cleaner product-first layout பயன்படுத்துகிறது.' },
    ],
    collections: [
      { name: 'Paddy starter', summary: 'paddy field demos, early validation, மற்றும் compact setup தேவைப்படுவோருக்கு சிறந்தது.' },
      { name: 'Tea estate pilot', summary: 'Tea estate field trials க்காக வடிவமைக்கப்பட்டு sites இடையே performance compare செய்ய முடியும்.' },
      { name: 'Greenhouse deployment', summary: 'Consistency, support, மற்றும் maintenance முக்கியமான greenhouse rollouts க்கு தயாரிக்கப்பட்டது.' },
      { name: 'Irrigation custom build', summary: 'தங்களுடைய configuration, branding, அல்லது integration தேவைகள் உள்ள buyer களுக்கு flexible option.' },
      { name: 'Agri education pack', summary: 'University demos, thesis work, மற்றும் farm training showcases க்கு polished option.' },
      { name: 'Exporter pack', summary: 'Simple purchase path மற்றும் clean product story வேண்டிய larger teams க்கு.' },
    ],
    pricingCards: [
      { name: 'Starter farm kit', description: 'Small growers, university trials, மற்றும் first farm deployments க்கு.', features: ['1 reusable core', 'Starter sensor module', 'Dashboard setup', 'WhatsApp support'] },
      { name: 'Pilot estate kit', description: 'Tea estates, paddy support teams, மற்றும் multi-site pilot rollouts க்கு.', features: ['Multi-device dashboard', 'Alert policies', 'Signed OTA updates', 'Role-based access'], highlighted: true },
      { name: 'Agri platform', description: 'Integration support மற்றும் custom modules தேவையுள்ள cooperatives, exporters, மற்றும் larger operations க்கு.', features: ['Custom sensor packs', 'API integration', 'Security review', 'Deployment onboarding'] },
    ],
  },
}

const trustPoints = [
  'Built for Sri Lankan growers and agri teams',
  'සිංහල / தமிழ் friendly inquiry support',
  'Secure inquiry flow with direct contact support',
  'Designed to present the product like a premium agri-tech catalog item',
]

const featureCards = [
  {
    icon: Box,
    title: 'Reusable core kit',
    text: 'The same product platform can support paddy, tea estate, greenhouse, and storage monitoring without changing the whole setup.',
  },
  {
    icon: Sparkles,
    title: 'Professional finish',
    text: 'A clean enclosure and compact form factor make the device feel ready for demos and pilot installs in the field.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure by design',
    text: 'The product story highlights verified device identity, encrypted transport, and controlled updates for farm deployments.',
  },
  {
    icon: Truck,
    title: 'Bundle friendly',
    text: 'The site is structured for starter packs, pilot kits, and deployment bundles instead of one-off device pages.',
  },
]

const productSpecs = [
  {
    icon: ShieldCheck,
    title: 'Secure product story',
    text: 'The product page emphasizes device identity, controlled updates, and protected transport.',
  },
  {
    icon: CircleGauge,
    title: 'Readable at a glance',
    text: 'The single hero image and short spec cards make the product easy to scan quickly.',
  },
  {
    icon: Box,
    title: 'Bundle-ready structure',
    text: 'Each page supports a simple ecommerce path from product detail to bundles and contact.',
  },
  {
    icon: Sparkles,
    title: 'Premium presentation',
    text: 'The design uses warm neutrals, stronger typography, and a cleaner product-first layout.',
  },
]

const collectionSteps = ['Choose a bundle', 'Review specs', 'Request a quote', 'Place a pilot order']

export default function App() {
  const [path, setPath] = useState(normalizePath(window.location.pathname))
  const [language, setLanguage] = useState(getInitialLanguage)

  useEffect(() => {
    const handlePopState = () => setPath(normalizePath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_KEY, language)
    document.documentElement.lang = language === 'si' ? 'si' : language === 'ta' ? 'ta' : 'en'
  }, [language])

  function navigate(nextPath) {
    const cleanPath = normalizePath(nextPath)
    if (cleanPath === path) return
    window.history.pushState({}, '', cleanPath)
    setPath(cleanPath)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const Page = pageMap[path] || HomePage
  const activeCopy = localizedCopy[language] || localizedCopy.en

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4efe6] text-slate-950">
      <Navbar activePath={path} onNavigate={navigate} language={language} onLanguageChange={setLanguage} />
      <main>
        <Page
          onNavigate={navigate}
          language={language}
          copy={activeCopy}
        />
      </main>
      <Footer onNavigate={navigate} language={language} copy={activeCopy} />
    </div>
  )
}

function HomePage({ onNavigate, copy }) {
  return (
    <>
      <section className="page-pad hero-shop relative overflow-hidden">
        <div className="shop-mesh absolute inset-0 opacity-70" />
        <div className="section-shell relative grid gap-10 py-10 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:py-16">
          <div className="max-w-2xl">
            <p className="eyebrow">
              <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.heroBadge}
            </p>
            <h1 className="mt-5 text-4xl font-black leading-[1.02] sm:text-6xl">{copy.heroHeading}</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-700 sm:text-xl">
              {copy.heroText}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button type="button" className="primary-button" onClick={() => onNavigate('/product')}>
                {copy.buyQuote} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className="secondary-button" onClick={() => onNavigate('/pricing')}>
                {copy.compareBundles}
              </button>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {trustPoints.map((item) => (
                <span key={item} className="inline-flex items-center gap-2 rounded-full border border-white bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.95fr_0.85fr] lg:items-end">
            <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/70 p-3 shadow-2xl shadow-slate-950/15 backdrop-blur">
              <img
                src={heroImage}
                alt="SPECTRON product photographed as a premium device mounted in place"
                className="h-[24rem] w-full rounded-[1.35rem] object-cover sm:h-[30rem]"
              />
            </div>

            <div className="grid gap-4">
              {shopStats.map((stat) => (
                <div key={stat.label} className="rounded-[1.25rem] border border-white bg-white/80 p-5 shadow-sm">
                  <p className="text-3xl font-black text-slate-950">{stat.value}</p>
                  <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
                </div>
              ))}
              <div className="rounded-[1.25rem] bg-slate-950 p-5 text-white shadow-xl shadow-slate-950/20">
                <p className="text-sm font-semibold uppercase tracking-wide text-teal-300">{copy.featuredKit}</p>
                <p className="mt-2 text-xl font-bold">{copy.starterBundle}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{copy.buyerJourney}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-12 sm:py-16">
        <div className="section-shell grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featureCards.map((card) => (
            <FeatureCard key={card.title} {...card} />
          ))}
        </div>
      </section>
    </>
  )
}

function ProductPage({ onNavigate, copy }) {
  const localizedSpecs = (copy.productSpecs || []).map((item, index) => ({
    ...productSpecs[index],
    title: item.title,
    text: item.text,
  }))
  const productName = 'SPECTRON Farm Starter Kit'
  const productDescription = copy.productCtaText
  const productBadge = copy.buyQuote

  return (
    <PageFrame
      eyebrow="Product"
      title={copy.productTitle}
      text={copy.productText}
    >
      <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
        <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-xl shadow-slate-950/10">
          <img
            src={heroImage}
            alt="SPECTRON product shown as a clean ecommerce hero image"
            className="h-full max-h-[38rem] w-full rounded-[1.25rem] object-cover"
          />
        </div>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {localizedSpecs.map((item) => (
              <IconCard key={item.title} {...item} />
            ))}
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-xl shadow-slate-950/20">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-teal-300">
              <Package className="h-4 w-4" aria-hidden="true" />
              {productBadge}
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">{productName}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{productDescription}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button type="button" className="primary-button bg-white text-slate-950 hover:bg-slate-100" onClick={() => onNavigate('/contact')}>
                {copy.requestQuote}
              </button>
              <button type="button" className="secondary-button border-white/20 bg-white/5 text-white hover:bg-white/10 hover:border-white/40" onClick={() => onNavigate('/pricing')}>
                {copy.compareBundles}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-3 md:grid-cols-4">
        {collectionSteps.map((step, index) => (
          <div key={step} className="rounded-[1.25rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-amber-700">Step {index + 1}</p>
            <p className="mt-2 text-lg font-bold text-slate-950">{step}</p>
          </div>
        ))}
      </div>
    </PageFrame>
  )
}
function ModulesPage({ copy }) {
  const visibleCollections = (copy.collections || collections).slice(0, 6)

  return (
    <PageFrame
      eyebrow="Collections"
      title={copy.collectionsTitle}
      text={copy.collectionsText}
    >
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-xl shadow-slate-950/10">
          <img
            src={heroImage}
            alt="SPECTRON hero product image used as a collection anchor"
            className="max-h-[36rem] w-full rounded-[1.25rem] object-cover"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleCollections.map((item) => (
            <CompactCard key={item.name} title={item.name} text={item.summary} />
          ))}
        </div>
      </div>
    </PageFrame>
  )
}

function PricingPage({ onNavigate, copy, language }) {
  const visiblePricing = copy.pricingCards || pricing.filter((tier) => tier.name !== 'Prototype')

  return (
    <PageFrame
      eyebrow="Bundles"
      title={copy.bundlesTitle}
      text={copy.bundlesText}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {visiblePricing.map((tier) => (
          <div
            key={tier.name}
            className={
              tier.highlighted
                ? 'rounded-[1.5rem] border-2 border-slate-950 bg-slate-950 p-6 text-white shadow-xl shadow-slate-950/20'
                : 'rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm'
            }
          >
            <p className={`text-sm font-bold uppercase ${tier.highlighted ? 'text-teal-300' : 'text-amber-700'}`}>
              {tier.highlighted ? 'Best seller' : language === 'si' ? 'පැකේජය' : language === 'ta' ? 'தொகுப்பு' : 'Bundle'}
            </p>
            <h2 className="mt-3 text-2xl font-bold">{tier.name}</h2>
            <p className={tier.highlighted ? 'mt-2 text-slate-300' : 'mt-2 text-slate-600'}>
              {tier.description}
            </p>
            <p className="mt-6 text-4xl font-black tracking-tight">{tier.price}</p>
            <ul className="mt-6 grid gap-3">
              {tier.features.map((feature) => (
                <li key={feature} className="flex gap-3 text-sm">
                  <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        {ecommerceFaqs.map((faq) => (
          <div key={faq.question} className="rounded-[1.25rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-bold uppercase text-amber-700">
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              FAQ
            </p>
            <h3 className="mt-3 text-lg font-bold">{faq.question}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{faq.answer}</p>
          </div>
        ))}
      </div>
      <button type="button" className="primary-button mt-8" onClick={() => onNavigate('/contact')}>
        {copy.requestQuote} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </PageFrame>
  )
}

function ContactPage({ copy }) {
  return (
    <PageFrame
      eyebrow="Contact"
      title={copy.contactTitle}
      text={copy.contactText}
    >
      <ContactForm copy={copy} />
    </PageFrame>
  )
}

function ContactForm({ copy }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    industry: 'Paddy starter',
    devices: '',
    message: '',
  })
  const [status, setStatus] = useState({ type: '', message: '' })
  const [submitting, setSubmitting] = useState(false)

  const contactLines = useMemo(
    () => [
      [Mail, 'sales@spectron.local'],
      [Phone, '+94 76 205 7402'],
      [MapPin, 'Sri Lanka agriculture showcase'],
    ],
    [],
  )

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setStatus({ type: '', message: '' })

    try {
      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          devices: formData.devices ? Number(formData.devices) : undefined,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Unable to send request.')
      setStatus({ type: 'success', message: 'Quote request sent successfully.' })
      setFormData((current) => ({ ...current, name: '', email: '', devices: '', message: '' }))
    } catch (error) {
      setStatus({ type: 'error', message: error.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="grid content-start gap-3">
        {contactLines.map(([Icon, value]) => (
          <div key={value} className="flex items-center gap-3 rounded-[1rem] border border-slate-200 bg-white p-4 shadow-sm">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-700">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="font-semibold text-slate-800">{value}</p>
          </div>
        ))}
        <div className="rounded-[1rem] border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">{copy.supportHeading}</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {copy.localHelp}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" name="name" value={formData.name} onChange={handleChange} required />
          <Field label="Email" name="email" type="email" value={formData.email} onChange={handleChange} required />
          <label className="grid gap-2 text-sm font-semibold">
            Order type
            <select
              name="industry"
              value={formData.industry}
              onChange={handleChange}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
            >
              <option>Paddy starter</option>
              <option>Tea estate pilot</option>
              <option>Greenhouse deployment</option>
              <option>Irrigation custom build</option>
              <option>Other</option>
            </select>
          </label>
          <Field label="Device count" name="devices" type="number" value={formData.devices} onChange={handleChange} />
        </div>
        <label className="mt-4 grid gap-2 text-sm font-semibold">
          Message
          <textarea
            required
            name="message"
            rows="4"
            value={formData.message}
            onChange={handleChange}
            className="resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
            placeholder="Tell us what bundle you need, the crop/site type, and the expected quantity."
          />
        </label>
        <button type="submit" className="primary-button mt-5 w-full" disabled={submitting}>
          {submitting ? 'Sending...' : 'Send quote request'}
        </button>
        {status.message ? (
          <p
            className={`mt-4 rounded-lg px-4 py-3 text-sm font-semibold ${
              status.type === 'success' ? 'bg-teal-50 text-teal-800' : 'bg-red-50 text-red-700'
            }`}
          >
            {status.message}
          </p>
        ) : null}
      </form>
    </div>
  )
}

function Field({ label, ...props }) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <input
        {...props}
        className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
      />
    </label>
  )
}

function PageFrame({ eyebrow, title, text, children }) {
  return (
    <section className="page-pad py-10 sm:py-14">
      <div className="section-shell">
        <div className="mb-9 max-w-3xl">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 text-lg leading-8 text-slate-700">{text}</p>
        </div>
        {children}
      </div>
    </section>
  )
}

function IconCard({ icon: Icon, title, text }) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-5 shadow-sm">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function CompactCard({ title, text }) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, text }) {
  return (
    <div className="rounded-[1.35rem] border border-slate-200 bg-[#fcfaf7] p-6 shadow-sm">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function normalizePath(pathname) {
  return routes.includes(pathname) ? pathname : '/'
}

function getInitialLanguage() {
  if (typeof window === 'undefined') return 'en'
  return window.localStorage.getItem(LANGUAGE_KEY) || 'en'
}

const pageMap = {
  '/': HomePage,
  '/product': ProductPage,
  '/modules': ModulesPage,
  '/pricing': PricingPage,
  '/contact': ContactPage,
}