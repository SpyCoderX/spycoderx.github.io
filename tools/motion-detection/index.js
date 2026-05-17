const MODES = ['difference','motion-blur'];

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
const restartBtn = document.createElement('button'); restartBtn.textContent = 'Restart Camera';
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

controlsLeft.appendChild(createControlColumn('Restart', restartBtn));
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
const motionCanvas = document.createElement('canvas'); motionCanvas.id = 'motionCanvas';
motionCanvas.width = 640; motionCanvas.height = 480; container.appendChild(motionCanvas);
const mctx = motionCanvas.getContext('2d');

// Processing canvas and resolution (power of two)
let procSize = 256; // default
const procCanvas = document.createElement('canvas'); procCanvas.width = procSize; procCanvas.height = procSize;
const pctx = procCanvas.getContext('2d');

// // Block size for Fourier/block processing (CPU and GPU). Keep <=16 to match shader loop.
// let blockSizeVar = 16;

// UI: mode select and controls
const modeSelect = document.createElement('select'); MODES.forEach(m=>{ const o=document.createElement('option'); o.value=m; o.textContent = m.charAt(0).toUpperCase() + m.slice(1); modeSelect.appendChild(o); });
// layout handled by control columns

const threshInput = document.createElement('input'); threshInput.type = 'range'; threshInput.step = 0.001; threshInput.min = 0; threshInput.max = 1; threshInput.value = 0.02;
const threshLabel = document.createElement('span'); threshLabel.textContent = 'Threshold: 0%';
  threshLabel.className = 'value';

// Feedback controls
// const feedbackCheckbox = document.createElement('input'); feedbackCheckbox.type = 'checkbox';
// const feedbackLabel = document.createElement('label'); feedbackLabel.appendChild(feedbackCheckbox); feedbackLabel.appendChild(document.createTextNode(' Feedback'));
// const gainInput = document.createElement('input'); gainInput.type = 'range'; gainInput.min = 0; gainInput.max = 4; gainInput.step = 0.1; gainInput.value = 1.0; gainInput.style.width = '120px';
// const gainValue = document.createElement('span'); gainValue.className = 'value'; gainValue.textContent = 'Gain: 1.0x';
// gainInput.addEventListener('input', ()=>{ gainValue.textContent = 'Gain: ' + Number(gainInput.value).toFixed(1) + 'x'; saveSettings(); });
// feedbackCheckbox.addEventListener('change', saveSettings);
// controlsLeft.appendChild(createControlColumn('Feedback', feedbackLabel));
// controlsLeft.appendChild(createControlColumn('Gain', gainInput));
// controlsRight.appendChild(gainValue);

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

// Block size control (only visible for Fourier modes)
// const blockSizeSelect = document.createElement('select'); [1,2,4,8].forEach(n=>{ const o=document.createElement('option'); o.value=String(n); o.textContent = n + ' px'; if(n===blockSizeVar) o.selected = true; blockSizeSelect.appendChild(o); });
// const blockControlCol = createControlColumn('Block', blockSizeSelect);
// blockControlCol.style.display = 'none'; // hidden until Fourier mode selected
// controlsLeft.appendChild(blockControlCol);
// function recreateBlockTextures(){ if(!gl || !gpuPrograms) return; const blockSize = gpuPrograms.blockSize || 16; const blocks = Math.max(1, Math.floor(procSize / blockSize)); function makeBlockTex(w,h){ const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA, w, h,0,gl.RGBA,gl.UNSIGNED_BYTE,null); return t; } if(gpuPrograms.blockTexCur) gl.deleteTexture(gpuPrograms.blockTexCur); for(const t of (gpuPrograms.blockTexHistory||[])) if(t) gl.deleteTexture(t); gpuPrograms.blockTexCur = makeBlockTex(blocks, blocks); gpuPrograms.blockTexHistory = new Array(gpuPrograms.maxHistory); for(let i=0;i<gpuPrograms.maxHistory;i++) gpuPrograms.blockTexHistory[i] = makeBlockTex(blocks, blocks); gpuPrograms.blockHistoryIndex = 0; gpuPrograms.blockHistoryFilled = 0; }
// blockSizeSelect.addEventListener('change', ()=>{ blockSizeVar = Number(blockSizeSelect.value) || 16; if(gpuPrograms) gpuPrograms.blockSize = blockSizeVar; if(gl) ensureGLSize(); recreateBlockTextures(); setStatus('Block size: ' + blockSizeVar + ' px'); });

threshInput.addEventListener('input', ()=>{ const pct = Math.round((threshInput.value / Number(threshInput.max)) * 100); threshLabel.textContent = 'Threshold: ' + pct + '%'; });

// Sticky (press-and-hold) behavior for lag buttons
let _lagHoldTimeout = null; let _lagHoldInterval = null;
function changeLagBy(delta){ const val = Math.max(Number(lagInput.min), Math.min(Number(lagInput.max), (Number(lagInput.value)||1) + delta)); lagInput.value = val; try{ saveSettings(); }catch(e){} }
function startLagRepeat(delta){ stopLagRepeat(); changeLagBy(delta); _lagHoldTimeout = setTimeout(()=>{ _lagHoldInterval = setInterval(()=> changeLagBy(delta), 100); }, 400); }
function stopLagRepeat(){ if(_lagHoldTimeout){ clearTimeout(_lagHoldTimeout); _lagHoldTimeout = null; } if(_lagHoldInterval){ clearInterval(_lagHoldInterval); _lagHoldInterval = null; } }

