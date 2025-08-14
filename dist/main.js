// Pulse Drive — single bundled module (imports THREE from CDN)
import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";

// ===== Math & PRNG =====
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=(t)=>t*t*(3-2*t);
function mulberry32(seed){let t=seed>>>0;return function(){t|=0;t=t+0x6D2B79F5|0;let r=Math.imul(t^(t>>>15),1|t);r=r+(Math.imul(r^r>>>7,61|r)^r)|0;return ((r^r>>>14)>>>0)/4294967296}}

// ===== Storage =====
const Storage={
  load(key,def){try{const s=localStorage.getItem(key);return s?JSON.parse(s):def}catch(_){return def}},
  save(key,val){try{localStorage.setItem(key,JSON.stringify(val))}catch(_){}}
};

// ===== Settings / Bests =====
const settings=Storage.load("pd_settings",{music:true,lowFX:false});
const bests=Storage.load("pd_bests",{A:null,B:null,C:null});
const last=Storage.load("pd_last",{car:0,color:"#27c9ff",track:"A"});

// ===== Audio (two-tag crossfade) =====
class Music {
  constructor(){
    this.a=document.getElementById('audA');
    this.b=document.getElementById('audB');
    this.active=this.a; this.inactive=this.b;
    this.fade=1.5; this.enabled=settings.music;
    this.a.volume=0; this.b.volume=0; this.a.loop=true; this.b.loop=true;
    this.menuURL="https://raw.githubusercontent.com/esteves7771/Pulse-Drive/main/retro-gaming-271301.mp3";
    this.raceURL="https://raw.githubusercontent.com/esteves7771/Pulse-Drive/main/edm-gaming-music-335408.mp3";
    document.addEventListener('pointerdown',()=>{this.unlock()},{once:true});
  }
  unlock(){ if(this.enabled){ this.active.play().catch(()=>{});} }
  async setEnabled(on){ this.enabled=on; settings.music=on; Storage.save("pd_settings",settings);
    if(!on){ this.a.pause(); this.b.pause(); this.a.volume=this.b.volume=0; }
    else{ this.active.play().catch(()=>{}); }
  }
  async crossTo(url){
    if(!this.enabled){ this.active.src=url; return; }
    const dst=this.inactive; dst.src=url; await dst.play().catch(()=>{});
    const src=this.active; const dur=this.fade; let t=0; const step=(ts)=>{
      t+=16/1000; const k=clamp(t/dur,0,1); src.volume=1-k; dst.volume=k; if(k<1) requestAnimationFrame(step); else {src.pause(); this.inactive=src; this.active=dst;}}
    step();
  }
  toMenu(){ this.crossTo(this.menuURL); }
  toRace(){ this.crossTo(this.raceURL); }
}
const music=new Music();

// ===== Input (KB + Gamepad + Touch) =====
class Input {
  constructor(){
    this.keys=new Set(); this.gamepadIndex=null; this.padState={steer:0,th:0,br:0,hand:0,pause:0,music:0};
    this.touch={left:false,right:false,th:false,br:false,hand:false};
    window.addEventListener('keydown',e=>{this.keys.add(e.code)});
    window.addEventListener('keyup',e=>{this.keys.delete(e.code)});
    window.addEventListener('gamepadconnected',e=>{this.gamepadIndex=e.gamepad.index});
    window.addEventListener('gamepaddisconnected',()=>{this.gamepadIndex=null});

    // Touch HUD wiring
    const on=(id,evt,fn)=>{const el=document.getElementById(id); if(!el) return; el.addEventListener('touchstart',e=>{e.preventDefault(); fn(true)}, {passive:false}); el.addEventListener('touchend',e=>{e.preventDefault(); fn(false)}, {passive:false}); el.addEventListener('mousedown',e=>{e.preventDefault(); fn(true)}); el.addEventListener('mouseup',e=>{e.preventDefault(); fn(false)});}
    on('tLeft',0,(v)=>{this.touch.left=v; if(navigator.vibrate&&v) navigator.vibrate(10)});
    on('tRight',0,(v)=>{this.touch.right=v; if(navigator.vibrate&&v) navigator.vibrate(10)});
    on('tThrottle',0,(v)=>{this.touch.th=v});
    on('tBrake',0,(v)=>{this.touch.br=v});
    on('tHand',0,(v)=>{this.touch.hand=v});
  }
  get steer(){
    let s=0; if(this.keys.has('ArrowLeft')||this.keys.has('KeyA')) s-=1; if(this.keys.has('ArrowRight')||this.keys.has('KeyD')) s+=1;
    if(this.touch.left) s-=1; if(this.touch.right) s+=1;
    const gp=this.readPad(); s+=gp.steer; return clamp(s,-1,1);
  }
  get throttle(){ let t=0; if(this.keys.has('ArrowUp')||this.keys.has('KeyW')) t=1; if(this.touch.th) t=1; return Math.max(t,this.readPad().th);
  }
  get brake(){ let b=0; if(this.keys.has('ArrowDown')||this.keys.has('KeyS')) b=1; if(this.touch.br) b=1; return Math.max(b,this.readPad().br);
  }
  get handbrake(){ return (this.keys.has('Space')||this.touch.hand||this.readPad().hand>0.5)?1:0 }
  get pausePressed(){ return this.keys.has('KeyP')||this.readPad().pause>0.5 }
  get musicPressed(){ return this.keys.has('KeyM')||this.readPad().music>0.5 }
  readPad(){ if(this.gamepadIndex==null) return this.padState; const gp=navigator.getGamepads()[this.gamepadIndex]; if(!gp) return this.padState; const dz=0.15;
    const ax=(v)=>Math.abs(v)<dz?0:Math.sign(v)*((Math.abs(v)-dz)/(1-dz));
    const steer=ax(gp.axes[0]||0); const th=(gp.buttons[7]?.value)||0; const br=(gp.buttons[6]?.value)||0; const hand=(gp.buttons[0]?.value)||0; const pause=(gp.buttons[9]?.value)||0; const music=(gp.buttons[2]?.value)||0;
    this.padState={steer,th,br,hand,pause,music}; return this.padState; }
}
const input=new Input();

