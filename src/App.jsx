import { useState } from 'react'
import LandingScreen from './components/LandingScreen'
import HomePage from './components/HomePage'
import DevToggle from './components/DevToggle'
import AuthStatus from './components/AuthStatus'

function App() {
  const [showHomepage, setShowHomepage] = useState(false)

  const handleLandingComplete = () => {
    setShowHomepage(true)
  }

  return (
    <>
      {!showHomepage && <LandingScreen onComplete={handleLandingComplete} />}
      {showHomepage && <HomePage />}
      {showHomepage && <AuthStatus />}
      <DevToggle />
    </>
  )
}

export default App
