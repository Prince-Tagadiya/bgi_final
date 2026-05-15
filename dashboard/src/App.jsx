import React, { useState, useEffect, useRef } from 'react';
import { 
  Droplets, 
  Activity, 
  Waves, 
  Zap, 
  Settings, 
  History, 
  Cpu, 
  Unlink, 
  Link as LinkIcon 
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
      // 1. Request port from user
      const port = await navigator.serial.requestPort();
      
      // 2. Open port - check if already open
      try {
        await port.open({ baudRate: 115200 });
      } catch (openErr) {
        if (openErr.name === 'NetworkError') {
          throw new Error('Port is busy. Please close the Arduino Serial Monitor or other apps using this port.');
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
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
      if (portRef.current) {
        await portRef.current.close();
      }
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
              if (jsonData.node === 'government') {
                setData(jsonData);
                setLastUpdateTime(new Date().toLocaleTimeString());
                setHistory(prev => [...prev.slice(-29), {
                  ...jsonData,
                  time: new Date().toLocaleTimeString()
                }]);
              }
            }
          } catch (e) {
            // Ignore malformed JSON during stream startup
          }
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
    <div className="app-container">
      <header>
        <div className="logo">
          <div className="logo-icon">
            <Droplets color="white" size={24} />
          </div>
          <span>BGI Smart Water Grid</span>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className={`status-badge ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            <div className={`status-indicator ${isConnected ? 'status-online' : 'status-offline'}`}></div>
            {isConnected ? 'USB Live' : 'Offline'}
          </div>
          
          {isConnected ? (
            <button onClick={disconnectSerial} className="bg-red-500/20 hover:bg-red-500/40 text-red-400">
              <Unlink size={18} /> Disconnect
            </button>
          ) : (
            <button onClick={connectSerial}>
              <LinkIcon size={18} /> Connect Node
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl mb-6 text-red-400 flex items-start gap-3">
          <Activity size={20} className="mt-1 flex-shrink-0" /> 
          <div>
            <p className="font-semibold">Connection Issue</p>
            <p className="text-sm opacity-90">{error}</p>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        {/* Flow Rate Card */}
        <div className="card" style={{ animationDelay: '0.1s' }}>
          <div className="card-header">
            <div>
              <p className="card-label">Real-time Flow</p>
              <h2 className="card-value sensor-flow">{data.flow.toFixed(2)}</h2>
              <span className="card-unit">L/min</span>
            </div>
            <div className="card-icon">
              <Activity className="sensor-flow" />
            </div>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="flow" stroke="#38bdf8" fillOpacity={1} fill="url(#colorFlow)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TDS Card */}
        <div className="card" style={{ animationDelay: '0.2s' }}>
          <div className="card-header">
            <div>
              <p className="card-label">Water Purity (TDS)</p>
              <h2 className="card-value sensor-tds">{data.tds.toFixed(0)}</h2>
              <span className="card-unit">PPM</span>
            </div>
            <div className="card-icon">
              <Zap className="sensor-tds" />
            </div>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <Line type="monotone" dataKey="tds" stroke="#fbbf24" strokeWidth={3} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Turbidity Card */}
        <div className="card" style={{ animationDelay: '0.3s' }}>
          <div className="card-header">
            <div>
              <p className="card-label">Turbidity</p>
              <h2 className="card-value sensor-turbidity">{data.turbidity.toFixed(1)}</h2>
              <span className="card-unit">NTU</span>
            </div>
            <div className="card-icon">
              <Waves className="sensor-turbidity" />
            </div>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorTurb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="turbidity" stroke="#4ade80" fillOpacity={1} fill="url(#colorTurb)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card" style={{ animationDelay: '0.4s' }}>
          <div className="flex items-center gap-3 mb-6">
            <Cpu className="text-slate-400" />
            <h3 className="text-xl font-semibold">Node Diagnostics</h3>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between p-3 rounded-lg bg-white/5">
              <span className="text-slate-400">Total Consumption</span>
              <span className="font-mono">{data.total_flow.toFixed(3)} L</span>
            </div>
            <div className="flex justify-between p-3 rounded-lg bg-white/5">
              <span className="text-slate-400">Node ID</span>
              <span className="font-mono">GOV_NODE_ESP32_01</span>
            </div>
            <div className="flex justify-between p-3 rounded-lg bg-white/5">
              <span className="text-slate-400">Last Telemetry</span>
              <span className="font-mono">{lastUpdateTime}</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ animationDelay: '0.5s' }}>
          <div className="flex items-center gap-3 mb-6">
            <History className="text-slate-400" />
            <h3 className="text-xl font-semibold">System Insights</h3>
          </div>
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <p className="text-sm text-blue-300">
              The Government Node is currently streaming live telemetry over USB. 
              <strong>Tip:</strong> If connection fails, ensure the Arduino Serial Monitor is closed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
