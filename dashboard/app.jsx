/* ===== App: adapted from ai-agents-pixels, now wired to vuln backend ===== */
const {useState, useRef, useEffect} = React;

const STARTS = [
  {x:42,y:58},{x:52,y:62},{x:46,y:66},{x:70,y:64},{x:30,y:70},{x:58,y:52},
];

function App(){
  const [view,setView]       = useState('dashboard');
  const [history,setHistory] = useState([]);
  const [analyses,setAnalyses] = useState([]);
  const [activeAnalysisId,setActiveAnalysisId] = useState(null);
  const [agentView,setAgentView] = useState(
    AGENTS.map((a,i)=>({...a, pos:{...STARTS[i]}, flip:false, walking:false, bubble:null})));
  const [busySet,setBusySet] = useState({});
  const [floor,setFloor]     = useState({working:0, walking:0});
  const [clock,setClock]     = useState(570);
  const [day,setDay]         = useState(1);
  const [speed,setSpeed]     = useState(1);
  const [settings,setSettings] = useState({autopilot:true, anim:true, tint:true, aggr:1, labels:true, names:true});
  const [state,setState] = useState(null);
  const [running,setRunning] = useState(false);

  const agentsRef = useRef(AGENTS.map((a,i)=>({
    id:a.id, name:a.name, role:a.role, tint:a.tint, map:a.map, palette:a.palette,
    pos:{...STARTS[i]}, target:null, phase:'idle',
    workT:0, idleT:rnd(0.4, 2.6+i*0.4), pending:null, lastSt:null, flip:false,
  })));
  const clkRef=useRef(570), dayRef=useRef(1), idc=useRef(0);
  const sRef=useRef(settings), spRef=useRef(speed);
  useEffect(()=>{sRef.current=settings;},[settings]);
  useEffect(()=>{spRef.current=speed;},[speed]);

  const captureAnalysis = (backendState, label='latest-session') => {
    const analysis = createWorkflowAnalysis({
      state: backendState,
      id: `analysis-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      label,
    });
    setAnalyses(list=>[analysis,...list].slice(0,20));
    setActiveAnalysisId(analysis.id);
  };

  const fetchState = async () => {
    const res = await fetch('/api/state');
    const data = await res.json();
    setState(data);
    return data;
  };

  useEffect(()=>{
    fetchState();
  },[]);

  useEffect(()=>{
    const nextId=()=>++idc.current;
    const pushHist=(h)=> setHistory(l=>[{id:nextId(),...h},...l].slice(0,200));

    const occupiedBy=(self)=>{
      const set=new Set();
      agentsRef.current.forEach(o=>{ if(o!==self && o.target) set.add(o.target.id); });
      return set;
    };

    const chooseNext=(self)=>{
      const w=sRef.current.aggr, occ=occupiedBy(self), pool=[];
      STATIONS.forEach(st=>{
        if(occ.has(st.id) && st.zone) return;
        let wt=2;
        if(['joern','dataset','ml','retrieve','report','agents','control'].includes(st.kind)) wt=3+w;
        else wt=[3,2,1][w];
        if(st.id===self.lastSt) wt=Math.max(1,wt-2);
        for(let i=0;i<wt;i++) pool.push(st);
      });
      return pool.length ? pick(pool) : null;
    };

    const applyOutcome=(self,st,oc)=>{
      let c=clkRef.current+irnd(3,11), d=dayRef.current;
      if(c>=960){ c=570; d+=1; dayRef.current=d; setDay(d); }
      clkRef.current=c; setClock(c);
      pushHist({ day:d, time:fmtClock(c), who:self.name, tint:self.tint, station:st.name, icon:st.icon, action:(oc.bubble||'').replace('…',''), detail:oc.notif.text });
    };

    const stepAgent=(self, dts, runningAuto)=>{
      if(self.phase==='walking'){
        const t=self.target; if(!t){ self.phase='idle'; self.idleT=rnd(0.4,1.4); return; }
        const dx=t.ax-self.pos.x, dy=t.ay-self.pos.y, dist=Math.hypot(dx,dy);
        if(dist<0.9){
          self.pos={x:t.ax,y:t.ay};
          const oc=generateOutcome(t); self.pending={st:t,oc};
          self.workT=rnd(t.dur[0],t.dur[1]); self.phase='working'; self.bubble=oc.bubble;
        } else {
          const stp=Math.min(dist, 22*dts);
          self.pos={x:self.pos.x+dx/dist*stp, y:self.pos.y+dy/dist*stp};
          if(dx<-0.3) self.flip=true; else if(dx>0.3) self.flip=false;
        }
      } else if(self.phase==='working'){
        self.workT-=dts;
        if(self.workT<=0){
          const p=self.pending; self.pending=null;
          if(p) applyOutcome(self, p.st, p.oc);
          self.phase='idle'; self.idleT=rnd(0.5,2.0); self.bubble=null; self.target=null;
        }
      } else {
        if(runningAuto){
          self.idleT-=dts;
          if(self.idleT<=0){
            const nx=chooseNext(self);
            if(nx){ self.target=nx; self.lastSt=nx.id; self.phase='walking'; }
            else self.idleT=0.5;
          }
        }
      }
    };

    const step=(dt)=>{
      const dts=dt*spRef.current, runningAuto=sRef.current.autopilot;
      const agents=agentsRef.current;
      agents.forEach(a=> stepAgent(a, dts, runningAuto));

      const busy={}; let nW=0, nWalk=0;
      agents.forEach(a=>{
        if(a.phase==='working' && a.target) busy[a.target.id]=a.id;
        if(a.phase==='working') nW++; else if(a.phase==='walking') nWalk++;
      });
      setBusySet(prev=>{
        const pk=Object.keys(prev), bk=Object.keys(busy);
        if(pk.length===bk.length && bk.every(k=>prev[k]===busy[k])) return prev;
        return busy;
      });
      setFloor(prev=> (prev.working===nW && prev.walking===nWalk)? prev : {working:nW, walking:nWalk});
      setAgentView(agents.map(a=>({
        id:a.id, name:a.name, role:a.role, tint:a.tint, map:a.map, palette:a.palette,
        pos:{x:a.pos.x, y:a.pos.y}, flip:a.flip,
        walking:(a.phase==='walking'), bubble:a.bubble,
        phase:a.phase, atStation:a.target&&a.target.name,
      })));
    };

    let raf, last=performance.now();
    const tick=(now)=>{ let dt=(now-last)/1000; last=now; if(dt>0.1)dt=0.1; step(dt); raf=requestAnimationFrame(tick); };
    raf=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(raf);
  },[]);

  const onStationClick=(st)=>{
    const cands=agentsRef.current.filter(a=>a.phase!=='working');
    const list=cands.length?cands:agentsRef.current;
    let best=list[0], bd=Infinity;
    list.forEach(a=>{ const d=Math.hypot(a.pos.x-st.ax, a.pos.y-st.ay); if(d<bd){bd=d;best=a;} });
    best.target=st; best.lastSt=st.id; best.pending=null; best.phase='walking'; best.bubble=null;
    if(view!=='dashboard') setView('dashboard');
  };

  const postJson = async (url, payload) => {
    setRunning(true);
    try{
      const res = await fetch(url, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload||{}),
      });
      const data = await res.json();
      if(data.state){
        setState(data.state);
        captureAnalysis(data.state, payload?.sample || payload?.provider || url);
      }
      return data;
    } finally {
      setRunning(false);
    }
  };

  const onRunSource = ()=> postJson('/api/run-analysis', {sample:'samples/command_injection_challenge.c', outputs:'outputs_source_joern'});
  const onRunBinary = ()=> postJson('/api/run-analysis', {sample:'samples/command_injection_challenge.bin', mode:'binary', outputs:'outputs_binary'});
  const onRebuild = ()=> postJson('/api/rebuild-datasets', {});
  const onRunAgent = (provider, prompt)=> postJson('/api/run-agent', {provider, prompt});
  const onRefresh = async ()=> {
    setRunning(true);
    try{
      const data = await fetchState();
      captureAnalysis(data, 'refresh');
    } finally {
      setRunning(false);
    }
  };

  const togglePlay=()=> setSettings(s=>({...s,autopilot:!s.autopilot}));

  const statusLine = settings.autopilot
    ? `${floor.working} working · ${floor.walking} walking`
    : 'Floor paused — agents idle';

  return (
    <div className={'app'+(settings.anim?'':' no-anim')}>
      <div className="main">
        <div className="hud frame">
          <div className="ctrl">
            <button className={'btn '+(settings.autopilot?'on':'gold')} onClick={togglePlay}>
              {settings.autopilot?'⏸ Pause':'▶ Resume'}</button>
          </div>
          <div className="now">
            <div className="pin">🛡️</div>
            <div className="txt">
              <div className="lab">The Floor · {AGENTS.length} agents</div>
              <div className="act">{statusLine}</div>
            </div>
          </div>
          <div className="clock">Day {day} · {fmtClock(clock)}</div>
          <div className="seg">
            {[1,2,4].map(s=> <button key={s} className={speed===s?'on':''} onClick={()=>setSpeed(s)}>{s}×</button>)}
          </div>
        </div>

        {view==='dashboard' &&
          <Room agents={agentView} busySet={busySet} onStationClick={onStationClick}
            tint={settings.tint} showLabels={settings.labels} showNames={settings.names} />}
        {view==='analysis' && <Analysis analyses={analyses} activeAnalysisId={activeAnalysisId}
            setActiveAnalysisId={setActiveAnalysisId}
            onRunSource={onRunSource}
            onRunBinary={onRunBinary}
            onRebuild={onRebuild}
            onRunAgent={onRunAgent}
            providers={state?.providers || []}
            running={running}
            agents={agentView} />}
        {view==='history'  && <History history={history} />}
        {view==='settings' && <Settings settings={settings} setSettings={setSettings}
            onRefresh={onRefresh} speed={speed} setSpeed={setSpeed} />}
      </div>

      <Sidebar view={view} setView={setView} state={state} running={running} agents={agentView} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
