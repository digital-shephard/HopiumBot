import { useState } from 'react'
import LandingScreen from './components/LandingScreen'
import HomePage from './components/HomePage'
import DevToggle from './components/DevToggle'

function App() {
  const [showHomepage, setShowHomepage] = useState(false)

  const handleLandingComplete = () => {
    setShowHomepage(true)
  }

  return (
    <>
      {!showHomepage && <LandingScreen onComplete={handleLandingComplete} />}
      {showHomepage && <HomePage />}
      <DevToggle />
    </>
  )
}

export default App
