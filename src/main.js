import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050506);
scene.fog = new THREE.FogExp2(0x050506, 0.018);

const camera = new THREE.PerspectiveCamera(38, innerWidth/innerHeight, .1, 80);
camera.position.set(9.2, 6.4, 11.5);

const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.querySelector('#scene').appendChild(renderer.domElement);

const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .055;
controls.target.set(0,1.25,-.4);
controls.minDistance = 4;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI * .49;

const maxAniso = renderer.capabilities.getMaxAnisotropy();

function canvasTexture(draw,w=1024,h=1024){
  const c=document.createElement('canvas'); c.width=w;c.height=h;
  const g=c.getContext('2d'); draw(g,w,h);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=maxAniso;return t;
}
const woodTex=canvasTexture((g,w,h)=>{
  g.fillStyle='#3b2116';g.fillRect(0,0,w,h);
  for(let i=0;i<170;i++){
    const y=Math.random()*h, a=.05+Math.random()*.11;
    g.strokeStyle=`rgba(238,180,105,${a})`; g.lineWidth=.5+Math.random()*2;
    g.beginPath();g.moveTo(0,y);
    for(let x=0;x<w;x+=28) g.lineTo(x,y+Math.sin(x*.018+i)*2+Math.sin(x*.003+i)*5);
    g.stroke();
  }
  for(let x=0;x<w;x+=128){g.fillStyle='rgba(0,0,0,.18)';g.fillRect(x,0,2,h)}
},1400,800);
woodTex.wrapS=woodTex.wrapT=THREE.RepeatWrapping;woodTex.repeat.set(2.4,1.4);

const stageMat=new THREE.MeshStandardMaterial({map:woodTex,roughness:.46,metalness:.02});
const stage=new THREE.Mesh(new THREE.BoxGeometry(22,.55,15),stageMat);
stage.position.y=-.32;stage.receiveShadow=true;scene.add(stage);
const stageEdge=new THREE.Mesh(new THREE.BoxGeometry(22.15,.15,15.15),new THREE.MeshStandardMaterial({color:0x150d09,roughness:.35}));
stageEdge.position.y=-.61;stageEdge.receiveShadow=true;scene.add(stageEdge);

const blackLacquer=new THREE.MeshPhysicalMaterial({color:0x060607,metalness:.16,roughness:.055,clearcoat:1,clearcoatRoughness:.035});
const blackSatin=new THREE.MeshStandardMaterial({color:0x0d0d0e,metalness:.15,roughness:.28});
const gold=new THREE.MeshStandardMaterial({color:0xc69948,metalness:.82,roughness:.24});
const bronze=new THREE.MeshStandardMaterial({color:0x8b6333,metalness:.72,roughness:.32});
const steel=new THREE.MeshStandardMaterial({color:0xc9c9c2,metalness:.9,roughness:.21});
const felt=new THREE.MeshStandardMaterial({color:0x5a1115,roughness:.93});
const maple=new THREE.MeshStandardMaterial({color:0xa87945,roughness:.45});
const ivory=new THREE.MeshPhysicalMaterial({color:0xf1eee2,roughness:.28,clearcoat:.22,clearcoatRoughness:.18});
const ebony=new THREE.MeshPhysicalMaterial({color:0x070708,roughness:.18,clearcoat:.62,clearcoatRoughness:.08});

