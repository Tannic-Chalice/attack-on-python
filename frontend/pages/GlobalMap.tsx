import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'

// FIX 1: Explicitly import default to ensure Ref forwarding works correctly
const Globe = dynamic(() => import('react-globe.gl').then(mod => mod.default), { ssr: false })

// --- MOCK DATA ---
const COUNTRIES = [
  { name: 'USA', lat: 37.0902, lng: -95.7129, risk: 0.2 },
  { name: 'China', lat: 35.8617, lng: 104.1954, risk: 0.6 },
  { name: 'Russia', lat: 61.5240, lng: 105.3188, risk: 0.8 },
  { name: 'Brazil', lat: -14.2350, lng: -51.9253, risk: 0.5 },
  { name: 'UK', lat: 55.3781, lng: -3.4360, risk: 0.3 },
  { name: 'India', lat: 20.5937, lng: 78.9629, risk: 0.4 },
  { name: 'Nigeria', lat: 9.0820, lng: 8.6753, risk: 0.9 },
  { name: 'Germany', lat: 51.1657, lng: 10.4515, risk: 0.2 },
]

export default function GlobalMap() {
  const router = useRouter()
  const globeEl = useRef<any>(null)
  const [arcs, setArcs] = useState<any[]>([])
  const [points, setPoints] = useState<any[]>([])
  const [hexBinPoints, setHexBinPoints] = useState<any[]>([])
  const [stats, setStats] = useState({ total_vol: 0, active_threats: 0, cross_border: 0 })
  const [isReady, setIsReady] = useState(false)

  // --- SAFETY VALVE: Force loading screen to hide after 3 seconds ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 3000); 
    return () => clearTimeout(timer);
  }, []);

  // --- TRAFFIC GENERATOR ---
  useEffect(() => {
    const newPoints = Array.from({ length: 50 }).map((_, i) => {
      const country = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)]
      return {
        id: i,
        lat: country.lat + (Math.random() - 0.5) * 10,
        lng: country.lng + (Math.random() - 0.5) * 10,
        size: Math.random(),
        color: Math.random() > 0.8 ? '#ef4444' : '#10b981',
        name: `Node-${i} (${country.name})`
      }
    })
    setPoints(newPoints)
    setHexBinPoints(newPoints)

    const interval = setInterval(() => {
      setArcs(prev => {
        const active = prev.filter(d => d.expiry > Date.now())
        if (active.length < 20) {
            const src = newPoints[Math.floor(Math.random() * newPoints.length)]
            const dst = newPoints[Math.floor(Math.random() * newPoints.length)]
            if (src.id !== dst.id) {
                const isFraud = src.color === '#ef4444' || dst.color === '#ef4444'
                active.push({
                    startLat: src.lat,
                    startLng: src.lng,
                    endLat: dst.lat,
                    endLng: dst.lng,
                    color: isFraud ? ['#ef4444', '#ef4444'] : ['#10b981', '#3b82f6'],
                    expiry: Date.now() + 2000,
                    dashAnimateTime: isFraud ? 500 : 1500,
                    altitude: isFraud ? 0.5 : 0.2
                })
                setStats(s => ({
                    total_vol: s.total_vol + Math.floor(Math.random() * 1000),
                    active_threats: s.active_threats + (isFraud ? 1 : 0),
                    cross_border: s.cross_border + 1
                }))
            }
        }
        return active
      })
    }, 300)
    return () => clearInterval(interval)
  }, [])

  // --- SAFE ZOOM FUNCTION ---
  const handleZoom = (lat: number, lng: number) => {
    if (globeEl.current && typeof globeEl.current.pointOfView === 'function') {
      globeEl.current.pointOfView({ lat, lng, altitude: 2 }, 1000)
    }
  }

  const handleToggleRotation = () => {
    if (globeEl.current) {
      const controls = globeEl.current.controls && globeEl.current.controls()
      if (controls) controls.autoRotate = !controls.autoRotate
    }
  }

  return (
    <div className="page-wrapper">
      <Head><title>Geo-Spatial War Room | FraudGuard</title></Head>

      <style jsx global>{`
        body { margin: 0; background: #000; overflow: hidden; font-family: 'Inter', sans-serif; color: white; }
        .page-wrapper { position: relative; width: 100vw; height: 100vh; }
        
        .hud-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; }
        .header { position: absolute; top: 20px; left: 20px; pointer-events: auto; }
        .back-btn { background: rgba(0,0,0,0.6); border: 1px solid #333; color: #fff; padding: 8px 16px; cursor: pointer; border-radius: 4px; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
        .back-btn:hover { border-color: #3b82f6; color: #3b82f6; }
        .title-box { margin-top: 20px; background: rgba(0,0,0,0.8); padding: 20px; border-left: 4px solid #ef4444; backdrop-filter: blur(4px); }
        h1 { margin: 0; font-size: 1.8rem; text-transform: uppercase; letter-spacing: 2px; }
        .subtitle { color: #9ca3af; font-size: 0.9rem; margin-top: 5px; }

        .stats-panel { position: absolute; right: 20px; top: 20px; width: 250px; display: flex; flex-direction: column; gap: 10px; }
        .stat-card { background: rgba(0,0,0,0.8); border: 1px solid #333; padding: 15px; border-radius: 4px; pointer-events: auto; }
        .stat-label { font-size: 0.8rem; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; }
        .stat-value { font-size: 1.5rem; font-weight: bold; font-family: monospace; color: #10b981; }
        .stat-value.danger { color: #ef4444; text-shadow: 0 0 10px #ef4444; }

        .controls { position: absolute; bottom: 60px; right: 20px; pointer-events: auto; display: flex; gap: 10px; }
        .ctrl-btn { width: 40px; height: 40px; background: #222; border: 1px solid #444; color: white; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
        .ctrl-btn:hover { background: #333; border-color: #fff; }

        .ticker-bar { position: absolute; bottom: 0; width: 100%; background: rgba(0,0,0,0.9); border-top: 1px solid #333; padding: 10px; display: flex; justify-content: center; gap: 30px; font-family: monospace; font-size: 0.9rem; }
        .ticker-item { display: flex; gap: 10px; align-items: center; }
        .blink { animation: blinker 1.5s linear infinite; color: #ef4444; }
        @keyframes blinker { 50% { opacity: 0; } }

        /* LOADING LAYER */
        .loading-overlay { 
          position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
          background: black; z-index: 20; 
          display: flex; align-items: center; justify-content: center; 
          color: #3b82f6; transition: opacity 0.8s ease; opacity: 1; pointer-events: auto; 
        }
        .loading-overlay.hidden { opacity: 0; pointer-events: none; }
      `}</style>

      {/* Loading Screen */}
      <div className={`loading-overlay ${isReady ? 'hidden' : ''}`}>
        <h3>Initializing Satellite Uplink...</h3>
      </div>

      <Globe
        ref={globeEl}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        
        arcsData={arcs}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor="color"
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={d => (d as any).dashAnimateTime}
        arcAltitude={d => (d as any).altitude}
        arcStroke={0.5}

        hexBinPointsData={hexBinPoints}
        hexBinPointWeight="size"
        hexAltitude={d => d.sumWeight * 0.05}
        hexTopColor={d => d.sumWeight > 2 ? '#ef4444' : '#3b82f6'}
        hexSideColor={() => 'rgba(0,0,0,0.5)'}
        hexLabel={d => ` Risk Cluster: ${d.sumWeight} Active Nodes`}

        atmosphereColor="#3b82f6"
        atmosphereAltitude={0.15}
        
        onGlobeReady={() => {
            // Try to auto-start rotation if possible
            if (globeEl.current) {
                try {
                    const controls = globeEl.current.controls()
                    if(controls) {
                        controls.autoRotate = true;
                        controls.autoRotateSpeed = 0.6;
                    }
                } catch(e) {}
            }
        }}
      />

      <div className="hud-overlay">
        <div className="header">
            <button className="back-btn" onClick={() => router.push('/')}>
                ← RETURN TO COMMAND
            </button>
            <div className="title-box">
                <h1>Global Threat Map</h1>
                <div className="subtitle">Real-time Cross-Border Fraud Monitoring</div>
            </div>
        </div>

        <div className="stats-panel">
            <div className="stat-card">
                <div className="stat-label">Live Transaction Vol</div>
                <div className="stat-value">${stats.total_vol.toLocaleString()}</div>
            </div>
            <div className="stat-card">
                <div className="stat-label">Active Threats</div>
                <div className="stat-value danger">{stats.active_threats}</div>
            </div>
            <div className="stat-card">
                <div className="stat-label">Cross-Border Events</div>
                <div className="stat-value">{stats.cross_border}</div>
            </div>
        </div>

        <div className="controls">
            <button className="ctrl-btn" title="Toggle Rotation" onClick={handleToggleRotation}>🔄</button>
            <button className="ctrl-btn" title="Zoom to Asia" onClick={() => handleZoom(20, 100)}>🌏</button>
            <button className="ctrl-btn" title="Zoom to USA" onClick={() => handleZoom(40, -100)}>🌎</button>
        </div>

        <div className="ticker-bar">
            <div className="ticker-item"><span className="blink">●</span> LIVE FEED</div>
            <div className="ticker-item">Scanning 12 Global Regions...</div>
            <div className="ticker-item" style={{color: '#f59e0b'}}>⚠ High Latency detected in APAC Region</div>
            <div className="ticker-item" style={{color: '#ef4444'}}>⚠ IP Spoofing Cluster detected in Lagos, NG</div>
        </div>
      </div>
    </div>
  )
}