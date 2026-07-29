let pdfjsLib;
const $ = id => document.getElementById(id);
const setStatus = message => { const el=$('readerStatus'); if(el)el.textContent=message; };
let toastTimer; function notify(message){const toast=$('toast');if(!toast)return;toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true},5000);}
const state = { pdf:null, pages:[], current:1, binding:'ltr', pageView:'book', zoom:1, reduceMotion:false, renderToken:0, rendering:new Set(), thumbStart:1 };
// Keep the control dock outside scrolling content so its edge-to-edge fixed position is reliable.
const controlDock=document.querySelector('.controls-dock'); if(controlDock)document.body.append(controlDock);
function pageExtent(page){ const v=page.getViewport({scale:1}); return {width:v.width,height:v.height}; }
const PDFJS_CDN='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
async function loadPdfJs(){
  if(pdfjsLib)return pdfjsLib;
  if(globalThis.pdfjsLib){pdfjsLib=globalThis.pdfjsLib;pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_CDN+'pdf.worker.min.js';return pdfjsLib;}
  const loadScript=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.async=true;script.crossOrigin='anonymous';script.onload=()=>globalThis.pdfjsLib?resolve(globalThis.pdfjsLib):reject(new Error('PDF.js loaded without pdfjsLib'));script.onerror=()=>reject(new Error(`Failed to load ${src}`));document.head.append(script)});
  // CDN first for the tablet-compatible PDF.js 3.11 bundle; local files are the deployment-safe fallback.
  try{pdfjsLib=await loadScript(PDFJS_CDN+'pdf.min.js');pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_CDN+'pdf.worker.min.js';}
  catch(cdnError){console.warn('PDF.js CDN unavailable; using bundled fallback.',cdnError);try{pdfjsLib=await loadScript('./pdf.min.js');pdfjsLib.GlobalWorkerOptions.workerSrc='./pdf.worker.min.js';}catch(localError){throw new Error('Could not load PDF.js from the CDN or bundled fallback.');}}
  return pdfjsLib;
}

async function openPdf(file){
  if(!fileIsPdf(file)){ notify('Please choose a PDF file.'); return; }
  document.body.classList.remove('no-book'); setStatus('Opening PDF…');
  state.renderToken++; const token=state.renderToken;
  try {
    // Load the tablet-compatible PDF.js 3.11 legacy browser bundle only when needed.
    await loadPdfJs();
    const buffer=await file.arrayBuffer();
    state.pdf=await pdfjsLib.getDocument({data:buffer}).promise;
    state.pages=Array.from({length:state.pdf.numPages},()=>({src:null,width:612,height:792,ratio:612/792}));
    state.rendering.clear(); state.current=1; state.zoom=1; state.thumbStart=1;
    $('bookTitle').textContent=file.name;
    $('pageCountLabel').textContent=`· ${state.pdf.numPages} pages`;
    $('pageTotal').textContent=`/ ${state.pdf.numPages}`;
    $('pageSlider').max=state.pdf.numPages; $('pageJump').max=state.pdf.numPages;
    $('largeWarning').hidden=!(state.pdf.numPages>100 || file.size>50*1024*1024);
    $('viewMode').value='fit'; $('scaleWrap').hidden=true; $('customWrap').hidden=true; $('workspace').hidden=false;
    buildThumbnails(); updateView();

    // Render only the visible cover/spread first so lower-memory tablets become usable quickly.
    await ensureVisiblePages(token);
    if(token!==state.renderToken)return;
    updateView();
    // Desktop continues in the background; tablets stay on-demand to avoid memory crashes.
    renderRemainingPages(token);
  } catch(err){ console.error(err); notify(`Could not open this PDF: ${err.message||err}`); }
  finally { if(token===state.renderToken && !state.pages.some(p=>p.src)) setStatus('No pages rendered.'); }
}

