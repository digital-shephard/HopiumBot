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
  const isStreamingRef = useRef(false)
  const currentMessageRef = useRef('')

  // Stream message when section changes
  useEffect(() => {
    if (!message) return
    
    // Check if we're already streaming this exact message for this section
    if (previousSectionRef.current === sectionId && currentMessageRef.current === message) return
    
    // Clear any existing timeout and stop current streaming
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current)
      streamingTimeoutRef.current = null
    }
    
    // If we were streaming, complete the previous message first
    if (isStreamingRef.current && currentMessageRef.current) {
      setMessages(prev => [...prev, currentMessageRef.current])
    }

    // Update refs before starting new stream
    previousSectionRef.current = sectionId
    currentMessageRef.current = message
    isStreamingRef.current = true
    
    // Reset streaming state
    setCurrentStreaming('')
    
    let charIndex = 0
    let streamedText = ''
    
    const streamChars = () => {
      if (charIndex < message.length) {
        streamedText += message[charIndex]
        setCurrentStreaming(streamedText)
        charIndex++
        streamingTimeoutRef.current = setTimeout(streamChars, 30) // 30ms per character
      } else {
        // Message complete, add to history
        setMessages(prev => [...prev, message])
        setCurrentStreaming('')
        isStreamingRef.current = false
        streamingTimeoutRef.current = null
      }
    }
    
    // Small delay before starting to stream
    const startTimeout = setTimeout(() => {
      streamChars()
    }, 200)

    return () => {
      clearTimeout(startTimeout)
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current)
        streamingTimeoutRef.current = null
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
        onClick={!isExpanded ? toggleExpand : undefined}
      >
        {isExpanded && (
          <button 
            className="close-button"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(false)
            }}
            aria-label="Close chat"
          >
            ×
          </button>
        )}
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