lagInc.addEventListener('mousedown', ()=> { startLagRepeat(1) });
lagDec.addEventListener('mousedown', ()=>{ startLagRepeat(-1) });
lagInc.addEventListener('touchstart', (e)=>{ e.preventDefault(); startLagRepeat(1); }, {passive:false});
lagDec.addEventListener('touchstart', (e)=>{ e.preventDefault(); startLagRepeat(-1); }, {passive:false});
['mouseup','mouseleave','touchend','touchcancel'].forEach(ev=>{ document.addEventListener(ev, stopLagRepeat); });
// initialize display
threshInput.dispatchEvent(new Event('input'));
procSizeSelect.addEventListener('change', ()=>{
  const val = Number(procSizeSelect.value); if(!isPowerOfTwo(val)) return; procSize = val; procCanvas.width = procSize; procCanvas.height = procSize; prevImg = null; prevImgs = []; prevBlockHistory = []; prevBlockInitialized = false; setStatus('Processing resolution: ' + procSize + 'px'); if(gl) ensureGLSize();
});

// show Fourier-specific controls only when appropriate
// modeSelect.addEventListener('change', ()=>{
//   const m = modeSelect.value;
//   if(m === 'fourier' || m === 'gpu-fourier') blockControlCol.style.display = '';
//   else blockControlCol.style.display = 'none';
// });

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

deviceSelect.addEventListener('change', async ()=>{
  
  // otherwise, attempt to open a short-lived stream to read capabilities and populate resolutions
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

  // if camera already running, restart with new device
  if(stream) { startCamera(); return; }
});

function setStatus(msg, isError=false){ status.textContent = msg; status.style.setProperty("--color",isError ? 'crimson' : ''); }

function parseResolution(value){ if(!value || value === 'default') return undefined; const [w,h] = value.split('x').map(n => parseInt(n,10)); if(Number.isFinite(w) && Number.isFinite(h)) return {width: {exact: w}, height: {exact: h}}; return undefined; }

// --- FFT helpers (CPU) ---
function isPowerOfTwo(n){ return (n & (n-1)) === 0; }
function fft1d(re, im){ const n = re.length; if(n===0) return; if(!isPowerOfTwo(n)) throw new Error('fft length must be power of two: ' + n); let j=0; for(let i=1;i<n;i++){ let bit = n>>1; for(; j & bit; bit >>=1) j ^= bit; j ^= bit; if(i<j){ const tr=re[i]; re[i]=re[j]; re[j]=tr; const ti=im[i]; im[i]=im[j]; im[j]=ti; } } for(let len=2; len<=n; len<<=1){ const ang = -2*Math.PI/len; const wlen_r = Math.cos(ang); const wlen_i = Math.sin(ang); for(let i=0;i<n;i+=len){ let wr=1, wi=0; for(let k=0;k<len/2;k++){ const u_r = re[i+k]; const u_i = im[i+k]; const v_r = re[i+k+len/2]*wr - im[i+k+len/2]*wi; const v_i = re[i+k+len/2]*wi + im[i+k+len/2]*wr; re[i+k] = u_r + v_r; im[i+k] = u_i + v_i; re[i+k+len/2] = u_r - v_r; im[i+k+len/2] = u_i - v_i; const nxt_wr = wr * wlen_r - wi * wlen_i; wi = wr * wlen_i + wi * wlen_r; wr = nxt_wr; } } } }

function fft2dMagnitude(realIn, N){ if(!isPowerOfTwo(N)) throw new Error('procSize must be power of two for 2D FFT'); const re = new Float64Array(realIn); const im = new Float64Array(N*N); for(let r=0;r<N;r++){ const rowRe = re.subarray(r*N, r*N+N); const rowIm = im.subarray(r*N, r*N+N); fft1d(rowRe, rowIm); } const colRe = new Float64Array(N), colIm = new Float64Array(N); for(let c=0;c<N;c++){ for(let r=0;r<N;r++){ colRe[r] = re[r*N + c]; colIm[r] = im[r*N + c]; } fft1d(colRe, colIm); for(let r=0;r<N;r++){ re[r*N + c] = colRe[r]; im[r*N + c] = colIm[r]; } } const mag = new Float64Array(N*N); for(let i=0;i<re.length;i++){ mag[i] = Math.log(1 + Math.hypot(re[i], im[i])); } return mag; }

