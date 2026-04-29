import { useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import ProblemSolution from './components/ProblemSolution.jsx'
import Benefits from './components/Benefits.jsx'
import Features from './components/Features.jsx'
import HowItWorks from './components/HowItWorks.jsx'
import Industries from './components/Industries.jsx'
import Security from './components/Security.jsx'
import Testimonials from './components/Testimonials.jsx'
import Pricing from './components/Pricing.jsx'
import FAQ from './components/FAQ.jsx'
import ContactCTA from './components/ContactCTA.jsx'
import Footer from './components/Footer.jsx'

export default function App() {
  const [selectedRecommendation, setSelectedRecommendation] = useState(null)

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f4ec] text-slate-950">
      <Navbar />
      <main>
        <Hero />
        <ProblemSolution />
        <Benefits />
        <Features />
        <HowItWorks />
        <Industries />
        <Security />
        <Testimonials />
        <Pricing onRecommendationSelect={setSelectedRecommendation} />
        <FAQ />
        <ContactCTA selectedRecommendation={selectedRecommendation} />
      </main>
      <Footer />
    </div>
  )
}
