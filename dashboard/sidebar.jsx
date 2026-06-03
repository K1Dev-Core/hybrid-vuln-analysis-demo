/* ===== Sidebar: same shell as ai-agents-pixels but wired to our state ===== */

function Spark({data}){
  const ref = React.useRef(null);
  React.useEffect(()=>{
    const cv = ref.current; if(!cv) return;
    const ctx = cv.getContext('2d');
    const W=cv.width, H=cv.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='rgba(63,138,89,.25)';
    for(let y=10;y<H;y+=12) for(let x=0;x<W;x+=5) ctx.fillRect(x,y,2,1);
    const pts = data.length>1 ? data : [0,0];
    let mn=Math.min(...pts), mx=Math.max(...pts); if(mx===mn){mx+=1;mn-=1;}
    const pad=6;
    const X=i=> (i/(pts.length-1))*(W-pad*2)+pad;
    const Y=v=> H-pad - ((v-mn)/(mx-mn))*(H-pad*2);
    ctx.beginPath(); ctx.moveTo(X(0),H);
    pts.forEach((v,i)=>ctx.lineTo(X(i),Y(v)));
    ctx.lineTo(X(pts.length-1),H); ctx.closePath();
    ctx.fillStyle='rgba(111,224,140,.16)'; ctx.fill();
    ctx.beginPath(); pts.forEach((v,i)=> i?ctx.lineTo(X(i),Y(v)):ctx.moveTo(X(i),Y(v)));
    ctx.strokeStyle='#6fe08c'; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.stroke();
    const lx=X(pts.length-1), ly=Y(pts[pts.length-1]);
    ctx.fillStyle='#d7ffe2'; ctx.fillRect(lx-2,ly-2,4,4);
  },[data]);
  return <canvas ref={ref} width={264} height={46} className="spark" />;
}

function NavBtn({icon,label,id,view,setView,badge}){
  return (
    <div className={'nav-btn'+(view===id?' active':'')} onClick={()=>setView(id)}>
      <span className="ico">{icon}</span>{label}
      {badge>0 && <span className="badge">{badge}</span>}
    </div>
  );
}

function Sidebar({view,setView,state,running,agents}){
  const metrics = state?.metrics || {};
  const summary = state?.datasetSummary || {};
  const notifs = state?.activityLog || [];

  return (
    <aside className="sidebar">
      <div className="side-card frame tight">
        <div className="brand">
          <div className="ava"><AvatarFace scale={4} /></div>
          <div>
            <h1>VULN OPS</h1>
            <div className="sub">
              <span className="status-dot" style={{background: running?'var(--gold)':'var(--up)'}}></span>
              {running? 'workflow busy' : `${agents?agents.length:0} agents on the floor`}
            </div>
          </div>
        </div>
      </div>

      <div className="side-card frame tight">
        <nav className="nav">
          <NavBtn icon="🏠" label="Dashboard" id="dashboard" view={view} setView={setView} />
          <NavBtn icon="🧠" label="Analysis"  id="analysis"  view={view} setView={setView} />
          <NavBtn icon="📜" label="History"   id="history"   view={view} setView={setView} badge={notifs.length} />
          <NavBtn icon="⚙️" label="Settings"  id="settings"  view={view} setView={setView} />
        </nav>
      </div>

      <div className="side-card frame">
        <div className="label">Live Stats</div>
        <div className="stats">
          <div className="stat"><span className="k">Analyzer</span><span className="v">{metrics.analyzer || '-'}</span></div>
          <div className="stat"><span className="k">Paths</span><span className="v">{fmtCount(metrics.candidateCount || 0)}</span></div>
          <div className="stat"><span className="k">Train Rows</span><span className="v">{fmtCount(summary.augmented_training_rows || 0)}</span></div>
          <div className="stat"><span className="k">Write-ups</span><span className="v">{fmtCount(summary.writeup_total || 0)}</span></div>
        </div>
        <Spark data={[summary.devign_total||0, summary.msr_total||0, summary.writeup_total||0, summary.augmented_training_rows||0]} />
      </div>

      <div className="side-card frame tight">
        <div className="label">The Team</div>
        <div className="team">
          {(agents||[]).map(a=>{
            const act = a.phase==='working' ? (a.atStation||'working')
                      : a.phase==='walking' ? 'on the move' : 'idle';
            return (
              <div className="teammate" key={a.id} title={`${a.name} · ${a.role} — ${act}`}>
                <div className="tm-face" style={{borderColor:a.tint}}>
                  <MiniFace palette={a.palette} map={a.map} scale={3} />
                  <span className={'tm-dot'+(a.phase==='working'?' on':a.phase==='walking'?' go':'')}></span>
                </div>
                <div className="tm-name">{a.name}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="side-card frame notif-wrap">
        <div className="label">Activity Log</div>
        <div className="notif-list">
          {notifs.length===0 && <div className="mono muted" style={{fontSize:16}}>Waiting for the agent…</div>}
          {notifs.map(n=>(
            <div key={n.id} className="notif plain">
              <span className="ic">✦</span>
              <div>
                <div className="tx">{n.title}</div>
                <div className="tm">{n.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar, Spark });
