// Bonzai growth prototype v1: renders grow/sim.js. The whole tree grows, animated, each turn;
// the camera follows the growth, and you can tap a branch and swipe to travel along it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GCFG, STYLES, newWorld, replayWorld, growTurn, updateRadii, hourOf, dayOf, isDay, mulberry32, hashInt } from './sim.js';

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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
const timeU = {value:0}, animU = {value:1e4};
const leafMat = new THREE.MeshStandardMaterial({map:leafTex, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.7, metalness:0});
leafMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = timeU; sh.uniforms.uAnim = animU;
  sh.vertexShader = 'uniform float uTime; uniform float uAnim; attribute float aStart;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed *= smoothstep(aStart, aStart + 0.45, uAnim);
  #ifdef USE_INSTANCING
    vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float sw = sin(uTime*1.7 + ip.x*2.3 + ip.z*1.9)*0.6 + sin(uTime*3.1 + ip.y*4.1 + ip.x)*0.4;
    transformed.x += sw*0.12*position.y;
    transformed.z += sw*0.08*position.y;
  #endif`);
};
const leafDepth = new THREE.MeshDepthMaterial({map:leafTex, alphaTest:0.5, depthPacking:THREE.RGBADepthPacking});
leafDepth.onBeforeCompile = sh => {
  sh.uniforms.uAnim = animU;
  sh.vertexShader = 'uniform float uAnim; attribute float aStart;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed *= smoothstep(aStart, aStart + 0.45, uAnim);');
};
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

