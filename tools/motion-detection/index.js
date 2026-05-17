// Camera motion detection with CPU difference, block-Fourier, and WebGL2 GPU difference.
const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');
const container = canvas.parentElement;

// Controls container
const controls = document.getElementById("camera-controls");
controls.className = "camera-controls";
controls.style.marginTop = '8px';
// split controls into left (interactive) and right (display values)
const controlsLeft = document.createElement('div'); controlsLeft.className = 'controls-left';
const controlsRight = document.createElement('div'); controlsRight.className = 'controls-right';
controls.appendChild(controlsLeft); controls.appendChild(controlsRight);

function createControlColumn(labelText, element){
  const col = document.createElement('div'); col.className = 'control-col';
  const lab = document.createElement('div'); lab.className = 'control-label'; lab.textContent = labelText;
  col.appendChild(lab); col.appendChild(element);
  return col;
}

// Buttons
const startBtn = document.createElement('button'); startBtn.textContent = 'Start Camera';
const stopBtn = document.createElement('button'); stopBtn.textContent = 'Stop Camera'; stopBtn.disabled = true;
const snapshotBtn = document.createElement('button'); snapshotBtn.textContent = 'Snapshot → Clipboard';

// Mirror
const mirrorLabel = document.createElement('label');
const mirrorCheckbox = document.createElement('input'); mirrorCheckbox.type = 'checkbox';
mirrorLabel.appendChild(mirrorCheckbox); mirrorLabel.appendChild(document.createTextNode(' Mirror'));

// Resolution select (camera constraints)
const resolutionSelect = document.createElement('select');
['default','640x480','1280x720','1920x1080'].forEach(opt => { const o = document.createElement('option'); o.value = opt; o.textContent = (opt === 'default') ? 'Default' : opt; resolutionSelect.appendChild(o); });
// no inline margin; layout is handled by CSS

// Camera device selector (populated from enumerateDevices)
const deviceSelect = document.createElement('select');
const defaultDeviceOpt = document.createElement('option'); defaultDeviceOpt.value = 'default'; defaultDeviceOpt.textContent = 'Default camera'; deviceSelect.appendChild(defaultDeviceOpt);


// FPS and status
const fpsSpan = document.createElement('span'); fpsSpan.textContent = 'FPS: -';
  fpsSpan.className = 'value';
const status = document.getElementById('status'); status.style.marginTop = '6px';

controlsLeft.appendChild(createControlColumn('Start', startBtn));
controlsLeft.appendChild(createControlColumn('Stop', stopBtn));
controlsLeft.appendChild(createControlColumn('Snapshot', snapshotBtn));
controlsLeft.appendChild(createControlColumn('Mirror', mirrorLabel));
controlsLeft.appendChild(createControlColumn('Camera', deviceSelect));
controlsLeft.appendChild(createControlColumn('Resolution', resolutionSelect));
controlsRight.appendChild(fpsSpan);


// Hidden video element
const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true; video.style.display = 'none';
document.body.appendChild(video);

let stream = null; let rafId = null; let lastFpsUpdate = performance.now(); let frameCount = 0;

// Motion visualization canvas
const motionCanvas = document.createElement('canvas'); motionCanvas.id = 'motionCanvas'; motionCanvas.style.border = '1px solid #666';
motionCanvas.width = 640; motionCanvas.height = 480; container.appendChild(motionCanvas);
const mctx = motionCanvas.getContext('2d');

// Processing canvas and resolution (power of two)
let procSize = 256; // default
const procCanvas = document.createElement('canvas'); procCanvas.width = procSize; procCanvas.height = procSize;
const pctx = procCanvas.getContext('2d');

// UI: mode select and controls
const modeSelect = document.createElement('select'); ['difference','fourier'].forEach(m=>{ const o=document.createElement('option'); o.value=m; o.textContent = m.charAt(0).toUpperCase() + m.slice(1); modeSelect.appendChild(o); });
// layout handled by control columns

const threshInput = document.createElement('input'); threshInput.type = 'range'; threshInput.step = 0.001; threshInput.min = 0; threshInput.max = 1; threshInput.value = 0.02;
const threshLabel = document.createElement('span'); threshLabel.textContent = 'Threshold: 0%';
  threshLabel.className = 'value';

// Lag input (how many frames to compare against). 1 = previous frame.
const lagInput = document.createElement('input'); lagInput.type = 'number'; lagInput.min = 1; lagInput.max = 60; lagInput.value = 1; lagInput.style.width = '64px';
// replace native spinner with explicit up/down buttons
const lagContainer = document.createElement('div'); lagContainer.className = 'lag-container';
const lagDec = document.createElement('button'); lagDec.type = 'button'; lagDec.className = 'small-step'; lagDec.textContent = '−';
const lagInc = document.createElement('button'); lagInc.type = 'button'; lagInc.className = 'small-step'; lagInc.textContent = '+';
lagContainer.appendChild(lagDec); lagContainer.appendChild(lagInput); lagContainer.appendChild(lagInc);