function box(w,h,d,mat, parent, x=0,y=0,z=0, name=''){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;
  if(name){m.userData.partName=name;m.userData.inspectable=true} parent.add(m);return m;
}
function cyl(r1,r2,h,mat,parent,x=0,y=0,z=0,rx=0,rz=0,name=''){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,20),mat);m.position.set(x,y,z);m.rotation.x=rx;m.rotation.z=rz;
  m.castShadow=m.receiveShadow=true;if(name){m.userData.partName=name;m.userData.inspectable=true}parent.add(m);return m;
}
function tag(obj,name,desc,category='Piano anatomy'){
  obj.userData.inspectable=true;obj.userData.partName=name;obj.userData.partText=desc;obj.userData.partCategory=category;
  obj.traverse(o=>{if(o.isMesh){o.userData.owner=obj}});
  return obj;
}
function grandShape(scale=1){
  const s=new THREE.Shape();
  s.moveTo(-3.6*scale,2.22*scale);s.lineTo(3.55*scale,2.22*scale);
  s.bezierCurveTo(3.62*scale,.65*scale,3.4*scale,-1.2*scale,2.52*scale,-2.95*scale);
  s.bezierCurveTo(1.58*scale,-4.48*scale,.15*scale,-4.82*scale,-1.28*scale,-4.7*scale);
  s.bezierCurveTo(-2.85*scale,-4.52*scale,-3.18*scale,-3.15*scale,-3.28*scale,-1.25*scale);
  s.lineTo(-3.6*scale,2.22*scale); return s;
}
function extrudedTop(shape, depth, mat, bevel=.06){
  const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:bevel,bevelThickness:bevel*.65,curveSegments:36});
  geo.rotateX(-Math.PI/2);geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,mat);m.castShadow=m.receiveShadow=true;return m;
}

const piano=new THREE.Group();piano.position.set(0,0,.25);scene.add(piano);

const bodyGroup=new THREE.Group();piano.add(bodyGroup);
const body=extrudedTop(grandShape(),.47,blackLacquer,.055);body.position.y=.52;bodyGroup.add(body);
tag(bodyGroup,'Lacquered rim & case','The structural case holds the soundboard under crown and resists the enormous cumulative tension of the strings.','Exterior');
const rimAccent=extrudedTop(grandShape(.97),.065,gold,.015);rimAccent.position.y=1.005;bodyGroup.add(rimAccent);
const innerBlack=extrudedTop(grandShape(.945),.08,blackSatin,.015);innerBlack.position.y=1.075;bodyGroup.add(innerBlack);

// Keyboard bed and fallboard
box(7.2,.22,1.28,blackLacquer,bodyGroup,0,.72,2.66,'Keyboard bed');
const fallboard=box(7.04,.52,.18,blackLacquer,bodyGroup,0,1.12,2.17,'Fallboard');
fallboard.rotation.x=-.05;

// Brand plaque texture — intentionally a tasteful text treatment rather than a traced logo asset.
const logoTex=canvasTexture((g,w,h)=>{
  g.clearRect(0,0,w,h);g.fillStyle='#d7b66f';g.strokeStyle='#d7b66f';g.textAlign='center';
  const cx=w/2; g.lineWidth=4;
  g.beginPath();g.moveTo(cx-31,17);g.bezierCurveTo(cx-36,42,cx-26,58,cx,68);g.bezierCurveTo(cx+26,58,cx+36,42,cx+31,17);g.stroke();
  [-16,-8,0,8,16].forEach(dx=>{g.beginPath();g.moveTo(cx+dx,23);g.lineTo(cx+dx*.42,62);g.stroke()});
  g.beginPath();g.moveTo(cx-24,69);g.lineTo(cx+24,69);g.moveTo(cx-15,75);g.lineTo(cx+15,75);g.stroke();
  g.font='600 38px Georgia';g.fillText('STEINWAY & SONS',w/2,112);
  g.font='14px Georgia';g.letterSpacing='3px';g.fillText('NEW YORK · HAMBURG',w/2,137);
},1000,150);
const logoMat=new THREE.MeshBasicMaterial({map:logoTex,transparent:true,depthWrite:false});
const logo=new THREE.Mesh(new THREE.PlaneGeometry(2.45,.36),logoMat);logo.position.set(0,1.14,2.269);logo.rotation.x=-.05;bodyGroup.add(logo);