// stone between the camera and what it looks at is screen-door faded, so the tree is never hidden
const cutU = {cam:{value:new THREE.Vector3()}, focus:{value:new THREE.Vector3()}, r:{value:1.25}};
function addCutaway(mat){
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCam = cutU.cam; sh.uniforms.uFocus = cutU.focus; sh.uniforms.uCutR = cutU.r;
    sh.vertexShader = 'varying vec3 vCutW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vCutW = (modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = 'uniform vec3 uCam; uniform vec3 uFocus; uniform float uCutR; varying vec3 vCutW;\n' + sh.fragmentShader.replace('void main() {', `void main() {
      vec3 ab = uFocus - uCam; float tt = dot(vCutW - uCam, ab)/dot(ab, ab);
      if (tt > -0.2 && tt < 0.93){
        float d = length(vCutW - (uCam + ab*clamp(tt, 0.0, 1.0)));
        float rr = uCutR*(0.75 + 0.5*clamp(tt, 0.0, 1.0));
        // ordered 4x4 dither: fully open in the core, a clean patterned edge
        vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
        float bayer = (mod(q.x + q.y*2.0, 4.0)*4.0 + mod(q.y + q.x*3.0, 4.0))/16.0;
        if (bayer < smoothstep(rr, rr*0.8, d)) discard;
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
      const a = j/radial*TAU, ca = Math.cos(a), sa = Math.sin(a);
      n.copy(fr.normals[i]).multiplyScalar(ca).addScaledVector(fr.binormals[i], sa).normalize();
      let k = 1 + knob*(vnoise(P.x*knobF+ca*0.8+phase, P.y*knobF, P.z*knobF+sa*0.8)-0.5)*2;
      if (fl > 0) k += fl*Math.pow(Math.max(0, Math.sin(flutes*a + twist*u*TAU + phase)), 2);
      pos.push(P.x+n.x*r*k, P.y+n.y*r*k, P.z+n.z*r*k);
      uv.push(j/radial*2 + twist*u*0.3, u*L*0.9);
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
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
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
let hours = GCFG.START_HOUR, hoursTo = hours;
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
  const useSun = el > -0.06;
  sun.position.copy(useSun ? sunDir : moonDir).multiplyScalar(18).add(sun.target.position);
  lerpHex(p.a.light, p.b.light, p.t, sun.color);
  sun.intensity = p.n('li') * (useSun ? clamp((el+0.06)*10, 0, 1) : clamp((-el-0.06)*8, 0, 1));
  const dayLight = useSun ? clamp(el*5, 0, 1) : 0;
  lerpHex(p.a.hs, p.b.hs, p.t, hemi.color); lerpHex(p.a.hg, p.b.hg, p.t, hemi.groundColor);
  hemi.intensity = p.n('hi'); amb.intensity = p.n('amb');
  renderer.toneMappingExposure = p.n('exp');
  const glow = p.n('glow');
  fill.intensity = p.n('fill');
  bloomMat.emissiveIntensity = glow*2.4;
  barkMat.emissiveIntensity = glow*0.5;
  magic.color.copy(world.glow); magic.intensity = glow*1.3;
  if (world.glowMat) world.glowMat.emissiveIntensity = 0.35 + glow*2.2;
  moteMat.color.copy(MOTE_DAY).lerp(world.glow, glow);
  moteMat.opacity = 0.3 + glow*0.55; moteMat.size = 0.028 + glow*0.012;
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
const BLOSSOM = [new THREE.Color(0x9ff0ff), new THREE.Color(0xff5fa2), new THREE.Color(0xff9a2e)];
const mixW = (arr, w) => { const c = new THREE.Color(0,0,0); arr.forEach((k,i) => c.add(k.clone().multiplyScalar(w[i]))); return c; };
let world = {group:null, built:0, beams:[], glow:new THREE.Color(1,1,1), disposables:[]};

function resetWorld(){
  if (world.group){ scene.remove(world.group); world.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); world.disposables.forEach(d => d.dispose()); }
  const w = g.blend;
  const stoneTex = makeStoneTex(w, mulberry32(hashInt(g.seed, 11)));
  const stoneMat = addCutaway(new THREE.MeshStandardMaterial({map:stoneTex, bumpMap:stoneTex, bumpScale:2.2, roughness:0.95, vertexColors:true, color:mixW(STONE_TINT, w)}));
  const glowCol = mixW(GLOW, w);
  const glowMat = addCutaway(new THREE.MeshStandardMaterial({color:glowCol, emissive:glowCol, emissiveIntensity:0.4, roughness:0.35, metalness:0.6}));
  barkMat.emissive.copy(glowCol); bloomMat.emissive.copy(glowCol);
  world = {group:new THREE.Group(), built:0, beams:[], glow:glowCol, stoneMat, glowMat, disposables:[stoneTex, stoneMat, glowMat]};
  scene.add(world.group);
}
function buildModule(m){
  const R = mulberry32(hashInt(g.seed, 300 + m.i));
  const w = g.blend, moss = 0.5 + w[1]*1.2;
  const geos = [], glowGeos = [];
  let sk = m.i*5000;
  const place = (geo, x, y, z, ry) => { if (ry) geo.rotateY(ry); geo.translate(x, y, z); geos.push(geo); };
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
      if (st === 0){ for (const fy of [0.3, 0.75]) { const t = new THREE.TorusGeometry(o.r*1.05, 0.018, 8, 32); t.rotateX(Math.PI/2); t.translate(o.cx, o.cy - o.hy + h*fy, o.cz); glowGeos.push(t); } }
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
      for (let k=0;k<4;k++){ const a = k*Math.PI/2, bx = new THREE.BoxGeometry(2*GCFG.HALF, 0.05, 0.03); bx.rotateY(-a + Math.PI/2); bx.translate(Math.cos(a)*(GCFG.HALF-0.005), gl.y, Math.sin(a)*(GCFG.HALF-0.005)); glowGeos.push(bx); }
    } else { const bx = new THREE.BoxGeometry(gl.len, 0.04, GCFG.WALL_T*1.05); bx.rotateY(gl.ry); bx.translate(gl.x, gl.y, gl.z); glowGeos.push(bx); }
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
function syncWorld(){ while (world.built < g.modules.length) buildModule(g.modules[world.built++]); }

// ---------- tree ----------
let woodMesh = null, leafMesh = null, blossomMesh = null, newSegs = null, anim = null;
const segGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); segGeo.translate(0, 0.5, 0);
const leafGeo = new THREE.PlaneGeometry(0.085, 0.15); leafGeo.translate(0, 0.075, 0);
const P = n => V(n.x, n.y, n.z);

function chainsOf(limit){
  const N = g.nodes, size = new Array(limit).fill(1);
  for (let i=limit-1;i>0;i--) if (N[i].parent >= 0) size[N[i].parent] += size[i];
  const out = [], stack = [[0, -1]];
  while (stack.length){
    const [start, from] = stack.pop();
    const ids = from >= 0 ? [from] : [];
    let cur = start;
    for (;;){
      ids.push(cur);
      const ch = N[cur].children.filter(c => c < limit).sort((a,b) => size[b]-size[a]);
      if (!ch.length) break;
      for (let i=1;i<ch.length;i++) stack.push([ch[i], cur]);
      cur = ch[0];
    }
    out.push(ids);
  }
  return {chains:out, size};
}
function buildWood(limit){
  if (woodMesh){ scene.remove(woodMesh); woodMesh.geometry.dispose(); woodMesh = null; }
  const N = g.nodes, {chains} = chainsOf(limit), geos = [];
  for (const ids of chains){
    if (ids.length < 2) continue;
    const pts = ids.map(id => P(N[id]));
    const rad = ids.map((id, i) => i === 0 && ids[0] !== 0 ? Math.min(N[id].r, N[ids[1]].r*1.25) : N[id].r);
    const r0 = rad[0], trunk = ids[0] === 0;
    if (trunk){ pts[0] = V(pts[0].x, -0.08, pts[0].z); rad[0] *= 1.6; }
    geos.push(tubeGeo(pts, rad, trunk ? 22 : r0 > 0.06 ? 12 : r0 > 0.025 ? 7 : 5,
      trunk ? {knob:0.1, knobF:3.2, flutes:5, fluteAmp:0.45, fluteFade:0.12, twist:0.18, phase:g.seed%7, density:22}
            : {knob: r0 > 0.03 ? 0.08 : 0, knobF:7, density: r0 > 0.03 ? 14 : 8}));
  }
  if (!geos.length) return;
  woodMesh = new THREE.Mesh(mergeGeometries(geos), barkMat);
  woodMesh.castShadow = woodMesh.receiveShadow = true;
  scene.add(woodMesh);
}
// foliage on twig tips and the wood just behind them; each node's leaves are seeded by its id so they stay put
function buildLeaves(startOf){
  if (leafMesh){ scene.remove(leafMesh); leafMesh.dispose(); leafMesh = null; }
  if (blossomMesh){ scene.remove(blossomMesh); blossomMesh.dispose(); blossomMesh = null; }
  const N = g.nodes, dtt = new Array(N.length).fill(99);
  for (let i=N.length-1;i>=0;i--){ const n = N[i]; if (!n.children.length) dtt[i] = 0; if (n.parent >= 0) dtt[n.parent] = Math.min(dtt[n.parent], dtt[i] + 1); }
  const hue = 0.36*g.blend[0] + 0.27*g.blend[1] + 0.22*g.blend[2];
  const mats = [], starts = [], cols = [], blos = [];
  const d = new THREE.Object3D(), c = new THREE.Color();
  for (const n of N){
    if (dtt[n.id] > 3 || n.y < 0.25) continue;
    const R = mulberry32(hashInt(g.seed, n.id, 5));
    const count = dtt[n.id] === 0 ? 12 : dtt[n.id] === 1 ? 6 : 3, spread = dtt[n.id] === 0 ? 0.1 : 0.07;
    const age = g.turn - n.born;
    const st = startOf ? startOf(n.id) : -100;
    for (let k=0;k<count;k++){
      d.position.set(n.x + (R()-.5)*spread*2, n.y + (R()-.3)*spread*1.4, n.z + (R()-.5)*spread*2);
      d.lookAt(d.position.clone().add(V((R()-.5)*2, 0.6 + R(), (R()-.5)*2)));
      d.rotateZ(R()*TAU); d.scale.setScalar(0.75 + R()*0.5); d.updateMatrix();
      mats.push(d.matrix.clone()); starts.push(st);
      c.setHSL(hue + (R()-.5)*0.05, 0.5 + R()*0.15, clamp(0.16 + R()*0.1 + (age < 3 ? 0.08 : 0), 0, 0.5));
      cols.push(c.clone());
    }
    if (dtt[n.id] === 0 && hash3(n.id, 4, 2) < 0.12){
      const pick = R(), w = g.blend, bi = pick < w[0] ? 0 : pick < w[0]+w[1] ? 1 : 2;
      blos.push([new THREE.Matrix4().compose(V(n.x, n.y + 0.03, n.z), new THREE.Quaternion(), V(1,1,1).multiplyScalar(0.8 + R()*0.5)), BLOSSOM[bi], st]);
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
    blossomMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.02, 1), bloomMat, blos.length);
    blos.forEach(([m, col], i) => { blossomMesh.setMatrixAt(i, m); blossomMesh.setColorAt(i, col); });
    scene.add(blossomMesh);
  }
}

