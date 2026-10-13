// Bonzai prototype: renders the rules in sim.js with three.js and runs the card interface.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG, CARDS, DIRS, STYLES, newGame, replay, play, playable, targets, chooseMove, lit, income, upkeep,
  hourOf, dayOf, isDay, sunAz, stratumOf, tipById, blocked, peakM, mulberry32, hashInt } from './sim.js';

const $ = id => document.getElementById(id);
const TAU = Math.PI*2, C = CFG.CELL;
const V = (x,y,z) => new THREE.Vector3(x,y,z);
const lerp = (a,b,t) => a+(b-a)*t;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const smooth = (a,b,x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
function hash3(x,y,z){ const h = Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453; return h-Math.floor(h); }
function vnoise(x,y,z){
  const xi=Math.floor(x), yi=Math.floor(y), zi=Math.floor(z);
  const xf=x-xi, yf=y-yi, zf=z-zi;
  const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf), w=zf*zf*(3-2*zf);
  const c=(a,b,d)=>hash3(xi+a,yi+b,zi+d);
  return lerp(lerp(lerp(c(0,0,0),c(1,0,0),u),lerp(c(0,1,0),c(1,1,0),u),v),
              lerp(lerp(c(0,0,1),c(1,0,1),u),lerp(c(0,1,1),c(1,1,1),u),v),w);
}
function fbm(x,y,z,oct=4){ let s=0, a=0.5, f=1; for (let i=0;i<oct;i++){ s += a*vnoise(x*f,y*f,z*f); f *= 2.03; a *= 0.5; } return s/(1-Math.pow(0.5,oct)); }
const store = {
  get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- renderer ----------
const canvas = $('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'}); }
catch (e) { $('msg').textContent = 'This browser could not start WebGL, which Bonzai needs.'; throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 300);
camera.position.set(1.3, 2.0, 3.1);
scene.add(camera);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.4, 0);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 1.0; controls.maxDistance = 6;
controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.9;
controls.rotateSpeed = 0.6;

