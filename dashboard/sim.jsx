/* ===== Simulation: workflow stations, helpers, and themed activity ===== */

const STATIONS = [
  { id:'intake',    name:'Intake Desk',       tag:'INTAKE',    icon:'📥', kind:'ingest',    zone:true,  x:13, y:15, ax:13, ay:31, dur:[1.8,3.0] },
  { id:'joern',     name:'Joern CPG',         tag:'JOERN',     icon:'🕸️', kind:'joern',     zone:true,  x:33, y:13, ax:33, ay:31, dur:[2.0,3.2] },
  { id:'cwe',       name:'CWE Wall',          tag:'CWE',       icon:'🧱', kind:'review',    zone:true,  x:46, y:14, ax:46, ay:31, dur:[1.6,2.8] },
  { id:'binary',    name:'Binary Watch',      tag:'BINARY',    icon:'🧩', kind:'binary',    zone:true,  x:59, y:15, ax:59, ay:31, dur:[2.0,3.2] },
  { id:'agents',    name:'Agent Console',     tag:'AGENTS',    icon:'🤖', kind:'agents',    zone:true,  x:84, y:19, ax:84, ay:31, dur:[1.8,2.8] },
  { id:'datasets',  name:'Dataset Forge',     tag:'DATASET',   icon:'🧪', kind:'dataset',   zone:true,  x:20, y:40, ax:27, ay:47, dur:[2.2,3.8] },
  { id:'retrieve',  name:'Retrieval Bay',     tag:'RAG',       icon:'📚', kind:'retrieve',  zone:true,  x:80, y:36, ax:81, ay:45, dur:[2.0,3.4] },
  { id:'ml',        name:'ML Ranking',        tag:'RANK',      icon:'📊', kind:'ml',        zone:true,  x:31, y:64, ax:31, ay:74, dur:[2.0,3.4] },
  { id:'control',   name:'Workflow Control',  tag:'FLOW',      icon:'🧭', kind:'control',   zone:true,  x:19, y:67, ax:19, ay:81, dur:[2.0,3.0] },
  { id:'context',   name:'Context Garden',    tag:'CTX',       icon:'🌱', kind:'context',   zone:true,  x:47, y:68, ax:47, ay:78, dur:[1.8,3.0] },
  { id:'report',    name:'Report Library',    tag:'REPORT',    icon:'📝', kind:'report',    zone:true,  x:74, y:74, ax:78, ay:86, dur:[2.0,3.4] },
  { id:'coffee',    name:'Coffee Bar',        icon:'☕', kind:'rest',  zone:false, x:75, y:19, ax:73, ay:30, dur:[1.2,2.2] },
  { id:'lounge',    name:'The Lounge',        icon:'🛋️', kind:'rest',  zone:false, x:47, y:43, ax:47, ay:60, dur:[1.4,2.6] },
  { id:'pingpong',  name:'Break Room',        icon:'🏓', kind:'break', zone:false, x:77, y:60, ax:72, ay:70, dur:[1.6,2.8] },
];

const rnd  = (a,b)=> a + Math.random()*(b-a);
const irnd = (a,b)=> Math.floor(rnd(a,b+1));
const pick = arr => arr[Math.floor(Math.random()*arr.length)];

function fmtCount(n){ return Number(n||0).toLocaleString('en-US'); }
function fmtClock(mins){
  let h=Math.floor(mins/60), m=mins%60; const ap=h>=12?'PM':'AM';
  let hh=h%12; if(hh===0) hh=12;
  return `${hh}:${String(m).padStart(2,'0')} ${ap}`;
}

function stageBubble(st){
  const bubbles = {
    ingest:['Queueing samples','Preparing intake','Collecting artifacts'],
    joern:['Parsing with Joern','Walking the CPG','Tracing source to sink'],
    review:['Reviewing CWE notes','Pinning risk tags','Checking evidence'],
    binary:['Scanning the binary','Checking imports','Hunting strings'],
    agents:['Wiring local agent','Testing provider CLI','Syncing the runner'],
    dataset:['Rebuilding datasets','Collecting benchmarks','Shaping training rows'],
    retrieve:['Searching write-ups','Pulling related notes','Reading context'],
    ml:['Ranking candidates','Scoring risky paths','Sorting findings'],
    control:['Orchestrating flow','Dispatching tasks','Tracking stages'],
    context:['Windowing code','Cropping evidence','Focusing the snippet'],
    report:['Writing report','Summarizing the finding','Preparing final notes'],
    rest:['Brewing coffee','Catching a breather','Waiting for the next run'],
    break:['Quick break','Stretching it out','Resetting focus'],
  };
  return pick(bubbles[st.kind] || ['Working']);
}

function stageNotif(st){
  const texts = {
    ingest:'รับไฟล์และเตรียมส่งเข้าระบบแล้ว',
    joern:'Joern ดึง path จาก source code แล้ว',
    review:'อัปเดตมุมมองความเสี่ยงจากหลักฐานใหม่',
    binary:'ยืนยันหลักฐานจาก binary เพิ่มแล้ว',
    agents:'เช็กสถานะ local agent runner แล้ว',
    dataset:'อัปเดต dataset และ training rows แล้ว',
    retrieve:'ดึง knowledge base มาประกอบแล้ว',
    ml:'จัดอันดับ candidate path ใหม่แล้ว',
    control:'ซิงก์ workflow state แล้ว',
    context:'ตัด context รอบจุดเสี่ยงแล้ว',
    report:'เตรียมรายงานสรุปแล้ว',
    rest:'พักสั้น ๆ รอรอบถัดไป',
    break:'เคลียร์หัวก่อนกลับไปทำงานต่อ',
  };
  return texts[st.kind] || 'ทำงานเสร็จแล้ว';
}

function generateOutcome(st){
  return {
    bubble:`${stageBubble(st)}…`,
    taskInc: st.zone ? 1 : 0,
    notif:{
      ic: st.zone ? '✅' : '☕',
      text:`${st.name}: ${stageNotif(st)}`,
      kind: st.zone ? 'up' : 'plain',
    }
  };
}

Object.assign(window, { STATIONS, rnd, irnd, pick, fmtClock, fmtCount, generateOutcome });
