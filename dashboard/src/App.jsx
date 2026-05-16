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
  const [rameshData, setRameshData] = useState({ flow: 0, total_flow: 0, valve: true, tamper: false, emergency: false, sos_used: 0, sos_limit: 0.5 });
  const [priyaData, setPriyaData] = useState({ flow: 0, total_flow: 0, valve: true, tamper: false, emergency: false, sos_sec_left: 60 });

  const [connections, setConnections] = useState({ gov: false, ramesh: false, priya: false });
  const [rameshRecharges, setRameshRecharges] = useState(0);
  const [priyaRecharges, setPriyaRecharges] = useState(0);
  const [paymentModal, setPaymentModal] = useState({ isOpen: false, consumer: null, amount: 100 });
  const [manualBlocks, setManualBlocks] = useState({ ramesh: false, priya: false });
  
  const portsRef = useRef({ gov: null, ramesh: null, priya: null });
  const readersRef = useRef({ gov: null, ramesh: null, priya: null });

  const [isTheft, setIsTheft] = useState(false);
  const theftTimerRef = useRef(null);

  // Theft & Leakage Detection Logic
  const rameshLeak = connections.ramesh && rameshData.valve && govData.flow > 0.05 && rameshData.flow < 0.01;
  const priyaLeak = false; // No flow sensor for Priya, so no leak detection possible via sensor

  useEffect(() => {
    // New Theft Logic: Gov > 0 and Ramesh == 0 for 5 seconds (Priya excluded as she has no sensor)
    const conditionMet = govData.flow > 0.05 && rameshData.flow < 0.01;

    if (conditionMet) {
      if (!theftTimerRef.current) {
        theftTimerRef.current = setTimeout(() => {
          setIsTheft(true);
        }, 5000);
      }
    } else {
      if (theftTimerRef.current) {
        clearTimeout(theftTimerRef.current);
        theftTimerRef.current = null;
      }
      setIsTheft(false);
    }
  }, [govData.flow, rameshData.flow, priyaData.flow]);

  // Balance Management (Accelerated for hackathon demo: starts at Rs 10 instead of 500)
  const rameshBalance = 10 + rameshRecharges - (rameshData.total_flow * 2);
  const priyaBalance = 10 + priyaRecharges - (priyaData.total_flow * 2);
  const isRameshBlocked = rameshBalance <= 0 && !rameshData.emergency;
  const isPriyaBlocked = priyaBalance <= 0 && !priyaData.emergency;

  // Enforcement Effect: Ensure blocked users actually have their valves closed (unless in SOS mode)
  useEffect(() => {
    if (connections.ramesh && (isRameshBlocked || manualBlocks.ramesh) && !rameshData.emergency && rameshData.valve) {
      sendCommand('ramesh', 'VALVE_OFF');
    }
    if (connections.priya && (isPriyaBlocked || manualBlocks.priya) && !priyaData.emergency && priyaData.valve) {
      sendCommand('priya', 'VALVE_OFF');
    }
  }, [isRameshBlocked, manualBlocks.ramesh, rameshData.valve, rameshData.emergency, connections.ramesh, isPriyaBlocked, manualBlocks.priya, priyaData.valve, priyaData.emergency, connections.priya]);

  // --- Cross-Tab Synchronization (BroadcastChannel) ---
  const bc = useRef(new BroadcastChannel('bgi_sync'));

  useEffect(() => {
    bc.current.onmessage = (event) => {
      const { type, node, data, cmd } = event.data;
      if (type === 'DATA_UPDATE') {
        if (node === 'gov') setGovData(prev => ({ ...prev, ...data }));
        else if (node === 'ramesh') setRameshData(prev => ({ ...prev, ...data }));
        else if (node === 'priya') setPriyaData(prev => ({ ...prev, ...data }));
        setConnections(prev => ({ ...prev, [node]: true }));
      } else if (type === 'COMMAND') {
        if (portsRef.current[node]) executeSerialCommand(node, cmd);
      } else if (type === 'STATE_SYNC') {
        setConnections(data.connections);
        setManualBlocks(data.manualBlocks);
        setRameshRecharges(data.rameshRecharges);
        setPriyaRecharges(data.priyaRecharges);
      }
    };
  }, []);

  useEffect(() => {
    // Periodically broadcast sync state
    const interval = setInterval(() => {
      bc.current.postMessage({ 
        type: 'STATE_SYNC', 
        data: { connections, manualBlocks, rameshRecharges, priyaRecharges } 
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [connections, manualBlocks, rameshRecharges, priyaRecharges]);

  useEffect(() => {
    const autoReconnect = async () => {
      try {
        const ports = await navigator.serial.getPorts();
        for (const port of ports) {
          if (port.readable === null) {
            await port.open({ baudRate: 115200 });
            readLoop(port);
          }
        }
      } catch (err) {
        console.error("Auto-reconnect failed:", err);
      }
    };
    autoReconnect();
  }, []);

  const connectNode = async () => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      readLoop(port);
    } catch (err) {
      console.error("Connection error:", err);
    }
  };

  const disconnectNode = async (node) => {
    try {
      const reader = readersRef.current[node];
      const port = portsRef.current[node];
      if (reader) await reader.cancel();
      if (port) await port.close();
      setConnections(prev => ({ ...prev, [node]: false }));
      portsRef.current[node] = null;
      readersRef.current[node] = null;
    } catch(err) {
      console.error(`Disconnect error for ${node}:`, err);
    }
  };

  const readLoop = async (port) => {
    try {
      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      let detectedNode = null;

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
              let nodeKey = null;
              if (jsonData.node === 'government_uno') nodeKey = 'gov';
              else if (jsonData.node === 'Ramesh') nodeKey = 'ramesh';
              else if (jsonData.node === 'Priya') nodeKey = 'priya';

              if (nodeKey) {
                if (!detectedNode) {
                  detectedNode = nodeKey;
                  portsRef.current[nodeKey] = port;
                  readersRef.current[nodeKey] = reader;
                  setConnections(prev => ({ ...prev, [nodeKey]: true }));
                }
                if (nodeKey === 'gov') setGovData(prev => ({ ...prev, ...jsonData }));
                else if (nodeKey === 'ramesh') setRameshData(prev => ({ ...prev, ...jsonData }));
                else if (nodeKey === 'priya') setPriyaData(prev => ({ ...prev, ...jsonData }));
                bc.current.postMessage({ type: 'DATA_UPDATE', node: nodeKey, data: jsonData });
              }
            }
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error("Read error:", err);
      setConnections(prev => ({ ...prev, gov: false, ramesh: false, priya: false }));
    }
  };

  const sendCommand = async (node, cmd) => {
    if (portsRef.current[node]) {
      executeSerialCommand(node, cmd);
    } else {
      bc.current.postMessage({ type: 'COMMAND', node, cmd });
    }
  };

  const executeSerialCommand = async (node, cmd) => {
    const port = portsRef.current[node];
    if (port && port.writable) {
      try {
        const writer = port.writable.getWriter();
        await writer.write(new TextEncoder().encode(cmd + '\n'));
        writer.releaseLock();
      } catch (err) {
        console.error(`Command error for ${node}:`, err);
      }
    }
  };

  // --- Sub-components for stable routing ---
  const ConsumerDashboard = ({ name, nodeKey, consumerData }) => {
    let waterQualityStatus = "SENSOR ERROR";
    let waterQualityNote = "CHECK SENSORS";
    let qualityBorder = "#fef08a";
    let noteBg = "#fef3c7";
    let noteColor = "#92400e";

    if (connections.gov) {
      if (govData.tds < 300 && govData.turbidity > 4.0) {
        waterQualityStatus = "EXCELLENT";
        waterQualityNote = "Safe for Drinking";
        qualityBorder = "#86efac"; 
        noteBg = "#dcfce7";
        noteColor = "#166534";
      } else if (govData.tds < 600 && govData.turbidity > 3.5) {
        waterQualityStatus = "GOOD";
        waterQualityNote = "Acceptable Quality";
        qualityBorder = "#7dd3fc"; 
        noteBg = "#e0f2fe";
        noteColor = "#075985";
      } else if (govData.tds < 1000 && govData.turbidity > 3.0) {
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

    const currentBalance = nodeKey === 'ramesh' ? rameshBalance : priyaBalance;

    return (
      <div className="consumer-only-page">
        <div className="app-container">
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

          <div className="balance-card">
            <div className="balance-header">
              <span className="balance-label"><Droplets size={16} /> CURRENT BALANCE</span>
              <button className="recharge-btn" onClick={() => setPaymentModal({ isOpen: true, consumer: nodeKey, amount: 100 })}>
                <Zap size={16} fill="currentColor" /> Recharge Now
              </button>
            </div>
            <div className="balance-amount">₹{ currentBalance.toFixed(2) }</div>
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

          {!connections[nodeKey] && (
            <div style={{ background: '#334155', color: '#94a3b8', padding: '1.5rem', borderRadius: '16px', display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2rem', borderLeft: '4px solid #ef4444' }}>
              <Power size={24} />
              <div>
                <h4 style={{ color: 'white', marginBottom: '0.25rem' }}>HARDWARE OFFLINE</h4>
                <p style={{ fontSize: '0.875rem' }}>Connection to your smart meter via serial cable is missing. Please click 'Connect Hardware' below.</p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 className="section-title">🏡 My Water System</h2>
            {!connections[nodeKey] ? 
              <button onClick={() => connectNode()} className="btn-outline">Connect Hardware</button> :
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
            <button 
              onClick={() => {
                if (nodeKey === 'ramesh' && (isRameshBlocked || manualBlocks.ramesh || consumerData.tamper)) return;
                if (nodeKey === 'priya' && (isPriyaBlocked || manualBlocks.priya || consumerData.tamper)) return;
                sendCommand(nodeKey, consumerData.valve ? 'VALVE_OFF' : 'VALVE_ON');
              }} 
              className={`btn-valve ${!consumerData.valve ? 'closed' : ''}`}
              style={{ 
                opacity: ((nodeKey === 'ramesh' && (isRameshBlocked || manualBlocks.ramesh || consumerData.tamper)) || 
                          (nodeKey === 'priya' && (isPriyaBlocked || manualBlocks.priya || consumerData.tamper))) ? 0.5 : 1, 
                cursor: ((nodeKey === 'ramesh' && (isRameshBlocked || manualBlocks.ramesh || consumerData.tamper)) || 
                         (nodeKey === 'priya' && (isPriyaBlocked || manualBlocks.priya || consumerData.tamper))) ? 'not-allowed' : 'pointer' 
              }}
              disabled={((nodeKey === 'ramesh' && (isRameshBlocked || manualBlocks.ramesh || consumerData.tamper)) || 
                         (nodeKey === 'priya' && (isPriyaBlocked || manualBlocks.priya || consumerData.tamper)))}
            >
              {((nodeKey === 'ramesh' && (isRameshBlocked || manualBlocks.ramesh || consumerData.tamper)) || 
                (nodeKey === 'priya' && (isPriyaBlocked || manualBlocks.priya || consumerData.tamper))) 
                ? 'LOCKED BY GOV' 
                : (consumerData.valve ? 'CLOSE' : 'OPEN')}
            </button>
          </div>

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
                {nodeKey === 'ramesh' ? (
                  <>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{(consumerData.sos_used || 0).toFixed(2)} L / {(consumerData.sos_limit || 0.5).toFixed(1)} L</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, marginTop: '0.5rem' }}>
                      Pending: {((consumerData.sos_limit || 0.5) - (consumerData.sos_used || 0)).toFixed(2)} Litres
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{consumerData.sos_sec_left || 60} SECONDS</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, marginTop: '0.5rem' }}>
                      Status: {consumerData.emergency ? 'Emergency Water Flowing' : 'Quota Ready (1 Min)'}
                    </div>
                  </>
                )}
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

          <h2 className="section-title" style={{ marginTop: '3rem', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Waves size={20} color="var(--color-primary)" /> City Supply <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#166534', padding: '0.2rem 0.5rem', borderRadius: '4px', marginLeft: 'auto' }}>LIVE</span>
          </h2>
          
          <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '20px', border: '1px solid #e2e8f0', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#64748b' }}>RAU PUMPING STATION</div>
              <div style={{ fontSize: '0.75rem', color: connections.gov ? '#10b981' : '#94a3b8', fontWeight: 700 }}>{connections.gov ? '● ONLINE' : '○ OFFLINE'}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>TDS LEVEL</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{govData.tds.toFixed(0)} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ppm</span></div>
              </div>
              <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>TURBIDITY</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{govData.turbidity.toFixed(2)} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>V</span></div>
              </div>
            </div>

            <div style={{ 
              marginTop: '1rem', 
              padding: '1rem', 
              borderRadius: '12px', 
              background: noteBg, 
              border: `1px solid ${qualityBorder}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: noteColor, opacity: 0.8 }}>OVERALL QUALITY</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: noteColor }}>{waterQualityStatus}</div>
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: noteColor, background: 'rgba(255,255,255,0.5)', padding: '0.25rem 0.5rem', borderRadius: '6px' }}>
                {waterQualityNote}
              </div>
            </div>
          </div>
          
          {!connections.gov && (
            <button onClick={() => connectNode()} className="btn-outline" style={{ width: '100%', marginBottom: '2rem' }}>
              <LinkIcon size={16} /> Sync for Quality Data
            </button>
          )}
        </div>
      </div>
    );
  };

  const GovDashboard = () => (
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
              <button className="gov-btn-dark" onClick={() => connectNode()}>
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
              {govData.turbidity.toFixed(2)} <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>V</span>
            </div>
          </div>
        </div>

        <h2 className="gov-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Home size={24} color="#f59e0b" /> Smart Meter Management
        </h2>
        
        <div className="gov-consumer-grid">
          {/* Ramesh Card */}
          <div className="smart-meter-card" style={{ 
            border: rameshData.tamper || rameshLeak || rameshData.emergency ? '2px solid #ef4444' : '1px solid #e2e8f0',
            background: rameshData.emergency ? '#fef2f2' : 'white'
          }}>
            <div className="sm-card-top">
              <div>
                <div className="sm-name">Ramesh Kumar (Indore West)</div>
                <div className="sm-status">{connections.ramesh ? 'Online' : 'Offline'}</div>
              </div>
              <div className="sm-badges">
                <div className="sm-badge-green">₹{rameshBalance.toFixed(0)}</div>
                {!connections.ramesh ? (
                  <button className="sm-badge-gray" onClick={() => connectNode()}>CONNECT</button>
                ) : (
                  <button className="sm-badge-gray" onClick={() => disconnectNode('ramesh')} style={{ background: '#fee2e2', color: '#ef4444' }}>DISCONNECT</button>
                )}
              </div>
            </div>

            {rameshData.tamper && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginBottom: '1rem' }}>METER REMOVED / TAMPERED! VALVE LOCKED</div>}
            {rameshLeak && <div style={{ background: '#fef3c7', color: '#92400e', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginBottom: '1rem' }}>LEAKAGE / PIPE CUT DETECTED! (Flow Drop)</div>}
            {rameshData.emergency && <div style={{ background: '#ef4444', color: 'white', padding: '0.75rem', borderRadius: '8px', fontSize: '1rem', fontWeight: 800, textAlign: 'center', marginBottom: '1rem', letterSpacing: '0.05em' }}>SOS EMERGENCY ACTIVE</div>}
            {isRameshBlocked && !rameshData.emergency && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginBottom: '1rem' }}>PAYMENT PENDING - VALVE AUTO BLOCKED</div>}

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
                <div className="sm-stat-val">{(rameshData.sos_used || 0).toFixed(2)} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/ {(rameshData.sos_limit || 0.5).toFixed(1)} L</span></div>
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
              <button className={`sm-btn ${manualBlocks.ramesh ? 'sm-btn-close' : 'sm-btn-block'}`} onClick={() => {
                if (manualBlocks.ramesh) {
                  setManualBlocks(prev => ({ ...prev, ramesh: false }));
                  sendCommand('ramesh', 'VALVE_ON');
                } else {
                  setManualBlocks(prev => ({ ...prev, ramesh: true }));
                  sendCommand('ramesh', 'VALVE_OFF');
                }
              }}>
                {manualBlocks.ramesh ? 'Unblock User' : <><AlertOctagon size={16} /> Block User</>}
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
            {(rameshData.sos_used > 0 || rameshData.emergency) && (
              <button className="sm-btn" style={{ marginTop: '0.5rem', width: '100%', background: '#fee2e2', color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => sendCommand('ramesh', 'RESET_SOS')}>
                RESET SOS QUOTA
              </button>
            )}
          </div>

          {/* Priya Card */}
          <div className="smart-meter-card" style={{ 
            border: priyaData.tamper || priyaLeak || priyaData.emergency ? '2px solid #ef4444' : '1px solid #e2e8f0',
            background: priyaData.emergency ? '#fef2f2' : 'white'
          }}>
            <div className="sm-card-top">
              <div>
                <div className="sm-name">Priya Patel (Pigdamber, near BGI)</div>
                <div className="sm-status">{connections.priya ? 'Online' : 'Offline'}</div>
              </div>
              <div className="sm-badges">
                <div className="sm-badge-green">₹{priyaBalance.toFixed(0)}</div>
                {!connections.priya ? (
                  <button className="sm-badge-gray" onClick={() => connectNode()}>CONNECT</button>
                ) : (
                  <button className="sm-badge-gray" onClick={() => disconnectNode('priya')} style={{ background: '#fee2e2', color: '#ef4444' }}>DISCONNECT</button>
                )}
              </div>
            </div>

            {priyaData.tamper && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginBottom: '1rem' }}>METER REMOVED / TAMPERED! VALVE LOCKED</div>}
            {priyaLeak && <div style={{ background: '#fef3c7', color: '#92400e', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginBottom: '1rem' }}>LEAKAGE / PIPE CUT DETECTED! (Flow Drop)</div>}
            {priyaData.emergency && <div style={{ background: '#ef4444', color: 'white', padding: '0.75rem', borderRadius: '8px', fontSize: '1rem', fontWeight: 800, textAlign: 'center', marginBottom: '1rem', letterSpacing: '0.05em' }}>SOS EMERGENCY ACTIVE</div>}
            {isPriyaBlocked && !priyaData.emergency && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginBottom: '1rem' }}>PAYMENT PENDING - VALVE AUTO BLOCKED</div>}

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
                <div className="sm-stat-val">{priyaData.sos_sec_left || 60} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>SEC LEFT</span></div>
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
              <button className={`sm-btn ${manualBlocks.priya ? 'sm-btn-close' : 'sm-btn-block'}`} onClick={() => {
                if (manualBlocks.priya) {
                  setManualBlocks(prev => ({ ...prev, priya: false }));
                  sendCommand('priya', 'VALVE_ON');
                } else {
                  setManualBlocks(prev => ({ ...prev, priya: true }));
                  sendCommand('priya', 'VALVE_OFF');
                }
              }}>
                {manualBlocks.priya ? 'Unblock User' : <><AlertOctagon size={16} /> Block User</>}
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
            {priyaData.emergency && (
              <button className="sm-btn" style={{ marginTop: '0.5rem', width: '100%', background: '#fee2e2', color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => sendCommand('priya', 'RESET_SOS')}>
                RESET SOS TIMER
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Routes>
        <Route path="/gov" element={<GovDashboard />} />
        <Route path="/consumer/ramesh" element={<ConsumerDashboard name="Ramesh Kumar" nodeKey="ramesh" consumerData={rameshData} />} />
        <Route path="/consumer/priya" element={<ConsumerDashboard name="Priya Singh" nodeKey="priya" consumerData={priyaData} />} />
        <Route path="*" element={<GovDashboard />} />
      </Routes>
    
      {/* Payment Modal Overlay */}
      {paymentModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: 'white', padding: '2rem', borderRadius: '16px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#f97316' }}>⚡</span> Recharge via Razorpay
              </h2>
              <button onClick={() => setPaymentModal({ isOpen: false, consumer: null, amount: 100 })} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', color: '#94a3b8', cursor: 'pointer' }}>
                &times;
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Current Balance</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
                ₹{(paymentModal.consumer === 'ramesh' ? rameshBalance : priyaBalance).toFixed(2)}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {[50, 100, 200, 500].map(amt => (
                <button key={amt} onClick={() => setPaymentModal(prev => ({ ...prev, amount: amt }))} 
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#0f172a', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem' }}>
                  ₹{amt}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <input 
                type="number" 
                value={paymentModal.amount || ''} 
                onChange={(e) => setPaymentModal(prev => ({ ...prev, amount: Number(e.target.value) }))}
                placeholder="Enter amount (₹)" 
                style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1.125rem', textAlign: 'center', outline: 'none', color: '#64748b' }} 
              />
            </div>
            
            <button onClick={() => {
              if (paymentModal.consumer === 'ramesh') {
                setRameshRecharges(prev => prev + paymentModal.amount);
                if (isRameshBlocked) sendCommand('ramesh', 'VALVE_ON');
              } else {
                setPriyaRecharges(prev => prev + paymentModal.amount);
                if (isPriyaBlocked) sendCommand('priya', 'VALVE_ON');
              }
              setPaymentModal({ isOpen: false, consumer: null, amount: 100 });
            }} style={{ background: '#82b1ff', color: 'white', border: 'none', padding: '1rem', width: '100%', borderRadius: '12px', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', marginBottom: '1.5rem' }}>
              Pay ₹{paymentModal.amount} via Razorpay
            </button>
            
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
              🔒 Secured by Razorpay | Simulated for Demo
            </div>
          </div>
        </div>
      )}

    </>
  );
}

export default App;
