import { useState, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { useAuth } from '../../contexts/AuthContext'
import API_CONFIG from '../../config/api'
import './HopiumFarming.css'

function HopiumFarming({ isActive = false }) {
  const { address, isConnected } = useAccount()
  const { open } = useAppKit()
  const { isAuthenticated } = useAuth()

  const [tasks, setTasks] = useState([
    {
      id: 'JOIN_DISCORD',
      name: 'Join Discord',
      description: 'Connect your Discord account and join our server',
      completed: false,
      points: 500,
      taskType: 'JOIN_DISCORD'
    }
  ])

  const [userPoints, setUserPoints] = useState(0)
  const [displayPoints, setDisplayPoints] = useState(0)
  const [referralCode, setReferralCode] = useState('')
  const [friendReferralCode, setFriendReferralCode] = useState('')
  const [showReferralModal, setShowReferralModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [hasAnimated, setHasAnimated] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [userRank, setUserRank] = useState(null)
  const [referralStats, setReferralStats] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [isPolling, setIsPolling] = useState(false)
  const animationRef = useRef(null)
  const displayPointsRef = useRef(0)
  const sectionRef = useRef(null)
  const previousTasksRef = useRef(new Set())

  const formatPoints = (points) => {
    return points.toString().padStart(6, '0')
  }

  // Register user or load profile when wallet connects OR section becomes active
  useEffect(() => {
    if (!isConnected || !address) {
      // Reset state when disconnected
      setUserPoints(0)
      setReferralCode('')
      setTasks(prevTasks => prevTasks.map(t => ({ ...t, completed: false })))
      setReferralStats(null)
      setUserRank(null)
      setError(null)
      return
    }

    if (!isAuthenticated) {
      // Wallet connected but not authenticated
      setError('Please verify wallet ownership to access features. Sign the authentication message in your wallet.')
      return
    }

    // Load user data and leaderboard when:
    // 1. Wallet is already connected and authenticated
    // 2. User authenticates while on this section
    // 3. Section becomes active after authentication
    if (isActive) {
      setError(null) // Clear any previous errors
      registerOrLoadUser()
      loadLeaderboard()
    }
  }, [isConnected, address, isActive, isAuthenticated])

  // Load leaderboard when section becomes active (public endpoint, no auth needed)
  useEffect(() => {
    if (isActive) {
      loadLeaderboard()
    }
  }, [isActive])

  // Poll for task completion updates (only when section is active and authenticated)
  useEffect(() => {
    if (!isActive || !isConnected || !address || !isAuthenticated) {
      setIsPolling(false)
      return
    }

    setIsPolling(true)

    // Poll every 5 seconds to check for task completion
    const pollInterval = setInterval(() => {
      console.log('[HopiumFarming] Polling for task updates...')
      registerOrLoadUser()
      loadLeaderboard()
    }, 5000)

    return () => {
      console.log('[HopiumFarming] Stopping task polling')
      setIsPolling(false)
      clearInterval(pollInterval)
    }
  }, [isActive, isConnected, address, isAuthenticated])

  // Register user or load existing profile
  const registerOrLoadUser = async () => {
    if (!address) return

    try {
      setLoading(true)
      setError(null)

      // Try to get user profile first
      let userProfile
      try {
        userProfile = await API_CONFIG.fetch(API_CONFIG.endpoints.tasks.userProfile(address))
      } catch (err) {
        // User doesn't exist, register them
        if (err.message.includes('404') || err.message.includes('not found')) {
          const registerResponse = await API_CONFIG.fetch(
            API_CONFIG.endpoints.tasks.register,
            {
              method: 'POST',
              body: JSON.stringify({ wallet_address: address })
            }
          )
          
          // Load profile after registration
          userProfile = await API_CONFIG.fetch(API_CONFIG.endpoints.tasks.userProfile(address))
        } else {
          throw err
        }
      }

      // Update state with user data
      if (userProfile) {
        const newPoints = userProfile.user.total_points || 0
        const oldPoints = userPoints
        
        setUserPoints(newPoints)
        setReferralCode(userProfile.user.referral_code || '')
        
        // Update task completion status
        const completedTaskTypes = new Set(
          userProfile.completed_tasks?.map(t => t.task_type) || []
        )
        
        // Check for newly completed tasks
        const newlyCompleted = Array.from(completedTaskTypes).filter(
          taskType => !previousTasksRef.current.has(taskType)
        )
        
        // Show success message for newly completed tasks
        if (newlyCompleted.length > 0) {
          const pointsEarned = newPoints - oldPoints
          newlyCompleted.forEach(taskType => {
            if (taskType === 'JOIN_DISCORD') {
              setSuccessMessage(`🎉 Discord connected! +${pointsEarned} points earned!`)
              setTimeout(() => setSuccessMessage(null), 5000)
            }
          })
        } else if (newPoints > oldPoints && oldPoints > 0) {
          // Points increased but no new tasks - likely referral points
          const pointsEarned = newPoints - oldPoints
          setSuccessMessage(`🎁 Someone used your referral code! +${pointsEarned} points!`)
          setTimeout(() => setSuccessMessage(null), 5000)
        }
        
        // Update previous tasks ref
        previousTasksRef.current = completedTaskTypes
        
        setTasks(prevTasks => 
          prevTasks.map(task => ({
            ...task,
            completed: completedTaskTypes.has(task.taskType)
          }))
        )

        // Set referral stats
        setReferralStats(userProfile.referral_stats)

        // Load user rank
        try {
          const rankData = await API_CONFIG.fetch(API_CONFIG.endpoints.tasks.userRank(address))
          setUserRank(rankData)
        } catch (err) {
          console.error('Failed to load user rank:', err)
        }
      }
    } catch (err) {
      console.error('Failed to register/load user:', err)
      
      // Check if it's an authentication error (HTTP 401/403)
      if (err.message.includes('HTTP 401') || err.message.includes('HTTP 403') || 
          err.message.toLowerCase().includes('unauthorized') || 
          err.message.toLowerCase().includes('authentication')) {
        setError('Please verify wallet ownership to access features. Sign the authentication message in your wallet.')
      } else {
        setError('Failed to load user profile. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Load leaderboard (public endpoint, no auth required)
  const loadLeaderboard = async () => {
    try {
      const data = await API_CONFIG.fetch(
        API_CONFIG.endpoints.tasks.leaderboard(10, 0),
        { includeAuth: false } // Public endpoint
      )
      setLeaderboard(data.entries || [])
    } catch (err) {
      console.error('Failed to load leaderboard:', err)
    }
  }

  // Trigger animation when section becomes active
  useEffect(() => {
    if (!isActive || !isConnected) {
      if (!isConnected) {
        setDisplayPoints(0)
        displayPointsRef.current = 0
      }
      setHasAnimated(false)
      setIsVisible(false)
      return
    }

    // Section is now active - trigger animation
    setIsVisible(true)
    
    // Clear any existing animation
    if (animationRef.current) {
      clearTimeout(animationRef.current)
      animationRef.current = null
    }
    
    // Reset animation state to trigger new animation
    setHasAnimated(false)
    setDisplayPoints(0)
    displayPointsRef.current = 0
    
    // Small delay to ensure state is reset before starting animation
    const startAnimation = () => {
      setHasAnimated(true)
      
      // Capture current userPoints value
      const targetPoints = userPoints
      
      // Random number animation effect
      const duration = 1500 // 1.5 seconds
      const steps = 30
      const stepDuration = duration / steps
      let currentStep = 0
      
      const animate = () => {
        if (currentStep < steps) {
          // Generate random numbers during animation
          const randomPoints = Math.floor(Math.random() * 999999)
          setDisplayPoints(randomPoints)
          displayPointsRef.current = randomPoints
          currentStep++
          animationRef.current = setTimeout(animate, stepDuration)
        } else {
          // End animation at actual points value (or 0 if points are 0)
          setDisplayPoints(targetPoints)
          displayPointsRef.current = targetPoints
        }
      }
      
      animate()
    }
    
    // Small delay to ensure state reset completes
    const timeoutId = setTimeout(startAnimation, 100)
    
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current)
        animationRef.current = null
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [isActive, isConnected, userPoints])

  // Animate points when userPoints changes (only if section is visible and already animated)
  useEffect(() => {
    if (!isConnected || !hasAnimated || !isVisible) return
    
    const startValue = displayPointsRef.current
    const endValue = userPoints
    const difference = endValue - startValue
    
    if (difference === 0) return
    
    // Clear any existing animation
    if (animationRef.current) {
      clearTimeout(animationRef.current)
    }
    
    const duration = 800
    const steps = 20
    const stepDuration = duration / steps
    let currentStep = 0
    
    const animate = () => {
      if (currentStep < steps) {
        const progress = currentStep / steps
        // Easing function for smooth animation
        const easeOut = 1 - Math.pow(1 - progress, 3)
        const currentValue = Math.floor(startValue + (difference * easeOut))
        setDisplayPoints(currentValue)
        displayPointsRef.current = currentValue
        currentStep++
        animationRef.current = setTimeout(animate, stepDuration)
      } else {
        setDisplayPoints(endValue)
        displayPointsRef.current = endValue
      }
    }
    
    animate()
    
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current)
      }
    }
  }, [userPoints, isConnected, hasAnimated, isVisible])

  const handleTaskClick = async (taskId) => {
    if (!isConnected) {
      await open()
      return
    }

    // Handle different task types
    switch (taskId) {
      case 'JOIN_DISCORD':
        await handleDiscordConnect()
        break
      default:
        break
    }
  }

  // Handle Discord OAuth connection
  const handleDiscordConnect = async () => {
    if (!address) return

    try {
      setLoading(true)
      setError(null)

      // Get Discord OAuth URL
      const authData = await API_CONFIG.fetch(API_CONFIG.endpoints.tasks.discordAuth(address))
      
      if (authData.auth_url) {
        // Open Discord OAuth in new tab
        window.open(authData.auth_url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      console.error('Failed to initiate Discord OAuth:', err)
      
      // Check if it's an authentication error (HTTP 401/403)
      if (err.message.includes('HTTP 401') || err.message.includes('HTTP 403') || 
          err.message.toLowerCase().includes('unauthorized') || 
          err.message.toLowerCase().includes('authentication')) {
        setError('Please verify wallet ownership to access features. Sign the authentication message in your wallet.')
      } else {
        setError('Failed to connect Discord. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleShowReferralModal = () => {
    if (!isConnected) {
      open()
      return
    }
    setShowReferralModal(true)
  }

  const handleCopyReferralCode = async () => {
    if (!referralCode) return
    
    try {
      await navigator.clipboard.writeText(referralCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy referral code:', error)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = referralCode
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Fallback copy failed:', err)
      }
      document.body.removeChild(textArea)
    }
  }

  const handleSubmitFriendReferral = async () => {
    if (!friendReferralCode.trim() || !address) {
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await API_CONFIG.fetch(
        API_CONFIG.endpoints.tasks.enterReferral,
        {
          method: 'POST',
          body: JSON.stringify({
            wallet_address: address,
            referral_code: friendReferralCode
          })
        }
      )

      if (response.success) {
        alert('Referral code accepted! Complete Discord task to give your friend points.')
        setFriendReferralCode('')
        setShowReferralModal(false)
        
        // Reload user profile
        await registerOrLoadUser()
      }
    } catch (err) {
      console.error('Failed to submit referral code:', err)
      
      // Check if it's an authentication error (HTTP 401/403)
      if (err.message.includes('HTTP 401') || err.message.includes('HTTP 403') || 
          err.message.toLowerCase().includes('unauthorized') || 
          err.message.toLowerCase().includes('authentication')) {
        setError('Please verify wallet ownership to access features. Sign the authentication message in your wallet.')
      } else {
        setError(err.message || 'Failed to submit referral code. Please check the code and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleConnectWallet = async () => {
    await open()
  }

  const formatAddress = (addr) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <div className="section hopium-farming" ref={sectionRef}>
      <div className="section-content">
        <h1 className="section-title">HOPIUM Farming</h1>
        <p className="section-description">
          Complete tasks to earn HOPIUM tokens and climb the leaderboard
        </p>

        {!isConnected ? (
          <div className="wallet-prompt">
            <div className="wallet-prompt-icon">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none">
                <path 
                  d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                <path 
                  d="M12 8V12M12 16H12.01" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="wallet-prompt-text">
              Connect your wallet to start farming HOPIUM tokens
            </p>
            <button 
              className="connect-wallet-button"
              onClick={handleConnectWallet}
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            {/* Points Tracker */}
            <div className="points-tracker">
              <div className="points-label">
                Your Points
                {isPolling && (
                  <span className="polling-indicator" title="Auto-checking for updates">
                    <span className="polling-dot"></span>
                  </span>
                )}
              </div>
              <div className="points-value">{formatPoints(displayPoints)}</div>
              {userRank && (
                <div className="points-rank">
                  Rank #{userRank.rank} of {userRank.total_users}
                </div>
              )}
            </div>

            {/* Referral Stats */}
            {referralStats && referralStats.total_referrals > 0 && (
              <div className="referral-stats">
                <h3 className="referral-stats-title">Your Referrals</h3>
                <div className="referral-stats-grid">
                  <div className="referral-stat">
                    <div className="referral-stat-value">{referralStats.total_referrals}</div>
                    <div className="referral-stat-label">Total Referrals</div>
                  </div>
                  <div className="referral-stat">
                    <div className="referral-stat-value">{referralStats.completed_referrals}</div>
                    <div className="referral-stat-label">Completed</div>
                  </div>
                  <div className="referral-stat">
                    <div className="referral-stat-value">{referralStats.total_referral_points}</div>
                    <div className="referral-stat-label">Referral Points</div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="error-message">{error}</div>
            )}

            {successMessage && (
              <div className="success-message">{successMessage}</div>
            )}

            {/* Tasks Section */}
            <div className="tasks-section">
              <h2 className="tasks-title">Available Tasks</h2>
              <div className="tasks-grid">
                {tasks.map((task) => (
                  <div 
                    key={task.id} 
                    className={`task-card ${task.completed ? 'completed' : ''} ${loading ? 'disabled' : ''}`}
                    onClick={() => !task.completed && !loading && handleTaskClick(task.id)}
                  >
                    <div className="task-icon">
                      {task.completed ? (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                          <path 
                            d="M20 6L9 17L4 12" 
                            stroke="currentColor" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                          <circle 
                            cx="12" 
                            cy="12" 
                            r="10" 
                            stroke="currentColor" 
                            strokeWidth="2"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="task-info">
                      <h3 className="task-name">{task.name}</h3>
                      <p className="task-description">{task.description}</p>
                      <div className="task-points">+{task.points} points</div>
                    </div>
                  </div>
                ))}
                
                {/* Referral Task Card */}
                <div 
                  className="task-card referral-card"
                  onClick={handleShowReferralModal}
                >
                  <div className="task-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                      <path 
                        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      />
                      <circle 
                        cx="9" 
                        cy="7" 
                        r="4" 
                        stroke="currentColor" 
                        strokeWidth="2"
                      />
                      <path 
                        d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="task-info">
                    <h3 className="task-name">Refer Friends</h3>
                    <p className="task-description">Invite friends and earn 1000 points per completed referral</p>
                    <div className="task-points">+1000 points each</div>
                  </div>
                </div>
              </div>
            </div>

          </>
        )}

        {/* Leaderboard Section - Always visible */}
        <div className="leaderboard-section">
          <h2 className="leaderboard-title">Leaderboard</h2>
          <div className="leaderboard-container">
            <div className="leaderboard-header">
              <span className="leaderboard-rank">Rank</span>
              <span className="leaderboard-address">Address</span>
              <span className="leaderboard-points">Points</span>
            </div>
            <div className="leaderboard-list">
              {leaderboard.length > 0 ? (
                leaderboard.map((entry) => (
                  <div 
                    key={entry.rank} 
                    className={`leaderboard-entry ${entry.wallet_address?.toLowerCase() === address?.toLowerCase() ? 'your-entry' : ''}`}
                  >
                    <span className="leaderboard-rank">#{entry.rank}</span>
                    <span className="leaderboard-address">{formatAddress(entry.wallet_address)}</span>
                    <span className="leaderboard-points">{entry.total_points?.toLocaleString() || 0}</span>
                  </div>
                ))
              ) : (
                <div className="leaderboard-empty">
                  {!isConnected || !isAuthenticated ? (
                    <p>Connect wallet and sign in to view Leaderboard</p>
                  ) : (
                    <p>No entries yet. Be the first!</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Referral Modal */}
      {showReferralModal && (
        <div className="referral-modal-overlay" onClick={() => setShowReferralModal(false)}>
          <div className="referral-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              className="referral-modal-close" 
              onClick={() => setShowReferralModal(false)}
            >
              ×
            </button>
            <h2 className="referral-modal-title">Referral Program</h2>
            <div className="referral-modal-content">
              <div className="referral-section">
                <h3 className="referral-section-title">Your Referral Code</h3>
                <div className="referral-code-display">
                  {referralCode ? (
                    <div className="referral-code-container">
                      <div className="referral-code-value">{referralCode}</div>
                      <button 
                        className={`copy-referral-button ${copied ? 'copied' : ''}`}
                        onClick={handleCopyReferralCode}
                        title="Copy referral code"
                      >
                        {copied ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path 
                              d="M20 6L9 17L4 12" 
                              stroke="currentColor" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <rect 
                              x="9" 
                              y="9" 
                              width="13" 
                              height="13" 
                              rx="2" 
                              ry="2" 
                              stroke="currentColor" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                            />
                            <path 
                              d="M5 15H4C2.89543 15 2 14.1046 2 13V4C2 2.89543 2.89543 2 4 2H13C14.1046 2 15 2.89543 15 4V5" 
                              stroke="currentColor" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="referral-loading">Loading...</div>
                  )}
                </div>
                <p className="referral-code-hint">
                  Share this code with friends. You earn 1000 points when they join Discord!
                </p>
                {referralStats && (
                  <div className="referral-stats-mini">
                    <p>Total Referrals: {referralStats.total_referrals}</p>
                    <p>Completed: {referralStats.completed_referrals}</p>
                    <p>Points Earned: {referralStats.total_referral_points}</p>
                  </div>
                )}
              </div>

              <div className="referral-section">
                <h3 className="referral-section-title">Have a Referral Code?</h3>
                <input
                  type="text"
                  className="referral-code-input"
                  placeholder="Enter friend's referral code"
                  value={friendReferralCode}
                  onChange={(e) => setFriendReferralCode(e.target.value.toUpperCase())}
                  maxLength={10}
                  disabled={loading}
                />
                <button 
                  className="submit-referral-button"
                  onClick={handleSubmitFriendReferral}
                  disabled={!friendReferralCode.trim() || loading}
                >
                  {loading ? 'Submitting...' : 'Submit'}
                </button>
                {error && <p className="referral-error">{error}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HopiumFarming

