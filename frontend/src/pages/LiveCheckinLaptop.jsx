import { useRef, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { attendanceAPI } from '../api'
import toast from 'react-hot-toast'

export default function LiveCheckinLaptop() {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [autoScan, setAutoScan] = useState(false)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraOn(true)
    } catch {
      toast.error('Cannot access camera. Please allow camera permission.')
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
    setAutoScan(false)
    clearInterval(intervalRef.current)
  }

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
      setLastResult(res.data)
      if (res.data.success) {
        const action = res.data.action === 'checked_in' ? 'Checked In' : 'Checked Out'
        toast.success(`${res.data.employee.name} — ${action} (${res.data.confidence}% match)`)
      } else {
        if (!autoScan) toast.error(res.data.message)
      }
    } catch {
      toast.error('Recognition failed. Check backend connection.')
    } finally {
      setScanning(false)
    }
  }, [scanning, autoScan])

  useEffect(() => {
    if (autoScan && cameraOn) {
      intervalRef.current = setInterval(captureAndRecognize, 3000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [autoScan, cameraOn, captureAndRecognize])

  useEffect(() => () => { stopCamera() }, [])

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/attendance/live')} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">💻 Laptop / Built-in Camera</h1>
          <p className="text-sm text-gray-500">Using your device's built-in webcam</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video mb-4">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            {!cameraOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                <span className="text-4xl">💻</span>
                <span>Built-in camera is off</span>
              </div>
            )}
            {scanning && <div className="absolute top-3 right-3 bg-blue-600 text-white text-xs px-2 py-1 rounded-full animate-pulse">Scanning...</div>}
            {cameraOn && autoScan && <div className="absolute inset-0 border-2 border-blue-400 rounded-lg pointer-events-none opacity-60" />}
          </div>
          <div className="flex gap-2">
            {!cameraOn ? (
              <button onClick={startCamera} className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors">
                Start Camera
              </button>
            ) : (
              <>
                <button onClick={captureAndRecognize} disabled={scanning}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {scanning ? 'Recognising...' : 'Recognise Now'}
                </button>
                <button onClick={() => setAutoScan(a => !a)}
                  className={`px-4 rounded-lg text-sm font-medium border transition-colors ${autoScan ? 'bg-green-50 text-green-700 border-green-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {autoScan ? 'Auto ON' : 'Auto'}
                </button>
                <button onClick={stopCamera} className="px-4 rounded-lg text-sm text-red-500 border border-red-100 hover:bg-red-50 transition-colors">
                  Stop
                </button>
              </>
            )}
          </div>
          {autoScan && <p className="text-xs text-gray-400 mt-2 text-center">Auto-scanning every 3 seconds</p>}
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
            <div className="text-center py-4">
              <p className="text-red-600 font-medium">{result.message}</p>
            </div>
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