// ===== Toast =====
const toastEl=document.getElementById('toast');
function toast(msg,ms=1200){ toastEl.textContent=msg; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'),ms); }

// ===== Track Generation & Cache =====
const TRACK_DEFS={
  A:{seed:1337,width:12,name:"Coastline Cruise",segments:[
    ['straight',380,{grade:-1}],
    ['arc',260,{R:420,dir:1,bank:6,grade:0}],
    ['arc',140,{R:260,dir:-1,bank:4}],
    ['arc',160,{R:260,dir:1,bank:4}],
    ['straight',520,{bridge:true}],
    ['arc',210,{R:320,dir:-1,bank:5,grade:1}],
    ['hairpin',120,{R:45,dir:-1,bank:10,grade:2}],
    ['straight',120,{grade:-2}],
    ['arc',340,{R:380,dir:1,bank:6,grade:-1}],
    ['chicane',175,{R1:130,dir1:1,R2:120,dir2:-1,bank:3}],
    ['straight',300,{finish:true}]
  ]},
  B:{seed:2025,width:10,name:"Neon City",segments:[
    ['straight',420,{}],
    ['arc',100,{R:95,dir:1,bank:3}],
    ['straight',120,{}],
    ['arc',100,{R:95,dir:-1,bank:3}],
    ['straight',360,{}],
    ['chicane',170,{R1:140,dir1:-1,R2:150,dir2:1,bank:4}],
    ['arc',300,{R:380,dir:1,bank:7,grade:-1,tunnel:true}],
    ['straight',280,{}],
    ['hairpin',130,{R:48,dir:1,bank:9}],
    ['arc',220,{R:260,dir:-1,bank:5}],
    ['straight',300,{finish:true}]
  ]},
  C:{seed:8088,width:9.5,name:"Alpine Sprint",segments:[
    ['straight',260,{grade:4}],
    ['arc',210,{R:300,dir:-1,bank:5,grade:3}],
    ['arc',140,{R:220,dir:1,bank:4}],
    ['arc',150,{R:220,dir:-1,bank:4}],
    ['switch',110,{R:60,dir:1,bank:8,grade:2}],
    ['straight',90,{grade:1}],
    ['switch',120,{R:58,dir:-1,bank:9,grade:1}],
    ['straight',180,{crest:true,grade:-1}],
    ['arc',420,{R:380,dir:1,bank:9,grade:-2,cliff:true}],
    ['straight',520,{grade:-5}],
    ['arc',240,{R:280,dir:-1,bank:6,grade:-2}],
    ['straight',250,{finish:true}]
  ]}
};

function bakeTrack(key){
  const cached=Storage.load("pd_track_"+key,null); if(cached&&cached.version===1) return cached;
  const def=TRACK_DEFS[key]; const rng=mulberry32(def.seed);
  // Build centerline points by chaining segments; assume 2m sampling
  const pts=[]; let x=0,y=0,hdg=0; const push=(px,py)=>pts.push(new THREE.Vector2(px,py));
  push(0,0);
  const addArc=(len,R,dir)=>{ const sign=dir>=0?1:-1; const dtheta=len/Math.abs(R); const step=2/Math.max(2,1); const n=Math.max(2,Math.floor(len/2)); for(let i=1;i<=n;i++){ const t=i/n; const d=dtheta*t*sign; const cx=x - Math.sin(hdg)*R*sign; const cy=y + Math.cos(hdg)*R*sign; const ang=hdg + d; const px=cx + Math.sin(ang)*R*sign; const py=cy - Math.cos(ang)*R*sign; if(THREE.MathUtils.euclideanModulo(i,1)===0){} push(px,py);} hdg+=dtheta*sign; x=pts[pts.length-1].x; y=pts[pts.length-1].y; };
  const addStraight=(len)=>{ const n=Math.max(2,Math.floor(len/2)); for(let i=1;i<=n;i++){ const dx=Math.cos(hdg)*(2); const dy=Math.sin(hdg)*(2); x+=dx; y+=dy; push(x,y);} };
  for(const s of def.segments){ const [type,len,opt]=s; if(type==='straight') addStraight(len); else if(type==='arc') addArc(len,opt.R,opt.dir); else if(type==='hairpin'){ addArc(len,opt.R,opt.dir);} else if(type==='chicane'){ addArc(len*0.5,opt.R1,opt.dir1); addArc(len*0.5,opt.R2,opt.dir2);} else if(type==='switch'){ addArc(len,opt.R,opt.dir);} }
  // Close loop gently near origin
  // (The last straight is finish line; we won't close mathematically to origin to avoid kinks)

  // Build tangents & curvature
  const tang=[], curv=[]; for(let i=0;i<pts.length;i++){ const a=pts[(i-1+pts.length)%pts.length], b=pts[(i+1)%pts.length]; const t=Math.atan2(b.y-a.y,b.x-a.x); tang.push(t); const ax=a, bx=pts[i], cx=b; const area=Math.abs((ax.x*(bx.y-cx.y)+bx.x*(cx.y-ax.y)+cx.x*(ax.y-bx.y))/2); const ab=ax.distanceTo(bx), bc=bx.distanceTo(cx), ca=cx.distanceTo(ax); const R=ab*bc*ca/(4*area+1e-6); curv.push(1/Math.max(R,1e6)); }
  // Build simple bank/grade arrays from defs (piecewise constants)
  const bank=new Float32Array(pts.length); const grade=new Float32Array(pts.length);
  let idx=0; for(const s of def.segments){ const [type,len,opt]=s; const n=Math.max(2,Math.floor(len/2)); for(let i=0;i<n;i++){ bank[idx%pts.length]=(opt?.bank||0); grade[idx%pts.length]=(opt?.grade||0); idx++; } }
  // Props (instanced) — scatter by seed
  const props=[]; for(let i=0;i<pts.length; i+=20){ const r=rng(); const side=r<.5?-1:1; const off=def.width*(0.7+1.2*rng()); const nx=Math.cos(tang[i]+Math.PI/2)*side; const ny=Math.sin(tang[i]+Math.PI/2)*side; props.push({x:pts[i].x+nx*off,y:pts[i].y+ny*off,type:(r<.5?'palm':'pine')}); }
  const data={version:1, key, name:def.name, width:def.width, centerline:pts.map(p=>[p.x,p.y]), tangents:tang, curvature:curv, bank:Array.from(bank), grade:Array.from(grade), props};
  Storage.save("pd_track_"+key,data); return data;
}

// ===== Car Factory (low-poly) =====
function makeCarMesh(color="#27c9ff"){ const g=new THREE.Group();
  const bodyGeo=new THREE.BoxGeometry(1.8,0.48,4); const mat=new THREE.MeshLambertMaterial({color});
  const body=new THREE.Mesh(bodyGeo,mat); body.position.y=0.36; g.add(body);
  const cab=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.44,1.6), new THREE.MeshLambertMaterial({color:0x193044,emissive:0x0,emissiveIntensity:0.2})); cab.position.set(0,0.64,-0.4); g.add(cab);
  const rim=new THREE.MeshBasicMaterial({color:0x111111});
  const wgeo=new THREE.CylinderGeometry(0.38,0.38,0.28,10); wgeo.rotateZ(Math.PI/2);
  function wheel(x,z){ const m=new THREE.Mesh(wgeo,rim); m.position.set(x,0.22,z); g.add(m); return m; }
  wheel(0.9,-1.4); wheel(-0.9,-1.4); wheel(0.9,1.4); wheel(-0.9,1.4);
  const under=new THREE.Mesh(new THREE.CircleGeometry(1.1,16), new THREE.MeshBasicMaterial({color:0x000000,opacity:0.5,transparent:true})); under.rotation.x=-Math.PI/2; under.position.y=0.01; g.add(under);
  g.castShadow=false; g.receiveShadow=false; return g; }