// Soundboard
const soundboardGroup=new THREE.Group();piano.add(soundboardGroup);
const soundboardMat=new THREE.MeshStandardMaterial({color:0xb98950,roughness:.52,map:woodTex});
const soundboard=extrudedTop(grandShape(.885),.075,soundboardMat,.018);soundboard.position.set(0,1.13,-.08);soundboardGroup.add(soundboard);
tag(soundboardGroup,'Spruce soundboard','A thin wooden diaphragm converts the strings’ vibration into the broad acoustic output of the instrument.','Acoustics');
for(let i=0;i<8;i++){
  const rib=box(5.8,.055,.055,maple,soundboardGroup,0,1.245,-2.8+i*.62);
  rib.rotation.y=-.32;
}

// Cast plate / harp
const frameGroup=new THREE.Group();piano.add(frameGroup);
const plate=extrudedTop(grandShape(.82),.09,gold,.025);plate.position.set(.05,1.235,-.1);frameGroup.add(plate);
// Decorative cutouts visually suggested with dark raised wells
for(let i=0;i<5;i++){
  const well=box(.42,.08,2.15-i*.13,blackSatin,frameGroup,-1.55+i*.72,1.345,-1.1-i*.15);
  well.rotation.y=-.18+i*.045;
}
for(let i=0;i<9;i++) cyl(.055,.055,.16,bronze,frameGroup,-2.45+i*.6,1.42,1.2,0,0);
tag(frameGroup,'Cast-iron plate / harp','The plate braces the string field and transfers load into the case while keeping tuning geometry stable.','Structure');

// Strings + hitch pins
const stringsGroup=new THREE.Group();piano.add(stringsGroup);
const bassVerts=[], trebleVerts=[];
function addLine(arr,a,b){arr.push(a.x,a.y,a.z,b.x,b.y,b.z)}
for(let i=0;i<92;i++){
  const t=i/91;
  const x=-2.65+t*5.25;
  const front=new THREE.Vector3(x,1.46,1.46-(Math.abs(x)*.04));
  const backX=THREE.MathUtils.lerp(-1.5,1.55,t);
  const backZ=THREE.MathUtils.lerp(-3.9,-2.45,Math.pow(t,.75));
  const back=new THREE.Vector3(backX,1.46,backZ);
  addLine(i<24?bassVerts:trebleVerts,front,back);
  if(i%2===0)cyl(.035,.043,.11,bronze,stringsGroup,backX,1.46,backZ,0,0);
}
const bassGeo=new THREE.BufferGeometry();bassGeo.setAttribute('position',new THREE.Float32BufferAttribute(bassVerts,3));
const trebleGeo=new THREE.BufferGeometry();trebleGeo.setAttribute('position',new THREE.Float32BufferAttribute(trebleVerts,3));
const bassLines=new THREE.LineSegments(bassGeo,new THREE.LineBasicMaterial({color:0xa87332}));stringsGroup.add(bassLines);
const trebleLines=new THREE.LineSegments(trebleGeo,new THREE.LineBasicMaterial({color:0xd4d1c6}));stringsGroup.add(trebleLines);
box(5.7,.08,.12,maple,stringsGroup,0,1.40,1.55,'Bridge');
tag(stringsGroup,'String field & tuning system','Bass strings are visually differentiated from the steel treble field, running between tuning points, bridge and hitch region.','Acoustics');

// Action, dampers, hammers
const actionGroup=new THREE.Group();piano.add(actionGroup);
box(6.75,.1,.38,felt,actionGroup,0,1.32,1.73);
for(let i=0;i<52;i++){
  const x=-3.15+i*(6.3/51);
  const shank=cyl(.012,.012,.55,maple,actionGroup,x,1.54,1.55,Math.PI/2.55,0);
  const hammer=box(.075,.11,.23,new THREE.MeshStandardMaterial({color:0xd8c8a8,roughness:.88}),actionGroup,x,1.78,1.34);
  hammer.rotation.x=-.24;
}
tag(actionGroup,'Hammer action & dampers','A simplified visible action shows hammer heads, shanks and felt rail behind the keyboard. Each keystroke visually depresses its key.','Action');