// One turn: the simulation grows, then the new shoots extend on screen in the order they grew.
const SEG_T = 0.55, STAGE_T = 0.55;
function doGrow(){
  if (anim || busy) return;
  const before = g.nodes.length;
  const added = growTurn(g);
  save();
  syncWorld();
  hoursTo = GCFG.START_HOUR + g.turn*24/GCFG.TURNS_PER_DAY;
  buildWood(before);
  const iters = Math.max(1, ...added.map(id => g.nodes[id].iter + 1));
  const start = id => g.nodes[id].iter*STAGE_T + hash3(id, 1, 1)*0.15;
  const startOf = id => id >= before ? start(id) + SEG_T*0.6 : -100;
  buildLeaves(startOf);
  if (newSegs){ scene.remove(newSegs); newSegs.dispose(); newSegs = null; }
  if (added.length){
    newSegs = new THREE.InstancedMesh(segGeo, barkMat, added.length);
    newSegs.castShadow = true;
    scene.add(newSegs);
  }
  anim = {t:0, added, start, total: iters*STAGE_T + SEG_T + 0.2};
  animU.value = 0;
  updateHud(added.length);
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
    if (newSegs){ scene.remove(newSegs); newSegs.dispose(); newSegs = null; }
    anim = null; animU.value = 1e4;
  }
}