// ===== Renderer / World =====
class World {
  constructor(canvas){ this.canvas=canvas; this.renderer=new THREE.WebGLRenderer({canvas,antialias:false}); this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); this.renderer.setSize(window.innerWidth,window.innerHeight); this.scene=new THREE.Scene();
    this.fog=new THREE.FogExp2(0x0a1326,0.003); this.scene.fog=this.fog; this.camera=new THREE.PerspectiveCamera(70,window.innerWidth/window.innerHeight,0.1,2000); this.camera.position.set(0,3,6);
    const hemi=new THREE.HemisphereLight(0x7fb5ff,0x1a2338,0.6); this.scene.add(hemi);
    const dir=new THREE.DirectionalLight(0xffe5c1,0.8); dir.position.set(5,10,8); this.scene.add(dir);
    const sky=new THREE.Mesh(new THREE.SphereGeometry(1200,16,12), new THREE.MeshBasicMaterial({color:0x0e1b33,side:THREE.BackSide, fog:false})); this.scene.add(sky);

    this.clock=new THREE.Clock(); this.dtClamp=1/30;
    window.addEventListener('resize',()=>this.resize());
  }
  resize(){ const w=window.innerWidth,h=window.innerHeight; const pr=Math.min(window.devicePixelRatio, settings.lowFX?1.25:2); this.renderer.setPixelRatio(pr); this.renderer.setSize(w,h); this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); }
  render(){ this.renderer.render(this.scene,this.camera); }
}

