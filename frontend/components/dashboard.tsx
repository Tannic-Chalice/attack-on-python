// components/dashboard.tsx

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import axios from 'axios'
import dynamic from 'next/dynamic'
import React from 'react'

const ForceGraph2D: any = dynamic(
  // @ts-ignore
  () => import('react-force-graph-2d'),
  { ssr: false }
)

const BACKEND_URL = 'http://localhost:8000'

// --- Interfaces ---
interface DatasetStats {
  nodes: number
  transactions: number
  fraudulent_nodes: number
  time_range_days?: number
  fraud_rings?: number
}
interface ConfusionMatrix {
  tp: number; fp: number; tn: number; fn: number
}
interface ModelMetrics {
  precision: number; recall: number; auc: number; f1_score: number; accuracy: number; fraud_ring_count: number
  confusion_matrix: ConfusionMatrix
}
interface Dataset { nodes: any[]; transactions: any[] }
interface GraphNode {
  id: number; is_fraud_actual: number; is_fraud_predicted: number; is_in_ring: boolean; features: Record<string, number>
}
interface GraphLink {
  source: number; target: number; amount: number; is_fraud: number; time_step?: number; timestamp?: string; transaction_type?: string
}
interface GraphData { nodes: GraphNode[]; links: GraphLink[] }
interface FeatureImportance { feature_name: string; importance: number }
interface NeighborImportance { neighbor_id: number; importance: number }
interface NodeExplanation {
  node_id: number; top_features: FeatureImportance[]; top_neighbors: NeighborImportance[]
}
interface InvestigationReport {
  node_id: number; report: string; technical_data: NodeExplanation
  transaction_stats: { total_transactions: number; total_volume: number; avg_transaction: number; fraud_count: number }
}
interface RealtimeTransaction {
  type: string; transaction_id: number; timestamp: string; sender_id: number; receiver_id: number; amount: number
  is_alert: boolean; sender_risk_score: number; receiver_risk_score: number; fraud_actual: number; transaction_type: string
}
interface DiagnosticsData {
  total_nodes: number
  actual_fraud_nodes: number
  predicted_fraud_nodes_default: number
  fraud_rate_actual: number
  fraud_rate_predicted: number
  avg_fraud_probability: number
  threshold_analysis: Record<string, { alerts_triggered: number; percentage_of_total: number }>
  recommendation: string
}

  
// --- Data Table Sub-component ---
const DataTable = ({ title, data }: { title: string; data: any[] }) => {
    if (data.length === 0) return <div className="modal-table-container"><h3>{title}</h3><p>No data</p></div>
    const headers = Object.keys(data[0])
    return (
      <div className="modal-table-container">
        <h3>{title}</h3>
        <table className="modal-table">
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={index}>{headers.map((header) => <td key={`${index}-${header}`}>{String(row[header])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )
}

// --- Modal Sub-component ---
const DatasetModal = ({ dataset, onClose }: { dataset: Dataset; onClose: () => void }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header"><h2>Generated Dataset</h2><button onClick={onClose}>Close</button></div>
      <div className="modal-body"><DataTable title="Nodes" data={dataset.nodes} /><DataTable title="Transactions" data={dataset.transactions} /></div>
    </div>
  </div>
)

// --- Investigation Report Modal ---
const InvestigationReportModal = ({ report, onClose }: { report: InvestigationReport; onClose: () => void }) => {
  const downloadPDF = () => {
    const content = `SUSPICIOUS ACTIVITY REPORT (SAR)\nGenerated: ${new Date().toLocaleString()}\nNode ID: ${report.node_id}\n\n${report.report}\n\n---\nTRANSACTION STATISTICS:\n- Total Transactions: ${report.transaction_stats.total_transactions}\n- Total Volume: $${report.transaction_stats.total_volume.toFixed(2)}\n- Average Transaction: $${report.transaction_stats.avg_transaction.toFixed(2)}\n- Fraudulent Transactions: ${report.transaction_stats.fraud_count}`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `SAR_Node_${report.node_id}_${Date.now()}.txt`; a.click(); URL.revokeObjectURL(url)
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="report-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>🔍 Investigation Report - Node {report.node_id}</h2><div><button onClick={downloadPDF} style={{marginRight: '10px'}}>📥 Download</button><button onClick={onClose}>Close</button></div></div>
        <div className="modal-body report-body">
          <div className="report-content">{report.report.split('\n').map((line, idx) => <p key={idx}>{line}</p>)}</div>
          <div className="report-stats">
            <h3>Transaction Statistics</h3>
            <ul>
              <li><span>Total Transactions:</span> {report.transaction_stats.total_transactions}</li>
              <li><span>Total Volume:</span> ${report.transaction_stats.total_volume.toFixed(2)}</li>
              <li><span>Average Size:</span> ${report.transaction_stats.avg_transaction.toFixed(2)}</li>
              <li><span>Fraud Count:</span> {report.transaction_stats.fraud_count}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Model Diagnostics Modal ---
const StatCard = ({ label, value, subtitle, color }: { label: string, value: string | number, subtitle?: string, color: string }) => (
  <div style={{ background: '#0f172a', border: `1px solid ${color}`, borderRadius: '8px', padding: '15px', textAlign: 'center' }}>
    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color, marginBottom: '5px' }}>{value}</div>
    <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>{label}</div>
    {subtitle && <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '5px' }}>{subtitle}</div>}
  </div>
)

const ModelDiagnosticsModal = ({ onClose }: { onClose: () => void }) => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDiagnostics = async () => {
    setLoading(true); setError(null)
    try {
      const res = await axios.get(`${BACKEND_URL}/model_diagnostics`)
      setDiagnostics(res.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch diagnostics')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchDiagnostics() }, [])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔍 Model Quality Diagnostics</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="modal-body" style={{ background: '#1e293b' }}>
          <div style={{ padding: '10px' }}>
            <button onClick={fetchDiagnostics} disabled={loading} className="primary-btn" style={{ marginBottom: '20px' }}>
              {loading ? '⏳ Analyzing...' : '🔄 Refresh Analysis'}
            </button>

            {error && <div className="error">{error}</div>}

            {diagnostics && (
              <div>
                {/* Overview Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '30px' }}>
                  <StatCard label="Total Nodes" value={diagnostics.total_nodes} color="#3b82f6" />
                  <StatCard label="Actual Fraud" value={diagnostics.actual_fraud_nodes} subtitle={`${diagnostics.fraud_rate_actual.toFixed(1)}% of total`} color="#ef4444" />
                  <StatCard label="Predicted Fraud" value={diagnostics.predicted_fraud_nodes_default} subtitle={`${diagnostics.fraud_rate_predicted.toFixed(1)}% of total`} color="#f59e0b" />
                  <StatCard label="Avg Confidence" value={`${(diagnostics.avg_fraud_probability * 100).toFixed(1)}%`} color="#10b981" />
                </div>

                {/* Threshold Analysis */}
                <div className="card">
                  <h2 style={{color: '#3b82f6', borderBottom: '1px solid #334155', paddingBottom: '10px'}}>📊 Threshold Analysis</h2>
                  <p style={{ color: '#94a3b8', marginBottom: '20px' }}>Impact of changing detection sensitivity:</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {Object.entries(diagnostics.threshold_analysis).map(([threshold, data]) => {
                      const isRecommended = parseFloat(threshold) >= 0.75
                      return (
                        <div key={threshold} style={{
                          background: isRecommended ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0,0,0,0.2)',
                          border: isRecommended ? '1px solid #10b981' : '1px solid #334155',
                          borderRadius: '8px', padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                          <div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isRecommended ? '#10b981' : '#f8fafc' }}>
                              Threshold: {(parseFloat(threshold) * 100).toFixed(0)}% {isRecommended && '⭐'}
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                              {data.alerts_triggered} alerts ({data.percentage_of_total.toFixed(2)}% of nodes)
                            </div>
                          </div>
                          <div style={{ width: '200px', height: '10px', background: '#334155', borderRadius: '5px', overflow: 'hidden' }}>
                            <div style={{ width: `${data.percentage_of_total}%`, height: '100%', background: isRecommended ? '#10b981' : '#f59e0b' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ marginTop: '25px', padding: '15px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', borderRadius: '8px' }}>
                    <strong style={{ color: '#3b82f6' }}>💡 AI Recommendation:</strong>
                    <p style={{ margin: '5px 0 0 0', color: '#cbd5e1' }}>{diagnostics.recommendation}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Real-time Monitor Modal ---
const RealtimeMonitorModal = ({ onClose }: { onClose: () => void }) => {
  const [transactions, setTransactions] = useState<RealtimeTransaction[]>([])
  const [alerts, setAlerts] = useState<RealtimeTransaction[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [stats, setStats] = useState({ total: 0, alerts: 0, truePositives: 0, falsePositives: 0 })
  const wsRef = useRef<WebSocket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') { audioRef.current = new Audio('data:audio/wav;base64,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') }
    
    const ws = new WebSocket(`ws://localhost:8000/ws/realtime-monitor`)
    wsRef.current = ws; ws.onopen = () => setIsConnected(true)

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'error') { alert("Backend Error: " + data.message); return }
      if (data.type === 'transaction') {
        setTransactions(prev => [data, ...prev].slice(0, 50))
        setStats(prev => ({
          total: prev.total + 1, alerts: prev.alerts + (data.is_alert ? 1 : 0),
          truePositives: prev.truePositives + (data.is_alert && data.fraud_actual === 1 ? 1 : 0),
          falsePositives: prev.falsePositives + (data.is_alert && data.fraud_actual === 0 ? 1 : 0)
        }))
        if (data.is_alert) {
          setAlerts(prev => [data, ...prev].slice(0, 20))
          if (audioRef.current) audioRef.current.play().catch(() => {})
        }
      }
    }
    ws.onclose = () => setIsConnected(false)
    return () => ws.close()
  }, [])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="monitor-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>🚨 Real-time Fraud Monitor {isConnected ? '🟢' : '🔴'}</h2><button onClick={onClose}>Close</button></div>
        <div className="monitor-body">
          <div className="monitor-stats">
            <div className="stat-card"><div className="stat-value">{stats.total}</div><div className="stat-label">Total Transactions</div></div>
            <div className="stat-card alert"><div className="stat-value">{stats.alerts}</div><div className="stat-label">🚨 Alerts Triggered</div></div>
            <div className="stat-card success"><div className="stat-value">{stats.truePositives}</div><div className="stat-label">✅ True Positives</div></div>
            <div className="stat-card warning"><div className="stat-value">{stats.falsePositives}</div><div className="stat-label">⚠️ False Positives</div></div>
          </div>
          <div className="monitor-columns">
            <div className="alert-feed">
              <h3>🚨 Alert Feed</h3>
              {alerts.length === 0 ? <p className="no-data">No alerts yet...</p> : (
                <div className="alert-list">
                  {alerts.map((alert, idx) => (
                    <div key={idx} className="alert-item">
                      <div className="alert-header"><span className="alert-badge">ALERT</span><span className="alert-time">{new Date(alert.timestamp).toLocaleTimeString()}</span></div>
                      <div className="alert-details"><div>Node {alert.sender_id} → Node {alert.receiver_id}</div><div className="alert-amount">${alert.amount.toFixed(2)}</div></div>
                      <div className="alert-scores"><span>Sender Risk: {(alert.sender_risk_score * 100).toFixed(1)}%</span><span>Receiver Risk: {(alert.receiver_risk_score * 100).toFixed(1)}%</span></div>
                      {alert.fraud_actual === 1 && <div className="alert-confirmed">✅ CONFIRMED FRAUD</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="transaction-stream">
              <h3>📊 Transaction Stream</h3>
              <div className="transaction-list">
                {transactions.map((txn, idx) => (
                  <div key={idx} className={`transaction-item ${txn.is_alert ? 'alert-txn' : ''}`}>
                    <div className="txn-id">#{txn.transaction_id}</div>
                    <div className="txn-flow"><span>{txn.sender_id}</span><span>→</span><span>{txn.receiver_id}</span></div>
                    <div className="txn-amount">${txn.amount.toFixed(2)}</div>
                    {txn.is_alert && <div className="txn-alert-badge">⚠️</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Enhanced Graph Modal ---
const GraphModal = ({ onClose }: { onClose: () => void }) => {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [fullGraphData, setFullGraphData] = useState<GraphData | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<NodeExplanation | null>(null)
  const [isExplaining, setIsExplaining] = useState(false)
  const [explanationError, setExplanationError] = useState<string | null>(null)
  const [timeStep, setTimeStep] = useState(100)
  const [investigationReport, setInvestigationReport] = useState<InvestigationReport | null>(null)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)

  useEffect(() => {
    axios.get<GraphData>(`${BACKEND_URL}/get_graph_data`)
      .then(res => { setFullGraphData(res.data); setGraphData(res.data) })
      .catch(err => { console.error(err); setError(err.response?.data?.detail || "Failed to load graph data.") })
  }, [])

  useEffect(() => {
    if (fullGraphData) {
      const filteredLinks = fullGraphData.links.filter(link => (link.time_step || 0) <= timeStep)
      const visibleNodeIds = new Set<number>()
      filteredLinks.forEach(link => {
        const sourceId = typeof link.source === 'number' ? link.source : (link.source as any).id
        const targetId = typeof link.target === 'number' ? link.target : (link.target as any).id
        visibleNodeIds.add(sourceId); visibleNodeIds.add(targetId)
      })
      const filteredNodes = fullGraphData.nodes.filter(node => visibleNodeIds.has(node.id))
      setGraphData({ nodes: filteredNodes, links: filteredLinks })
    }
  }, [timeStep, fullGraphData])

  useEffect(() => { setExplanation(null); setExplanationError(null) }, [selectedNode])

  // --- NEW FEATURE: Flag Node for Investigation ---
  const handleFlagNode = async (nodeId: number) => {
    try {
      await axios.post(`${BACKEND_URL}/cases/create`, {
        node_id: nodeId,
        severity: "High",
        notes: "Manually flagged from Graph Dashboard"
      });
      alert(`✅ Node ${nodeId} added to Investigation Workbench!`);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to flag node. It might already be in a case.");
    }
  }

  const handleExplainNode = async (nodeId: number) => {
    setIsExplaining(true); setExplanationError(null)
    try {
      const res = await axios.post<NodeExplanation>(`${BACKEND_URL}/explain_node/${nodeId}`)
      setExplanation(res.data)
    } catch (err: any) { setExplanationError(err.response?.data?.detail || 'Failed to explain node.') } finally { setIsExplaining(false) }
  }

  const handleGenerateReport = async (nodeId: number) => {
    setIsGeneratingReport(true)
    try {
      const res = await axios.post<InvestigationReport>(`${BACKEND_URL}/generate_investigation_report/${nodeId}`)
      setInvestigationReport(res.data)
    } catch (err: any) { alert(err.response?.data?.detail || 'Failed to generate report.') } finally { setIsGeneratingReport(false) }
  }

  const drawNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.id; const fontSize = 12 / globalScale
    ctx.font = `${fontSize}px Sans-Serif`
    let color = '#00ff00'; if (node.is_fraud_predicted === 1) color = '#ff0000'
    ctx.beginPath(); ctx.arc(node.x, node.y, 5 / globalScale, 0, 2 * Math.PI, false); ctx.fillStyle = color; ctx.fill()
    if (node.is_in_ring) {
      ctx.beginPath(); ctx.arc(node.x, node.y, 8 / globalScale, 0, 2 * Math.PI, false)
      ctx.strokeStyle = '#ff9900'; ctx.lineWidth = 2 / globalScale; ctx.stroke()
    }
    if (selectedNode && node.id === selectedNode.id) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'white'; ctx.fillText(label, node.x, node.y + 10 / globalScale)
    }
  }

  return (
    <>
      {investigationReport && <InvestigationReportModal report={investigationReport} onClose={() => setInvestigationReport(null)} />}
      <div className="modal-backdrop" onClick={onClose}>
        <div className="graph-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="graph-modal-header"><h2>Graph Visualization</h2><button onClick={onClose}>Close</button></div>
          <div className="graph-modal-body">
            <div className="graph-container">
              {error && <div className='error'>{error}</div>}
              <div className="temporal-controls">
                <label>Time Period: Day {timeStep}</label>
                <input type="range" min="0" max="100" value={timeStep} onChange={(e) => setTimeStep(Number(e.target.value))} className="time-slider" />
                <div className="time-labels"><span>Day 0 (Start)</span><span>Day 100 (End)</span></div>
                <div className="time-info">Showing {graphData?.links.length || 0} transactions, {graphData?.nodes.length || 0} nodes</div>
              </div>
              {graphData ? <ForceGraph2D graphData={graphData} nodeLabel="id" nodeCanvasObject={drawNode} onNodeClick={(node: any) => setSelectedNode(node as GraphNode)} linkDirectionalParticles={1} linkDirectionalParticleWidth={1.5} linkWidth={0.5} linkColor={() => 'rgba(255,255,255,0.2)'} /> : <p>Loading graph...</p>}
            </div>
            <div className="graph-info-sidebar">
              {selectedNode ? (
                <>
                  <h3>Node {selectedNode.id}</h3>
                  
                  {/* --- FIX: Button moved to top, visible for ALL nodes --- */}
                  <button 
                    onClick={() => handleFlagNode(selectedNode.id)} 
                    style={{ 
                      width: '100%', 
                      marginBottom: '15px', 
                      background: '#ef4444', 
                      border: 'none', 
                      color: 'white', 
                      padding: '10px', 
                      borderRadius: '4px', 
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    🚩 Flag for Investigation
                  </button>

                  <ul>
                    <li><span>Predicted:</span> {selectedNode.is_fraud_predicted === 1 ? 'Fraud (Red)' : 'Safe (Green)'}</li>
                    <li><span>Actual:</span> {selectedNode.is_fraud_actual === 1 ? 'Fraud' : 'Safe'}</li>
                    <li><span>In Ring:</span> {selectedNode.is_in_ring ? 'Yes (Orange Circle)' : 'No'}</li>
                  </ul>
                  {selectedNode.is_fraud_predicted === 1 && (
                    <div className="explainer-section">
                      <button className="explain-button" onClick={() => handleExplainNode(selectedNode.id)} disabled={isExplaining}>{isExplaining ? 'Analyzing...' : '🔍 Why is this fraud?'}</button>
                      <button className="report-button" onClick={() => handleGenerateReport(selectedNode.id)} disabled={isGeneratingReport} style={{marginTop: '10px'}}>{isGeneratingReport ? 'Generating...' : '📄 Generate SAR Report'}</button>
                      
                      {explanationError && <div className="explanation-error">{explanationError}</div>}
                      {explanation && (
                        <div className="explanation-results">
                          <h4>🎯 Fraud Detection Explanation</h4>
                          <div className="explanation-block">
                            <h5>Top Contributing Features:</h5>
                            <ul className="feature-list">
                              {explanation.top_features.map((feat, idx) => (
                                <li key={idx}><span className="feature-name">{feat.feature_name}</span><span className="importance-bar"><span className="importance-fill" style={{width: `${feat.importance * 100}%`}}></span></span><span className="importance-value">{(feat.importance * 100).toFixed(1)}%</span></li>
                              ))}
                            </ul>
                          </div>
                          {explanation.top_neighbors.length > 0 && (
                            <div className="explanation-block">
                              <h5>Suspicious Connected Nodes:</h5>
                              <ul className="neighbor-list">
                                {explanation.top_neighbors.map((neighbor, idx) => (
                                  <li key={idx}><span className="neighbor-id">Node {neighbor.neighbor_id}</span><span className="importance-bar"><span className="importance-fill" style={{width: `${neighbor.importance * 100}%`}}></span></span><span className="importance-value">{(neighbor.importance * 100).toFixed(1)}%</span></li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <h3>Node Features:</h3>
                  <ul>{Object.entries(selectedNode.features).map(([key, value]) => <li key={key}><span>{key}:</span> {Number(value).toFixed(4)}</li>)}</ul>
                </>
              ) : <div className="placeholder-text"><h3>Select a Node</h3><p>Click on any node in the graph to view details.</p></div>}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// --- MAIN DASHBOARD COMPONENT ---
export default function Dashboard() {
  const router = useRouter()
  const [datasetStats, setDatasetStats] = useState<DatasetStats | null>(null)
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics | null>(null)
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [isLoadingModel, setIsLoadingModel] = useState(false)
  const [isLoadingViewData, setIsLoadingViewData] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showToast, setShowToast] =  useState(false)
  
  // Modal States
  const [showDatasetModal, setShowDatasetModal] = useState(false)
  const [showGraphModal, setShowGraphModal] = useState(false)
  const [showMonitorModal, setShowMonitorModal] = useState(false)
  // --- ADDED: Diagnostics Modal State ---
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false)

  // Logout Handler
  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      router.push('/login1')
    }
  }

  useEffect(() => {
    if (showToast) { const timer = setTimeout(() => setShowToast(false), 3000); return () => clearTimeout(timer) }
  }, [showToast])

  const handleGenerateData = async () => {
    setIsLoadingData(true); setModelMetrics(null); setDataset(null); setError(null)
    try {
      const res = await axios.post<DatasetStats>(`${BACKEND_URL}/generate_dataset`)
      setDatasetStats(res.data); setShowToast(true) 
    } catch (err) { console.error(err); setError('Failed to generate dataset. Is the backend running?') } finally { setIsLoadingData(false) }
  }

  const handleTrainModel = async () => {
    if (!datasetStats) { setError('Please generate a dataset first.'); return }
    setIsLoadingModel(true); setError(null)
    try {
      const res = await axios.post<ModelMetrics>(`${BACKEND_URL}/train_gnn`)
      setModelMetrics(res.data)
    } catch (err: any) { console.error(err); setError(err.response?.data?.detail || 'Failed to train model.') } finally { setIsLoadingModel(false) }
  }

  const handleViewData = async () => {
    setIsLoadingViewData(true); setError(null)
    try {
      const res = await axios.get<Dataset>(`${BACKEND_URL}/get_dataset`)
      setDataset(res.data); setShowDatasetModal(true)
    } catch (err: any) { console.error(err); setError(err.response?.data?.detail || 'Failed to fetch dataset.') } finally { setIsLoadingViewData(false) }
  }

  return (
    <div className="dashboard-wrapper">
      <style jsx global>{`
        /* --- GLOBAL STYLES --- */
        :root { --bg-dark: #0f172a; --bg-card: #1e293b; --primary: #3b82f6; --primary-hover: #2563eb; --accent: #10b981; --danger: #ef4444; --warning: #f59e0b; --text-main: #f8fafc; --text-muted: #94a3b8; --border: #334155; }
        body { margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background-color: var(--bg-dark); color: var(--text-main); }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        
        /* HEADER STYLES UPDATED FOR LOGOUT */
        .header-container { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 3rem; 
            padding-bottom: 2rem;
            border-bottom: 1px solid var(--border);
        }
        .header-content h1 { font-size: 2.5rem; margin: 0 0 0.5rem 0; background: linear-gradient(to right, #3b82f6, #10b981); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .header-content p { margin: 0; color: var(--text-muted); }
        
        .logout-container { display: flex; align-items: center; gap: 1.5rem; background: rgba(30, 41, 59, 0.5); padding: 10px 20px; border-radius: 12px; border: 1px solid var(--border); }
        .user-info { text-align: right; }
        .user-email { font-weight: bold; font-size: 0.9rem; color: var(--text-main); }
        .user-role { font-size: 0.8rem; color: var(--accent); margin-top: 2px; }
        .logout-btn { 
            display: flex; align-items: center; gap: 8px; 
            background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); color: var(--danger); 
            padding: 8px 16px; border-radius: 8px; transition: all 0.2s; 
        }
        .logout-btn:hover { background: var(--danger); color: white; transform: translateY(-2px); }

        button { padding: 0.75rem 1.5rem; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; transition: all 0.2s; font-size: 0.9rem; }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        .primary-btn { background-color: var(--primary); color: white; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); }
        .primary-btn:hover:not(:disabled) { background-color: var(--primary-hover); transform: translateY(-1px); }
        .secondary-btn { background-color: var(--bg-card); color: var(--text-main); border: 1px solid var(--border); }
        .secondary-btn:hover:not(:disabled) { background-color: var(--border); }
        .action-bar { display: flex; justify-content: center; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
        .view-bar { display: flex; justify-content: center; gap: 1rem; margin-bottom: 3rem; padding-bottom: 2rem; border-bottom: 1px solid var(--border); }
        .results-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 2rem; }
        .card { background-color: var(--bg-card); border-radius: 12px; padding: 1.5rem; border: 1px solid var(--border); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .card h2 { font-size: 1.25rem; margin-top: 0; margin-bottom: 1.5rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); color: var(--primary); }
        .stats-list li { display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .stats-list li:last-child { border-bottom: none; }
        .stats-list span:first-child { color: var(--text-muted); }
        .stats-list span:last-child { font-weight: 600; font-family: monospace; }
        .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        
        /* --- FULL SCREEN MODALS --- */
        .modal-content, .graph-modal-content, .monitor-modal-content, .report-modal-content { 
            background: var(--bg-card); 
            width: 90vw; 
            height: 90vh; 
            max-width: none;
            border-radius: 0; 
            display: flex; 
            flex-direction: column; 
            border: none;
        }
        
        .monitor-modal-content { background: #000; color: #0f0; font-family: monospace; }
        .modal-header { padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .modal-body { flex: 1; overflow-y: auto; padding: 1.5rem; }
        .graph-modal-body { flex: 1; display: flex; overflow: hidden; }
        .graph-container { flex: 3; background: #000; position: relative; }
        .graph-info-sidebar { flex: 1; background: var(--bg-card); border-left: 1px solid var(--border); padding: 1.5rem; overflow-y: auto; min-width: 300px; }
        .explain-button, .report-button { width: 100%; background: var(--primary); color: white; padding: 0.75rem; margin-top: 0.5rem; }
        .report-button { background: var(--accent); }
        .explanation-results { margin-top: 1.5rem; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; }
        .importance-bar { display: inline-block; width: 100px; height: 6px; background: #333; margin: 0 10px; border-radius: 3px; }
        .importance-fill { display: block; height: 100%; background: var(--warning); border-radius: 3px; }
        .temporal-controls { position: absolute; bottom: 20px; left: 20px; background: rgba(30, 41, 59, 0.9); padding: 15px; border-radius: 8px; border: 1px solid var(--primary); width: 300px; z-index: 10; }
        .time-slider { width: 100%; margin: 10px 0; }
        .time-labels { display: flex; justify-content: space-between; font-size: 0.8rem; color: #aaa; }
        .time-info { margin-top: 5px; font-size: 0.8rem; color: var(--accent); text-align: center;}
        .monitor-body { display: flex; flex-direction: column; height: 100%; padding: 1rem; }
        .monitor-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1rem; }
        .stat-card { background: #111; border: 1px solid #333; padding: 1rem; text-align: center; border-radius: 6px; }
        .stat-value { font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem; }
        .stat-card.alert .stat-value { color: #f00; text-shadow: 0 0 10px #f00; }
        .monitor-columns { display: flex; gap: 1rem; flex: 1; overflow: hidden; }
        .alert-feed, .transaction-stream { flex: 1; background: #0a0a0a; border: 1px solid #333; padding: 1rem; overflow-y: auto; }
        .alert-item { border-left: 3px solid #f00; background: rgba(255,0,0,0.1); padding: 0.8rem; margin-bottom: 0.8rem; }
        .transaction-item { display: flex; justify-content: space-between; padding: 0.5rem; border-bottom: 1px solid #222; font-size: 0.9rem; }
        .transaction-item.alert-txn { color: #f00; }
        .error { color: var(--danger); background: rgba(239, 68, 68, 0.1); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
        .toast { position: fixed; bottom: 20px; right: 20px; background: var(--accent); color: #000; padding: 1rem 2rem; border-radius: 8px; font-weight: bold; animation: slideIn 0.3s ease; }
        @keyframes slideIn { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      {showToast && <div className="toast">Action Successful!</div>}

      {showDatasetModal && dataset && <DatasetModal dataset={dataset} onClose={() => setShowDatasetModal(false)} />}
      {showGraphModal && <GraphModal onClose={() => setShowGraphModal(false)} />}
      {showMonitorModal && <RealtimeMonitorModal onClose={() => setShowMonitorModal(false)} />}
      {/* ADDED: Diagnostics Modal Render */}
      {showDiagnosticsModal && <ModelDiagnosticsModal onClose={() => setShowDiagnosticsModal(false)} />}

      <div className="container">
        
        {/* MODIFIED HEADER WITH LOGOUT */}
        <header className="header-container">
          <div className="header-content">
            <h1>GNN Fraud Detection Platform</h1>
            <p>Next-Gen Financial Crime Analysis with Graph Neural Networks & Generative AI</p>
          </div>
          <div className="logout-container">
            <div className="user-info">
              <div className="user-email">admin@gmail.com</div>
              <div className="user-role">🔐 Admin Access</div>
            </div>
            <button className="logout-btn" onClick={handleLogout}>
              <span>🚪</span>
              <span>Logout</span>
            </button>
          </div>
        </header>

        <main>
          {error && <div className="error"><strong>Error:</strong> {error}</div>}

          <div className="action-bar">
            <button className="primary-btn" onClick={handleGenerateData} disabled={isLoadingData}>{isLoadingData ? 'Generating...' : '1. Generate Synthetic Data'}</button>
            <button className="primary-btn" onClick={handleTrainModel} disabled={isLoadingModel || !datasetStats}>{isLoadingModel ? 'Training...' : '2. Train GNN Model'}</button>
          </div>

          <div className="view-bar">
            <button className="secondary-btn" onClick={handleViewData} disabled={!datasetStats || isLoadingViewData}>View Raw Dataset</button>
            <button className="secondary-btn" onClick={() => setShowGraphModal(true)} disabled={!modelMetrics} style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>🔮 Interactive Graph & Time Travel</button>
            <button className="secondary-btn" onClick={() => setShowMonitorModal(true)} disabled={!modelMetrics} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>🚨 Real-time Monitor</button>
            {/* ADDED: Diagnostics Button */}
            <button className="secondary-btn" onClick={() => setShowDiagnosticsModal(true)} disabled={!modelMetrics} style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>🔍 Model Diagnostics</button>
            
            {/* --- FIX: Capitalized URL to match file name --- */}
            <button 
              className="secondary-btn" 
              onClick={() => router.push('/Investigations')} 
              style={{ borderColor: '#8b5cf6', color: '#8b5cf6' }}
            >
              🕵️‍♂️ Investigation Workbench
            </button>
          </div>

          <div className="results-grid">
            <div className="card">
              <h2>Dataset Intelligence</h2>
              {datasetStats ? (
                <ul className="stats-list">
                  <li><span>Total Users (Nodes)</span> <span>{datasetStats.nodes}</span></li>
                  <li><span>Transactions</span> <span>{datasetStats.transactions}</span></li>
                  <li><span>Confirmed Fraud</span> <span>{datasetStats.fraudulent_nodes}</span></li>
                  <li><span>Identified Rings</span> <span>{datasetStats.fraud_rings}</span></li>
                  <li><span>Time Range</span> <span>{datasetStats.time_range_days} Days</span></li>
                </ul>
              ) : <p className="text-muted">Awaiting data generation...</p>}
            </div>

            <div className="card">
              <h2>Model Performance</h2>
              {modelMetrics ? (
                <ul className="stats-list">
                  <li><span>Precision</span> <span>{(modelMetrics.precision * 100).toFixed(2)}%</span></li>
                  <li><span>Recall</span> <span>{(modelMetrics.recall * 100).toFixed(2)}%</span></li>
                  <li><span>F1-Score</span> <span>{(modelMetrics.f1_score * 100).toFixed(2)}%</span></li>
                  <li><span>AUC (ROC)</span> <span>{(modelMetrics.auc).toFixed(4)}</span></li>
                  <li><span>Accuracy</span> <span>{(modelMetrics.accuracy * 100).toFixed(2)}%</span></li>
                  <li><span>Fraud Rings Found</span> <span>{modelMetrics.fraud_ring_count}</span></li>
                </ul>
              ) : <p className="text-muted">Train the model to see metrics.</p>}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}