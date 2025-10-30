import { useState } from 'react'
import LandingScreen from './components/LandingScreen'
import HomePage from './components/HomePage'

function App() {
  const [showHomepage, setShowHomepage] = useState(false)

  const handleLandingComplete = () => {
    setShowHomepage(true)
  }

  return (
    <>
      {!showHomepage && <LandingScreen onComplete={handleLandingComplete} />}
      {showHomepage && <HomePage />}
    </>
  )
}

export default App
