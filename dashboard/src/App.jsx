import React, { useState, useEffect, useRef } from 'react';
import { 
  Droplets, 
  Activity, 
  Waves, 
  Zap, 
  Unlink, 
  Link as LinkIcon,
  ShieldCheck,
  BarChart3,
  AlertCircle,
  Database,
  Clock
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

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip" style={{ padding: '10px' }}>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>{`${payload[0].value.toFixed(2)}`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-space">
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>
      <div className="orb orb-3"></div>

      <div className="glass-container">
        <header className="header-glass">
          <div className="brand">
            <div className="brand-icon">
              <Droplets className="icon-main" size={24} strokeWidth={2.5} />
            </div>
            <div className="brand-text">
              <h1>JAL BOARD</h1>
              <p>Smart Water Grid</p>
            </div>
          </div>
          
          <div className="controls">
            <div className="status-badge">
              <div className={`dot ${isConnected ? 'online' : ''}`}></div>
              {isConnected ? 'System Live' : 'System Offline'}
            </div>
            
            {isConnected ? (
              <button onClick={disconnectSerial} className="btn btn-disconnect">
                <Unlink size={18} /> Disconnect Node
              </button>
            ) : (
              <button onClick={connectSerial} className="btn btn-connect">
                <LinkIcon size={18} /> Connect Node
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="error-banner">
            <AlertCircle size={24} />
            <div>
              <h4 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Connection Failed</h4>
              <p style={{ fontSize: '0.875rem', opacity: 0.9 }}>{error}</p>
            </div>
          </div>
        )}

        <div className="main-grid">
          {/* Flow Rate Card */}
          <div className="metric-card" style={{ '--card-glow': 'var(--color-flow)', '--card-color': 'var(--color-flow)' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">Flow Velocity</h3>
                <div className="card-value">
                  {data.flow.toFixed(2)}
                  <span className="card-unit">L/min</span>
                </div>
              </div>
              <div className="card-icon">
                <Activity size={24} />
              </div>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="flowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-flow)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--color-flow)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="flow" stroke="var(--color-flow)" strokeWidth={3} fillOpacity={1} fill="url(#flowGrad)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* TDS Card */}
          <div className="metric-card" style={{ '--card-glow': 'var(--color-tds)', '--card-color': 'var(--color-tds)' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">Purity Index (TDS)</h3>
                <div className="card-value">
                  {data.tds.toFixed(0)}
                  <span className="card-unit">PPM</span>
                </div>
              </div>
              <div className="card-icon">
                <Zap size={24} />
              </div>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="tds" stroke="var(--color-tds)" strokeWidth={3} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Turbidity Card */}
          <div className="metric-card" style={{ '--card-glow': 'var(--color-turb)', '--card-color': 'var(--color-turb)' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">Clarity (Turbidity)</h3>
                <div className="card-value">
                  {data.turbidity.toFixed(1)}
                  <span className="card-unit">NTU</span>
                </div>
              </div>
              <div className="card-icon">
                <Waves size={24} />
              </div>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="turbGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-turb)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--color-turb)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="turbidity" stroke="var(--color-turb)" strokeWidth={3} fillOpacity={1} fill="url(#turbGrad)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bottom-grid">
          <div className="info-card">
            <div className="info-header">
              <ShieldCheck className="icon-main" size={24} />
              <h3>System Diagnostics</h3>
            </div>
            <div>
              <div className="data-row">
                <span className="data-label">Total Supply Volume</span>
                <span className="data-val val-highlight">{data.total_flow.toFixed(3)} L</span>
              </div>
              <div className="data-row">
                <span className="data-label">Hardware Node</span>
                <span className="data-val">GOV_UNO_SECURE</span>
              </div>
              <div className="data-row">
                <span className="data-label">Last Sync</span>
                <span className="data-val" style={{ color: 'var(--color-turb)' }}>{lastUpdateTime}</span>
              </div>
            </div>
          </div>

          <div className="info-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div className="info-header">
              <Database className="icon-main" size={24} />
              <h3>Network Infrastructure</h3>
            </div>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.95rem' }}>
              The smart grid is actively monitoring real-time flow differentials and telemetry. To maintain data integrity, ensure the USB connection remains stable and serial monitors are closed during operation.
            </p>
            
            <div style={{ marginTop: '2rem', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: isConnected ? '100%' : '0%', height: '100%', background: 'var(--color-turb)', transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