// CPU state for processing
let prevImg = null; let prevImgs = []; //let prevBlockHistory = []; let prevBlockInitialized = false;
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
    //float lc=dot(c,vec3(0.299,0.587,0.114)); 
    //float lp=dot(p,vec3(0.299,0.587,0.114)); 
    //float d=abs(lc-lp); 
    //float v=smoothstep(u_thresh, u_thresh+0.05, d) * min(1.0,d*8.0); 
    outColor = vec4(vec3(0.5) + (c-p) / 2.0, 1.0); 
  }`;
  const fsCopy = `#version 300 es
  precision highp float; in vec2 v_uv; out vec4 outColor; uniform sampler2D u_tex; uniform bool u_mirror; void main(){ vec2 uv=v_uv; if(u_mirror) uv.x=1.0-uv.x; outColor = texture(u_tex, uv); }`;

  function compile(type, src){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function link(vs, fs){ const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.bindAttribLocation(p,0,'a_pos'); gl.bindAttribLocation(p,1,'a_uv'); gl.linkProgram(p); if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }

  const vs = compile(gl.VERTEX_SHADER, vsSrc); const fs_d = compile(gl.FRAGMENT_SHADER, fsDiff); const fs_c = compile(gl.FRAGMENT_SHADER, fsCopy);
  gpuPrograms.diff = link(vs, fs_d); gpuPrograms.copy = link(vs, fs_c);

  // amplify-copy shader for pixel-diff feedback: writes cur*(1 + gain*mask) into target
  const fsDiffAmplify = `#version 300 es
  precision highp float; 
  in vec2 v_uv; 
  out vec4 outColor; 
  uniform sampler2D u_cur; 
  uniform sampler2D u_prev; 
  uniform float u_gain; 
  uniform float u_thresh; 
  uniform bool u_mirror;
  void main(){ 
    vec2 uv=v_uv; 
    if(u_mirror) uv.x=1.0-uv.x; 
    vec3 c = texture(u_cur, uv).rgb; 
    vec3 p = texture(u_prev, uv).rgb; 
    float lc = dot(c, vec3(0.299,0.587,0.114)); 
    float lp = dot(p, vec3(0.299,0.587,0.114)); 
    float d = abs(lc - lp); 
    float mask = smoothstep(u_thresh, u_thresh+0.05, d) * min(1.0, d*8.0); 
    vec3 outc = c * (1.0 + u_gain * mask); 
    outColor = vec4(outc, 1.0); 
  }
  `;
  const fs_damp = compile(gl.FRAGMENT_SHADER, fsDiffAmplify);
  gpuPrograms.diffAmplify = link(vs, fs_damp);

  // block-energy (GPU Fourier-like) shaders
  // const fsBlockEnergy = `#version 300 es
  // precision highp float;
  // in vec2 v_uv; out vec4 outColor;
  // uniform sampler2D u_src; uniform int u_blockSize; uniform int u_procSize;
  // void main(){
  //   // compute block indices from fragment coord
  //   ivec2 frag = ivec2(gl_FragCoord.xy);
  //   int bx = frag.x;
  //   int by = frag.y;
  //   // sample at the center of the block (single-sample energy proxy)
  //   float fsx = (float(bx) * float(u_blockSize) + float(u_blockSize) * 0.5 + 0.5) / float(u_procSize);
  //   float fsy = (float(by) * float(u_blockSize) + float(u_blockSize) * 0.5 + 0.5) / float(u_procSize);
  //   vec3 c = texture(u_src, vec2(fsx, fsy)).rgb;
  //   float l = dot(c, vec3(0.299,0.587,0.114));
  //   float energy = l * l;
  //   outColor = vec4(vec3(energy), 1.0);
  // }`;

  // const fsBlockCompare = `#version 300 es
  // precision highp float;
  // in vec2 v_uv; out vec4 outColor;
  // uniform sampler2D u_cur; uniform sampler2D u_prev; uniform float u_thresh; uniform int u_blocks; uniform int u_canvasW; uniform int u_canvasH;
  // void main(){
  //   // compute block index from fragment coordinate to avoid interpolation/scale issues
  //   ivec2 frag = ivec2(gl_FragCoord.xy);
  //   int px = frag.x; int py = frag.y;
  //   // map pixel to normalized 0..1
  //   float nx = (float(px) + 0.5) / float(u_canvasW);
  //   float ny = (float(py) + 0.5) / float(u_canvasH);
  //   // convert to block-space
  //   float bx_f = floor(nx * float(u_blocks));
  //   float by_f = floor(ny * float(u_blocks));
  //   vec2 texel = (vec2(bx_f, by_f) + 0.5) / float(u_blocks);
  //   float c = texture(u_cur, texel).r;
  //   float p = texture(u_prev, texel).r;
  //   float d = abs(c - p);
  //   float v = d > u_thresh ? 1.0 : 0.0;
  //   outColor = vec4(vec3(0.0, v, 0.0) * v, 1.0);
  // }`;

  // const fsBlockE = compile(gl.FRAGMENT_SHADER, fsBlockEnergy);
  // const fsBlockCmp = compile(gl.FRAGMENT_SHADER, fsBlockCompare);
  // gpuPrograms.blockEnergy = link(vs, fsBlockE);
  // gpuPrograms.blockCompare = link(vs, fsBlockCmp);

  // // block amplify shader: produce amplified block energy for history write
  // const fsBlockAmplify = `#version 300 es
  // precision highp float; in vec2 v_uv; out vec4 outColor; uniform sampler2D u_cur; uniform sampler2D u_prev; uniform float u_gain; uniform float u_thresh; uniform int u_blocks;
  // void main(){ ivec2 frag = ivec2(gl_FragCoord.xy); vec2 texel = (vec2(frag) + 0.5) / float(u_blocks); float c = texture(u_cur, texel).r; float p = texture(u_prev, texel).r; float d = abs(c - p); float mask = d > u_thresh ? 1.0 : 0.0; float outv = c * (1.0 + u_gain * mask); outColor = vec4(vec3(outv), 1.0); }
  // `;
  // const fsBlkAmp = compile(gl.FRAGMENT_SHADER, fsBlockAmplify);
  // gpuPrograms.blockAmplify = link(vs, fsBlkAmp);

  // block textures (will be sized in ensureGLSize)
  // gpuPrograms.blockSize = blockSizeVar;
  // gpuPrograms.blockTexCur = null;
  // gpuPrograms.blockTexHistory = [];
  // gpuPrograms.blockHistoryIndex = 0;
  // gpuPrograms.blockHistoryFilled = 0;

  // fullscreen quad
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const verts = new Float32Array([-1,-1,0,0, 1,-1,1,0, -1,1,0,1, 1,1,1,1]);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,16,0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,2,gl.FLOAT,false,16,8);

  function makeTex(){ const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,procSize,procSize,0,gl.RGBA,gl.UNSIGNED_BYTE,null); return t; }
  gpuPrograms.texA = makeTex(); gpuPrograms.texB = makeTex(); gpuPrograms.texCur = makeTex(); gpuPrograms.fb = gl.createFramebuffer();
  // history textures for multi-frame lag support
  gpuPrograms.maxHistory = 60;
  gpuPrograms.texHistory = new Array(gpuPrograms.maxHistory);
  for(let i=0;i<gpuPrograms.maxHistory;i++) gpuPrograms.texHistory[i] = makeTex();
  gpuPrograms.historyIndex = 0; gpuPrograms.historyFilled = 0;
}

