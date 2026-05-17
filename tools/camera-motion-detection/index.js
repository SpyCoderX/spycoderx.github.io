// Camera motion detection with CPU difference, block-Fourier, and WebGL2 GPU difference.
const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');
const container = canvas.parentElement;

// Controls container
const controls = document.createElement('div');
controls.className = 'camera-controls';
controls.style.marginTop = '8px';

// Buttons
const startBtn = document.createElement('button'); startBtn.textContent = 'Start Camera';
const stopBtn = document.createElement('button'); stopBtn.textContent = 'Stop Camera'; stopBtn.disabled = true;
const snapshotBtn = document.createElement('button'); snapshotBtn.textContent = 'Snapshot → Clipboard'; snapshotBtn.style.marginLeft = '8px';

// Mirror
const mirrorLabel = document.createElement('label'); mirrorLabel.style.marginLeft = '8px';
const mirrorCheckbox = document.createElement('input'); mirrorCheckbox.type = 'checkbox';
mirrorLabel.appendChild(mirrorCheckbox); mirrorLabel.appendChild(document.createTextNode(' Mirror'));

// Resolution select (camera constraints)
const resolutionSelect = document.createElement('select');
['default','640x480','1280x720','1920x1080'].forEach(opt => { const o = document.createElement('option'); o.value = opt; o.textContent = opt; resolutionSelect.appendChild(o); });
resolutionSelect.style.marginLeft = '8px';

// Camera device selector (populated from enumerateDevices)
const deviceSelect = document.createElement('select');
deviceSelect.style.marginLeft = '8px';
const defaultDeviceOpt = document.createElement('option'); defaultDeviceOpt.value = 'default'; defaultDeviceOpt.textContent = 'Default camera'; deviceSelect.appendChild(defaultDeviceOpt);


// FPS and status
const fpsSpan = document.createElement('span'); fpsSpan.style.marginLeft = '8px'; fpsSpan.textContent = 'FPS: -';
const status = document.createElement('div'); status.style.marginTop = '6px';

controls.appendChild(startBtn); controls.appendChild(stopBtn); controls.appendChild(snapshotBtn);
controls.appendChild(mirrorLabel); controls.appendChild(deviceSelect); controls.appendChild(resolutionSelect); controls.appendChild(fpsSpan);
container.appendChild(controls); container.appendChild(status);

// Hidden video element
const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true; video.style.display = 'none';
document.body.appendChild(video);

let stream = null; let rafId = null; let lastFpsUpdate = performance.now(); let frameCount = 0;

// Motion visualization canvas
const motionCanvas = document.createElement('canvas'); motionCanvas.id = 'motionCanvas'; motionCanvas.style.marginLeft = '8px'; motionCanvas.style.border = '1px solid #666';
motionCanvas.width = 640; motionCanvas.height = 480; container.appendChild(motionCanvas);
const mctx = motionCanvas.getContext('2d');

// Processing canvas and resolution (power of two)
let procSize = 256; // default
const procCanvas = document.createElement('canvas'); procCanvas.width = procSize; procCanvas.height = procSize;
const pctx = procCanvas.getContext('2d');

// UI: mode select and controls
const modeSelect = document.createElement('select'); ['difference','fourier'].forEach(m=>{ const o=document.createElement('option'); o.value=m; o.textContent=m; modeSelect.appendChild(o); });
modeSelect.style.marginLeft = '8px';

const threshInput = document.createElement('input'); threshInput.type = 'range'; threshInput.min = 1; threshInput.max = 255; threshInput.value = 30; threshInput.style.marginLeft = '8px';
const threshLabel = document.createElement('span'); threshLabel.textContent = 'Threshold: 30'; threshLabel.style.marginLeft = '6px';

const blurCheckbox = document.createElement('input'); blurCheckbox.type = 'checkbox'; const blurLabel = document.createElement('label'); blurLabel.style.marginLeft = '8px'; blurLabel.appendChild(blurCheckbox); blurLabel.appendChild(document.createTextNode(' Blur'));

controls.appendChild(modeSelect); controls.appendChild(threshInput); controls.appendChild(threshLabel); controls.appendChild(blurLabel);

