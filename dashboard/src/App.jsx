import React, { useState, useRef, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  Droplets, Zap, Activity, Waves, Unlink, Link as LinkIcon,
  ShieldCheck, Database, AlertTriangle, Power, AlertOctagon,
  RefreshCcw, LogOut, Download, MapPin, Home, Power as PowerIcon, Activity as ActivityIcon
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

function App() {
  const [govData, setGovData] = useState({ flow: 0, tds: 0, turbidity: 0, total_flow: 0 });
  const [rameshData, setRameshData] = useState({ flow: 0, total_flow: 0, valve: true, tamper: false, emergency: false, emergency_used: 0 });
  const [priyaData, setPriyaData] = useState({ flow: 0, total_flow: 0, valve: true, tamper: false, emergency: false, emergency_used: 0 });

  const [connections, setConnections] = useState({ gov: false, ramesh: false, priya: false });
  
  const portsRef = useRef({ gov: null, ramesh: null, priya: null });
  const readersRef = useRef({ gov: null, ramesh: null, priya: null });

  // Theft & Leakage Detection Logic
  // Leakage / Cut Pipe: If Gov says water is flowing fast, but Consumer says valve is open and 0 flow.
  const rameshLeak = connections.ramesh && rameshData.valve && govData.flow > 0.5 && rameshData.flow < 0.1;
  const priyaLeak = connections.priya && priyaData.valve && govData.flow > 0.5 && priyaData.flow < 0.1;
  const isTheft = govData.flow > 0.5 && (rameshData.flow + priyaData.flow) < 0.1 && (!rameshData.valve || !priyaData.valve);

  // Balance Management
  const rameshBalance = 500 - (rameshData.total_flow * 2);
  const priyaBalance = 500 - (priyaData.total_flow * 2);
  const isRameshBlocked = rameshBalance <= 0 && !rameshData.emergency;
  const isPriyaBlocked = priyaBalance <= 0 && !priyaData.emergency;

  useEffect(() => {
    if (connections.ramesh && isRameshBlocked && rameshData.valve) {
      sendCommand('ramesh', 'VALVE_OFF');
    }
    if (connections.priya && isPriyaBlocked && priyaData.valve) {
      sendCommand('priya', 'VALVE_OFF');
    }
  }, [isRameshBlocked, rameshData.valve, connections.ramesh, isPriyaBlocked, priyaData.valve, connections.priya]);

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

  const renderConsumerView = (name, nodeKey, consumerData) => {
    let waterQualityStatus = "SENSOR ERROR";
    let waterQualityNote = "CHECK SENSORS";
    let qualityBorder = "#fef08a";
    let noteBg = "#fef3c7";
    let noteColor = "#92400e";

    if (connections.gov) {
      if (govData.tds < 300 && govData.turbidity < 5.0) {
        waterQualityStatus = "EXCELLENT";
        waterQualityNote = "Safe for Drinking";
        qualityBorder = "#86efac"; 
        noteBg = "#dcfce7";
        noteColor = "#166534";
      } else if (govData.tds < 600 && govData.turbidity < 10.0) {
        waterQualityStatus = "GOOD";
        waterQualityNote = "Acceptable Quality";
        qualityBorder = "#7dd3fc"; 
        noteBg = "#e0f2fe";
        noteColor = "#075985";
      } else if (govData.tds < 1000) {
        waterQualityStatus = "FAIR";
        waterQualityNote = "Needs Filtration";
        qualityBorder = "#fcd34d"; 
        noteBg = "#fef3c7";
        noteColor = "#92400e";
      } else {
        waterQualityStatus = "UNSAFE";
        waterQualityNote = "DO NOT DRINK";
        qualityBorder = "#fca5a5"; 
        noteBg = "#fee2e2";
        noteColor = "#b91c1c";
      }
    }

    return (
    <div className="app-container">
      {/* Header Profile */}
      <div className="consumer-header">
        <div>
          <p className="greeting-text">GOOD MORNING,</p>
          <h1 className="user-name">{name}</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn-outline" style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger-light)' }}>
            Logout
          </button>
        </div>
      </div>

      {/* Balance Card */}
      <div className="balance-card">
        <div className="balance-header">
          <span className="balance-label"><Droplets size={16} /> CURRENT BALANCE</span>
          <button className="recharge-btn"><Zap size={16} fill="currentColor" /> Recharge Now</button>
        </div>
        <div className="balance-amount">₹{ (500 - consumerData.total_flow * 2).toFixed(2) }</div>
        <div className="billing-rate">Billing Rate: ₹2/L</div>
        
        <div className="usage-stats">
          <div className="usage-box">
            <div className="usage-box-label">TODAY'S USAGE</div>
            <div className="usage-box-val">{(consumerData.total_flow).toFixed(0)} L</div>
          </div>
          <div className="usage-box">
            <div className="usage-box-label">MONTHLY USAGE (EST.)</div>
            <div className="usage-box-val">{(consumerData.total_flow * 30).toFixed(0)} L</div>
          </div>
        </div>
      </div>

      {/* Connection Status Banner */}
      {!connections[nodeKey] && (
        <div style={{ background: '#334155', color: '#94a3b8', padding: '1.5rem', borderRadius: '16px', display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2rem', borderLeft: '4px solid #ef4444' }}>
          <Power size={24} />
          <div>
            <h4 style={{ color: 'white', marginBottom: '0.25rem' }}>HARDWARE OFFLINE</h4>
            <p style={{ fontSize: '0.875rem' }}>Connection to your smart meter via serial cable is missing. Please click 'Connect Hardware' below.</p>
          </div>
        </div>
      )}

      {/* Valve Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 className="section-title">🏡 My Water System</h2>
        {!connections[nodeKey] ? 
          <button onClick={() => connectNode(nodeKey)} className="btn-outline">Connect Hardware</button> :
          <button onClick={() => disconnectNode(nodeKey)} className="btn-outline" style={{ color: 'red' }}>Disconnect</button>
        }
      </div>

      <div className="valve-control-card">
        <div className="valve-info">
          <div className="valve-label">MAIN VALVE</div>
          <div className="valve-status">{connections[nodeKey] ? (consumerData.valve ? 'Active' : 'Closed') : 'Device Offline'}</div>
        </div>
        <button onClick={() => sendCommand(nodeKey, 'TRIGGER_SOS')} className="btn-sos">
          <AlertTriangle size={18} /> SOS
        </button>
        <button onClick={() => sendCommand(nodeKey, consumerData.valve ? 'VALVE_OFF' : 'VALVE_ON')} 
                className={`btn-valve ${!consumerData.valve ? 'closed' : ''}`}>
          {consumerData.valve ? 'CLOSE' : 'OPEN'}
        </button>
      </div>

      {/* Flow & Trends */}
      <div className="grid-2">
        <div>
          <div className="white-card" style={{ marginBottom: '1.5rem' }}>
            <h3 className="section-title" style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--color-info)' }}>
              <Droplets size={16} /> CURRENT HOME FLOW
            </h3>
            <div className="home-flow-val">{consumerData.flow.toFixed(2)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>L/min</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)' }}>TOTAL BILLED</span>
              <span className="home-flow-total">{(consumerData.total_flow).toFixed(1)} L</span>
            </div>
          </div>

          <div className="sos-reserves-card">
            <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '1rem' }}>SOS EMERGENCY RESERVES</h3>
            <div style={{ fontSize: '2rem', fontWeight: 800 }}>{(consumerData.emergency ? 5 - consumerData.flow/60 : 0).toFixed(2)} L</div>
          </div>
        </div>

        <div className="white-card">
          <h3 className="section-title" style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: '#8b5cf6' }}>
            <Activity size={16} /> USAGE TREND
          </h3>
          <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
            Connect node to plot real-time usage graph
          </div>
        </div>
      </div>

      {/* City Supply Status */}
      <h2 className="section-title" style={{ marginTop: '3rem' }}>
        🏙️ City Supply <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#166534', padding: '0.2rem 0.5rem', borderRadius: '4px', marginLeft: '0.5rem' }}>LIVE QUALITY</span>
      </h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Rau Pumping Station (BGI Indore Area)</h3>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <MapPin size={12} /> {connections.gov ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      <div className="city-supply-grid">
        <div className="quality-card">
          <div className="quality-label">TDS LEVEL</div>
          <div className="quality-val">{connections.gov ? govData.tds.toFixed(0) : '---'} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>ppm</span></div>
          <div className="status-chip">{connections.gov ? 'CONNECTED' : 'NOT CONNECTED'}</div>
        </div>
        <div className="quality-card">
          <div className="quality-label">TURBIDITY</div>
          <div className="quality-val">{connections.gov ? govData.turbidity.toFixed(1) : '-.-'} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>NTU</span></div>
          <div className="status-chip" style={{ background: connections.gov ? (govData.waterStatus === 'CLEAR' || govData.turbidity < 5 ? '#dcfce7' : '#fee2e2') : 'var(--bg-main)', color: connections.gov ? (govData.waterStatus === 'CLEAR' || govData.turbidity < 5 ? '#166534' : '#991b1b') : 'inherit' }}>
            {connections.gov ? (govData.waterStatus || (govData.turbidity < 5 ? 'CLEAR' : 'DIRTY')) : 'NOT CONNECTED'}
          </div>
        </div>
        <div className="quality-card" style={{ border: `1px solid ${qualityBorder}` }}>
          <div className="quality-label">OVERALL QUALITY</div>
          <div className="quality-val" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>{waterQualityStatus}</div>
          <div style={{ background: noteBg, color: noteColor, padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 700, alignSelf: 'flex-start', fontSize: '0.875rem' }}>{waterQualityNote}</div>
        </div>
      </div>
      
      {!connections.gov && (
        <button onClick={() => connectNode('gov')} className="btn-outline" style={{ margin: '0 auto', display: 'flex', marginBottom: '2rem' }}>
          <LinkIcon size={16} /> Connect Gov Node for Live Quality
        </button>
      )}

    </div>
    );
  };

  const renderGovView = () => (
    <div className="gov-body">
      <div className="app-container">
        
        {isTheft && (
          <div style={{ background: '#fee2e2', border: '2px solid #ef4444', color: '#b91c1c', padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <AlertTriangle size={32} />
            <div>
              <h3 style={{ fontWeight: 800 }}>CRITICAL WATER THEFT DETECTED</h3>
              <p>Government node indicates flow, but Consumer nodes show zero flow. Illegal bypass detected.</p>
            </div>
          </div>
        )}

        <div className="gov-header-card">
          <div className="gov-brand">
            <div className="gov-icon-wrapper">
              <Droplets size={24} />
            </div>
            <div>
              <h1 className="gov-title">JAL BOARD</h1>
              <p className="gov-subtitle">SMART WATER GRID - CENTRAL DASHBOARD</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div className="gov-status-badge">
              <div className="gov-status-dot" style={{ background: connections.gov ? '#10b981' : '#ef4444' }}></div>
              {connections.gov ? 'Gov Node Online' : 'Gov Node Offline'}
            </div>
            
            {!connections.gov ? (
              <button className="gov-btn-dark" onClick={() => connectNode('gov')}>
                <LinkIcon size={18} /> Connect Gov Node
              </button>
            ) : (
              <button className="gov-btn-dark" onClick={() => disconnectNode('gov')} style={{ background: '#ef4444' }}>
                <Unlink size={18} /> Disconnect
              </button>
            )}
          </div>
        </div>

        <h2 className="gov-section-title">Government Source Telemetry</h2>
        <div className="gov-telemetry-grid">
          <div className="gov-telemetry-card">
            <div className="gov-telemetry-label">
              FLOW VELOCITY
              <div style={{ padding: '0.4rem', background: '#e0f2fe', borderRadius: '8px', color: '#0ea5e9' }}><ActivityIcon size={16} /></div>
            </div>
            <div className="gov-telemetry-value" style={{ color: '#0ea5e9' }}>
              {govData.flow.toFixed(2)} <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>L/min</span>
            </div>
          </div>

          <div className="gov-telemetry-card">
            <div className="gov-telemetry-label">
              PURITY INDEX (TDS)
              <div style={{ padding: '0.4rem', background: '#fef3c7', borderRadius: '8px', color: '#f59e0b' }}><Zap size={16} /></div>
            </div>
            <div className="gov-telemetry-value" style={{ color: '#f59e0b' }}>
              {govData.tds.toFixed(0)} <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>PPM</span>
            </div>
          </div>

          <div className="gov-telemetry-card">
            <div className="gov-telemetry-label">
              CLARITY (TURBIDITY)
              <div style={{ padding: '0.4rem', background: '#dcfce7', borderRadius: '8px', color: '#10b981' }}><Waves size={16} /></div>
            </div>
            <div className="gov-telemetry-value" style={{ color: '#10b981' }}>
              {govData.turbidity.toFixed(1)} <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>NTU</span>
            </div>
          </div>
        </div>

        <h2 className="gov-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Home size={24} color="#f59e0b" /> Smart Meter Management
        </h2>
        
        <div className="gov-consumer-grid">
          
          {/* Ramesh Card */}
          <div className="smart-meter-card" style={{ border: rameshData.tamper || rameshLeak ? '2px solid #ef4444' : '1px solid #e2e8f0' }}>
            <div className="sm-card-top">
              <div>
                <div className="sm-name">Ramesh Kumar (Umaria, near BGI)</div>
                <div className="sm-status">{connections.ramesh ? 'Online' : 'Offline'}</div>
              </div>
              <div className="sm-badges">
                <div className="sm-badge-green">₹{rameshBalance.toFixed(0)} +</div>
                {!connections.ramesh ? (
                  <button className="sm-badge-gray" onClick={() => connectNode('ramesh')}>CONNECT</button>
                ) : (
                  <button className="sm-badge-gray" onClick={() => disconnectNode('ramesh')} style={{ background: '#fee2e2', color: '#ef4444' }}>DISCONNECT</button>
                )}
              </div>
            </div>

            {rameshData.tamper && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginBottom: '1rem' }}>METER REMOVED / TAMPERED! VALVE LOCKED</div>}
            {rameshLeak && <div style={{ background: '#fef3c7', color: '#92400e', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginBottom: '1rem' }}>LEAKAGE / PIPE CUT DETECTED! (Flow Drop)</div>}
            {isRameshBlocked && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginBottom: '1rem' }}>PAYMENT PENDING - VALVE AUTO BLOCKED</div>}

            <div className="sm-stats-grid">
              <div>
                <div className="sm-stat-label">FLOW RATE</div>
                <div className="sm-stat-val">{rameshData.flow.toFixed(2)} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>L/min</span></div>
              </div>
              <div style={{ borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
                <div className="sm-stat-label">BILLED USAGE</div>
                <div className="sm-stat-val">{rameshData.total_flow.toFixed(2)} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>L</span></div>
              </div>
              <div>
                <div className="sm-stat-label">
                  <span style={{ background: '#ef4444', color: 'white', padding: '0.1rem 0.3rem', borderRadius: '4px', fontSize: '0.5rem' }}>SOS</span> EMERGENCY
                </div>
                <div className="sm-stat-val">{(rameshData.emergency ? 5 : 0).toFixed(1)} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>L (₹0)</span></div>
              </div>
            </div>

            <div className="sm-valve-row">
              <div className="sm-valve-label">VALVE</div>
              <div className="sm-valve-status" style={{ color: rameshData.valve ? '#10b981' : '#ef4444' }}>
                <div className="sm-valve-dot" style={{ background: rameshData.valve ? '#10b981' : '#ef4444' }}></div>
                {connections.ramesh ? (rameshData.valve ? 'OPEN' : 'CLOSED') : 'UNKNOWN'}
              </div>
            </div>

            <div className="sm-btn-row">
              <button className="sm-btn sm-btn-block" onClick={() => sendCommand('ramesh', 'VALVE_OFF')}>
                <AlertOctagon size={16} /> Block User
              </button>
              <button className="sm-btn sm-btn-sos" onClick={() => sendCommand('ramesh', 'TRIGGER_SOS')}>
                SOS EMERGENCY
              </button>
              <button className={`sm-btn ${rameshData.valve ? 'sm-btn-close' : 'sm-btn-open'}`} onClick={() => sendCommand('ramesh', rameshData.valve ? 'VALVE_OFF' : 'VALVE_ON')}>
                {rameshData.valve ? 'CLOSE VALVE' : 'OPEN VALVE'}
              </button>
            </div>
            
            {rameshData.tamper && (
              <button className="sm-btn sm-btn-block" style={{ marginTop: '1rem', width: '100%', borderColor: '#ef4444' }} onClick={() => sendCommand('ramesh', 'RESET_TAMPER')}>
                RESET TAMPER LOCK
              </button>
            )}
          </div>

          {/* Priya Card */}
          <div className="smart-meter-card" style={{ border: priyaData.tamper || priyaLeak ? '2px solid #ef4444' : '1px solid #e2e8f0' }}>
            <div className="sm-card-top">
              <div>
                <div className="sm-name">Priya Patel (Pigdamber, near BGI)</div>
                <div className="sm-status">{connections.priya ? 'Online' : 'Offline'}</div>
              </div>
              <div className="sm-badges">
                <div className="sm-badge-green">₹{priyaBalance.toFixed(0)} +</div>
                {!connections.priya ? (
                  <button className="sm-badge-gray" onClick={() => connectNode('priya')}>CONNECT</button>
                ) : (
                  <button className="sm-badge-gray" onClick={() => disconnectNode('priya')} style={{ background: '#fee2e2', color: '#ef4444' }}>DISCONNECT</button>
                )}
              </div>
            </div>

            {priyaData.tamper && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginBottom: '1rem' }}>METER REMOVED / TAMPERED! VALVE LOCKED</div>}
            {priyaLeak && <div style={{ background: '#fef3c7', color: '#92400e', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginBottom: '1rem' }}>LEAKAGE / PIPE CUT DETECTED! (Flow Drop)</div>}
            {isPriyaBlocked && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginBottom: '1rem' }}>PAYMENT PENDING - VALVE AUTO BLOCKED</div>}

            <div className="sm-stats-grid">
              <div>
                <div className="sm-stat-label">FLOW RATE</div>
                <div className="sm-stat-val">{priyaData.flow.toFixed(2)} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>L/min</span></div>
              </div>
              <div style={{ borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
                <div className="sm-stat-label">BILLED USAGE</div>
                <div className="sm-stat-val">{priyaData.total_flow.toFixed(2)} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>L</span></div>
              </div>
              <div>
                <div className="sm-stat-label">
                  <span style={{ background: '#ef4444', color: 'white', padding: '0.1rem 0.3rem', borderRadius: '4px', fontSize: '0.5rem' }}>SOS</span> EMERGENCY
                </div>
                <div className="sm-stat-val">{(priyaData.emergency ? 5 : 0).toFixed(1)} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>L (₹0)</span></div>
              </div>
            </div>

            <div className="sm-valve-row">
              <div className="sm-valve-label">VALVE</div>
              <div className="sm-valve-status" style={{ color: priyaData.valve ? '#10b981' : '#ef4444' }}>
                <div className="sm-valve-dot" style={{ background: priyaData.valve ? '#10b981' : '#ef4444' }}></div>
                {connections.priya ? (priyaData.valve ? 'OPEN' : 'CLOSED') : 'UNKNOWN'}
              </div>
            </div>

            <div className="sm-btn-row">
              <button className="sm-btn sm-btn-block" onClick={() => sendCommand('priya', 'VALVE_OFF')}>
                <AlertOctagon size={16} /> Block User
              </button>
              <button className="sm-btn sm-btn-sos" onClick={() => sendCommand('priya', 'TRIGGER_SOS')}>
                SOS EMERGENCY
              </button>
              <button className={`sm-btn ${priyaData.valve ? 'sm-btn-close' : 'sm-btn-open'}`} onClick={() => sendCommand('priya', priyaData.valve ? 'VALVE_OFF' : 'VALVE_ON')}>
                {priyaData.valve ? 'CLOSE VALVE' : 'OPEN VALVE'}
              </button>
            </div>
            
            {priyaData.tamper && (
              <button className="sm-btn sm-btn-block" style={{ marginTop: '1rem', width: '100%', borderColor: '#ef4444' }} onClick={() => sendCommand('priya', 'RESET_TAMPER')}>
                RESET TAMPER LOCK
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );

  return (
    <Routes>
      <Route path="/gov" element={renderGovView()} />
      <Route path="/consumer/ramesh" element={renderConsumerView("Ramesh Kumar", "ramesh", rameshData)} />
      <Route path="/consumer/priya" element={renderConsumerView("Priya Singh", "priya", priyaData)} />
      
      <Route path="*" element={renderGovView()} />
    </Routes>
  );
}

export default App;
