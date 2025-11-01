import { useState, useRef, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import './HomePage.css'
import HopiumFarming from './sections/HopiumFarming'
import PerpFarming from './sections/PerpFarming'
import AirdropAlpha from './sections/AirdropAlpha'
import RobotWidget from './RobotWidget'
import ConnectWallet from './ConnectWallet'

function HomePage() {
  const [currentIndex, setCurrentIndex] = useState(0) // Start with PerpFarming
  const [direction, setDirection] = useState(0)
  const [slideDistance, setSlideDistance] = useState(300)
  const [isInitialMount, setIsInitialMount] = useState(true)
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
  
  // Create section components once and keep them mounted
  const sectionComponents = useMemo(() => [
    <PerpFarming key="perp" />,
    <HopiumFarming key="hopium" isActive={currentIndex === 1} />,
    <AirdropAlpha key="airdrop" onNavigateToHopium={() => goToIndex(1)} />
  ], [currentIndex])
  
  const sections = [
    { id: 0, title: 'Perp Farming', message: 'Analyzing perpetual funding rates across exchanges...' },
    { id: 1, title: 'HOPIUM Farming', message: 'Complete tasks to earn HOPIUM tokens and climb the leaderboard...' },
    { id: 2, title: 'Airdrop Alpha', message: 'Scanning for high-value airdrop opportunities...' }
  ]

  const minSwipeDistance = 50

  const goToNext = () => {
    setIsInitialMount(false)
    setDirection(1)
    setCurrentIndex((prev) => (prev + 1) % sections.length)
  }

  const goToPrevious = () => {
    setIsInitialMount(false)
    setDirection(-1)
    setCurrentIndex((prev) => (prev - 1 + sections.length) % sections.length)
  }

  const goToIndex = (index) => {
    setIsInitialMount(false)
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
      x: direction > 0 ? -slideDistance : slideDistance,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction) => ({
      x: direction > 0 ? slideDistance : -slideDistance,
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
          {sectionComponents.map((component, index) => {
            const isActive = index === currentIndex
            const slideDirection = currentIndex > index ? -1 : 1
            
            return (
              <motion.div
                key={index}
                custom={isActive ? direction : slideDirection}
                className={`carousel-slide ${isActive ? 'active' : ''}`}
                variants={slideVariants}
                initial={isActive && isInitialMount ? "center" : (isActive ? "enter" : "exit")}
                animate={isActive ? "center" : "exit"}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 30,
                  mass: 0.8
                }}
                style={{
                  pointerEvents: isActive ? 'auto' : 'none',
                  zIndex: isActive ? 10 : 1
                }}
              >
                {component}
              </motion.div>
            )
          })}
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