// 88-key keyboard
const keyboardGroup=new THREE.Group();piano.add(keyboardGroup);
const keyMeshes=[]; const midiToKey=new Map();
const blackPC=new Set([1,3,6,8,10]);
const allMidis=Array.from({length:88},(_,i)=>21+i);
const whiteMidis=allMidis.filter(m=>!blackPC.has(m%12));
const whiteW=6.82/52;
const whiteX=new Map();let wi=0;
for(const midi of allMidis){if(!blackPC.has(midi%12)){whiteX.set(midi,-3.41+whiteW/2+wi*whiteW);wi++;}}
for(const midi of allMidis){
  const isBlack=blackPC.has(midi%12); let x;
  if(!isBlack)x=whiteX.get(midi);
  else{
    let prev=midi-1;while(!whiteX.has(prev))prev--;
    let next=midi+1;while(!whiteX.has(next))next++;
    x=(whiteX.get(prev)+whiteX.get(next))/2;
  }
  const key=new THREE.Mesh(new THREE.BoxGeometry(isBlack?whiteW*.58:whiteW*.93,isBlack?.115:.095,isBlack?.67:1.08),isBlack?ebony:ivory);
  key.position.set(x,isBlack?.94:.885,isBlack?2.62:2.83);
  key.castShadow=key.receiveShadow=true;
  key.userData={pianoKey:true,midi,isBlack,restY:key.position.y,pressed:false,partName:`${noteName(midi)} key`,partText:'Playable piano key. Click it or use the mapped computer keyboard.',partCategory:'Keyboard',inspectable:true};
  keyboardGroup.add(key);keyMeshes.push(key);midiToKey.set(midi,key);
}
tag(keyboardGroup,'88-key keyboard','Full 88-key geometry from A0 to C8. A central playable range is mapped to the computer keyboard; every visible key is mouse/touch playable.','Interface');

// Legs + casters
const legGroup=new THREE.Group();piano.add(legGroup);
const legPos=[[-2.75,.15,1.5],[2.55,.15,1.4],[-1.6,.15,-3.55]];
for(const [x,y,z] of legPos){
  cyl(.23,.31,.92,blackLacquer,legGroup,x,.43,z,0,0);
  cyl(.12,.12,.1,gold,legGroup,x,.02,z,Math.PI/2,0);
  const wheel=cyl(.13,.13,.08,blackSatin,legGroup,x,-.02,z+.08,Math.PI/2,0);
}
tag(legGroup,'Legs & brass casters','Three tapered supports carry the case above the stage; brass hardware and caster details complete the concert-grand silhouette.','Support');

// Lyre and pedals
const pedalGroup=new THREE.Group();piano.add(pedalGroup);
cyl(.055,.075,.62,blackLacquer,pedalGroup,-.28,.48,1.15,0,.12);
cyl(.055,.075,.62,blackLacquer,pedalGroup,.28,.48,1.15,0,-.12);
box(.72,.13,.16,blackLacquer,pedalGroup,0,.17,1.15);
[-.32,0,.32].forEach((x,i)=>{
  const p=box(.43,.055,.12,gold,pedalGroup,x,.14,1.46);
  p.rotation.y=i===1?0:(i===0?-.08:.08);
});
tag(pedalGroup,'Pedal lyre','Three pedals represent soft, sostenuto and sustain functions, mounted to the decorative lyre support.','Controls');

