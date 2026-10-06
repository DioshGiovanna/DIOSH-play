import * as THREE from './vendor/three.module.js';

// Shared three-band lookup: no downloaded textures or full-screen postprocessing.
export const toonGradient=new THREE.DataTexture(new Uint8Array([70,155,255]),3,1,THREE.RedFormat);
toonGradient.minFilter=toonGradient.magFilter=THREE.NearestFilter;
toonGradient.generateMipmaps=false;toonGradient.needsUpdate=true;

export function illustratedMaterial(source){
  const m=new THREE.MeshToonMaterial({
    color:source.color?.clone()??new THREE.Color(0xffffff),map:source.map??null,
    gradientMap:toonGradient,emissive:source.emissive?.clone()??new THREE.Color(0),
    emissiveIntensity:source.emissiveIntensity??1,side:source.side??THREE.FrontSide,
    transparent:source.transparent??false,opacity:source.opacity??1,
    alphaTest:source.alphaTest??0,depthWrite:source.depthWrite??true,
    normalMap:source.normalMap??null,vertexColors:source.vertexColors??false
  });
  m.name=source.name;m.userData.dioshIllustrated=true;return m;
}
export function paletteMaterial(color,extra={},illustrated=true){
  if(!illustrated)return new THREE.MeshStandardMaterial({color,roughness:.85,metalness:.15,...extra});
  const {metalness,roughness,...supported}=extra;
  return new THREE.MeshToonMaterial({color,gradientMap:toonGradient,...supported});
}
