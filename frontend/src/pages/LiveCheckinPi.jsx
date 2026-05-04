import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const PI_SCRIPT = (backendUrl, token) => `#!/usr/bin/env python3
# Raspberry Pi Face Recognition Client
# Install: pip install opencv-python requests
# Run: python3 pi_checkin.py

import cv2
import base64
import requests
import time

BACKEND_URL = "${backendUrl}"
TOKEN = "${token}"
SCAN_INTERVAL = 3  # seconds between scans
CAMERA_INDEX = 0   # 0 = default camera, change if needed

headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

def capture_and_recognize():
    cap = cv2.VideoCapture(CAMERA_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    print(f"Connecting to {BACKEND_URL}...")
    print("Press Ctrl+C to stop\\n")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("ERROR: Cannot read from camera")
            time.sleep(1)
            continue

        _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        b64 = base64.b64encode(buf).decode()
        image_data = f"data:image/jpeg;base64,{b64}"

        try:
            resp = requests.post(
                f"{BACKEND_URL}/api/attendance/face/recognize",
                json={"image": image_data},
                headers=headers,
                timeout=10
            )
            data = resp.json()

            if data.get("success"):
                emp = data["employee"]
                action = "CHECKED IN" if data["action"] == "checked_in" else "CHECKED OUT"
                print(f"[{data['time']}] {action}: {emp['name']} ({emp['code']}) — {data['confidence']}% match")
            else:
                print(f"No match: {data.get('message', 'Unknown error')}")

        except requests.exceptions.ConnectionError:
            print(f"ERROR: Cannot connect to {BACKEND_URL}")
        except Exception as e:
            print(f"ERROR: {e}")

        time.sleep(SCAN_INTERVAL)

    cap.release()

if __name__ == "__main__":
    capture_and_recognize()
`

