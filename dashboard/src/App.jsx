import React, { useState, useEffect, useRef } from 'react';
import { 
  Droplets, 
  Activity, 
  Waves, 
  Zap, 
  Cpu, 
  Unlink, 
  Link as LinkIcon,
  ShieldCheck,
  BarChart3,
  RefreshCcw,
  AlertCircle
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

function App() {
  const [data, setData] = useState({
    flow: 0,
    tds: 0,
    turbidity: 0,
    total_flow: 0
  });
  const [history, setHistory] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdateTime, setLastUpdateTime] = useState('Never');
  
  const portRef = useRef(null);
  const readerRef = useRef(null);

  const connectSerial = async () => {
    try {
      const port = await navigator.serial.requestPort();
      try {
        await port.open({ baudRate: 115200 });
      } catch (openErr) {
        if (openErr.name === 'NetworkError') {
          throw new Error('Port is busy. Please close the Arduino Serial Monitor.');
        }
        throw openErr;
      }
      portRef.current = port;
      setIsConnected(true);
      setError(null);
      readLoop(port);
    } catch (err) {
      console.error('Serial Connection Error:', err);
      setError(err.message || 'Could not connect to USB device');
      setIsConnected(false);
    }
  };

  const disconnectSerial = async () => {
    try {
      if (readerRef.current) await readerRef.current.cancel();
      if (portRef.current) await portRef.current.close();
    } catch (err) {
      console.error('Disconnect error:', err);
    } finally {
      setIsConnected(false);
      portRef.current = null;
      readerRef.current = null;
    }
  };

  const readLoop = async (port) => {
    try {
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;

      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          try {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('{') && cleanLine.endsWith('}')) {
              const jsonData = JSON.parse(cleanLine);
              setData(jsonData);
              setLastUpdateTime(new Date().toLocaleTimeString());
              setHistory(prev => [...prev.slice(-49), {
                ...jsonData,
                time: new Date().toLocaleTimeString()
              }]);
            }
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error('Read loop error:', err);
      if (isConnected) {
        setError('Connection lost. Please check the USB cable.');
        setIsConnected(false);
      }
    }
  };

  return (
    <>
      <div className="bg-mesh"></div>
      <div className="app-container">
        <header>
          <div className="logo-container">
            <div className="logo-orb">
              <Droplets color="white" size={28} />
            </div>
            <div className="logo-text">
              <span className="logo-title">JAL BOARD</span>
              <span className="logo-subtitle">SMART WATER GRID</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="btn-outline" style={{ border: 'none', background: 'rgba(255,255,255,0.05)' }}>
              <div className={`status-indicator-ring ${isConnected ? 'status-online' : ''}`} 
                   style={{ background: isConnected ? '' : '#ef4444' }}></div>
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                {isConnected ? 'LIVE FEED' : 'OFFLINE'}
              </span>
            </div>
            
            {isConnected ? (
              <button onClick={disconnectSerial} className="btn-outline">
                <Unlink size={18} /> Disconnect
              </button>
            ) : (
              <button onClick={connectSerial} className="btn-primary">
                <LinkIcon size={18} /> Connect Node
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="glass-card" style={{ marginBottom: '3rem', borderColor: 'rgba(239, 68, 68, 0.3)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#ef4444' }}>
              <AlertCircle size={24} />
              <div>
                <h4 style={{ fontWeight: 700 }}>Connection Issue</h4>
                <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="dashboard-grid">
          {/* Flow Rate Card */}
          <div className="glass-card" style={{ '--card-accent': 'var(--accent-blue)' }}>
            <div className="card-top">
              <div>
                <p className="stat-label">Flow Velocity</p>
                <div className="stat-value text-gradient-blue">
                  {data.flow.toFixed(2)}
                  <span className="stat-unit">L/min</span>
                </div>
              </div>
              <div className="icon-box">
                <Activity className="text-sky-400" size={24} />
              </div>
            </div>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="flow" stroke="#38bdf8" strokeWidth={3} fillOpacity={1} fill="url(#colorFlow)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* TDS Card */}
          <div className="glass-card" style={{ '--card-accent': 'var(--accent-amber)' }}>
            <div className="card-top">
              <div>
                <p className="stat-label">Purity Index (TDS)</p>
                <div className="stat-value text-gradient-amber">
                  {data.tds.toFixed(0)}
                  <span className="stat-unit">PPM</span>
                </div>
              </div>
              <div className="icon-box">
                <Zap className="text-amber-400" size={24} />
              </div>
            </div>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={history}>
                  <Line type="stepAfter" dataKey="tds" stroke="#f59e0b" strokeWidth={3} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Turbidity Card */}
          <div className="glass-card" style={{ '--card-accent': 'var(--accent-green)' }}>
            <div className="card-top">
              <div>
                <p className="stat-label">Clarity (Turbidity)</p>
                <div className="stat-value text-gradient-green">
                  {data.turbidity.toFixed(1)}
                  <span className="stat-unit">NTU</span>
                </div>
              </div>
              <div className="icon-box">
                <Waves className="text-emerald-400" size={24} />
              </div>
            </div>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="colorTurb" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="turbidity" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorTurb)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
              <ShieldCheck className="text-slate-400" size={20} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>System Verification</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="diagnostic-item">
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Supply Volume</span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '1.1rem' }}>{data.total_flow.toFixed(3)} L</span>
              </div>
              <div className="diagnostic-item">
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Hardware Node</span>
                <span style={{ fontWeight: 700 }}>GOV_ESP32_SECURE</span>
              </div>
              <div className="diagnostic-item">
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Last Sync</span>
                <span style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{lastUpdateTime}</span>
              </div>
            </div>
          </div>

          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
              <BarChart3 className="text-slate-400" size={20} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Infrastructure Health</h3>
            </div>
            <div style={{ padding: '1.5rem', borderRadius: '24px', background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
              <p style={{ fontSize: '0.925rem', color: '#bae6fd', lineHeight: 1.6 }}>
                The smart grid is monitoring real-time flow differentials. If connection is lost, verify USB cable and close Serial monitors.
              </p>
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                  <div style={{ width: isConnected ? '100%' : '0%', height: '100%', background: 'var(--accent-blue)', transition: 'width 1s' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
