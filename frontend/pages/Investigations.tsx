import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function Investigations() {
  const router = useRouter();
  const [cases, setCases] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch cases on load
  useEffect(() => {
    fetchCases();
  }, []);

  const fetchCases = async () => {
    try {
      const res = await fetch('http://localhost:8000/cases');
      const data = await res.json();
      setCases(data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching cases:", error);
    }
  };

  const updateStatus = async (caseId: any, newStatus: string) => {
    try {
      const note = prompt("Enter functionality notes for this status change:");
      if (!note) return;

      const res = await fetch(`http://localhost:8000/cases/${caseId}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          analyst_notes: note
        })
      });
      
      if (res.ok) {
        alert("Status updated & Model Dataset refined (Active Learning)");
        fetchCases(); // Refresh UI
      }
    } catch (err) {
      alert("Failed to update");
    }
  };

  // --- NEW FUNCTION: Delete Case ---
  const deleteCase = async (caseId: string) => {
    if (!confirm("Are you sure you want to remove this case from the dashboard? This cannot be undone.")) return;

    try {
      const res = await fetch(`http://localhost:8000/cases/${caseId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // Optimistic update: remove from UI immediately
        const newCases = { ...cases } as any;
        delete newCases[caseId];
        setCases(newCases);
      } else {
        alert("Failed to delete case from server.");
      }
    } catch (err) {
      console.error(err);
      alert("Error contacting server.");
    }
  };

  const getStatusLabel = (status: string) => {
    return status.replace('_', ' ').toUpperCase();
  };

  return (
    <div className="page-wrapper">
      <Head>
        <title>Investigation Workbench | FraudGuard</title>
      </Head>

      {/* --- CUSTOM CSS STYLES --- */}
      <style jsx>{`
        /* Dark Theme Variables */
        :root {
          --bg-dark: #0f172a;
          --bg-card: #1e293b;
          --text-main: #f8fafc;
          --text-muted: #94a3b8;
          --primary: #3b82f6;
          --success: #10b981;
          --danger: #ef4444;
          --warning: #f59e0b;
          --border: #334155;
        }

        .page-wrapper {
          min-height: 100vh;
          background-color: #0f172a; /* Dark Background */
          color: #f8fafc;
          font-family: 'Inter', sans-serif;
          padding: 40px;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
        }

        /* Header Section */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 1px solid #334155;
        }

        .header h1 {
          font-size: 2rem;
          margin: 0;
          background: linear-gradient(to right, #a78bfa, #f472b6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .back-btn {
          background: transparent;
          border: 1px solid #334155;
          color: #94a3b8;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .back-btn:hover {
          border-color: #f8fafc;
          color: #f8fafc;
        }

        /* Grid Layout */
        .cases-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 25px;
        }

        /* Card Styles */
        .case-card {
          background-color: #1e293b;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 25px;
          display: flex;
          flex-direction: column;
          transition: transform 0.2s;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
          position: relative;
          overflow: hidden;
        }

        .case-card:hover {
          transform: translateY(-5px);
          border-color: #3b82f6;
        }

        /* Status Stripe */
        .case-card::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
        }
        .case-card.status-open::before { background: #3b82f6; }
        .case-card.status-investigating::before { background: #f59e0b; }
        .case-card.status-confirmed_fraud::before { background: #ef4444; }
        .case-card.status-false_positive::before { background: #10b981; }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 15px;
        }

        .node-title {
          font-size: 1.25rem;
          font-weight: bold;
          margin: 0;
          color: #f8fafc;
        }

        .date-label {
          font-size: 0.8rem;
          color: #94a3b8;
          margin-top: 4px;
        }

        .status-badge {
          font-size: 0.75rem;
          font-weight: bold;
          padding: 4px 10px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        /* Badge Colors */
        .badge-open { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid #3b82f6; }
        .badge-investigating { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; }
        .badge-confirmed_fraud { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
        .badge-false_positive { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; }

        .notes-section {
          background: #0f172a;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          border: 1px dashed #334155;
        }
        .notes-text {
          font-style: italic;
          color: #cbd5e1;
          font-size: 0.9rem;
          margin: 0;
        }

        /* Buttons */
        .actions-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: #64748b;
          font-weight: bold;
          margin-bottom: 10px;
          letter-spacing: 1px;
        }

        .btn-group {
          display: flex;
          gap: 10px;
        }

        .btn {
          padding: 10px 15px;
          border-radius: 6px;
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          font-size: 0.9rem;
          color: white;
          flex: 1;
        }

        .btn-primary { background: #3b82f6; }
        .btn-primary:hover { background: #2563eb; }

        .btn-danger { background: #ef4444; }
        .btn-danger:hover { background: #dc2626; }

        .btn-success { background: #10b981; }
        .btn-success:hover { background: #059669; }

        .closed-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .closed-msg {
          text-align: center;
          color: #64748b;
          font-size: 0.85rem;
          padding: 10px;
          background: rgba(255,255,255,0.03);
          border-radius: 6px;
        }

        .btn-archive {
          background: transparent;
          border: 1px solid #475569;
          color: #94a3b8;
          padding: 8px;
          border-radius: 6px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .btn-archive:hover {
          background: #334155;
          color: #f8fafc;
          border-color: #64748b;
        }

        .empty-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 60px;
          color: #64748b;
          font-size: 1.2rem;
          border: 2px dashed #334155;
          border-radius: 12px;
        }
      `}</style>

      <div className="container">
        <div className="header">
          <div>
            <h1>Investigation Workbench</h1>
            <p style={{color: '#94a3b8', marginTop: '5px'}}>Manage and adjudicate suspicious financial entities</p>
          </div>
          <button className="back-btn" onClick={() => router.push('/')}>
            ← Back to Dashboard
          </button>
        </div>
        
        {loading ? <p style={{textAlign: 'center', color: '#94a3b8'}}>Loading cases...</p> : (
          <div className="cases-grid">
            
            {/* Map through cases */}
            {Object.values(cases).map((c: any) => (
              <div key={c.case_id} className={`case-card status-${c.status}`}>
                
                <div className="card-header">
                  <div>
                    <h3 className="node-title">Node #{c.node_id}</h3>
                    <div className="date-label">{new Date(c.created_at).toLocaleDateString()} • {new Date(c.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                  </div>
                  <span className={`status-badge badge-${c.status}`}>
                    {getStatusLabel(c.status)}
                  </span>
                </div>

                <div className="notes-section">
                  <p className="notes-text">"{c.initial_notes}"</p>
                </div>

                {/* Action Buttons */}
                <div>
                  <div className="actions-label">Available Actions</div>
                  
                  {c.status === 'open' && (
                    <button 
                      onClick={() => updateStatus(c.case_id, 'investigating')}
                      className="btn btn-primary"
                      style={{width: '100%'}}
                    >
                      Start Investigation
                    </button>
                  )}

                  {(c.status === 'investigating' || c.status === 'open') && (
                    <div className="btn-group">
                      <button 
                        onClick={() => updateStatus(c.case_id, 'confirmed_fraud')}
                        className="btn btn-danger"
                      >
                        Confirm Fraud
                      </button>
                      <button 
                        onClick={() => updateStatus(c.case_id, 'false_positive')}
                        className="btn btn-success"
                      >
                        False Positive
                      </button>
                    </div>
                  )}
                  
                  {/* --- NEW SECTION: Closed Case Actions --- */}
                  {['confirmed_fraud', 'false_positive'].includes(c.status) && (
                     <div className="closed-section">
                       <div className="closed-msg">
                         🔒 Case Closed. Feedback sent to AI Model.
                       </div>
                       <button 
                         className="btn-archive" 
                         onClick={() => deleteCase(c.case_id)}
                       >
                         🗑️ Remove from Dashboard
                       </button>
                     </div>
                  )}
                </div>
              </div>
            ))}
            
            {Object.keys(cases).length === 0 && (
              <div className="empty-state">
                <p>No active cases found.</p>
                <button 
                  className="btn btn-primary" 
                  style={{marginTop: '20px', width: 'auto'}}
                  onClick={() => router.push('/dashboard')}
                >
                  Go to Graph Dashboard to Flag Nodes
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}