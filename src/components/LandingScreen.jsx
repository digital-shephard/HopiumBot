import { useState, useEffect, useRef } from 'react'
import './LandingScreen.css'

function LandingScreen({ onComplete }) {
  const [showText, setShowText] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [doorOpen, setDoorOpen] = useState(false)
  const [isCorrectAnswer, setIsCorrectAnswer] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [showInputFade, setShowInputFade] = useState(true)
  const [inputShake, setInputShake] = useState(false)
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

  // Stream the intro question
  useEffect(() => {
    // Latch opens at 3s delay + 0.6s animation = 3.6s
    const textTimer = setTimeout(() => {
      setShowText(true)
      // Start streaming the intro question
      streamText('WHATS THE TICKER?', () => {
        // After intro question is streamed, show input
        setTimeout(() => {
          setShowInput(true)
        }, 300)
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

  const handleInputChange = (e) => {
    const value = e.target.value.toUpperCase()
    setInputValue(value)
    
    // Check if user has typed 4 characters (length of AURA)
    if (value.length === 4) {
      if (value === 'AURA') {
        // Correct answer - fade out input, then stream welcome message
        setShowInputFade(false)
        setIsCorrectAnswer(true)
        
        // Wait for input to fade out, then stream welcome message
        setTimeout(() => {
          setStreamedText('')
          streamText('WELCOME FREN!', () => {
            // After welcome message streams, wait a bit then open door
            setTimeout(() => {
              setDoorOpen(true)
            }, 800)
          })
        }, 500) // Wait for input fade animation
      } else {
        // Wrong answer - shake red
        setInputShake(true)
        setTimeout(() => {
          setInputShake(false)
          setInputValue('') // Clear the input
        }, 600)
      }
    }
  }

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
          
          {showInput && !doorOpen && (
            <div className={`ticker-input-container ${showInputFade ? '' : 'fade-out'} ${inputShake ? 'shake-red' : ''}`}>
              <input 
                type="text" 
                className="ticker-input" 
                placeholder=""
                value={inputValue}
                onChange={handleInputChange}
                autoFocus
                disabled={!showInputFade}
              />
            </div>
          )}
        </div>
      </div>
      {doorOpen && <div className="screen-fade-black"></div>}
    </div>
  )
}

export default LandingScreen