// Music rack + 3D score
const rackGroup=new THREE.Group();piano.add(rackGroup);
box(3.7,.08,.15,blackLacquer,rackGroup,0,1.65,.82);
const rackBoard=box(3.5,1.38,.065,blackLacquer,rackGroup,0,2.32,.65);
rackBoard.rotation.x=-.13;
const sheetTex=canvasTexture((g,w,h)=>{
  g.fillStyle='#efe9d8';g.fillRect(0,0,w,h);
  g.fillStyle='rgba(100,75,42,.08)';for(let i=0;i<140;i++)g.fillRect(Math.random()*w,Math.random()*h,Math.random()*2+1,Math.random()*18+4);
  g.fillStyle='#2b2722';g.textAlign='center';g.font='26px Georgia';g.fillText('FÜR ELISE',w/2,48);
  g.font='14px Georgia';g.fillText('Ludwig van Beethoven',w/2,72);
  g.textAlign='left';
  for(let stave=0;stave<4;stave++){
    const sy=118+stave*116;
    g.lineWidth=1.3;g.strokeStyle='#3c3831';
    for(let l=0;l<5;l++){g.beginPath();g.moveTo(54,sy+l*13);g.lineTo(w-54,sy+l*13);g.stroke();}
    g.font='50px Georgia';g.fillText('𝄞',60,sy+48);
    for(let n=0;n<18;n++){
      const x=128+n*43+(stave%2)*8;const y=sy+15+((n*7+stave*3)%5)*8;
      g.beginPath();g.ellipse(x,y,6.5,4.8,-.25,0,Math.PI*2);g.fill();
      g.lineWidth=1.5;g.beginPath();g.moveTo(x+6,y);g.lineTo(x+6,y-28);g.stroke();
      if(n%5===0){g.font='15px Georgia';g.fillText(n%10===0?'♭':'♯',x-18,y+4)}
    }
  }
},900,620);
const sheetMat=new THREE.MeshStandardMaterial({map:sheetTex,roughness:.82,side:THREE.DoubleSide});
const leftPage=new THREE.Mesh(new THREE.PlaneGeometry(1.62,1.13,10,10),sheetMat);
leftPage.position.set(-.83,2.38,.612);leftPage.rotation.x=-.13;leftPage.rotation.y=.025;leftPage.castShadow=true;rackGroup.add(leftPage);
const rightPage=leftPage.clone();rightPage.position.x=.83;rightPage.rotation.y=-.025;rackGroup.add(rightPage);
tag(rackGroup,'Music desk & score','A modeled music rack carries a textured two-page score for the autoplay piece, Für Elise.','Score');

// Lid and prop
const lidGroup=new THREE.Group();piano.add(lidGroup);
const lidPivot=new THREE.Group();lidGroup.add(lidPivot);lidPivot.position.set(-3.22,1.58,0);
const lid=extrudedTop(grandShape(1.01),.105,blackLacquer,.04);lid.position.set(3.22,0,0);lidPivot.add(lid);
lidPivot.rotation.z=.31;
const prop=cyl(.045,.045,3.0,blackSatin,lidGroup,1.55,2.26,-.72,0,-.48);
tag(lidGroup,'Grand-piano lid','The large lacquered lid pivots from the bass-side hinge and is held by a prop stick to project sound toward the audience.','Exterior');

// Hinge detail
for(let i=0;i<7;i++)box(.28,.055,.075,gold,bodyGroup,-3.12,1.49,1.45-i*.82);

// Overhead concert lamp
const lampGroup=new THREE.Group();scene.add(lampGroup);
cyl(2.1,2.45,.35,new THREE.MeshStandardMaterial({color:0x171719,metalness:.82,roughness:.22}),lampGroup,0,9.1,-.6);
cyl(1.92,1.92,.06,new THREE.MeshStandardMaterial({color:0xf6ddb0,emissive:0xe6b865,emissiveIntensity:3.0,roughness:.22}),lampGroup,0,8.9,-.6);
cyl(.08,.08,4.5,blackSatin,lampGroup,0,11.45,-.6);
const keyLight=new THREE.SpotLight(0xffe6bd,165,26,Math.PI*.22,.54,1.5);
keyLight.position.set(0,8.72,-.6);keyLight.target.position.set(.2,.4,-.3);keyLight.castShadow=true;
keyLight.shadow.mapSize.set(2048,2048);keyLight.shadow.bias=-.00014;keyLight.shadow.camera.near=.5;keyLight.shadow.camera.far=26;
scene.add(keyLight,keyLight.target);
const fill=new THREE.SpotLight(0xdce7ff,38,20,Math.PI*.27,.72,1.4);fill.position.set(-7,5,7);fill.target.position.set(0,1,0);scene.add(fill,fill.target);
const warmRim=new THREE.SpotLight(0xffbd76,28,18,Math.PI*.3,.8,1.6);warmRim.position.set(6,4,-7);warmRim.target.position.set(0,1,-1);scene.add(warmRim,warmRim.target);
scene.add(new THREE.HemisphereLight(0x32333c,0x140b06,1.05));