function safeRenderScale(width,height){
  const requested=Number($('scaleInput').value)||1.2;
  const touchDevice=navigator.maxTouchPoints>0 || innerWidth<900;
  const lowMemory=navigator.deviceMemory&&navigator.deviceMemory<=2;
  const maxArea=(touchDevice||lowMemory)?3000000:18000000, maxDimension=(touchDevice||lowMemory)?2048:4096;
  return Math.min(requested,Math.sqrt(maxArea/(width*height)),maxDimension/Math.max(width,height));
}
async function ensureVisiblePages(token=state.renderToken){
  if(!state.pages.length || token!==state.renderToken)return;
  try{await renderPage(state.current,token); if(state.pageView!=='single' && state.current<state.pages.length)await renderPage(state.current+1,token);}catch(err){console.warn('Visible page render failed',err)}
}
async function renderPage(index,token=state.renderToken){
  const p=state.pages[index-1];
  if(!p || p.src || state.rendering.has(index) || token!==state.renderToken)return;
  state.rendering.add(index);
  try{
    const page=await state.pdf.getPage(index); const extent=pageExtent(page); p.width=extent.width; p.height=extent.height; p.ratio=extent.width/extent.height;
    const scale=safeRenderScale(extent.width,extent.height); const viewport=page.getViewport({scale});
    const canvas=document.createElement('canvas'); const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:false});
    canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:ctx,viewport, intent:'display'}).promise;
    if(token===state.renderToken){p.src=canvas.toDataURL('image/jpeg',navigator.maxTouchPoints>0?.78:.86); updateThumbnail(index); if(index===state.current||index===state.current+1)updateView();}
    page.cleanup?.(); canvas.width=1; canvas.height=1;
  } finally { state.rendering.delete(index); }
}
function isConstrainedDevice(){return navigator.maxTouchPoints>0 || (navigator.deviceMemory&&navigator.deviceMemory<=2) || innerWidth<700;}
async function renderRemainingPages(token){
  // On tablets, render on demand instead of filling memory with every page at once.
  if(isConstrainedDevice())return;
  for(let i=1;i<=state.pages.length;i++){
    if(token!==state.renderToken)return;
    try{await renderPage(i,token)}catch(err){state.pages[i-1].error=true;console.warn(`Page ${i} render failed`,err)}
    if(i%2===0)await new Promise(requestAnimationFrame);
  }
  if(token===state.renderToken)setStatus(state.current===1?'Cover · Page 1':`Pages ${state.current}–${Math.min(state.current+1,state.pages.length)} of ${state.pages.length}`);
}