// ===== Road builder =====
function buildRoad(track){ const w=track.width; const pts=track.centerline.map(([x,y])=>new THREE.Vector2(x,y));
  const verts=[], uv=[], idx=[]; const up=new THREE.Vector3(0,1,0);
  let total=0; for(let i=0;i<pts.length;i++){ const p=pts[i], n=pts[(i+1)%pts.length]; total+=p.distanceTo(n);} const scale=1/4; // compress world scale
  const positions=[]; const normals=[]; const uvs=[]; const indices=[];
  for(let i=0;i<pts.length;i++){
    const p=pts[i], prev=pts[(i-1+pts.length)%pts.length], next=pts[(i+1)%pts.length];
    const t=Math.atan2(next.y-prev.y,next.x-prev.x); const nx=Math.cos(t+Math.PI/2), ny=Math.sin(t+Math.PI/2);
    const left=new THREE.Vector3((p.x-nx*w/2)*scale,0,(p.y-ny*w/2)*scale);
    const right=new THREE.Vector3((p.x+nx*w/2)*scale,0,(p.y+ny*w/2)*scale);
    positions.push(left.x,left.y,left.z, right.x,right.y,right.z);
    normals.push(0,1,0, 0,1,0);
    const v=i/10; uvs.push(0,v, 1,v);
    if(i<pts.length-1){ const a=i*2,b=i*2+1,c=i*2+2,d=i*2+3; indices.push(a,b,c, b,d,c); }
  }
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3)); geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geo.setIndex(indices);
  const tex=new THREE.CanvasTexture(makeRoadTexture()); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(1,pts.length/10);
  const mat=new THREE.MeshLambertMaterial({map:tex, side:THREE.DoubleSide}); const mesh=new THREE.Mesh(geo,mat); mesh.receiveShadow=false; return mesh;
}
function makeRoadTexture(){ const c=document.createElement('canvas'); c.width=64; c.height=256; const ctx=c.getContext('2d'); ctx.fillStyle='#1a1f28'; ctx.fillRect(0,0,64,256); ctx.fillStyle='#2b3340'; for(let y=0;y<256;y+=16){ ctx.fillRect(0,y,64,1);} ctx.fillStyle='#b7c7ff'; ctx.fillRect(31,0,2,256); return c; }

