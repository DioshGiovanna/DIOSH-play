import * as THREE from './vendor/three.module.js';
import { illustratedMaterial, paletteMaterial } from './art-materials.js?v=6.2';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { createGame, step, attack, dodge, guard, setPaused, clearControls, upgrade, buy, equip, retry, canShop, RULES } from './combat.js?v=6.1';
import { readMovement } from './input.js?v=6';
import { WEAPONS, weaponFor } from './weapons.js?v=6';
import { CHECKPOINTS, actAt } from './journey.js?v=6';
import { SAVE_KEY, parseSave, snapshot } from './save.js?v=6';
import { STORY } from './story.js?v=6';
import { animateCharacter, bindPresentation, bindHammer, hammerContact, visualDelta, soundSpec } from './presentation.js?v=6.1';

const $ = id => document.getElementById(id);
// Only this named proposal is selectable; query values never become asset paths.
const brasaProposal=new URLSearchParams(location.search).get('visual')!=='classic';
const heroAsset=brasaProposal?'./assets/hero-brasa.glb':'./assets/hero.glb';
const heroChoice=$('heroChoice'),heroSwitch=$('heroSwitch'),heroProposal=$('heroProposal');
heroSwitch.href=brasaProposal?'?visual=classic':'./';
heroSwitch.textContent=brasaProposal?'Comparar com visual anterior':'Ver novo visual';
heroProposal.hidden=!brasaProposal;
const ui = Object.fromEntries(['world','hp','hpText','stamina','chapter','progress','distance','enemyHud','enemyName','enemyHp','enemyTell','toast','desktopHelp','auto','forge','coins','upgrade','forgeHelp','mobileControls','joystick','stick','defend','attack','dodge','overlay','overlayTitle','overlayCopy','modeChoice','instructions','modeHelp','start','restart','loadStatus','pause','sound','pc','mobile'].map(id => [id,$(id)]));
let renderer, scene, camera, heroModel, enemyModel, heroTemplate, enemyTemplate, game = createGame(), mode = matchMedia('(pointer:coarse)').matches ? 'mobile' : 'pc', loaded = false;
try{const saved=parseSave(localStorage.getItem(SAVE_KEY));if(saved)game=createGame(saved);}catch{}
const shopUI={panel:$('shop'),list:$('shopList'),balance:$('shopBalance'),close:$('closeShop'),open:$('shopButton'),hint:$('shopHint'),weapon:$('weaponName'),resume:$('resume'),pauseShop:$('pauseShop')};
let shopOrigin='live',visualWeapon='',worldSun;
let toastTime = 0, shake = 0, guardFlash = 0, parryReaction = 0, killTime = 0, soundOn = true, audio, joystickPointer = null, guardPointer = null, renderNeeded = true;
const keys = new Set(), stickMove = { x: 0, z: 0 }, particles = [], coins = [], corpses = [];
const vec = new THREE.Vector3(), targetCamera = new THREE.Vector3(), lookTarget = new THREE.Vector3();
const colors = { stone: 0x53606b, light: 0xc7b58d, dark: 0x263440, red: 0xad344c, gold: 0xe7ad55 };
const mat = (color, extra={}) => paletteMaterial(color,extra,brasaProposal);
const stoneMat = mat(colors.stone), darkMat = mat(colors.dark), paleMat = mat(colors.light), goldMat = mat(colors.gold,{metalness:.7,roughness:.3}), redMat = mat(colors.red);
const box = new THREE.BoxGeometry(1,1,1), sphere = new THREE.SphereGeometry(1,10,8);
function solid(geometry, material, x,y,z,sx=1,sy=1,sz=1, parent=scene) { const mesh = new THREE.Mesh(geometry,material); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.receiveShadow=true; mesh.castShadow=true; parent.add(mesh); return mesh; }
function toast(message, seconds=3) { ui.toast.textContent=message; toastTime=seconds; ui.toast.classList.add('visible'); }
function tone(kind, weapon='sword') {
  if (!soundOn || !audio || audio.state !== 'running') return;
  const osc=audio.createOscillator(), gain=audio.createGain(), t=audio.currentTime;
  const s=soundSpec(kind,weapon);
  osc.type=s.wave; osc.frequency.setValueAtTime(s.frequency,t); osc.frequency.exponentialRampToValueAtTime(s.frequency*s.ratio,t+s.duration);
  gain.gain.setValueAtTime(s.volume,t); gain.gain.exponentialRampToValueAtTime(.001,t+s.duration); osc.connect(gain); gain.connect(audio.destination); osc.start(t); osc.stop(t+s.duration+.02);
}
function initializeScene() {
  renderer=new THREE.WebGLRenderer({canvas:ui.world,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x182735); scene.fog=new THREE.FogExp2(0x233240,.025);
  camera=new THREE.PerspectiveCamera(49,innerWidth/innerHeight,.1,100); camera.position.set(0,5.3,-8);
  scene.add(new THREE.HemisphereLight(0xd1e6ff,0x35313c,brasaProposal?.8:2.3));
  const sun=new THREE.DirectionalLight(0xffdcab,3.4); worldSun=sun; sun.position.set(-12,18,12); sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024); Object.assign(sun.shadow.camera,{left:-15,right:15,top:24,bottom:-12,near:.1,far:70}); sun.shadow.bias=-.0005; scene.add(sun); scene.add(sun.target); sun.target.position.set(0,0,20);
  const fill=new THREE.DirectionalLight(0x87bcff,brasaProposal?.35:1.8); fill.position.set(6,4,-6); scene.add(fill);
  solid(box,mat(0x283743),0,-.4,30,65,.6,90);
  solid(box,mat(0x66717b),0,-.08,55,8,.18,120);
  for(let z=-3;z<116;z+=2.5) {
    for(let x=-2.65;x<=2.65;x+=2.65) { const tile=solid(box,(Math.round(z*2)%3?stoneMat:paleMat),x,-.005,z,2.48,.08,2.31); tile.rotation.y=Math.sin(z+x)*.017; }
    solid(box,darkMat,-4.3,.14,z,.42,.5,2.4); solid(box,darkMat,4.3,.14,z,.42,.5,2.4);
  }
  for(let i=0;i<44;i++) {
    const z=i*2.8-5, side=i%2?-1:1, x=side*(6.2+(i%3)*1.9), height=z<39?3.4+(i%4)*.75:z<75?6.3+(i%4)*.8:2.1+(i%3)*.4;
    const pillar=solid(new THREE.CylinderGeometry(.46,.65,height,6),i<10?stoneMat:darkMat,x,height/2,z); pillar.rotation.z=side*.02*(i%3);
    solid(box,paleMat,x,.25,z,1.7,.5,1.7); solid(box,paleMat,x,height,z,1.25,.35,1.25);
    if(i%3===0) { const flag=solid(box,z<39?mat(0x265bac):redMat,x+side*.68,height-1,z,.05,1.9,.65); flag.rotation.z=side*.12; }
    solid(new THREE.DodecahedronGeometry(1,0),darkMat,side*(9+i%5),.7,z+1,1.8,1.4,2.1);
  }
  for(const z of [7,22,38,54,69,79,96,112]) arch(z,z===112);
  for(let i=0;i<30;i++) { const side=i%2?1:-1,z=3+i*3.5; solid(new THREE.CylinderGeometry(.12,.18,.9,5),darkMat,side*4.3,.7,z); solid(new THREE.ConeGeometry(.23,.6,6),mat(0xffa943,{emissive:0xe96321,emissiveIntensity:1.8}),side*4.3,1.3,z); }
  for(let i=0;i<10;i++){const side=i%2?1:-1,z=4+i*3.1;solid(box,paleMat,side*11,2.4,z,6,4.8,3.1);solid(new THREE.ConeGeometry(4,1.3,4),mat(0x254c7c),side*11,5.3,z,1,1,.6);solid(box,darkMat,side*7.93,2,z,.08,1.5,.8);}
  for(const z of [44,52,60,68]){for(const s of [-1,1]){solid(box,darkMat,s*8.2,3.2,z,1,6.4,5);solid(new THREE.ConeGeometry(1.5,2,4),paleMat,s*8.2,7.2,z);}}
  for(const cp of CHECKPOINTS.slice(1)){solid(new THREE.CylinderGeometry(2.6,2.8,.2,16),paleMat,0,.08,cp.z);solid(new THREE.TorusGeometry(2.2,.05,4,24),goldMat,0,.25,cp.z).rotation.x=Math.PI/2;solid(new THREE.ConeGeometry(.6,1.7,8),mat(0xf4ae61,{emissive:0xdd752a,emissiveIntensity:1.5}),5,1,cp.z);}
  for(let z=77;z<113;z+=5){solid(box,darkMat,0,-3,z,7,.6,1);solid(box,darkMat,-3.7,.5,z,.3,1.2,4.9);solid(box,darkMat,3.7,.5,z,.3,1.2,4.9);}
  const eclipse=new THREE.Group(); eclipse.position.set(2.5,19,133); scene.add(eclipse);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(4.6,.22,8,64),mat(0xffac64,{emissive:0xff793c,emissiveIntensity:2})); eclipse.add(ring);
  const disk=new THREE.Mesh(new THREE.CircleGeometry(4.5,64),new THREE.MeshBasicMaterial({color:0x0b1726,side:THREE.DoubleSide})); disk.position.z=-.05; eclipse.add(disk);
  for(let i=0;i<20;i++) { const x=(i%2?1:-1)*(15+(i%3)*4),z=15+i*5; solid(new THREE.ConeGeometry(5+(i%4),11+i%5,5),mat(0x324452),x,z>75?-8:4,z); }
  resize();
}
function arch(z, final=false) {
  for(const side of [-1,1]) { solid(box,darkMat,side*4.8,2.7,z,1.1,5.4,1.1); solid(box,paleMat,side*4.8,5.45,z,1.5,.35,1.5); }
  solid(box,final?goldMat:paleMat,0,5.65,z,10.8,.48,1.1);
  solid(box,darkMat,0,6.03,z,11.6,.22,1.25);
  if(final) { const portal=new THREE.Mesh(new THREE.TorusGeometry(2.6,.12,6,48),mat(0xe3c07a,{emissive:0xe09839,emissiveIntensity:1.3})); portal.position.set(0,2.7,z+.2); scene.add(portal); }
}
function prepareModel(source) {
  const model=source.clone(true);
  model.traverse(node=>{
    if(node.isMesh) { node.material=brasaProposal?illustratedMaterial(node.material):node.material.clone();node.userData.ownedMaterial=true;node.castShadow=true;node.receiveShadow=true; }
  });
  bindPresentation(model);return model;
}
function mountWeapon(model,id){
  const arm=model.getObjectByName('RightArm'),original=model.getObjectByName('Sword');if(!arm||!original)return;
  if(model.userData.customWeapon){const old=model.userData.customWeapon;old.traverse(n=>{if(n.isMesh&&n.userData.uniqueGeometry)n.geometry.dispose();});arm.remove(old);}
  original.visible=id==='sword';if(id==='sword'){model.userData.customWeapon=null;return;}
  const group=new THREE.Group();group.position.copy(original.position);arm.add(group);model.userData.customWeapon=group;
  if(id==='katana'){solid(box,paleMat,0,-.65,0,.055,1.4,.08,group);solid(box,goldMat,0,.06,0,.28,.045,.18,group);solid(box,darkMat,0,.19,0,.08,.3,.09,group);}
  else{solid(box,darkMat,0,-.45,0,.09,1.1,.09,group);const head=solid(box,goldMat,0,-1,0,.65,.36,.38,group),trim=solid(box,paleMat,0,-1,0,.69,.18,.41,group);head.userData.impactHead=true;trim.userData.impactHead=true;bindHammer(model,group);}
}
function styleEnemy(model,e){
  if(e.variant==='sentinel'){model.scale.set(.83,1.08,.83);mountWeapon(model,'katana');}
  if(e.variant==='bell'){model.scale.set(1.28,.92,1.15);mountWeapon(model,'hammer');const head=model.getObjectByName('Head');if(head)solid(new THREE.ConeGeometry(.35,.45,7),goldMat,0,.22,0,1,1,1,head);}
  if(e.variant==='boss'){model.scale.setScalar(1.2);mountWeapon(model,'hammer');const halo=new THREE.Mesh(new THREE.TorusGeometry(.55,.055,5,24),goldMat);halo.position.set(0,2.0,-.15);model.add(halo);}
}
function surfaceY(actor) { return CHECKPOINTS.slice(1).some(cp=>Math.hypot(actor.x,actor.z-cp.z)<2.6)?.18:.04; }
function animateModel(model,actor,isHero,dt) {
  animateCharacter(model,actor,{isHero,dt,time:game.time,paused:game.paused,intent:isHero?movement():{x:0,z:0},auto:game.auto,hero:game.hero,enemy:game.enemy,weapon:weaponFor(game),parryReaction:isHero?parryReaction:0,groundY:surfaceY(actor)});
}
const sparkGeometry=new THREE.SphereGeometry(.045,4,3), sparkMaterial=new THREE.MeshBasicMaterial({color:0xffcf85});
const impactGeometry=new THREE.RingGeometry(.75,1,24), impacts=[];
function hammerImpact(contact){
  const mesh=new THREE.Mesh(impactGeometry,new THREE.MeshBasicMaterial({color:0xffd390,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.copy(contact);mesh.position.y+=.015;mesh.scale.setScalar(.25);scene.add(mesh);impacts.push({mesh,life:.28});
}
function burst(x,z,color,count=15,y=1.25) {
  for(let i=0;i<count;i++) { const mesh=new THREE.Mesh(sparkGeometry,sparkMaterial); mesh.material=new THREE.MeshBasicMaterial({color}); mesh.position.set(x,y,z); scene.add(mesh); particles.push({mesh,v:new THREE.Vector3((Math.random()-.5)*5,Math.random()*4+1,(Math.random()-.5)*5),life:.4+Math.random()*.35}); }
}
const coinGeometry=new THREE.CylinderGeometry(.12,.12,.045,10);
function dropCoins(x,z) {
  for(let i=0;i<7;i++) { const mesh=new THREE.Mesh(coinGeometry,goldMat); mesh.position.set(x,.5,z); scene.add(mesh); coins.push({mesh,v:new THREE.Vector3((Math.random()-.5)*3,2+Math.random()*3,(Math.random()-.5)*3),life:1.8,age:0}); }
}
function processEvents() {
  for(const event of game.events) {
    if(event.type==='encounter') {if(enemyModel)disposeModel(enemyModel);enemyModel=prepareModel(enemyTemplate);styleEnemy(enemyModel,game.enemy);scene.add(enemyModel);toast(`${event.name} · observe a preparação`,3);}
    if(event.type==='autoStop')toast('AVANÇO PAUSADO · guardião à frente. Agora escolha seu movimento.',3);
    if(event.type==='swing')tone('swing',event.weapon);
    if(event.type==='miss')tone('miss',game.hero.attackWeapon?.id);
    if(event.type==='hit') {if(event.weapon==='hammer'){const contact=hammerContact(heroModel,game.hero,surfaceY(game.hero),new THREE.Vector3());burst(contact.x,contact.z,0xffcd80,25,contact.y);hammerImpact(contact);}else burst(event.x,event.z,event.weapon==='katana'?0xa9e7ff:0xffcd80,12);shake=event.weapon==='hammer'?.18:.06;tone('hit',event.weapon);}
    if(event.type==='parry') { burst(event.x,event.z,0xb6f3ff,32); guardFlash=.65;parryReaction=.25; shake=.16; tone('parry'); toast('PARRY! · inimigo vulnerável',1.8); }
    if(event.type==='block') { burst(event.x,event.z,0xffde91,14); guardFlash=.3; tone('block'); toast('DEFESA · consome fôlego',1); }
    if(event.type==='damage') { burst(event.x,event.z,0xe86c7c,12); shake=.2; tone('damage'); }
    if(event.type==='guardBreak')toast('SEM FÔLEGO · recue para recuperar',2);
    if(event.type==='kill') { tone('kill'); burst(event.x,event.z,0xd1b577,25); dropCoins(event.x,event.z); if(enemyModel) { corpses.push({model:enemyModel,life:.75}); enemyModel=null; } killTime=2; }
    if(event.type==='cleared')toast('DUELO VENCIDO · siga até o próximo marco.',2);
    if(event.type==='checkpoint')toast(`${event.name.toUpperCase()} · ${STORY.camps[game.checkpoint.id].line.split('.')[0]}. Vida restaurada. Abra a LOJA.`,5);
    if(event.type==='gate')toast('O eclipse se abriu. Atravesse o último arco.',4);
    if(event.type==='upgrade'){tone('parry');burst(game.hero.x,game.hero.z,0xffd68e,25);toast(`${WEAPONS[event.id].name} aprimorada.`,3);renderShop();}
    if(event.type==='equipment'){visualWeapon='';renderShop();}
    if(event.type==='save')try{localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot(game)));}catch{toast('Sem espaço para salvar neste navegador.',3);}
    if(event.type==='dead')showOverlay('dead');
    if(event.type==='won') { tone('kill'); showOverlay('won'); }
  }
  game.events.length=0;
}
function updateEffects(dt) {
  for(let i=impacts.length-1;i>=0;i--){const p=impacts[i];p.life-=dt;p.mesh.scale.setScalar(.25+(1-p.life/.28)*2.35);p.mesh.material.opacity=Math.max(0,p.life/.28)*.7;if(p.life<=0){scene.remove(p.mesh);p.mesh.material.dispose();impacts.splice(i,1);}}
  for(let i=particles.length-1;i>=0;i--) { const p=particles[i]; p.life-=dt; p.v.y-=dt*7; p.mesh.position.addScaledVector(p.v,dt); p.mesh.scale.setScalar(Math.max(.05,p.life*2)); if(p.life<=0){scene.remove(p.mesh);p.mesh.material.dispose();particles.splice(i,1);} }
  for(let i=coins.length-1;i>=0;i--) { const c=coins[i]; c.life-=dt;c.age+=dt;c.mesh.rotation.x+=dt*8;c.mesh.rotation.z+=dt*4;
    if(c.age<.9){c.v.y-=dt*9;c.mesh.position.addScaledVector(c.v,dt);if(c.mesh.position.y<.15){c.mesh.position.y=.15;c.v.y=Math.abs(c.v.y)*.5;}}
    else {vec.set(game.hero.x,.9,game.hero.z);c.mesh.position.lerp(vec,Math.min(1,dt*7));}
    if(c.life<=0){scene.remove(c.mesh);coins.splice(i,1);}
  }
  for(let i=corpses.length-1;i>=0;i--) {const c=corpses[i];c.life-=dt;c.model.rotation.z+=dt*1.1;c.model.position.y-=dt*.8;if(c.life<=0){disposeModel(c.model);corpses.splice(i,1);}}
}
function disposeModel(model) { scene.remove(model); model.traverse(node=>{if(node.isMesh&&node.userData.ownedMaterial)node.material.dispose();}); }
function resize() {
  if(!renderer)return; renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<600?57:49;camera.updateProjectionMatrix();renderNeeded=true;
}
function selectMode(selected) {
  mode=selected;document.body.classList.toggle('mobile',mode==='mobile');ui.pc.setAttribute('aria-pressed',mode==='pc');ui.mobile.setAttribute('aria-pressed',mode==='mobile');
  ui.mobileControls.hidden=mode!=='mobile';ui.modeHelp.innerHTML=mode==='pc'?'WASD · mouse esquerdo ataque · direito defesa<br>Espaço esquiva · Q avanço automático':'Analógico mover · toque atacar · segure defender<br>Toque perto do golpe para parry · seta trava o avanço';
  resetInput();try{localStorage.setItem('diosh-v5-mode',mode);}catch{}
}
function resetInput() {keys.clear();stickMove.x=0;stickMove.z=0;joystickPointer=null;guardPointer=null;ui.stick.style.transform='';clearControls(game);}
function showOverlay(state='paused') {
  heroChoice.hidden=state!=='intro'&&state!=='paused';
  renderNeeded=true;
  shopUI.panel.hidden=true;
  resetInput();setPaused(game,true);ui.overlay.hidden=false;ui.modeChoice.hidden=false;ui.instructions.hidden=state!=='intro';ui.restart.hidden=state==='intro';
  ui.start.hidden=state==='dead'||state==='won';ui.start.textContent=state==='intro'?'ENTRAR NA JORNADA':'CONTINUAR';
  ui.overlayTitle.textContent=state==='dead'?'LEVANTE-SE':state==='won'?'TRAVESSIA':state==='paused'?'RESPIRA':'DIOSH';
  ui.overlayCopy.textContent=state==='dead'?STORY.retry:state==='won'?STORY.ending:state==='paused'?'A jornada está pausada. Troque os controles ou continue no seu ritmo.':STORY.intro;
  ui.loadStatus.textContent=state==='won'?`${game.kills} / 9 duelos · ${game.coins} moedas`:`V6.2 · ${game.checkpoint.name} · compras salvas neste navegador`;
  shopUI.resume.hidden=state!=='dead';shopUI.pauseShop.hidden=state!=='paused'||!canShop(game);
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
  for(const p of impacts){scene.remove(p.mesh);p.mesh.material.dispose();}impacts.length=0;
  game=createGame();try{localStorage.removeItem(SAVE_KEY);}catch{}visualWeapon='';resetInput();shake=0;guardFlash=0;parryReaction=0;killTime=0;begin();
}
function resumeCheckpoint(){if(enemyModel){disposeModel(enemyModel);enemyModel=null;}for(const c of corpses)disposeModel(c.model);corpses.length=0;parryReaction=0;retry(game);visualWeapon='';resetInput();begin();processEvents();}
function renderShop(){if(!shopUI.list)return;shopUI.balance.textContent=game.coins;$('shopStory').textContent=STORY.camps[game.checkpoint.id]?.line||'A primeira chama espera. Ganhe moedas nos duelos e volte a um abrigo para escolher.';shopUI.list.replaceChildren();
  for(const w of Object.values(WEAPONS)){const owned=game.owned.includes(w.id),improved=game.upgrades.includes(w.id),card=document.createElement('article');card.className='weaponCard';
    const title=document.createElement('h3');title.textContent=w.name;const copy=document.createElement('p');copy.textContent=w.description;const stats=document.createElement('small');stats.textContent=`Dano ${w.damage+(improved?w.bonus:0)} · alcance ${w.reach} · fôlego ${w.stamina}`;const row=document.createElement('div');row.className='weaponButtons';
    const purchase=document.createElement('button');purchase.textContent=owned?(game.equipped===w.id?'EQUIPADA ✓':'EQUIPAR GRÁTIS'):`COMPRAR · ${w.cost}`;purchase.disabled=owned?game.equipped===w.id:game.coins<w.cost;purchase.onclick=()=>{owned?equip(game,w.id):buy(game,w.id);processEvents();renderShop();};
    const improvement=document.createElement('button');improvement.textContent=improved?'MELHORADA ✓':`MELHORAR +${w.bonus} · ${w.upgradeCost}`;improvement.disabled=!owned||improved||game.coins<w.upgradeCost;improvement.onclick=()=>{upgrade(game,w.id);processEvents();renderShop();};
    row.append(purchase,improvement);card.append(title,copy,stats,row);if(!owned&&game.coins<w.cost){const lack=document.createElement('small');lack.textContent=`Faltam ${w.cost-game.coins} moedas.`;card.append(lack);}shopUI.list.append(card);
  }
}
function openShop(){if(!canShop(game)){toast(game.enemy?'LOJA NO ABRIGO · termine o duelo e siga até a chama.':'LOJA NOS ABRIGOS · procure a próxima chama.',3);return;}shopOrigin=ui.overlay.hidden?'live':'paused';resetInput();game.hero.attack=0;game.hero.dodge=0;game.hero.attackWeapon=null;setPaused(game,true);ui.overlay.hidden=true;shopUI.panel.hidden=false;renderShop();}
function closeShop(){shopUI.panel.hidden=true;resetInput();if(shopOrigin==='paused')showOverlay();else begin();}
shopUI.open.onclick=openShop;shopUI.close.onclick=closeShop;shopUI.pauseShop.onclick=openShop;shopUI.resume.onclick=resumeCheckpoint;
function movement() { return readMovement(keys, stickMove); }
function toggleAuto() {if(game.paused||game.status!=='playing')return;game.auto=!game.auto;toast(game.auto?'AVANÇO LIVRE · recue ou toque na seta para parar':'Avanço livre desligado',2);}
ui.pc.onclick=()=>selectMode('pc');ui.mobile.onclick=()=>selectMode('mobile');ui.start.onclick=begin;ui.restart.onclick=restart;
ui.pause.onclick=()=>{if(!shopUI.panel.hidden){closeShop();return;}if(loaded&&game.status==='playing'){if(game.paused)begin();else showOverlay();}};
ui.auto.onclick=toggleAuto;ui.upgrade.onclick=()=>upgrade(game);
ui.sound.onclick=()=>{soundOn=!soundOn;ui.sound.textContent=soundOn?'SOM ON':'SOM OFF';};
window.addEventListener('resize',resize);
window.addEventListener('contextmenu',event=>{if(event.target===ui.world)event.preventDefault();});
window.addEventListener('keydown',event=>{
  const key=event.key.toLowerCase();
  if(!shopUI.panel.hidden){if(key==='escape'){event.preventDefault();closeShop();}return;}
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
  ui.progress.textContent=`${game.kills} / 9`;ui.distance.style.width=`${game.hero.z/RULES.end*100}%`;
  ui.chapter.textContent=STORY.acts[actAt(game.hero.z)].title;
  ui.auto.setAttribute('aria-pressed',game.auto);ui.auto.textContent=game.auto?'↑ AVANÇO: LIGADO':'↑ AVANÇO LIVRE';
  const e=game.enemy;ui.enemyHud.hidden=!e;
  if(e){ui.enemyName.textContent=e.label;ui.enemyHp.style.width=`${Math.max(0,e.hp)/e.maxHp*100}%`;ui.enemyTell.textContent=e.phase==='windup'?(e.pattern==='pesado'?'GOLPE PESADO · prepare-se':e.pattern==='investida'?'INVESTIDA · saia da linha':'CORTE · prepare o escudo'):e.phase==='stunned'?'PARRY · ATAQUE AGORA':e.phase==='recover'?'ABERTURA · ataque':'Observe o movimento';}
  const w=weaponFor(game);shopUI.weapon.textContent=`${w.name.toUpperCase()} · ${w.damage} DANO`;shopUI.open.textContent=`LOJA · ✦ ${game.coins}`;shopUI.hint.textContent=canShop(game)?'Abrigo seguro · comprar / equipar / melhorar':e?'Loja disponível nos abrigos':`Próximo abrigo: ${game.checkpoint.id<1?'35 m':game.checkpoint.id<2?'71 m':'volte à chama'}`;
  ui.world.dataset.state=game.status;ui.world.dataset.round=game.round;ui.world.dataset.position=game.hero.z.toFixed(1);ui.world.dataset.heroX=game.hero.x.toFixed(3);ui.world.dataset.models=loaded?'glb':'loading';
}
let previous=performance.now(),frameCount=0,frameTime=0,accumulator=0;
function frame(now) {
  requestAnimationFrame(frame);const rawDt=(now-previous)/1000;previous=now;const dt=Math.min(.1,Math.max(0,rawDt));
  frameCount++;frameTime+=rawDt;if(frameTime>=2){ui.world.dataset.fps=(frameCount/frameTime).toFixed(1);ui.world.dataset.frameMs=(frameTime*1000/frameCount).toFixed(1);frameCount=0;frameTime=0;}
  if(!loaded){if(renderer){camera.lookAt(0,1,8);renderer.render(scene,camera);}return;}
  const m=movement();accumulator=game.paused?0:Math.min(.1,accumulator+dt);while(accumulator>=1/60){step(game,1/60,m);processEvents();accumulator-=1/60;}
  const visualDt=visualDelta(game.paused,dt);
  if(visualDt>0) {toastTime-=visualDt;guardFlash=Math.max(0,guardFlash-visualDt);parryReaction=Math.max(0,parryReaction-visualDt);killTime=Math.max(0,killTime-visualDt);updateEffects(visualDt);}
  if(toastTime<=0)ui.toast.classList.remove('visible');
  if(visualWeapon!==game.equipped){mountWeapon(heroModel,game.equipped);visualWeapon=game.equipped;renderNeeded=true;}
  const initialPose=!heroModel.userData.poseInitialized;
  if(visualDt>0||initialPose){
    animateModel(heroModel,game.hero,true,visualDt);if(enemyModel&&game.enemy)animateModel(enemyModel,game.enemy,false,visualDt);
    const act=actAt(game.hero.z),sky=new THREE.Color(act===0?0x56778b:act===1?0x182331:0x2a233a);scene.background.lerp(sky,initialPose?1:Math.min(1,visualDt*.7));scene.fog.color.copy(scene.background);worldSun.position.set(-12,18,game.hero.z+12);worldSun.target.position.set(0,0,game.hero.z+5);worldSun.intensity=brasaProposal?(act===0?2.2:act===1?1.5:1.9):(act===0?3.4:act===1?2.0:2.6);
    const shield=heroModel.getObjectByName('Shield');if(shield)shield.traverse(node=>{if(node.isMesh){node.material.emissive.setHex(guardFlash>0?0x4e9fbe:game.hero.parry>0?0x43757c:0);node.material.emissiveIntensity=guardFlash>0?1.5:.7;}});
    const cameraDistance=innerWidth<600?8.8:8.0;
    targetCamera.set(game.hero.x*.42,5.3,game.hero.z-cameraDistance);if(initialPose)camera.position.copy(targetCamera);else camera.position.lerp(targetCamera,Math.min(1,visualDt*5));
    lookTarget.set(game.hero.x*.35,1.1,game.hero.z+3.0);if(shake>0){lookTarget.x+=(Math.random()-.5)*shake;lookTarget.y+=(Math.random()-.5)*shake;shake=Math.max(0,shake-visualDt*.8);}camera.lookAt(lookTarget);renderNeeded=true;
  }
  updateUI();if(renderNeeded){renderer.render(scene,camera);renderNeeded=false;}
}
try {
  initializeScene();selectMode(mode);requestAnimationFrame(frame);
  const loader=new GLTFLoader();
  const [hero,enemy]=await Promise.all([loader.loadAsync(heroAsset),loader.loadAsync('./assets/enemy.glb')]);
  heroTemplate=hero.scene;enemyTemplate=enemy.scene;heroModel=prepareModel(heroTemplate);scene.add(heroModel);
  loaded=true;ui.start.disabled=false;ui.start.textContent=game.checkpoint.id?'CONTINUAR DO ABRIGO':'ENTRAR NA JORNADA';ui.overlayCopy.textContent=STORY.intro;ui.loadStatus.innerHTML='V6.2 · 9 duelos · 2 abrigos · 3 armas · <a href="./v4.html">V4</a>';ui.world.dataset.models='glb';ui.world.dataset.heroVariant=brasaProposal?'brasa':'current';ui.world.dataset.materials=brasaProposal?'toon-3-bands':'pbr';toast('O caminho está pronto.',2);
  loader.loadAsync('./assets/props-v6.glb').then(props=>{for(const [name,x,z]of [['CampBell',-5.8,35],['CampBeacon',2.3,74.5],['EclipseAltar',0,116]]){const original=props.scene.getObjectByName(name);if(original){const prop=original.clone(true);prop.position.set(x,0,z);prop.traverse(n=>{if(n.isMesh){if(brasaProposal)n.material=illustratedMaterial(n.material);n.castShadow=true;n.receiveShadow=true;}});scene.add(prop);}}renderNeeded=true;}).catch(()=>{});
} catch(error) {
  console.error('DIOSH: não foi possível carregar a cena 3D.',error);
  ui.start.disabled=true;ui.start.textContent='3D INDISPONÍVEL';ui.overlayCopy.textContent=brasaProposal?'Não foi possível carregar a proposta visual da Heroína da Brasa. Volte ao visual atual para continuar.':'Não foi possível iniciar o 3D neste navegador. Atualize a página ou experimente outro navegador.';
  ui.loadStatus.innerHTML=brasaProposal?'<a href="?visual=classic">Voltar ao visual anterior</a> · <a href="./v4.html">Jogar a versão 2.5D (V4)</a>':'<a href="./v4.html">Jogar a versão 2.5D (V4)</a>';shopUI.open.disabled=true;ui.world.dataset.models='failed';ui.toast.classList.remove('visible');
}
