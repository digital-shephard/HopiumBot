import { useState, useEffect, useRef } from 'react'
import './LandingScreen.css'

function LandingScreen({ onComplete }) {
  const [showText, setShowText] = useState(false)
  const [doorOpen, setDoorOpen] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const streamingTimeoutRef = useRef(null)

  const streamText = (text, onComplete) => {
    // Clear any existing timeout
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current)
    }
    
    setStreamedText('')
    let charIndex = 0
    
    const streamChars = () => {
      if (charIndex < text.length) {
        setStreamedText(text.slice(0, charIndex + 1))
        charIndex++
        streamingTimeoutRef.current = setTimeout(streamChars, 30) // 30ms per character
      } else {
        if (onComplete) {
          onComplete()
        }
      }
    }
    
    setTimeout(() => {
      streamChars()
    }, 200)
  }

  // Show welcome message after door latch animation
  useEffect(() => {
    // Latch opens at 3s delay + 0.6s animation = 3.6s
    const textTimer = setTimeout(() => {
      setShowText(true)
      // Stream welcome message
      streamText('WELCOME FREN!', () => {
        // After welcome message streams, wait a bit then open door
        setTimeout(() => {
          setDoorOpen(true)
        }, 800)
      })
    }, 3600)

    return () => {
      clearTimeout(textTimer)
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (doorOpen) {
      // Fade to black completes at 2.6s delay + 1.5s animation = 4.1s
      // Then wait a bit before transitioning
      const transitionTimer = setTimeout(() => {
        onComplete()
      }, 4100)
      
      return () => clearTimeout(transitionTimer)
    }
  }, [doorOpen, onComplete])


  return (
    <div className="landing-screen">
      <div className={`brick-wall ${doorOpen ? 'door-zoom-in' : ''}`}>
        {doorOpen && <div className="door-background"></div>}
        <div className={`steel-door ${doorOpen ? 'door-open' : ''}`}>
          <div className="eye-latch-container">
            <div className="eye-latch-opening"></div>
            <div className={`eye-latch-slide ${doorOpen ? 'latch-close' : ''}`}></div>
          </div>
          <div className="door-handle"></div>
          <div className="door-panel top"></div>
          <div className="door-panel middle"></div>
          <div className="door-panel bottom"></div>
          
          {showText && !doorOpen && (
            <div className="ticker-question">
              <div className="grungy-text">
                {streamedText}
                {streamedText.length > 0 && <span className="cursor">|</span>}
              </div>
            </div>
          )}
        </div>
      </div>
      {doorOpen && <div className="screen-fade-black"></div>}
    </div>
  )
}

export default LandingScreen