controlsLeft.appendChild(createControlColumn('Mode', modeSelect));
controlsLeft.appendChild(createControlColumn('Threshold', threshInput));
controlsLeft.appendChild(createControlColumn('Frames', lagContainer));
controlsRight.appendChild(threshLabel);

// Processing resolution selector
const procSizeSelect = document.createElement('select'); [128,256,512].forEach(n=>{ const o=document.createElement('option'); o.value=String(n); o.textContent = n + ' px'; if(n===procSize) o.selected = true; procSizeSelect.appendChild(o); }); controlsLeft.appendChild(createControlColumn('Proc', procSizeSelect));

threshInput.addEventListener('input', ()=>{ const pct = Math.round((threshInput.value / Number(threshInput.max)) * 100); threshLabel.textContent = 'Threshold: ' + pct + '%'; });
// lag up/down buttons behavior
lagInc.addEventListener('click', ()=>{ const v = Math.min(Number(lagInput.max), (Number(lagInput.value)||1) + 1); lagInput.value = v; });
lagDec.addEventListener('click', ()=>{ const v = Math.max(Number(lagInput.min), (Number(lagInput.value)||1) - 1); lagInput.value = v; });
// Sticky (press-and-hold) behavior for lag buttons
let _lagHoldTimeout = null; let _lagHoldInterval = null;
function changeLagBy(delta){ const val = Math.max(Number(lagInput.min), Math.min(Number(lagInput.max), (Number(lagInput.value)||1) + delta)); lagInput.value = val; }
function startLagRepeat(delta){ stopLagRepeat(); changeLagBy(delta); _lagHoldTimeout = setTimeout(()=>{ _lagHoldInterval = setInterval(()=> changeLagBy(delta), 100); }, 400); }
function stopLagRepeat(){ if(_lagHoldTimeout){ clearTimeout(_lagHoldTimeout); _lagHoldTimeout = null; } if(_lagHoldInterval){ clearInterval(_lagHoldInterval); _lagHoldInterval = null; } }

