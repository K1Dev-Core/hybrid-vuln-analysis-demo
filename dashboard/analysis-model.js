/* ===== Backend-state to multi-agent workflow reports ===== */

(function(root){
  const WORKFLOW_AGENTS = [
    {agentId:'a1', name:'Pip',  role:'Intake Operator',         stageId:'intake',   passesTo:'Iris'},
    {agentId:'a4', name:'Iris', role:'Joern / CPG Analyst',     stageId:'joern',    passesTo:'Mara'},
    {agentId:'a2', name:'Mara', role:'Binary & ML Correlator',  stageId:'ml',       passesTo:'Dex'},
    {agentId:'a3', name:'Dex',  role:'Risk & Retrieval Auditor',stageId:'retrieve', passesTo:'Otis'},
    {agentId:'a5', name:'Otis', role:'Local Agent Operator',    stageId:'agents',   passesTo:'Fern'},
    {agentId:'a6', name:'Fern', role:'Final Report Curator',    stageId:'report',   passesTo:null},
  ];

  function stageById(state, stageId){
    return (state.workflow || []).find((stage) => stage.id === stageId) || null;
  }

  function stateConfidence(stage){
    if(!stage) return 40;
    if(stage.status === 'done') return 82;
    if(stage.status === 'warn') return 58;
    return 45;
  }

  function buildReport(agent, state){
    const stage = stageById(state, agent.stageId);
    const latest = state.latestFinding || {};
    const findings = [];
    if(stage?.meta) findings.push(stage.meta);
    if(latest.source && latest.sink) findings.push(`path ล่าสุด: ${latest.source} -> ${latest.sink}`);
    if(latest.file_path) findings.push(`ไฟล์ล่าสุด: ${latest.file_path}`);
    if(!findings.length) findings.push('ยังไม่มี finding ล่าสุดให้สรุป');

    return {
      agentId: agent.agentId,
      name: agent.name,
      role: agent.role,
      stage: stage?.name || agent.stageId,
      stance: stage?.status === 'done' ? 'aligned' : stage?.status === 'warn' ? 'cautious' : 'idle',
      confidence: stateConfidence(stage),
      summary: stage?.detail || 'ยังไม่มีรายละเอียดของ stage นี้',
      findings,
      passesTo: agent.passesTo,
    };
  }

  function buildFinalThesis(state, reports){
    const latest = state.latestFinding || {};
    const validation = (((state || {}).validation) || {}).validation_errors || [];
    const avgConfidence = reports.length
      ? Math.round(reports.reduce((sum, report) => sum + report.confidence, 0) / reports.length)
      : 0;

    return {
      decision: latest.sink ? 'FLAGGED' : 'WAIT',
      confidence: avgConfidence || 50,
      riskLevel: latest.sink === 'system' ? 'High' : latest.sink ? 'Medium' : 'Unknown',
      budgetRange: 'Local CLI / Local pipeline',
      holdingWindow: '1 run',
      rationale: latest.sink
        ? `ระบบมองว่าจุดเสี่ยงล่าสุดคือ flow จาก ${latest.source || 'input'} ไป ${latest.sink} และมีหลักฐานพอสมควรทั้งจาก source, ranking และ retrieval`
        : 'ยังไม่มี finding ที่เด่นพอจากข้อมูลปัจจุบัน',
      riskWarnings: validation.length
        ? validation.map((item) => item.runtime_error || `Validation issue at attempt ${item.attempt}`)
        : ['ไม่มี validation error รอบล่าสุด'],
      nextSteps: latest.sink
        ? ['เปิดอ่าน report ฉบับเต็ม', 'ตรวจ evidence รอบบรรทัดที่แจ้งเตือน', 'ลองให้ local agent ช่วยสรุปหรืออธิบายเพิ่ม']
        : ['ลองรัน source analysis ใหม่', 'ลองเปลี่ยน sample หรือ rebuild datasets'],
    };
  }

  function createWorkflowAnalysis({state, id, label}){
    const reports = WORKFLOW_AGENTS.map((agent) => buildReport(agent, state));
    return {
      id: id || `analysis-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ticker: label || (state.latestFinding?.file_path || 'current-session'),
      scenarioLabel: 'Hybrid Vulnerability Workflow',
      reports,
      finalThesis: buildFinalThesis(state, reports),
    };
  }

  const api = { createWorkflowAnalysis };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AnalysisModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