// Processing resolution selector
const procSizeSelect = document.createElement('select'); [128,256,512].forEach(n=>{ const o=document.createElement('option'); o.value=String(n); o.textContent = n + ' px'; if(n===procSize) o.selected = true; procSizeSelect.appendChild(o); }); procSizeSelect.style.marginLeft = '8px'; controls.appendChild(procSizeSelect);

threshInput.addEventListener('input', ()=>{ threshLabel.textContent = 'Threshold: ' + threshInput.value; });
procSizeSelect.addEventListener('change', ()=>{
  const val = Number(procSizeSelect.value); if(!isPowerOfTwo(val)) return; procSize = val; procCanvas.width = procSize; procCanvas.height = procSize; prevGray = null; prevBlockEnergies = null; prevBlockInitialized = false; setStatus('Processing resolution: ' + procSize + 'px'); if(gl) ensureGLSize();
});

// populate available video input devices
async function updateDeviceList(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try{
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === 'videoinput');
    const prev = deviceSelect.value;
    deviceSelect.innerHTML = '';
    const defaultOpt = document.createElement('option'); defaultOpt.value = 'default'; defaultOpt.textContent = 'Default camera'; deviceSelect.appendChild(defaultOpt);
    let i = 1;
    for(const d of videoInputs){
      const o = document.createElement('option');
      o.value = d.deviceId || d.deviceId;
      o.textContent = d.label || ('Camera ' + (i++));
      deviceSelect.appendChild(o);
    }
    if(prev) deviceSelect.value = prev;
  }catch(e){ /* ignore */ }
}

deviceSelect.addEventListener('change', ()=>{ if(stream) startCamera(); });

function setStatus(msg, isError=false){ status.textContent = msg; status.style.color = isError ? 'crimson' : ''; }

function parseResolution(value){ if(!value || value === 'default') return undefined; const [w,h] = value.split('x').map(n => parseInt(n,10)); if(Number.isFinite(w) && Number.isFinite(h)) return {width: {exact: w}, height: {exact: h}}; return undefined; }

// --- FFT helpers (CPU) ---
function isPowerOfTwo(n){ return (n & (n-1)) === 0; }
function fft1d(re, im){ const n = re.length; if(n===0) return; if(!isPowerOfTwo(n)) throw new Error('fft length must be power of two: ' + n); let j=0; for(let i=1;i<n;i++){ let bit = n>>1; for(; j & bit; bit >>=1) j ^= bit; j ^= bit; if(i<j){ const tr=re[i]; re[i]=re[j]; re[j]=tr; const ti=im[i]; im[i]=im[j]; im[j]=ti; } } for(let len=2; len<=n; len<<=1){ const ang = -2*Math.PI/len; const wlen_r = Math.cos(ang); const wlen_i = Math.sin(ang); for(let i=0;i<n;i+=len){ let wr=1, wi=0; for(let k=0;k<len/2;k++){ const u_r = re[i+k]; const u_i = im[i+k]; const v_r = re[i+k+len/2]*wr - im[i+k+len/2]*wi; const v_i = re[i+k+len/2]*wi + im[i+k+len/2]*wr; re[i+k] = u_r + v_r; im[i+k] = u_i + v_i; re[i+k+len/2] = u_r - v_r; im[i+k+len/2] = u_i - v_i; const nxt_wr = wr * wlen_r - wi * wlen_i; wi = wr * wlen_i + wi * wlen_r; wr = nxt_wr; } } } }

function fft2dMagnitude(realIn, N){ if(!isPowerOfTwo(N)) throw new Error('procSize must be power of two for 2D FFT'); const re = new Float64Array(realIn); const im = new Float64Array(N*N); for(let r=0;r<N;r++){ const rowRe = re.subarray(r*N, r*N+N); const rowIm = im.subarray(r*N, r*N+N); fft1d(rowRe, rowIm); } const colRe = new Float64Array(N), colIm = new Float64Array(N); for(let c=0;c<N;c++){ for(let r=0;r<N;r++){ colRe[r] = re[r*N + c]; colIm[r] = im[r*N + c]; } fft1d(colRe, colIm); for(let r=0;r<N;r++){ re[r*N + c] = colRe[r]; im[r*N + c] = colIm[r]; } } const mag = new Float64Array(N*N); for(let i=0;i<re.length;i++){ mag[i] = Math.log(1 + Math.hypot(re[i], im[i])); } return mag; }

