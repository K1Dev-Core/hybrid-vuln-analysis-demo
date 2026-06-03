/* ===== Pixel sprite engine — renders a string pixel-map as CSS box-shadows ===== */

const SPRITE_PALETTE = {
  '.': null,
  'K': '#3a2412', // hair
  'F': '#f0c094', // face
  'f': '#d99e6b', // face shadow
  'E': '#26303a', // eyes
  'W': '#f3ead2', // collar
  'S': '#4f8a4e', // shirt
  's': '#356b3a', // shirt shadow
  'T': '#e7b53c', // tie
  'A': '#f0c094', // arms
  'P': '#33271a', // pants
  'O': '#1c130b', // shoes
};

// 13 wide x 16 tall — short hair
const TRADER_MAP = [
  '....KKKKK....',
  '...KKKKKKK...',
  '..KKKKKKKKK..',
  '..KFFFFFFFK..',
  '..KFFFFFFFK..',
  '..FFEFFFEFF..',
  '..FFFFFFFFF..',
  '..FfFFFFFfF..',
  '...WWSSSWW...',
  '..AsSSTSSsA..',
  '..ASSSTSSSA..',
  '..ASSSSSSSA..',
  '..AsSSSSSsA..',
  '...PPPPPPP...',
  '...PP..PP....',
  '...OO..OO....',
];

// 13 wide x 16 tall — long hair (to shoulders)
const TRADER_MAP_LONG = [
  '....KKKKK....',
  '...KKKKKKK...',
  '..KKKKKKKKK..',
  '.KKFFFFFFFKK.',
  '.KKFFFFFFFKK.',
  '.KFFEFFFEFFK.',
  '.KFFFFFFFFFK.',
  '.KFfFFFFFfFK.',
  '..KWWSSSWWK..',
  '..AsSSTSSsA..',
  '..ASSSTSSSA..',
  '..ASSSSSSSA..',
  '..AsSSSSSsA..',
  '...PPPPPPP...',
  '...PP..PP....',
  '...OO..OO....',
];

// per-agent palette = base + overrides (hair K, shirt S/s, tie T)
function mkPalette(o){ return {...SPRITE_PALETTE, ...o}; }

// the team roster — distinct colors so each agent reads at a glance
const AGENTS = [
  { id:'a1', name:'Pip',  role:'Lead Trader', tint:'#4f8a4e', map:TRADER_MAP,
    palette:mkPalette({K:'#3a2412', S:'#4f8a4e', s:'#356b3a', T:'#e7b53c'}) },
  { id:'a2', name:'Mara', role:'Quant',       tint:'#4a78c4', map:TRADER_MAP_LONG,
    palette:mkPalette({K:'#20140c', S:'#4a78c4', s:'#355a98', T:'#f0d24a'}) },
  { id:'a3', name:'Dex',  role:'Risk',        tint:'#c25a48', map:TRADER_MAP,
    palette:mkPalette({K:'#5a3318', S:'#c25a48', s:'#97402f', T:'#2e3b2a'}) },
  { id:'a4', name:'Iris', role:'Research',    tint:'#8a5cc4', map:TRADER_MAP_LONG,
    palette:mkPalette({K:'#43301c', S:'#8a5cc4', s:'#6a3fa0', T:'#e7b53c'}) },
  { id:'a5', name:'Otis', role:'Ops',         tint:'#3fa89a', map:TRADER_MAP,
    palette:mkPalette({K:'#2a1c10', S:'#3fa89a', s:'#2c7d72', T:'#e7b53c'}) },
  { id:'a6', name:'Fern', role:'Signals',     tint:'#d98b3c', map:TRADER_MAP_LONG,
    palette:mkPalette({K:'#6b4a24', S:'#d98b3c', s:'#b56a22', T:'#2e4a2c'}) },
];

// build a box-shadow string from a pixel map
function buildShadows(map, scale, palette){
  const parts = [];
  for(let r=0;r<map.length;r++){
    const row = map[r];
    for(let c=0;c<row.length;c++){
      const col = palette[row[c]];
      if(!col) continue;
      parts.push(`${c*scale}px ${r*scale}px 0 0 ${col}`);
    }
  }
  return parts.join(',');
}

function PixelSprite({map, scale=4, palette=SPRITE_PALETTE, flip=false, className=''}){
  const cols = map[0].length, rows = map.length;
  const shadow = React.useMemo(()=>buildShadows(map, scale, palette), [map, scale, palette]);
  return (
    <div className={'sprite '+className}
      style={{width:cols*scale, height:rows*scale, transform: flip?'scaleX(-1)':'none'}}>
      <div className="px" style={{'--s':scale+'px', width:scale, height:scale, boxShadow:shadow}} />
    </div>
  );
}

// a single walking agent (positioned by parent via left/top %)
function Agent({a, scale=3, showName, z}){
  return (
    <div className={'agent'+(a.walking?' walking':'')}
      style={{left:a.pos.x+'%', top:a.pos.y+'%', zIndex:z}}>
      {a.bubble && <div className="bubble">{a.bubble}</div>}
      <div className="shadow" />
      <div className="bobber">
        <PixelSprite map={a.map||TRADER_MAP} scale={scale} flip={a.flip} palette={a.palette||SPRITE_PALETTE} />
      </div>
      {showName && <div className="name-tag" style={{borderColor:a.tint}}>{a.name}</div>}
    </div>
  );
}

// small head-only avatar (sidebar / roster)
function MiniFace({palette=SPRITE_PALETTE, map=TRADER_MAP, scale=4}){
  const head = map.slice(0,8);
  return <PixelSprite map={head} scale={scale} palette={palette} />;
}
function AvatarFace({scale=4}){ return <MiniFace scale={scale} />; }

Object.assign(window, { PixelSprite, Agent, MiniFace, AvatarFace, TRADER_MAP, TRADER_MAP_LONG, SPRITE_PALETTE, AGENTS });
