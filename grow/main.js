// Bonzai prototype v2: renders grow/sim.js. One forced card per turn (Cut, Pinch, Wire), then the whole tree grows, animated.
// The camera follows the growth; tap a branch to ride it, swipe to travel along it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GCFG, STYLES, CARDS, SPECIES, cardText, newGame, replayGame, play, planTurn, targets, canDiscard, shootById, previewAction, score, avgHealth, hourOf, dayOf, isDay, mulberry32, hashInt, waterMap } from './sim.js';

const $ = id => document.getElementById(id);
const TAU = Math.PI*2;
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
renderer.shadowMap.type = THREE.VSMShadowMap; // soft shadow edges: hard shadow lines on round branches read as flat cut faces
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.03, 300);
scene.add(camera);

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
      let r = lerp(72, 182, v) + fine*40, g = lerp(56, 154, v) + fine*30, b = lerp(46, 128, v) + fine*25;
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
// temple fig leaf: heart-shaped blade with a long drip tip, on a slender stalk (the stalk sits at the bottom of the texture)
const leafTex = canvasTex(64, 128, (g,w) => {
  const grad = g.createLinearGradient(0,0,w,0);
  grad.addColorStop(0,'#d2d2d2'); grad.addColorStop(0.5,'#ffffff'); grad.addColorStop(1,'#cbcbcb');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(32,100);
  g.bezierCurveTo(44,110, 64,96, 60,72); g.bezierCurveTo(57,50, 42,36, 35,22); g.lineTo(32,2);
  g.lineTo(29,22); g.bezierCurveTo(22,36, 7,50, 4,72); g.bezierCurveTo(0,96, 20,110, 32,100);
  g.fill();
  g.strokeStyle = '#bdbdbd'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(32,128); g.lineTo(32,98); g.stroke();
  g.strokeStyle = 'rgba(120,120,120,0.7)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(32,100); g.lineTo(32,14); g.stroke();
  g.lineWidth = 1;
  for (let y=40;y<96;y+=12){ const k = (y-40)/56; g.beginPath(); g.moveTo(32,y+8); g.quadraticCurveTo(32-14-8*k,y+2,32-20-10*k,y-6); g.moveTo(32,y+8); g.quadraticCurveTo(32+14+8*k,y+2,32+20+10*k,y-6); g.stroke(); }
}, false);
// juniper: a flat spray of scale foliage, branching like a fern, fanning out from a short stem
const juniperTex = canvasTex(64, 128, (c) => {
  const R = mulberry32(12);
  const spray = (x, y, ang, len, w, depth) => {
    const ex = x + Math.sin(ang)*len, ey = y - Math.cos(ang)*len;
    for (let t=0; t<=1; t+=0.06){
      const px = x + (ex - x)*t, py = y + (ey - y)*t, r = w*(1 - t*0.6);
      c.fillStyle = t > 0.7 ? '#ffffff' : '#e8e8e8';
      c.beginPath(); c.ellipse(px, py, r, r*1.4, ang, 0, TAU); c.fill();
    }
    if (depth > 0) for (let k=1;k<=4;k++){
      const t = k/5, sx = x + (ex - x)*t, sy = y + (ey - y)*t, side = k % 2 ? 1 : -1;
      spray(sx, sy, ang + side*(0.7 + R()*0.3), len*(0.5 - t*0.25), w*0.8, depth - 1);
    }
  };
  c.strokeStyle = '#bdbdbd'; c.lineWidth = 3; c.beginPath(); c.moveTo(32, 128); c.lineTo(32, 104); c.stroke();
  spray(32, 106, 0, 96, 4, 2);
}, false);
const groundTex = canvasTex(512, 512, (g,w,h) => {
  const R = mulberry32(31);
  g.fillStyle = '#4a4232'; g.fillRect(0,0,w,h);
  for (let i=0;i<2600;i++){
    const c = [[92,74,46],[80,96,48],[120,100,66],[56,76,36],[140,110,66]][(R()*5)|0];
    g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.35+R()*0.5})`;
    g.beginPath(); g.ellipse(R()*w, R()*h, 2+R()*6, 1+R()*3, R()*3, 0, TAU); g.fill();
  }
});
groundTex.repeat.set(16,16);
const spriteTex = canvasTex(64, 64, (g) => {
  const rg = g.createRadialGradient(32,32,0,32,32,32);
  rg.addColorStop(0,'rgba(255,255,255,1)'); rg.addColorStop(0.25,'rgba(255,255,255,0.6)'); rg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0,0,64,64);
}, false);
function makeStoneTex(w3, R){
  return canvasTex(512, 512, (g,w,h) => {
    g.fillStyle = '#c9c2b5'; g.fillRect(0,0,w,h);
    for (let i=0;i<9000;i++){
      g.fillStyle = R() < 0.5 ? `rgba(70,62,55,${R()*0.1})` : `rgba(250,245,235,${R()*0.1})`;
      g.fillRect(R()*w, R()*h, 1+R()*3, 1+R()*3);
    }
    for (let r=0;r<8;r++){
      const off = (r%2)*64;
      for (let x=-off; x<w; x+=128){
        g.fillStyle = `rgba(${R()<.5?60:220},${R()<.5?55:210},${R()<.5?50:195},${R()*0.08})`;
        g.fillRect(x+2, r*64+2, 124, 60);
        g.fillStyle = 'rgba(45,38,32,0.4)'; g.fillRect(x, r*64, 2, 64);
      }
      g.fillStyle = 'rgba(45,38,32,0.45)'; g.fillRect(0, r*64, w, 2);
    }
    const pick = () => { const u = R(); return u < w3[0] ? 0 : u < w3[0]+w3[1] ? 1 : 2; };
    for (const by of [64, 320]){
      const m = pick();
      if (m===1){
        for (let x=8; x<w; x+=32){
          g.strokeStyle = 'rgba(55,45,38,0.5)'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(x, by+56); g.quadraticCurveTo(x+16, by+8, x+32, by+56); g.stroke();
          g.strokeStyle = 'rgba(245,235,215,0.3)';
          g.beginPath(); g.moveTo(x+4, by+56); g.quadraticCurveTo(x+16, by+18, x+28, by+56); g.stroke();
        }
      } else if (m===2){
        for (let x=10; x<w; x+=64){
          g.fillStyle = 'rgba(60,50,44,0.3)';
          g.beginPath(); g.roundRect ? g.roundRect(x, by+6, 50, 50, 12) : g.rect(x, by+6, 50, 50); g.fill();
          g.fillStyle = 'rgba(240,230,210,0.35)';
          g.beginPath(); g.arc(x+18, by+22, 7, 0, TAU); g.arc(x+34, by+38, 5, 0, TAU); g.fill();
          g.fillRect(x+10, by+44, 30, 4);
        }
      } else {
        for (let x=28; x<w; x+=56){
          g.strokeStyle = 'rgba(55,60,58,0.45)'; g.lineWidth = 2;
          g.beginPath();
          for (let t=0;t<14;t+=0.1){ const r = 2 + t*1.6; const px = x + Math.cos(t)*r, py = by+32 + Math.sin(t)*r; t===0 ? g.moveTo(px,py) : g.lineTo(px,py); }
          g.stroke();
        }
      }
    }
    for (let i=0;i<Math.round(w3[2]*40);i++){ g.fillStyle = `rgba(176,52,40,${0.1+R()*0.18})`; g.beginPath(); g.ellipse(R()*w, R()*h, 10+R()*40, 8+R()*30, R()*3, 0, TAU); g.fill(); }
    for (let i=0;i<Math.round(w3[0]*40);i++){ g.fillStyle = `rgba(70,150,140,${0.08+R()*0.16})`; g.beginPath(); g.ellipse(R()*w, R()*h, 10+R()*40, 8+R()*30, R()*3, 0, TAU); g.fill(); }
  });
}

// ---------- materials ----------
const barkMat = new THREE.MeshStandardMaterial({map:bark.map, bumpMap:bark.bump, bumpScale:1.6, roughness:0.9, emissiveMap:bark.veins, emissive:0xffffff, emissiveIntensity:0});
const groundMat = new THREE.MeshStandardMaterial({map:groundTex, roughness:1});
let vineMat = new THREE.MeshStandardMaterial({color:0x40502c, roughness:0.8});
const timeU = {value:0}, animU = {value:1e4}, windU = {value:0};  // windU: gust strength 0..1
const leafMat = new THREE.MeshStandardMaterial({map:leafTex, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.7, metalness:0});
leafMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = timeU; sh.uniforms.uAnim = animU; sh.uniforms.uWind = windU;
  sh.vertexShader = 'uniform float uTime; uniform float uAnim; uniform float uWind; attribute float aStart;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed *= smoothstep(aStart, aStart + 0.45, uAnim);
  #ifdef USE_INSTANCING
    vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float sw = sin(uTime*1.7 + ip.x*2.3 + ip.z*1.9)*0.6 + sin(uTime*3.1 + ip.y*4.1 + ip.x)*0.4;
    float fl = 0.07 + 0.11*uWind;  // long-stalked fig leaves flutter, more in a gust
    transformed.x += sw*fl*position.y;
    transformed.z += sw*fl*0.7*position.y;
  #endif`);
};
const leafDepth = new THREE.MeshDepthMaterial({map:leafTex, alphaTest:0.5, depthPacking:THREE.RGBADepthPacking});
leafDepth.onBeforeCompile = sh => {
  sh.uniforms.uAnim = animU;
  sh.vertexShader = 'uniform float uAnim; attribute float aStart;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed *= smoothstep(aStart, aStart + 0.45, uAnim);');
};
// The whole tree sways as one: a smooth displacement field in world space, so wood, leaves and figs stay joined.
// Zero at the root flare, growing with height; a slow wave travels up the tree.
const SWAY_GLSL = `
vec3 treeSway(vec3 p){
  float h = smoothstep(0.3, 2.2, p.y);
  float a = sin(uTime*0.8 + p.y*0.35) + 0.5*sin(uTime*1.9 + p.y*0.9 + 1.3);
  float b = sin(uTime*0.65 + p.y*0.3 + 2.1) + 0.4*sin(uTime*2.3 + p.y*1.1);
  return vec3(a, 0.0, b)*(0.005 + 0.016*uWind)*h;
}
`;
function addSway(mat, key){
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uTime = timeU; sh.uniforms.uWind = windU;
    let v = sh.vertexShader;
    if (!v.includes('uniform float uTime;')) v = 'uniform float uTime;\n' + v;
    if (!v.includes('uniform float uWind;')) v = 'uniform float uWind;\n' + v;
    sh.vertexShader = v.replace('void main() {', SWAY_GLSL + 'void main() {').replace('#include <project_vertex>', `
  vec4 swP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    swP = instanceMatrix*swP;
  #endif
  swP = modelMatrix*swP;
  swP.xyz += treeSway(swP.xyz);
  vec4 mvPosition = viewMatrix*swP;
  gl_Position = projectionMatrix*mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'sway-' + key;
  return mat;
}
addSway(barkMat, 'bark'); addSway(leafMat, 'leaf');
const bloomMat = addSway(new THREE.MeshStandardMaterial({color:0xffffff, emissive:0xff3d8b, emissiveIntensity:0, roughness:0.45}), 'fig');  // figs; they glow faintly at night
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

// Stone between the camera and what it looks at is cut away. For ruins, whole blocks vanish (decided by each block's
// centre), so what remains is always solid stone with a crumbled edge; small iron pieces are cut per pixel.
const cutU = {cam:{value:new THREE.Vector3()}, focus:{value:new THREE.Vector3()}, r:{value:1.25}};
function addCutaway(mat, perBlock=false){
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCam = cutU.cam; sh.uniforms.uFocus = cutU.focus; sh.uniforms.uCutR = cutU.r;
    sh.vertexShader = (perBlock ? 'attribute vec3 aCenter;\n' : '') + 'varying vec3 vCutW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vCutW = ' + (perBlock ? 'aCenter' : '(modelMatrix*vec4(transformed,1.0)).xyz') + ';');
    sh.fragmentShader = 'uniform vec3 uCam; uniform vec3 uFocus; uniform float uCutR; varying vec3 vCutW;\n' + sh.fragmentShader.replace('void main() {', `void main() {
      vec3 ab = uFocus - uCam; float tt = dot(vCutW - uCam, ab)/dot(ab, ab);
      if (tt > -0.2 && tt < 0.93){
        float d = length(vCutW - (uCam + ab*clamp(tt, 0.0, 1.0)));
        float rr = uCutR*(0.75 + 0.5*clamp(tt, 0.0, 1.0));
        if (d < rr) discard;
      }`);
  };
  return mat;
}

addCutaway(vineMat);

// ---------- geometry helpers ----------
function sampleRad(rad, u){ const f = u*(rad.length-1), i = Math.min(rad.length-2, Math.floor(f)); return lerp(rad[i], rad[i+1], f-i); }
function tubeGeo(pts, rad, radial, o={}){
  const knob = o.knob ?? 0.07, knobF = o.knobF ?? 6, flutes = o.flutes ?? 0, fluteAmp = o.fluteAmp ?? 0;
  const fluteFade = o.fluteFade ?? 0.3, twist = o.twist ?? 0, phase = o.phase ?? 0;
  // o.arc: only a strip of the surface, {a0, width, from, to}, spiralling with the twist and raised slightly (shari)
  const arc = o.arc;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const L = curve.getLength();
  const seg = Math.max(2, Math.ceil(L*(o.density ?? 16)));
  const fr = curve.computeFrenetFrames(seg, false);
  const pos = [], uv = [], idx = [];
  const P = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i=0;i<=seg;i++){
    const u = i/seg;
    curve.getPointAt(u, P);
    const r = sampleRad(rad, u);
    const fl = fluteAmp*Math.pow(Math.max(0, 1-u/fluteFade), 1.4);
    for (let j=0;j<=radial;j++){
      const a = arc ? arc.a0 + twist*u*TAU + (j/radial - 0.5)*arc.width : j/radial*TAU, ca = Math.cos(a), sa = Math.sin(a);
      n.copy(fr.normals[i]).multiplyScalar(ca).addScaledVector(fr.binormals[i], sa).normalize();
      let k = 1 + knob*(vnoise(P.x*knobF+ca*0.8+phase, P.y*knobF, P.z*knobF+sa*0.8)-0.5)*2;
      if (fl > 0) k += fl*Math.pow(Math.max(0, Math.sin(flutes*a + twist*u*TAU + phase)), 2);
      if (arc) k *= u < arc.from || u > arc.to ? 0.9 : 1.012 - 0.03*Math.pow(Math.abs(j/radial - 0.5)*2, 4);
      pos.push(P.x+n.x*r*k, P.y+n.y*r*k, P.z+n.z*r*k);
      uv.push(j/radial*(o.uRep ?? 2) + twist*u*(o.uRep ?? 2), u*L*(o.vScale ?? 0.9));  // bark grain follows the twist
    }
  }
  for (let i=0;i<seg;i++) for (let j=0;j<radial;j++){ const a = i*(radial+1)+j, b = a+radial+1; idx.push(a, a+1, b, b, a+1, b+1); }
  // close both ends with short rounded caps, so a tube is never seen hollow
  const cap = (atStart) => {
    const i0 = atStart ? 0 : seg, T = fr.tangents[i0].clone().multiplyScalar(atStart ? -1 : 1);
    const c = new THREE.Vector3(); curve.getPointAt(atStart ? 0 : 1, c);
    const rEnd = sampleRad(rad, atStart ? 0 : 1);
    let prev = i0*(radial+1);
    for (let k=1;k<=3;k++){
      const a = k/3*Math.PI/2, rr = Math.max(Math.cos(a), 0.001)*rEnd, off = Math.sin(a)*rEnd*0.9;
      const start = pos.length/3;
      for (let j=0;j<=radial;j++){
        const t = j/radial*TAU;
        n.copy(fr.normals[i0]).multiplyScalar(Math.cos(t)).addScaledVector(fr.binormals[i0], Math.sin(t)).normalize();
        pos.push(c.x + n.x*rr + T.x*off, c.y + n.y*rr + T.y*off, c.z + n.z*rr + T.z*off);
        uv.push(j/radial*(o.uRep ?? 2), (atStart ? -off : L*(o.vScale ?? 0.9) + off));
      }
      for (let j=0;j<radial;j++){
        if (atStart) idx.push(start+j, start+j+1, prev+j, prev+j, start+j+1, prev+j+1);
        else idx.push(prev+j, prev+j+1, start+j, start+j, prev+j+1, start+j+1);
      }
      prev = start;
    }
  };
  if (o.cap !== false && !arc){ cap(false); if (o.capStart !== false) cap(true); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nr = g.attributes.normal;
  if (!arc) for (let i=0;i<=seg;i++){
    const a = i*(radial+1), b = a+radial;
    const x = nr.getX(a)+nr.getX(b), y = nr.getY(a)+nr.getY(b), z = nr.getZ(a)+nr.getZ(b), l = Math.hypot(x,y,z)||1;
    nr.setXYZ(a, x/l, y/l, z/l); nr.setXYZ(b, x/l, y/l, z/l);
  }
  return g;
}
const MOSS = new THREE.Color(0x5f7d33), RED = new THREE.Color(1.0, 0.66, 0.58);
function weather(geo, seed, mossAmt=1, tint=null){
  geo = geo.index ? geo.toNonIndexed() : geo;
  const p = geo.attributes.position, n0 = geo.attributes.normal, cols = [];
  const tmp = new THREE.Color();
  for (let i=0;i<p.count;i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), s = 2.6;
    p.setXYZ(i, x+(vnoise(x*s+seed,y*s,z*s)-0.5)*0.035, y+(vnoise(x*s,y*s+seed,z*s)-0.5)*0.035, z+(vnoise(x*s,y*s,z*s+seed)-0.5)*0.035);
    const m = clamp((n0.getY(i)-0.3)*1.6,0,1) * clamp((vnoise(x*3+seed,y*3,z*3)-0.35)*2.5,0,1) * mossAmt;
    const v = 0.85 + vnoise(x*1.5,y*1.5+seed,z*1.5)*0.25;
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
const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), skyMat); scene.add(sky);
const hemi = new THREE.HemisphereLight(0xffffff, 0x333322, 0.6); scene.add(hemi);
const amb = new THREE.AmbientLight(0xfff1dc, 0.25); scene.add(amb);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera, {left:-4.5, right:4.5, top:5.5, bottom:-5.5, near:0.5, far:40});
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 9; sun.shadow.blurSamples = 16;
scene.add(sun); scene.add(sun.target);
const fill = new THREE.PointLight(0xb8c8ff, 0, 12, 1); fill.position.set(0, 0.5, 0); camera.add(fill);
const magic = new THREE.PointLight(0xffffff, 0, 7, 1); scene.add(magic);
scene.fog = new THREE.FogExp2(0x000000, 0.025);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200), groundMat);
ground.rotation.x = -Math.PI/2; ground.position.y = -0.75; ground.receiveShadow = true; scene.add(ground);

const MOTES = 160, motePos = new Float32Array(MOTES*3), moteSeed = [];
{ const R = mulberry32(9); for (let i=0;i<MOTES;i++) moteSeed.push([R()*TAU, 0.3+R()*1.8, -1.2+R()*3, R()*TAU, 0.3+R()*0.7]); }
const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos,3));
const moteMat = new THREE.PointsMaterial({map:spriteTex, size:0.035, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, color:0xffffff, toneMapped:false});
const motes = new THREE.Points(moteGeo, moteMat); motes.frustumCulled = false; scene.add(motes);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256,256), 0.4, 0.55, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- day / night: brighter than before; shade stays readable ----------
const KEYS = [
  {el:-0.45, top:0x0b1430, hor:0x24386a, bottom:0x0c1018, fog:0x1a2a48, light:0xa4b8ff, li:1.1, hs:0x5674b8, hg:0x1e2430, hi:1.15, amb:0.35, exp:1.45, glow:1, stars:1, bloom:0.65, fill:1.6},
  {el:-0.12, top:0x232c5e, hor:0x7a6a9a, bottom:0x1a1822, fog:0x4a4668, light:0x9aa0ff, li:0.5, hs:0x7080b8, hg:0x24222a, hi:1.0, amb:0.35, exp:1.3, glow:0.6, stars:0.35, bloom:0.55, fill:0.9},
  {el:0.02, top:0x3a4c92, hor:0xffa066, bottom:0x3a2c22, fog:0xc08c78, light:0xff9a5a, li:2.0, hs:0x9a8ab0, hg:0x4a3a2c, hi:0.85, amb:0.3, exp:1.15, glow:0.12, stars:0, bloom:0.45, fill:0.25},
  {el:0.22, top:0x5284c8, hor:0xffdcaa, bottom:0x4a4232, fog:0xd6c4a8, light:0xffd8ac, li:3.0, hs:0xa8c4e8, hg:0x5a4a34, hi:0.95, amb:0.28, exp:1.1, glow:0, stars:0, bloom:0.32, fill:0},
  {el:0.8, top:0x3274cc, hor:0xc8e6f2, bottom:0x4c4c3a, fog:0xc0d6de, light:0xfff6e6, li:3.3, hs:0xc0dcff, hg:0x5a5a3c, hi:1.0, amb:0.25, exp:1.05, glow:0, stars:0, bloom:0.26, fill:0},
];
const cA = new THREE.Color(), cB = new THREE.Color();
const lerpHex = (a, b, t, out) => { cA.set(a); cB.set(b); return out.copy(cA).lerp(cB, t); };
function palette(el){
  let i = 0; while (i < KEYS.length-2 && el > KEYS[i+1].el) i++;
  const a = KEYS[i], b = KEYS[i+1], t = clamp((el-a.el)/(b.el-a.el), 0, 1);
  return {a, b, t, n:k => lerp(a[k], b[k], t)};
}
const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), MOTE_DAY = new THREE.Color(0xffe6bf);
let hours = GCFG.START_HOUR, hoursTo = hours, nightK = 0;
// weather (visual only): rainK and mistK ease toward targets set by the turn; wetK lags rain and dries slowly
let rainK = 0, mistK = 0, wetK = 0;
const RAIN_GREY = new THREE.Color(0x8a949c), RAIN_GREY_NIGHT = new THREE.Color(0x1c2228);
function applyTime(){
  const tod = hours/24, ang = (tod-0.25)*TAU;
  const el = Math.asin(Math.sin(ang)*Math.sin(1.15));
  const az = GCFG.SUN_AZ0 + (hours-6)/12*Math.PI;
  sunDir.set(Math.cos(el)*Math.cos(az), Math.sin(el), Math.cos(el)*Math.sin(az));
  moonDir.set(-sunDir.x, Math.max(0.35, -sunDir.y), -sunDir.z).normalize();
  const p = palette(el), u = skyMat.uniforms;
  lerpHex(p.a.top, p.b.top, p.t, u.top.value); lerpHex(p.a.hor, p.b.hor, p.t, u.hor.value);
  lerpHex(p.a.bottom, p.b.bottom, p.t, u.bottom.value); lerpHex(p.a.light, p.b.light, p.t, u.sunCol.value);
  u.sunDir.value.copy(sunDir); u.moonDir.value.copy(moonDir);
  u.sunVis.value = clamp((el+0.06)*8, 0, 1); u.moonVis.value = clamp((-el-0.05)*6, 0, 1); u.stars.value = p.n('stars');
  lerpHex(p.a.fog, p.b.fog, p.t, scene.fog.color);
  if (rainK > 0.001){
    const grey = RAIN_GREY.clone().lerp(RAIN_GREY_NIGHT, nightK);
    u.top.value.lerp(grey, rainK*0.7); u.hor.value.lerp(grey, rainK*0.6); scene.fog.color.lerp(grey, rainK*0.6);
  }
  scene.fog.density = 0.025 + 0.03*mistK;
  const useSun = el > -0.06;
  sun.position.copy(useSun ? sunDir : moonDir).multiplyScalar(18).add(sun.target.position);
  lerpHex(p.a.light, p.b.light, p.t, sun.color);
  sun.intensity = p.n('li') * (useSun ? clamp((el+0.06)*10, 0, 1) : clamp((-el-0.06)*8, 0, 1)) * (1 - 0.6*rainK);
  u.sunVis.value *= 1 - rainK; u.moonVis.value *= 1 - rainK; u.stars.value *= 1 - rainK;
  if (world.stoneMat){ world.stoneMat.roughness = 0.95 - 0.4*wetK; world.stoneMat.color.copy(world.stoneBase).multiplyScalar(1 - 0.18*wetK); }
  leafMat.roughness = 0.7 - 0.3*wetK;
  const dayLight = (useSun ? clamp(el*5, 0, 1) : 0)*(1 - rainK);
  lerpHex(p.a.hs, p.b.hs, p.t, hemi.color); lerpHex(p.a.hg, p.b.hg, p.t, hemi.groundColor);
  hemi.intensity = p.n('hi'); amb.intensity = p.n('amb');
  renderer.toneMappingExposure = p.n('exp');
  const glow = p.n('glow'); nightK = glow;
  fill.intensity = p.n('fill');
  bloomMat.emissiveIntensity = glow*1.6;
  barkMat.emissiveIntensity = glow*0.5;
  magic.color.copy(world.glow); magic.intensity = glow*1.3;
  if (world.glowMat) world.glowMat.emissiveIntensity = 0.25 + glow*0.45;
  moteMat.color.copy(MOTE_DAY).lerp(world.glow, glow);
  moteMat.opacity = 0.25 + glow*0.3; moteMat.size = 0.022 + glow*0.006;
  for (const b of world.beams){
    const o = clamp(b.n.dot(sunDir)*1.6 + 0.1, 0, 1) * dayLight * 0.24;
    b.mat.uniforms.opacity.value = o; b.mat.uniforms.color.value.copy(sun.color);
    b.mesh.visible = o > 0.004;
    b.mesh.lookAt(b.mesh.position.clone().sub(sunDir));
  }
  bloom.strength = p.n('bloom');
}

// ---------- ruins: built from the simulation's modules ----------
const STONE_TINT = [new THREE.Color(0xc2d8d0), new THREE.Color(0xe6c49c), new THREE.Color(0xf4ead6)];
const GLOW = [new THREE.Color(0x52f2ff), new THREE.Color(0xffc24a), new THREE.Color(0x52ff9a)];
// figs ripen from green to purple; they sit in pairs where leaves join the young shoots
const FIG_GREEN = new THREE.Color(0x6f9a3a), FIG_RIPE = new THREE.Color(0x5a2348), LEAF_YOUNG = new THREE.Color(0xc0504e);
// how each species is drawn: foliage texture and pads, leaf colour, new growth, fruit, bark tint
const LOOK = {
  fig:{tex:leafTex, pad:[16, 6], spread:[0.12, 0.09], size:1, hue:null, sat:0.55, light:0.17, young:LEAF_YOUNG, youngK:0.5,
    fruit:{p:0.3, pair:true, from:FIG_GREEN, to:FIG_RIPE, size:1}, bark:new THREE.Color(1, 1, 1),
    trunk:{flutes:5, fluteAmp:0.3, fluteFade:0.12, twist:0}, shari:null, dead:new THREE.Color(0xcfc8ba)},
  juniper:{tex:juniperTex, pad:[24, 14], back:5, spread:[0.1, 0.09], size:0.7, hue:0.40, sat:0.34, light:0.2, young:new THREE.Color(0x8cc46a), youngK:0.3,
    fruit:{p:0.22, pair:false, from:new THREE.Color(0x6f8a5a), to:new THREE.Color(0x5a6f9e), size:0.7}, bark:new THREE.Color(1.15, 0.82, 0.68),
    // the trunk twists with deep, spiralling ridges (live veins) along its whole length
    trunk:{flutes:6, fluteAmp:0.22, fluteFade:1.0, twist:1.3}, shari:{width:1.45, from:0.04, to:0.85},
    dead:new THREE.Color(1.9, 1.86, 1.8)},  // juniper deadwood bleaches silver-white (brighter than 1 to lift the dark bark texture)
};
let look = LOOK.fig;
function applyLook(){
  look = LOOK[g.species] || LOOK.fig;
  leafMat.map = look.tex; leafDepth.map = look.tex; leafMat.needsUpdate = leafDepth.needsUpdate = true;
  barkMat.color.copy(look.bark); deadMat.color.copy(look.dead);
}
const mixW = (arr, w) => { const c = new THREE.Color(0,0,0); arr.forEach((k,i) => c.add(k.clone().multiplyScalar(w[i]))); return c; };
let world = {group:null, built:0, beams:[], glow:new THREE.Color(1,1,1), disposables:[]};

function resetWorld(){
  if (world.group){ scene.remove(world.group); world.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); world.disposables.forEach(d => d.dispose()); }
  const w = g.blend;
  const stoneTex = makeStoneTex(w, mulberry32(hashInt(g.seed, 11)));
  const stoneMat = addCutaway(new THREE.MeshStandardMaterial({map:stoneTex, bumpMap:stoneTex, bumpScale:2.2, roughness:0.95, vertexColors:true, color:mixW(STONE_TINT, w)}), true);
  const glowCol = mixW(GLOW, w);
  const glowMat = addCutaway(new THREE.MeshStandardMaterial({color:glowCol, emissive:glowCol, emissiveIntensity:0.4, roughness:0.35, metalness:0.6}), true);
  barkMat.emissive.copy(glowCol); bloomMat.emissive.copy(glowCol);
  world = {group:new THREE.Group(), built:0, beams:[], glow:glowCol, stoneMat, stoneBase:stoneMat.color.clone(), glowMat, disposables:[stoneTex, stoneMat, glowMat]};
  scene.add(world.group);
}
function buildModule(m){
  const R = mulberry32(hashInt(g.seed, 300 + m.i));
  const w = g.blend, moss = 0.5 + w[1]*1.2;
  const geos = [], glowGeos = [];
  let sk = m.i*5000;
  const place = (geo, x, y, z, ry) => { if (ry) geo.rotateY(ry); geo.translate(x, y, z); geos.push(withCenter(geo, x, y, z)); };
  for (const b of m.vis.blocks) place(stoneBox(b.w, b.h, b.d, sk++, moss, b.tint ? RED : null), b.cx, b.cy, b.cz, b.ry);
  for (const o of m.solids){
    if (o.kind === 'wall') continue;
    if (o.kind === 'column'){
      const h = o.hy*2, st = o.style;
      let cg;
      if (st === 2) cg = new THREE.BoxGeometry(o.r*1.8, h, o.r*1.8, 2, Math.max(1, Math.round(h*3)), 2);
      else {
        cg = new THREE.CylinderGeometry(o.r, o.r*1.08, h, st === 0 ? 36 : 8, Math.max(1, Math.round(h*3)));
        if (st === 0){
          const pp = cg.attributes.position;
          for (let i=0;i<pp.count;i++){ const px = pp.getX(i), pz = pp.getZ(i), r = Math.hypot(px,pz); if (r < o.r*0.5) continue; const f = 1 - 0.08*Math.max(0, Math.cos(Math.atan2(pz,px)*18)); pp.setXYZ(i, px*f, pp.getY(i), pz*f); }
          cg.computeVertexNormals();
        }
      }
      scaleUVs(cg, o.r*2, h, o.r*2);
      place(weather(cg, sk++, moss*0.7, st === 2 && R() < 0.5 ? RED : null), o.cx, o.cy, o.cz, 0);
      place(stoneBox(o.r*2.8, 0.14, o.r*2.8, sk++, moss), o.cx, o.cy - o.hy + 0.07, o.cz, R());
      if (h > 2.2) place(stoneBox(o.r*2.6, 0.14, o.r*2.6, sk++, moss), o.cx, o.cy + o.hy - 0.07, o.cz, 0);
      if (st === 0){ for (const fy of [0.3, 0.75]) { const t = new THREE.TorusGeometry(o.r*1.05, 0.018, 8, 32); t.rotateX(Math.PI/2); t.translate(o.cx, o.cy - o.hy + h*fy, o.cz); glowGeos.push(withCenter(t, o.cx, o.cy - o.hy + h*fy, o.cz)); } }
      continue;
    }
    place(stoneBox(o.hx*2, o.hy*2, o.hz*2, sk++, moss), o.cx, o.cy, o.cz, o.ry);
  }
  // Angkor baluster windows
  const prof = [[0,0],[0.05,0],[0.05,0.05],[0.032,0.09],[0.06,0.28],[0.036,0.48],[0.06,0.7],[0.032,0.9],[0.05,0.95],[0.05,1],[0,1]];
  for (const b of m.vis.balusters){
    const n = Math.max(2, Math.round(b.wu/0.22));
    const tx = Math.cos(b.ry), tz = -Math.sin(b.ry);
    for (let i=1;i<=n;i++){
      const u = -b.wu/2 + i*b.wu/(n+1);
      const lg = new THREE.LatheGeometry(prof.map(([x,y]) => new THREE.Vector2(x, y*b.wv)), 10); scaleUVs(lg, 0.3, 1, 0.3);
      place(weather(lg, sk++, moss*0.5), b.x + tx*u, b.y - b.wv/2, b.z + tz*u, 0);
    }
  }
  // Atlantean orichalcum: sills and bands
  for (const gl of m.vis.glow){
    if (gl.band){
      for (let k=0;k<4;k++){ const a = k*Math.PI/2, bx = new THREE.BoxGeometry(2*GCFG.HALF, 0.05, 0.03); bx.rotateY(-a + Math.PI/2); bx.translate(Math.cos(a)*(GCFG.HALF-0.005), gl.y, Math.sin(a)*(GCFG.HALF-0.005)); glowGeos.push(withCenter(bx, Math.cos(a)*(GCFG.HALF-0.005), gl.y, Math.sin(a)*(GCFG.HALF-0.005))); }
    } else { const bx = new THREE.BoxGeometry(gl.len, 0.04, GCFG.WALL_T*1.05); bx.rotateY(gl.ry); bx.translate(gl.x, gl.y, gl.z); glowGeos.push(withCenter(bx, gl.x, gl.y, gl.z)); }
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), world.stoneMat); mesh.castShadow = mesh.receiveShadow = true; world.group.add(mesh);
  if (glowGeos.length){ const gm = new THREE.Mesh(mergeGeometries(glowGeos), world.glowMat); world.group.add(gm); }
  // vines hanging from slabs and beams
  const vineGeos = [], hangers = m.solids.filter(o => o.kind === 'slab' || o.kind === 'beam');
  for (let i=0; i<Math.min(10, hangers.length*2); i++){
    const o = hangers[Math.floor(R()*hangers.length)];
    const lx = (R()-.5)*2*o.hx, lz = (R()<.5?-1:1)*o.hz;
    const x = o.cx + lx*Math.cos(o.ry) + lz*Math.sin(o.ry), z = o.cz - lx*Math.sin(o.ry) + lz*Math.cos(o.ry), y = o.cy - o.hy;
    if (Math.hypot(x, z) > GCFG.HALF + 0.3) continue;
    const len = 0.5 + R()*1.8, pts = [], rr = [];
    for (let k=0;k<=6;k++){ const t = k/6; pts.push(V(x + Math.sin(t*3+i)*0.04*len, y - t*len, z + Math.cos(t*2.5+i)*0.04*len)); rr.push(lerp(0.008, 0.004, t)); }
    vineGeos.push(tubeGeo(pts, rr, 4, {knob:0}));
  }
  if (vineGeos.length){ const vm = new THREE.Mesh(mergeGeometries(vineGeos), vineMat); vm.castShadow = true; world.group.add(vm); }
  // dusty sunbeams through windows
  for (const wdw of m.vis.windows){
    const len = 4;
    const mk = rz => { const p = new THREE.PlaneGeometry(1, len); p.translate(0, len/2, 0); p.rotateX(Math.PI/2); if (rz) p.rotateZ(Math.PI/2); return p; };
    const geo = mergeGeometries([mk(false), mk(true)]); geo.scale(wdw.wu*0.9, wdw.wv*0.9, 1);
    const mt = beamMat.clone(); mt.uniforms.time = timeU; world.disposables.push(mt);
    const mesh = new THREE.Mesh(geo, mt); mesh.renderOrder = 5; mesh.frustumCulled = false;
    mesh.position.set(wdw.x + wdw.nx*0.3, wdw.y, wdw.z + wdw.nz*0.3);
    world.group.add(mesh);
    world.beams.push({mesh, mat:mt, n:V(wdw.nx, 0, wdw.nz)});
  }
}
// every vertex of a block carries the block's centre, so the cut-away removes the block whole
function withCenter(geo, x, y, z){
  const n = geo.attributes.position.count, a = new Float32Array(n*3);
  for (let i=0;i<n;i++){ a[i*3] = x; a[i*3+1] = y; a[i*3+2] = z; }
  geo.setAttribute('aCenter', new THREE.BufferAttribute(a, 3));
  return geo;
}
function syncWorld(){ while (world.built < g.modules.length) buildModule(g.modules[world.built++]); }

// ---------- tree ----------
const deadMat = addSway(new THREE.MeshStandardMaterial({color:0xcfc8ba, map:bark.map, bumpMap:bark.bump, bumpScale:1.2, roughness:0.85}), 'dead');
let woodMesh = null, deadMesh = null, rootMesh = null, leafMesh = null, blossomMesh = null, newSegs = null, anim = null;
const segGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); segGeo.translate(0, 0.5, 0);
const leafGeo = new THREE.PlaneGeometry(0.09, 0.18); leafGeo.translate(0, 0.09, 0);
const P = n => V(n.x, n.y, n.z);
const disposeMesh = m => { if (m){ scene.remove(m); m.geometry.dispose(); } return null; };

// Each branch keeps its identity: a chain follows the child that first continued it (fixed when it grew), so existing
// wood never re-routes between turns. Other children, and dead wood, start their own chains.
function chainsOf(limit){
  const N = g.nodes, lim = Math.min(limit, N.length);
  const ok = c => c < lim && N[c].alive;
  const out = [], stack = [[0, -1]];
  while (stack.length){
    const [start, from] = stack.pop();
    const st = n => n.dead ? 2 : n.dying ? 1 : 0;  // living, dying (browning bare branch), dead
    const ids = from >= 0 ? [from] : [], dead = st(N[start]);
    let cur = start;
    for (;;){
      ids.push(cur);
      const n = N[cur];
      let next = -1;
      for (const c of n.children){ if (!ok(c)) continue; if (c === n.main && st(N[c]) === dead) next = c; else stack.push([c, cur]); }
      if (next < 0) break;
      cur = next;
    }
    out.push({ids, dead});
  }
  return out;
}
// a bare juniper branch browns and greys for a few turns before it dies
const dyingMat = addSway(new THREE.MeshStandardMaterial({color:0x9a8a78, map:bark.map, bumpMap:bark.bump, bumpScale:1.4, roughness:0.9}), 'dying');
let dyingMesh = null;
const cutMat = addSway(new THREE.MeshStandardMaterial({color:0xe2cba4, roughness:0.75}), 'cut');
let cutMesh = null;
function buildWood(limit){
  woodMesh = disposeMesh(woodMesh); deadMesh = disposeMesh(deadMesh); cutMesh = disposeMesh(cutMesh); dyingMesh = disposeMesh(dyingMesh);
  const N = g.nodes, live = [], dead = [], cuts = [], dying = [];
  for (const {ids, dead:isDead} of chainsOf(limit)){
    if (ids.length < 2) continue;
    const pts = ids.map(id => P(N[id]));
    const trunk = ids[0] === 0;
    // a side branch grows out of its parent with a slight collar, sized to stay inside the parent
    const rad = ids.map((id, i) => i === 0 && !trunk ? Math.min(N[id].r*0.9, N[ids[1]].r*1.04) : N[id].r);
    const r0 = trunk ? rad[0] : rad[1];
    if (trunk){ pts[0] = V(pts[0].x, -0.1, pts[0].z); rad[0] *= 1.35; }
    const radial = trunk ? 28 : r0 > 0.1 ? 24 : r0 > 0.05 ? 16 : r0 > 0.025 ? 10 : 7;
    const uRep = Math.max(1, Math.round(TAU*r0/0.3));
    const trunkOpt = {knob:0.1, knobF:3.2, ...look.trunk, phase:g.seed%7, density:24, uRep, vScale:1.6};
    (isDead === 2 ? dead : isDead === 1 ? dying : live).push(tubeGeo(pts, rad, radial,
      trunk ? trunkOpt : {knob: r0 > 0.03 ? 0.08 : 0.03, knobF:7, density: r0 > 0.03 ? 18 : 12, uRep, vScale:1.6}));
    // juniper: a strip of stripped, silvered deadwood (shari) spiralling up the trunk with the grain
    if (trunk && isDead === 0 && look.shari) dead.push(tubeGeo(pts, rad, 10, {...trunkOpt, arc:{a0:(g.seed%11)*0.57, ...look.shari}}));
  }
  // cut ends show pale wood
  for (const n of N){
    if (!n.alive || !n.cutEnd || n.id >= limit) continue;
    const d = V(n.cutEnd[0], n.cutEnd[1], n.cutEnd[2]);
    const disc = new THREE.CylinderGeometry(n.r*0.85, n.r*0.85, 0.01, 14);
    disc.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0), d));
    disc.translate(n.x + d.x*n.r*0.35, n.y + d.y*n.r*0.35, n.z + d.z*n.r*0.35);
    cuts.push(disc);
  }
  if (live.length){ woodMesh = new THREE.Mesh(mergeGeometries(live), barkMat); woodMesh.castShadow = woodMesh.receiveShadow = true; scene.add(woodMesh); }
  if (dead.length){ deadMesh = new THREE.Mesh(mergeGeometries(dead), deadMat); deadMesh.castShadow = deadMesh.receiveShadow = true; scene.add(deadMesh); }
  if (cuts.length){ cutMesh = new THREE.Mesh(mergeGeometries(cuts), cutMat); scene.add(cutMesh); }
  if (dying.length){ dyingMesh = new THREE.Mesh(mergeGeometries(dying), dyingMat); dyingMesh.castShadow = true; scene.add(dyingMesh); }
}
// surface roots spreading over the plinth: the nebari of an old bonsai
function buildRoots(){
  rootMesh = disposeMesh(rootMesh);
  const R = mulberry32(hashInt(g.seed, 13)), geos = [], b = g.nodes[0];
  for (let k=0;k<7;k++){
    const az = k/7*TAU + R()*0.4, c = Math.cos(az), s = Math.sin(az), e = 0.7/Math.max(Math.abs(c), Math.abs(s));
    const pts = [V(b.x + c*0.02, 0.24, b.z + s*0.02), V(c*0.18, 0.1, s*0.18), V(c*0.4, 0.04, s*0.4), V(c*0.6, 0.03, s*0.6), V(c*(e-0.03), 0.02, s*(e-0.03))];
    const rad = [0.07, 0.085, 0.06, 0.05, 0.04];
    if (k%2 === 0){ pts.push(V(c*(e+0.05), -0.1, s*(e+0.05)), V(c*(e+0.07), -0.33, s*(e+0.07)), V(c*(e+0.3), -0.42, s*(e+0.3)), V(c*(e+0.4), -0.78, s*(e+0.4))); rad.push(0.035, 0.03, 0.025, 0.02); }
    else { pts.push(V(c*(e+0.02), -0.05, s*(e+0.02))); rad.push(0.02); }
    geos.push(tubeGeo(pts, rad, 10, {knob:0.14, knobF:5}));
  }
  rootMesh = new THREE.Mesh(mergeGeometries(geos), barkMat); rootMesh.castShadow = rootMesh.receiveShadow = true; scene.add(rootMesh);
}
// foliage pads: a full pad at every living shoot, thinner leaves on the twigs just behind it; seeded per node so pads stay put
function buildLeaves(startOf){
  leafMesh = disposeMesh(leafMesh); blossomMesh = disposeMesh(blossomMesh);
  const N = g.nodes, hue = 0.36*g.blend[0] + 0.27*g.blend[1] + 0.22*g.blend[2];
  const mats = [], starts = [], cols = [], blos = [];
  const d = new THREE.Object3D(), c = new THREE.Color();
  const pad = (n, count, spread, health, st) => {
    const R = mulberry32(hashInt(g.seed, n.id, 5));
    const young = clamp(1 - (g.turn - n.born)/3, 0, 1);  // new fig leaves open coppery red, new juniper tips bright green
    for (let k=0;k<count;k++){
      d.position.set(n.x + (R()-.5)*spread*2, n.y + (R()-.25)*spread*1.1, n.z + (R()-.5)*spread*2);
      d.lookAt(d.position.clone().add(V((R()-.5)*2, 0.7 + R(), (R()-.5)*2)));
      d.rotateZ(R()*TAU); d.scale.setScalar((0.8 + R()*0.5)*look.size); d.updateMatrix();
      mats.push(d.matrix.clone()); starts.push(st);
      c.setHSL(lerp(0.13, look.hue ?? hue, health) + (R()-.5)*0.04, lerp(0.6, look.sat, health), clamp(look.light + R()*0.1, 0, 0.5));
      c.lerp(look.young, young*look.youngK);
      cols.push(c.clone());
    }
  };
  for (const s of g.shoots){
    let n = N[s.node];
    if (!n.alive) continue;
    const st = startOf ? startOf(n.id) : -100;
    pad(n, look.pad[0], look.spread[0], s.health, st);
    for (let k=0;k<(look.back ?? 2) && n.parent > 0;k++){ n = N[n.parent]; pad(n, look.pad[1], look.spread[1], s.health, startOf ? startOf(n.id) : -100); }
    // fruit just behind some tips: a pair of figs in the leaf axils, or a single juniper berry (a fleshy cone)
    const fn = N[s.node].parent > 0 ? N[N[s.node].parent] : null, fr = look.fruit;
    if (fn && fn.alive && hash3(fn.id, 4, 2) < fr.p){
      const R = mulberry32(hashInt(g.seed, fn.id, 9));
      const ripe = clamp((g.turn - fn.born)/10, 0, 1);
      for (let k=0;k<(fr.pair ? 2 : 1);k++){
        const a = R()*TAU, sc = (0.8 + R()*0.4)*fr.size;
        blos.push([new THREE.Matrix4().compose(V(fn.x + Math.cos(a)*0.04, fn.y + 0.01, fn.z + Math.sin(a)*0.04), new THREE.Quaternion(), V(sc, sc*1.15, sc)), fr.from.clone().lerp(fr.to, ripe)]);
      }
    }
  }
  if (mats.length){
    const geo = leafGeo.clone();
    geo.setAttribute('aStart', new THREE.InstancedBufferAttribute(new Float32Array(starts), 1));
    leafMesh = new THREE.InstancedMesh(geo, leafMat, mats.length);
    mats.forEach((m, i) => { leafMesh.setMatrixAt(i, m); leafMesh.setColorAt(i, cols[i]); });
    leafMesh.customDepthMaterial = leafDepth; leafMesh.castShadow = leafMesh.receiveShadow = true;
    scene.add(leafMesh);
  }
  if (blos.length){
    blossomMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.016, 2), bloomMat, blos.length);
    blos.forEach(([m, col], i) => { blossomMesh.setMatrixAt(i, m); blossomMesh.setColorAt(i, col); });
    scene.add(blossomMesh);
  }
}

// ---------- guy wires: a taut wire from the ring to a padded tie on the branch ----------
const WIRE_LOOK = {fig:{wire:0x7a5a3e, pad:0x262321}, juniper:{wire:0xb8733a, pad:0xc8b07a}};  // brown aluminium + rubber; copper + raffia
const wireMat = addSway(new THREE.MeshStandardMaterial({color:0x7a5a3e, roughness:0.35, metalness:0.8}), 'wire');
const padMat = addSway(new THREE.MeshStandardMaterial({color:0x262321, roughness:0.8}), 'pad');
let wireMesh = null;
function buildWires(){
  if (wireMesh){ scene.remove(wireMesh); wireMesh.traverse(o => o.geometry && o.geometry.dispose()); wireMesh = null; }
  const wl = WIRE_LOOK[g.species] || WIRE_LOOK.fig;
  wireMat.color.set(wl.wire); padMat.color.set(wl.pad);
  if (!g.wires.length) return;
  wireMesh = new THREE.Group();
  for (const w of g.wires){
    const n = g.nodes[w.node], r = g.rings[w.ring], a = P(n), b = V(r.x, r.y, r.z), dir = b.clone().sub(a), len = dir.length();
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, len, 5), wireMat);
    line.position.copy(a).add(b).multiplyScalar(0.5); line.quaternion.setFromUnitVectors(UP, dir.normalize());
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(n.r*1.35 + 0.004, n.r*1.35 + 0.004, 0.05, 12), padMat);
    pad.position.copy(a); pad.quaternion.setFromUnitVectors(UP, V(n.dx, n.dy, n.dz).normalize());
    line.castShadow = pad.castShadow = true;
    wireMesh.add(line, pad);
  }
  scene.add(wireMesh);
}

// ---------- rings on the ruins ----------
let ringGroup = null;
const ironMat = addCutaway(new THREE.MeshStandardMaterial({color:0x4d443e, roughness:0.4, metalness:0.75}));
const ringLitMat = new THREE.MeshBasicMaterial({color:0xffd27a, toneMapped:false});
function buildRings(){
  if (ringGroup){ scene.remove(ringGroup); ringGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  ringGroup = new THREE.Group(); scene.add(ringGroup);
  for (const r of g.rings){
    const grp = new THREE.Group(); grp.position.set(r.x, r.y, r.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.015, 8, 24), ironMat);
    if (r.kind === 'hang'){
      ring.rotation.y = hash3(r.id, 1, 1)*TAU;
      for (let k=1;k<=3;k++){ const l = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 12), ironMat); l.position.y = 0.075 + k*0.035; l.rotation.y = k%2 ? Math.PI/2 : 0; grp.add(l); }
    } else {
      ring.lookAt(r.nx, 0, r.nz);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.02), ironMat);
      plate.position.set(-r.nx*0.07, 0.07, -r.nz*0.07); plate.lookAt(r.nx*2, 0.07, r.nz*2);
      grp.add(plate);
      if (r.kind === 'column'){ const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 32), ironMat); band.rotation.x = Math.PI/2; band.position.set(-r.nx*0.2, 0.07, -r.nz*0.2); grp.add(band); }
    }
    ring.castShadow = true;
    grp.add(ring);
    grp.userData.ring = ring;
    ringGroup.add(grp);
    r.mesh = ring;
  }
}

// ---------- a turn: play the forced card, then animate the whole tree growing ----------
const SEG_T = 0.5, STAGE_T = 0.5;
let plan = null;
function doTurn(action){
  if (anim || busy || g.over) return;
  const before = g.nodes.length;
  const ok = play(g, action);
  if (!ok){ toast('Not there'); return; }
  sel = null; active = 0;
  save();
  syncWorld();
  if (g.rings.length !== ringGroup.children.length) buildRings();
  hoursTo = GCFG.START_HOUR + g.turn*24/GCFG.TURNS_PER_DAY;
  const added = g.lastAdded;
  buildWood(before);
  const start = id => g.nodes[id].iter*STAGE_T + hash3(id, 1, 1)*0.12;
  buildLeaves(id => id >= before ? start(id) + SEG_T*0.6 : -100);
  buildWires();
  newSegs = disposeMesh(newSegs);
  if (added.length){ newSegs = new THREE.InstancedMesh(segGeo, barkMat, added.length); newSegs.castShadow = true; scene.add(newSegs); }
  const stages = Math.max(1, ...added.map(id => g.nodes[id].iter + 1));
  anim = {t:0, added, start, total: stages*STAGE_T + SEG_T + 0.15};
  animU.value = 0;
  for (const e of g.events) eventToast(e);
  plan = planTurn(g);
  if (cam.mode === 'branch') setMode('follow');
  render();
  if (g.over) setTimeout(showOver, 1600);
}
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), UP = V(0,1,0), tmpV = new THREE.Vector3();
function stepAnim(dt){
  if (!anim) return;
  anim.t += dt; animU.value = anim.t;
  if (newSegs){
    anim.added.forEach((id, i) => {
      const n = g.nodes[id], p = g.nodes[n.parent];
      const k = smooth(0, 1, (anim.t - anim.start(id))/SEG_T);
      tmpV.set(n.x - p.x, n.y - p.y, n.z - p.z);
      const len = tmpV.length();
      tmpQ.setFromUnitVectors(UP, tmpV.normalize());
      tmpM.compose(V(p.x, p.y, p.z), tmpQ, V(n.r, Math.max(1e-4, len*k), n.r));
      newSegs.setMatrixAt(i, tmpM);
    });
    newSegs.instanceMatrix.needsUpdate = true;
  }
  if (anim.t >= anim.total){
    buildWood(g.nodes.length);
    newSegs = disposeMesh(newSegs);
    anim = null; animU.value = 1e4;
    refreshMarkers();
  }
}

// ---------- markers: shoot health, where each shoot will grow, and previews of the chosen action ----------
const markers = new THREE.Group(); scene.add(markers);
const sphereGeo = new THREE.SphereGeometry(1, 14, 10);
const mk = c => new THREE.MeshBasicMaterial({color:c, transparent:true, opacity:0.95, depthTest:false, toneMapped:false});
const MAT = {good:mk(0x9be37a), ok:mk(0xffd166), poor:mk(0xffa24a), bad:mk(0xff5a4a), sel:mk(0xffffff), bud:mk(0x7dffb0), wire:mk(0xe0a060)};
const lineMat = c => new THREE.LineBasicMaterial({color:c, transparent:true, opacity:0.85, depthTest:false});
const LINES = {slide:lineMat(0xffb14a), grow:lineMat(0xffffff), block:lineMat(0xff5a4a), cut:lineMat(0xff5a4a), wire:lineMat(0xe0a060), tie:lineMat(0xffa040), bud:lineMat(0x7dffb0)};
function dotAt(p, r, mat){ const m = new THREE.Mesh(sphereGeo, mat); m.position.copy(p); m.scale.setScalar(r); m.renderOrder = 30; markers.add(m); return m; }
function lineSeg(pairs, mat){
  const pts = []; for (const [a, b] of pairs) pts.push(a, b);
  const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat); l.renderOrder = 29; markers.add(l); return l;
}
const healthMat = h => h > 0.7 ? MAT.good : h > 0.45 ? MAT.ok : h > 0.2 ? MAT.poor : MAT.bad;
function refreshMarkers(){
  markers.traverse(o => { if (o.geometry && o.geometry !== sphereGeo) o.geometry.dispose(); });
  markers.clear();
  if (!plan) plan = planTurn(g);
  const N = g.nodes;
  const growPairs = [], blockPairs = [], slidePairs = [];
  for (const i of plan.info){
    const n = i.n, s = i.s;
    dotAt(P(n), 0.022, healthMat(s.health));
    const d = V(s.d[0], s.d[1], s.d[2]);
    if (i.blockedAhead && i.slide) slidePairs.push([P(n), P(n).addScaledVector(V(i.slide[0], i.slide[1], i.slide[2]), Math.max(0.06, i.ext*GCFG.SLIDE_SPEED))]);
    else if (i.blockedAhead) blockPairs.push([P(n), P(n).addScaledVector(d, 0.1)]);
    else if (i.ext > 0.02) growPairs.push([P(n), P(n).addScaledVector(d, i.ext)]);
  }
  if (growPairs.length) lineSeg(growPairs, LINES.grow);
  if (slidePairs.length) lineSeg(slidePairs, LINES.slide);
  if (blockPairs.length){ lineSeg(blockPairs, LINES.block); for (const [a, b] of blockPairs) dotAt(b, 0.018, MAT.bad); }
  for (const r of g.rings) if (r.mesh) r.mesh.material = ironMat;
  const card = g.hand[active];
  if (card === 'wire'){
    // before a tie point is chosen, the stretches of branch near the view that can be tied are drawn orange
    const valid = sel?.node != null ? targets(g, 'wire', 1, sel.node) : [];
    if (sel?.node == null){
      const f = cam.focus, pairs = [], rings = new Set();
      for (const id of targets(g, 'wire')){
        const n = N[id];
        if (Math.abs(n.y - f.y) > 2.2 || n.parent < 0) continue;
        pairs.push([P(N[n.parent]), P(n)]);
        for (const rid of targets(g, 'wire', 1, id)) rings.add(rid);
      }
      if (pairs.length) lineSeg(pairs, LINES.tie);
      valid.push(...rings);
    }
    for (const id of valid) g.rings[id].mesh.material = ringLitMat;
    if (sel?.node != null){
      const n = N[sel.node];
      dotAt(P(n), 0.035, MAT.sel);
      if (sel.ring != null){
        const r = g.rings[sel.ring];
        lineSeg([[P(n), V(r.x, r.y, r.z)]], LINES.wire); dotAt(V(r.x, r.y, r.z), 0.03, MAT.sel);
      }
    }
  }
  if (card === 'root'){
    // dormant buds near where you are looking
    const pairs = [];
    for (const id of rootChoices()){ const n = N[id]; pairs.push([P(n), P(n).add(V(n.bud[0], n.bud[1], n.bud[2]).multiplyScalar(0.1))]); dotAt(P(n), 0.012, MAT.bud); }
    if (pairs.length) lineSeg(pairs, LINES.bud);
  }
  if ((card === 'pinch' && sel?.shoot != null) || ((card === 'cut' || card === 'root') && sel?.node != null)){
    const pv = previewAction(g, card, card === 'pinch' ? sel.shoot : sel.node);
    if (pv){
      if (card === 'pinch'){ const n = N[shootById(g, sel.shoot).node]; dotAt(P(n), 0.04, MAT.bad); }
      else {
        const pairs = [];
        for (const id of pv.removed){ const n = N[id]; if (n.parent >= 0) pairs.push([P(N[n.parent]), P(n)]); }
        lineSeg(pairs, LINES.cut);
        dotAt(P(N[sel.node]), 0.035, MAT.bad);
      }
      const budPairs = [];
      for (const b of pv.buds){ dotAt(P(b), 0.025, MAT.bud); budPairs.push([P(b), P(b).add(V(b.bud[0], b.bud[1], b.bud[2]).multiplyScalar(0.18))]); }
      if (budPairs.length) lineSeg(budPairs, LINES.bud);
    }
  }
}

// ---------- camera: follows growth; tap a branch and swipe to travel along it ----------
const cam = {az:0.7, el:0.22, dist:2.7, focus:V(0, 0.8, 0), mode:'follow', node:-1};
function goal(){
  if (cam.mode === 'branch' && cam.node >= 0){ const n = g.nodes[cam.node]; return V(n.x, n.y, n.z); }
  if (cam.mode === 'follow'){ const f = g.follow; return V(f.x*0.6, f.y, f.z*0.6); }
  return null;
}
function travel(steps){
  if (cam.node < 0) return;
  const N = g.nodes, size = new Array(N.length).fill(0);
  for (let i=N.length-1;i>=0;i--){ if (!N[i].alive) continue; size[i] += 1; if (N[i].parent >= 0) size[N[i].parent] += size[i]; }
  let id = cam.node;
  for (let i=0;i<Math.abs(steps);i++){
    const n = N[id];
    if (steps > 0){ const ch = n.children.filter(c => N[c].alive).sort((a,b) => size[b]-size[a]); if (!ch.length) break; id = ch[0]; }
    else { if (n.parent < 0) break; id = n.parent; }
  }
  cam.node = id;
  if (g.hand[active] === 'cut' && sel && targets(g, 'cut').includes(id)){ sel.node = id; refreshMarkers(); renderUI(); }
  if (g.hand[active] === 'wire' && sel && targets(g, 'wire').includes(id)){
    sel.node = id; if (sel.ring != null && !targets(g, 'wire', 1, id).includes(sel.ring)) sel.ring = null;
    refreshMarkers(); renderUI();
  }
}
function setMode(mode, node=-1){
  cam.mode = mode; cam.node = node;
  $('followbtn').hidden = mode === 'follow';
}
function project(p){
  const rect = canvas.getBoundingClientRect();
  tmpV.copy(p).project(camera);
  return tmpV.z > 1 ? null : {x:(tmpV.x*0.5+0.5)*rect.width, y:(-tmpV.y*0.5+0.5)*rect.height};
}
function nearest(items, cx, cy, maxPx){
  let best = null, bd = maxPx;
  for (const it of items){ const s = project(it.p); if (!s) continue; const d = Math.hypot(s.x - cx, s.y - cy); if (d < bd){ bd = d; best = it; } }
  return best;
}
function rootChoices(){
  const f = cam.focus;
  return targets(g, 'root').filter(id => { const n = g.nodes[id]; return Math.hypot(n.x-f.x, n.y-f.y, n.z-f.z) < 1.6; });
}
function onTap(cx, cy){
  if (anim || g.over) return;
  const card = g.hand[active];
  if (card === 'pinch'){
    const hit = nearest(g.shoots.map(s => ({p:P(g.nodes[s.node]), id:s.id, node:s.node})), cx, cy, 44);
    if (hit){ sel = {shoot:hit.id}; setMode('branch', hit.node); }
  } else if (card === 'cut'){
    const valid = new Set(targets(g, 'cut'));
    const hit = nearest(g.nodes.filter(n => valid.has(n.id)).map(n => ({p:P(n), id:n.id})), cx, cy, 36);
    if (hit){ sel = {node:hit.id}; setMode('branch', hit.id); }
  } else if (card === 'root'){
    const choices = rootChoices();
    let hit = nearest(choices.map(id => ({p:P(g.nodes[id]), id})), cx, cy, 36);
    if (!hit){ const all = targets(g, 'root'); hit = nearest(all.map(id => ({p:P(g.nodes[id]), id})), cx, cy, 30); }
    if (hit){ sel = {node:hit.id}; setMode('branch', hit.id); }
  } else if (card === 'wire'){
    // first a tie point on a branch (swipe along the branch to move it), then a ring in reach
    const pickTie = () => nearest(targets(g, 'wire').map(id => ({p:P(g.nodes[id]), id})), cx, cy, 44);
    if (sel?.node != null){
      const ring = nearest(targets(g, 'wire', 1, sel.node).map(id => ({p:V(g.rings[id].x, g.rings[id].y, g.rings[id].z), id})), cx, cy, 54);
      if (ring) sel.ring = ring.id;
      else { const hit = pickTie(); if (hit){ sel = {node:hit.id}; setMode('branch', hit.id); } }
    } else {
      const hit = pickTie();
      if (hit){ sel = {node:hit.id}; setMode('branch', hit.id); }
    }
  }
  refreshMarkers(); renderUI();
}
const pointers = new Map();
let gesture = null;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pointers.size === 1) gesture = {x0:e.clientX, y0:e.clientY, t0:performance.now(), axis:null, acc:0, moved:0};
  else if (pointers.size === 2){ const [a, b] = [...pointers.values()]; gesture = {pinch: Math.hypot(a.x-b.x, a.y-b.y), dist:cam.dist}; }
});
canvas.addEventListener('pointermove', e => {
  const prev = pointers.get(e.pointerId); if (!prev || !gesture) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (gesture.pinch){ const [a, b] = [...pointers.values()]; cam.dist = clamp(gesture.dist*gesture.pinch/Math.max(10, Math.hypot(a.x-b.x, a.y-b.y)), 0.7, 8); return; }
  gesture.moved += Math.hypot(dx, dy);
  if (!gesture.axis && gesture.moved > 8) gesture.axis = Math.abs(e.clientX - gesture.x0) > Math.abs(e.clientY - gesture.y0) ? 'h' : 'v';
  if (gesture.axis === 'h') cam.az -= dx*0.008;
  else if (gesture.axis === 'v'){
    if (cam.mode === 'branch'){
      gesture.acc += dy;
      while (gesture.acc <= -16){ travel(1); gesture.acc += 16; }
      while (gesture.acc >= 16){ travel(-1); gesture.acc -= 16; }
    } else { if (cam.mode === 'follow') setMode('free'); cam.focus.y = clamp(cam.focus.y - dy*0.01, 0, g.maxY + 1); }
  }
});
const endPointer = e => {
  pointers.delete(e.pointerId);
  if (gesture && !gesture.pinch && pointers.size === 0 && gesture.moved < 8 && performance.now() - gesture.t0 < 450) onTap(e.clientX, e.clientY);
  if (pointers.size === 0) gesture = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist*Math.exp(e.deltaY*0.001), 0.7, 8); }, {passive:false});
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') cam.az += 0.15;
  if (e.key === 'ArrowRight') cam.az -= 0.15;
  if (e.key === 'ArrowUp'){ if (cam.mode === 'branch') travel(1); else { setMode('free'); cam.focus.y += 0.2; } }
  if (e.key === 'ArrowDown'){ if (cam.mode === 'branch') travel(-1); else { setMode('free'); cam.focus.y -= 0.2; } }
});

// ---------- run, saving, interface ----------
const KEY = 'bonzai.grow.v5';  // v5: back to playing all three cards (saves from other card rules replay differently, so they are not loaded)
let g, busy = false, sel = null, active = 0;
function save(){ store.set(KEY, {seed:g.seed, log:g.log, species:g.species}); }
function startRun(seed, log=[], species='fig'){
  busy = true;
  const sameRuins = g && g.seed === seed && world.group;  // an undo keeps the ruins: they depend only on the seed
  g = log.length ? replayGame(seed, log, species) : newGame(seed, species);
  applyLook();
  sel = null; plan = null; active = 0;
  if (!sameRuins) resetWorld();
  syncWorld(); buildRings();
  newSegs = disposeMesh(newSegs); anim = null; animU.value = 1e4;
  buildRoots(); buildWood(g.nodes.length); buildLeaves(null); buildWires();
  hours = hoursTo = GCFG.START_HOUR + g.turn*24/GCFG.TURNS_PER_DAY;
  cam.focus.set(g.follow.x*0.6, g.follow.y, g.follow.z*0.6);
  setMode('follow');
  $('over').hidden = true;
  save();
  busy = false;
  render();
  if (g.over) showOver();
}
function render(){ refreshMarkers(); renderUI(); }

const CARD_COLOR = {pinch:'#7dffb0', cut:'#ff7a5a', wire:'#e0a060', root:'#c9a2ff'};
const VERB = {pinch:'Pinch', cut:'Cut here', wire:'Wire', root:'Wake bud'};
const ICON = {
  cut:'<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/></svg>',
  pinch:'<svg viewBox="0 0 24 24"><path d="M12 21V8"/><path d="M12 15c-3.5 0-5.5-2-5.5-5 3.5 0 5.5 2 5.5 5zM12 12c3.5 0 5.5-2 5.5-5-3.5 0-5.5 2-5.5 5z"/><path d="M9 4.5h6"/></svg>',
  wire:'<svg viewBox="0 0 24 24"><circle cx="17" cy="7" r="3.5"/><path d="M3 20c2.5-1 2-4 4.5-4.5S10 18 12.5 16s1-5 3.5-6"/></svg>',
  root:'<svg viewBox="0 0 24 24"><path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/><path d="M12 11v6M9 14h6"/></svg>',
};
const RAIN = '<svg viewBox="0 0 24 24" style="fill:none;stroke:currentColor;stroke-width:2"><path d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.3 3.3 0 0 1 17 15z"/><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/></svg>';
const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>', MOON = '<svg viewBox="0 0 24 24"><path d="M15 3a9 9 0 1 0 6 13A7 7 0 0 1 15 3z"/></svg>';
let tipFor = -1;
// if no shoot that can be wired is on screen, ride to the nearest one
function showWireable(){
  const ids = targets(g, 'wire');
  if (!ids.length) return;
  const rect = canvas.getBoundingClientRect(), nodes = ids.map(id => g.nodes[id]);
  const onScreen = nodes.some(n => { const q = project(P(n)); return q && q.x > 0 && q.y > 0 && q.x < rect.width && q.y < rect.height*0.8; });
  if (onScreen) return;
  const near = nodes.sort((a, b) => cam.focus.distanceTo(P(a)) - cam.focus.distanceTo(P(b)))[0];
  setMode('branch', near.id);
}
function showTip(i){
  tipFor = tipFor === i ? -1 : i;
  const k = g.hand[i];
  $('tip').hidden = tipFor < 0;
  if (tipFor >= 0){ $('tipname').textContent = CARDS[k].name; $('tiptext').textContent = cardText(k, g.species); }
}
function renderUI(){
  if (active >= g.hand.length) active = 0;
  const card = g.hand[active];
  const hand = $('hand'); hand.textContent = '';
  for (let i=0;i<GCFG.HAND;i++){
    const slot = document.createElement('div'), k = g.hand[i];
    slot.className = 'slot' + (k ? '' : ' empty');
    if (k){
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hcard'; b.style.setProperty('--stripe', CARD_COLOR[k]);
      b.setAttribute('aria-pressed', String(i === active));
      b.innerHTML = ICON[k] + `<span>${CARDS[k].name}</span>`;
      b.addEventListener('click', () => {
        if (anim) return;
        if (active !== i){ active = i; sel = null; if (k === 'wire') showWireable(); }
        $('tip').hidden = true; tipFor = -1; render();
      });
      const q = document.createElement('button');
      q.type = 'button'; q.className = 'q'; q.textContent = '?'; q.setAttribute('aria-label', `What does ${CARDS[k].name} do?`);
      q.addEventListener('click', e => { e.stopPropagation(); showTip(i); });
      slot.append(b, q);
    }
    hand.appendChild(slot);
  }
  if (tipFor >= g.hand.length){ tipFor = -1; $('tip').hidden = true; }
  // a very short hint; the card's own text sits behind its ?
  let prompt = '', ready = false;
  const discard = canDiscard(g, active);
  if (discard) prompt = 'Nothing to use it on';
  else if (card === 'pinch'){ ready = sel?.shoot != null; prompt = ready ? '' : 'Tap a shoot tip'; }
  else if (card === 'cut'){ ready = sel?.node != null; prompt = ready ? 'Swipe to move the cut' : 'Tap a branch'; }
  else if (card === 'root'){ ready = sel?.node != null; prompt = ready ? '' : 'Tap a green bud mark'; }
  else if (card === 'wire'){ ready = sel?.ring != null; prompt = sel?.node == null ? 'Tap an orange branch to tie' : ready ? 'Swipe to move the tie' : 'Tap a glowing ring'; }
  $('prompt').textContent = anim ? '' : prompt;
  const go = $('confirm');
  go.textContent = discard ? 'Discard' : VERB[card];
  go.hidden = !(ready || discard) || !!anim;
  $('cancel').hidden = !sel || !!anim;
  $('h').textContent = g.maxY.toFixed(2) + ' m';
  const hp = Math.round(g.health*100);
  $('hpbar').style.width = hp + '%';
  $('hpbar').style.background = hp > 65 ? '#9be37a' : hp > 40 ? '#ffd166' : '#ff6a55';
  const hr = hourOf(g.turn);
  $('clock').innerHTML = (rainingAt(g.turn) ? RAIN : isDay(g.turn) ? SUN : MOON) + `<span>${String(Math.floor(hr)).padStart(2,'0')}:00</span>`;
  if (!$('menu').hidden) renderMenu();
}
function renderMenu(){
  $('mnt').textContent = SPECIES[g.species].name;
  $('undobtn').disabled = !g.log.length;
  $('m-s').textContent = score(g);
  $('m-p').textContent = g.peak.toFixed(1) + ' m';
  $('m-hp').textContent = Math.round(g.health*100) + '%';
  $('m-n').textContent = g.shoots.length;
  const stuck = plan ? plan.info.filter(i => i.blockedAhead && !i.slide).length : 0, sliding = plan ? plan.info.filter(i => i.blockedAhead && i.slide).length : 0;
  const m = g.modules.find(m => g.follow.y >= m.y0 && g.follow.y < m.y1);
  $('m-place').textContent = (m ? {court:'Courtyard', chamber:'Chamber', tower:'Tower', terrace:'Terrace'}[m.type] + ` · ${['Atlantean','Angkor','Maya'][m.style]} · stratum ${m.k + 1}` : '')
    + (sliding ? ` · ${sliding} creeping along stone` : '') + (stuck ? ` · ${stuck} stuck` : '');
  $('m-time').textContent = `Day ${dayOf(g.turn)}, ${String(Math.floor(hourOf(g.turn))).padStart(2,'0')}:00 · turn ${g.turn + 1}` + (rainingAt(g.turn) ? ' · rain' : mistAt(g.turn) ? ' · mist' : '');
  $('m-run').textContent = `Tree ${g.seed} · ` + STYLES.map((s,i) => [s, Math.round(g.blend[i]*100)]).sort((a,b) => b[1]-a[1]).map(([s,p]) => `${s} ${p}%`).join(' · ');
}
$('confirm').addEventListener('click', () => {
  const card = g.hand[active], i = active;
  if (canDiscard(g, i)) return doTurn({i, discard:true});
  if (card === 'pinch' && sel?.shoot != null) doTurn({i, card, shoot:sel.shoot});
  if ((card === 'cut' || card === 'root') && sel?.node != null) doTurn({i, card, node:sel.node});
  if (card === 'wire' && sel?.ring != null) doTurn({i, card, node:sel.node, ring:sel.ring});
});
$('cancel').addEventListener('click', () => { sel = null; setMode('follow'); render(); });
$('followbtn').addEventListener('click', () => setMode('follow'));
$('newbtn').addEventListener('click', () => { $('menu').hidden = true; showPicker(true); });
// choosing a tree: from the menu (the current tree is lost), after a run ends, and on a first visit
function showPicker(warn){
  const box = $('picklist'); box.textContent = '';
  for (const [id, sp] of Object.entries(SPECIES)){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pick';
    b.innerHTML = `<span class="pn">${sp.name}</span><span class="pl">${sp.latin}</span><span class="pb">${sp.blurb}</span>`;
    b.addEventListener('click', () => { $('picker').hidden = true; $('menu').hidden = true; $('over').hidden = true; startRun(1 + Math.floor(Math.random()*999999), [], id); });
    box.appendChild(b);
  }
  $('pickwarn').hidden = !warn; $('pickcancel').hidden = !warn;
  $('picker').hidden = false;
}
$('pickcancel').addEventListener('click', () => { $('picker').hidden = true; });
$('aboutbtn').addEventListener('click', () => { $('menu').hidden = true; $('about').hidden = false; });
$('menubtn').addEventListener('click', () => { renderMenu(); $('menu').hidden = false; });
$('menuok').addEventListener('click', () => { $('menu').hidden = true; });
$('menu').addEventListener('click', e => { if (e.target === $('menu')) $('menu').hidden = true; });
$('about').addEventListener('click', e => { if (e.target === $('about')) $('about').hidden = true; });
$('tip').addEventListener('click', () => { $('tip').hidden = true; tipFor = -1; });
$('aboutok').addEventListener('click', () => { $('about').hidden = true; });
$('o-new').addEventListener('click', () => { $('over').hidden = true; showPicker(false); });
$('o-look').addEventListener('click', () => { $('over').hidden = true; });
// undo: the run is its seed plus the list of moves, so dropping the last move and replaying restores the tree exactly
function undo(){
  if (anim || busy || !g.log.length) return;
  $('menu').hidden = true;
  startRun(g.seed, g.log.slice(0, -1), g.species);
  toast('Undone');
}
$('undobtn').addEventListener('click', undo);
$('o-undo').addEventListener('click', undo);
function showOver(){
  $('o-h').textContent = g.peak.toFixed(2) + ' m';
  $('o-hp').textContent = Math.round(avgHealth(g)*100) + '%';
  $('o-s').textContent = score(g);
  $('o-t').textContent = g.turn;
  $('over').hidden = false;
}

// only events worth interrupting for; routine results show on the tree itself
const MSG = {
  dieback:'A shoot died back', jin:'A bare branch died to deadwood', dying:'A bare branch is dying', snap:'A long shoot snapped off', set:'A branch has set; its wire came off',
  weak:'The tree is weak', last:'Last living shoot', over:'No living shoots left',
};
function eventToast(e){
  if (e.type === 'stratum') return toast(`Stratum ${e.k + 1}`);
  if (MSG[e.type]) toast(MSG[e.type]);
}
const recent = new Map();
function toast(text){
  const now = performance.now(); if (recent.get(text) > now - 1500) return; recent.set(text, now);
  const box = $('toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; box.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3600); setTimeout(() => t.remove(), 4200);
}

function resize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w/2, h/2);
  camera.aspect = w/h;
  camera.fov = clamp(2*Math.atan(Math.tan(24*Math.PI/180)/camera.aspect)*180/Math.PI, 45, 78);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- environment: wind gusts, falling leaves, butterflies by day ----------
// Wind: a slow, irregular gust strength that drives sway, leaf flutter and leaf fall.
const windDir = V(0.8, 0, 0.6).normalize();
function gustAt(t){ const a = 0.5 + 0.5*Math.sin(t*0.11)*Math.sin(t*0.047 + 1.3); return clamp(a*a*1.6 + 0.1*Math.sin(t*0.9), 0, 1); }
// Falling leaves: old fig leaves turn yellow and drop; more in a gust. A small recycled pool.
const FALL = 12, fallMat = new THREE.MeshStandardMaterial({map:leafTex, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.75});
const fallMesh = new THREE.InstancedMesh(leafGeo, fallMat, FALL); fallMesh.frustumCulled = false; fallMesh.castShadow = true; scene.add(fallMesh);
const falling = Array.from({length:FALL}, () => ({live:false})), envR = mulberry32(77), envD = new THREE.Object3D(), envC = new THREE.Color();
for (let i=0;i<FALL;i++){ envD.scale.setScalar(0); envD.updateMatrix(); fallMesh.setMatrixAt(i, envD.matrix); fallMesh.setColorAt(i, envC.setHSL(0.13 + envR()*0.05, 0.6, 0.38)); }
// Butterflies: two hinged wings each, flapping, wandering around the foliage near the camera's focus. Day only.
const wingTex = canvasTex(64, 64, (c) => {
  c.fillStyle = '#ffffff';
  c.beginPath(); c.ellipse(26, 22, 24, 18, -0.35, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(20, 46, 15, 13, 0.4, 0, TAU); c.fill();
  c.fillStyle = 'rgba(30,24,20,0.85)'; c.beginPath(); c.arc(36, 16, 5, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(30,24,20,0.7)'; c.lineWidth = 3; c.beginPath(); c.ellipse(26, 22, 22, 16, -0.35, 0, TAU); c.stroke();
}, false);
const BUTTER = 3, wingGeo = new THREE.PlaneGeometry(0.06, 0.06); wingGeo.translate(0.03, 0, 0);
const wingMat = new THREE.MeshStandardMaterial({map:wingTex, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.6, emissive:0x222222});
const wingMesh = new THREE.InstancedMesh(wingGeo, wingMat, BUTTER*2); wingMesh.frustumCulled = false; scene.add(wingMesh);
const butter = Array.from({length:BUTTER}, (_, i) => ({ph:envR()*TAU, sp:0.7 + envR()*0.6, r:0.5 + envR()*0.8, y:-0.2 + envR()*1.2}));
const WING_COL = [0xffd23a, 0x5ad8ff, 0xff7a3a];
for (let i=0;i<BUTTER;i++){ envC.set(WING_COL[i]); wingMesh.setColorAt(i*2, envC); wingMesh.setColorAt(i*2+1, envC); }
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), ax = {x:V(1,0,0), y:V(0,1,0), z:V(0,0,1)};
function stepEnv(dt, t){
  const gust = gustAt(t);
  windU.value = gust;
  // drop a leaf now and then from a shoot near the view
  if (g && g.shoots.length && envR() < dt*(0.08 + 0.7*gust)){
    const f = falling.find(f => !f.live);
    const near = g.shoots.map(s => g.nodes[s.node]).filter(n => Math.abs(n.y - cam.focus.y) < 2.5);
    if (f && near.length){
      const n = near[Math.floor(envR()*near.length)];
      Object.assign(f, {live:true, age:0, p:V(n.x + (envR()-.5)*0.15, n.y, n.z + (envR()-.5)*0.15), spin:V(envR()*TAU, envR()*TAU, envR()*TAU), ph:envR()*TAU, life:9 + envR()*6});
    }
  }
  falling.forEach((f, i) => {
    if (!f.live) return;
    f.age += dt;
    f.p.y -= dt*(0.22 + 0.06*Math.sin(t*2 + f.ph));
    f.p.addScaledVector(windDir, dt*(0.05 + 0.35*gust));
    f.p.x += Math.sin(t*1.7 + f.ph)*dt*0.12; f.p.z += Math.cos(t*1.3 + f.ph)*dt*0.12;
    if (Math.hypot(f.p.x, f.p.z) > GCFG.HALF - 0.1) f.p.multiplyScalar(0.995);
    f.spin.x += dt*1.6; f.spin.z += dt*2.1;
    const k = clamp(Math.min(f.age*3, (f.life - f.age)*1.5), 0, 1);
    if (f.age > f.life || f.p.y < -0.7){ f.live = false; }
    envD.position.copy(f.p); envD.rotation.set(f.spin.x, f.spin.y, f.spin.z); envD.scale.setScalar(f.live ? k : 0); envD.updateMatrix();
    fallMesh.setMatrixAt(i, envD.matrix);
  });
  fallMesh.instanceMatrix.needsUpdate = true;
  // butterflies fade out at dusk; fireflies (the motes) take over at night
  const show = clamp(1 - nightK*2.5, 0, 1)*(1 - rainK);  // butterflies shelter from rain
  wingMesh.visible = show > 0.02;
  butter.forEach((b, i) => {
    const a = b.ph + t*0.3*b.sp, r = b.r + 0.25*Math.sin(t*0.5 + b.ph);
    const x = Math.cos(a)*r + cam.focus.x*0.5, z = Math.sin(a)*r + cam.focus.z*0.5;
    const y = cam.focus.y + b.y + 0.2*Math.sin(t*1.1*b.sp + b.ph) + 0.05*Math.sin(t*7 + b.ph);
    const yaw = -a, flap = 0.25 + 0.95*Math.abs(Math.sin(t*14*b.sp + b.ph));
    for (const side of [1, -1]){
      qa.setFromAxisAngle(ax.y, yaw); qb.setFromAxisAngle(ax.z, side*flap); qc.setFromAxisAngle(ax.x, -Math.PI/2);
      qa.multiply(qb).multiply(qc);
      envD.position.set(x, y, z); envD.quaternion.copy(qa); envD.scale.set(side*show, show, show); envD.updateMatrix();
      wingMesh.setMatrixAt(i*2 + (side > 0 ? 0 : 1), envD.matrix);
    }
  });
  wingMesh.instanceMatrix.needsUpdate = true;
}

// ---------- weather: rain and mist (visual only) ----------
// Rain comes in seeded spells of four turns, so a replay or undo brings back the same weather. Mist gathers in the
// early morning and in rain.
function rainingAt(turn){ return (hashInt(g.seed, 31, Math.floor(turn/4)) % 100) < 22; }
function mistAt(turn){ const h = hourOf(turn); return Math.max(rainingAt(turn) ? 0.8 : 0, h >= 4 && h < 10 ? 0.7 : 0); }
const DROPS = 420, SPLASH = 90;
const dropPos = new Float32Array(DROPS*6), drops = Array.from({length:DROPS}, () => ({y:-99, floor:0, x:0, z:0, v:0, drip:false}));
const dropGeo = new THREE.BufferGeometry(); dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
// rain streaks fade near the camera and vanish in the line of sight to what the camera looks at, like the stone does
const dropMat = new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, fog:false,
  uniforms:{color:{value:new THREE.Color(0xc8d8e8)}, opacity:{value:0}, uCam:cutU.cam, uFocus:cutU.focus, uCutR:cutU.r},
  vertexShader:`varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader:`uniform vec3 color, uCam, uFocus; uniform float opacity, uCutR; varying vec3 vW;
    void main(){
      float a = opacity*smoothstep(0.7, 1.8, distance(vW, uCam));
      vec3 ab = uFocus - uCam; float tt = dot(vW - uCam, ab)/dot(ab, ab);
      if (tt > 0.0 && tt < 1.1){ float d = length(vW - (uCam + ab*clamp(tt, 0.0, 1.0))); a *= smoothstep(uCutR*0.5, uCutR*1.1, d); }
      gl_FragColor = vec4(color, a);
    }`,
});
const rainLines = new THREE.LineSegments(dropGeo, dropMat); rainLines.frustumCulled = false; rainLines.renderOrder = 6; scene.add(rainLines);
const splashPos = new Float32Array(SPLASH*3).fill(-99), splashAge = new Float32Array(SPLASH).fill(9); let splashNext = 0;
const splashGeo = new THREE.BufferGeometry(); splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
const splashMat = new THREE.PointsMaterial({map:spriteTex, size:0.05, transparent:true, opacity:0, depthWrite:false, color:0xdde8f0});
const splashes = new THREE.Points(splashGeo, splashMat); splashes.frustumCulled = false; scene.add(splashes);
const mistTex = canvasTex(128, 128, (c) => {
  const R = mulberry32(5);
  for (let i=0;i<14;i++){
    const x = 34 + R()*60, y = 40 + R()*48, r = 18 + R()*26, rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,0.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg; c.fillRect(0, 0, 128, 128);
  }
}, false);
const MIST = 9, mists = [];
for (let i=0;i<MIST;i++){
  const m = new THREE.Sprite(new THREE.SpriteMaterial({map:mistTex, transparent:true, opacity:0, depthWrite:false, color:0xeef2f4}));
  m.userData = {a:envR()*TAU, r:0.8 + envR()*2.4, y:-1.4 + envR()*3.2, s:2.6 + envR()*2.2, sp:0.02 + envR()*0.03};
  m.renderOrder = 7; scene.add(m); mists.push(m);
}
// Rain follows the ruins (see waterMap in sim.js): from the sky it falls only where a column is open above the view,
// and lands on the first stone; elsewhere water drips from the edges of wet stone and falls, accelerating, to the next
// surface below. The map is rebuilt when the ruins grow.
let water = null;
function waterNow(){
  if (!water || water.seed !== g.seed || water.mods !== g.modules.length){ water = waterMap(g); water.seed = g.seed; water.mods = g.modules.length; }
  return water;
}
function respawnDrop(d, top){
  const w = waterNow(), lo = cam.focus.y - 5;
  d.y = -99; d.floor = -100;
  if (envR() < 0.55){
    // from the sky, where the column is open above the top of the view
    for (let tries=0; tries<6; tries++){
      const i = Math.floor(envR()*w.n), k = Math.floor(envR()*w.n), floor = w.top[k*w.n + i];
      if (floor > top - 0.5) continue;
      d.x = -w.half + (i + envR())*w.cell; d.z = -w.half + (k + envR())*w.cell;
      d.y = top - envR()*(top - Math.max(floor, lo)); d.floor = floor; d.v = 6.5 + envR()*1.5; d.drip = false;
      return;
    }
  } else if (w.emit.length){
    // a drip from the edge of wet stone within the view
    for (let tries=0; tries<8; tries++){
      const e = Math.floor(envR()*w.emit.length/5)*5, y0 = w.emit[e+3], y1 = w.emit[e+4];
      if (y0 > top || y0 < lo) continue;
      const along = (envR() - 0.5)*w.cell;
      d.x = w.emit[e] + (w.emit[e+2] ? along : 0); d.z = w.emit[e+1] + (w.emit[e+2] ? 0 : along);
      d.y = y0 - 0.01; d.floor = y1; d.v = 0.2 + envR()*0.6; d.drip = true;
      return;
    }
  }
}
function stepWeather(dt, t, ease){
  if (!g) return;  // ease: real elapsed time, so fades take the same time at any frame rate
  const tgtRain = rainingAt(g.turn) ? 1 : 0, tgtMist = mistAt(g.turn);
  rainK += (tgtRain - rainK)*Math.min(1, ease*0.35);
  mistK += (tgtMist - mistK)*Math.min(1, ease*0.25);
  wetK = rainK > wetK ? wetK + (rainK - wetK)*Math.min(1, ease*0.5) : wetK + (rainK - wetK)*Math.min(1, ease*0.04);
  const top = cam.focus.y + 4.5, slant = 0.15 + 0.35*windU.value;
  rainLines.visible = rainK > 0.01;
  dropMat.uniforms.opacity.value = 0.5*rainK;
  if (rainLines.visible){
    for (let i=0;i<DROPS;i++){
      const d = drops[i];
      if (d.y <= d.floor || d.y < cam.focus.y - 5){
        if (d.y > -90 && d.y <= d.floor && envR() < rainK){ const k = splashNext++ % SPLASH; splashPos[k*3] = d.x; splashPos[k*3+1] = d.floor + 0.02; splashPos[k*3+2] = d.z; splashAge[k] = 0; }
        respawnDrop(d, top);
        if (i/DROPS > rainK){ d.y = -99; d.floor = -100; }  // thin the rain as it starts and stops
      }
      if (d.drip) d.v = Math.min(7, d.v + 9.8*dt);  // drips start slow and accelerate under gravity
      const drift = d.drip ? 0 : slant;
      d.y -= d.v*dt; d.x += windDir.x*drift*dt; d.z += windDir.z*drift*dt;
      const o = i*6, len = 0.03 + d.v*0.035;  // a streak as long as the eye blurs it
      dropPos[o] = d.x; dropPos[o+1] = Math.max(d.y, d.floor); dropPos[o+2] = d.z;
      const dv = Math.max(d.v, 0.5); dropPos[o+3] = d.x - windDir.x*drift/dv*len; dropPos[o+4] = Math.max(d.y, d.floor) + len; dropPos[o+5] = d.z - windDir.z*drift/dv*len;
    }
    dropGeo.attributes.position.needsUpdate = true;
  }
  for (let k=0;k<SPLASH;k++){ splashAge[k] += dt; if (splashAge[k] > 0.18) splashPos[k*3+1] = -99; }
  splashGeo.attributes.position.needsUpdate = true;
  splashMat.opacity = 0.6*rainK; splashes.visible = rainK > 0.01;
  // mist banks drift slowly with the wind around the view
  for (const m of mists){
    const u = m.userData; u.a += dt*u.sp*(1 + windU.value);
    m.position.set(Math.cos(u.a)*u.r, cam.focus.y + u.y + 0.15*Math.sin(t*0.1 + u.a*3), Math.sin(u.a)*u.r);
    m.scale.setScalar(u.s);
    m.material.opacity = 0.14*mistK*(1 - 0.6*nightK);
    m.visible = mistK > 0.01;
  }
}

const clock = new THREE.Clock();
let first = true;
function frame(){
  const raw = clock.getDelta(), dt = Math.min(0.05, raw);
  timeU.value += dt;
  const wasAnim = !!anim;
  stepAnim(Math.min(raw, 0.1));
  if (wasAnim && !anim) renderUI();
  if (Math.abs(hoursTo - hours) > 0.001) hours += (hoursTo - hours)*Math.min(1, raw*1.8);
  applyTime();
  const gl = goal();
  if (gl) cam.focus.lerp(gl, Math.min(1, raw*(cam.mode === 'branch' ? 6 : 1.6)));
  const ce = Math.cos(cam.el);
  camera.position.set(cam.focus.x + Math.sin(cam.az)*ce*cam.dist, cam.focus.y + Math.sin(cam.el)*cam.dist, cam.focus.z + Math.cos(cam.az)*ce*cam.dist);
  camera.lookAt(cam.focus);
  sun.target.position.set(cam.focus.x*0.5, cam.focus.y + 0.5, cam.focus.z*0.5);
  sky.position.copy(camera.position);
  cutU.cam.value.copy(camera.position); cutU.focus.value.copy(cam.focus);
  const t = timeU.value;
  stepEnv(dt, t); stepWeather(dt, t, Math.min(raw, 0.5));
  for (let i=0;i<MOTES;i++){
    const [a, r, y, ph, sp] = moteSeed[i], aa = a + t*0.05*sp;
    motePos[i*3] = Math.cos(aa)*r + Math.sin(t*0.7*sp+ph)*0.15;
    motePos[i*3+1] = cam.focus.y + y + Math.sin(t*0.5*sp+ph*2)*0.25;
    motePos[i*3+2] = Math.sin(aa)*r + Math.cos(t*0.6*sp+ph)*0.15;
  }
  moteGeo.attributes.position.needsUpdate = true;
  magic.position.copy(cam.focus).add(V(0, 0.3, 0.3));
  composer.render();
  if (first){ first = false; $('msg').hidden = true; }
  requestAnimationFrame(frame);
}

resize();
const saved = store.get(KEY);
try { startRun(saved?.seed ?? (1 + Math.floor(Math.random()*999999)), saved?.log ?? [], saved?.species ?? 'fig'); if (!saved) showPicker(false); }
catch (e) { console.error(e); startRun(1 + Math.floor(Math.random()*999999)); }
// console handle for testing: bonzai.g is the live game
window.bonzai = { get g(){ return g; }, get meshes(){ return {woodMesh, deadMesh, leafMesh, markers, cutMesh}; }, turn: doTurn, get active(){ return active; }, set active(v){ active = v; render(); }, cam, get animating(){ return !!anim; }, setMode, onTap, get sel(){ return sel; }, set sel(v){ sel = v; render(); } };
requestAnimationFrame(frame);