// tiny footlights for lacquer reflections
[-1,1].forEach(s=>{
  const p=new THREE.PointLight(0xf1c98d,4.5,8,2);p.position.set(s*6,.25,5.4);scene.add(p);
});

// Exploded layout
const explodeItems=[
  [lidGroup,new THREE.Vector3(-4.5,3.2,-.5),'Lid'],
  [soundboardGroup,new THREE.Vector3(-4.2,.35,-.2),'Soundboard'],
  [frameGroup,new THREE.Vector3(4.1,1.25,-.2),'Cast plate'],
  [stringsGroup,new THREE.Vector3(4.1,2.7,-.2),'Strings'],
  [actionGroup,new THREE.Vector3(-.3,1.7,3.3),'Action'],
  [keyboardGroup,new THREE.Vector3(0,.25,4.25),'Keyboard'],
  [pedalGroup,new THREE.Vector3(2.3,-.05,3.35),'Pedals'],
  [rackGroup,new THREE.Vector3(-2.4,2.3,-2.5),'Music desk'],
  [legGroup,new THREE.Vector3(-3.8,.1,2.2),'Legs']
];
explodeItems.forEach(([g,v])=>{g.userData.base=g.position.clone();g.userData.offset=v;});
let exploded=false,lidOpen=true,explodeMix=0;

const labelRoot=document.querySelector('#labels');
const labels=explodeItems.map(([group,,name])=>{
  const el=document.createElement('div');el.className='label3d';el.textContent=name;labelRoot.appendChild(el);return {group,el};
});

// Interaction / inspection
const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();
let selected=null, selectedOldEmissive=null;
const partNameEl=document.querySelector('#partName'),partTextEl=document.querySelector('#partText'),partMetaEl=document.querySelector('#partMeta');
function ownerOf(o){
  let p=o;
  while(p){if(p.userData?.pianoKey)return p;if(p.userData?.owner)return p.userData.owner;if(p.userData?.inspectable)return p;p=p.parent;}
  return null;
}
function selectPart(o){
  const target=ownerOf(o);if(!target)return;
  selected=target;
  partNameEl.textContent=target.userData.partName||'Piano component';
  partTextEl.textContent=target.userData.partText||'Individually modeled grand-piano component.';
  partMetaEl.textContent=target.userData.partCategory||'Piano anatomy';
}
function pointerNDC(e){
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
}
let down={x:0,y:0};
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY}});
renderer.domElement.addEventListener('pointerup',e=>{
  if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)return;
  pointerNDC(e);raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(piano.children,true)[0];
  if(!hit)return;
  const o=hit.object;
  if(o.userData.pianoKey){playMidi(o.userData.midi,.8);selectPart(o)}
  else selectPart(o);
});

