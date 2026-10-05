import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { createGame, step, attack, dodge, guard, setPaused, clearControls, upgrade, RULES } from './combat.js';

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['world','hp','hpText','stamina','chapter','progress','distance','enemyHud','enemyName','enemyHp','enemyTell','toast','desktopHelp','auto','forge','coins','upgrade','forgeHelp','mobileControls','joystick','stick','defend','attack','dodge','overlay','overlayTitle','overlayCopy','modeChoice','instructions','modeHelp','start','restart','loadStatus','pause','sound','pc','mobile'].map(id => [id,$(id)]));
let renderer, scene, camera, heroModel, enemyModel, heroTemplate, enemyTemplate, game = createGame(), mode = matchMedia('(pointer:coarse)').matches ? 'mobile' : 'pc', loaded = false;
let toastTime = 0, shake = 0, guardFlash = 0, killTime = 0, soundOn = true, audio, joystickPointer = null, guardPointer = null;
const keys = new Set(), stickMove = { x: 0, z: 0 }, particles = [], coins = [], corpses = [];
const vec = new THREE.Vector3(), targetCamera = new THREE.Vector3(), lookTarget = new THREE.Vector3();
const axes = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) };
const colors = { stone: 0x53606b, light: 0xc7b58d, dark: 0x263440, red: 0xad344c, gold: 0xe7ad55 };
const mat = (color, extra={}) => new THREE.MeshStandardMaterial({ color, roughness:.85, metalness:.15, ...extra });
const stoneMat = mat(colors.stone), darkMat = mat(colors.dark), paleMat = mat(colors.light), goldMat = mat(colors.gold,{metalness:.7,roughness:.3}), redMat = mat(colors.red);
const box = new THREE.BoxGeometry(1,1,1), sphere = new THREE.SphereGeometry(1,10,8);
function solid(geometry, material, x,y,z,sx=1,sy=1,sz=1, parent=scene) { const mesh = new THREE.Mesh(geometry,material); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.receiveShadow=true; mesh.castShadow=true; parent.add(mesh); return mesh; }
function toast(message, seconds=3) { ui.toast.textContent=message; toastTime=seconds; ui.toast.classList.add('visible'); }
function tone(kind) {
  if (!soundOn || !audio || audio.state !== 'running') return;
  const osc=audio.createOscillator(), gain=audio.createGain(), t=audio.currentTime;
  const frequency=kind==='parry'?900:kind==='hit'?180:kind==='kill'?500:kind==='block'?330:90;
  osc.type=kind==='parry'?'sine':'triangle'; osc.frequency.setValueAtTime(frequency,t); osc.frequency.exponentialRampToValueAtTime(frequency*.4,t+.16);
  gain.gain.setValueAtTime(.045,t); gain.gain.exponentialRampToValueAtTime(.001,t+.18); osc.connect(gain); gain.connect(audio.destination); osc.start(t); osc.stop(t+.19);
}
function initializeScene() {
  renderer=new THREE.WebGLRenderer({canvas:ui.world,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x182735); scene.fog=new THREE.FogExp2(0x233240,.025);
  camera=new THREE.PerspectiveCamera(49,innerWidth/innerHeight,.1,100); camera.position.set(0,5.3,-8);
  scene.add(new THREE.HemisphereLight(0xd1e6ff,0x35313c,2.3));
  const sun=new THREE.DirectionalLight(0xffdcab,3.4); sun.position.set(-12,18,12); sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024); Object.assign(sun.shadow.camera,{left:-15,right:15,top:24,bottom:-12,near:.1,far:70}); sun.shadow.bias=-.0005; scene.add(sun); scene.add(sun.target); sun.target.position.set(0,0,20);
  const fill=new THREE.DirectionalLight(0x87bcff,1.8); fill.position.set(6,4,-6); scene.add(fill);
  solid(box,mat(0x283743),0,-.4,24,65,.6,90);
  solid(box,mat(0x66717b),0,-.08,24,8,.18,58);
  for(let z=-3;z<54;z+=2.5) {
    for(let x=-2.65;x<=2.65;x+=2.65) { const tile=solid(box,(Math.round(z*2)%3?stoneMat:paleMat),x,-.005,z,2.48,.08,2.31); tile.rotation.y=Math.sin(z+x)*.017; }
    solid(box,darkMat,-4.3,.14,z,.42,.5,2.4); solid(box,darkMat,4.3,.14,z,.42,.5,2.4);
  }
  for(let i=0;i<24;i++) {
    const z=i*2.8-5, side=i%2?-1:1, x=side*(6.2+(i%3)*1.9), height=3.4+(i%4)*.75;
    const pillar=solid(new THREE.CylinderGeometry(.46,.65,height,6),i<10?stoneMat:darkMat,x,height/2,z); pillar.rotation.z=side*.02*(i%3);
    solid(box,paleMat,x,.25,z,1.7,.5,1.7); solid(box,paleMat,x,height,z,1.25,.35,1.25);
    if(i%3===0) { const flag=solid(box,redMat,x+side*.68,height-1,z,.05,1.9,.65); flag.rotation.z=side*.12; }
    solid(new THREE.DodecahedronGeometry(1,0),darkMat,side*(9+i%5),.7,z+1,1.8,1.4,2.1);
  }
  for(const z of [7,22,37,49]) arch(z,z===49);
  for(let i=0;i<14;i++) { const side=i%2?1:-1,z=3+i*3.5; solid(new THREE.CylinderGeometry(.12,.18,.9,5),darkMat,side*4.3,.7,z); solid(new THREE.ConeGeometry(.23,.6,6),mat(0xffa943,{emissive:0xe96321,emissiveIntensity:1.8}),side*4.3,1.3,z); }
  const eclipse=new THREE.Group(); eclipse.position.set(2.5,19,65); scene.add(eclipse);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(4.6,.22,8,64),mat(0xffac64,{emissive:0xff793c,emissiveIntensity:2})); eclipse.add(ring);
  const disk=new THREE.Mesh(new THREE.CircleGeometry(4.5,64),new THREE.MeshBasicMaterial({color:0x0b1726,side:THREE.DoubleSide})); disk.position.z=-.05; eclipse.add(disk);
  for(let i=0;i<12;i++) { const x=(i%2?1:-1)*(15+(i%3)*4),z=15+i*4.6; solid(new THREE.ConeGeometry(5+(i%4),11+i%5,5),mat(0x324452),x,4,z); }
  resize();
}
function arch(z, final=false) {
  for(const side of [-1,1]) { solid(box,darkMat,side*4.8,2.7,z,1.1,5.4,1.1); solid(box,paleMat,side*4.8,5.45,z,1.5,.35,1.5); }
  solid(box,final?goldMat:paleMat,0,5.65,z,10.8,.48,1.1);
  solid(box,darkMat,0,6.03,z,11.6,.22,1.25);
  if(final) { const portal=new THREE.Mesh(new THREE.TorusGeometry(2.6,.12,6,48),mat(0xe3c07a,{emissive:0xe09839,emissiveIntensity:1.3})); portal.position.set(0,2.7,z+.2); scene.add(portal); }
}
function prepareModel(source) {
  const model=source.clone(true); model.userData.joints={};
  model.traverse(node=>{
    if(node.isMesh) { node.material=node.material.clone(); node.castShadow=true; node.receiveShadow=true; }
    if(['Torso','Head','LeftArm','RightArm','LeftLeg','RightLeg','Sword','Shield','Cape'].includes(node.name)) model.userData.joints[node.name]={node,position:node.position.clone(),quaternion:node.quaternion.clone()};
  });
  return model;
}
function pose(model, name, x=0,y=0,z=0) {
  const joint=model.userData.joints[name]; if(!joint)return;
  joint.node.quaternion.copy(joint.quaternion);
  if(x)joint.node.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axes.x,x));
  if(y)joint.node.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axes.y,y));
  if(z)joint.node.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axes.z,z));
}
function animateModel(model, actor, isHero, dt) {
  for(const joint of Object.values(model.userData.joints)) { joint.node.quaternion.copy(joint.quaternion); joint.node.position.copy(joint.position); }
  model.position.set(actor.x,0,actor.z);
  const walking=isHero?Math.hypot(stickMove.x+(keys.has('d')?1:0)-(keys.has('a')?1:0),stickMove.z+(keys.has('w')||game.auto?1:0)-(keys.has('s')?1:0))>.1&&!game.paused:actor.phase==='approach';
  const walk=walking?Math.sin(game.time*10)*.46:Math.sin(game.time*2)*.035;
  pose(model,'LeftLeg',walk); pose(model,'RightLeg',-walk); pose(model,'LeftArm',-walk*.45); pose(model,'RightArm',walk*.35);
  pose(model,'Cape',-.12+Math.sin(game.time*5)*.05,0,Math.sin(game.time*2)*.03);
  let facing=0;
  if(isHero&&game.enemy&&Math.hypot(actor.x-game.enemy.x,actor.z-game.enemy.z)<6) facing=Math.atan2(game.enemy.x-actor.x,game.enemy.z-actor.z);
  if(!isHero) facing=Math.atan2(game.hero.x-actor.x,game.hero.z-actor.z);
  model.rotation.y+=Math.atan2(Math.sin(facing-model.rotation.y),Math.cos(facing-model.rotation.y))*Math.min(1,dt*12);
  if(isHero) {
    if(actor.guard || actor.parry > 0) { pose(model,'LeftArm',-1.0,0,.28); pose(model,'RightArm',-.35,0,-.3); pose(model,'Torso',.18); pose(model,'LeftLeg',-.17); pose(model,'RightLeg',.17); model.position.y=-.12; }
    if(actor.attack>0) {
      const elapsed=RULES.attackWindup+RULES.attackRecover-actor.attack;
      const angle=elapsed<.11?2.4*elapsed/.11:elapsed<RULES.attackWindup?2.4-3.95*(elapsed-.11)/(RULES.attackWindup-.11):-1.55*Math.max(0,1-(elapsed-RULES.attackWindup)/RULES.attackRecover);
      pose(model,'RightArm',angle,.2,-.25); pose(model,'Torso',.1,Math.sin(elapsed*7)*-.35); pose(model,'LeftArm',-.45,0,.15);
    }
    if(actor.dodge>0) { pose(model,'Torso',.6,0,-actor.dodgeX*.35); pose(model,'LeftArm',.3,0,.5); pose(model,'RightArm',.3,0,-.5); model.position.y=-.25; }
    if(actor.hurt>0) { pose(model,'Torso',-.3,0,.12); model.position.x+=Math.sin(actor.hurt*45)*.06; }
  } else {
    if(actor.phase==='windup') { const t=1-actor.timer/actor.windup; pose(model,'RightArm',2.5*Math.min(1,t*2),.25,-.25); pose(model,'Torso',-.14,-.22); pose(model,'LeftArm',-.3,0,.1); if(actor.pattern==='pesado')model.position.y=-.12; }
    if(actor.phase==='strike') { const swing=Math.min(1,(.27-actor.timer)/.15); pose(model,'RightArm',2.5-3.95*swing,0,-.2); pose(model,'Torso',.32*swing,.25*swing); model.position.y=-.1*swing; }
    if(actor.phase==='recover') { pose(model,'RightArm',-.9*Math.min(1,actor.timer),0,-.1); pose(model,'Torso',.16); }
    if(actor.phase==='stunned') { pose(model,'Torso',-.42,0,.2); pose(model,'RightArm',.4,0,-.7); pose(model,'LeftArm',.2,0,.7); }
  }
}
const sparkGeometry=new THREE.SphereGeometry(.045,4,3), sparkMaterial=new THREE.MeshBasicMaterial({color:0xffcf85});
function burst(x,z,color,count=15,y=1.25) {
  for(let i=0;i<count;i++) { const mesh=new THREE.Mesh(sparkGeometry,sparkMaterial); mesh.material=new THREE.MeshBasicMaterial({color}); mesh.position.set(x,y,z); scene.add(mesh); particles.push({mesh,v:new THREE.Vector3((Math.random()-.5)*5,Math.random()*4+1,(Math.random()-.5)*5),life:.4+Math.random()*.35}); }
}
const coinGeometry=new THREE.CylinderGeometry(.12,.12,.045,10);
function dropCoins(x,z) {
  for(let i=0;i<7;i++) { const mesh=new THREE.Mesh(coinGeometry,goldMat); mesh.position.set(x,.5,z); scene.add(mesh); coins.push({mesh,v:new THREE.Vector3((Math.random()-.5)*3,2+Math.random()*3,(Math.random()-.5)*3),life:1.8,age:0}); }
}
function processEvents() {
  for(const event of game.events) {
    if(event.type==='encounter') { if(enemyModel)scene.remove(enemyModel); enemyModel=prepareModel(enemyTemplate); if(game.round===2)enemyModel.scale.setScalar(1.13); scene.add(enemyModel); toast(`${event.name} · observe a preparação`,3); }
    if(event.type==='autoStop')toast('AVANÇO PAUSADO · guardião à frente. Agora escolha seu movimento.',3);
    if(event.type==='hit') { burst(event.x,event.z,0xffcd80,12); shake=.06; tone('hit'); }
    if(event.type==='parry') { burst(event.x,event.z,0xb6f3ff,32); guardFlash=.65; shake=.16; tone('parry'); toast('PARRY! · inimigo vulnerável',1.8); }
    if(event.type==='block') { burst(event.x,event.z,0xffde91,14); guardFlash=.3; tone('block'); toast('DEFESA · consome fôlego',1); }
    if(event.type==='damage') { burst(event.x,event.z,0xe86c7c,12); shake=.2; tone('damage'); }
    if(event.type==='guardBreak')toast('SEM FÔLEGO · recue para recuperar',2);
    if(event.type==='kill') { tone('kill'); burst(event.x,event.z,0xd1b577,25); dropCoins(event.x,event.z); if(enemyModel) { corpses.push({model:enemyModel,life:.75}); enemyModel=null; } killTime=2; }
    if(event.type==='rest')toast('DUELO vencido · +25 moedas · vida restaurada. Tempere a lâmina!',4);
    if(event.type==='gate')toast('O eclipse se abriu. Atravesse o último arco.',4);
    if(event.type==='upgrade') { tone('parry'); burst(game.hero.x,game.hero.z,0xffd68e,25); toast('LÂMINA TEMPERADA · dano 32 → 40',3); }
    if(event.type==='dead')showOverlay('dead');
    if(event.type==='won') { tone('kill'); showOverlay('won'); }
  }
  game.events.length=0;
}
function updateEffects(dt) {
  for(let i=particles.length-1;i>=0;i--) { const p=particles[i]; p.life-=dt; p.v.y-=dt*7; p.mesh.position.addScaledVector(p.v,dt); p.mesh.scale.setScalar(Math.max(.05,p.life*2)); if(p.life<=0){scene.remove(p.mesh);p.mesh.material.dispose();particles.splice(i,1);} }
  for(let i=coins.length-1;i>=0;i--) { const c=coins[i]; c.life-=dt;c.age+=dt;c.mesh.rotation.x+=dt*8;c.mesh.rotation.z+=dt*4;
    if(c.age<.9){c.v.y-=dt*9;c.mesh.position.addScaledVector(c.v,dt);if(c.mesh.position.y<.15){c.mesh.position.y=.15;c.v.y=Math.abs(c.v.y)*.5;}}
    else {vec.set(game.hero.x,.9,game.hero.z);c.mesh.position.lerp(vec,Math.min(1,dt*7));}
    if(c.life<=0){scene.remove(c.mesh);coins.splice(i,1);}
  }
  for(let i=corpses.length-1;i>=0;i--) {const c=corpses[i];c.life-=dt;c.model.rotation.z+=dt*1.1;c.model.position.y-=dt*.8;if(c.life<=0){disposeModel(c.model);corpses.splice(i,1);}}
}
function disposeModel(model) { scene.remove(model); model.traverse(node=>{if(node.isMesh)node.material.dispose();}); }
function resize() {
  if(!renderer)return; renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<600?57:49;camera.updateProjectionMatrix();
}
function selectMode(selected) {
  mode=selected;document.body.classList.toggle('mobile',mode==='mobile');ui.pc.setAttribute('aria-pressed',mode==='pc');ui.mobile.setAttribute('aria-pressed',mode==='mobile');
  ui.mobileControls.hidden=mode!=='mobile';ui.modeHelp.innerHTML=mode==='pc'?'WASD · mouse esquerdo ataque · direito defesa<br>Espaço esquiva · Q avanço automático':'Analógico mover · toque atacar · segure defender<br>Toque perto do golpe para parry · seta trava o avanço';
  resetInput();try{localStorage.setItem('diosh-v5-mode',mode);}catch{}
}
function resetInput() {keys.clear();stickMove.x=0;stickMove.z=0;joystickPointer=null;guardPointer=null;ui.stick.style.transform='';clearControls(game);}
function showOverlay(state='paused') {
  resetInput();setPaused(game,true);ui.overlay.hidden=false;ui.modeChoice.hidden=false;ui.instructions.hidden=state!=='intro';ui.restart.hidden=state==='intro';
  ui.start.hidden=state==='dead'||state==='won';ui.start.textContent=state==='intro'?'ENTRAR NA JORNADA':'CONTINUAR';
  ui.overlayTitle.textContent=state==='dead'?'LEVANTE-SE':state==='won'?'TRAVESSIA':state==='paused'?'RESPIRA':'DIOSH';
  ui.overlayCopy.innerHTML=state==='dead'?'O caminho ainda espera por você.<br>Uma nova tentativa começa do início.':state==='won'?'Os três guardiões ficaram para trás.<br>Você atravessou o Caminho do Eclipse.':state==='paused'?'A jornada está pausada.<br>Troque os controles ou continue no seu ritmo.':'Sob um sol partido, três guardiões esperam.<br>Uma lâmina. Um escudo. O seu ritmo.';
  ui.loadStatus.textContent=state==='won'?`${game.kills} / 3 duelos · ${game.coins} moedas nesta partida`:'Protótipo V5 · progresso desta partida · V4 preservada';
}
function begin() {
  if(!loaded)return;
  if(!audio)try{audio=new (window.AudioContext||window.webkitAudioContext)();}catch{}
  if(audio?.state==='suspended')audio.resume().catch(()=>{});
  ui.overlay.hidden=true;setPaused(game,false);toast(game.hero.z===0?'Avance até o primeiro guardião. A calma vence a pressa.':'Continue. O avanço automático está desligado.',3);ui.world.focus();
}
function restart() {
  if(enemyModel){disposeModel(enemyModel);enemyModel=null;}
  for(const c of corpses)disposeModel(c.model);corpses.length=0;
  for(const p of particles){scene.remove(p.mesh);p.mesh.material.dispose();}particles.length=0;
  for(const c of coins)scene.remove(c.mesh);coins.length=0;
  game=createGame();resetInput();shake=0;guardFlash=0;killTime=0;begin();
}
function movement() {return {x:stickMove.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),z:stickMove.z+(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0)};}
function toggleAuto() {if(game.paused||game.status!=='playing')return;game.auto=!game.auto;toast(game.auto?'AVANÇO LIVRE · recue ou toque na seta para parar':'Avanço livre desligado',2);}
ui.pc.onclick=()=>selectMode('pc');ui.mobile.onclick=()=>selectMode('mobile');ui.start.onclick=begin;ui.restart.onclick=restart;
ui.pause.onclick=()=>{if(loaded&&game.status==='playing'){if(game.paused)begin();else showOverlay();}};
ui.auto.onclick=toggleAuto;ui.upgrade.onclick=()=>upgrade(game);
ui.sound.onclick=()=>{soundOn=!soundOn;ui.sound.textContent=soundOn?'SOM ON':'SOM OFF';};
window.addEventListener('resize',resize);
window.addEventListener('contextmenu',event=>{if(event.target===ui.world)event.preventDefault();});
window.addEventListener('keydown',event=>{
  const key=event.key.toLowerCase();
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))event.preventDefault();
  if(key==='escape'&&!event.repeat&&loaded&&game.status==='playing'){if(game.paused)begin();else showOverlay();return;}
  if(game.paused||mode!=='pc')return;
  keys.add(key);
  if(!event.repeat){if(key==='q')toggleAuto();if(key===' ')dodge(game,...Object.values(movement()));if(key==='j')attack(game);if(key==='k')guard(game,true);}
});
window.addEventListener('keyup',event=>{const key=event.key.toLowerCase();keys.delete(key);if(key==='k')guard(game,false);});
ui.world.addEventListener('pointerdown',event=>{
  if(game.paused||mode!=='pc')return;
  if(event.button===0)attack(game);
  if(event.button===2){guardPointer=event.pointerId;guard(game,true);ui.world.setPointerCapture(event.pointerId);}
});
window.addEventListener('pointerup',event=>{if(event.pointerId===guardPointer){guardPointer=null;guard(game,false);}});
window.addEventListener('pointercancel',event=>{if(event.pointerId===guardPointer){guardPointer=null;guard(game,false);}});
ui.world.addEventListener('lostpointercapture',event=>{if(event.pointerId===guardPointer){guardPointer=null;guard(game,false);}});
function actionButton(button, action, release) {
  button.addEventListener('pointerdown',event=>{event.preventDefault();if(game.paused)return;button.setPointerCapture(event.pointerId);action(event);});
  if(release)for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,event=>release(event));
}
actionButton(ui.attack,()=>attack(game));actionButton(ui.dodge,()=>{const m=movement();dodge(game,m.x,m.z);});
actionButton(ui.defend,event=>{if(guardPointer===null){guardPointer=event.pointerId;guard(game,true);}},event=>{if(event.pointerId===guardPointer){guardPointer=null;guard(game,false);}});
function setStick(event) {
  const rect=ui.joystick.getBoundingClientRect(),radius=rect.width*.31,dx=event.clientX-rect.left-rect.width/2,dy=event.clientY-rect.top-rect.height/2,n=Math.max(1,Math.hypot(dx,dy)/radius);
  const sx=dx/n,sy=dy/n;stickMove.x=sx/radius;stickMove.z=-sy/radius;if(Math.hypot(stickMove.x,stickMove.z)<.13){stickMove.x=0;stickMove.z=0;}ui.stick.style.transform=`translate(${sx}px,${sy}px)`;
}
ui.joystick.addEventListener('pointerdown',event=>{if(game.paused||joystickPointer!==null)return;event.preventDefault();joystickPointer=event.pointerId;ui.joystick.setPointerCapture(event.pointerId);setStick(event);});
ui.joystick.addEventListener('pointermove',event=>{if(event.pointerId===joystickPointer)setStick(event);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])ui.joystick.addEventListener(type,event=>{if(event.pointerId===joystickPointer){joystickPointer=null;stickMove.x=0;stickMove.z=0;ui.stick.style.transform='';}});
window.addEventListener('blur',()=>{if(loaded&&!game.paused&&game.status==='playing')showOverlay();else resetInput();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&loaded&&!game.paused&&game.status==='playing')showOverlay();});
ui.world.addEventListener('webglcontextlost',event=>{event.preventDefault();showOverlay();ui.start.disabled=true;ui.overlayCopy.textContent='O navegador interrompeu o 3D. Recarregue a página para continuar.';});
function updateUI() {
  ui.hp.style.width=`${Math.max(0,game.hero.hp)/130*100}%`;ui.hpText.textContent=Math.max(0,Math.ceil(game.hero.hp));ui.stamina.style.width=`${game.hero.stamina}%`;
  ui.progress.textContent=`${game.kills} / 3`;ui.distance.style.width=`${game.hero.z/RULES.end*100}%`;
  ui.chapter.textContent=game.hero.z<17?'I · PEDRA E CINZAS':game.hero.z<33?'II · A ABADIA VAZIA':'III · SOB O ECLIPSE';
  ui.auto.setAttribute('aria-pressed',game.auto);ui.auto.textContent=game.auto?'↑ AVANÇO: LIGADO':'↑ AVANÇO LIVRE';
  const e=game.enemy;ui.enemyHud.hidden=!e;
  if(e){ui.enemyName.textContent=e.label;ui.enemyHp.style.width=`${Math.max(0,e.hp)/e.maxHp*100}%`;ui.enemyTell.textContent=e.phase==='windup'?(e.pattern==='pesado'?'GOLPE PESADO · prepare-se':e.pattern==='investida'?'INVESTIDA · saia da linha':'CORTE · prepare o escudo'):e.phase==='stunned'?'PARRY · ATAQUE AGORA':e.phase==='recover'?'ABERTURA · ataque':'Observe o movimento';}
  ui.forge.hidden=game.kills<1||!!e||game.status!=='playing';ui.coins.textContent=game.coins;ui.upgrade.disabled=game.upgraded||game.coins<25;
  ui.upgrade.textContent=game.upgraded?'LÂMINA TEMPERADA ✓':'TEMPERAR LÂMINA · 25';ui.forgeHelp.textContent=game.upgraded?'Dano 40 · aprimoramento único equipado.':'Entre duelos: +8 de dano, uma vez.';
  ui.world.dataset.state=game.status;ui.world.dataset.round=game.round;ui.world.dataset.position=game.hero.z.toFixed(1);ui.world.dataset.models=loaded?'glb':'loading';
}
let previous=performance.now(),frameCount=0,frameTime=0,accumulator=0;
function frame(now) {
  requestAnimationFrame(frame);const rawDt=(now-previous)/1000;previous=now;const dt=Math.min(.1,Math.max(0,rawDt));
  frameCount++;frameTime+=rawDt;if(frameTime>=2){ui.world.dataset.fps=(frameCount/frameTime).toFixed(1);ui.world.dataset.frameMs=(frameTime*1000/frameCount).toFixed(1);frameCount=0;frameTime=0;}
  if(!loaded){if(renderer){camera.lookAt(0,1,8);renderer.render(scene,camera);}return;}
  const m=movement();accumulator=game.paused?0:Math.min(.1,accumulator+dt);while(accumulator>=1/60){step(game,1/60,m);processEvents();accumulator-=1/60;}
  if(!game.paused) {toastTime-=dt;guardFlash=Math.max(0,guardFlash-dt);killTime=Math.max(0,killTime-dt);updateEffects(dt);}
  if(toastTime<=0)ui.toast.classList.remove('visible');
  animateModel(heroModel,game.hero,true,dt);if(enemyModel&&game.enemy)animateModel(enemyModel,game.enemy,false,dt);
  const shield=heroModel.getObjectByName('Shield');if(shield)shield.traverse(node=>{if(node.isMesh){node.material.emissive.setHex(guardFlash>0?0x4e9fbe:game.hero.parry>0?0x43757c:0);node.material.emissiveIntensity=guardFlash>0?1.5:.7;}});
  const cameraDistance=innerWidth<600?8.8:8.0;
  targetCamera.set(game.hero.x*.42,5.3,game.hero.z-cameraDistance);camera.position.lerp(targetCamera,Math.min(1,dt*5));
  lookTarget.set(game.hero.x*.35,1.1,game.hero.z+3.0);if(shake>0){lookTarget.x+=(Math.random()-.5)*shake;lookTarget.y+=(Math.random()-.5)*shake;shake=Math.max(0,shake-dt*.8);}camera.lookAt(lookTarget);
  updateUI();renderer.render(scene,camera);
}
try {
  initializeScene();selectMode(mode);requestAnimationFrame(frame);
  const loader=new GLTFLoader();
  const [hero,enemy]=await Promise.all([loader.loadAsync('./assets/hero.glb'),loader.loadAsync('./assets/enemy.glb')]);
  heroTemplate=hero.scene;enemyTemplate=enemy.scene;heroModel=prepareModel(heroTemplate);scene.add(heroModel);
  loaded=true;ui.start.disabled=false;ui.start.textContent='ENTRAR NA JORNADA';ui.loadStatus.innerHTML='3D carregado · <a href="./v4.html">Jogar a versão anterior (V4)</a>';ui.world.dataset.models='glb';toast('O caminho está pronto.',2);
} catch(error) {
  console.error('DIOSH: não foi possível carregar a cena 3D.',error);
  ui.start.disabled=true;ui.start.textContent='3D INDISPONÍVEL';ui.overlayCopy.textContent='Não foi possível iniciar o 3D neste navegador. Atualize a página ou experimente outro navegador.';
  ui.loadStatus.innerHTML='<a href="./v4.html">Jogar a versão 2.5D (V4)</a>';ui.toast.classList.remove('visible');
}
