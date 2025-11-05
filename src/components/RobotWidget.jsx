import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './RobotWidget.css'
import logo from '../assets/logo.webp'
import API_CONFIG from '../config/api'

function RobotWidget({ message, sectionId, onError, isPerpBotRunning = false }) {
  const [currentMessage, setCurrentMessage] = useState('')
  const [currentStreaming, setCurrentStreaming] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoadingSentiment, setIsLoadingSentiment] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const messagesEndRef = useRef(null)
  const messageHistoryRef = useRef(null)
  const streamingTimeoutRef = useRef(null)
  const previousSectionRef = useRef(null)
  const isStreamingRef = useRef(false)
  const currentMessageRef = useRef('')
  const thinkingDotsRef = useRef(null)
  const isAnimatingRef = useRef(false)
  const userScrolledUpRef = useRef(false)
  const previousSectionIdRef = useRef(sectionId)
  const lastSentimentSummaryRef = useRef(null)
  const hasInitializedRef = useRef(false)

  // Reset messages when section changes
  useEffect(() => {
    if (previousSectionIdRef.current !== sectionId) {
      // Section changed - reset everything
      setCurrentMessage('')
      setCurrentStreaming('')
      setIsLoadingSentiment(false)
      setIsStreaming(false)
      userScrolledUpRef.current = false
      lastSentimentSummaryRef.current = null // Reset last sentiment when section changes
      
      // Clear any active timeouts
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current)
        streamingTimeoutRef.current = null
      }
      if (thinkingDotsRef.current) {
        clearTimeout(thinkingDotsRef.current)
        thinkingDotsRef.current = null
      }
      
      isStreamingRef.current = false
      isAnimatingRef.current = false
      previousSectionIdRef.current = sectionId
      // Reset refs so new message will stream
      previousSectionRef.current = null
      currentMessageRef.current = ''
    }
  }, [sectionId])

  // Stream message when section changes
  useEffect(() => {
    if (!message) return
    
    // On initial mount, force streaming even if refs match
    const isInitialMount = !hasInitializedRef.current
    
    // Check if we're already streaming this exact message for this section
    // Skip only if we've initialized and it's the same message
    if (!isInitialMount && previousSectionRef.current === sectionId && currentMessageRef.current === message) {
      return
    }
    
    // Mark as initialized after first run
    hasInitializedRef.current = true
    
    // Clear any existing timeout and stop current streaming
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current)
      streamingTimeoutRef.current = null
    }
    
    // If we were streaming, complete the previous message first
    if (isStreamingRef.current && currentMessageRef.current) {
      setCurrentMessage(currentMessageRef.current)
    }

    // Update refs before starting new stream
    previousSectionRef.current = sectionId
    currentMessageRef.current = message
    isStreamingRef.current = true
    setIsStreaming(true)
    
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
        // Message complete, replace the current message
        setCurrentMessage(message)
        setCurrentStreaming('')
        isStreamingRef.current = false
        setIsStreaming(false)
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
      // Reset streaming state if effect is cleaned up mid-stream
      if (isStreamingRef.current) {
        isStreamingRef.current = false
        setIsStreaming(false)
        setCurrentStreaming('')
      }
    }
  }, [message, sectionId])

  // Check if user has scrolled up
  useEffect(() => {
    const messageHistory = messageHistoryRef.current
    if (!messageHistory || !isExpanded) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = messageHistory
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50 // 50px threshold
      userScrolledUpRef.current = !isNearBottom
      
      // If user scrolls back to bottom, resume auto-scrolling
      if (isNearBottom && messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
      }
    }

    messageHistory.addEventListener('scroll', handleScroll)
    return () => messageHistory.removeEventListener('scroll', handleScroll)
  }, [isExpanded])

  // Auto-scroll to bottom only if user is near bottom
  useEffect(() => {
    if (!isExpanded || !messagesEndRef.current || !messageHistoryRef.current) return
    
    // Only auto-scroll if user hasn't manually scrolled up
    if (!userScrolledUpRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [currentMessage, currentStreaming, isExpanded])

  const toggleExpand = () => {
    setIsExpanded(!isExpanded)
  }

  // Stream text character by character
  const streamText = (text, onComplete) => {
    // Clear any existing streaming
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current)
      streamingTimeoutRef.current = null
    }

    isStreamingRef.current = true
    setIsStreaming(true)
    setCurrentStreaming('')
    
    let charIndex = 0
    let streamedText = ''
    
    const streamChars = () => {
      if (charIndex < text.length) {
        streamedText += text[charIndex]
        setCurrentStreaming(streamedText)
        charIndex++
        streamingTimeoutRef.current = setTimeout(streamChars, 30) // 30ms per character
      } else {
        // Message complete - replace the current message
        setCurrentMessage(text)
        setCurrentStreaming('')
        isStreamingRef.current = false
        setIsStreaming(false)
        streamingTimeoutRef.current = null
        if (onComplete) onComplete()
      }
    }
    
    // Small delay before starting to stream
    setTimeout(() => {
      streamChars()
    }, 200)
  }

  // Animated "Lemme think about this..." with dots
  const showThinkingAnimation = () => {
    setIsLoadingSentiment(true)
    isAnimatingRef.current = true
    let dotCount = 0
    const maxDots = 3
    
    const animateDots = () => {
      if (!isAnimatingRef.current) return
      
      const dots = '.'.repeat((dotCount % (maxDots + 1)))
      setCurrentStreaming(`Lemme think about this${dots}`)
      dotCount++
      
      // Continue animation while loading
      if (isAnimatingRef.current) {
        thinkingDotsRef.current = setTimeout(animateDots, 500)
      }
    }
    
    setCurrentStreaming('Lemme think about this')
    thinkingDotsRef.current = setTimeout(animateDots, 500)
  }

  // Fetch sentiment from API
  const fetchSentiment = async () => {
    // Stop thinking animation if running
    isAnimatingRef.current = false
    if (thinkingDotsRef.current) {
      clearTimeout(thinkingDotsRef.current)
      thinkingDotsRef.current = null
    }

    // Complete any current streaming message
    if (isStreamingRef.current && currentStreaming && !isLoadingSentiment) {
      setCurrentMessage(currentStreaming)
      setCurrentStreaming('')
      isStreamingRef.current = false
      setIsStreaming(false)
    }

    // Show thinking animation
    showThinkingAnimation()

    try {
      const response = await API_CONFIG.fetch(API_CONFIG.endpoints.snapshot('BTCUSDT'))
      
      // Stop thinking animation
      isAnimatingRef.current = false
      setIsLoadingSentiment(false)
      if (thinkingDotsRef.current) {
        clearTimeout(thinkingDotsRef.current)
        thinkingDotsRef.current = null
      }

      // Check if we have LLM summary
      if (response.llm_summary && response.llm_summary.summary) {
        // Compare with last sentiment summary
        const currentSummary = JSON.stringify(response.llm_summary.summary)
        const isSameSummary = lastSentimentSummaryRef.current === currentSummary
        
        if (isSameSummary) {
          // Same summary as last time - show snarky message
          const snarkyMessages = [
            'Umm, my sentiment hasn\'t changed',
            'Still the same, boss. Nothing new here.',
            'Really? You asked again? Still. The. Same.',
            'Bro, I literally just told you. Nothing changed.',
            'Are you testing me? Because I\'m telling you the same thing.',
            'Okay, this is getting weird. Nothing. Has. Changed.',
            'I\'m starting to think you\'re not listening. STILL THE SAME.',
            'Alright, I\'ll say it slower: N-O-T-H-I-N-G C-H-A-N-G-E-D.',
            'You know what? Fine. Ask me again. I dare you. (It\'s still the same.)',
            'Look, I\'m a bot, not a miracle worker. Market sentiment hasn\'t shifted.',
            'If I had eyes, I\'d be rolling them right now. Still unchanged.',
            'Okay, real talk: are you clicking this button just to mess with me?',
            'Last warning: my sentiment is STILL THE SAME. Stop asking.',
            'You know what? I respect the persistence. But also... still the same.',
            'Fine, fine. I\'ll say it one more time: NOTHING CHANGED. Happy now?',
            'Groundhog day called. They want their plot back. Nothing changed.',
            'I\'m starting to think you\'re doing this on purpose. Still the same.',
            'Cool story, still the same sentiment though.',
            'Are you okay? You keep asking the same thing. Nothing changed.',
            'Plot twist: absolutely nothing changed. Surprise!',
            'I\'ve seen this movie before. Spoiler: sentiment doesn\'t change.',
            'Breaking news: still nothing new. Film at 11.',
            'I\'m gonna be honest with you - I\'m getting deja vu here.',
            'You know Einstein\'s definition of insanity? This is it.',
            'Listen, I\'m flattered you keep asking, but... still the same.',
            'At this point I\'m convinced you\'re testing my patience. Still unchanged.'
          ]
          
          // Pick a random message from the array
          const randomIndex = Math.floor(Math.random() * snarkyMessages.length)
          streamText(snarkyMessages[randomIndex])
        } else {
          // New summary - format and display
          const summaryText = response.llm_summary.summary.join('\n\n')
          
          // Add entry recommendation if available
          let fullText = summaryText
          if (response.llm_summary.entry) {
            const entry = response.llm_summary.entry
            fullText += `\n\nEntry Recommendation:\n${entry.side} at ${entry.price} (${entry.order_type})\n${entry.reasoning}`
          }

          // Store the new summary for comparison
          lastSentimentSummaryRef.current = currentSummary
          
          // Stream the summary
          streamText(fullText)
        }
      } else if (response.context && Array.isArray(response.context)) {
        // Fallback to context if no LLM summary
        const contextText = response.context.join('\n\n')
        streamText(contextText)
      } else {
        // No summary available
        streamText('Sorry, I couldn\'t get a sentiment analysis right now. Please try again later.')
      }
    } catch (error) {
      // Stop thinking animation
      isAnimatingRef.current = false
      setIsLoadingSentiment(false)
      if (thinkingDotsRef.current) {
        clearTimeout(thinkingDotsRef.current)
        thinkingDotsRef.current = null
      }
      
      console.error('Error fetching sentiment:', error)
      streamText(`Error: ${error.message || 'Failed to fetch sentiment. Please try again.'}`)
    }
  }

  // Cleanup thinking animation on unmount
  useEffect(() => {
    return () => {
      isAnimatingRef.current = false
      if (thinkingDotsRef.current) {
        clearTimeout(thinkingDotsRef.current)
      }
    }
  }, [])

  // For collapsed view: show streaming text if actively streaming, otherwise show current message
  // Don't show the message prop if we're about to stream it (isStreaming but currentStreaming is empty)
  const displayText = currentStreaming 
    ? currentStreaming 
    : (currentMessage || ((!isStreaming && message) || 'Initializing...'))
  const isPerpFarmingSection = sectionId === 0
  // Show cursor only when actively streaming (has content and not loading sentiment)
  const isCurrentlyStreaming = currentStreaming && !isLoadingSentiment && isStreaming
  
  // Handle error messages from parent
  useEffect(() => {
    if (onError) {
      // Set up error handler
      const handleError = (error) => {
        setErrorMessage(error)
        // Clear error after 5 seconds
        setTimeout(() => {
          setErrorMessage(null)
        }, 5000)
      }
      
      // Store handler for parent to call
      window._robotWidgetErrorHandler = handleError
      
      return () => {
        delete window._robotWidgetErrorHandler
      }
    }
  }, [onError])

  // Display error message
  useEffect(() => {
    if (errorMessage) {
      const errorText = `⚠️ Error: ${errorMessage}`
      streamText(errorText)
    }
  }, [errorMessage])

  // Only show speech bubble on perps page when bot is running
  const shouldShowSpeechBubble = sectionId === 0 && isPerpBotRunning

  return (
    <div className="robot-widget">
      <div className="robot-icon">
        <img src={logo} alt="Hopium Bot Logo" className="robot-logo" />
      </div>
      {shouldShowSpeechBubble && (
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
          <div className="message-history" ref={messageHistoryRef}>
            {currentMessage && !currentStreaming && (
              <motion.div
                className="message-item"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {currentMessage}
              </motion.div>
            )}
            {currentStreaming && (
              <motion.div
                className="message-item"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {currentStreaming}
                <span className="cursor">|</span>
              </motion.div>
            )}
            {isPerpFarmingSection && (
              <button
                className="sentiment-button"
                onClick={(e) => {
                  e.stopPropagation()
                  fetchSentiment()
                }}
                disabled={isLoadingSentiment || isStreaming}
              >
                {isLoadingSentiment ? 'Thinking...' : 'Give me the sentiment'}
              </button>
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="speech-content-collapsed">
            {displayText}
            {isCurrentlyStreaming && <span className="cursor">|</span>}
          </div>
        )}
        <div className="speech-tail"></div>
        {!isExpanded && (
          <div className="expand-hint">Click to expand</div>
        )}
        </div>
      )}
    </div>
  )
}

export default RobotWidget
