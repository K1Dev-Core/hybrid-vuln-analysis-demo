/* ===== Secondary views: Activity & Settings ===== */

function History({history}){
  return (
    <div className="view-pane frame">
      <h2>📜 Workflow History</h2>
      <div className="desc">รายการ action ล่าสุดจาก dashboard, pipeline และ local agents</div>
      <div className="table">
        <table>
          <thead><tr>
            <th>Title</th><th>Detail</th>
          </tr></thead>
          <tbody>
            {history.length===0 && <tr><td colSpan="2" className="muted">ยังไม่มี history ในรอบนี้</td></tr>}
            {history.map(h=>(
              <tr key={h.id}>
                <td>{h.title}</td>
                <td className="muted">{h.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Toggle({on,onClick}){ return <div className={'toggle'+(on?' on':'')} onClick={onClick}><div className="knob"></div></div>; }

function Settings({settings, setSettings, onRefresh, speed, setSpeed}){
  const set = (k,v)=> setSettings(s=>({...s,[k]:v}));
  return (
    <div className="view-pane frame">
      <h2>⚙️ Dashboard Settings</h2>
      <div className="desc">คุมเฉพาะพฤติกรรมของ dashboard และ floor animation ไม่ได้ไปแตะผลวิเคราะห์ข้างหลัง</div>

      <div className="set-row">
        <div className="k">Autopilot<small>ให้ agent เดินรอบห้องอัตโนมัติ</small></div>
        <Toggle on={settings.autopilot} onClick={()=>set('autopilot',!settings.autopilot)} />
      </div>
      <div className="set-row">
        <div className="k">Animations<small>เปิด/ปิดการขยับของ sprite และเอฟเฟกต์</small></div>
        <Toggle on={settings.anim} onClick={()=>set('anim',!settings.anim)} />
      </div>
      <div className="set-row">
        <div className="k">Evening light<small>เปิดโทนสีห้องแบบเดิมจากต้นแบบ</small></div>
        <Toggle on={settings.tint} onClick={()=>set('tint',!settings.tint)} />
      </div>
      <div className="set-row">
        <div className="k">Zone labels<small>แสดงป้าย stage บนห้องตลอดเวลา</small></div>
        <Toggle on={settings.labels} onClick={()=>set('labels',!settings.labels)} />
      </div>
      <div className="set-row">
        <div className="k">Agent names<small>แสดงชื่อ agent ใต้ sprite</small></div>
        <Toggle on={settings.names} onClick={()=>set('names',!settings.names)} />
      </div>
      <div className="set-row">
        <div className="k">Sim speed<small>ความเร็วการเดินของ workflow floor</small></div>
        <div className="seg">
          {[1,2,4].map(s=>(
            <button key={s} className={speed===s?'on':''} onClick={()=>setSpeed(s)}>{s}×</button>
          ))}
        </div>
      </div>
      <div className="set-row" style={{borderBottom:'none'}}>
        <div className="k">Refresh state<small>ดึงสถานะล่าสุดจาก backend ใหม่</small></div>
        <div className="btn gold" onClick={onRefresh}>↻ Refresh</div>
      </div>
    </div>
  );
}

Object.assign(window, { History, Settings, Toggle });
