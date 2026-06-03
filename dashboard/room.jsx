/* ===== The living room (main dashboard view) ===== */

function Station({st, busyAgent, onClick, showLabels}){
  const busy = !!busyAgent;
  return (
    <div className={'station'+(st.zone?' work':'')+(busy?' busy':'')}
      style={{left:st.x+'%', top:st.y+'%'}} onClick={()=>onClick(st)} title={st.name}>
      <div className="ring"></div>
      {st.zone && showLabels && <div className="zone-tag">{st.tag}</div>}
      <div className="tip">{st.icon} {st.name}{busy?' · busy':''}</div>
      {busy && <div className="spark">✦</div>}
    </div>
  );
}

function Room({agents, busySet, onStationClick, tint, showLabels, showNames}){
  // Keep a STABLE DOM order (by id) and use z-index for depth — re-sorting the
  // DOM every frame was what made the agents flicker as they passed each other.
  return (
    <div className="stage">
      <div className={'room'+(tint?' day-tint':'')} style={{backgroundImage:'url(assets/room.png)'}}>
        {STATIONS.map(st=>(
          <Station key={st.id} st={st} busyAgent={busySet[st.id]} onClick={onStationClick} showLabels={showLabels} />
        ))}
        {agents.map(a=>(
          <Agent key={a.id} a={a} scale={3} showName={showNames} z={100 + Math.round(a.pos.y)} />
        ))}
      </div>
      <div className="room-hint mono">✦ Click any work zone to send the nearest agent there</div>
    </div>
  );
}

Object.assign(window, { Room, Station });