function ensureGLSize(){
  if(!gl) return;
  if(glCanvas.width !== procSize || glCanvas.height !== procSize){
    glCanvas.width = procSize; glCanvas.height = procSize;
    if(gpuPrograms && gpuPrograms.texA){
      gl.deleteTexture(gpuPrograms.texA); gl.deleteTexture(gpuPrograms.texB); gl.deleteTexture(gpuPrograms.texCur);
      for(const t of (gpuPrograms.texHistory||[])) if(t) gl.deleteTexture(t);
    }
    function makeTex(){ const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,procSize,procSize,0,gl.RGBA,gl.UNSIGNED_BYTE,null); return t; }
    gpuPrograms.texA = makeTex(); gpuPrograms.texB = makeTex(); gpuPrograms.texCur = makeTex();
    gpuPrograms.texHistory = new Array(gpuPrograms.maxHistory);
    for(let i=0;i<gpuPrograms.maxHistory;i++) gpuPrograms.texHistory[i] = makeTex();
    gpuPrograms.historyIndex = 0; gpuPrograms.historyFilled = 0;

    // recreate block textures sized blocks x blocks
    const blockSize = gpuPrograms.blockSize || 16;
    const blocks = Math.max(1, procSize / blockSize) | 0;
    function makeBlockTex(w,h){ const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA, w, h,0,gl.RGBA,gl.UNSIGNED_BYTE,null); return t; }
    if(gpuPrograms.blockTexCur) gl.deleteTexture(gpuPrograms.blockTexCur);
    for(const t of (gpuPrograms.blockTexHistory||[])) if(t) gl.deleteTexture(t);
    gpuPrograms.blockTexCur = makeBlockTex(blocks, blocks);
    gpuPrograms.blockTexHistory = new Array(gpuPrograms.maxHistory);
    for(let i=0;i<gpuPrograms.maxHistory;i++) gpuPrograms.blockTexHistory[i] = makeBlockTex(blocks, blocks);
    gpuPrograms.blockHistoryIndex = 0; gpuPrograms.blockHistoryFilled = 0;
  }
}

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
  gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // copy current into history slot for next frames
  gl.bindFramebuffer(gl.FRAMEBUFFER, gpuPrograms.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gpuPrograms.texHistory[gpuPrograms.historyIndex], 0);
  // Store amplified or raw current into history depending on feedback
  // if(feedbackCheckbox && feedbackCheckbox.checked && gpuPrograms.diffAmplify){
  //   gl.useProgram(gpuPrograms.diffAmplify);
  //   gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.texCur); gl.uniform1i(gl.getUniformLocation(gpuPrograms.diffAmplify,'u_cur'), 0);
  //   gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prevTex); gl.uniform1i(gl.getUniformLocation(gpuPrograms.diffAmplify,'u_prev'), 1);
  //   gl.uniform1f(gl.getUniformLocation(gpuPrograms.diffAmplify,'u_gain'), Number(gainInput.value) || 1.0);
  //   gl.uniform1f(gl.getUniformLocation(gpuPrograms.diffAmplify,'u_thresh'), thresh);
  //   gl.uniform1i(gl.getUniformLocation(gpuPrograms.diffAmplify,'u_mirror'), mirror ? 1 : 0);
  //   gl.viewport(0,0,procSize,procSize); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // } else {
    // Always store history unmirrored; apply mirror at sample time in shader
    gl.useProgram(gpuPrograms.copy); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.texCur); gl.uniform1i(gl.getUniformLocation(gpuPrograms.copy,'u_tex'), 0); gl.uniform1i(gl.getUniformLocation(gpuPrograms.copy,'u_mirror'), 0);
    gl.viewport(0,0,procSize,procSize); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // }
  gpuPrograms.historyIndex = (gpuPrograms.historyIndex + 1) % gpuPrograms.maxHistory;
  gpuPrograms.historyFilled = Math.min(gpuPrograms.historyFilled + 1, gpuPrograms.maxHistory);
}

