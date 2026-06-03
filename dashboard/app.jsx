const { useEffect, useMemo, useState } = React;

const STAGES = [
  { id: "ingest", name: "รับไฟล์เข้า", tag: "INGEST", x: 14, y: 18, detail: "รับ source, binary หรือโจทย์ที่จะส่งเข้าระบบ" },
  { id: "joern", name: "Joern CPG", tag: "CPG", x: 38, y: 16, detail: "สร้างและ query path จาก source code จริง" },
  { id: "binary", name: "Binary Evidence", tag: "BIN", x: 62, y: 18, detail: "เก็บหลักฐานจาก strings, imports และ radare2" },
  { id: "ml", name: "ML Ranking", tag: "ML", x: 82, y: 33, detail: "ให้คะแนน path ที่น่าสงสัยที่สุด" },
  { id: "context", name: "Selective Context", tag: "CTX", x: 68, y: 60, detail: "ตัด snippet เฉพาะช่วงที่เสี่ยง" },
  { id: "retrieval", name: "Knowledge Retrieval", tag: "RAG", x: 43, y: 64, detail: "ดึงโน้ตและ write-up ที่เกี่ยวข้อง" },
  { id: "report", name: "Agent Report", tag: "AGENT", x: 20, y: 56, detail: "ให้ local agent หรือ fallback เขียนสรุปรายงาน" },
];

const TEAM = [
  { id: "a1", name: "Scout", tint: "#4f8a4e", stage: "ingest" },
  { id: "a2", name: "Jo", tint: "#4c79c3", stage: "joern" },
  { id: "a3", name: "Binx", tint: "#cf5b4b", stage: "binary" },
  { id: "a4", name: "Rank", tint: "#e2b54f", stage: "ml" },
  { id: "a5", name: "Raggy", tint: "#7b55c9", stage: "retrieval" },
  { id: "a6", name: "Sage", tint: "#3ea692", stage: "report" },
];

