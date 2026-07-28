let pdfjsLib;
const $ = id => document.getElementById(id);
const state = { pdf:null, pages:[], current:1, binding:'ltr', zoom:1, reduceMotion:false, renderToken:0, rendering:new Set() };
function pageExtent(page){ const v=page.getViewport({scale:1}); return {width:v.width,height:v.height}; }
function fileIsPdf(file){ return file && (file.type==='application/pdf' || file.name.toLowerCase().endsWith('.pdf')); }

async function openPdf(file){
  if(!fileIsPdf(file)){ alert('Please choose a PDF file.'); return; }
  $('readerStatus').textContent='Opening PDF…';
  state.renderToken++; const token=state.renderToken;
  try {
    // Load the 350 KB PDF.js module only when a PDF is actually opened.
    if(!pdfjsLib) { pdfjsLib=await import('./vendor/pdf.min.js'); pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.min.js'; }
    const buffer=await file.arrayBuffer();
    state.pdf=await pdfjsLib.getDocument({data:buffer}).promise;
    state.pages=Array.from({length:state.pdf.numPages},()=>({src:null,width:612,height:792,ratio:612/792}));
    state.rendering.clear(); state.current=1; state.zoom=1;
    $('bookTitle').textContent=file.name;
    $('pageCountLabel').textContent=`· ${state.pdf.numPages} pages`;
    $('pageTotal').textContent=`/ ${state.pdf.numPages}`;
    $('pageSlider').max=state.pdf.numPages; $('pageJump').max=state.pdf.numPages;
    $('largeWarning').hidden=!(state.pdf.numPages>100 || file.size>50*1024*1024);
    $('workspace').hidden=false; $('dropZone').hidden=true;
    buildThumbnails(); updateView();

    // Render only the visible cover/spread first so the app becomes usable quickly.
    await Promise.all([renderPage(1,token), state.pdf.numPages>1?renderPage(2,token):Promise.resolve()]);
    if(token!==state.renderToken)return;
    updateView();
    renderRemainingPages(token); // Continue in the background without blocking navigation.
  } catch(err){ console.error(err); alert(`Could not open this PDF: ${err.message||err}`); }
  finally { if(token===state.renderToken && !state.pages.some(p=>p.src)) $('readerStatus').textContent='No pages rendered.'; }
}

async function renderPage(index,token=state.renderToken){
  const p=state.pages[index-1];
  if(!p || p.src || state.rendering.has(index) || token!==state.renderToken)return;
  state.rendering.add(index);
  try{
    const page=await state.pdf.getPage(index); const extent=pageExtent(page); p.width=extent.width; p.height=extent.height; p.ratio=extent.width/extent.height;
    const scale=Number($('scaleInput').value)||1.2; const viewport=page.getViewport({scale});
    const canvas=document.createElement('canvas'); const ctx=canvas.getContext('2d',{alpha:false});
    canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:ctx,viewport}).promise;
    if(token===state.renderToken){p.src=canvas.toDataURL('image/jpeg',.86); updateThumbnail(index); if(index===state.current||index===state.current+1)updateView();}
  } finally { state.rendering.delete(index); }
}
async function renderRemainingPages(token){
  for(let i=1;i<=state.pages.length;i++){
    if(token!==state.renderToken)return;
    await renderPage(i,token);
    if(i%3===0)await new Promise(requestAnimationFrame);
  }
  if(token===state.renderToken)$('readerStatus').textContent=state.current===1?'Cover · Page 1':`Pages ${state.current}–${Math.min(state.current+1,state.pages.length)} of ${state.pages.length}`;
}