export default function LiveCheckinPi() {
  const navigate = useNavigate()
  const [backendUrl, setBackendUrl] = useState('http://YOUR_SERVER_IP:8002')
  const [token, setToken] = useState('')
  const [email, setEmail] = useState('admin@company.com')
  const [password, setPassword] = useState('')
  const [fetching, setFetching] = useState(false)
  const [step, setStep] = useState(1)
  const [copied, setCopied] = useState(false)
  const [recentLogs] = useState([
    { time: '09:02:14', name: 'Kuntal Das', code: 'EMP002', action: 'CHECKED IN', confidence: 94.2 },
    { time: '09:05:38', name: 'Rajat Doe', code: 'EMP001', action: 'CHECKED IN', confidence: 91.8 },
    { time: '17:31:02', name: 'Kuntal Das', code: 'EMP002', action: 'CHECKED OUT', confidence: 92.1 },
  ])

  const fetchToken = async () => {
    if (!email || !password) { toast.error('Enter email and password'); return }
    setFetching(true)
    try {
      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (data.access_token) {
        setToken(data.access_token)
        setStep(2)
        toast.success('Token generated successfully')
      } else {
        toast.error('Login failed. Check credentials.')
      }
    } catch {
      toast.error('Cannot connect to backend. Check URL.')
    } finally {
      setFetching(false)
    }
  }

  const copyScript = () => {
    navigator.clipboard.writeText(PI_SCRIPT(backendUrl, token))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Script copied to clipboard!')
  }

  const downloadScript = () => {
    const blob = new Blob([PI_SCRIPT(backendUrl, token)], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pi_checkin.py'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/attendance/live')} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">🍓 Raspberry Pi / Kiosk Device</h1>
          <p className="text-sm text-gray-500">Deploy a dedicated entrance kiosk using a Raspberry Pi + camera</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {[
          { n: 1, title: 'Get API token', desc: 'Generate a JWT token using your admin credentials' },
          { n: 2, title: 'Download Pi script', desc: 'Python script pre-configured with your server URL and token' },
          { n: 3, title: 'Run on Pi', desc: 'Run the script on Raspberry Pi — it scans and marks attendance automatically' },
        ].map(s => (
          <div key={s.n} className={`p-4 rounded-xl border ${step >= s.n ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-white'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium mb-2 ${step >= s.n ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{s.n}</div>
            <p className={`text-sm font-medium mb-1 ${step >= s.n ? 'text-blue-900' : 'text-gray-700'}`}>{s.title}</p>
            <p className="text-xs text-gray-500">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Step 1 — Token */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="font-medium text-gray-900 text-sm mb-4">Step 1 — Generate API token</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Backend URL</label>
              <input type="text" value={backendUrl} onChange={e => setBackendUrl(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Admin email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={fetchToken} disabled={fetching}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {fetching ? 'Generating...' : 'Generate Token'}
            </button>
          </div>

          {token && (
            <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-lg">
              <p className="text-xs text-green-700 font-medium mb-1">✓ Token generated</p>
              <p className="text-xs text-gray-500 font-mono break-all">{token.slice(0, 40)}...</p>
            </div>
          )}
        </div>

        {/* Step 2 — Script */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="font-medium text-gray-900 text-sm mb-4">Step 2 — Pi client script</h2>

          {!token ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-300">
              <p className="text-4xl mb-2">🔒</p>
              <p className="text-sm text-gray-400">Generate token first</p>
            </div>
          ) : (
            <>
              <div className="bg-gray-900 rounded-lg p-3 mb-3 max-h-52 overflow-y-auto">
                <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{PI_SCRIPT(backendUrl, token).slice(0, 600)}...</pre>
              </div>
              <div className="flex gap-2">
                <button onClick={downloadScript}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors">
                  ↓ Download pi_checkin.py
                </button>
                <button onClick={copyScript}
                  className="px-4 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
                <p className="font-medium text-gray-700">Run on Raspberry Pi:</p>
                <p className="font-mono bg-white border border-gray-200 rounded px-2 py-1">pip install opencv-python requests</p>
                <p className="font-mono bg-white border border-gray-200 rounded px-2 py-1">python3 pi_checkin.py</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hardware guide */}
      <div className="mt-6 bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="font-medium text-gray-900 text-sm mb-4">Recommended hardware setup</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: '🍓', name: 'Raspberry Pi 4', spec: '2GB RAM minimum' },
            { icon: '📷', name: 'Pi Camera Module', spec: 'v2 or HQ Camera' },
            { icon: '🖥️', name: '7" Touchscreen', spec: 'Official Pi display' },
            { icon: '🔌', name: 'Power supply', spec: '5V 3A USB-C' },
          ].map(h => (
            <div key={h.name} className="p-3 bg-gray-50 rounded-lg text-center">
              <div className="text-2xl mb-1">{h.icon}</div>
              <p className="text-xs font-medium text-gray-700">{h.name}</p>
              <p className="text-xs text-gray-400">{h.spec}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
          <strong>Note:</strong> The Pi script sends captured frames to your backend API. All face recognition processing happens on the server — the Pi only needs a camera and network connection. Token expires in 8 hours by default — set <code>ACCESS_TOKEN_EXPIRE_MINUTES=525600</code> in docker-compose.yml for a 1-year token.
        </div>
      </div>

      {/* Sample log preview */}
      <div className="mt-6 bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="font-medium text-gray-900 text-sm mb-3">Sample Pi terminal output</h2>
        <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs space-y-1">
          <p className="text-gray-400">Connecting to {backendUrl}...</p>
          <p className="text-gray-400">Press Ctrl+C to stop</p>
          <p className="text-green-400">[09:02:14] CHECKED IN: Kuntal Das (EMP002) — 94.2% match</p>
          <p className="text-yellow-400">No match: Face not recognised. Best score: 18.3%</p>
          <p className="text-green-400">[09:05:38] CHECKED IN: Rajat Doe (EMP001) — 91.8% match</p>
          <p className="text-blue-400">[17:31:02] CHECKED OUT: Kuntal Das (EMP002) — 92.1% match</p>
        </div>
      </div>
    </div>
  )
}
