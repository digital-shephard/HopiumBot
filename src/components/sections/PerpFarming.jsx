import './PerpFarming.css'
import asterLogo from '../../assets/aster_logo.png'

function PerpFarming() {
  // Generate random angles and properties for more organic distribution
  const generateRandomLine = () => {
    const angle = Math.random() * 360;
    const delay = Math.random() * 2;
    const distance = 60 + Math.random() * 20; // Vary starting distance
    const duration = 3 + Math.random() * 2; // Vary animation speed
    const length = 300 + Math.random() * 200; // Vary line length
    
    return { angle, delay, distance, duration, length };
  };

  const lines = Array.from({ length: 60 }, generateRandomLine);

  return (
    <div className="section perp-farming">
      <div className="light-lines-container">
        {lines.map((line, i) => (
          <div 
            key={i} 
            className="light-line"
            style={{
              '--angle': `${line.angle}deg`,
              '--delay': `${line.delay}s`,
              '--distance': `${line.distance}vh`,
              '--duration': `${line.duration}s`,
              '--length': `${line.length}px`
            }}
          />
        ))}
      </div>
      
      <div className="section-content">
        <h1 className="section-title">Perp Farming</h1>
        <p className="section-description">
          Advanced perpetual farming strategies for maximum yield
        </p>
        
        <div className="aster-circle-container">
          <div className="aster-circle">
            <div className="aster-placeholder">
              <img src={asterLogo} alt="Aster Logo" className="logo-image" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PerpFarming