// Simple prop meshes (instanced)
function makeInstancedProps(track){ const group=new THREE.Group(); const palmGeo=new THREE.ConeGeometry(0.6,2.2,6); const palmMat=new THREE.MeshLambertMaterial({color:0x2cc5a1});
  const trunkGeo=new THREE.CylinderGeometry(0.18,0.24,2.2,6);
  const pineGeo=new THREE.ConeGeometry(0.7,2.8,6);
  const pineMat=new THREE.MeshLambertMaterial({color:0x2aa360});
  const scale=1/4; const props=track.props||[];
  for(const p of props){ const x=p.x*scale, z=p.y*scale; const base=new THREE.Mesh(trunkGeo,new THREE.MeshLambertMaterial({color:0x5b3a22})); base.position.set(x,1.1,z); group.add(base);
    const top=new THREE.Mesh(p.type==='palm'?palmGeo:pineGeo, p.type==='palm'?palmMat:pineMat); top.position.set(x,2.4,z); group.add(top); }
  return group; }

// ===== Physics & Car Controller =====
class Car {
  constructor(world,color){ this.world=world; this.mesh=makeCarMesh(color); this.pos=new THREE.Vector3(0,0.08,0); this.vel=new THREE.Vector3(); this.yaw=0; this.steer=0; this.steerVel=0; this.speedKmh=0; this.engine=0; this.brake=0; this.hand=0; this.maxSpeed=78; this.accel=9.5; this.grip=1.0; }
  setSpec(spec){ this.maxSpeed=spec.top; this.accel=spec.acc; this.grip=spec.grip; }
  update(dt){ // steering filter
    const steerTarget=clamp(this.steer,-1,1); this.steerVel=lerp(this.steerVel,steerTarget,dt*6); const steerAngle=this.steerVel*0.65; // radians
    // simple vehicle model
    const fwd=new THREE.Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw));
    const right=new THREE.Vector3(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    const desired=this.engine*this.accel - this.brake*14 - this.hand*10; // accel m/s^2
    const vlong=fwd.dot(this.vel); let vlat=right.dot(this.vel);
    vlong += desired*dt; const speed=Math.hypot(vlong,vlat);
    // lateral grip
    const maxLat= this.grip*10; vlat=lerp(vlat,0, clamp(dt*maxLat,0,1)); vlat -= speed*steerAngle*dt*2; // yaw induces lateral
    // clamp speed
    const vmax=this.maxSpeed/3.6; const sc= speed>vmax ? (vmax/speed):1; vlong*=sc; vlat*=sc;
    this.vel.copy(fwd.multiplyScalar(vlong).add(right.multiplyScalar(vlat)));
    // integrate
    this.pos.addScaledVector(this.vel,dt);
    // yaw update by steer and speed
    this.yaw += steerAngle*clamp(vlong, -vmax, vmax)*dt*0.6;
    // sync mesh
    this.mesh.position.copy(this.pos); this.mesh.rotation.y=this.yaw;
    this.speedKmh = Math.max(0, vlong*3.6);
  }
}

// ===== AI Bot =====
class Bot extends Car{
  constructor(world,color,track,offset){ super(world,color); this.track=track; this.i=offset||0; this.aggr=0.9+Math.random()*0.14; this.brVar=0.95+Math.random()*0.1; this.jitter=(Math.random()*0.1)-0.05; }
  updateAI(dt){ // pursue next point on centerline with lookahead
    const pts=this.track.centerline3; const N=pts.length; const look= Math.floor( lerp(8,20, clamp(this.speedKmh/240,0,1)) ); this.i=(this.i+1)%N; const target=pts[(this.i+look)%N];
    const to=new THREE.Vector3().subVectors(target,this.pos); const desiredYaw=Math.atan2(to.x,to.z); let dy=desiredYaw-this.yaw; dy=Math.atan2(Math.sin(dy),Math.cos(dy)); this.steer=clamp(dy*1.8 + this.jitter, -1, 1);
    // speed target by curvature
    const k=this.track.curvArr[this.i]; const vt = clamp( Math.sqrt( (this.grip*9.0) / (k+1e-4) ), 12, this.maxSpeed/3.6 );
    const vlong=this.vel.length(); if(vlong<vt) { this.engine=this.aggr; this.brake=0; } else { this.engine=0.2; this.brake=(vlong-vt)*0.8*this.brVar; }
    this.hand=0;
  }
  update(dt){ this.updateAI(dt); super.update(dt); }
}

// ===== Game State & HUD =====
const hud={ pos:document.getElementById('hudPos'), lap:document.getElementById('hudLap'), time:document.getElementById('hudTime'), speed:document.getElementById('hudSpeed'), mini:document.getElementById('minimap') };