// CPU state for processing
let prevGray = null; let prevBlockEnergies = null; let prevBlockInitialized = false;

// --- WebGL2 GPU pipeline (difference shader) ---
let gl = null; let glCanvas = null; let gpuSupported = false; let gpuPrograms = null;

function initWebGL(){
  if(gl) return;
  try{
    glCanvas = document.createElement('canvas'); glCanvas.width = procSize; glCanvas.height = procSize; glCanvas.style.marginLeft = '8px';
    gl = glCanvas.getContext('webgl2', {preserveDrawingBuffer:true}); if(!gl) throw new Error('WebGL2 not available'); gpuSupported = true; gpuPrograms = {};
  }catch(e){ gpuSupported = false; if(glCanvas && glCanvas.parentElement) glCanvas.parentElement.removeChild(glCanvas); gl = null; gpuPrograms = null; return; }

  const vsSrc = `#version 300 es
  precision highp float; in vec2 a_pos; in vec2 a_uv; out vec2 v_uv; void main(){ v_uv = a_uv; gl_Position = vec4(a_pos,0.0,1.0); }`;
  const fsDiff = `#version 300 es
  precision highp float; in vec2 v_uv; out vec4 outColor; uniform sampler2D u_cur; uniform sampler2D u_prev; uniform float u_thresh; uniform bool u_mirror; void main(){ vec2 uv=v_uv; if(u_mirror) uv.x=1.0-uv.x; vec3 c=texture(u_cur,uv).rgb; vec3 p=texture(u_prev,uv).rgb; float lc=dot(c,vec3(0.299,0.587,0.114)); float lp=dot(p,vec3(0.299,0.587,0.114)); float d=abs(lc-lp); float v=smoothstep(u_thresh*0.003, u_thresh*0.003+0.05, d); outColor = vec4(vec3(v),1.0); }`;
  const fsCopy = `#version 300 es
  precision highp float; in vec2 v_uv; out vec4 outColor; uniform sampler2D u_tex; uniform bool u_mirror; void main(){ vec2 uv=v_uv; if(u_mirror) uv.x=1.0-uv.x; outColor = texture(u_tex, uv); }`;

  function compile(type, src){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function link(vs, fs){ const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.bindAttribLocation(p,0,'a_pos'); gl.bindAttribLocation(p,1,'a_uv'); gl.linkProgram(p); if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }

  const vs = compile(gl.VERTEX_SHADER, vsSrc); const fs_d = compile(gl.FRAGMENT_SHADER, fsDiff); const fs_c = compile(gl.FRAGMENT_SHADER, fsCopy);
  gpuPrograms.diff = link(vs, fs_d); gpuPrograms.copy = link(vs, fs_c);

  // fullscreen quad
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const verts = new Float32Array([-1,-1,0,0, 1,-1,1,0, -1,1,0,1, 1,1,1,1]);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,16,0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,2,gl.FLOAT,false,16,8);

  function makeTex(){ const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,procSize,procSize,0,gl.RGBA,gl.UNSIGNED_BYTE,null); return t; }
  gpuPrograms.texA = makeTex(); gpuPrograms.texB = makeTex(); gpuPrograms.texCur = makeTex(); gpuPrograms.fb = gl.createFramebuffer();
}

function ensureGLSize(){ if(!gl) return; if(glCanvas.width !== procSize || glCanvas.height !== procSize){ glCanvas.width = procSize; glCanvas.height = procSize; if(gpuPrograms && gpuPrograms.texA){ gl.deleteTexture(gpuPrograms.texA); gl.deleteTexture(gpuPrograms.texB); gl.deleteTexture(gpuPrograms.texCur); } function makeTex(){ const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,procSize,procSize,0,gl.RGBA,gl.UNSIGNED_BYTE,null); return t; } gpuPrograms.texA = makeTex(); gpuPrograms.texB = makeTex(); gpuPrograms.texCur = makeTex(); } }

