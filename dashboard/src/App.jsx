import React, { useState, useEffect, useRef } from 'react';
import { 
  Droplets, Activity, Waves, Zap, Unlink, Link as LinkIcon,
  ShieldCheck, Database, AlertTriangle, Power, AlertOctagon
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

function App() {
  const [govData, setGovData] = useState({ flow: 0, tds: 0, turbidity: 0, total_flow: 0 });
  const [rameshData, setRameshData] = useState({ flow: 0, total_flow: 0, valve: true, tamper: false, emergency: false });
  const [priyaData, setPriyaData] = useState({ flow: 0, total_flow: 0, valve: true, tamper: false, emergency: false });

  const [connections, setConnections] = useState({ gov: false, ramesh: false, priya: false });
  
  const portsRef = useRef({ gov: null, ramesh: null, priya: null });
  const readersRef = useRef({ gov: null, ramesh: null, priya: null });

  // Theft Detection Logic (Simple heuristic: Gov flow > 0 but consumers reading 0)
  const isTheft = govData.flow > 0.5 && (rameshData.flow + priyaData.flow) < 0.1;

  const connectNode = async (node) => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portsRef.current[node] = port;
      setConnections(prev => ({ ...prev, [node]: true }));
      readLoop(port, node);
    } catch (err) {
      console.error(`Connection error for ${node}:`, err);
    }
  };

  const disconnectNode = async (node) => {
    try {
      if (readersRef.current[node]) await readersRef.current[node].cancel();
      if (portsRef.current[node]) await portsRef.current[node].close();
    } catch(err) {
      console.error(`Disconnect error for ${node}:`, err);
    } finally {
      setConnections(prev => ({ ...prev, [node]: false }));
      portsRef.current[node] = null;
      readersRef.current[node] = null;
    }
  };

  const readLoop = async (port, node) => {
    try {
      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      readersRef.current[node] = reader;

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
              if (node === 'gov') setGovData(jsonData);
              else if (node === 'ramesh') setRameshData(jsonData);
              else if (node === 'priya') setPriyaData(jsonData);
            }
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error(`Read error for ${node}:`, err);
      setConnections(prev => ({ ...prev, [node]: false }));
    }
  };

  const sendCommand = async (node, cmd) => {
    const port = portsRef.current[node];
    if (port && port.writable) {
      const writer = port.writable.getWriter();
      await writer.write(new TextEncoder().encode(cmd + '\n'));
      writer.releaseLock();
    }
  };

  return (
    <div className="bg-space" style={{ paddingBottom: '4rem' }}>
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>
      <div className="orb orb-3"></div>

      <div className="glass-container">
        {/* Header */}
        <header className="header-glass" style={{ marginBottom: '2rem' }}>
          <div className="brand">
            <div className="brand-icon">
              <Droplets className="icon-main" size={24} strokeWidth={2.5} />
            </div>
            <div className="brand-text">
              <h1>JAL BOARD</h1>
              <p>Smart Water Grid - Central Dashboard</p>
            </div>
          </div>
          
          <div className="controls">
            <div className="status-badge">
              <div className={`dot ${connections.gov ? 'online' : ''}`}></div>
              {connections.gov ? 'Gov Node Online' : 'Gov Node Offline'}
            </div>
            
            {connections.gov ? (
              <button onClick={() => disconnectNode('gov')} className="btn btn-disconnect">
                <Unlink size={18} /> Disconnect Gov
              </button>
            ) : (
              <button onClick={() => connectNode('gov')} className="btn btn-connect">
                <LinkIcon size={18} /> Connect Gov Node
              </button>
            )}
          </div>
        </header>

        {isTheft && (
          <div className="error-banner" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid red' }}>
            <AlertTriangle size={32} color="red" />
            <div>
              <h4 style={{ fontWeight: 800, color: 'red' }}>CRITICAL: WATER THEFT DETECTED</h4>
              <p style={{ color: 'red' }}>Government flow is active but consumer nodes report zero usage. Possible pipeline breach or bypass.</p>
            </div>
          </div>
        )}

        {/* GOVERNMENT DASHBOARD */}
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-main)' }}>Government Source Telemetry</h2>
        <div className="main-grid">
          <div className="metric-card" style={{ '--card-glow': 'var(--color-flow)', '--card-color': 'var(--color-flow)' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">Flow Velocity</h3>
                <div className="card-value">{govData.flow.toFixed(2)}<span className="card-unit">L/min</span></div>
              </div>
              <div className="card-icon"><Activity size={24} /></div>
            </div>
          </div>

          <div className="metric-card" style={{ '--card-glow': 'var(--color-tds)', '--card-color': 'var(--color-tds)' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">Purity Index (TDS)</h3>
                <div className="card-value">{govData.tds.toFixed(0)}<span className="card-unit">PPM</span></div>
              </div>
              <div className="card-icon"><Zap size={24} /></div>
            </div>
          </div>

          <div className="metric-card" style={{ '--card-glow': 'var(--color-turb)', '--card-color': 'var(--color-turb)' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">Clarity (Turbidity)</h3>
                <div className="card-value">{govData.turbidity.toFixed(1)}<span className="card-unit">NTU</span></div>
              </div>
              <div className="card-icon"><Waves size={24} /></div>
            </div>
          </div>
        </div>

        {/* CONSUMER NODES */}
        <h2 style={{ margin: '3rem 0 1rem 0', color: 'var(--text-main)' }}>Consumer Nodes Management</h2>
        <div className="bottom-grid">
          
          {/* Consumer 1: Ramesh */}
          <div className="info-card" style={{ border: rameshData.tamper ? '2px solid red' : '' }}>
            <div className="info-header" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Database className="icon-main" size={24} />
                <h3>Consumer: Ramesh</h3>
              </div>
              {connections.ramesh ? 
                <button onClick={() => disconnectNode('ramesh')} className="btn btn-disconnect" style={{ padding: '0.5rem 1rem' }}>Disconnect</button> :
                <button onClick={() => connectNode('ramesh')} className="btn btn-connect" style={{ padding: '0.5rem 1rem' }}>Connect Node</button>
              }
            </div>

            {rameshData.tamper && (
              <div style={{ padding: '0.5rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '1rem', fontWeight: 'bold', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <AlertOctagon size={18} /> TAMPER DETECTED! Valve Locked.
              </div>
            )}
            {rameshData.emergency && (
              <div style={{ padding: '0.5rem', background: '#fef3c7', color: '#b45309', borderRadius: '8px', marginBottom: '1rem', fontWeight: 'bold' }}>
                Emergency Water Access Active
              </div>
            )}

            <div className="data-row">
              <span className="data-label">Live Flow Rate</span>
              <span className="data-val">{rameshData.flow.toFixed(2)} L/min</span>
            </div>
            <div className="data-row">
              <span className="data-label">Total Consumption</span>
              <span className="data-val val-highlight">{rameshData.total_flow.toFixed(2)} L</span>
            </div>
            <div className="data-row">
              <span className="data-label">Valve Status</span>
              <span className="data-val" style={{ color: rameshData.valve ? 'var(--color-turb)' : 'red' }}>
                {rameshData.valve ? 'OPEN' : 'CLOSED'}
              </span>
            </div>
            
            {/* Gov Controls for Ramesh */}
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
              <button onClick={() => sendCommand('ramesh', rameshData.valve ? 'VALVE_OFF' : 'VALVE_ON')} 
                      style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: 'white' }}>
                <Power size={16} /> Toggle Valve
              </button>
              {rameshData.tamper && (
                <button onClick={() => sendCommand('ramesh', 'RESET_TAMPER')} 
                        style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
                  Reset Tamper Lock
                </button>
              )}
            </div>
          </div>

          {/* Consumer 2: Priya */}
          <div className="info-card" style={{ border: priyaData.tamper ? '2px solid red' : '' }}>
            <div className="info-header" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Database className="icon-main" size={24} />
                <h3>Consumer: Priya</h3>
              </div>
              {connections.priya ? 
                <button onClick={() => disconnectNode('priya')} className="btn btn-disconnect" style={{ padding: '0.5rem 1rem' }}>Disconnect</button> :
                <button onClick={() => connectNode('priya')} className="btn btn-connect" style={{ padding: '0.5rem 1rem' }}>Connect Node</button>
              }
            </div>

            {priyaData.tamper && (
              <div style={{ padding: '0.5rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '1rem', fontWeight: 'bold', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <AlertOctagon size={18} /> TAMPER DETECTED! Valve Locked.
              </div>
            )}
            {priyaData.emergency && (
              <div style={{ padding: '0.5rem', background: '#fef3c7', color: '#b45309', borderRadius: '8px', marginBottom: '1rem', fontWeight: 'bold' }}>
                Emergency Water Access Active
              </div>
            )}

            <div className="data-row">
              <span className="data-label">Live Flow Rate</span>
              <span className="data-val">{priyaData.flow.toFixed(2)} L/min</span>
            </div>
            <div className="data-row">
              <span className="data-label">Total Consumption</span>
              <span className="data-val val-highlight">{priyaData.total_flow.toFixed(2)} L</span>
            </div>
            <div className="data-row">
              <span className="data-label">Valve Status</span>
              <span className="data-val" style={{ color: priyaData.valve ? 'var(--color-turb)' : 'red' }}>
                {priyaData.valve ? 'OPEN' : 'CLOSED'}
              </span>
            </div>
            
            {/* Gov Controls for Priya */}
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
              <button onClick={() => sendCommand('priya', priyaData.valve ? 'VALVE_OFF' : 'VALVE_ON')} 
                      style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: 'white' }}>
                <Power size={16} /> Toggle Valve
              </button>
              {priyaData.tamper && (
                <button onClick={() => sendCommand('priya', 'RESET_TAMPER')} 
                        style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
                  Reset Tamper Lock
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
