import { useNavigate } from 'react-router-dom'

const modes = [
  {
    path: '/attendance/live/laptop',
    icon: '💻',
    title: 'Laptop / Built-in Camera',
    desc: 'Uses the built-in webcam of the device running this browser. No extra setup needed.',
    badge: 'Default',
    badgeColor: 'bg-blue-50 text-blue-700',
    status: 'Ready to use',
    statusColor: 'text-green-600',
  },
  {
    path: '/attendance/live/usb',
    icon: '📷',
    title: 'USB External Webcam',
    desc: 'Plug in any USB webcam and the system will automatically detect and prefer it over the built-in camera.',
    badge: 'Plug & Play',
    badgeColor: 'bg-green-50 text-green-700',
    status: 'Connect USB camera first',
    statusColor: 'text-amber-600',
  },
  {
    path: '/attendance/live/ip',
    icon: '📡',
    title: 'IP Camera / CCTV',
    desc: 'Connect to a network IP camera or CCTV stream using an MJPEG or HTTP snapshot URL.',
    badge: 'Network',
    badgeColor: 'bg-purple-50 text-purple-700',
    status: 'Enter camera IP to configure',
    statusColor: 'text-amber-600',
  },
  {
    path: '/attendance/live/pi',
    icon: '🍓',
    title: 'Raspberry Pi / Kiosk Device',
    desc: 'Generate an API token and deploy the Pi client script to a dedicated entrance kiosk device.',
    badge: 'Advanced',
    badgeColor: 'bg-orange-50 text-orange-700',
    status: 'Requires Pi setup',
    statusColor: 'text-gray-500',
  },
]

export default function LiveCheckinHub() {
  const navigate = useNavigate()
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Live Check-in</h1>
        <p className="text-sm text-gray-500 mt-1">Select the camera mode that matches your setup</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modes.map(m => (
          <button key={m.path} onClick={() => navigate(m.path)}
            className="text-left bg-white border border-gray-100 rounded-xl p-5 hover:border-blue-200 hover:shadow-sm transition-all group">
            <div className="flex items-start justify-between mb-3">
              <span className="text-3xl">{m.icon}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.badgeColor}`}>{m.badge}</span>
            </div>
            <h2 className="font-medium text-gray-900 text-sm mb-1 group-hover:text-blue-700 transition-colors">{m.title}</h2>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">{m.desc}</p>
            <p className={`text-xs font-medium ${m.statusColor}`}>{m.status}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