// ---------- camera: follows growth; tap a branch and swipe to travel along it ----------
const cam = {az:0.7, el:0.2, dist:2.6, focus:V(0, 0.6, 0), mode:'follow', node:-1};
const markerMat = new THREE.MeshBasicMaterial({color:0xffe08a, transparent:true, opacity:0.9, depthTest:false, toneMapped:false});
const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), markerMat); marker.renderOrder = 20; marker.visible = false; scene.add(marker);
function goal(){
  if (cam.mode === 'branch' && cam.node >= 0){ const n = g.nodes[cam.node]; return V(n.x, n.y, n.z); }
  if (cam.mode === 'follow'){ const f = g.follow; return V(f.x*0.6, f.y, f.z*0.6); }
  return null;
}
function subtreeSizes(){ const N = g.nodes, s = new Array(N.length).fill(1); for (let i=N.length-1;i>0;i--) s[N[i].parent] += s[i]; return s; }
function travel(steps){
  if (cam.node < 0) return;
  let id = cam.node;
  const size = subtreeSizes();
  for (let i=0;i<Math.abs(steps);i++){
    const n = g.nodes[id];
    if (steps > 0){ if (!n.children.length) break; id = n.children.slice().sort((a,b) => size[b]-size[a])[0]; }
    else { if (n.parent < 0) break; id = n.parent; }
  }
  cam.node = id;
}
function setMode(mode, node=-1){
  cam.mode = mode; cam.node = node;
  marker.visible = mode === 'branch';
  $('modechip').textContent = mode === 'follow' ? 'Following the growth' : mode === 'branch' ? 'On a branch · swipe up or down to travel' : 'Looking around';
  $('followbtn').hidden = mode === 'follow';
}
function pickNode(cx, cy){
  const rect = canvas.getBoundingClientRect();
  let best = -1, bd = 34;
  for (const n of g.nodes){
    tmpV.set(n.x, n.y, n.z).project(camera);
    if (tmpV.z > 1) continue;
    const x = (tmpV.x*0.5+0.5)*rect.width, y = (-tmpV.y*0.5+0.5)*rect.height;
    const d = Math.hypot(x - cx, y - cy);
    if (d < bd){ bd = d; best = n.id; }
  }
  return best;
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
  if (gesture.pinch){
    const [a, b] = [...pointers.values()];
    cam.dist = clamp(gesture.dist*gesture.pinch/Math.max(10, Math.hypot(a.x-b.x, a.y-b.y)), 0.8, 8);
    return;
  }
  gesture.moved += Math.hypot(dx, dy);
  if (!gesture.axis && gesture.moved > 8) gesture.axis = Math.abs(e.clientX - gesture.x0) > Math.abs(e.clientY - gesture.y0) ? 'h' : 'v';
  if (gesture.axis === 'h') cam.az -= dx*0.008;
  else if (gesture.axis === 'v'){
    if (cam.mode === 'branch'){
      gesture.acc += dy;
      while (gesture.acc <= -14){ travel(1); gesture.acc += 14; }
      while (gesture.acc >= 14){ travel(-1); gesture.acc -= 14; }
    } else {
      if (cam.mode === 'follow') setMode('free');
      cam.focus.y = clamp(cam.focus.y - dy*0.01, 0, g.maxY + 1);
    }
  }
});
const endPointer = e => {
  pointers.delete(e.pointerId);
  if (gesture && !gesture.pinch && pointers.size === 0 && gesture.moved < 8 && performance.now() - gesture.t0 < 450){
    const id = pickNode(e.clientX, e.clientY);
    if (id >= 0){ setMode('branch', id); }
  }
  if (pointers.size === 0) gesture = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist*Math.exp(e.deltaY*0.001), 0.8, 8); }, {passive:false});