lagInc.addEventListener('mousedown', ()=> startLagRepeat(1));
lagDec.addEventListener('mousedown', ()=> startLagRepeat(-1));
lagInc.addEventListener('touchstart', (e)=>{ e.preventDefault(); startLagRepeat(1); }, {passive:false});
lagDec.addEventListener('touchstart', (e)=>{ e.preventDefault(); startLagRepeat(-1); }, {passive:false});
['mouseup','mouseleave','touchend','touchcancel'].forEach(ev=>{ document.addEventListener(ev, stopLagRepeat); });
// initialize display
threshInput.dispatchEvent(new Event('input'));
procSizeSelect.addEventListener('change', ()=>{
  const val = Number(procSizeSelect.value); if(!isPowerOfTwo(val)) return; procSize = val; procCanvas.width = procSize; procCanvas.height = procSize; prevGray = null; prevGrays = []; prevBlockHistory = []; prevBlockInitialized = false; setStatus('Processing resolution: ' + procSize + 'px'); if(gl) ensureGLSize();
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
let prevGray = null; let prevGrays = []; let prevBlockHistory = []; let prevBlockInitialized = false;
const MAX_FRAME_HISTORY = 60;

// --- WebGL2 GPU pipeline (difference shader) ---
let gl = null; let glCanvas = null; let gpuSupported = false; let gpuPrograms = null;

function initWebGL(){
  if(gl) return;
  try{
    glCanvas = document.createElement('canvas'); glCanvas.width = procSize; glCanvas.height = procSize;
    gl = glCanvas.getContext('webgl2', {preserveDrawingBuffer:true}); if(!gl) throw new Error('WebGL2 not available'); gpuSupported = true; gpuPrograms = {};
  }catch(e){ gpuSupported = false; if(glCanvas && glCanvas.parentElement) glCanvas.parentElement.removeChild(glCanvas); gl = null; gpuPrograms = null; return; }

  const vsSrc = `#version 300 es
  precision highp float; in vec2 a_pos; in vec2 a_uv; out vec2 v_uv; void main(){ v_uv = a_uv; gl_Position = vec4(a_pos,0.0,1.0); }`;
  const fsDiff = `#version 300 es
  precision highp float; 
  in vec2 v_uv; 
  out vec4 outColor; 
  uniform sampler2D u_cur; 
  uniform sampler2D u_prev; 
  uniform float u_thresh; 
  uniform bool u_mirror; 
  void main(){ 
    vec2 uv=v_uv;
    if(u_mirror) uv.x=1.0-uv.x; 
    vec3 c=texture(u_cur,uv).rgb; 
    vec3 p=texture(u_prev,uv).rgb; 
    float lc=dot(c,vec3(0.299,0.587,0.114)); 
    float lp=dot(p,vec3(0.299,0.587,0.114)); 
    float d=abs(lc-lp); 
    float v=smoothstep(u_thresh, u_thresh+0.05, d) * min(1.0,d*8.0); 
    outColor = vec4(c * v, 1.0); 
  }`;
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
  // history textures for multi-frame lag support
  gpuPrograms.maxHistory = 16;
  gpuPrograms.texHistory = new Array(gpuPrograms.maxHistory);
  for(let i=0;i<gpuPrograms.maxHistory;i++) gpuPrograms.texHistory[i] = makeTex();
  gpuPrograms.historyIndex = 0; gpuPrograms.historyFilled = 0;
}

function ensureGLSize(){ if(!gl) return; if(glCanvas.width !== procSize || glCanvas.height !== procSize){ glCanvas.width = procSize; glCanvas.height = procSize; if(gpuPrograms && gpuPrograms.texA){ gl.deleteTexture(gpuPrograms.texA); gl.deleteTexture(gpuPrograms.texB); gl.deleteTexture(gpuPrograms.texCur); for(const t of (gpuPrograms.texHistory||[])) if(t) gl.deleteTexture(t); } function makeTex(){ const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,procSize,procSize,0,gl.RGBA,gl.UNSIGNED_BYTE,null); return t; } gpuPrograms.texA = makeTex(); gpuPrograms.texB = makeTex(); gpuPrograms.texCur = makeTex(); gpuPrograms.texHistory = new Array(gpuPrograms.maxHistory); for(let i=0;i<gpuPrograms.maxHistory;i++) gpuPrograms.texHistory[i] = makeTex(); gpuPrograms.historyIndex = 0; gpuPrograms.historyFilled = 0; } }

function gpuProcess(mirror, thresh, lag){ if(!gl) return; ensureGLSize(); // upload current video frame into texCur
  gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.texCur); try{ gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE, video); }catch(e){ return; }
  gl.viewport(0,0,gl.canvas.width, gl.canvas.height); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(gpuPrograms.diff);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.texCur); gl.uniform1i(gl.getUniformLocation(gpuPrograms.diff,'u_cur'), 0);
  // choose previous texture based on history and requested lag
  let prevTex = gpuPrograms.texA;
  if(gpuPrograms.historyFilled >= (lag||1)){
    const idx = (gpuPrograms.historyIndex - (lag||1) + gpuPrograms.maxHistory) % gpuPrograms.maxHistory;
    prevTex = gpuPrograms.texHistory[idx];
  }
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prevTex); gl.uniform1i(gl.getUniformLocation(gpuPrograms.diff,'u_prev'), 1);
  gl.uniform1f(gl.getUniformLocation(gpuPrograms.diff,'u_thresh'), thresh);
  gl.uniform1i(gl.getUniformLocation(gpuPrograms.diff,'u_mirror'), mirror ? 1 : 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // copy current into history slot for next frames
  gl.bindFramebuffer(gl.FRAMEBUFFER, gpuPrograms.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gpuPrograms.texHistory[gpuPrograms.historyIndex], 0);
  // Always store history unmirrored; apply mirror at sample time in shader
  gl.useProgram(gpuPrograms.copy); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.texCur); gl.uniform1i(gl.getUniformLocation(gpuPrograms.copy,'u_tex'), 0); gl.uniform1i(gl.getUniformLocation(gpuPrograms.copy,'u_mirror'), 0);
  gl.viewport(0,0,procSize,procSize); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gpuPrograms.historyIndex = (gpuPrograms.historyIndex + 1) % gpuPrograms.maxHistory;
  gpuPrograms.historyFilled = Math.min(gpuPrograms.historyFilled + 1, gpuPrograms.maxHistory);
}

// populate device list then init GPU and UI
updateDeviceList().then(()=>{ initWebGL(); if(gpuSupported){ const o=document.createElement('option'); o.value='gpu-difference'; o.textContent='GPU Difference'; modeSelect.appendChild(o); } });