function buildThumbnails(){
  const box=$('thumbnails'); box.replaceChildren();
  const start=Math.max(1,Math.min(state.thumbStart,state.pages.length||1)); const end=Math.min(state.pages.length,start+9);
  for(let pageNumber=start;pageNumber<=end;pageNumber++){
    const p=state.pages[pageNumber-1], b=document.createElement('button'); b.className='thumb'; b.type='button'; b.dataset.page=pageNumber; b.title=`Go to page ${pageNumber}`;
    b.innerHTML=p.src?`<img src="${p.src}" alt="Page ${pageNumber} thumbnail">`:`<span class="thumb-placeholder" aria-label="Page ${pageNumber} loading">${pageNumber}</span>`;
    b.insertAdjacentHTML('beforeend',`<small>${pageNumber}</small>`); b.onclick=()=>{jump(pageNumber);renderPage(pageNumber)}; box.append(b);
  }
  $('thumbRange').textContent=state.pages.length?`${start}–${end}`:'0'; $('thumbPrev').disabled=start<=1; $('thumbNext').disabled=end>=state.pages.length;
}
function ensureThumbnailWindow(index){ const desired=Math.floor((index-1)/10)*10+1; if(desired!==state.thumbStart){state.thumbStart=desired;buildThumbnails();} }
function updateThumbnail(index){
  const b=document.querySelector(`.thumb[data-page="${index}"]`); const p=state.pages[index-1];
  if(b&&p?.src){ const old=b.querySelector('img,.thumb-placeholder'); if(old){const img=new Image();img.src=p.src;img.alt=`Page ${index} thumbnail`;old.replaceWith(img);} }
}
function dimensionsFor(p){
  const mode=$('viewMode').value;
  if(mode==='scale'){ const s=Number($('scaleInput').value)||1.2; return {w:p.width*s,h:p.height*s}; }
  if(mode==='custom'){
    const maxW=Number($('customWidth').value)||700, maxH=Number($('customHeight').value)||900;
    const s=Math.min(maxW/p.width,maxH/p.height); return {w:p.width*s,h:p.height*s};
  }
  // Fit each page into the available reader area while preserving its PDF ratio.
  const reader=$('reader'); const availableW=Math.max(180,reader.clientWidth-70), availableH=Math.max(220,reader.clientHeight-55);
  const maxW=(state.pageView==='single' || (state.pageView==='book' && state.current===1))?availableW*.78:availableW/2-10;
  const s=Math.min(maxW/p.width,availableH/p.height); return {w:p.width*s,h:p.height*s};
}
function setPageImage(el,index){
  const p=state.pages[index-1]; const d=dimensionsFor(p); el.style.width=`${d.w*state.zoom}px`; el.style.height=`${d.h*state.zoom}px`; el.replaceChildren();
  if(p.src){const img=new Image();img.src=p.src;img.alt=`Page ${index}`;el.append(img);}else{const loadingPage=document.createElement('span');loadingPage.className='page-placeholder';loadingPage.textContent=p.error?`Page ${index} could not render`:`Preparing page ${index}…`;el.append(loadingPage);}
}
function updateView(transition=''){
  if(!state.pages.length)return;
  const stage=$('bookStage');
  const previousPages=transition && stage.children.length?[...stage.children].map(node=>node.cloneNode(true)):[];
  stage.className='book-stage';
  if(state.current===1 && state.pageView==='book')stage.classList.add('cover-stage');
  if(state.reduceMotion)stage.classList.add('fade-mode');
  if(transition && !state.reduceMotion)stage.classList.add(`turn-${transition}`);
  stage.replaceChildren();
  if(previousPages.length){const snapshot=document.createElement('div'); snapshot.className='book-snapshot'; snapshot.style.flexDirection='row'; previousPages.forEach(page=>snapshot.append(page)); stage.append(snapshot);}
  const a=document.createElement('div'); a.className='page leaf'; setPageImage(a,state.current); stage.append(a);
  const showSpread=state.pageView!=='single' && !(state.pageView==='book' && state.current===1);
  if(showSpread && state.current<state.pages.length){ const b=document.createElement('div'); b.className='page leaf'; setPageImage(b,state.current+1); stage.append(b); }
  stage.style.flexDirection=state.binding==='rtl'?'row-reverse':'row';
  $('pageJump').value=state.current; $('pageSlider').value=state.current; $('prevBtn').disabled=state.current<=1; $('nextBtn').disabled=state.current>=state.pages.length;
  [...document.querySelectorAll('.thumb')].forEach(x=>x.classList.toggle('active',Number(x.dataset.page)===state.current));
  setStatus(state.pageView==='single'?`Page ${state.current} of ${state.pages.length}`:(state.current===1&&state.pageView==='book'?'Cover · Page 1':`Pages ${state.current}–${Math.min(state.current+1,state.pages.length)} of ${state.pages.length}`));
  if(previousPages.length)setTimeout(()=>stage.querySelector('.book-snapshot')?.remove(),520);
}
function jump(n,transition=''){ if(!state.pages.length)return; n=Math.max(1,Math.min(state.pages.length,Math.round(n))); if(state.pageView!=='single' && n>1 && n%2===1)n--; state.current=n; ensureThumbnailWindow(n); updateView(transition); ensureVisiblePages(state.renderToken); }
function nextSpread(){ const step=state.pageView==='single'?1:2; jump(state.current===1?2:state.current+step,'next'); }
function prevSpread(){ const step=state.pageView==='single'?1:2; jump(state.current<=step?1:state.current-step,'prev'); }
function next(){ state.binding==='rtl'?prevSpread():nextSpread(); }
function prev(){ state.binding==='rtl'?nextSpread():prevSpread(); }
function updateSizing(){ updateView(); }