// function gpuFourierProcess(mirror, thresh, lag){
//   if(!gl || !gpuPrograms) return; ensureGLSize();
//   const blockSize = gpuPrograms.blockSize || 16;
//   const blocks = Math.max(1, Math.floor(procSize / blockSize));
//   // upload current video frame into texCur
//   gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.texCur); try{ gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE, video); }catch(e){ return; }

//   // render block energy into blockTexCur (framebuffer sized blocks x blocks)
//   gl.bindFramebuffer(gl.FRAMEBUFFER, gpuPrograms.fb);
//   gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gpuPrograms.blockTexCur, 0);
//   gl.viewport(0,0,blocks,blocks);
//   gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
//   gl.useProgram(gpuPrograms.blockEnergy);
//   gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.texCur); gl.uniform1i(gl.getUniformLocation(gpuPrograms.blockEnergy,'u_src'), 0);
//   gl.uniform1i(gl.getUniformLocation(gpuPrograms.blockEnergy,'u_blockSize'), blockSize);
//   gl.uniform1i(gl.getUniformLocation(gpuPrograms.blockEnergy,'u_procSize'), procSize);
//   gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

//   // choose previous block texture based on history and requested lag
//   let prevBlockTex = gpuPrograms.blockTexCur;
//   if(gpuPrograms.blockHistoryFilled >= (lag||1)){
//     const idx = (gpuPrograms.blockHistoryIndex - (lag||1) + gpuPrograms.maxHistory) % gpuPrograms.maxHistory;
//     prevBlockTex = gpuPrograms.blockTexHistory[idx];
//   }

//   // render comparison to screen-sized gl canvas
//   gl.bindFramebuffer(gl.FRAMEBUFFER, null);
//   gl.viewport(0,0,gl.drawingBufferWidth || gl.canvas.width, gl.drawingBufferHeight || gl.canvas.height);
//   gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
//   gl.useProgram(gpuPrograms.blockCompare);
//   gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.blockTexCur); gl.uniform1i(gl.getUniformLocation(gpuPrograms.blockCompare,'u_cur'), 0);
//   gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prevBlockTex); gl.uniform1i(gl.getUniformLocation(gpuPrograms.blockCompare,'u_prev'), 1);
//   gl.uniform1f(gl.getUniformLocation(gpuPrograms.blockCompare,'u_thresh'), thresh);
//   gl.uniform1i(gl.getUniformLocation(gpuPrograms.blockCompare,'u_blocks'), blocks);
//   gl.uniform1i(gl.getUniformLocation(gpuPrograms.blockCompare,'u_canvasW'), gl.drawingBufferWidth || gl.canvas.width);
//   gl.uniform1i(gl.getUniformLocation(gpuPrograms.blockCompare,'u_canvasH'), gl.drawingBufferHeight || gl.canvas.height);
//   gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

//   // copy current blockTex into history slot
//   gl.bindFramebuffer(gl.FRAMEBUFFER, gpuPrograms.fb);
//   gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gpuPrograms.blockTexHistory[gpuPrograms.blockHistoryIndex], 0);
//   if(feedbackCheckbox && feedbackCheckbox.checked && gpuPrograms.blockAmplify){
//     gl.useProgram(gpuPrograms.blockAmplify);
//     gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.blockTexCur); gl.uniform1i(gl.getUniformLocation(gpuPrograms.blockAmplify,'u_cur'), 0);
//     gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prevBlockTex); gl.uniform1i(gl.getUniformLocation(gpuPrograms.blockAmplify,'u_prev'), 1);
//     gl.uniform1f(gl.getUniformLocation(gpuPrograms.blockAmplify,'u_gain'), Number(gainInput.value) || 1.0);
//     gl.uniform1f(gl.getUniformLocation(gpuPrograms.blockAmplify,'u_thresh'), thresh);
//     gl.uniform1i(gl.getUniformLocation(gpuPrograms.blockAmplify,'u_blocks'), blocks);
//     gl.viewport(0,0,blocks,blocks); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
//   } else {
//     gl.useProgram(gpuPrograms.copy); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gpuPrograms.blockTexCur); gl.uniform1i(gl.getUniformLocation(gpuPrograms.copy,'u_tex'), 0); gl.uniform1i(gl.getUniformLocation(gpuPrograms.copy,'u_mirror'), 0);
//     gl.viewport(0,0,blocks,blocks); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
//   }
//   gpuPrograms.blockHistoryIndex = (gpuPrograms.blockHistoryIndex + 1) % gpuPrograms.maxHistory;
//   gpuPrograms.blockHistoryFilled = Math.min(gpuPrograms.blockHistoryFilled + 1, gpuPrograms.maxHistory);
// }

// populate device list then init GPU and UI
updateDeviceList().then(async ()=>{
  initWebGL();
  if(gpuSupported){ const o=document.createElement('option'); o.value='gpu-difference'; o.textContent='GPU-Difference'; modeSelect.appendChild(o); //const o2=document.createElement('option'); o2.value='gpu-fourier'; o2.textContent='GPU Fourier'; modeSelect.appendChild(o2); 
  }
  // apply saved UI state and then start camera
  const saved = loadSettings(); applySavedSettings(saved);
  try{ await startCamera(); }catch(e){}
});