// Audio engine
let audioCtx=null,master=null,compressor=null,delay=null,feedback=null;
const activeVoices=new Map();
function ensureAudio(){
  if(audioCtx)return;
  audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  master=audioCtx.createGain();master.gain.value=.34;
  compressor=audioCtx.createDynamicsCompressor();compressor.threshold.value=-18;compressor.knee.value=16;compressor.ratio.value=4;
  delay=audioCtx.createDelay(.8);delay.delayTime.value=.19;
  feedback=audioCtx.createGain();feedback.gain.value=.18;
  const wet=audioCtx.createGain();wet.gain.value=.16;
  delay.connect(feedback);feedback.connect(delay);delay.connect(wet);wet.connect(compressor);
  master.connect(compressor);master.connect(delay);compressor.connect(audioCtx.destination);
}
function freq(midi){return 440*Math.pow(2,(midi-69)/12)}
function noteName(m){const n=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];return n[m%12]+(Math.floor(m/12)-1)}
function keyVisual(midi,on){
  const k=midiToKey.get(midi);if(!k)return;k.userData.pressed=on;
}
function noteOn(midi,velocity=.75){
  ensureAudio();if(audioCtx.state==='suspended')audioCtx.resume();
  noteOff(midi);
  const now=audioCtx.currentTime, f=freq(midi), bus=audioCtx.createGain();
  bus.gain.setValueAtTime(.0001,now);bus.gain.exponentialRampToValueAtTime(Math.max(.025,velocity),now+.012);
  bus.gain.exponentialRampToValueAtTime(Math.max(.012,velocity*.33),now+.36);
  const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=Math.min(7600,2200+f*6);filter.Q.value=.7;
  bus.connect(filter);filter.connect(master);
  const oscs=[];
  [[1,'triangle',.34],[2,'sine',.09],[3,'sine',.035]].forEach(([mul,type,level])=>{
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=type;o.frequency.value=f*mul;o.detune.value=(Math.random()-.5)*3;g.gain.value=level;
    o.connect(g);g.connect(bus);o.start(now);oscs.push(o);
  });
  // short hammer transient
  const transient=audioCtx.createOscillator(),tg=audioCtx.createGain();transient.type='sine';transient.frequency.value=Math.min(5000,f*7);
  tg.gain.setValueAtTime(.045*velocity,now);tg.gain.exponentialRampToValueAtTime(.0001,now+.035);transient.connect(tg);tg.connect(master);transient.start(now);transient.stop(now+.04);
  activeVoices.set(midi,{oscs,bus});keyVisual(midi,true);return now;
}
function noteOff(midi,release=.8){
  const v=activeVoices.get(midi);if(!v){keyVisual(midi,false);return;}
  const now=audioCtx.currentTime;v.bus.gain.cancelScheduledValues(now);v.bus.gain.setTargetAtTime(.0001,now,release*.16);
  v.oscs.forEach(o=>o.stop(now+Math.max(.18,release)));activeVoices.delete(midi);keyVisual(midi,false);
}
function playMidi(midi,dur=.55,vel=.7){noteOn(midi,vel);setTimeout(()=>noteOff(midi,dur*.8),dur*1000);}

const keyboardMap={
  KeyA:60,KeyW:61,KeyS:62,KeyE:63,KeyD:64,KeyF:65,KeyT:66,KeyG:67,KeyY:68,KeyH:69,KeyU:70,KeyJ:71,
  KeyK:72,KeyO:73,KeyL:74,KeyP:75,Semicolon:76,Quote:77
};
const held=new Set();
addEventListener('keydown',e=>{
  if(e.repeat||!keyboardMap[e.code]||e.metaKey||e.ctrlKey)return;
  e.preventDefault();held.add(e.code);noteOn(keyboardMap[e.code],.72);
});
addEventListener('keyup',e=>{if(!keyboardMap[e.code])return;held.delete(e.code);noteOff(keyboardMap[e.code],.45)});

// Für Elise opening theme (public-domain composition), simplified.
const furElise=[
 [76,.25],[75,.25],[76,.25],[75,.25],[76,.25],[71,.25],[74,.25],[72,.25],[69,.52],
 [60,.25],[64,.25],[69,.25],[71,.52],[64,.25],[68,.25],[71,.25],[72,.52],
 [64,.25],[76,.25],[75,.25],[76,.25],[75,.25],[76,.25],[71,.25],[74,.25],[72,.25],[69,.52],
 [60,.25],[64,.25],[69,.25],[71,.52],[64,.25],[72,.25],[71,.25],[69,.64],
 [71,.25],[72,.25],[74,.25],[76,.5],[67,.25],[77,.25],[76,.25],[74,.5],[65,.25],[76,.25],[74,.25],[72,.5]
];
let autoplay=false,autoTimers=[],songStart=0,songLength=0;
const autoBtn=document.querySelector('#autoBtn'),progressEl=document.querySelector('#songProgress');
function stopAutoplay(){
  autoplay=false;autoTimers.forEach(clearTimeout);autoTimers=[];autoBtn.textContent='▶ Für Elise';
  for(const [m] of activeVoices)noteOff(m,.25);progressEl.style.width='0%';
}
function startAutoplay(){
  if(autoplay){stopAutoplay();return}ensureAudio();autoplay=true;autoBtn.textContent='■ Stop';
  const tempo=.9;let t=0;songLength=furElise.reduce((a,n)=>a+n[1]*tempo,0);songStart=performance.now();
  furElise.forEach(([m,d],idx)=>{
    autoTimers.push(setTimeout(()=>{if(!autoplay)return;playMidi(m,d*tempo*.92,.68);selectPart(midiToKey.get(m));},t*1000));
    t+=d*tempo;
  });
  autoTimers.push(setTimeout(()=>stopAutoplay(),(t+.35)*1000));
}