function Sparkline({ values }) {
  const safe = values.length ? values : [0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = max === min ? 1 : max - min;
  const points = safe
    .map((value, index) => {
      const x = safe.length === 1 ? 0 : (index / (safe.length - 1)) * 100;
      const y = 100 - ((value - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="sparkline">
      <div className="sparkline-line">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke="var(--screen-line)"
            strokeWidth="3"
            points={points}
          />
        </svg>
      </div>
    </div>
  );
}

function Sidebar({ view, setView, state }) {
  const nav = [
    ["overview", "ภาพรวม"],
    ["workflow", "Workflow"],
    ["datasets", "Datasets"],
    ["agents", "Local Agents"],
  ];

  const metrics = state?.metrics || {};
  const providers = state?.providers || [];
  const datasets = state?.datasetSummary || {};
  const activity = state?.activityLog || [];

  return (
    <aside className="sidebar">
      <div className="frame card tight">
        <div className="brand">
          <div className="brand-badge">AI</div>
          <div>
            <h1>Hybrid Vuln Ops</h1>
            <div className="sub">dashboard + workflow + local agents</div>
          </div>
        </div>
      </div>

      <div className="frame card tight">
        <div className="nav">
          {nav.map(([id, label]) => (
            <button
              key={id}
              className={`nav-btn${view === id ? " active" : ""}`}
              onClick={() => setView(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="frame card">
        <div className="label">สถานะล่าสุด</div>
        <div className="stats">
          <div className="stat"><span className="k">Analyzer</span><span className="v">{metrics.analyzer || "-"}</span></div>
          <div className="stat"><span className="k">Candidate Paths</span><span className="v">{metrics.candidateCount ?? "-"}</span></div>
          <div className="stat"><span className="k">Training Rows</span><span className="v">{datasets.augmented_training_rows ?? "-"}</span></div>
          <div className="stat"><span className="k">Write-ups</span><span className="v">{datasets.writeup_total ?? "-"}</span></div>
        </div>
        <Sparkline values={[
          datasets.devign_total || 0,
          datasets.msr_total || 0,
          datasets.writeup_total || 0,
          datasets.augmented_training_rows || 0,
        ]} />
      </div>

      <div className="frame card">
        <div className="label">Local Providers</div>
        <div className="provider-list">
          {providers.map((provider) => (
            <div className="provider-item" key={provider.id}>
              <strong>{provider.label}</strong>
              <div className="provider-meta">
                {provider.available ? `พร้อมใช้ที่ ${provider.path}` : "ยังไม่เจอในเครื่อง"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="frame card">
        <div className="label">Activity</div>
        <div className="activity-list">
          {activity.length === 0 && <div className="activity-item"><div className="activity-meta">ยังไม่มี action ในรอบนี้</div></div>}
          {activity.map((item) => (
            <div className="activity-item" key={item.id}>
              <strong>{item.title}</strong>
              <div className="activity-meta">{item.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function WorkflowFloor({ workflow, selectedStage, onSelect }) {
  const stateById = {};
  workflow.forEach((item) => {
    stateById[item.id] = item;
  });

  return (
    <div className="floor">
      <div className="floor-grid" />
      {STAGES.map((stage) => {
        const status = stateById[stage.id]?.status || "idle";
        return (
          <div
            className={`station ${status === "done" ? "done" : status === "warn" ? "warn" : ""}`}
            style={{ left: `${stage.x}%`, top: `${stage.y}%` }}
            key={stage.id}
            onClick={() => onSelect(stage.id)}
          >
            <div className="station-ring" />
            <div className="station-label">{stage.tag}</div>
            <div className="station-hint">{stage.name}</div>
          </div>
        );
      })}

      {TEAM.map((agent) => {
        const stage = STAGES.find((item) => item.id === agent.stage);
        if (!stage) return null;
        return (
          <div className="agent" style={{ left: `${stage.x + 4}%`, top: `${stage.y + 9}%` }} key={agent.id}>
            <div className="agent-body" style={{ background: agent.tint }} />
            <div className="agent-name">{agent.name}</div>
          </div>
        );
      })}
    </div>
  );
}

function OverviewView({ state }) {
  const best = state?.latestFinding || {};
  return (
    <div className="panel frame">
      <div className="label">สรุปภาพรวม</div>
      <div className="workflow-detail">
        <h3>Finding ล่าสุด</h3>
        <p>
          ระบบล่าสุดมองว่า path จาก <strong>{best.source || "-"}</strong> ไป <strong>{best.sink || "-"}</strong>
          {" "}ในไฟล์ <strong>{best.file_path || "-"}</strong> เป็นจุดที่น่าสงสัยที่สุด
        </p>
        <div className="meta-grid">
          <div className="meta-box"><span>Line</span><strong>{best.source_line ?? "-"} → {best.sink_line ?? "-"}</strong></div>
          <div className="meta-box"><span>Score</span><strong>{typeof best.score === "number" ? best.score.toFixed(3) : "-"}</strong></div>
          <div className="meta-box"><span>Origin</span><strong>{best.origin || "-"}</strong></div>
          <div className="meta-box"><span>Guarded</span><strong>{String(best.is_guarded ?? "-")}</strong></div>
        </div>
      </div>
      <div style={{ height: 12 }} />
      <div className="report-box">
        <h3>Report ล่าสุด</h3>
        <p>{state?.reportPreview || "ยังไม่มีรายงาน"}</p>
      </div>
    </div>
  );
}

function WorkflowView({ state }) {
  const [selectedStage, setSelectedStage] = useState("joern");
  const workflow = state?.workflow || [];
  const active = workflow.find((item) => item.id === selectedStage) || workflow[0];

  return (
    <div className="content">
      <div className="panel frame">
        <div className="label">Pipeline Floor</div>
        <WorkflowFloor workflow={workflow} selectedStage={selectedStage} onSelect={setSelectedStage} />
      </div>
      <div className="panel frame">
        <div className="label">Stage Detail</div>
        <div className="workflow-detail">
          <h3>{active?.name || "ยังไม่มี stage"}</h3>
          <p>{active?.detail || "ยังไม่มีข้อมูล"}</p>
          <div className="row" style={{ marginTop: 12 }}>
            <span className="pill">status: {active?.status || "-"}</span>
            {active?.meta && <span className="pill">{active.meta}</span>}
          </div>
        </div>
        <div style={{ height: 12 }} />
        <div className="report-box">
          <h3>Latest Evidence</h3>
          <p>{state?.latestEvidence || "ยังไม่มี evidence"}</p>
        </div>
      </div>
    </div>
  );
}

function DatasetView({ state, onRunAction, running }) {
  const summary = state?.datasetSummary || {};
  return (
    <div className="content">
      <div className="panel frame">
        <div className="label">Dataset Summary</div>
        <div className="dataset-list">
          <div className="dataset-item"><strong>Devign</strong><div className="dataset-meta">{summary.devign_total || 0} ฟังก์ชัน</div></div>
          <div className="dataset-item"><strong>MSR 20 C/C++</strong><div className="dataset-meta">{summary.msr_total || 0} รายการ</div></div>
          <div className="dataset-item"><strong>CTF Write-ups</strong><div className="dataset-meta">{summary.writeup_total || 0} ไฟล์</div></div>
          <div className="dataset-item"><strong>Training Rows</strong><div className="dataset-meta">{summary.augmented_training_rows || 0} แถว</div></div>
        </div>
      </div>
      <div className="panel frame">
        <div className="label">Dataset Actions</div>
        <div className="agent-form">
          <p>ถ้าต้อง rebuild dataset จากข้อมูลจริงใหม่ กดปุ่มนี้ได้เลย ระบบจะรัน `build_real_datasets.py` ให้</p>
          <button className="btn gold" type="button" disabled={running} onClick={() => onRunAction("rebuild-datasets")}>
            {running ? "กำลังรัน..." : "Rebuild Datasets"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentsView({ state, onRunAgent, running }) {
  const providers = state?.providers || [];
  const availableProvider = providers.find((item) => item.available)?.id || "gemini";
  const [provider, setProvider] = useState(availableProvider);
  const [prompt, setPrompt] = useState("อ่าน finding ล่าสุดของโปรเจกต์นี้ แล้วสรุปความเสี่ยงกับแนวทางแก้แบบสั้น กระชับ และเป็นภาษาไทย");
  const [output, setOutput] = useState("");

  async function submit() {
    const result = await onRunAgent(provider, prompt);
    if (result?.output) setOutput(result.output);
    else if (result?.error) setOutput(result.error);
  }

  return (
    <div className="content">
      <div className="panel frame">
        <div className="label">Local Agent Runner</div>
        <div className="agent-form">
          <label>
            Provider
            <select value={provider} onChange={(event) => setProvider(event.target.value)}>
              {providers.map((item) => (
                <option key={item.id} value={item.id} disabled={!item.available}>
                  {item.label}{item.available ? "" : " (not found)"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prompt
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>
          <button className="btn primary" type="button" disabled={running} onClick={submit}>
            {running ? "กำลังรัน..." : "Run Local Agent"}
          </button>
        </div>
      </div>
      <div className="panel frame">
        <div className="label">Agent Output</div>
        <div className="agent-output">
          {output || "ยังไม่มีผลลัพธ์ ลองเลือก provider แล้วกด Run Local Agent"}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [view, setView] = useState("overview");
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);

  async function fetchState() {
    const response = await fetch("/api/state");
    const data = await response.json();
    setState(data);
    return data;
  }

  useEffect(() => {
    fetchState();
  }, []);

  async function postJson(url, payload) {
    setLoading(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      });
      const data = await response.json();
      if (data.state) setState(data.state);
      return data;
    } finally {
      setLoading(false);
    }
  }

  async function runTopAction(action) {
    if (action === "source") {
      await postJson("/api/run-analysis", {
        sample: "samples/command_injection_challenge.c",
        outputs: "outputs_source_joern",
      });
    } else if (action === "binary") {
      await postJson("/api/run-analysis", {
        sample: "samples/command_injection_challenge.bin",
        mode: "binary",
        outputs: "outputs_binary",
      });
    } else if (action === "rebuild-datasets") {
      await postJson("/api/rebuild-datasets");
    } else {
      await fetchState();
    }
  }

  async function runAgent(provider, prompt) {
    return postJson("/api/run-agent", { provider, prompt });
  }

  const content = useMemo(() => {
    if (!state) {
      return <div className="panel frame"><div className="label">กำลังโหลด</div><div className="workflow-detail"><p>กำลังอ่านสถานะของระบบ...</p></div></div>;
    }
    if (view === "workflow") return <WorkflowView state={state} />;
    if (view === "datasets") return <DatasetView state={state} onRunAction={runTopAction} running={loading} />;
    if (view === "agents") return <AgentsView state={state} onRunAgent={runAgent} running={loading} />;
    return <OverviewView state={state} />;
  }, [view, state, loading]);

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} state={state} />
      <main className="main">
        <div className="frame topbar">
          <div>
            <h2>Workflow Dashboard</h2>
            <div className="sub">adapted from ai-agents-pixels ให้เข้ากับ hybrid vulnerability pipeline</div>
          </div>
          <div className="top-actions">
            <button className="btn primary" type="button" disabled={loading} onClick={() => runTopAction("source")}>Run Source Analysis</button>
            <button className="btn" type="button" disabled={loading} onClick={() => runTopAction("binary")}>Run Binary Analysis</button>
            <button className="btn gold" type="button" disabled={loading} onClick={() => runTopAction("refresh")}>Refresh</button>
          </div>
        </div>
        {content}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
