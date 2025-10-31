import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './HomePage.css'
import SwapFarming from './sections/SwapFarming'
import PerpFarming from './sections/PerpFarming'
import AirdropAlpha from './sections/AirdropAlpha'
import RobotWidget from './RobotWidget'
import ConnectWallet from './ConnectWallet'

function HomePage() {
  const [currentIndex, setCurrentIndex] = useState(0) // Start with PerpFarming
  const [direction, setDirection] = useState(0)
  const [slideDistance, setSlideDistance] = useState(300)
  const touchStartX = useRef(null)
  const touchEndX = useRef(null)

  useEffect(() => {
    const updateSlideDistance = () => {
      const width = window.innerWidth
      setSlideDistance(width < 768 ? Math.min(width * 0.8, 400) : 300)
    }

    updateSlideDistance()
    window.addEventListener('resize', updateSlideDistance)
    return () => window.removeEventListener('resize', updateSlideDistance)
  }, [])
  
  const sections = [
    { id: 0, component: <PerpFarming />, title: 'Perp Farming', message: 'Analyzing perpetual funding rates across exchanges...' },
    { id: 1, component: <SwapFarming />, title: 'Swap Farming', message: 'Optimizing swap routes for maximum yield extraction...' },
    { id: 2, component: <AirdropAlpha />, title: 'Airdrop Alpha', message: 'Scanning for high-value airdrop opportunities...' }
  ]

  const minSwipeDistance = 50

  const goToNext = () => {
    setDirection(1)
    setCurrentIndex((prev) => (prev + 1) % sections.length)
  }

  const goToPrevious = () => {
    setDirection(-1)
    setCurrentIndex((prev) => (prev - 1 + sections.length) % sections.length)
  }

  const goToIndex = (index) => {
    setDirection(index > currentIndex ? 1 : -1)
    setCurrentIndex(index)
  }

  const onTouchStart = (e) => {
    touchEndX.current = null
    touchStartX.current = e.targetTouches[0].clientX
  }

  const onTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return
    
    const distance = touchStartX.current - touchEndX.current
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      goToNext()
    } else if (isRightSwipe) {
      goToPrevious()
    }
  }

  const slideVariants = {
    enter: (direction) => ({
      x: direction > 0 ? slideDistance : -slideDistance,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction) => ({
      x: direction > 0 ? -slideDistance : slideDistance,
      opacity: 0
    })
  }

  return (
    <motion.div 
      className="homepage"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5, ease: 'easeOut' }}
    >
      <RobotWidget message={sections[currentIndex].message} sectionId={currentIndex} />
      <ConnectWallet />
      
      <div className="carousel-container">
        <button 
          className="carousel-arrow carousel-arrow-left"
          onClick={goToPrevious}
          aria-label="Previous section"
        >
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path 
              d="M25 10 L15 20 L25 30" 
              stroke="currentColor" 
              strokeWidth="3" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div 
          className="carousel-wrapper"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentIndex}
              custom={direction}
              className="carousel-slide"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 30,
                mass: 0.8
              }}
            >
              {sections[currentIndex].component}
            </motion.div>
          </AnimatePresence>
        </div>

        <button 
          className="carousel-arrow carousel-arrow-right"
          onClick={goToNext}
          aria-label="Next section"
        >
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path 
              d="M15 10 L25 20 L15 30" 
              stroke="currentColor" 
              strokeWidth="3" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="carousel-indicators">
        {sections.map((_, index) => (
          <button
            key={index}
            className={`indicator ${index === currentIndex ? 'active' : ''}`}
            onClick={() => goToIndex(index)}
            aria-label={`Go to ${sections[index].title}`}
          />
        ))}
      </div>
    </motion.div>
  )
}

export default HomePage