function buildThumbnails(){
  const box=$('thumbnails'); box.replaceChildren();
  state.pages.forEach((p,i)=>{ const b=document.createElement('button'); b.className='thumb'; b.type='button'; b.dataset.page=i+1; b.title=`Go to page ${i+1}`; b.innerHTML=p.src?`<img src="${p.src}" alt="Page ${i+1} thumbnail">`:`<span class="thumb-placeholder" aria-label="Page ${i+1} loading">${i+1}</span>`; b.insertAdjacentHTML('beforeend',`<small>${i+1}</small>`); b.onclick=()=>{jump(i+1);renderPage(i+1)}; box.append(b); });
}
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
  const maxW=state.current===1?availableW*.78:availableW/2-10;
  const s=Math.min(maxW/p.width,availableH/p.height); return {w:p.width*s,h:p.height*s};
}
function setPageImage(el,index){
  const p=state.pages[index-1]; const d=dimensionsFor(p); el.style.width=`${d.w*state.zoom}px`; el.style.height=`${d.h*state.zoom}px`; el.replaceChildren();
  if(p.src){const img=new Image();img.src=p.src;img.alt=`Page ${index}`;el.append(img);}else{const loadingPage=document.createElement('span');loadingPage.className='page-placeholder';loadingPage.textContent=`Rendering page ${index}…`;el.append(loadingPage);renderPage(index);}
}
function updateView(transition=''){
  if(!state.pages.length)return;
  const stage=$('bookStage'); stage.className='book-stage';
  if(state.current===1)stage.classList.add('cover-stage');
  if(state.reduceMotion)stage.classList.add('fade-mode');
  if(transition && !state.reduceMotion)stage.classList.add(`turn-${transition}`);
  stage.replaceChildren(); const a=document.createElement('div'); a.className='page'; setPageImage(a,state.current); stage.append(a);
  if(state.current>1 && state.current<state.pages.length){ const b=document.createElement('div'); b.className='page'; setPageImage(b,state.current+1); stage.append(b); }
  stage.style.flexDirection=state.binding==='rtl'?'row-reverse':'row';
  $('pageJump').value=state.current; $('pageSlider').value=state.current; $('prevBtn').disabled=state.current<=1; $('nextBtn').disabled=state.current>=state.pages.length;
  [...document.querySelectorAll('.thumb')].forEach(x=>x.classList.toggle('active',Number(x.dataset.page)===state.current));
  $('readerStatus').textContent=state.current===1?'Cover · Page 1':`Pages ${state.current}–${Math.min(state.current+1,state.pages.length)} of ${state.pages.length}`;
}
function jump(n,transition=''){ if(!state.pages.length)return; n=Math.max(1,Math.min(state.pages.length,Math.round(n))); if(n>1 && n%2===1)n--; state.current=n; updateView(transition); }
function nextSpread(){ if(state.current===1)jump(2,'next'); else jump(state.current+2,'next'); }
function prevSpread(){ if(state.current<=2)jump(1,'prev'); else jump(state.current-2,'prev'); }
function next(){ state.binding==='rtl'?prevSpread():nextSpread(); }
function prev(){ state.binding==='rtl'?nextSpread():prevSpread(); }
function updateSizing(){ updateView(); }

$('openBtn').onclick=()=> $('fileInput').click(); $('chooseBtn').onclick=()=> $('fileInput').click();
$('fileInput').onchange=e=>e.target.files[0]&&openPdf(e.target.files[0]);
const dz=$('dropZone'); ['dragenter','dragover'].forEach(e=>dz.addEventListener(e,x=>{x.preventDefault();dz.classList.add('dragging')})); ['dragleave','drop'].forEach(e=>dz.addEventListener(e,x=>{x.preventDefault();dz.classList.remove('dragging')})); dz.addEventListener('drop',e=>openPdf(e.dataTransfer.files[0])); dz.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')$('fileInput').click()});
$('nextBtn').onclick=next; $('prevBtn').onclick=prev; $('pageSlider').oninput=e=>jump(e.target.value); $('pageJump').onchange=e=>jump(e.target.value);