window.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Enter'){ if (document.activeElement === document.body) { e.preventDefault(); doGrow(); } }
  if (e.key === 'ArrowLeft') cam.az += 0.15;
  if (e.key === 'ArrowRight') cam.az -= 0.15;
  if (e.key === 'ArrowUp'){ if (cam.mode === 'branch') travel(2); else { setMode('free'); cam.focus.y += 0.2; } }
  if (e.key === 'ArrowDown'){ if (cam.mode === 'branch') travel(-2); else { setMode('free'); cam.focus.y -= 0.2; } }
});

// ---------- run, saving, HUD ----------
const KEY = 'bonzai.grow.v1';
let g, busy = false;
function save(){ store.set(KEY, {seed:g.seed, turns:g.turn}); }
function startRun(seed, turns=0){
  busy = true;
  g = turns ? replayWorld(seed, turns) : newWorld(seed);
  resetWorld(); syncWorld();
  if (newSegs){ scene.remove(newSegs); newSegs.dispose(); newSegs = null; }
  anim = null; animU.value = 1e4;
  buildWood(g.nodes.length); buildLeaves(null);
  hours = hoursTo = GCFG.START_HOUR + g.turn*24/GCFG.TURNS_PER_DAY;
  cam.focus.set(g.follow.x*0.6, g.follow.y, g.follow.z*0.6);
  setMode('follow');
  $('runname').textContent = `Tree ${seed}`;
  $('blend').textContent = STYLES.map((s,i) => [s, Math.round(g.blend[i]*100)]).sort((a,b) => b[1]-a[1]).map(([s,p]) => `${s} ${p}`).join(' · ');
  updateHud(0);
  save();
  busy = false;
}
function updateHud(added){
  $('h').textContent = g.maxY.toFixed(2) + ' m';
  const tips = g.nodes.filter(n => !n.children.length).length;
  $('stats').textContent = `${tips} twig tips · ${g.nodes.length} segments` + (g.turn ? ` · +${added} this turn` : '');
  const hr = hourOf(g.turn);
  $('clock').textContent = `Day ${dayOf(g.turn)} · ${String(Math.floor(hr)).padStart(2,'0')}:00 · ${isDay(g.turn) ? 'Day' : 'Night'} · turn ${g.turn}`;
  const m = g.modules.find(m => g.follow.y >= m.y0 && g.follow.y < m.y1);
  $('place').textContent = m ? {court:'Courtyard', chamber:'Chamber', tower:'Tower', terrace:'Terrace'}[m.type] + ` · ${['Atlantean','Angkor','Maya'][m.style]}` : '';
  $('growbtn').textContent = isDay(g.turn) ? 'Grow' : 'Grow (night: slower)';
  $('note').hidden = g.stall < 2;
}
$('growbtn').addEventListener('click', doGrow);
$('followbtn').addEventListener('click', () => setMode('follow'));
$('newbtn').addEventListener('click', () => { $('confirmnew').hidden = !$('confirmnew').hidden; });
$('newyes').addEventListener('click', () => { $('confirmnew').hidden = true; startRun(1 + Math.floor(Math.random()*999999)); });
$('newno').addEventListener('click', () => { $('confirmnew').hidden = true; });
$('aboutbtn').addEventListener('click', () => { $('about').hidden = false; });
$('aboutok').addEventListener('click', () => { $('about').hidden = true; });

