import * as THREE from './vendor/three.module.js';

const axes={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};
const rotation=new THREE.Quaternion(),point=new THREE.Vector3(),matrix=new THREE.Matrix4(),yaw=new THREE.Quaternion();
const corners=box=>{const result=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])result.push(new THREE.Vector3(x,y,z));return result;};

export function pose(model,name,x=0,y=0,z=0){
  const joint=model.userData.joints[name];if(!joint)return;
  joint.node.quaternion.copy(joint.quaternion);
  if(x)joint.node.quaternion.premultiply(rotation.setFromAxisAngle(axes.x,x));
  if(y)joint.node.quaternion.premultiply(rotation.setFromAxisAngle(axes.y,y));
  if(z)joint.node.quaternion.premultiply(rotation.setFromAxisAngle(axes.z,z));
}
export function bindPresentation(model){
  model.userData.joints={};
  model.traverse(node=>{if(['Torso','Head','LeftArm','RightArm','LeftLeg','RightLeg','Sword','Shield','Cape'].includes(node.name))model.userData.joints[node.name]={node,position:node.position.clone(),quaternion:node.quaternion.clone()};});
  model.userData.feet=[];
  for(const side of ['Left','Right']){
    const joint=model.userData.joints[side+'Leg'];if(!joint)continue;
    joint.node.traverse(node=>{if(node.isMesh&&/boot/i.test(node.name)){
      node.geometry.computeBoundingBox();node.updateMatrix();
      model.userData.feet.push({joint,points:corners(node.geometry.boundingBox).map(v=>v.applyMatrix4(node.matrix))});
    }});
  }
  model.userData.poseInitialized=false;
}
export function anchorFeet(model,groundY){
  model.updateWorldMatrix(true,false);
  for(const foot of model.userData.feet||[]){
    let bottom=Infinity;
    for(const vertex of foot.points){point.copy(vertex).applyQuaternion(foot.joint.node.quaternion).add(foot.joint.node.position).applyMatrix4(model.matrixWorld);bottom=Math.min(bottom,point.y);}
    if(bottom<groundY)foot.joint.node.position.y+=(groundY-bottom)/model.scale.y;
  }
}
export function footBottom(model){
  model.updateWorldMatrix(true,false);let bottom=Infinity;
  for(const foot of model.userData.feet||[])for(const vertex of foot.points){point.copy(vertex).applyQuaternion(foot.joint.node.quaternion).add(foot.joint.node.position).applyMatrix4(model.matrixWorld);bottom=Math.min(bottom,point.y);}
  return bottom;
}
function hammerRotation(angle){return rotation.setFromAxisAngle(axes.x,angle).premultiply(yaw.setFromAxisAngle(axes.z,-.07));}
export function bindHammer(model,group){
  const points=[];
  group.updateMatrix();
  group.traverse(node=>{if(node.isMesh&&node.userData.impactHead){node.geometry.computeBoundingBox();node.updateMatrix();for(const v of corners(node.geometry.boundingBox))points.push(v.applyMatrix4(node.matrix).applyMatrix4(group.matrix));}});
  const arm=model.userData.joints.RightArm;
  const minimum=angle=>{const q=hammerRotation(angle);let min=Infinity;for(const v of points)min=Math.min(min,point.copy(v).applyQuaternion(q).y+arm.position.y);return min;};
  let low=-1.4,high=0;
  for(let i=0;i<30;i++){const mid=(low+high)/2;if(minimum(mid)>0)low=mid;else high=mid;}
  model.userData.hammer={points,angle:(low+high)/2};
}
export function hammerAngle(elapsed,weapon,impactAngle){
  const prep=weapon.windup*.6;
  if(elapsed<prep)return 2.65*Math.max(0,elapsed/prep);
  if(elapsed<weapon.windup)return 2.65+(impactAngle-2.65)*(elapsed-prep)/(weapon.windup-prep);
  return impactAngle*Math.max(0,1-(elapsed-weapon.windup)/weapon.recover);
}
// Contact is evaluated at the actual windup boundary from the same head geometry
// and angle used by animateCharacter. It does not modify gameplay or the model.
export function hammerContact(model,actor,groundY,out=new THREE.Vector3()){
  const data=model.userData.hammer;if(!data)return out.set(actor.x,groundY,actor.z);
  const q=hammerRotation(data.angle),arm=model.userData.joints.RightArm.position;
  let lowest=Infinity,count=0;out.set(0,0,0);
  for(const v of data.points){point.copy(v).applyQuaternion(q).add(arm);if(point.y<lowest-1e-6){lowest=point.y;out.copy(point);count=1;}else if(Math.abs(point.y-lowest)<1e-6){out.add(point);count++;}}
  out.multiplyScalar(1/count);
  yaw.setFromAxisAngle(axes.y,Math.atan2(actor.attackAimX||0,actor.attackAimZ??1));
  matrix.compose(point.set(actor.x,groundY,actor.z),yaw,model.scale);return out.applyMatrix4(matrix);
}
function crouch(model,amount){for(const name of ['Torso','Head','LeftArm','RightArm']){const joint=model.userData.joints[name];if(joint)joint.node.position.y-=amount;}}
export function enemyFacing(actor,hero){const locked=actor.phase==='windup'||actor.phase==='strike';return Math.atan2((locked?actor.aimX:hero.x)-actor.x,(locked?actor.aimZ:hero.z)-actor.z);}
export function animateCharacter(model,actor,c){
  if(c.paused&&model.userData.poseInitialized)return;
  for(const joint of Object.values(model.userData.joints)){joint.node.quaternion.copy(joint.quaternion);joint.node.position.copy(joint.position);}
  model.position.set(actor.x,c.groundY,actor.z);
  const walking=c.isHero?Math.hypot(c.intent.x,c.intent.z+(c.auto?1:0))>.1:actor.phase==='approach';
  const walk=walking?Math.sin(c.time*10)*.46:Math.sin(c.time*2)*.035;
  pose(model,'LeftLeg',walk);pose(model,'RightLeg',-walk);pose(model,'LeftArm',-walk*.45);pose(model,'RightArm',walk*.35);
  pose(model,'Cape',-.12+Math.sin(c.time*5)*.05,0,Math.sin(c.time*2)*.03);
  let facing=c.isHero?0:enemyFacing(actor,c.hero);
  if(c.isHero&&c.enemy&&Math.hypot(actor.x-c.enemy.x,actor.z-c.enemy.z)<6)facing=Math.atan2(c.enemy.x-actor.x,c.enemy.z-actor.z);
  if(c.isHero&&actor.attack>0)model.rotation.y=Math.atan2(actor.attackAimX,actor.attackAimZ);
  else model.rotation.y+=Math.atan2(Math.sin(facing-model.rotation.y),Math.cos(facing-model.rotation.y))*Math.min(1,c.dt*12);
  if(c.isHero){
    if((actor.guard||actor.parry>0||c.parryReaction>0)&&actor.attack<=0&&actor.dodge<=0){
      pose(model,'LeftArm',-1.18,0,.28);pose(model,'RightArm',-.35,0,-.3);pose(model,'Torso',.22);
      pose(model,'LeftLeg',-.17,0,.09);pose(model,'RightLeg',.17,0,-.09);crouch(model,.12);
      if(c.parryReaction>0){pose(model,'Torso',-.08);pose(model,'LeftArm',-1.28,0,.28);}
    }
    if(actor.attack>0){
      const w=actor.attackWeapon||c.weapon,elapsed=w.windup+w.recover-actor.attack,prep=w.windup*.6;
      const sweep=elapsed<prep?0:Math.min(1,(elapsed-prep)/(w.windup-prep)),recovery=Math.max(0,1-(elapsed-w.windup)/w.recover);
      if(w.id==='katana'){pose(model,'RightArm',elapsed<w.windup?-.4-1.15*sweep:-1.55*recovery,0,-.05);pose(model,'Torso',.08,elapsed<w.windup?-.2:.15*recovery);}
      else if(w.id==='hammer'){const angle=hammerAngle(elapsed,w,model.userData.hammer?.angle??-.8);pose(model,'RightArm',angle,0,-.07);pose(model,'LeftArm',angle*.8,0,.25);pose(model,'Torso',elapsed<w.windup?-.12:.28*recovery);}
      else{const angle=elapsed<prep?2.4*elapsed/prep:elapsed<w.windup?2.4-3.95*sweep:-1.55*recovery;pose(model,'RightArm',angle,.25,-.35);pose(model,'Torso',.1,Math.sin(elapsed*7)*-.35);pose(model,'LeftArm',-.45,0,.15);}
      if(c.parryReaction>0)pose(model,'LeftArm',-1.18,0,.28);
    }
    if(actor.dodge>0){pose(model,'Torso',.6,0,-actor.dodgeX*.35);pose(model,'Head',-.12);pose(model,'LeftArm',.3,0,.5);pose(model,'RightArm',.3,0,-.5);pose(model,'LeftLeg',-.24,0,.18);pose(model,'RightLeg',.24,0,-.18);crouch(model,.24);}
    if(actor.hurt>0){pose(model,'Torso',-.3,0,.12);model.position.x+=Math.sin(actor.hurt*45)*.06;}
  }else{
    if(actor.phase==='windup'){const t=1-actor.timer/actor.windup;pose(model,'RightArm',actor.pattern==='investida'?-.3:2.5*Math.min(1,t*2),.25,actor.pattern==='corte'?-.6:-.15);pose(model,'Torso',-.14,-.22);pose(model,'LeftArm',actor.pattern==='pesado'?2*t:-.3,0,.1);if(actor.pattern==='pesado')crouch(model,.12);}
    if(actor.phase==='strike'){const swing=Math.min(1,(.27-actor.timer)/.15);pose(model,'RightArm',actor.pattern==='investida'?-.3-1.25*swing:2.5-3.95*swing,0,actor.pattern==='corte'?-.6+.8*swing:-.15);pose(model,'Torso',.32*swing,.25*swing);crouch(model,.1*swing);}
    if(actor.phase==='recover'){pose(model,'RightArm',-.9*Math.min(1,actor.timer),0,-.1);pose(model,'Torso',.16);}
    if(actor.phase==='stunned'){pose(model,'Torso',-.42,0,.2);pose(model,'RightArm',.4,0,-.7);pose(model,'LeftArm',.2,0,.7);}
  }
  anchorFeet(model,c.groundY);model.userData.poseInitialized=true;
}
export function visualDelta(paused,dt){return paused?0:dt;}
export function soundSpec(kind,weapon='sword'){
  const frequency=kind==='parry'?900:kind==='kill'?500:kind==='block'?330:kind==='damage'?90:kind==='swing'?(weapon==='hammer'?105:weapon==='katana'?650:280):kind==='miss'?(weapon==='hammer'?65:weapon==='katana'?310:150):weapon==='hammer'?75:weapon==='katana'?430:180;
  return {frequency,ratio:kind==='swing'?1.55:kind==='miss'?.72:.4,duration:weapon==='hammer'&&['swing','hit','miss'].includes(kind)?.25:.16,wave:kind==='parry'||weapon==='katana'?'sine':'triangle',volume:kind==='swing'||kind==='miss'?.024:.045};
}
