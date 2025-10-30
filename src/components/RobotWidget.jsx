import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './RobotWidget.css'
import logo from '../assets/logo.webp'

function RobotWidget({ message, sectionId }) {
  const [messages, setMessages] = useState([])
  const [currentStreaming, setCurrentStreaming] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const messagesEndRef = useRef(null)
  const streamingTimeoutRef = useRef(null)
  const previousSectionRef = useRef(null)

  // Stream message when section changes
  useEffect(() => {
    if (!message) return
    if (previousSectionRef.current === sectionId) return
    
    // Clear any existing timeout
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current)
    }

    // Reset streaming state
    setCurrentStreaming('')
    previousSectionRef.current = sectionId
    
    let charIndex = 0
    
    const streamChars = () => {
      if (charIndex < message.length) {
        setCurrentStreaming(prev => prev + message[charIndex])
        charIndex++
        streamingTimeoutRef.current = setTimeout(streamChars, 30) // 30ms per character
      } else {
        // Message complete, add to history
        setMessages(prev => [...prev, message])
        setCurrentStreaming('')
      }
    }
    
    // Small delay before starting to stream
    setTimeout(() => {
      streamChars()
    }, 200)

    return () => {
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current)
      }
    }
  }, [message, sectionId])

  // Auto-scroll to bottom when expanded
  useEffect(() => {
    if (isExpanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, currentStreaming, isExpanded])

  const toggleExpand = () => {
    setIsExpanded(!isExpanded)
  }

  const displayText = currentStreaming || (messages.length > 0 ? messages[messages.length - 1] : 'Initializing...')
  const allMessages = [...messages, ...(currentStreaming ? [currentStreaming] : [])]

  return (
    <div className="robot-widget">
      <div className="robot-icon">
        <img src={logo} alt="Hopium Bot Logo" className="robot-logo" />
      </div>
      <div 
        className={`speech-bubble ${isExpanded ? 'expanded' : ''}`}
        onClick={toggleExpand}
      >
        {isExpanded ? (
          <div className="message-history">
            {allMessages.map((msg, index) => (
              <motion.div
                key={index}
                className="message-item"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {msg}
                {index === allMessages.length - 1 && currentStreaming && (
                  <span className="cursor">|</span>
                )}
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="speech-content-collapsed">
            {displayText}
            {currentStreaming && <span className="cursor">|</span>}
          </div>
        )}
        <div className="speech-tail"></div>
        {!isExpanded && (
          <div className="expand-hint">Click to expand</div>
        )}
      </div>
    </div>
  )
}

export default RobotWidget