// Persist/restore UI settings
function saveSettings(){ try{ const s = {
    device: deviceSelect.value,
    resolution: resolutionSelect.value,
    mode: modeSelect.value,
    procSize: procSizeSelect.value,
    // blockSize: blockSizeSelect.value,
    threshold: threshInput.value,
    lag: lagInput.value,
    mirror: mirrorCheckbox.checked
  }; localStorage.setItem('motion-detection-settings', JSON.stringify(s)); }catch(e){}
}
function loadSettings(){ try{ const raw = localStorage.getItem('motion-detection-settings'); if(!raw) return null; return JSON.parse(raw); }catch(e){ return null; } }
function applySavedSettings(s){ if(!s) return; try{
  if(s.mode) { if(Array.from(modeSelect.options).some(o=>o.value===s.mode)) modeSelect.value = s.mode; }
  if(s.procSize) { if(Array.from(procSizeSelect.options).some(o=>o.value===s.procSize)) procSizeSelect.value = s.procSize; procSizeSelect.dispatchEvent(new Event('change')); }
  // if(s.blockSize) { if(Array.from(blockSizeSelect.options).some(o=>o.value===s.blockSize)) blockSizeSelect.value = s.blockSize; blockSizeSelect.dispatchEvent(new Event('change')); }
  if(typeof s.threshold !== 'undefined') { threshInput.value = s.threshold; threshInput.dispatchEvent(new Event('input')); }
  if(s.lag) { lagInput.value = s.lag; }
  if(typeof s.mirror !== 'undefined'){ mirrorCheckbox.checked = !!s.mirror; }
  // device and resolution will only be set if options exist
  if(s.device && Array.from(deviceSelect.options).some(o=>o.value===s.device)) deviceSelect.value = s.device;
  if(s.resolution && Array.from(resolutionSelect.options).some(o=>o.value===s.resolution)) resolutionSelect.value = s.resolution;
  // ensure mode handlers run (show/hide Fourier controls)
  if(s.mode) modeSelect.dispatchEvent(new Event('change'));
}catch(e){}
}

// wire saving behavior
[deviceSelect, resolutionSelect, modeSelect, procSizeSelect, threshInput, lagInput, mirrorCheckbox].forEach(el=>{
  if(!el) return; const ev = (el.tagName === 'INPUT' && el.type === 'range') ? 'input' : 'change'; el.addEventListener(ev, saveSettings);
});

