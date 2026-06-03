/* ===== Analysis view: adapted from ai-agents-pixels for vuln workflow ===== */

const { createWorkflowAnalysis } = AnalysisModel;

function ThesisBadge({decision}){
  return <span className={'thesis-badge '+decision.toLowerCase()}>{decision}</span>;
}

function ActionPanel({onRunSource, onRunBinary, onRebuild, running}){
  return (
    <div className="analysis-form">
      <div className="analysis-input-row">
        <button className="btn on analysis-run" type="button" disabled={running} onClick={onRunSource}>Run Source</button>
        <button className="btn gold analysis-run" type="button" disabled={running} onClick={onRunBinary}>Run Binary</button>
      </div>
      <div className="analysis-input-row">
        <button className="btn analysis-run" type="button" disabled={running} onClick={onRebuild}>Rebuild Datasets</button>
      </div>
      <div className="mono muted" style={{fontSize:16}}>
        หน้านี้ใช้ workflow style เดิมของ ai-agents-pixels แต่เปลี่ยนจาก market analysis เป็น vulnerability workflow ของโปรเจกต์นี้
      </div>
    </div>
  );
}

function AgentRunner({providers, onRunAgent, running}){
  const available = providers.find(p => p.available)?.id || 'gemini';
  const [provider, setProvider] = React.useState(available);
  const [prompt, setPrompt] = React.useState('อ่าน finding ล่าสุด แล้วสรุปความเสี่ยงกับแนวทางแก้เป็นภาษาไทยแบบสั้น');
  const [output, setOutput] = React.useState('');

  async function run(){
    const result = await onRunAgent(provider, prompt);
    setOutput(result.output || result.error || result.stderr || 'No output');
  }

  return (
    <div className="analysis-form">
      <label className="analysis-field">
        <span>Provider</span>
        <select value={provider} onChange={e=>setProvider(e.target.value)}>
          {providers.map(p => (
            <option key={p.id} value={p.id} disabled={!p.available}>
              {p.label}{p.available ? '' : ' (not found)'}
            </option>
          ))}
        </select>
      </label>
      <label className="analysis-field">
        <span>Prompt</span>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} />
      </label>
      <button className="btn on analysis-run" type="button" disabled={running} onClick={run}>Run Local Agent</button>
      <div className="analysis-output-box">
        <div className="label">Agent Output</div>
        <div className="analysis-output mono">{output || 'ยังไม่มีผลลัพธ์จาก local agent'}</div>
      </div>
    </div>
  );
}

function AnalysisList({analyses, activeAnalysisId, setActiveAnalysisId}){
  if(!analyses.length){
    return <div className="analysis-empty mono">ยังไม่มี session run</div>;
  }
  return (
    <div className="analysis-session-list">
      {analyses.map(item => (
        <button
          key={item.id}
          type="button"
          className={'analysis-session'+(item.id===activeAnalysisId?' on':'')}
          onClick={() => setActiveAnalysisId(item.id)}>
          <span>{item.ticker}</span>
          <small>{item.scenarioLabel}</small>
          <ThesisBadge decision={item.finalThesis.decision} />
        </button>
      ))}
    </div>
  );
}

function AgentReport({report, tint}){
  return (
    <div className="agent-report">
      <div className="agent-report-head">
        <div className="agent-dot" style={{background:tint}}></div>
        <div>
          <div className="agent-title">{report.name}</div>
          <div className="agent-role">{report.stage} · {report.role}</div>
        </div>
        <div className="agent-confidence">{report.confidence}%</div>
      </div>
      <div className={'stance '+report.stance}>{report.stance}</div>
      <p>{report.summary}</p>
      <ul>
        {report.findings.map((finding, index) => <li key={index}>{finding}</li>)}
      </ul>
      {report.passesTo && <div className="handoff mono">Passes to {report.passesTo}</div>}
    </div>
  );
}

function FinalThesis({analysis}){
  const thesis = analysis.finalThesis;
  return (
    <div className={'final-thesis '+thesis.decision.toLowerCase()}>
      <div className="final-head">
        <div>
          <div className="label">Final Summary</div>
          <h3>{analysis.ticker}</h3>
        </div>
        <ThesisBadge decision={thesis.decision} />
      </div>
      <div className="thesis-stats">
        <div><span>Confidence</span><strong>{thesis.confidence}%</strong></div>
        <div><span>Risk</span><strong>{thesis.riskLevel}</strong></div>
        <div><span>Mode</span><strong>{thesis.budgetRange}</strong></div>
        <div><span>Window</span><strong>{thesis.holdingWindow}</strong></div>
      </div>
      <p>{thesis.rationale}</p>
      <div className="thesis-columns">
        <div>
          <h4>Warnings</h4>
          <ul>{thesis.riskWarnings.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
        <div>
          <h4>Next Steps</h4>
          <ul>{thesis.nextSteps.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

function Analysis({analyses, activeAnalysisId, setActiveAnalysisId, onRunSource, onRunBinary, onRebuild, onRunAgent, agents, running, providers}){
  const active = analyses.find(item => item.id===activeAnalysisId) || analyses[0];
  const tintByName = {};
  (agents || []).forEach(agent => { tintByName[agent.name] = agent.tint; });

  return (
    <div className="view-pane frame analysis-view">
      <div className="analysis-top">
        <div>
          <h2>Workflow Analysis</h2>
          <div className="desc">ใช้โครงหน้าจาก ai-agents-pixels แล้วเปลี่ยนให้เป็น flow วิเคราะห์ช่องโหว่ของโปรเจกต์นี้</div>
        </div>
        <div className="analysis-count mono">{analyses.length} session runs</div>
      </div>

      <div className="analysis-layout">
        <aside className="analysis-left">
          <ActionPanel onRunSource={onRunSource} onRunBinary={onRunBinary} onRebuild={onRebuild} running={running} />
          <div className="label">Session Runs</div>
          <AnalysisList analyses={analyses} activeAnalysisId={activeAnalysisId} setActiveAnalysisId={setActiveAnalysisId} />
          <div className="label">Local Agents</div>
          <AgentRunner providers={providers || []} onRunAgent={onRunAgent} running={running} />
        </aside>

        <section className="analysis-main">
          {!active && <div className="analysis-placeholder mono">ลองกดรัน workflow ก่อนเพื่อดู agent handoff</div>}
          {active && (
            <>
              <FinalThesis analysis={active} />
              <div className="label">Agent Reports</div>
              <div className="agent-report-grid">
                {active.reports.map(report => (
                  <AgentReport key={report.agentId} report={report} tint={tintByName[report.name] || 'var(--green)'} />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { Analysis });