$('openBtn').onclick=()=> $('fileInput').click();
$('fileInput').onchange=e=>e.target.files[0]&&openPdf(e.target.files[0]);
$('nextBtn').onclick=next; $('prevBtn').onclick=prev; $('pageSlider').oninput=e=>jump(e.target.value); $('pageJump').onchange=e=>jump(e.target.value);

// Pointer/touch page turning: drag from a book edge, or swipe across the reader on touch devices.
const reader=$('reader');
reader.addEventListener('wheel',e=>{if(!state.pages.length)return;e.preventDefault();const direction=e.deltaY<0?1:-1;state.zoom=Math.max(.4,Math.min(3,state.zoom+direction*.1));updateView()},{passive:false});
const drag={active:false,startX:0,lastX:0,pointerId:null,edge:false,startTime:0};
const pointers=new Map(); let pinchStartDistance=0; let pinchStartZoom=1;
reader.addEventListener('pointerdown',e=>{
  if(!state.pages.length || e.target.closest('button,input,select,a'))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){
    drag.active=false; reader.classList.remove('dragging-reader'); $('bookStage').classList.remove('ltr-drag','rtl-drag','drag-next','drag-prev'); $('bookStage').style.removeProperty('--drag-angle'); $('bookStage').style.removeProperty('--drag-progress');
    const pts=[...pointers.values()]; pinchStartDistance=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y); pinchStartZoom=state.zoom;
    reader.setPointerCapture?.(e.pointerId); return;
  }
  const rect=reader.getBoundingClientRect(); const edgeSize=Math.min(110,rect.width*.22);
  const fromLeft=e.clientX-rect.left<edgeSize, fromRight=rect.right-e.clientX<edgeSize;
  if(e.pointerType==='mouse' && !fromLeft && !fromRight)return;
  drag.active=true; drag.startX=drag.lastX=e.clientX; drag.startTime=performance.now(); drag.pointerId=e.pointerId; drag.edge=fromLeft||fromRight;
  reader.setPointerCapture?.(e.pointerId); reader.classList.add('dragging-reader'); $('bookStage').classList.add(state.binding==='rtl'?'rtl-drag':'ltr-drag');
});
reader.addEventListener('pointermove',e=>{
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size>=2){
    const pts=[...pointers.values()]; const distance=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);
    state.zoom=Math.max(.4,Math.min(3,pinchStartZoom*(distance/Math.max(1,pinchStartDistance)))); updateView(); e.preventDefault(); return;
  }
  if(!drag.active || e.pointerId!==drag.pointerId)return;
  const delta=e.clientX-drag.startX; drag.lastX=e.clientX;
  if(Math.abs(delta)>8)e.preventDefault();
  const max=Math.max(1,reader.clientWidth*.42); let progress=Math.max(-1,Math.min(1,delta/max));
  // A next turn pulls the current right edge left in LTR; RTL reverses the visual direction.
  if(state.binding==='rtl')progress*=-1;
  const stage=$('bookStage'); stage.classList.toggle('drag-next',progress<0); stage.classList.toggle('drag-prev',progress>=0);
  stage.style.setProperty('--drag-angle',`${progress*-78}deg`);
  stage.style.setProperty('--drag-progress',Math.abs(progress));
});
function finishDrag(cancel=false,endX=drag.lastX){
  if(!drag.active)return; const delta=endX-drag.startX; const elapsed=performance.now()-drag.startTime; drag.active=false;
  reader.classList.remove('dragging-reader');
  if(drag.pointerId!==null)reader.releasePointerCapture?.(drag.pointerId);
  $('bookStage').classList.remove('ltr-drag','rtl-drag','drag-next','drag-prev');
  $('bookStage').style.removeProperty('--drag-angle'); $('bookStage').style.removeProperty('--drag-progress');
  if(cancel)return;
  // A short release is a tap: the left half goes back and the right half advances.
  if(Math.abs(delta)<12 && elapsed<500){
    const rect=reader.getBoundingClientRect(); endX<rect.left+rect.width/2?prev():next();
    return;
  }
  if(Math.abs(delta)<55)return;
  const visualNext=state.binding==='rtl' ? delta>0 : delta<0;
  visualNext?next():prev();
  drag.pointerId=null;
}
reader.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);finishDrag(false,e.clientX)}); reader.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);finishDrag(true,e.clientX)}); reader.addEventListener('lostpointercapture',()=>{if(drag.active)finishDrag(true)});
$('pageView').onchange=e=>{state.pageView=e.target.value;if(state.pages.length)jump(state.current)};
$('viewMode').onchange=e=>{$('scaleWrap').hidden=e.target.value!=='scale';$('customWrap').hidden=e.target.value!=='custom';updateSizing()}; ['scaleInput','customWidth','customHeight'].forEach(id=>$(id).onchange=updateSizing);
$('zoomIn').onclick=()=>{state.zoom=Math.min(3,state.zoom+.1);updateView()}; $('zoomOut').onclick=()=>{state.zoom=Math.max(.4,state.zoom-.1);updateView()}; $('zoomReset').onclick=()=>{state.zoom=1;updateView()}; $('fitBtn').onclick=()=>{state.zoom=1;$('viewMode').value='fit';$('scaleWrap').hidden=true;$('customWrap').hidden=true;updateView()};
$('fullscreenBtn').onclick=()=>{(!document.fullscreenElement?$('reader').requestFullscreen():document.exitFullscreen()).catch(()=>{})};
$('settingsBtn').onclick=()=>{const pop=$('settingsPopover'),open=pop.hidden;pop.hidden=!open;$('settingsBtn').setAttribute('aria-expanded',String(open))};
document.addEventListener('click',e=>{if(!e.target.closest('.settings-popover,.settings-icon')&&!$('settingsPopover').hidden){$('settingsPopover').hidden=true;$('settingsBtn').setAttribute('aria-expanded','false')}});
window.addEventListener('orientationchange',()=>{if(state.pages.length && $('viewMode').value==='fit')updateView()});
function toggleThumbnails(){ const panel=$('thumbPanel'), hidden=panel.classList.contains('is-hidden'); panel.classList.toggle('is-hidden',!hidden); $('thumbsBtn').setAttribute('aria-expanded',String(hidden)); $('thumbsBtn').textContent=hidden?'Hide thumbnails':'Show thumbnails'; }
$('thumbToggle').onclick=toggleThumbnails; $('thumbsBtn').onclick=toggleThumbnails;
$('thumbPrev').onclick=()=>{state.thumbStart=Math.max(1,state.thumbStart-10);buildThumbnails()}; $('thumbNext').onclick=()=>{if(state.thumbStart+10<=state.pages.length){state.thumbStart+=10;buildThumbnails()}};
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,button'))return;if(['ArrowRight','PageDown'].includes(e.key)){e.preventDefault();next()}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();prev()}if(e.key==='Home')jump(1)});
function applyTheme(value){
  const darkPalette=['dark','deepsea','lavender'].includes(value); document.body.dataset.theme=darkPalette?'dark':'light'; document.body.dataset.palette=value; localStorage.setItem('bookreative-theme',value); $('themeSelect').value=value;
}
$('themeMenuBtn').onclick=()=>{const select=$('themeSelect'),open=select.hidden;select.hidden=!open;$('themeMenuBtn').setAttribute('aria-expanded',String(open));if(open)select.focus()}; $('themeSelect').onchange=e=>applyTheme(e.target.value);
$('motionToggle').onchange=e=>{state.reduceMotion=e.target.checked;document.body.classList.toggle('reduce-motion',state.reduceMotion);localStorage.setItem('bookreative-motion',state.reduceMotion);updateView()};
const savedTheme=localStorage.getItem('bookreative-theme');const initialTheme=['dark','light','deepsea','lavender'].includes(savedTheme)?savedTheme:'light';applyTheme(initialTheme);const savedMotion=localStorage.getItem('bookreative-motion');const initialMotion=savedMotion===null?true:savedMotion==='true';$('motionToggle').checked=initialMotion;state.reduceMotion=initialMotion;
window.addEventListener('resize',()=>{if(state.pages.length && $('viewMode').value==='fit')updateView()});