// Pointer/touch page turning: drag from a book edge, or swipe across the reader on touch devices.
const reader=$('reader');
const drag={active:false,startX:0,lastX:0,pointerId:null,edge:false};
reader.addEventListener('pointerdown',e=>{
  if(!state.pages.length || e.target.closest('button,input,select,a'))return;
  const rect=reader.getBoundingClientRect(); const edgeSize=Math.min(110,rect.width*.22);
  const fromLeft=e.clientX-rect.left<edgeSize, fromRight=rect.right-e.clientX<edgeSize;
  if(e.pointerType==='mouse' && !fromLeft && !fromRight)return;
  drag.active=true; drag.startX=drag.lastX=e.clientX; drag.pointerId=e.pointerId; drag.edge=fromLeft||fromRight;
  reader.setPointerCapture?.(e.pointerId); reader.classList.add('dragging-reader'); $('bookStage').classList.add(state.binding==='rtl'?'rtl-drag':'ltr-drag');
});
reader.addEventListener('pointermove',e=>{
  if(!drag.active || e.pointerId!==drag.pointerId)return;
  const delta=e.clientX-drag.startX; drag.lastX=e.clientX;
  if(Math.abs(delta)>8)e.preventDefault();
  const max=Math.max(1,reader.clientWidth*.42); let progress=Math.max(-1,Math.min(1,delta/max));
  // A next turn pulls the current right edge left in LTR; RTL reverses the visual direction.
  if(state.binding==='rtl')progress*=-1;
  $('bookStage').style.setProperty('--drag-angle',`${progress*-78}deg`);
  $('bookStage').style.setProperty('--drag-progress',Math.abs(progress));
});
function finishDrag(cancel=false){
  if(!drag.active)return; const delta=drag.lastX-drag.startX; drag.active=false;
  reader.classList.remove('dragging-reader');
  if(drag.pointerId!==null)reader.releasePointerCapture?.(drag.pointerId);
  $('bookStage').classList.remove('ltr-drag','rtl-drag');
  $('bookStage').style.removeProperty('--drag-angle'); $('bookStage').style.removeProperty('--drag-progress');
  if(cancel || Math.abs(delta)<55)return;
  const visualNext=state.binding==='rtl' ? delta>0 : delta<0;
  visualNext?next():prev();
  drag.pointerId=null;
}
reader.addEventListener('pointerup',()=>finishDrag()); reader.addEventListener('pointercancel',()=>finishDrag(true)); reader.addEventListener('lostpointercapture',()=>{if(drag.active)finishDrag(true)});
$('bindingSelect').onchange=e=>{state.binding=e.target.value;updateView()}; $('viewMode').onchange=e=>{$('scaleWrap').hidden=e.target.value!=='scale';$('customWrap').hidden=e.target.value!=='custom';updateSizing()}; ['scaleInput','customWidth','customHeight'].forEach(id=>$(id).onchange=updateSizing);
$('zoomIn').onclick=()=>{state.zoom=Math.min(3,state.zoom+.1);updateView()}; $('zoomOut').onclick=()=>{state.zoom=Math.max(.4,state.zoom-.1);updateView()}; $('zoomReset').onclick=()=>{state.zoom=1;updateView()}; $('fitBtn').onclick=()=>{state.zoom=1;$('viewMode').value='fit';$('scaleWrap').hidden=true;$('customWrap').hidden=true;updateView()};
$('fullscreenBtn').onclick=()=>{const el=$('reader-shell')||$('reader'); (!document.fullscreenElement?$('reader').requestFullscreen():document.exitFullscreen()).catch(()=>{})}; $('thumbToggle').onclick=()=>{$('thumbPanel').hidden=true; const b=document.createElement('button');b.textContent='Show thumbnails';b.className='thumb-reopen';b.onclick=()=>{$('thumbPanel').hidden=false;b.remove()};$('workspace').prepend(b)};
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,button'))return;if(['ArrowRight','PageDown'].includes(e.key)){e.preventDefault();state.binding==='rtl'?prev():next()}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();state.binding==='rtl'?next():prev()}if(e.key==='Home')jump(1)});
$('themeSelect').onchange=e=>{document.body.dataset.theme=e.target.value==='system'?'':e.target.value;localStorage.setItem('bookreative-theme',e.target.value)}; $('contrastToggle').onchange=e=>{document.body.classList.toggle('high-contrast',e.target.checked);localStorage.setItem('bookreative-contrast',e.target.checked)}; $('motionToggle').onchange=e=>{state.reduceMotion=e.target.checked;document.body.classList.toggle('reduce-motion',state.reduceMotion);localStorage.setItem('bookreative-motion',e.target.checked);updateView()};
const savedTheme=localStorage.getItem('bookreative-theme')||'system';$('themeSelect').value=savedTheme;document.body.dataset.theme=savedTheme==='system'?'':savedTheme;$('contrastToggle').checked=localStorage.getItem('bookreative-contrast')==='true';document.body.classList.toggle('high-contrast',$('contrastToggle').checked);$('motionToggle').checked=localStorage.getItem('bookreative-motion')==='true';state.reduceMotion=$('motionToggle').checked;
window.addEventListener('resize',()=>{if(state.pages.length && $('viewMode').value==='fit')updateView()});