// --- Render / processing loop ---
function renderLoop(){
  if(!video || video.readyState < 2){ rafId = requestAnimationFrame(renderLoop); return; }
  const cw = canvas.width = video.videoWidth || canvas.width; const ch = canvas.height = video.videoHeight || canvas.height;
  ctx.save(); if(mirrorCheckbox.checked){ ctx.setTransform(-1,0,0,1,cw,0); } else { ctx.setTransform(1,0,0,1,0,0); }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(video, 0, 0, cw, ch);
  ctx.restore();

  const mode = modeSelect.value;
  const threshVal = Number(threshInput.value);
  const threshNorm = threshVal / Number(threshInput.max);

  if(mode === 'gpu-difference' && gpuSupported){ const lag = Number(lagInput.value) || 1; gpuProcess(mirrorCheckbox.checked, threshNorm, lag); // copy GPU canvas into motionCanvas
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
    pctx.clearRect(0,0,procSize,procSize);
    pctx.save();
    if(mirrorCheckbox.checked){ pctx.setTransform(-1,0,0,1,procSize,0); } else { pctx.setTransform(1,0,0,1,0,0); }
    pctx.drawImage(video, 0, 0, procSize, procSize);
    pctx.restore();
    const img = pctx.getImageData(0,0,procSize,procSize);
    const gray = new Uint8ClampedArray(procSize*procSize); const red = new Uint8ClampedArray(procSize*procSize); const green = new Uint8ClampedArray(procSize*procSize); const blue = new Uint8ClampedArray(procSize*procSize);
    for(let i=0,j=0;i<img.data.length;i+=4,j++){ red[j]=img.data[i]; green[j]=img.data[i+1]; blue[j]=img.data[i+2]; gray[j] = (0.299*img.data[i] + 0.587*img.data[i+1] + 0.114*img.data[i+2])|0; }
    const motionImg = pctx.createImageData(procSize, procSize);
    if(mode === 'difference'){
      const lag = Math.max(1, Math.min(MAX_FRAME_HISTORY, Number(lagInput.value) || 1));
      let compareGray = null;
      if(prevGrays.length >= lag) compareGray = prevGrays[prevGrays.length - lag];
      if(compareGray){
        const tNorm = threshNorm;
        for(let i=0;i<gray.length;i++){
          let d = Math.abs(gray[i] - compareGray[i]);
          let dNorm = d/255;
          const v = dNorm > tNorm ? Math.min(1, dNorm * 8) : 0;
          motionImg.data[i*4+0] = red[i]*v;
          motionImg.data[i*4+1] = green[i]*v;
          motionImg.data[i*4+2] = blue[i]*v;
          motionImg.data[i*4+3] = 255;
        }
      }
      // push current gray into history
      prevGrays.push(gray);
      if(prevGrays.length > MAX_FRAME_HISTORY) prevGrays.shift();
    }
    
    else if(mode === 'fourier'){
      const blockSize = 16; const blocks = procSize / blockSize;
      const sens = (threshVal / Number(threshInput.max)) * 2;
      // compute energies for this frame
      const energies = new Float64Array(blocks * blocks);
      for(let br=0;br<blocks;br++){
        for(let bc=0;bc<blocks;bc++){
          const reBlock = new Float64Array(blockSize*blockSize);
          for(let y=0;y<blockSize;y++){
            const srcRow = (br*blockSize + y)*procSize + (bc*blockSize);
            const dstRow = y*blockSize;
            for(let x=0;x<blockSize;x++) reBlock[dstRow + x] = gray[srcRow + x];
          }
          const magBlock = fft2dMagnitude(reBlock, blockSize);
          let energy = 0; for(let i=0;i<magBlock.length;i++) energy += magBlock[i];
          energies[br*blocks + bc] = energy;
        }
      }
      const lag = Math.max(1, Math.min(MAX_FRAME_HISTORY, Number(lagInput.value) || 1));
      if(prevBlockHistory.length >= lag){
        const compareEnergies = prevBlockHistory[prevBlockHistory.length - lag];
        for(let br=0;br<blocks;br++){
          for(let bc=0;bc<blocks;bc++){
            const idx = br*blocks + bc;
            const diff = Math.abs(energies[idx] - compareEnergies[idx]);
            const diffNorm = diff / (blockSize*blockSize);
            const motionDetected = diffNorm > sens;
            for(let y=0;y<blockSize;y++){
              for(let x=0;x<blockSize;x++){
                const px = (br*blockSize + y)*procSize + (bc*blockSize + x);
                motionImg.data[px*4+0] = 0;
                motionImg.data[px*4+1] = motionDetected ? 255 : 0;
                motionImg.data[px*4+2] = 0;
                motionImg.data[px*4+3] = motionDetected ? 255 : 0;
              }
            }
          }
        }
      }
      // push energies into history
      prevBlockHistory.push(energies);
      if(prevBlockHistory.length > MAX_FRAME_HISTORY) prevBlockHistory.shift();
    }
    pctx.putImageData(motionImg, 0, 0);
    mctx.clearRect(0,0,motionCanvas.width,motionCanvas.height);
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(procCanvas, 0, 0, motionCanvas.width, motionCanvas.height);
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
startCamera();
// leave camera start to be explicit (we can auto-start if desired)