function resize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w/2, h/2);
  camera.aspect = w/h;
  camera.fov = clamp(2*Math.atan(Math.tan(24*Math.PI/180)/camera.aspect)*180/Math.PI, 45, 78);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const clock = new THREE.Clock();
let first = true;
function frame(){
  const raw = clock.getDelta(), dt = Math.min(0.05, raw);
  timeU.value += dt;
  stepAnim(Math.min(raw, 0.1));
  if (Math.abs(hoursTo - hours) > 0.001) hours += (hoursTo - hours)*Math.min(1, raw*1.8);
  applyTime();
  const gl = goal();
  if (gl) cam.focus.lerp(gl, Math.min(1, raw*(cam.mode === 'branch' ? 6 : 1.6)));
  const ce = Math.cos(cam.el);
  camera.position.set(cam.focus.x + Math.sin(cam.az)*ce*cam.dist, cam.focus.y + Math.sin(cam.el)*cam.dist, cam.focus.z + Math.cos(cam.az)*ce*cam.dist);
  camera.lookAt(cam.focus);
  if (cam.mode === 'branch' && cam.node >= 0){ const n = g.nodes[cam.node]; marker.position.set(n.x, n.y, n.z); marker.scale.setScalar(Math.max(0.018, n.r*1.4)); }
  sun.target.position.set(cam.focus.x*0.5, cam.focus.y + 0.5, cam.focus.z*0.5);
  sky.position.copy(camera.position);
  cutU.cam.value.copy(camera.position); cutU.focus.value.copy(cam.focus);
  const t = timeU.value;
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
try { startRun(saved?.seed ?? (1 + Math.floor(Math.random()*999999)), saved?.turns ?? 0); }
catch (e) { console.error(e); startRun(1 + Math.floor(Math.random()*999999)); }
// console handle for testing: bonzai.g is the live tree
window.bonzai = { get g(){ return g; }, grow: doGrow, cam, get animating(){ return !!anim; }, setMode };
requestAnimationFrame(frame);