function populateResolutionOptionsFromCapabilities(caps){
  // keep a sensible candidate list and filter by capabilities ranges if available
  const candidates = [ [3840,2160],[2560,1440],[1920,1080],[1280,720],[1024,576],[960,540],[854,480],[800,600],[640,480],[480,360],[320,240] ];
  const prev = resolutionSelect.value;
  resolutionSelect.innerHTML = '';
  const def = document.createElement('option'); def.value = 'default'; def.textContent = 'Default'; resolutionSelect.appendChild(def);
  if(!caps || (!caps.width && !caps.height)){
    // fall back to common set
    candidates.forEach(([w,h])=>{ const o=document.createElement('option'); o.value = `${w}x${h}`; o.textContent = `${w}x${h}`; resolutionSelect.appendChild(o); });
    if(prev) resolutionSelect.value = prev;
    return;
  }
  const minW = caps.width && caps.width.min ? caps.width.min : 0;
  const maxW = caps.width && caps.width.max ? caps.width.max : Infinity;
  const minH = caps.height && caps.height.min ? caps.height.min : 0;
  const maxH = caps.height && caps.height.max ? caps.height.max : Infinity;
  for(const [w,h] of candidates){ if(w >= minW && w <= maxW && h >= minH && h <= maxH){ const o = document.createElement('option'); o.value = `${w}x${h}`; o.textContent = `${w}x${h}`; resolutionSelect.appendChild(o); } }
  if(prev && Array.from(resolutionSelect.options).some(o=>o.value===prev)) resolutionSelect.value = prev;
}
function grayScale(img,index) {
  return (0.299*img[index] + 0.587*img[index+1] + 0.114*img[index+2])|0
}
// --- Render / processing loop ---
function renderLoop(){
  try {
    if(!video || video.readyState < 2){ rafId = requestAnimationFrame(renderLoop); return; }
    const cw = canvas.width; const ch = canvas.height;
    ctx.save(); if(mirrorCheckbox.checked){ ctx.setTransform(-1,0,0,1,cw,0); } else { ctx.setTransform(1,0,0,1,0,0); }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(video, 0, 0, cw, ch);
    ctx.restore();

    const mode = modeSelect.value;
    const threshVal = Number(threshInput.value);
    const threshNorm = threshVal / Number(threshInput.max);

    if(mode === 'gpu-difference' && gpuSupported){ const lag = Number(lagInput.value) || 1; gpuProcess(mirrorCheckbox.checked, threshNorm, lag); // copy GPU canvas into motionCanvas
      mctx.clearRect(0,0,motionCanvas.width,motionCanvas.height);
      try{ mctx.save(); mctx.translate(0, motionCanvas.height); mctx.scale(1, -1); mctx.drawImage(glCanvas, 0, 0, motionCanvas.width, motionCanvas.height); mctx.restore(); }catch(e){}
    }
    // else if(mode === 'gpu-fourier' && gpuSupported){ const lag = Number(lagInput.value) || 1; gpuFourierProcess(mirrorCheckbox.checked, threshNorm, lag);
    //   mctx.clearRect(0,0,motionCanvas.width,motionCanvas.height);
    //   try{ mctx.save(); mctx.translate(0, motionCanvas.height); mctx.scale(1, -1); mctx.drawImage(glCanvas, 0, 0, motionCanvas.width, motionCanvas.height); mctx.restore(); }catch(e){}
    // }
    else {
      // CPU path: downscale to procCanvas and run chosen algorithm
      pctx.clearRect(0,0,procSize,procSize);
      pctx.save();
      if(mirrorCheckbox.checked){ pctx.setTransform(-1,0,0,1,procSize,0); } else { pctx.setTransform(1,0,0,1,0,0); }
      pctx.drawImage(video, 0, 0, procSize, procSize);
      pctx.restore();
      const img = pctx.getImageData(0,0,procSize,procSize);
       const red = new Uint8ClampedArray(procSize*procSize); const green = new Uint8ClampedArray(procSize*procSize); const blue = new Uint8ClampedArray(procSize*procSize);
      for(let i=0,j=0;i<img.data.length;i+=4,j++){ red[j]=img.data[i]; green[j]=img.data[i+1]; blue[j]=img.data[i+2]; }
      const motionImg = pctx.createImageData(procSize, procSize);
      if(mode === 'difference'){
        const lag = Math.max(1, Math.min(MAX_FRAME_HISTORY, Number(lagInput.value) || 1));
        let compare = null;
        if(prevImgs.length >= lag) compare = prevImgs[prevImgs.length - lag];
        if(compare){
          //const tNorm = threshNorm;
          for(let i=0;i<red.length;i++){
            let r = 128 + (red[i] - compare.data[i*4+0]) * 0.5//) / (255);
            let g = 128 + (green[i] - compare.data[i*4+1]) * 0.5//) / (255);
            let b = 128 + (blue[i] - compare.data[i*4+2]) * 0.5//) / (255);

            motionImg.data[i*4+0] = r//*(r > tNorm ? Math.min(1,r*8) : 0);
            motionImg.data[i*4+1] = g//*(g > tNorm ? Math.min(1,g*8) : 0);
            motionImg.data[i*4+2] = b//*(b > tNorm ? Math.min(1,b*8) : 0);
            motionImg.data[i*4+3] = 255;
          }
        }
        
        // push current gray into history (with optional feedback)
        // if(feedbackCheckbox && feedbackCheckbox.checked){
        //   const g = new Uint8ClampedArray(gray.length);
        //   const gain = Number(gainInput.value) || 1.0;
        //   for(let i=0;i<gray.length;i++){
        //     const d = Math.abs(gray[i] - (compare ? compare[i] : gray[i]));
        //     const dNorm = d/255;
        //     const mask = dNorm > tNorm ? Math.min(1, dNorm * 8) : 0;
        //     g[i] = Math.min(255, (gray[i] + mask * gain * 255)|0);
        //   }
        //   prevImgs.push(g);
        // } else {
        // }
      } else if (mode == "motion-blur") {
        const lag = Math.max(1, Math.min(MAX_FRAME_HISTORY, Number(lagInput.value) || 1));
        for (let i=0;i<red.length;i++) {
          let r = red[i],g = green[i],b = blue[i];
          for (let j = 0; j < lag; j++) {
            let compare = null;
            if (prevImgs.length >= lag) compare = prevImgs[prevImgs.length-j];
            if (compare) {
              r += (compare.data[i*4+0]);
              g += (compare.data[i*4+1]);
              b += (compare.data[i*4+2]);
            }
          }
          motionImg.data[i*4+0] = r / lag;
          motionImg.data[i*4+1] = g / lag;
          motionImg.data[i*4+2] = b / lag;
          motionImg.data[i*4+3] = 255;
        }
      }
      prevImgs.push(img);
      if(prevImgs.length > MAX_FRAME_HISTORY) prevImgs.shift();
      
      // else if(mode === 'fourier'){
      //   const blockSize = blockSizeVar; const blocks = Math.max(1, Math.floor(procSize / blockSize));
      //   const sens = (threshVal / Number(threshInput.max)) * 2;
      //   // compute energies for this frame
      //   const energies = new Float64Array(blocks * blocks);
      //   for(let br=0;br<blocks;br++){
      //     for(let bc=0;bc<blocks;bc++){
      //       const reBlock = new Float64Array(blockSize*blockSize);
      //       for(let y=0;y<blockSize;y++){
      //         const srcRow = (br*blockSize + y)*procSize + (bc*blockSize);
      //         const dstRow = y*blockSize;
      //         for(let x=0;x<blockSize;x++) reBlock[dstRow + x] = gray[srcRow + x];
      //       }
      //       const magBlock = fft2dMagnitude(reBlock, blockSize);
      //       let energy = 0; for(let i=0;i<magBlock.length;i++) energy += magBlock[i];
      //       energies[br*blocks + bc] = energy;
      //     }
      //   }
      //   const lag = Math.max(1, Math.min(MAX_FRAME_HISTORY, Number(lagInput.value) || 1));
      //   if(prevBlockHistory.length >= lag){
      //     const compareEnergies = prevBlockHistory[prevBlockHistory.length - lag];
      //     for(let br=0;br<blocks;br++){
      //       for(let bc=0;bc<blocks;bc++){
      //         const idx = br*blocks + bc;
      //         const diff = Math.abs(energies[idx] - compareEnergies[idx]);
      //         const diffNorm = diff / (blockSize*blockSize);
      //         const motionDetected = diffNorm > sens ? Math.min(1,diffNorm*4) : 0;
      //         for(let y=0;y<blockSize;y++){
      //           for(let x=0;x<blockSize;x++){
      //             const px = (br*blockSize + y)*procSize + (bc*blockSize + x);
      //             motionImg.data[px*4+0] = red[px]*motionDetected;
      //             motionImg.data[px*4+1] = green[px]*motionDetected;
      //             motionImg.data[px*4+2] = blue[px]*motionDetected;
      //             motionImg.data[px*4+3] = 255;
      //           }
      //         }
      //       }
      //     }
      //   }
      //   // push energies into history (with optional feedback amplification)
      //   if(feedbackCheckbox && feedbackCheckbox.checked){
      //     const gain = Number(gainInput.value) || 1.0;
      //     const amplified = new Float64Array(energies.length);
      //     for(let i=0;i<energies.length;i++){
      //       // if previous exists, decide mask by difference
      //       const prevE = prevBlockHistory.length >= 1 ? prevBlockHistory[prevBlockHistory.length - 1][i] : energies[i];
      //       const diff = Math.abs(energies[i] - prevE);
      //       const mask = diff > 0 ? 1 : 0;
      //       amplified[i] = energies[i] * (1.0 + gain * mask);
      //     }
      //     prevBlockHistory.push(amplified);
      //   } else {
      //     prevBlockHistory.push(energies);
      //   }
      //   if(prevBlockHistory.length > MAX_FRAME_HISTORY) prevBlockHistory.shift();
      // }
      pctx.putImageData(motionImg, 0, 0);
      mctx.clearRect(0,0,motionCanvas.width,motionCanvas.height);
      mctx.imageSmoothingEnabled = false;
      mctx.drawImage(procCanvas, 0, 0, motionCanvas.width, motionCanvas.height);
    }

    frameCount++; const now = performance.now(); if(now - lastFpsUpdate >= 500){ const fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate)); fpsSpan.textContent = 'FPS: ' + fps; frameCount = 0; lastFpsUpdate = now; }
    rafId = requestAnimationFrame(renderLoop);
  } catch (e) {
    setStatus(`Render Loop Error: ${e.message} (${e})`)
  }
}