function gpuProcess(mirror, thresh){ if(!gl) return; ensureGLSize(); // upload current video frame into texCur
  gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.texCur); try{ gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE, video); }catch(e){ return; }
  gl.viewport(0,0,gl.canvas.width, gl.canvas.height); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(gpuPrograms.diff);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.texCur); gl.uniform1i(gl.getUniformLocation(gpuPrograms.diff,'u_cur'), 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.texA); gl.uniform1i(gl.getUniformLocation(gpuPrograms.diff,'u_prev'), 1);
  gl.uniform1f(gl.getUniformLocation(gpuPrograms.diff,'u_thresh'), thresh);
  gl.uniform1i(gl.getUniformLocation(gpuPrograms.diff,'u_mirror'), mirror ? 1 : 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // copy current into texA for next frame
  gl.bindFramebuffer(gl.FRAMEBUFFER, gpuPrograms.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gpuPrograms.texA, 0);
  gl.useProgram(gpuPrograms.copy); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.texCur); gl.uniform1i(gl.getUniformLocation(gpuPrograms.copy,'u_tex'), 0); gl.uniform1i(gl.getUniformLocation(gpuPrograms.copy,'u_mirror'), 0);
  gl.viewport(0,0,procSize,procSize); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// populate device list then init GPU and UI
updateDeviceList().then(()=>{ initWebGL(); if(gpuSupported){ const o=document.createElement('option'); o.value='gpu-difference'; o.textContent='gpu-difference'; modeSelect.appendChild(o); } });

// --- Render / processing loop ---
function renderLoop(){
  if(!video || video.readyState < 2){ rafId = requestAnimationFrame(renderLoop); return; }
  const cw = canvas.width = video.videoWidth || canvas.width; const ch = canvas.height = video.videoHeight || canvas.height;
  ctx.save(); if(mirrorCheckbox.checked){ ctx.setTransform(-1,0,0,1,cw,0); } else { ctx.setTransform(1,0,0,1,0,0); }
  ctx.drawImage(video, 0, 0, cw, ch); ctx.restore();

  const mode = modeSelect.value; const thresh = Number(threshInput.value);

  if(mode === 'gpu-difference' && gpuSupported){ gpuProcess(mirrorCheckbox.checked, thresh); // copy GPU canvas into motionCanvas
    mctx.clearRect(0,0,motionCanvas.width,motionCanvas.height);
    try{
      mctx.save();
      mctx.translate(0, motionCanvas.height);
      mctx.scale(1, -1);
      mctx.drawImage(glCanvas, 0, 0, motionCanvas.width, motionCanvas.height);
      mctx.restore();
    }catch(e){}
  }
  else {
    // CPU path: downscale to procCanvas and run chosen algorithm
    pctx.clearRect(0,0,procSize,procSize); pctx.drawImage(video, 0, 0, procSize, procSize);
    const img = pctx.getImageData(0,0,procSize,procSize);
    const gray = new Uint8ClampedArray(procSize*procSize); const red = new Uint8ClampedArray(procSize*procSize); const green = new Uint8ClampedArray(procSize*procSize); const blue = new Uint8ClampedArray(procSize*procSize);
    for(let i=0,j=0;i<img.data.length;i+=4,j++){ red[j]=img.data[i]; green[j]=img.data[i+1]; blue[j]=img.data[i+2]; gray[j] = (0.299*img.data[i] + 0.587*img.data[i+1] + 0.114*img.data[i+2])|0; }
    const motionImg = pctx.createImageData(procSize, procSize);
    if(mode === 'difference'){
      if(prevGray){ for(let i=0;i<gray.length;i++){ let d = Math.abs(gray[i] - prevGray[i]); let d2 = d / 16; if(blurCheckbox.checked) d = Math.min(255, (d + (gray[i]>>2))>>0); const v = d > thresh ? d2 : 0; motionImg.data[i*4+0] = red[i]*v; motionImg.data[i*4+1] = green[i]*v; motionImg.data[i*4+2] = blue[i]*v; motionImg.data[i*4+3] = 255; } } prevGray = gray; }
    else if(mode === 'fourier'){
      const blockSize = 16; const blocks = procSize / blockSize; if(!prevBlockEnergies || prevBlockEnergies.length !== blocks*blocks){ prevBlockEnergies = new Float64Array(blocks*blocks); prevBlockInitialized = false; }
      for(let br=0;br<blocks;br++){ for(let bc=0;bc<blocks;bc++){ const reBlock = new Float64Array(blockSize*blockSize); for(let y=0;y<blockSize;y++){ const srcRow = (br*blockSize + y)*procSize + (bc*blockSize); const dstRow = y*blockSize; for(let x=0;x<blockSize;x++){ reBlock[dstRow + x] = gray[srcRow + x]; } } const magBlock = fft2dMagnitude(reBlock, blockSize); let energy = 0; for(let i=0;i<magBlock.length;i++) energy += magBlock[i]; const idx = br*blocks + bc; if(!prevBlockInitialized){ prevBlockEnergies[idx] = energy; continue; } const diff = Math.abs(energy - prevBlockEnergies[idx]); const diffNorm = diff / (blockSize*blockSize); const sensitivity = thresh / 50; const motionDetected = diffNorm > sensitivity; for(let y=0;y<blockSize;y++){ for(let x=0;x<blockSize;x++){ const px = (br*blockSize + y)*procSize + (bc*blockSize + x); motionImg.data[px*4+0] = 0; motionImg.data[px*4+1] = motionDetected ? 255 : 0; motionImg.data[px*4+2] = 0; motionImg.data[px*4+3] = motionDetected ? 255 : 0; } } prevBlockEnergies[idx] = energy; } } prevBlockInitialized = true; }
    pctx.putImageData(motionImg, 0, 0); mctx.clearRect(0,0,motionCanvas.width,motionCanvas.height); mctx.imageSmoothingEnabled = false; mctx.drawImage(procCanvas, 0, 0, motionCanvas.width, motionCanvas.height);
  }

  frameCount++; const now = performance.now(); if(now - lastFpsUpdate >= 500){ const fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate)); fpsSpan.textContent = 'FPS: ' + fps; frameCount = 0; lastFpsUpdate = now; }
  rafId = requestAnimationFrame(renderLoop);
}

