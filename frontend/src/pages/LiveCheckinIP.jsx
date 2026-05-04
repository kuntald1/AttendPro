import { useRef, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { attendanceAPI } from '../api'
import toast from 'react-hot-toast'

export default function LiveCheckinIP() {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const intervalRef = useRef(null)
  const scanIntervalRef = useRef(null)
  const [camUrl, setCamUrl] = useState(localStorage.getItem('ip_cam_url') || '')
  const [snapshotUrl, setSnapshotUrl] = useState(localStorage.getItem('ip_cam_snapshot') || '')
  const [mode, setMode] = useState('mjpeg') // mjpeg or snapshot
  const [connected, setConnected] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [autoScan, setAutoScan] = useState(false)
  const [imgSrc, setImgSrc] = useState('')
  const [frameError, setFrameError] = useState(false)

  const connectCamera = () => {
    if (!camUrl && mode === 'mjpeg') { toast.error('Enter camera stream URL'); return }
    if (!snapshotUrl && mode === 'snapshot') { toast.error('Enter snapshot URL'); return }
    localStorage.setItem('ip_cam_url', camUrl)
    localStorage.setItem('ip_cam_snapshot', snapshotUrl)
    setFrameError(false)
    if (mode === 'mjpeg') {
      setImgSrc(camUrl)
      setConnected(true)
    } else {
      setConnected(true)
      refreshSnapshot()
    }
  }

  const refreshSnapshot = useCallback(() => {
    const url = snapshotUrl.includes('?') ? `${snapshotUrl}&t=${Date.now()}` : `${snapshotUrl}?t=${Date.now()}`
    setImgSrc(url)
  }, [snapshotUrl])

  useEffect(() => {
    if (connected && mode === 'snapshot') {
      intervalRef.current = setInterval(refreshSnapshot, 1000)
    }
    return () => clearInterval(intervalRef.current)
  }, [connected, mode, refreshSnapshot])

  const disconnect = () => {
    setConnected(false)
    setImgSrc('')
    setAutoScan(false)
    clearInterval(scanIntervalRef.current)
  }

  const captureAndRecognize = useCallback(async () => {
    if (scanning || !imgRef.current) return
    setScanning(true)
    try {
      const canvas = canvasRef.current
      canvas.width = imgRef.current.naturalWidth || 640
      canvas.height = imgRef.current.naturalHeight || 480
      canvas.getContext('2d').drawImage(imgRef.current, 0, 0)
      const image = canvas.toDataURL('image/jpeg', 0.8)
      const res = await attendanceAPI.recognize(image)
      setLastResult(res.data)
      if (res.data.success) {
        const action = res.data.action === 'checked_in' ? 'Checked In' : 'Checked Out'
        toast.success(`${res.data.employee.name} — ${action} (${res.data.confidence}% match)`)
      } else {
        if (!autoScan) toast.error(res.data.message)
      }
    } catch {
      toast.error('Recognition failed.')
    } finally {
      setScanning(false)
    }
  }, [scanning, autoScan])

  useEffect(() => {
    if (autoScan && connected) {
      scanIntervalRef.current = setInterval(captureAndRecognize, 3000)
    } else {
      clearInterval(scanIntervalRef.current)
    }
    return () => clearInterval(scanIntervalRef.current)
  }, [autoScan, connected, captureAndRecognize])

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/attendance/live')} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">📡 IP Camera / CCTV</h1>
          <p className="text-sm text-gray-500">Connect to a network camera using MJPEG stream or snapshot URL</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5">

          {/* Mode selector */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setMode('mjpeg')}
              className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${mode === 'mjpeg' ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              MJPEG Stream
            </button>
            <button onClick={() => setMode('snapshot')}
              className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${mode === 'snapshot' ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              HTTP Snapshot
            </button>
          </div>

          {/* URL inputs */}
          {!connected && (
            <div className="mb-4 space-y-2">
              {mode === 'mjpeg' ? (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">MJPEG Stream URL</label>
                  <input type="text" value={camUrl} onChange={e => setCamUrl(e.target.value)}
                    placeholder="http://192.168.1.100:8080/video"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">Common apps: IP Webcam (Android), iVCam, DroidCam</p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Snapshot URL</label>
                  <input type="text" value={snapshotUrl} onChange={e => setSnapshotUrl(e.target.value)}
                    placeholder="http://192.168.1.100/snapshot.jpg"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">Refreshes every 1 second automatically</p>
                </div>
              )}
              <button onClick={connectCamera} className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors">
                Connect Camera
              </button>
            </div>
          )}

          {/* Camera feed */}
          <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video mb-4">
            {connected ? (
              <img ref={imgRef} src={imgSrc} alt="IP Camera Feed" crossOrigin="anonymous"
                onError={() => setFrameError(true)}
                onLoad={() => setFrameError(false)}
                className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                <span className="text-4xl">📡</span>
                <span>Enter camera URL above to connect</span>
              </div>
            )}
            {frameError && connected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-red-400 text-sm gap-2">
                <span className="text-3xl">⚠</span>
                <span>Cannot load camera feed</span>
                <span className="text-xs text-gray-500">Check URL and camera is online</span>
              </div>
            )}
            {scanning && <div className="absolute top-3 right-3 bg-blue-600 text-white text-xs px-2 py-1 rounded-full animate-pulse">Scanning...</div>}
            {connected && autoScan && <div className="absolute inset-0 border-2 border-blue-400 rounded-lg pointer-events-none opacity-60" />}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          {connected && (
            <div className="flex gap-2">
              <button onClick={captureAndRecognize} disabled={scanning || frameError}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {scanning ? 'Recognising...' : 'Recognise Now'}
              </button>
              <button onClick={() => setAutoScan(a => !a)}
                className={`px-4 rounded-lg text-sm font-medium border transition-colors ${autoScan ? 'bg-green-50 text-green-700 border-green-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {autoScan ? 'Auto ON' : 'Auto'}
              </button>
              <button onClick={disconnect} className="px-4 rounded-lg text-sm text-red-500 border border-red-100 hover:bg-red-50 transition-colors">Disconnect</button>
            </div>
          )}
          {autoScan && <p className="text-xs text-gray-400 mt-2 text-center">Auto-scanning every 3 seconds</p>}

          {/* Quick guide */}
          {!connected && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-700">Quick setup guide:</p>
              <p>1. Install <strong>IP Webcam</strong> app on an Android phone</p>
              <p>2. Start server in the app — note the URL shown</p>
              <p>3. Paste the URL here (e.g. http://192.168.1.x:8080/video)</p>
              <p>4. Ensure phone and this PC are on the same WiFi network</p>
            </div>
          )}
        </div>
        <ResultPanel result={lastResult} />
      </div>
    </div>
  )
}

function ResultPanel({ result }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="text-sm font-medium text-gray-700 mb-4">Recognition result</h2>
      {result ? (
        <div className={`rounded-xl p-5 ${result.success ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
          {result.success ? (
            <>
              <div className="w-16 h-16 rounded-full bg-green-200 flex items-center justify-center text-2xl mx-auto mb-3 font-semibold text-green-800">
                {result.employee.name.charAt(0)}
              </div>
              <p className="text-center font-semibold text-gray-900 text-lg">{result.employee.name}</p>
              <p className="text-center text-gray-500 text-sm mb-3">{result.employee.code}</p>
              <div className="flex justify-center gap-3 text-sm flex-wrap">
                <span className={`px-3 py-1 rounded-full font-medium ${result.action === 'checked_in' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  {result.action === 'checked_in' ? 'Checked In' : 'Checked Out'}
                </span>
                <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-600">{result.confidence}% match</span>
              </div>
              <p className="text-center text-gray-400 text-xs mt-3">at {result.time}</p>
            </>
          ) : (
            <div className="text-center py-4"><p className="text-red-600 font-medium">{result.message}</p></div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 text-gray-300">
          <p className="text-4xl mb-2">◎</p>
          <p className="text-sm">Waiting for face scan</p>
        </div>
      )}
    </div>
  )
}