class Game {
  constructor(){ this.world=new World(document.getElementById('gl')); this.state='menu'; this.players=[]; this.bots=[]; this.lap=1; this.laps=3; this.pos=1; this.timer=0; this.running=false; this.trackKey='A'; this.results=null; this.qualityDrop=false;
    // UI wires
    this.wireUI(); this.applySettingsToUI();
    // Start in menu
    this.showMenu();
    // FPS fallback
    this.acc=0; this.fixed=1/60; this.lastT=performance.now(); requestAnimationFrame(this.loop.bind(this));
  }
  wireUI(){
    const $=sel=>document.querySelector(sel);
    // Menu
    $('#btnStart').onclick=()=>{ this.toCarSelect(); };
    $('#btnOptions').onclick=()=>{ document.getElementById('optionsPop').classList.add('show'); };
    $('#xOptions').onclick=()=>{ document.getElementById('optionsPop').classList.remove('show'); };
    $('#btnCredits').onclick=()=>{ document.getElementById('creditsPop').classList.add('show'); };
    $('#xCredits').onclick=()=>{ document.getElementById('creditsPop').classList.remove('show'); };
    document.querySelectorAll('.track-card').forEach(el=>{ el.onclick=()=>{ this.trackKey=el.dataset.track; last.track=this.trackKey; Storage.save('pd_last',last); toast(`Selected ${TRACK_DEFS[this.trackKey].name}`); }});

    // Options toggles
    $('#optMusic').onchange=(e)=>{ music.setEnabled(e.target.checked); $('#btnMusic').textContent= music.enabled? 'Music ON':'Music OFF'; };
    $('#optLowFX').onchange=(e)=>{ settings.lowFX=e.target.checked; Storage.save('pd_settings',settings); this.world.resize(); };

    // Car select
    $('#btnBackMenu').onclick=()=>{ this.showMenu(); };
    $('#btnRaceGo').onclick=()=>{ this.startRace(); };

    // HUD
    $('#btnPause').onclick=()=>this.pause();
    $('#btnMusic').onclick=()=>{ music.setEnabled(!music.enabled); $('#btnMusic').textContent= music.enabled? 'Music ON':'Music OFF'; toast(music.enabled? 'Music ON':'Music OFF'); };

    // Overlays
    $('#btnResume').onclick=()=>this.resume();
    $('#btnRestart').onclick=()=>this.restartRace();
    $('#btnQuit').onclick=()=>this.quitToMenu();

    // Results
    $('#btnAgain').onclick=()=>this.restartRace();
    $('#btnChangeCar').onclick=()=>{ this.toCarSelect(); };
    $('#btnMain').onclick=()=>{ this.quitToMenu(); };

    // Keyboard helpers
    window.addEventListener('keydown',(e)=>{
      if(e.code==='KeyP') this.pause();
      if(e.code==='KeyM'){ music.setEnabled(!music.enabled); $('#btnMusic').textContent= music.enabled? 'Music ON':'Music OFF'; toast(music.enabled? 'Music ON':'Music OFF'); }
      if((e.code==='KeyR') && (this.state==='paused' || this.state==='results')) this.restartRace();
    });

    // Touch HUD show for touch devices
    if('ontouchstart' in window){ document.querySelector('.touch').style.display='block'; document.body.style.cursor='none'; }
  }
  applySettingsToUI(){ document.getElementById('optMusic').checked=settings.music; document.getElementById('optLowFX').checked=settings.lowFX; document.getElementById('btnMusic').textContent= settings.music? 'Music ON':'Music OFF';
    // Best laps in menu
    document.getElementById('bestA').textContent=bests.A?formatLap(bests.A):'—';
    document.getElementById('bestB').textContent=bests.B?formatLap(bests.B):'—';
    document.getElementById('bestC').textContent=bests.C?formatLap(bests.C):'—';
  }
  showMenu(){ this.state='menu'; document.getElementById('menu').classList.add('active'); document.getElementById('carSelect').classList.remove('active'); document.getElementById('hud').classList.remove('active'); document.getElementById('pauseOverlay').classList.remove('show'); document.getElementById('resultsOverlay').classList.remove('show'); music.toMenu(); }
  toCarSelect(){ this.state='car'; document.getElementById('menu').classList.remove('active'); document.getElementById('carSelect').classList.add('active'); this.populateCars(); }
  populateCars(){ const cars=[
      {name:'Sprinter',spec:{top:72,acc:10.5,grip:1.08}},
      {name:'Vortex',spec:{top:84,acc:9.2,grip:0.94}},
      {name:'Drift RS',spec:{top:78,acc:9.8,grip:0.98}},
      {name:'GT-09',spec:{top:80,acc:10.0,grip:1.0}},
      {name:'Rallye X',spec:{top:76,acc:10.2,grip:1.12}},
    ];
    const wrap=document.getElementById('carList'); wrap.innerHTML=''; cars.forEach((c,i)=>{
      const div=document.createElement('div'); div.className='car-card'+(i===last.car?' selected':''); div.innerHTML=`<div class="car-name">${c.name}</div><div class="specs">Speed ${c.spec.top} • Acc ${c.spec.acc} • Grip ${c.spec.grip}</div>`; div.onclick=()=>{ document.querySelectorAll('.car-card').forEach(n=>n.classList.remove('selected')); div.classList.add('selected'); last.car=i; Storage.save('pd_last',last); this.selectedCar=c; }; wrap.appendChild(div); if(i===last.car) this.selectedCar=c;});
    document.querySelectorAll('.swatch').forEach(el=>{ if(el.dataset.color===last.color) el.classList.add('selected'); el.onclick=()=>{ document.querySelectorAll('.swatch').forEach(n=>n.classList.remove('selected')); el.classList.add('selected'); last.color=el.dataset.color; Storage.save('pd_last',last); }});
  }
  buildTrack(){ const data=bakeTrack(this.trackKey); // convert for world scale
    const scale=1/4; data.centerline3=data.centerline.map(([x,y])=>new THREE.Vector3(x*scale,0,y*scale)); data.curvArr=data.curvature; return data; }
  startRace(){ this.state='race'; document.getElementById('carSelect').classList.remove('active'); document.getElementById('hud').classList.add('active'); this.timer=0; this.lap=1; this.results=null; this.running=true; this.pos=1;
    // Clear scene
    this.world.scene.clear(); // rebuild lights/sky after clear
    const hemi=new THREE.HemisphereLight(0x7fb5ff,0x1a2338,0.6); this.world.scene.add(hemi);
    const dir=new THREE.DirectionalLight(0xffe5c1,0.8); dir.position.set(5,10,8); this.world.scene.add(dir);
    const sky=new THREE.Mesh(new THREE.SphereGeometry(1200,16,12), new THREE.MeshBasicMaterial({color:0x0e1b33,side:THREE.BackSide, fog:false})); this.world.scene.add(sky);

    // Track
    this.track=this.buildTrack(); const road=buildRoad(this.track); this.world.scene.add(road); this.world.scene.add(makeInstancedProps(this.track));

    // Player
    this.player=new Car(this.world,last.color); this.player.setSpec(this.selectedCar?.spec||{top:78,acc:9.5,grip:1.0});
    const startPt=this.track.centerline3[2]; const startTan=this.track.centerline3[10].clone().sub(this.track.centerline3[0]).normalize(); this.player.pos.copy(startPt.clone().add(new THREE.Vector3(0,0.08,0))); this.player.yaw=Math.atan2(startTan.x,startTan.z); this.world.scene.add(this.player.mesh);

    // Bots
    this.bots=[]; const colors=["#ffd028","#66ff8a","#c28aff","#ff3355"]; for(let i=0;i<4;i++){ const b=new Bot(this.world,colors[i%colors.length],this.track,(i*40)%this.track.centerline3.length); b.setSpec({top: this.player.maxSpeed*(0.96+0.06*Math.random()), acc: this.player.accel*(0.95+0.1*Math.random()), grip: this.player.grip*(0.96+0.08*Math.random())}); this.world.scene.add(b.mesh); this.bots.push(b); }

    // Camera setup
    this.world.camera.fov=70; this.world.camera.updateProjectionMatrix();
    // Snap camera to player immediately
    { const cam=this.world.camera;
      const target=this.player.pos.clone().add(new THREE.Vector3(-Math.sin(this.player.yaw)*6,2.8,-Math.cos(this.player.yaw)*6));
      cam.position.copy(target);
      const look=this.player.pos.clone().add(new THREE.Vector3(Math.sin(this.player.yaw)*8,1.2,Math.cos(this.player.yaw)*8));
      cam.lookAt(look);
      cam.updateProjectionMatrix(); }

    // Music
    music.toRace();

    // Minimap
    this.drawMinimap();
  }
  drawMinimap(){ const c=hud.mini, ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); const pts=this.track.centerline3; if(!pts) return; // fit to canvas
    let minx=Infinity,minz=Infinity,maxx=-Infinity,maxz=-Infinity; for(const p of pts){ if(p.x<minx)minx=p.x; if(p.z<minz)minz=p.z; if(p.x>maxx)maxx=p.x; if(p.z>maxz)maxz=p.z; }
    const sx=(c.width-20)/(maxx-minx), sz=(c.height-20)/(maxz-minz); const s=Math.min(sx,sz); const ox=10-minx*s, oz=10-minz*s;
    ctx.strokeStyle='#7fb5ff'; ctx.lineWidth=2; ctx.beginPath(); pts.forEach((p,i)=>{ const x=p.x*s+ox, y=p.z*s+oz; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.closePath(); ctx.stroke();
    this.miniMap={s,ox,oz};
  }
  updateMinimap(){ const c=hud.mini, ctx=c.getContext('2d'); ctx.save(); this.drawMinimap(); const {s,ox,oz}=this.miniMap; // player
    const px=this.player.pos.x*s+ox, py=this.player.pos.z*s+oz; ctx.fillStyle='#fffd'; ctx.beginPath(); ctx.arc(px,py,4,0,Math.PI*2); ctx.fill(); // bots
    for(const b of this.bots){ const bx=b.pos.x*s+ox, by=b.pos.z*s+oz; ctx.fillStyle='#ff3355'; ctx.beginPath(); ctx.arc(bx,by,3,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  }
  pause(){ if(this.state!=='race') return; this.state='paused'; this.running=false; document.getElementById('pauseOverlay').classList.add('show'); }
  resume(){ if(this.state!=='paused') return; this.state='race'; this.running=true; document.getElementById('pauseOverlay').classList.remove('show'); }
  finish(){ this.state='results'; this.running=false; document.getElementById('resultsOverlay').classList.add('show'); const body=document.getElementById('resultsBody'); const total=formatLap(this.timer); const lapsHTML=this.lapTimes.map((t,i)=>`Lap ${i+1}: ${formatLap(t)}${(t===Math.min(...this.lapTimes))?' <b>★</b>':''}`).join('<br>'); body.innerHTML=`<div>Total: <b>${total}</b></div><div>${lapsHTML}</div>`; // bests
    const key=this.trackKey; const best=bests[key]; const bestLap=Math.min(...this.lapTimes); if(!best || bestLap<best){ bests[key]=bestLap; Storage.save('pd_bests',bests); }
    this.applySettingsToUI();
  }
  restartRace(){ document.getElementById('pauseOverlay').classList.remove('show'); document.getElementById('resultsOverlay').classList.remove('show'); this.startRace(); }
  quitToMenu(){ document.getElementById('pauseOverlay').classList.remove('show'); document.getElementById('resultsOverlay').classList.remove('show'); this.showMenu(); }
  loop(ts){ const dt=Math.min((ts-this.lastT)/1000, this.world.dtClamp); this.lastT=ts; if(this.state==='race' && this.running){ this.acc+=dt; while(this.acc>=this.fixed){ this.tick(this.fixed); this.acc-=this.fixed; } this.world.render(); this.updateMinimap(); } else { this.world.render(); }
    requestAnimationFrame(this.loop.bind(this)); }
  tick(dt){ // input → player
    this.player.steer = input.steer; this.player.engine = input.throttle; this.player.brake = input.brake; this.player.hand = input.handbrake;
    this.player.update(dt);
    for(const b of this.bots) b.update(dt);
    this.followCam(dt);
    this.timer+=dt; hud.time.textContent = formatLap(this.timer);
    hud.speed.textContent = (""+Math.round(this.player.speedKmh)).padStart(3,'0');
  }
  followCam(dt){ const cam=this.world.camera; const target=this.player.pos.clone().add(new THREE.Vector3(-Math.sin(this.player.yaw)*6,2.8,-Math.cos(this.player.yaw)*6)); cam.position.lerp(target, dt*3); const look=this.player.pos.clone().add(new THREE.Vector3(Math.sin(this.player.yaw)*8,1.2,Math.cos(this.player.yaw)*8)); cam.lookAt(look); const baseFov=70, maxFov=80; cam.fov=lerp(cam.fov, lerp(baseFov,maxFov, clamp(this.player.speedKmh/260,0,1)), dt*2); cam.updateProjectionMatrix(); }
}

function formatLap(t){ const ms=Math.floor((t%1)*1000).toString().padStart(3,'0'); const s=Math.floor(t)%60; const m=Math.floor(t/60); return `${m}:${s.toString().padStart(2,'0')}.${ms}`; }

// ===== Boot =====
const game=new Game();

// Expose pause/music buttons in bottom mini bar already wired in Game.

// Fullscreen on first Start Race tap/click
(function setupFullscreen(){ const btn=document.getElementById('btnStart'); if(!btn) return; const goFS=()=>{ const el=document.documentElement; if(el.requestFullscreen) el.requestFullscreen().catch(()=>{}); document.removeEventListener('pointerdown',goFS); }; document.addEventListener('pointerdown',goFS); })();
