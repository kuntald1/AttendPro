import { useRef, useEffect, useState, useCallback } from 'react'
import { attendanceAPI } from '../api'

const SCAN_INTERVAL = 2500

export default function Kiosk() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const resetRef = useRef(null)
  const [result, setResult] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [lastScan, setLastScan] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const startCam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } })
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setCameraReady(true)
      } catch { setCameraReady(false) }
    }
    startCam()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      clearInterval(intervalRef.current)
      clearTimeout(resetRef.current)
    }
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
        setResult(data); setLastScan(new Date())
        clearTimeout(resetRef.current)
        resetRef.current = setTimeout(() => setResult(null), 5000)
      }
    } catch {} finally { setScanning(false) }
  }, [scanning])

  useEffect(() => {
    if (cameraReady) intervalRef.current = setInterval(captureAndRecognize, SCAN_INTERVAL)
    return () => clearInterval(intervalRef.current)
  }, [cameraReady, captureAndRecognize])

  const timeStr = currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = currentTime.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const isCheckedIn = result?.action === 'checked_in'

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' }}>
      {/* Success overlay */}
      {result && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: isCheckedIn ? 'linear-gradient(135deg, #064e3b, #065f46)' : 'linear-gradient(135deg, #1e3a5f, #1e40af)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.3s ease', padding: 24 }}>
          <div style={{ width: 90, height: 90, borderRadius: '50%', background: isCheckedIn ? '#10b981' : '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, marginBottom: 20, boxShadow: `0 0 60px ${isCheckedIn ? '#10b98160' : '#3b82f660'}` }}>
            {isCheckedIn ? '✓' : '↑'}
          </div>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: isCheckedIn ? '#065f46' : '#1e3a8a', border: `3px solid ${isCheckedIn ? '#10b981' : '#3b82f6'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, color: 'white', marginBottom: 16 }}>
            {result.employee.name.charAt(0)}
          </div>
          <h1 style={{ color: 'white', fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 700, margin: '0 0 6px', textAlign: 'center' }}>{result.employee.name}</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'clamp(14px, 2.5vw, 20px)', margin: '0 0 24px' }}>{result.employee.code}</p>
          <div style={{ background: isCheckedIn ? '#10b981' : '#3b82f6', color: 'white', fontSize: 'clamp(16px, 3vw, 24px)', fontWeight: 700, padding: '10px 32px', borderRadius: 50, marginBottom: 14 }}>
            {isCheckedIn ? '✓ Checked In' : '↑ Checked Out'}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(12px, 2vw, 18px)' }}>{result.confidence}% match · {result.time}</p>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, background: 'rgba(255,255,255,0.1)' }}>
            <div style={{ height: '100%', background: isCheckedIn ? '#10b981' : '#3b82f6', animation: 'shrink 5s linear forwards' }} />
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>A</div>
          <div>
            <p style={{ color: 'white', fontWeight: 600, fontSize: 14, margin: 0 }}>AttendPro</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, margin: 0 }}>Face Recognition Attendance</p>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'white', fontSize: 'clamp(18px, 3vw, 28px)', fontWeight: 700, margin: 0 }}>{timeStr}</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, margin: 0 }}>{dateStr}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: cameraReady ? '#10b981' : '#ef4444' }} />
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{cameraReady ? 'Camera Active' : 'Camera Error'}</span>
          {scanning && <span style={{ color: '#3b82f6', fontSize: 11, background: 'rgba(59,130,246,0.15)', padding: '2px 8px', borderRadius: 20 }}>Scanning...</span>}
        </div>
      </div>

      {/* Main content - responsive */}
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '16px 20px', overflow: 'auto' }}>
        {/* Camera */}
        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: 560 }}>
          <div style={{ width: '100%', paddingTop: '75%', position: 'relative', borderRadius: 16, overflow: 'hidden', border: `2px solid ${scanning ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`, background: '#111' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {/* Oval guide */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '35%', height: '55%', border: `2px solid ${scanning ? '#3b82f6' : 'rgba(255,255,255,0.3)'}`, borderRadius: '50%', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Panel */}
        <div style={{ flex: '1 1 220px', maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '20px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>👤</div>
            <h2 style={{ color: 'white', fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>Look at the camera</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: 0, lineHeight: 1.5 }}>Auto-scans every 2.5 seconds</p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 16px' }}>
            {[
              { label: 'Camera', value: cameraReady ? 'Active' : 'Error', ok: cameraReady },
              { label: 'Recognition', value: 'Ready', ok: true },
              { label: 'Auto Scan', value: 'Every 2.5s', ok: true },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{s.label}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: s.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: s.ok ? '#10b981' : '#ef4444' }}>{s.value}</span>
              </div>
            ))}
          </div>
          {lastScan && (
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 14, padding: '12px 16px' }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '0 0 3px' }}>Last successful scan</p>
              <p style={{ color: '#10b981', fontSize: 13, fontWeight: 500, margin: 0 }}>{lastScan.toLocaleTimeString()}</p>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, margin: 0 }}>AttendPro Kiosk · Authorised Device</p>
        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, margin: 0 }}>Press F11 for fullscreen</p>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes shrink { from { width: 100%; } to { width: 0%; } }
      `}</style>
    </div>
  )
}