// UI
const normalBtn=document.querySelector('#normalBtn'),explodeBtn=document.querySelector('#explodeBtn'),lidBtn=document.querySelector('#lidBtn');
function setMode(v){
  exploded=v;normalBtn.classList.toggle('active',!v);explodeBtn.classList.toggle('active',v);
  labels.forEach(l=>l.el.classList.toggle('show',v));
  partMetaEl.textContent=v?'Exploded inspection':'Selected component';
  if(v){partNameEl.textContent='Exploded anatomy';partTextEl.textContent='Major piano systems are spatially separated while remaining individually selectable and orbitable.'}
}
normalBtn.onclick=()=>setMode(false);explodeBtn.onclick=()=>setMode(true);
autoBtn.onclick=startAutoplay;
document.querySelector('#resetBtn').onclick=()=>{camera.position.set(9.2,6.4,11.5);controls.target.set(0,1.25,-.4);controls.update()};
lidBtn.onclick=()=>{lidOpen=!lidOpen;lidBtn.textContent=lidOpen?'Close Lid':'Open Lid'};
document.querySelector('#enterBtn').onclick=()=>{
  ensureAudio();document.querySelector('#audioGate').classList.add('hidden');document.querySelector('#statusText').textContent='Audio enabled · 88 keys';
};

// Animate
const clock=new THREE.Clock(),v3=new THREE.Vector3();
function updateLabels(){
  for(const {group,el} of labels){
    group.getWorldPosition(v3);v3.y+=1.0;v3.project(camera);
    const visible=v3.z<1 && v3.z>-1;
    el.style.display=visible?'block':'none';
    el.style.left=((v3.x*.5+.5)*innerWidth)+'px';
    el.style.top=((-v3.y*.5+.5)*innerHeight)+'px';
  }
}
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.035);
  controls.update();
  explodeMix=THREE.MathUtils.damp(explodeMix,exploded?1:0,4.2,dt);
  explodeItems.forEach(([g])=>{
    const base=g.userData.base,off=g.userData.offset;
    g.position.set(base.x+off.x*explodeMix,base.y+off.y*explodeMix,base.z+off.z*explodeMix);
  });
  const targetLid=lidOpen?.31:0;
  lidPivot.rotation.z=THREE.MathUtils.damp(lidPivot.rotation.z,targetLid,5.5,dt);
  prop.scale.y=THREE.MathUtils.damp(prop.scale.y,lidOpen?1:.06,6,dt);
  prop.visible=prop.scale.y>.08;
  for(const k of keyMeshes){
    const ty=k.userData.restY+(k.userData.pressed?-.055:0);
    k.position.y=THREE.MathUtils.damp(k.position.y,ty,22,dt);
    const targetRot=k.userData.pressed?-.018:0;k.rotation.x=THREE.MathUtils.damp(k.rotation.x,targetRot,22,dt);
  }
  if(autoplay){
    const elapsed=(performance.now()-songStart)/1000;
    progressEl.style.width=(Math.min(1,elapsed/songLength)*100)+'%';
  }
  if(exploded)updateLabels();
  renderer.render(scene,camera);
}
animate();

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
});