async function startCamera(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ setStatus('getUserMedia not supported', true); return; }
  stopCamera();
  const res = parseResolution(resolutionSelect.value);
  const videoConstraints = {};
  if(deviceSelect && deviceSelect.value && deviceSelect.value !== 'default'){
    videoConstraints.deviceId = { exact: deviceSelect.value };
  }
  if(res){ Object.assign(videoConstraints, res); }
  else if(!videoConstraints.deviceId){ videoConstraints.facingMode = 'user'; }
  const constraints = { video: videoConstraints };
  try{
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    // after permission, update device list so labels appear
    await updateDeviceList();
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    motionCanvas.width = video.videoWidth || 640;
    motionCanvas.height = video.videoHeight || 480;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus('Camera started');
    frameCount = 0;
    lastFpsUpdate = performance.now();
    renderLoop();
  }catch(err){
    setStatus('Camera error: ' + err.message, true);
  }
}


function stopCamera(){ if(rafId) cancelAnimationFrame(rafId); rafId = null; if(video){ try{ video.pause(); }catch(e){} } if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; } startBtn.disabled = false; stopBtn.disabled = true; setStatus('Camera stopped'); ctx.clearRect(0,0,canvas.width,canvas.height); }

startBtn.addEventListener('click', startCamera); stopBtn.addEventListener('click', stopCamera);
snapshotBtn.addEventListener('click', async ()=>{ try{ const blob = await new Promise(res=>motionCanvas.toBlob(res,'image/png')); await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]); setStatus('Snapshot copied to clipboard'); }catch(err){ setStatus('Clipboard failed: ' + err.message, true); const blob = await new Promise(res=>motionCanvas.toBlob(res,'image/png')); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'snapshot.png'; a.click(); URL.revokeObjectURL(url); } });

resolutionSelect.addEventListener('change', ()=>{ if(stream) startCamera(); });
window.addEventListener('beforeunload', stopCamera);

// auto-start
initWebGL();
// leave camera start to be explicit (we can auto-start if desired)
