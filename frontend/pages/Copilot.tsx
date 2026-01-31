import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import axios from 'axios'

const BACKEND_URL = 'http://localhost:8000'

// --- HYBRID AI BRAIN ---
// 1. Tries to connect to your Python Backend (Gemini)
// 2. If backend fails, falls back to "Simulation Mode" so the demo never breaks.
const processQuery = async (query: string) => {
  try {
    // --- ATTEMPT 1: REAL BACKEND CONNECTION ---
    const res = await axios.post(`${BACKEND_URL}/api/copilot`, {
      query: query
    })

    const backendResponse = res.data

    // Handle "Code/SQL" response from Backend
    if (backendResponse.type === 'code') {
      return {
        type: 'code',
        text: "Here is the SQL query generated based on your request:",
        code: backendResponse.text
      }
    }

    // Handle standard text response
    return {
      type: 'text',
      text: backendResponse.text
    }

  } catch (err) {
    console.warn("Backend unavailable, switching to Simulation Mode.", err)
    
    // --- ATTEMPT 2: SIMULATION FALLBACK (FOR DEMO SAFETY) ---
    // This ensures you still get a cool response even if the server is off.
    
    await new Promise(r => setTimeout(r, 1000)) // Fake latency
    const q = query.toLowerCase()

    if (q.includes('risk') && q.includes('high')) {
      return {
        type: 'list',
        text: "I've analyzed the GNN inference layer. Here are the top 3 high-risk entities currently active (Simulation):",
        data: [
          { id: 86, score: '99.8%', reason: 'Laundering Ring Leader' },
          { id: 142, score: '94.2%', reason: 'Velocity Anomaly' },
          { id: 12, score: '89.1%', reason: 'Synthetic Identity' }
        ]
      }
    }

    if (q.includes('node') || q.includes('86')) {
      return {
        type: 'card',
        text: "Pulling forensic file for Subject #86...",
        data: {
          id: 86,
          status: 'CRITICAL',
          risk_score: 99.8,
          location: 'Lagos, NG (VPN Detected)',
          network: 'Connected to 5 confirmed fraud nodes'
        }
      }
    }

    if (q.includes('sql') || q.includes('query')) {
      return {
        type: 'code',
        text: "Generating SQL query for the requested data segment...",
        code: "SELECT t.sender_id, t.amount, n.risk_score \nFROM transactions t \nJOIN nodes n ON t.sender_id = n.id \nWHERE n.risk_score > 0.9 \nAND t.amount > 5000 \nORDER BY t.timestamp DESC;"
      }
    }

    return {
      type: 'text',
      text: "I am unable to reach the GNN Inference Engine (Backend Offline). However, I can still simulate forensic tasks.\n\nTry asking:\n1. 'Show high risk nodes'\n2. 'Analyze node 86'\n3. 'Generate SQL for fraud'"
    }
  }
}