async function resolveResolutionOptions() {
  try {
    const deviceId = deviceSelect.value === 'default' ? undefined : deviceSelect.value;
    const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : null;
      populateResolutionOptionsFromCapabilities(caps);
    stream.getTracks().forEach(tt=>tt.stop());
  } catch (e) {
    setStatus(`Resolution Error: ${e.message} (${e})`)
  }
}

async function startCamera(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ setStatus('getUserMedia not supported', true); return; }
  stopCamera();
  try {
    await resolveResolutionOptions()
    const res = parseResolution(resolutionSelect.value);
    const videoConstraints = {};
    if(deviceSelect && deviceSelect.value && deviceSelect.value !== 'default'){
      videoConstraints.deviceId = { exact: deviceSelect.value };
    }
    if(res){ Object.assign(videoConstraints, res); }
    else if(!videoConstraints.deviceId){ videoConstraints.facingMode = 'user'; }
    const constraints = { video: videoConstraints };
  
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // after permission, update device list so labels appear
    await updateDeviceList();
    video.srcObject = stream;
    await video.play();
    // populate resolution options based on the active track capabilities
    
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    const aspRatio = vWidth/vHeight;
    canvas.width = vWidth;
    canvas.height = vHeight;
    canvas.style.width = 480*aspRatio;
    canvas.style.height = 480;
    motionCanvas.width = vWidth;
    motionCanvas.height = vHeight;
    motionCanvas.style.width = 480*aspRatio;
    motionCanvas.style.height = 480;
    setStatus('Camera started');
    frameCount = 0;
    lastFpsUpdate = performance.now();
    saveSettings();
    renderLoop();
  }catch(err){
    setStatus('Camera error: ' + err.message + `(${err})`, true);
  }
}


function stopCamera(){ if(rafId) cancelAnimationFrame(rafId); rafId = null; if(video){ try{ video.pause(); }catch(e){} } if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; } setStatus('Camera stopped'); ctx.clearRect(0,0,canvas.width,canvas.height); }

restartBtn.addEventListener('click', startCamera);
snapshotBtn.addEventListener('click', async ()=>{ try{ const blob = await new Promise(res=>motionCanvas.toBlob(res,'image/png')); await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]); setStatus('Snapshot copied to clipboard'); }catch(err){ setStatus('Clipboard failed: ' + err.message, true); const blob = await new Promise(res=>motionCanvas.toBlob(res,'image/png')); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'snapshot.png'; a.click(); URL.revokeObjectURL(url); } });

resolutionSelect.addEventListener('change', ()=>{ if(stream) startCamera(); });
modeSelect.addEventListener('change', ()=>{ if(stream) startCamera(); });
resolutionSelect.addEventListener('change', ()=>{ if(stream) startCamera(); });
threshInput.addEventListener('change', ()=>{ if(stream) startCamera(); });
mirrorCheckbox.addEventListener('change', ()=>{ if(stream) startCamera(); });



// ensure feedback/gain saved when changed
// gainInput.addEventListener('change', saveSettings);
// feedbackCheckbox.addEventListener('change', saveSettings);
window.addEventListener('beforeunload', stopCamera);

// auto-start
// initialization moved to after device list population to allow restoring settings
// leave camera start to be explicit (we can auto-start if desired)
