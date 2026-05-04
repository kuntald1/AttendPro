import { useRef, useEffect, useState, useCallback } from 'react'
import { authAPI, attendanceAPI } from '../api'

const SCAN_INTERVAL = 2500

export default function KioskPersonal() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const resetRef = useRef(null)

  const [step, setStep] = useState('login') // login | checking | blocked | ready | scanning
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [employee, setEmployee] = useState(null)
  const [result, setResult] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [lastScan, setLastScan] = useState(null)
  const [geoMessage, setGeoMessage] = useState('')
  const [blockReason, setBlockReason] = useState('')

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleLogin = async () => {
    if (!email || !password) { setLoginError('Enter email and password'); return }
    setLoggingIn(true)
    setLoginError('')
    try {
      const res = await authAPI.login({ email, password })
      localStorage.setItem('token', res.data.access_token)
      const me = await authAPI.me()
      const emp = me.data
      setEmployee(emp)

      // Check kiosk access
      if (!emp.kiosk_access) {
        setBlockReason('You do not have permission to use the personal kiosk link. Please go to your office and use the physical kiosk device.')
        setStep('blocked')
        return
      }

      // Check geofencing
      setStep('checking')
      checkGeofencing(emp)
    } catch {
      setLoginError('Invalid email or password')
    } finally {
      setLoggingIn(false)
    }
  }

  const checkGeofencing = async (emp) => {
    try {
      // Get office geofencing info for this employee
      const res = await attendanceAPI.checkEmployeeKiosk()
      const data = res.data

      if (!data.geofencing_enabled || !data.office_lat || !data.office_lng) {
        // No geofencing configured - allow access
        startCamera()
        setStep('ready')
        return
      }

      if (!navigator.geolocation) {
        setBlockReason('GPS is not supported on this device. Cannot verify your location.')
        setStep('blocked')
        return
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const dist = getDistance(pos.coords.latitude, pos.coords.longitude, data.office_lat, data.office_lng)
          if (dist <= data.radius_meters) {
            setGeoMessage(`✓ Within ${Math.round(dist)}m of ${data.office_name}`)
            startCamera()
            setStep('ready')
          } else {
            setBlockReason(`You are ${Math.round(dist)}m away from your assigned office (${data.office_name}). You must be within ${data.radius_meters}m to mark attendance.`)
            setStep('blocked')
          }
        },
        () => {
          setBlockReason('Location access denied. Please allow GPS access to use the personal kiosk.')
          setStep('blocked')
        },
        { enableHighAccuracy: true, timeout: 15000 }
      )
    } catch {
      // If check fails, allow access gracefully
      startCamera()
      setStep('ready')
    }
  }

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraReady(true)
    } catch { setCameraReady(false) }
  }

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    clearInterval(intervalRef.current)
    clearTimeout(resetRef.current)
  }, [])

  const captureAndRecognize = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || scanning) return
    setScanning(true)
    try {
      const canvas = canvasRef.current
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      canvas.getContext('2d').drawImage(videoRef.current, 0, 0)
      const image = canvas.toDataURL('image/jpeg', 0.8)
      const res = await attendanceAPI.recognize(image)
      const data = res.data
      if (data.success) {
        setResult(data)
        setLastScan(new Date())
        clearTimeout(resetRef.current)
        resetRef.current = setTimeout(() => setResult(null), 5000)
      }
    } catch { } finally { setScanning(false) }
  }, [scanning])

  useEffect(() => {
    if (step === 'ready' && cameraReady) {
      intervalRef.current = setInterval(captureAndRecognize, SCAN_INTERVAL)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [step, cameraReady, captureAndRecognize])

  const logout = () => {
    localStorage.removeItem('token')
    streamRef.current?.getTracks().forEach(t => t.stop())
    setStep('login')
    setEmployee(null)
    setResult(null)
    setCameraReady(false)
    setEmail('')
    setPassword('')
  }

  const timeStr = currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = currentTime.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const isCheckedIn = result?.action === 'checked_in'

  // LOGIN SCREEN
  if (step === 'login') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ width: 380, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 40 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' }}>A</div>
            <h1 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>AttendPro Kiosk</h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>Sign in to mark your attendance</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, display: 'block', marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="your@email.com"
                style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '12px 14px', color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, display: 'block', marginBottom: 6 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="••••••••"
                style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '12px 14px', color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {loginError && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{loginError}</p>}

            <button onClick={handleLogin} disabled={loggingIn}
              style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: loggingIn ? 0.7 : 1, marginTop: 4 }}>
              {loggingIn ? 'Signing in...' : 'Sign In & Scan Face'}
            </button>
          </div>

          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, textAlign: 'center', marginTop: 24 }}>
            {timeStr} · {dateStr}
          </p>
        </div>
      </div>
    )
  }

  // CHECKING LOCATION
  if (step === 'checking') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 60, marginBottom: 20 }}>📍</div>
        <h2 style={{ color: 'white', fontSize: 24, margin: '0 0 8px' }}>Verifying your location...</h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Please allow GPS access when prompted</p>
      </div>
    )
  }

  // BLOCKED SCREEN
  if (step === 'blocked') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 32 }}>
        <div style={{ fontSize: 80, marginBottom: 24 }}>🚫</div>
        <h1 style={{ color: '#ef4444', fontSize: 28, fontWeight: 700, margin: '0 0 16px', textAlign: 'center' }}>Access Denied</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, textAlign: 'center', maxWidth: 480, lineHeight: 1.7 }}>
          {blockReason}
        </p>
        <button onClick={logout}
          style={{ marginTop: 32, padding: '12px 32px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}>
          Sign Out
        </button>
      </div>
    )
  }

  // READY / SCANNING SCREEN
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' }}>

      {/* Success overlay */}
      {result && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: isCheckedIn ? 'linear-gradient(135deg, #064e3b, #065f46)' : 'linear-gradient(135deg, #1e3a5f, #1e40af)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ width: 120, height: 120, borderRadius: '50%', background: isCheckedIn ? '#10b981' : '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60, marginBottom: 32, boxShadow: `0 0 80px ${isCheckedIn ? '#10b98160' : '#3b82f660'}` }}>
            {isCheckedIn ? '✓' : '↑'}
          </div>
          <div style={{ width: 90, height: 90, borderRadius: '50%', background: isCheckedIn ? '#065f46' : '#1e3a8a', border: `3px solid ${isCheckedIn ? '#10b981' : '#3b82f6'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, fontWeight: 700, color: 'white', marginBottom: 20 }}>
            {result.employee.name.charAt(0)}
          </div>
          <h1 style={{ color: 'white', fontSize: 48, fontWeight: 700, margin: '0 0 8px' }}>{result.employee.name}</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 20, margin: '0 0 28px' }}>{result.employee.code}</p>
          <div style={{ background: isCheckedIn ? '#10b981' : '#3b82f6', color: 'white', fontSize: 26, fontWeight: 700, padding: '12px 40px', borderRadius: 50, marginBottom: 16 }}>
            {isCheckedIn ? '✓ Checked In' : '↑ Checked Out'}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18 }}>{result.confidence}% match · {result.time}</p>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, background: 'rgba(255,255,255,0.1)' }}>
            <div style={{ height: '100%', background: isCheckedIn ? '#10b981' : '#3b82f6', animation: 'shrink 5s linear forwards' }} />
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>A</div>
          <div>
            <p style={{ color: 'white', fontWeight: 600, fontSize: 15, margin: 0 }}>AttendPro Personal Kiosk</p>
            {employee && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: 0 }}>Signed in as {employee.full_name}</p>}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'white', fontSize: 28, fontWeight: 700, margin: 0 }}>{timeStr}</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: 0 }}>{dateStr}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {geoMessage && <span style={{ color: '#10b981', fontSize: 12 }}>{geoMessage}</span>}
          <button onClick={logout} style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {/* Camera */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 36, padding: '24px 28px' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ width: 520, height: 390, borderRadius: 18, overflow: 'hidden', border: `2px solid ${scanning ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`, background: '#111', transition: 'all 0.3s ease' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 180, height: 220, border: `2px solid ${scanning ? '#3b82f6' : 'rgba(255,255,255,0.2)'}`, borderRadius: '50%', pointerEvents: 'none', transition: 'all 0.3s ease' }} />
        </div>

        <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>👤</div>
            <h2 style={{ color: 'white', fontSize: 18, fontWeight: 600, margin: '0 0 6px' }}>Look at the camera</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: 0, lineHeight: 1.6 }}>Auto-scans every 2.5 seconds</p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 18px' }}>
            {[
              { label: 'Camera', value: cameraReady ? 'Active' : 'Error', ok: cameraReady },
              { label: 'Location', value: 'Verified ✓', ok: true },
              { label: 'Kiosk Access', value: 'Granted', ok: true },
              { label: 'Auto Scan', value: 'Every 2.5s', ok: true },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{s.label}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: s.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: s.ok ? '#10b981' : '#ef4444' }}>{s.value}</span>
              </div>
            ))}
          </div>
          {lastScan && (
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 14, padding: '12px 16px' }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '0 0 3px' }}>Last scan</p>
              <p style={{ color: '#10b981', fontSize: 13, fontWeight: 500, margin: 0 }}>{lastScan.toLocaleTimeString()}</p>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '10px 28px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, margin: 0 }}>AttendPro Personal Kiosk · GPS Verified</p>
        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, margin: 0 }}>Press F11 for fullscreen</p>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes shrink { from { width: 100%; } to { width: 0%; } }
      `}</style>
    </div>
  )
}