// ---------- textures ----------
function texFromCanvas(c, srgb=true, repeat=true){
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function canvasTex(w, h, draw, repeat=true, srgb=true){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return texFromCanvas(c, srgb, repeat);
}
function makeBark(){
  const w = 192, h = 384;
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const cc = mk(), bc = mk(), vc = mk();
  const ci = cc.getContext('2d').createImageData(w,h), bi = bc.getContext('2d').createImageData(w,h), vi = vc.getContext('2d').createImageData(w,h);
  const span = 2.6;
  const field = (x, y) => {
    const a = x/w*TAU, cx = Math.cos(a)*2.4, cz = Math.sin(a)*2.4;
    const warp = fbm(cx*0.5, y*0.6, cz*0.5, 2)*1.2;
    const n = fbm(cx, y*0.55 + warp*0.25, cz, 4);
    return {ridge: 1 - Math.abs(n*2-1), patch: fbm(cx*0.35+7, y*0.35, cz*0.35, 3)};
  };
  for (let y=0;y<h;y++){
    const t = y/h, yy = t*span;
    for (let x=0;x<w;x++){
      const A = field(x, yy), B = field(x, yy - span);
      const v = Math.pow(lerp(A.ridge, B.ridge, t), 1.6), patch = lerp(A.patch, B.patch, t);
      const fine = hash3(x, y, 3)*0.12;
      let r = lerp(70, 176, v) + fine*40, g = lerp(54, 150, v) + fine*30, b = lerp(44, 126, v) + fine*25;
      const lich = smooth(0.62, 0.75, patch)*0.5;
      r = lerp(r, 140, lich*v); g = lerp(g, 148, lich*v); b = lerp(b, 118, lich*v);
      const i = (y*w+x)*4;
      ci.data[i]=r; ci.data[i+1]=g; ci.data[i+2]=b; ci.data[i+3]=255;
      bi.data[i]=bi.data[i+1]=bi.data[i+2]=clamp(v*255 + fine*60, 0, 255); bi.data[i+3]=255;
      vi.data[i]=vi.data[i+1]=vi.data[i+2]=Math.pow(1 - smooth(0.0, 0.22, v), 2)*255; vi.data[i+3]=255;
    }
  }
  cc.getContext('2d').putImageData(ci,0,0); bc.getContext('2d').putImageData(bi,0,0); vc.getContext('2d').putImageData(vi,0,0);
  return {map: texFromCanvas(cc), bump: texFromCanvas(bc, false), veins: texFromCanvas(vc)};
}
const bark = makeBark();
const leafTex = canvasTex(64, 128, (g,w) => {
  const grad = g.createLinearGradient(0,0,w,0);
  grad.addColorStop(0,'#d6d6d6'); grad.addColorStop(0.5,'#ffffff'); grad.addColorStop(1,'#cfcfcf');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(32,126); g.quadraticCurveTo(62,72,32,2); g.quadraticCurveTo(2,72,32,126); g.fill();
  g.strokeStyle = 'rgba(120,120,120,0.7)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(32,124); g.lineTo(32,10); g.stroke();
  g.lineWidth = 1;
  for (let y=30;y<110;y+=14){ g.beginPath(); g.moveTo(32,y+6); g.lineTo(14,y-6); g.moveTo(32,y+6); g.lineTo(50,y-6); g.stroke(); }
}, false);
const groundTex = canvasTex(512, 512, (g,w,h) => {
  const R = mulberry32(31);
  g.fillStyle = '#3b3527'; g.fillRect(0,0,w,h);
  for (let i=0;i<2600;i++){
    const c = [[92,74,46],[70,82,40],[110,90,60],[46,60,30],[130,100,60]][(R()*5)|0];
    g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.35+R()*0.5})`;
    g.beginPath(); g.ellipse(R()*w, R()*h, 2+R()*6, 1+R()*3, R()*3, 0, TAU); g.fill();
  }
});
groundTex.repeat.set(14,14);
const spriteTex = canvasTex(64, 64, (g) => {
  const rg = g.createRadialGradient(32,32,0,32,32,32);
  rg.addColorStop(0,'rgba(255,255,255,1)'); rg.addColorStop(0.25,'rgba(255,255,255,0.6)'); rg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0,0,64,64);
}, false);
function makeStoneTex(w3, R){
  return canvasTex(512, 512, (g,w,h) => {
    g.fillStyle = '#bdb6aa'; g.fillRect(0,0,w,h);
    for (let i=0;i<9000;i++){
      g.fillStyle = R() < 0.5 ? `rgba(70,62,55,${R()*0.12})` : `rgba(240,235,225,${R()*0.1})`;
      g.fillRect(R()*w, R()*h, 1+R()*3, 1+R()*3);
    }
    for (let r=0;r<8;r++){
      const off = (r%2)*64;
      for (let x=-off; x<w; x+=128){
        g.fillStyle = `rgba(${R()<.5?60:220},${R()<.5?55:210},${R()<.5?50:195},${R()*0.1})`;
        g.fillRect(x+2, r*64+2, 124, 60);
        g.fillStyle = 'rgba(45,38,32,0.5)'; g.fillRect(x, r*64, 2.5, 64);
      }
      g.fillStyle = 'rgba(45,38,32,0.55)'; g.fillRect(0, r*64, w, 2.5);
    }
    const pick = () => { const u = R(); return u < w3[0] ? 0 : u < w3[0]+w3[1] ? 1 : 2; };
    for (const by of [64, 320]){
      const m = pick();
      if (m===1){
        for (let x=8; x<w; x+=32){
          g.strokeStyle = 'rgba(55,45,38,0.55)'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(x, by+56); g.quadraticCurveTo(x+16, by+8, x+32, by+56); g.stroke();
          g.strokeStyle = 'rgba(245,235,215,0.3)';
          g.beginPath(); g.moveTo(x+4, by+56); g.quadraticCurveTo(x+16, by+18, x+28, by+56); g.stroke();
        }
      } else if (m===2){
        for (let x=10; x<w; x+=64){
          g.fillStyle = 'rgba(60,50,44,0.35)';
          g.beginPath(); g.roundRect ? g.roundRect(x, by+6, 50, 50, 12) : g.rect(x, by+6, 50, 50); g.fill();
          g.fillStyle = 'rgba(240,230,210,0.35)';
          g.beginPath(); g.arc(x+18, by+22, 7, 0, TAU); g.arc(x+34, by+38, 5, 0, TAU); g.fill();
          g.fillRect(x+10, by+44, 30, 4);
        }
      } else {
        for (let x=28; x<w; x+=56){
          g.strokeStyle = 'rgba(55,60,58,0.5)'; g.lineWidth = 2;
          g.beginPath();
          for (let t=0;t<14;t+=0.1){ const r = 2 + t*1.6; const px = x + Math.cos(t)*r, py = by+32 + Math.sin(t)*r; t===0 ? g.moveTo(px,py) : g.lineTo(px,py); }
          g.stroke();
        }
      }
    }
    for (let i=0;i<Math.round(w3[2]*40);i++){ g.fillStyle = `rgba(176,52,40,${0.12+R()*0.2})`; g.beginPath(); g.ellipse(R()*w, R()*h, 10+R()*40, 8+R()*30, R()*3, 0, TAU); g.fill(); }
    for (let i=0;i<Math.round(w3[0]*40);i++){ g.fillStyle = `rgba(70,150,140,${0.1+R()*0.18})`; g.beginPath(); g.ellipse(R()*w, R()*h, 10+R()*40, 8+R()*30, R()*3, 0, TAU); g.fill(); }
  });
}

// ---------- materials ----------
const barkMat = new THREE.MeshStandardMaterial({map:bark.map, bumpMap:bark.bump, bumpScale:1.6, roughness:0.9, emissiveMap:bark.veins, emissive:0xffffff, emissiveIntensity:0});
const groundMat = new THREE.MeshStandardMaterial({map:groundTex, roughness:1});
const vineMat = new THREE.MeshStandardMaterial({color:0x3d4a2a, roughness:0.8});
const ironMat = new THREE.MeshStandardMaterial({color:0x4a423d, roughness:0.4, metalness:0.75});
const timeU = {value:0};
const leafMat = new THREE.MeshStandardMaterial({map:leafTex, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.7, metalness:0});
leafMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = timeU;
  sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float sw = sin(uTime*1.7 + ip.x*2.3 + ip.z*1.9)*0.6 + sin(uTime*3.1 + ip.y*4.1 + ip.x)*0.4;
    transformed.x += sw*0.12*position.y;
    transformed.z += sw*0.08*position.y;
  #endif`);
};
const leafDepth = new THREE.MeshDepthMaterial({map:leafTex, alphaTest:0.5, depthPacking:THREE.RGBADepthPacking});
const bloomMat = new THREE.MeshStandardMaterial({color:0xffffff, emissive:0xff3d8b, emissiveIntensity:0, roughness:0.5});
const beamMat = new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false,
  uniforms:{color:{value:new THREE.Color(1,1,1)}, opacity:{value:0}, time:timeU},
  vertexShader:`varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader:`uniform vec3 color; uniform float opacity, time; varying vec2 vUv; varying vec3 vW;
    void main(){
      float edge = smoothstep(0.0,0.35,vUv.x)*smoothstep(1.0,0.65,vUv.x);
      float fall = pow(1.0-vUv.y, 1.5)*smoothstep(0.0,0.06,vUv.y);
      float dust = 0.7 + 0.3*sin(vW.y*7.0 + vW.x*4.0 + time*0.6);
      gl_FragColor = vec4(color*opacity*edge*fall*dust, 1.0);
    }`
});
const markMat = c => new THREE.MeshBasicMaterial({color:c, transparent:true, opacity:0.95, depthTest:false, toneMapped:false});

// Stone between the camera and the tree is screen-door faded inside a cylinder along the line of sight,
// so ledges and beams never hide the tree. Shadows are unaffected (the depth pass ignores this).
const cutU = {cam:{value:new THREE.Vector3()}, focus:{value:new THREE.Vector3()}, r:{value:0.85}};
function addCutaway(mat){
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCam = cutU.cam; sh.uniforms.uFocus = cutU.focus; sh.uniforms.uCutR = cutU.r;
    sh.vertexShader = 'varying vec3 vCutW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vCutW = (modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = 'uniform vec3 uCam; uniform vec3 uFocus; uniform float uCutR; varying vec3 vCutW;\n' + sh.fragmentShader.replace('void main() {', `void main() {
      vec3 ab = uFocus - uCam; float tt = dot(vCutW - uCam, ab)/dot(ab, ab);
      if (tt > 0.0 && tt < 0.97){
        float d = length(vCutW - (uCam + ab*tt));
        float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453);
        float edge = smoothstep(uCutR, uCutR*0.7, d);
        if (n < edge*0.8) discard;
      }`);
  };
  return mat;
}

// ---------- geometry helpers ----------
function sampleRad(rad, u){ const f = u*(rad.length-1), i = Math.min(rad.length-2, Math.floor(f)); return lerp(rad[i], rad[i+1], f-i); }
function tubeGeo(pts, rad, radial, o={}){
  const knob = o.knob ?? 0.07, knobF = o.knobF ?? 6, flutes = o.flutes ?? 0, fluteAmp = o.fluteAmp ?? 0;
  const fluteFade = o.fluteFade ?? 0.3, twist = o.twist ?? 0, collar = o.collar ?? 0, phase = o.phase ?? 0;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const L = curve.getLength();
  const seg = Math.max(4, Math.ceil(L*(o.density ?? 22)));
  const fr = curve.computeFrenetFrames(seg, false);
  const pos = [], uv = [], idx = [];
  const P = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i=0;i<=seg;i++){
    const u = i/seg;
    curve.getPointAt(u, P);
    const r = sampleRad(rad, u) * (1 + collar*Math.exp(-u*L*9));
    const fl = fluteAmp*Math.pow(Math.max(0, 1-u/fluteFade), 1.4);
    for (let j=0;j<=radial;j++){
      const a = j/radial*TAU, ca = Math.cos(a), sa = Math.sin(a);
      n.copy(fr.normals[i]).multiplyScalar(ca).addScaledVector(fr.binormals[i], sa).normalize();
      let k = 1 + knob*(vnoise(P.x*knobF+ca*0.8+phase, P.y*knobF, P.z*knobF+sa*0.8)-0.5)*2;
      if (fl > 0) k += fl*Math.pow(Math.max(0, Math.sin(flutes*a + twist*u*TAU + phase)), 2);
      pos.push(P.x+n.x*r*k, P.y+n.y*r*k, P.z+n.z*r*k);
      uv.push(j/radial*2 + twist*u*0.3, u*L*0.7);
    }
  }
  for (let i=0;i<seg;i++) for (let j=0;j<radial;j++){ const a = i*(radial+1)+j, b = a+radial+1; idx.push(a, b, a+1, b, b+1, a+1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nr = g.attributes.normal;
  for (let i=0;i<=seg;i++){
    const a = i*(radial+1), b = a+radial;
    const x = nr.getX(a)+nr.getX(b), y = nr.getY(a)+nr.getY(b), z = nr.getZ(a)+nr.getZ(b), l = Math.hypot(x,y,z)||1;
    nr.setXYZ(a, x/l, y/l, z/l); nr.setXYZ(b, x/l, y/l, z/l);
  }
  return g;
}
const MOSS = new THREE.Color(0x56732f);
function weather(geo, seed, mossAmt=1, tint=null){
  geo = geo.index ? geo.toNonIndexed() : geo;
  const p = geo.attributes.position, n0 = geo.attributes.normal, cols = [];
  const tmp = new THREE.Color();
  for (let i=0;i<p.count;i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), s = 2.6;
    p.setXYZ(i, x+(vnoise(x*s+seed,y*s,z*s)-0.5)*0.04, y+(vnoise(x*s,y*s+seed,z*s)-0.5)*0.04, z+(vnoise(x*s,y*s,z*s+seed)-0.5)*0.04);
    const m = clamp((n0.getY(i)-0.3)*1.6,0,1) * clamp((vnoise(x*3+seed,y*3,z*3)-0.35)*2.5,0,1) * mossAmt;
    const v = 0.82 + vnoise(x*1.5,y*1.5+seed,z*1.5)*0.28;
    tmp.setRGB(v,v,v); if (tint) tmp.multiply(tint); tmp.lerp(MOSS, clamp(m,0,1));
    cols.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols,3));
  geo.computeVertexNormals();
  return geo;
}
function scaleUVs(g, w, h, d){
  const uv = g.attributes.uv, nrm = g.attributes.normal;
  for (let i=0;i<uv.count;i++){
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i));
    uv.setXY(i, uv.getX(i)*(ax > 0.5 ? d : w)*0.9, uv.getY(i)*(ay > 0.5 ? d : h)*0.9);
  }
}
function stoneBox(w,h,d,seed,mossAmt=1,tint=null){
  const g = new THREE.BoxGeometry(w,h,d, Math.max(1,Math.round(w*4)), Math.max(1,Math.round(h*4)), Math.max(1,Math.round(d*4)));
  scaleUVs(g, w, h, d);
  return weather(g, seed, mossAmt, tint);
}

// ---------- sky, lights, post ----------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top:{value:new THREE.Color()}, hor:{value:new THREE.Color()}, bottom:{value:new THREE.Color()},
    sunDir:{value:new THREE.Vector3()}, sunCol:{value:new THREE.Color()}, sunVis:{value:1},
    moonDir:{value:new THREE.Vector3()}, moonVis:{value:0}, stars:{value:0}, time:timeU },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform vec3 top, hor, bottom, sunDir, sunCol, moonDir; uniform float sunVis, moonVis, stars, time;
    varying vec3 vDir;
    float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    void main(){
      vec3 d = normalize(vDir); float h = d.y;
      vec3 col = h > 0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0), 0.45)) : mix(hor, bottom, pow(clamp(-h*3.0,0.0,1.0), 0.6));
      float sd = max(dot(d, sunDir), 0.0);
      col += sunCol*(pow(sd, 6.0)*0.25 + pow(sd, 48.0)*0.6)*sunVis;
      col += sunCol*smoothstep(0.9990, 0.9995, sd)*14.0*sunVis;
      float md = max(dot(d, moonDir), 0.0);
      col += vec3(0.85,0.9,1.0)*smoothstep(0.9994, 0.9997, md)*3.0*moonVis + vec3(0.25,0.3,0.45)*pow(md, 30.0)*0.4*moonVis;
      vec3 sp = floor(d*240.0); float s = hash(sp);
      col += vec3(1.0)*step(0.9972, s)*stars*(0.6+0.4*sin(time*2.0 + s*60.0))*smoothstep(0.0, 0.2, h)*1.6;
      gl_FragColor = vec4(col, 1.0);
    }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), skyMat); scene.add(sky);
const hemi = new THREE.HemisphereLight(0xffffff, 0x333322, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera, {left:-5, right:5, top:6, bottom:-6, near:0.5, far:40});
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
const fill = new THREE.PointLight(0xa8b8ff, 0, 12, 1); fill.position.set(0, 0.6, 0); camera.add(fill);
const magic = new THREE.PointLight(0xffffff, 0, 7, 1); scene.add(magic);
scene.fog = new THREE.FogExp2(0x000000, 0.035);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(160,160), groundMat);
ground.rotation.x = -Math.PI/2; ground.position.y = -0.8; ground.receiveShadow = true; scene.add(ground);

const MOTES = 160, motePos = new Float32Array(MOTES*3), moteSeed = [];
{ const R = mulberry32(9); for (let i=0;i<MOTES;i++) moteSeed.push([R()*TAU, 0.3+R()*1.8, -1+R()*4, R()*TAU, 0.3+R()*0.7]); }
const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos,3));
const moteMat = new THREE.PointsMaterial({map:spriteTex, size:0.04, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, color:0xffffff, toneMapped:false});
const motes = new THREE.Points(moteGeo, moteMat); motes.frustumCulled = false; scene.add(motes);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256,256), 0.4, 0.55, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let bloomOn = true;

// ---------- day / night ----------
const KEYS = [
  {el:-0.45, top:0x070d22, hor:0x1c2d52, bottom:0x080b12, fog:0x132038, light:0xa4b8ff, li:1.0, hs:0x4060a0, hg:0x141a24, hi:0.95, exp:1.4, glow:1, stars:1, bloom:0.7, fill:1.4},
  {el:-0.12, top:0x1c2552, hor:0x6c5c8e, bottom:0x15131c, fog:0x3e3b58, light:0x9aa0ff, li:0.45, hs:0x6070aa, hg:0x1a1820, hi:0.8, exp:1.25, glow:0.6, stars:0.35, bloom:0.6, fill:0.8},
  {el:0.02, top:0x34448a, hor:0xff935a, bottom:0x2a2018, fog:0xb47c6e, light:0xff8a4a, li:1.8, hs:0x8a7aa0, hg:0x3a2a20, hi:0.6, exp:1.1, glow:0.12, stars:0, bloom:0.5, fill:0.15},
  {el:0.22, top:0x4a7ac0, hor:0xffd39c, bottom:0x3a3226, fog:0xcdb79c, light:0xffd2a2, li:3.0, hs:0x9ab8e0, hg:0x4a3a28, hi:0.6, exp:1.05, glow:0, stars:0, bloom:0.35, fill:0},
  {el:0.8, top:0x2c6cc6, hor:0xbfe0ee, bottom:0x3c3c30, fog:0xb4ccd4, light:0xfff4e2, li:3.4, hs:0xb4d4ff, hg:0x4a4a30, hi:0.7, exp:1.0, glow:0, stars:0, bloom:0.28, fill:0},
];
const cA = new THREE.Color(), cB = new THREE.Color();
const lerpHex = (a, b, t, out) => { cA.set(a); cB.set(b); return out.copy(cA).lerp(cB, t); };
function palette(el){
  let i = 0; while (i < KEYS.length-2 && el > KEYS[i+1].el) i++;
  const a = KEYS[i], b = KEYS[i+1], t = clamp((el-a.el)/(b.el-a.el), 0, 1);
  return {a, b, t, n:k => lerp(a[k], b[k], t)};
}
const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
const MOTE_DAY = new THREE.Color(0xffe6bf);
let hours = CFG.START_HOUR, hoursTo = hours, dayLight = 0;
function applyTime(){
  const tod = hours/24, ang = (tod-0.25)*TAU;
  const el = Math.asin(Math.sin(ang)*Math.sin(1.15));
  const az = CFG.SUN_AZ0 + (hours-6)/12*Math.PI;
  sunDir.set(Math.cos(el)*Math.cos(az), Math.sin(el), Math.cos(el)*Math.sin(az));
  moonDir.set(-sunDir.x, Math.max(0.35, -sunDir.y), -sunDir.z).normalize();
  const p = palette(el), u = skyMat.uniforms;
  lerpHex(p.a.top, p.b.top, p.t, u.top.value); lerpHex(p.a.hor, p.b.hor, p.t, u.hor.value);
  lerpHex(p.a.bottom, p.b.bottom, p.t, u.bottom.value); lerpHex(p.a.light, p.b.light, p.t, u.sunCol.value);
  u.sunDir.value.copy(sunDir); u.moonDir.value.copy(moonDir);
  u.sunVis.value = clamp((el+0.06)*8, 0, 1); u.moonVis.value = clamp((-el-0.05)*6, 0, 1); u.stars.value = p.n('stars');
  lerpHex(p.a.fog, p.b.fog, p.t, scene.fog.color);
  const useSun = el > -0.06;
  sun.position.copy(useSun ? sunDir : moonDir).multiplyScalar(18).add(sun.target.position);
  lerpHex(p.a.light, p.b.light, p.t, sun.color);
  sun.intensity = p.n('li') * (useSun ? clamp((el+0.06)*10, 0, 1) : clamp((-el-0.06)*8, 0, 1));
  dayLight = useSun ? clamp(el*5, 0, 1) : 0;
  lerpHex(p.a.hs, p.b.hs, p.t, hemi.color); lerpHex(p.a.hg, p.b.hg, p.t, hemi.groundColor);
  hemi.intensity = p.n('hi');
  renderer.toneMappingExposure = p.n('exp');
  const glow = p.n('glow');
  fill.intensity = p.n('fill');
  bloomMat.emissiveIntensity = glow*2.4;
  barkMat.emissiveIntensity = glow*0.55;
  magic.color.copy(world.glow); magic.intensity = glow*1.4;
  for (const s of world.segs) s.mats[1].emissiveIntensity = 0.35 + glow*2.2;
  moteMat.color.copy(MOTE_DAY).lerp(world.glow, glow);
  moteMat.opacity = 0.3 + glow*0.55; moteMat.size = 0.03 + glow*0.014;
  for (const b of world.beams){
    const o = clamp(b.w.n.dot(sunDir)*1.6 + 0.15, 0, 1) * dayLight * 0.26;
    b.mat.uniforms.opacity.value = o; b.mat.uniforms.color.value.copy(sun.color);
    b.mesh.visible = o > 0.004;
    b.mesh.lookAt(b.mesh.position.clone().sub(sunDir));
  }
  bloom.strength = bloomOn ? p.n('bloom') : 0;
}

// ---------- world visuals (built from the simulation's chunks) ----------
const IR = (CFG.SHAFT_R + 0.6)*C, WALL_T = 0.4, SEGS = 10;
const STONE_TINT = [new THREE.Color(0xb7d0c9), new THREE.Color(0xd9b58c), new THREE.Color(0xeee4cf)];
const GLOW = [new THREE.Color(0x52f2ff), new THREE.Color(0xffc24a), new THREE.Color(0x52ff9a)];
const BLOSSOM = [new THREE.Color(0x9ff0ff), new THREE.Color(0xff5fa2), new THREE.Color(0xff9a2e)];
const RED = new THREE.Color(1.0, 0.62, 0.55);
let world = {group:null, segs:[], beams:[], chunksBuilt:0, rocksBuilt:0, glow:new THREE.Color(1,1,1), disposables:[], anchorMeshes:[]};

function mixW(arr, w){ const c = new THREE.Color(0,0,0); arr.forEach((k,i) => c.add(k.clone().multiplyScalar(w[i]))); return c; }

function resetWorld(){
  if (world.group){
    scene.remove(world.group);
    world.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    world.disposables.forEach(d => d.dispose());
  }
  const w = g.blend;
  const stoneTex = makeStoneTex(w, mulberry32(hashInt(g.seed, 11)));
  const stoneMat = new THREE.MeshStandardMaterial({map:stoneTex, bumpMap:stoneTex, bumpScale:2.5, roughness:0.95, vertexColors:true, color:mixW(STONE_TINT, w)});
  const wallMat = stoneMat.clone();
  addCutaway(stoneMat);
  const glowCol = mixW(GLOW, w);
  const glowMat = new THREE.MeshStandardMaterial({color:glowCol, emissive:glowCol, emissiveIntensity:0.4, roughness:0.35, metalness:0.6});
  barkMat.emissive.copy(glowCol); bloomMat.emissive.copy(glowCol);
  world = {group:new THREE.Group(), segs:[], beams:[], chunksBuilt:0, rocksBuilt:0, glow:glowCol, stoneMat, wallMat, glowMat, disposables:[stoneTex, stoneMat, wallMat, glowMat], anchorMeshes:[]};
  scene.add(world.group);
  const moss = 0.6 + w[1]*1.2;
  const add = (geo, x, y, z) => { const m = new THREE.Mesh(geo, stoneMat); m.position.set(x,y,z); m.castShadow = m.receiveShadow = true; world.group.add(m); return m; };
  add(stoneBox(1.4,0.35,1.4,1,moss*1.2), 0,-0.175,0);
  add(stoneBox(2.0,0.45,2.0,2,moss*1.2), 0,-0.575,0);
  // decorative surface roots over the plinth
  const R = mulberry32(hashInt(g.seed, 13)), rootGeos = [];
  for (let k=0;k<7;k++){
    const az = k/7*TAU + R()*0.35, c = Math.cos(az), s = Math.sin(az);
    const e = 0.7/Math.max(Math.abs(c),Math.abs(s));
    const pts = [V(c*0.1,0.22,s*0.1), V(c*0.28,0.07,s*0.28), V(c*0.5,0.03,s*0.5), V(c*(e-0.04),0.02,s*(e-0.04))];
    const rad = [0.1, 0.07, 0.05, 0.04];
    if (k%2===0){ pts.push(V(c*(e+0.05),-0.1,s*(e+0.05)), V(c*(e+0.07),-0.33,s*(e+0.07)), V(c*(e+0.3),-0.42,s*(e+0.3)), V(c*(e+0.4),-0.82,s*(e+0.4))); rad.push(0.035, 0.03, 0.025, 0.02); }
    else { pts.push(V(c*(e+0.02),-0.05,s*(e+0.02))); rad.push(0.02); }
    rootGeos.push(tubeGeo(pts, rad, 10, {knob:0.12, knobF:5}));
  }
  const roots = new THREE.Mesh(mergeGeometries(rootGeos), barkMat); roots.castShadow = roots.receiveShadow = true; world.group.add(roots);
  if (w[0] > 0.3){
    const water = new THREE.Mesh(new THREE.CircleGeometry(IR+0.05, 64), new THREE.MeshStandardMaterial({color:0x0f3b44, roughness:0.08, metalness:0.35, transparent:true, opacity:0.88}));
    water.rotation.x = -Math.PI/2; water.position.y = -0.65; world.group.add(water); world.disposables.push(water.material);
  }
}

function buildChunk(ch){
  const R = mulberry32(hashInt(g.seed, 300 + ch.ci));
  const w = g.blend, moss = 0.6 + w[1]*1.2;
  const base = ch.ci === 0 ? -0.8 : ch.y0*C, top = (ch.y0 + CFG.CHUNK)*C;
  const rad = IR + WALL_T/2, W = 2*rad*Math.tan(Math.PI/SEGS) + 0.06;
  const rowH = C, cols = 4, colW = W/cols;
  for (const sg of ch.segs){
    const a = sg.a, style = sg.style;
    const grp = new THREE.Group();
    grp.position.set(Math.cos(a)*rad, base, Math.sin(a)*rad);
    grp.rotation.y = Math.PI/2 - a;
    world.group.add(grp);
    const mat = world.wallMat.clone(), gmat = world.glowMat.clone();
    mat.alphaHash = gmat.alphaHash = true;
    world.disposables.push(mat, gmat);
    const geos = [], glowGeos = [];
    let seedK = ch.ci*1000 + sg.k*37;
    const block = (bw,bh,bd,x,y,z,tint=null,ry=0) => { const b = stoneBox(bw,bh,bd,seedK++,moss,tint); if (ry) b.rotateY(ry); b.translate(x,y,z); geos.push(b); };
    const nRows = Math.round((top - base)/rowH);
    const r0 = sg.win ? Math.round((sg.win.y*C - base)/rowH) : -99;
    const tint = style === 2 ? RED : null;
    const L = -W/2 + colW;
    for (let r=0;r<nRows;r++) for (let c=0;c<cols;c++){
      if (sg.win && c>=1 && c<=2 && r>=r0 && r<r0+2) continue;
      if (style === 2 && sg.win && r === r0+2 && (c===1 || c===2)){
        if (c===1){ block(colW*0.8, rowH-0.02, WALL_T, L+colW*0.4, r*rowH+rowH/2, 0); block(colW*0.8, rowH-0.02, WALL_T, L+2*colW-colW*0.4, r*rowH+rowH/2, 0); }
        continue;
      }
      block(colW-0.025, rowH-0.02, WALL_T*(0.85+R()*0.3), -W/2+colW*(c+0.5)+(R()-.5)*0.03, r*rowH+rowH/2+(R()-.5)*0.015, (R()-.5)*0.06, (tint && R()<0.35) ? tint : null, (R()-.5)*0.05);
    }
    if (sg.win){
      const y0 = r0*rowH;
      if (style === 1){
        const prof = [[0,0],[0.05,0],[0.05,0.05],[0.032,0.09],[0.06,0.28],[0.036,0.48],[0.06,0.7],[0.032,0.9],[0.05,0.95],[0.05,1],[0,1]].map(([x,y]) => new THREE.Vector2(x, y*(2*rowH-0.03)));
        for (let i=1;i<=4;i++){ const lg = new THREE.LatheGeometry(prof, 10); scaleUVs(lg, 0.3, 1, 0.3); const wg = weather(lg, seedK++, moss*0.5); wg.translate(L + i*(2*colW)/5, y0+0.015, 0); geos.push(wg); }
      } else if (style === 0){
        for (const x of [L+colW*0.5, L+colW*1.5]){
          const cg = new THREE.CylinderGeometry(0.07, 0.075, 2*rowH, 20, 3); scaleUVs(cg, 0.4, 1, 0.4);
          const wg = weather(cg, seedK++, moss*0.5); wg.translate(x, y0+rowH, 0); geos.push(wg);
        }
        const t = new THREE.BoxGeometry(2*colW, 0.035, WALL_T*1.05); t.translate(0, y0-0.02, 0); glowGeos.push(t);
      }
    }
    const wall = new THREE.Mesh(mergeGeometries(geos), mat); wall.castShadow = wall.receiveShadow = true; grp.add(wall);
    if (glowGeos.length){ const gm = new THREE.Mesh(mergeGeometries(glowGeos), gmat); grp.add(gm); }
    world.segs.push({group:grp, mats:[mat, gmat], dir:new THREE.Vector2(Math.cos(a), Math.sin(a)), op:1});
    if (sg.win){
      const len = 4.5;
      const mk = rz => { const p = new THREE.PlaneGeometry(1, len); p.translate(0, len/2, 0); p.rotateX(Math.PI/2); if (rz) p.rotateZ(Math.PI/2); return p; };
      const geo = mergeGeometries([mk(false), mk(true)]); geo.scale(2*colW*0.9, 2*rowH*0.9, 1);
      const m = beamMat.clone(); m.uniforms.time = timeU; world.disposables.push(m);
      const mesh = new THREE.Mesh(geo, m); mesh.renderOrder = 5; mesh.frustumCulled = false;
      mesh.position.set(Math.cos(a)*(IR+0.1), sg.win.y*C + C*0.5, Math.sin(a)*(IR+0.1));
      world.group.add(mesh);
      world.beams.push({mesh, mat:m, w:{n:V(Math.cos(a), 0, Math.sin(a))}});
    }
  }
  // obstacle cells: ledges, broken beams, fallen blocks
  if (ch.stones.length){
    const geos = ch.stones.map(([x,y,z], i) => { const b = stoneBox(C*0.98, C*0.96, C*0.98, ch.ci*7000+i, moss); b.rotateY((hash3(x,y,z)-0.5)*0.12); b.translate(x*C, y*C, z*C); return b; });
    const m = new THREE.Mesh(mergeGeometries(geos), world.stoneMat); m.castShadow = m.receiveShadow = true; world.group.add(m);
  }
  // iron rings, each held on a short bracket from the wall
  for (const an of ch.anchors){
    const grp = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 24), ironMat);
    const rodLen = IR - Math.hypot(an.x, an.z)*C + 0.05;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, rodLen, 6), ironMat);
    rod.rotation.x = Math.PI/2; rod.position.z = -rodLen/2 - 0.08;
    grp.add(ring, rod);
    grp.position.set(an.x*C, an.y*C, an.z*C);
    grp.lookAt(0, an.y*C, 0); grp.rotateY(Math.PI);
    ring.castShadow = true;
    world.group.add(grp);
    world.anchorMeshes[an.id] = ring;
  }
}
function syncWorld(){
  while (world.chunksBuilt < g.chunks.length) buildChunk(g.chunks[world.chunksBuilt++]);
  while (world.rocksBuilt < g.rocks.length){
    const rk = g.rocks[world.rocksBuilt++];
    const geos = rk.cells.map(([x,y,z], i) => { const b = stoneBox(C*0.98, C*0.96, C*0.98, 9000+world.rocksBuilt*10+i, 0.4); b.translate(x*C, y*C, z*C); return b; });
    const m = new THREE.Mesh(mergeGeometries(geos), world.stoneMat); m.castShadow = m.receiveShadow = true; world.group.add(m);
  }
  for (const an of g.anchors){
    const m = world.anchorMeshes[an.id];
    if (m) m.material = an.used ? world.glowMat : ironMat;
  }
}

// ---------- tree visuals ----------
let treeGroup = null;
const jit = (n) => V((n.x + (hash3(n.x,n.y,n.z)-0.5)*0.28)*C, (n.y + (hash3(n.z,n.x,n.y)-0.5)*0.18)*C, (n.z + (hash3(n.y,n.z,n.x)-0.5)*0.28)*C);
function buildTree(){
  if (treeGroup){ scene.remove(treeGroup); treeGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  treeGroup = new THREE.Group(); scene.add(treeGroup);
  const N = g.nodes, desc = new Array(N.length).fill(0);
  for (let i=N.length-1;i>=0;i--){ if (!N[i].alive) continue; desc[i] += 1; if (N[i].parent >= 0) desc[N[i].parent] += desc[i]; }
  const radius = id => Math.min(0.3, 0.028 + 0.021*Math.sqrt(desc[id]));
  const pos = N.map(n => n.alive ? (n.id === 0 ? V(0, -0.05, 0) : jit(n)) : null);
  const chains = [], stack = [[0, -1]];
  while (stack.length){
    const [start, from] = stack.pop();
    const ids = from >= 0 ? [from] : [];
    let cur = start;
    for (;;){
      ids.push(cur);
      const ch = N[cur].children.filter(c => N[c].alive).sort((a,b) => desc[b]-desc[a]);
      if (!ch.length) break;
      for (let i=1;i<ch.length;i++) stack.push([ch[i], cur]);
      cur = ch[0];
    }
    chains.push(ids);
  }
  const geos = [];
  for (const ids of chains){
    if (ids.length < 2) continue;
    const pts = ids.map(id => pos[id]);
    const rad = ids.map((id, i) => i === 0 && N[ids[1]].parent === id && ids[0] !== 0 ? radius(ids[1])*1.15 : radius(id));
    if (ids[0] === 0) rad[0] = 0.4;
    const trunk = ids[0] === 0;
    const r0 = rad[0];
    geos.push(tubeGeo(pts, rad, trunk ? 26 : r0 > 0.08 ? 12 : 7,
      trunk ? {knob:0.1, knobF:3.2, flutes:5, fluteAmp:0.5, fluteFade:0.18, twist:0.18, phase:g.seed%7, density:26}
            : {knob:0.08, knobF:7, collar:0.3}));
  }
  if (geos.length){ const wood = new THREE.Mesh(mergeGeometries(geos), barkMat); wood.castShadow = wood.receiveShadow = true; treeGroup.add(wood); }

  // foliage: a pad at each tip, small clusters on young wood
  const leaves = [], blossoms = [];
  const d = new THREE.Object3D(), out = new THREE.Vector3(), col = new THREE.Color();
  const hue = 0.36*g.blend[0] + 0.27*g.blend[1] + 0.22*g.blend[2];
  const R = mulberry32(hashInt(g.seed, g.turn, 77));
  const pad = (c, r, n, health, flowering) => {
    for (let m=0;m<n;m++){
      const u = R()*2-1, th = R()*TAU, s = Math.sqrt(1-u*u);
      const dx = s*Math.cos(th), dy = u*0.6 + 0.25, dz = s*Math.sin(th);
      const rr = r*(0.45 + 0.55*Math.sqrt(R()));
      d.position.set(c.x + dx*rr, c.y + dy*rr*0.6, c.z + dz*rr);
      out.set(dx, dy+0.6, dz).normalize().add(V((R()-.5)*0.8,(R()-.5)*0.8,(R()-.5)*0.8));
      d.lookAt(d.position.clone().add(out)); d.rotateZ(R()*TAU);
      d.scale.setScalar(0.6 + R()*0.5); d.updateMatrix();
      const shell = rr/r;
      col.setHSL(lerp(0.12, hue, health) + (R()-.5)*0.04, lerp(0.55, 0.5, health) + R()*0.12, (0.17 + R()*0.1)*(0.55 + 0.45*shell)*(0.85 + 0.25*dy));
      leaves.push([d.matrix.clone(), col.clone()]);
      if (flowering && shell > 0.8 && R() < 0.12){
        const pick = R(), w = g.blend, bi = pick < w[0] ? 0 : pick < w[0]+w[1] ? 1 : 2;
        blossoms.push([new THREE.Matrix4().compose(d.position.clone().addScaledVector(out, 0.03), new THREE.Quaternion(), V(1,1,1).multiplyScalar(0.7+R()*0.5)), BLOSSOM[bi].clone()]);
      }
    }
  };
  for (const t of g.tips){
    const n = N[t.node];
    const danger = Math.max(t.stuck/CFG.WITHER_TURNS, t.hunger/CFG.STARVE_TURNS);
    pad(pos[n.id].clone().add(V(0, 0.05, 0)), 0.2, 80, 1 - danger*0.8, hash3(n.id, 1, 2) < 0.5);
  }
  // young wood gets small clusters; older wood keeps a pad every few cells so branches stay leafy
  for (const n of N){
    if (!n.alive || n.id === 0 || tipAtNode.has(n.id) || n.y < 3) continue;
    if (g.turn - n.born <= 4) pad(pos[n.id], 0.1, 14, 1, false);
    else if (hash3(n.id, 5, 9) < 0.34) pad(pos[n.id].clone().add(V(0, 0.03, 0)), 0.15, 26, 1, hash3(n.id, 3, 1) < 0.25);
  }
  const leafGeo = new THREE.PlaneGeometry(0.1, 0.17); leafGeo.translate(0, 0.085, 0);
  if (leaves.length){
    const im = new THREE.InstancedMesh(leafGeo, leafMat, leaves.length);
    leaves.forEach(([m,c],i) => { im.setMatrixAt(i, m); im.setColorAt(i, c); });
    im.customDepthMaterial = leafDepth; im.castShadow = im.receiveShadow = true;
    treeGroup.add(im);
  }
  if (blossoms.length){
    const bm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.022, 1), bloomMat, blossoms.length);
    blossoms.forEach(([m,c],i) => { bm.setMatrixAt(i, m); bm.setColorAt(i, c); });
    treeGroup.add(bm);
  }
  treePos = pos;
}
let treePos = [];
let tipAtNode = new Set();

// ---------- markers and picking ----------
const markers = new THREE.Group(); markers.renderOrder = 10; scene.add(markers);
let pickables = [];
const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
const MAT = {lit:markMat(0xffd166), shade:markMat(0x9be37a), danger:markMat(0xffb14a), stuck:markMat(0xff6a55),
  ghost:new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.45, depthTest:false, toneMapped:false}),
  target:markMat(0xffffff), rock:new THREE.MeshBasicMaterial({color:0xff5040, transparent:true, opacity:0.28, depthWrite:false, toneMapped:false}),
  lightPts:new THREE.PointsMaterial({map:spriteTex, size:0.09, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, color:0xffe08a, toneMapped:false})};
const cellPos = (x,y,z) => V(x*C, y*C, z*C);
function dot(p, r, mat){ const m = new THREE.Mesh(sphereGeo, mat); m.position.copy(p); m.scale.setScalar(r); m.renderOrder = 10; markers.add(m); return m; }
let showLight = false;

function refreshMarkers(){
  markers.clear(); pickables = [];
  const mode = sel ? (sel.step === 0 ? CARDS[sel.card].target : CARDS[sel.card].then) : null;
  const valid = sel ? new Set(targets(g, sel.card, sel.step, sel.t)) : null;
  for (const t of g.tips){
    const n = g.nodes[t.node], p = treePos[n.id] || cellPos(n.x,n.y,n.z);
    const danger = t.stuck >= CFG.WITHER_TURNS-1 || t.hunger >= CFG.STARVE_TURNS-1;
    const mat = t.stalled ? MAT.stuck : danger ? MAT.danger : lit(g, n.x, n.y, n.z) ? MAT.lit : MAT.shade;
    const pick = mode === 'tip' && valid.has(t.id);
    const chosen = sel && sel.step === 1 && sel.t === t.id;
    dot(p, pick || chosen ? 0.07 : 0.045, mat);
    if (pick) pickables.push({p, id:t.id});
    if (!sel || mode === 'tip'){
      const m = chooseMove(g, t);
      if (m){
        const q = cellPos(m.x, m.y, m.z);
        dot(q, 0.03, MAT.ghost);
        const lg = new THREE.BufferGeometry().setFromPoints([p, q]);
        const ln = new THREE.Line(lg, new THREE.LineBasicMaterial({color:0xffffff, transparent:true, opacity:0.5, depthTest:false}));
        ln.renderOrder = 10; markers.add(ln);
      }
    }
  }
  if (mode === 'wood' || mode === 'bud'){
    for (const id of valid){ const p = treePos[id]; if (!p) continue; dot(p, 0.028, MAT.target); pickables.push({p, id}); }
  }
  if (mode === 'dir'){
    const t = tipById(g, sel.t), n = g.nodes[t.node];
    for (const i of valid){
      const d = DIRS[i], p = cellPos(n.x+d[0], n.y+d[1], n.z+d[2]);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 10), MAT.target);
      cone.position.copy(p); cone.lookAt(p.clone().add(V(d[0],d[1],d[2]))); cone.rotateX(Math.PI/2); cone.renderOrder = 10;
      markers.add(cone); pickables.push({p, id:i});
    }
  }
  if (mode === 'anchor'){
    for (const id of valid){ const a = g.anchors[id], p = cellPos(a.x, a.y, a.z); dot(p, 0.06, MAT.target); pickables.push({p, id}); }
  }
  // the next rock: a red column down to where it will land
  if (g.nextRock && g.nextRock.turn - g.turn <= 2){
    const {x, z} = g.nextRock;
    let y = g.maxY + 6; while (y > 1 && !blocked(g, x, y-1, z)) y--;
    const h = (g.maxY + 6 - y)*C + C;
    const col = new THREE.Mesh(new THREE.BoxGeometry(2*C, h, 2*C), MAT.rock);
    col.position.set((x+0.5)*C, y*C + h/2 - C/2, (z+0.5)*C); col.renderOrder = 9; markers.add(col);
  }
  if (showLight){
    const pts = [], seen = new Set();
    for (const t of g.tips){
      const n = g.nodes[t.node];
      for (let dx=-3;dx<=3;dx++) for (let dz=-3;dz<=3;dz++) for (let dy=-1;dy<=4;dy++){
        const x = n.x+dx, y = n.y+dy, z = n.z+dz, k = x+','+y+','+z;
        if (seen.has(k)) continue; seen.add(k);
        if (!blocked(g, x, y, z) && lit(g, x, y, z)) pts.push(x*C, y*C, z*C);
      }
    }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const P = new THREE.Points(pg, MAT.lightPts); P.renderOrder = 8; markers.add(P);
  }
}
function pickAt(cx, cy){
  const rect = canvas.getBoundingClientRect();
  let best = null, bd = 46;
  for (const pk of pickables){
    const s = pk.p.clone().project(camera);
    if (s.z > 1) continue;
    const x = (s.x*0.5+0.5)*rect.width, y = (-s.y*0.5+0.5)*rect.height;
    const dd = Math.hypot(x - cx, y - cy);
    if (dd < bd){ bd = dd; best = pk; }
  }
  return best;
}
let down = null;
canvas.addEventListener('pointerdown', e => { down = {x:e.clientX, y:e.clientY, t:performance.now()}; });
canvas.addEventListener('pointerup', e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX-down.x, e.clientY-down.y), dt = performance.now()-down.t;
  down = null;
  if (moved > 10 || dt > 600 || !sel) return;
  const pk = pickAt(e.clientX, e.clientY);
  if (!pk){ toast(promptText() , 'warn'); return; }
  const c = CARDS[sel.card];
  if (sel.step === 0 && c.then){ sel.step = 1; sel.t = pk.id; render(); return; }
  doPlay(sel.step === 0 ? {i:sel.i, t:pk.id} : {i:sel.i, t:sel.t, t2:pk.id});
});

// ---------- game state, saving ----------
const RUN_KEY = 'bonzai.v0.run', META_KEY = 'bonzai.v0.meta';
let meta = store.get(META_KEY) || {best:0, gallery:[], seen:false};
let g, sel = null;

function startRun(seed, log=[]){
  g = log.length ? replay(seed, log) : newGame(seed);
  sel = null;
  resetWorld();
  hours = hoursTo = CFG.START_HOUR + g.turn*24/CFG.TURNS_PER_DAY;
  render(true);
  save();
}
function save(){ store.set(RUN_KEY, {seed:g.seed, log:g.log}); }
function newSeed(){ return 1 + Math.floor(Math.random()*999999); }

function doPlay(a){
  const ok = play(g, a);
  if (!ok){ toast("That card can't be played there.", 'warn'); return; }
  sel = null;
  hoursTo = CFG.START_HOUR + g.turn*24/CFG.TURNS_PER_DAY;
  save();
  for (const e of g.events) eventToast(e);
  if (g.over) finishRun();
  render();
}
function finishRun(){
  const h = peakM(g);
  const isBest = h > meta.best;
  meta.best = Math.max(meta.best, h);
  let note = isBest ? 'A new best height.' : '';
  if (h >= CFG.GALLERY_M && !meta.gallery.some(x => x.seed === g.seed)){
    meta.gallery.unshift({seed:g.seed, log:g.log, h, turns:g.turn, blend:g.blend, date:new Date().toISOString().slice(0,10)});
    meta.gallery = meta.gallery.slice(0, 40);
    note += (note ? ' ' : '') + 'This tree was added to the gallery.';
  } else if (h < CFG.GALLERY_M) note += (note ? ' ' : '') + `Trees taller than ${CFG.GALLERY_M} m go into the gallery.`;
  store.set(META_KEY, meta);
  $('o-h').textContent = h + ' m'; $('o-t').textContent = g.turn; $('o-b').textContent = meta.best + ' m';
  $('o-note').textContent = note;
  setTimeout(() => { $('over').hidden = false; }, 900);
}

// ---------- interface ----------
const CARD_COLOR = {water:'#5ab4ff', prune:'#ff8a5a', root:'#c08a4a', bend:'#b48cff', tether:'#9aa3ad', lantern:'#ffd166', moon:'#8fa8ff', shears:'#ff5a4a'};
function promptText(){
  if (!sel) return '';
  const mode = sel.step === 0 ? CARDS[sel.card].target : CARDS[sel.card].then;
  return {tip:'Tap a tip', wood: sel.card === 'shears' ? 'Tap where to cut' : 'Tap a branch to cut', bud:'Tap old wood to sprout from',
    dir:'Tap a direction', anchor:'Tap an iron ring'}[mode] || '';
}
function blockedReason(i){
  const card = g.hand[i];
  if (g.hand.includes('shears') && card !== 'shears') return 'Play the Shears first: you must cut this turn.';
  if (card === 'moon' && isDay(g.turn)) return 'Moonbloom only works at night.';
  return 'Nothing to play this card on right now.';
}
function renderHand(){
  const el = $('hand'); el.textContent = '';
  g.hand.forEach((card, i) => {
    const c = CARDS[card], b = document.createElement('button');
    b.type = 'button'; b.className = 'card' + (c.forced ? ' forced' : '');
    b.style.setProperty('--stripe', CARD_COLOR[card]);
    b.setAttribute('aria-pressed', String(!!sel && sel.i === i));
    const can = playable(g, i);
    b.setAttribute('aria-disabled', String(!can));
    b.innerHTML = `<span class="n"></span><span class="t"></span>`;
    b.querySelector('.n').textContent = c.name; b.querySelector('.t').textContent = c.text;
    b.addEventListener('click', () => {
      if (g.over) return;
      if (sel && sel.i === i){ sel = null; render(); return; }
      if (!can){ toast(blockedReason(i), 'warn'); return; }
      if (!c.target){ doPlay({i}); return; }
      sel = {i, card, step:0, t:null};
      render();
    });
    el.appendChild(b);
  });
  const canDiscard = !!sel && !(sel.card === 'shears' && playable(g, sel.i));
  $('discard').disabled = !canDiscard;
}
function renderHud(){
  const h = +(g.maxY*C).toFixed(1);
  $('h').textContent = h.toFixed(1) + ' m';
  $('hsub').textContent = `Band ${stratumOf(g.maxY)+1} · best ${Math.max(meta.best, peakM(g)).toFixed(1)} m`;
  const stuck = g.tips.filter(t => t.stalled).length;
  $('tipsinfo').textContent = `${g.tips.length} tip${g.tips.length===1?'':'s'}` + (stuck ? ` · ${stuck} stuck` : '');
  const hr = hourOf(g.turn), hh = String(Math.floor(hr)).padStart(2,'0');
  $('clock').textContent = `Day ${dayOf(g.turn)} · ${hh}:00 · ${isDay(g.turn) ? 'Day' : 'Night'} · turn ${g.turn+1}`;
  $('sapv').textContent = g.sap;
  $('sapbar').style.width = (g.sap/CFG.SAP_MAX*100) + '%';
  $('flow').textContent = `+${income(g)} −${upkeep(g)}`;
  const pr = promptText();
  $('prompt').hidden = !pr; $('prompttext').textContent = pr;
}
function render(first=false){
  tipAtNode = new Set(g.tips.map(t => t.node));
  syncWorld();
  buildTree();
  refreshMarkers();
  renderHand();
  renderHud();
  if (first) applyTime();
}

const MSG = {
  stall:['A tip hit stone and is stuck.', 'warn'], wilting:['A stuck tip will wither next turn.', 'bad'], wither:['A tip withered.', 'bad'],
  starve:['Not enough sap: some tips could not grow.', 'warn'], hungry:['A hungry tip will die soon. Get it into light.', 'bad'],
  weak:['Not enough sap to keep the wood alive. Every tip weakens.', 'bad'],
  sag:['A long branch is sagging. Tether it to an iron ring.', 'warn'], tied:[`Tied to the ring. +${CFG.TETHER_SAP} sap.`, 'good'],
  rock:['A rock fell into the shaft.', 'warn'], dawn:['Dawn. Tips in light earn sap again.', 'good'],
  dusk:['Night. Only roots, Lanterns and Moonbloom feed the tree.', ''], stuck:['No tip can grow! Free one this turn or the tree stops.', 'bad'],
  last:['Only one tip can still grow.', 'warn'],
};
function eventToast(e){
  if (e.type === 'cut') return toast(`Cut ${e.n} cell${e.n===1?'':'s'}.`, '');
  if (e.type === 'stratum') return toast(`Band ${e.s+1}. The ruins grow darker and tighter.`, 'good');
  const m = MSG[e.type]; if (m) toast(m[0], m[1]);
}
const recent = new Map();
function toast(text, kind=''){
  if (!text) return;
  const now = performance.now();
  if (recent.get(text) > now - 1500) return;
  recent.set(text, now);
  const box = $('toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text;
  box.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3600);
  setTimeout(() => t.remove(), 4200);
}

$('cancel').addEventListener('click', () => { sel = null; render(); });
$('discard').addEventListener('click', () => { if (sel) doPlay({i:sel.i, discard:true}); });
$('lightbtn').addEventListener('click', () => { showLight = !showLight; $('lightbtn').setAttribute('aria-pressed', String(showLight)); refreshMarkers(); });
$('menu').addEventListener('click', () => {
  $('runinfo').textContent = `Tree ${g.seed} · ${STYLES.map((s,i) => `${s} ${Math.round(g.blend[i]*100)}%`).join(' · ')}`;
  const gl = $('gallery'); gl.textContent = '';
  if (!meta.gallery.length) gl.textContent = `No trees yet. Trees that reach ${CFG.GALLERY_M} m are kept here.`;
  for (const x of meta.gallery){ const r = document.createElement('div'); r.textContent = `${x.h.toFixed(1)} m · ${x.turns} turns · tree ${x.seed} · ${x.date}`; gl.appendChild(r); }
  $('confirmnew').hidden = true;
  $('menusheet').hidden = false;
});
$('m-close').addEventListener('click', () => { $('menusheet').hidden = true; });
$('m-help').addEventListener('click', () => { $('menusheet').hidden = true; $('help').hidden = false; });
$('m-glow').addEventListener('click', () => { bloomOn = !bloomOn; $('m-glow').setAttribute('aria-pressed', String(bloomOn)); applyTime(); });
$('m-new').addEventListener('click', () => { $('confirmnew').hidden = false; });
$('m-new-no').addEventListener('click', () => { $('confirmnew').hidden = true; });
$('m-new-yes').addEventListener('click', () => { $('menusheet').hidden = true; startRun(newSeed()); });
$('helpok').addEventListener('click', () => { $('help').hidden = true; meta.seen = true; store.set(META_KEY, meta); });
$('o-new').addEventListener('click', () => { $('over').hidden = true; startRun(newSeed()); });
$('o-look').addEventListener('click', () => { $('over').hidden = true; });

// ---------- camera follow, cut-away, loop ----------
const camDir = new THREE.Vector2();
function updateCutaway(dt){
  camDir.set(camera.position.x, camera.position.z);
  const dist = camDir.length(); camDir.normalize();
  const cy = camera.position.y;
  for (const s of world.segs){
    const sy = s.group.position.y;
    const near = cy > sy - 4 && cy < sy + 10;
    const target = (dist > IR - 0.4 && s.dir.dot(camDir) > 0.45) ? 0 : 1;
    s.op += (target - s.op)*Math.min(1, dt*7);
    s.group.visible = near || s.op > 0.02;
    for (const m of s.mats){ m.opacity = s.op; m.colorWrite = s.op > 0.02; }
  }
}
// The camera follows the highest growing tips: up, and sideways when they climb a wall.
const focusV = new THREE.Vector3(0, 1.2, 0);
function focusPoint(){
  let top = 0; for (const t of g.tips) top = Math.max(top, g.nodes[t.node].y);
  const acc = new THREE.Vector3(); let n = 0;
  for (const t of g.tips){ const p = g.nodes[t.node]; if (p.y >= top - 6){ acc.add(V(p.x*C*0.7, p.y*C, p.z*C*0.7)); n++; } }
  if (!n) acc.set(0, g.maxY*C, 0); else acc.multiplyScalar(1/n);
  acc.y = Math.max(1.2, acc.y - 0.2);
  return focusV.copy(acc);
}
function resize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w/2, h/2);
  camera.aspect = w/h;
  camera.fov = clamp(2*Math.atan(Math.tan(22*Math.PI/180)/camera.aspect)*180/Math.PI, 45, 75);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const clock = new THREE.Clock();
let first = true;
function frame(){
  const raw = clock.getDelta(), dt = Math.min(0.05, raw);
  timeU.value += dt;
  if (Math.abs(hoursTo - hours) > 0.001){ hours += (hoursTo - hours)*Math.min(1, raw*2.5); }
  applyTime();
  const delta = focusPoint().clone().sub(controls.target).multiplyScalar(Math.min(1, raw*2.2));
  controls.target.add(delta); camera.position.add(delta);
  sun.target.position.set(0, controls.target.y + 1, 0);
  sky.position.copy(camera.position);
  const t = timeU.value;
  for (let i=0;i<MOTES;i++){
    const [a, r, y, ph, sp] = moteSeed[i], aa = a + t*0.05*sp;
    motePos[i*3] = Math.cos(aa)*r + Math.sin(t*0.7*sp+ph)*0.15;
    motePos[i*3+1] = controls.target.y + y + Math.sin(t*0.5*sp+ph*2)*0.25;
    motePos[i*3+2] = Math.sin(aa)*r + Math.cos(t*0.6*sp+ph)*0.15;
  }
  moteGeo.attributes.position.needsUpdate = true;
  magic.position.copy(controls.target).add(V(0, 0.2, 0.4));
  controls.update();
  cutU.cam.value.copy(camera.position); cutU.focus.value.copy(controls.target);
  updateCutaway(Math.min(0.25, raw));
  composer.render();
  if (first){ first = false; $('msg').hidden = true; }
  requestAnimationFrame(frame);
}

// ---------- boot ----------
resize();
const saved = store.get(RUN_KEY);
try { startRun(saved?.seed ?? newSeed(), saved?.log ?? []); }
catch (e) { console.error(e); startRun(newSeed()); }
if (!meta.seen) $('help').hidden = false;
if (g.over) finishRun();
// console handle for testing and tuning: bonzai.g is the live game state
window.bonzai = { get g(){ return g; }, play: doPlay, CFG, camera, controls, get tree(){ return treeGroup; }, get world(){ return world; } };
requestAnimationFrame(frame);