export default function Copilot() {
  const router = useRouter()
  const [messages, setMessages] = useState<any[]>([
    { role: 'ai', content: { type: 'text', text: "Identify. Analyze. Resolve.\nI am FraudGPT, your forensic copilot. How can I assist with the investigation today?" } }
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef<any>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return
    const userMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    const response = await processQuery(userMsg.content)
    
    setIsTyping(false)
    setMessages(prev => [...prev, { role: 'ai', content: response }])
  }

  return (
    <div className="copilot-wrapper">
      <Head><title>FraudGPT Copilot</title></Head>

      <style jsx global>{`
        :root { --bg-chat: #0f172a; --bg-msg-ai: #1e293b; --bg-msg-user: #3b82f6; --text-main: #f8fafc; }
        body { margin: 0; background: var(--bg-chat); color: var(--text-main); font-family: 'Inter', sans-serif; }
        .copilot-wrapper { display: flex; height: 100vh; }

        /* SIDEBAR */
        .sidebar { width: 300px; background: #020617; border-right: 1px solid #1e293b; padding: 20px; display: flex; flex-direction: column; }
        .brand { font-size: 1.5rem; font-weight: bold; background: linear-gradient(to right, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 30px; }
        
        .history-item { padding: 12px; border-radius: 8px; color: #94a3b8; cursor: pointer; transition: all 0.2s; font-size: 0.9rem; margin-bottom: 5px; }
        .history-item:hover { background: #1e293b; color: white; }
        .active-chat { background: #1e293b; color: white; border-left: 3px solid #3b82f6; }

        .back-btn { margin-top: auto; padding: 12px; background: #1e293b; border: 1px solid #334155; color: white; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .back-btn:hover { background: #334155; }

        /* MAIN CHAT AREA */
        .chat-area { flex: 1; display: flex; flex-direction: column; position: relative; }
        .chat-scroll { flex: 1; overflow-y: auto; padding: 40px; display: flex; flex-direction: column; gap: 20px; max-width: 900px; margin: 0 auto; width: 100%; }

        /* MESSAGES */
        .msg-row { display: flex; gap: 15px; animation: fadeIn 0.3s ease; }
        .msg-row.user { justify-content: flex-end; }
        .avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; }
        .ai-avatar { background: #3b82f6; box-shadow: 0 0 15px rgba(59, 130, 246, 0.4); }
        .user-avatar { background: #64748b; }

        .bubble { max-width: 70%; padding: 15px 20px; border-radius: 12px; line-height: 1.5; font-size: 1rem; }
        .ai-bubble { background: var(--bg-msg-ai); border: 1px solid #334155; border-top-left-radius: 0; }
        .user-bubble { background: var(--bg-msg-user); color: white; border-top-right-radius: 0; }

        /* RICH CONTENT STYLES */
        .risk-list { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
        .risk-item { background: #0f172a; padding: 10px; border-radius: 6px; border-left: 3px solid #ef4444; display: flex; justify-content: space-between; align-items: center; }
        .risk-score { color: #ef4444; font-weight: bold; font-family: monospace; }
        
        .code-block { background: #020617; padding: 15px; border-radius: 8px; font-family: 'Fira Code', monospace; font-size: 0.9rem; color: #10b981; margin-top: 10px; border: 1px solid #334155; overflow-x: auto; white-space: pre-wrap; }
        
        .node-card { background: linear-gradient(145deg, #1e293b, #0f172a); border: 1px solid #ef4444; padding: 20px; border-radius: 12px; margin-top: 10px; }
        .card-header { display: flex; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 10px; margin-bottom: 10px; }
        .card-stat { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem; color: #cbd5e1; }
        
        /* INPUT AREA */
        .input-container { padding: 30px; background: #0f172a; border-top: 1px solid #1e293b; display: flex; justify-content: center; }
        .input-box { width: 100%; max-width: 800px; position: relative; }
        input { width: 100%; background: #1e293b; border: 1px solid #334155; padding: 18px 25px; padding-right: 60px; border-radius: 30px; color: white; font-size: 1rem; outline: none; transition: all 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        .send-btn { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: #3b82f6; border: none; width: 40px; height: 40px; border-radius: 50%; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .send-btn:hover { background: #2563eb; transform: translateY(-50%) scale(1.05); }

        .typing-indicator { font-style: italic; color: #64748b; font-size: 0.8rem; margin-left: 60px; margin-bottom: 10px; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="brand">⚡ FraudGPT</div>
        <div className="history-item active-chat">Currently Investigating</div>
        <div className="history-item">Yesterday: Ring #402 Analysis</div>
        <div className="history-item">Archived: SQL Generation</div>
        
        <button className="back-btn" onClick={() => router.push('/')}>← Dashboard</button>
      </div>

      {/* CHAT INTERFACE */}
      <div className="chat-area">
        <div className="chat-scroll" ref={scrollRef}>
          
          {messages.map((msg, idx) => (
            <div key={idx} className={`msg-row ${msg.role}`}>
              {msg.role === 'ai' && <div className="avatar ai-avatar">🤖</div>}
              
              <div className={`bubble ${msg.role === 'ai' ? 'ai-bubble' : 'user-bubble'}`}>
                {/* TEXT CONTENT */}
                {typeof msg.content === 'string' ? msg.content : msg.content.text}

                {/* RICH CONTENT: LIST */}
                {msg.content.type === 'list' && (
                  <div className="risk-list">
                    {msg.content.data.map((item: any, i: number) => (
                      <div key={i} className="risk-item">
                        <span>Node #{item.id} - {item.reason}</span>
                        <span className="risk-score">{item.score}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* RICH CONTENT: CODE */}
                {msg.content.type === 'code' && (
                  <div className="code-block">
                    {msg.content.code}
                  </div>
                )}

                {/* RICH CONTENT: CARD */}
                {msg.content.type === 'card' && (
                  <div className="node-card">
                    <div className="card-header">
                        <strong style={{color: '#ef4444'}}>🚩 HIGH PRIORITY TARGET</strong>
                        <span>ID: {msg.content.data.id}</span>
                    </div>
                    <div className="card-stat"><span>Risk Score</span><span style={{color: '#ef4444', fontWeight: 'bold'}}>{msg.content.data.risk_score}%</span></div>
                    <div className="card-stat"><span>Status</span><span>{msg.content.data.status}</span></div>
                    <div className="card-stat"><span>Location</span><span>{msg.content.data.location}</span></div>
                    <div className="card-stat"><span>Graph Linkage</span><span>{msg.content.data.network}</span></div>
                    <button style={{width: '100%', marginTop: '10px', background: '#ef4444', border: 'none', color: 'white', padding: '8px', borderRadius: '4px', cursor: 'pointer'}}>Initiate Asset Freeze</button>
                  </div>
                )}

              </div>

              {msg.role === 'user' && <div className="avatar user-avatar">👤</div>}
            </div>
          ))}

          {isTyping && <div className="typing-indicator">FraudGPT is analyzing the graph...</div>}
        </div>

        {/* INPUT */}
        <div className="input-container">
          <div className="input-box">
            <input 
              type="text" 
              placeholder="Ask about risk, generate SQL, or analyze a node..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button className="send-btn" onClick={handleSend}>➤</button>
          </div>
        </div>
      </div>
    </div>
  )
}