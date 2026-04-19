const M=1e6;
let tipo='MAX',metodo='simplex',chartObj=null,solGlobal=null,iterIdx=0;

const methodInfos={
  simplex:'<strong>Simplex estándar:</strong> Solo restricciones ≤. Variables de holgura forman la base inicial.',
  granm:'<strong>Gran M:</strong> Permite ≤, ≥ e =. Agrega variables artificiales con penalización M en la función objetivo. Si alguna artificial queda en la base, el problema es infactible.',
  dosfases:'<strong>Dos Fases:</strong> Fase 1 minimiza la suma de variables artificiales (si Z₁=0 → factible). Fase 2 optimiza el objetivo original. Más estable numéricamente que Gran M.'
};

const methodHints={
  simplex:'Solo tipo ≤ disponible en Simplex estándar',
  granm:'Selecciona el tipo de cada restricción: ≤, ≥ o =',
  dosfases:'Selecciona el tipo de cada restricción: ≤, ≥ o ='
};

function setMetodo(m) {
  metodo = m; // Actualiza la variable global

  // 1. Manejo de botones (Color morado)
  document.getElementById('mSimplex').classList.remove('active');
  document.getElementById('mGranM').classList.remove('active');
  document.getElementById('mDosFases').classList.remove('active');

  if (m === 'simplex') document.getElementById('mSimplex').classList.add('active');
  if (m === 'granm') document.getElementById('mGranM').classList.add('active');
  if (m === 'dosfases') document.getElementById('mDosFases').classList.add('active');

  // 2. Actualizar textos de ayuda
  document.getElementById('methodInfo').innerHTML = methodInfos[m];

  // CORRECCIÓN DEL TEXTO DE AYUDA (tipoHint):
  const hint = document.getElementById('tipoHint');
  if (m === 'simplex') {
    hint.textContent = "Solo tipo ≤ disponible en Simplex estándar";
    hint.style.color = "#4b5563"; // Gris para Simplex
  } else {
    hint.textContent = "Selecciona el tipo de cada restricción: ≤, ≥ o =";
    hint.style.color = "#7c3aed"; // Morado para resaltar que ahora es dinámico
  }

  // 3. Redibujar inputs para mostrar los selectores
  buildInputs();
}

function setTipo(t){
  tipo=t;
  document.getElementById('btnMax').classList.toggle('active',t==='MAX');
  document.getElementById('btnMin').classList.toggle('active',t==='MIN');
  document.getElementById('tipoBadge').textContent=t;
}

function buildInputs(){
  const nv=+document.getElementById('nVars').value;
  const nr=+document.getElementById('nRestr').value;
  const vars=Array.from({length:nv},(_,i)=>`X${i+1}`);
  let fo='';
  vars.forEach(v=>{fo+=`<div class="row"><span class="rl">${v}</span><input type="number" id="fo_${v}" value="0" step="any"></div>`;});
  document.getElementById('foCard').innerHTML=fo;
  let rs='';
  for(let i=0;i<nr;i++){
    const tipoSel=metodo==='simplex'
      ?`<span style="font-size:12px;color:#4b5563;padding:0 4px">≤</span>`
      :`<select class="restr-tipo" id="rt${i}"><option value="le" selected>≤</option><option value="ge">≥</option><option value="eq">=</option></select>`;
    rs+=`<div style="margin-bottom:.5rem">
      <div style="font-size:11px;color:#7c3aed;margin-bottom:3px;font-weight:500">R${i+1}</div>
      <div class="row">
        ${vars.map(v=>`<input type="number" id="r${i}_${v}" value="0" step="any" placeholder="${v}">`).join('')}
        ${tipoSel}
        <input type="number" id="r${i}_rhs" value="0" step="any" placeholder="RHS">
      </div></div>`;
  }
  document.getElementById('restrCard').innerHTML=rs;
 
}

function setDefaultExample(){
  const nv=+document.getElementById('nVars').value;
  const nr=+document.getElementById('nRestr').value;
  if(metodo==='simplex'||metodo==='granm'||metodo==='dosfases'){
    document.getElementById('fo_X1').value=2;
    document.getElementById('fo_X2').value=4;
    if(metodo==='simplex'){
      document.getElementById('r0_X1').value=1;document.getElementById('r0_X2').value=2;document.getElementById('r0_rhs').value=5;
      document.getElementById('r1_X1').value=1;document.getElementById('r1_X2').value=1;document.getElementById('r1_rhs').value=4;
    } else {
      document.getElementById('r0_X1').value=1;document.getElementById('r0_X2').value=2;document.getElementById('r0_rhs').value=5;
      if(document.getElementById('rt0')) document.getElementById('rt0').value='le';
      document.getElementById('r1_X1').value=1;document.getElementById('r1_X2').value=1;document.getElementById('r1_rhs').value=2;
      if(document.getElementById('rt1')) document.getElementById('rt1').value='ge';
    }
  }
}

function limpiar(){
  document.getElementById('resultados').innerHTML='';
  if(chartObj){chartObj.destroy();chartObj=null;}
  solGlobal=null;
}

function resolver(){
  const nv=+document.getElementById('nVars').value;
  const nr=+document.getElementById('nRestr').value;
  const vars=Array.from({length:nv},(_,i)=>`X${i+1}`);
  let c=vars.map(v=>+document.getElementById(`fo_${v}`).value);
  let cOrig=[...c];
  let A=[],b=[],tipos=[];
  for(let i=0;i<nr;i++){
    A.push(vars.map(v=>+document.getElementById(`r${i}_${v}`).value));
    b.push(+document.getElementById(`r${i}_rhs`).value);
    tipos.push(metodo==='simplex'?'le':(document.getElementById(`rt${i}`)?.value||'le'));
  }
  if(metodo==='simplex') solGlobal=solveSimplex(c,cOrig,A,b,nv,nr);
  else if(metodo==='granm') solGlobal=solveGranM(c,cOrig,A,b,tipos,nv,nr);
  else solGlobal=solveDosFases(c,cOrig,A,b,tipos,nv,nr);
  iterIdx=solGlobal.history.length-1;
  mostrarResultados(solGlobal,nv,nr,vars);
  if(nv===2) dibujarGrafico(A,b,tipos,solGlobal.xSol,solGlobal.zOpt,cOrig);
}

// ── SIMPLEX ESTÁNDAR ──────────────────────────────────────────────────────────
function solveSimplex(c,cOrig,A,b,nv,nr){
  let cM=tipo==='MIN'?c.map(x=>-x):[...c];
  const nt=nv+nr;
  let T=Array.from({length:nr+1},()=>new Array(nt+1).fill(0));
  for(let j=0;j<nv;j++) T[0][j+1]=-cM[j];
  for(let i=0;i<nr;i++){for(let j=0;j<nv;j++) T[i+1][j+1]=A[i][j];T[i+1][nv+i+1]=1;T[i+1][0]=b[i];}
  let base=Array.from({length:nr},(_,i)=>nv+i+1);
  const vn=Array.from({length:nt},(_,i)=>i<nv?`X${i+1}`:`S${i-nv+1}`);
  const history=[{base:[...base],T:T.map(r=>[...r]),pc:null,pr:null,label:'Tabla inicial',artCols:[]}];
  let iters=0,unbounded=false;
  while(iters<40){
    let pc=0,minV=-1e-9;
    for(let j=1;j<=nt;j++) if(T[0][j]<minV){minV=T[0][j];pc=j;}
    if(pc===0) break;
    let pr=0,minR=1e18;
    for(let i=1;i<=nr;i++) if(T[i][pc]>1e-9){const r=T[i][0]/T[i][pc];if(r<minR){minR=r;pr=i;}}
    if(pr===0){unbounded=true;break;}
    base[pr-1]=pc;
    pivot(T,pr,pc,nr,nt);
    iters++;
    history.push({base:[...base],T:T.map(r=>[...r]),pc,pr,label:`Iter ${iters}: entra ${vn[pc-1]}, sale ${vn[history[history.length-1].base[pr-1]-1]}`,artCols:[]});
    history[history.length-1].base=[...base];
  }
  return buildResult(T,base,cOrig,nv,nr,nt,iters,unbounded,false,history,[],vn);
}

// ── GRAN M ────────────────────────────────────────────────────────────────────
function solveGranM(c,cOrig,A,b,tipos,nv,nr){
  let cM=tipo==='MIN'?c.map(x=>-x):[...c];
  let nS=0,nA=0;
  const slackType=[]; // 1=holgura, -1=exceso, 0=nada
  tipos.forEach(t=>{if(t==='le'){nS++;slackType.push(1);}else if(t==='ge'){nS++;nA++;slackType.push(-1);}else{nA++;slackType.push(0);}});
  const nt=nv+nS+nA;
  let T=Array.from({length:nr+1},()=>new Array(nt+1).fill(0));
  for(let j=0;j<nv;j++) T[0][j+1]=-cM[j];

  let sIdx=nv,aIdx=nv+nS;
  const artCols=[];
  const base=[];
  for(let i=0;i<nr;i++){
    for(let j=0;j<nv;j++) T[i+1][j+1]=A[i][j];
    T[i+1][0]=b[i];
    if(slackType[i]===1){T[i+1][sIdx+1]=1;base.push(sIdx+1);sIdx++;}
    else if(slackType[i]===-1){T[i+1][sIdx+1]=-1;sIdx++;T[i+1][aIdx+1]=1;artCols.push(aIdx+1);base.push(aIdx+1);aIdx++;T[0][aIdx]+=M;}
    else{T[i+1][aIdx+1]=1;artCols.push(aIdx+1);base.push(aIdx+1);aIdx++;T[0][aIdx]+=M;}
  }
  // penalización M en fila 0 por artificiales en base
  for(let i=1;i<=nr;i++){
    if(artCols.includes(base[i-1])){
      for(let k=0;k<=nt;k++) T[0][k]-=M*T[i][k];
    }
  }
  const vn=buildVarNames(nv,nS,nA,tipos);
  const history=[{base:[...base],T:T.map(r=>[...r]),pc:null,pr:null,label:'Tabla inicial (Gran M)',artCols:[...artCols]}];
  let iters=0,unbounded=false;
  while(iters<50){
    let pc=0,minV=-1e-9;
    for(let j=1;j<=nt;j++) if(T[0][j]<minV){minV=T[0][j];pc=j;}
    if(pc===0) break;
    let pr=0,minR=1e18;
    for(let i=1;i<=nr;i++) if(T[i][pc]>1e-9){const r=T[i][0]/T[i][pc];if(r<minR){minR=r;pr=i;}}
    if(pr===0){unbounded=true;break;}
    const prevBase=base[pr-1];
    base[pr-1]=pc;
    pivot(T,pr,pc,nr,nt);
    iters++;
    history.push({base:[...base],T:T.map(r=>[...r]),pc,pr,label:`Iter ${iters}: entra ${vn[pc-1]}, sale ${vn[prevBase-1]}`,artCols:[...artCols]});
  }
  const infeasible=artCols.some(ac=>base.includes(ac)&&T[base.indexOf(ac)+1][0]>1e-6);
  return buildResult(T,base,cOrig,nv,nS+nA,nt,iters,unbounded,infeasible,history,artCols,vn);
}

// ── DOS FASES ─────────────────────────────────────────────────────────────────
function solveDosFases(c,cOrig,A,b,tipos,nv,nr){
  let nS=0,nA=0;
  const slackType=[];
  tipos.forEach(t=>{if(t==='le'){nS++;slackType.push(1);}else if(t==='ge'){nS++;nA++;slackType.push(-1);}else{nA++;slackType.push(0);}});
  const nt=nv+nS+nA;
  let T=Array.from({length:nr+1},()=>new Array(nt+1).fill(0));

  let sIdx=nv,aIdx=nv+nS;
  const artCols=[];
  const base=[];
  for(let i=0;i<nr;i++){
    for(let j=0;j<nv;j++) T[i+1][j+1]=A[i][j];
    T[i+1][0]=b[i];
    if(slackType[i]===1){T[i+1][sIdx+1]=1;base.push(sIdx+1);sIdx++;}
    else if(slackType[i]===-1){T[i+1][sIdx+1]=-1;sIdx++;T[i+1][aIdx+1]=1;artCols.push(aIdx+1);base.push(aIdx+1);aIdx++;}
    else{T[i+1][aIdx+1]=1;artCols.push(aIdx+1);base.push(aIdx+1);aIdx++;}
  }
  // Fase 1: minimizar suma de artificiales → maximizar negativo
  for(let j=1;j<=nt;j++) T[0][j]=artCols.includes(j)?-1:0;
  T[0][0]=0;
  for(let i=1;i<=nr;i++){
    if(artCols.includes(base[i-1])){
      for(let k=0;k<=nt;k++) T[0][k]+=T[i][k];
    }
  }

  const vn=buildVarNames(nv,nS,nA,tipos);
  const history=[];
  history.push({base:[...base],T:T.map(r=>[...r]),pc:null,pr:null,label:'Fase 1 — tabla inicial',artCols:[...artCols],phase:1});

  let iters=0;
  while(iters<40){
    let pc=0,minV=-1e-9;
    for(let j=1;j<=nt;j++) if(T[0][j]<minV){minV=T[0][j];pc=j;}
    if(pc===0) break;
    let pr=0,minR=1e18;
    for(let i=1;i<=nr;i++) if(T[i][pc]>1e-9){const r=T[i][0]/T[i][pc];if(r<minR){minR=r;pr=i;}}
    if(pr===0) break;
    const prevBase=base[pr-1];
    base[pr-1]=pc;
    pivot(T,pr,pc,nr,nt);
    iters++;
    history.push({base:[...base],T:T.map(r=>[...r]),pc,pr,label:`F1 Iter ${iters}: entra ${vn[pc-1]}, sale ${vn[prevBase-1]}`,artCols:[...artCols],phase:1});
  }

  const z1=T[0][0];
  const infeasible=Math.abs(z1)>1e-4;

  if(!infeasible){
    // Fase 2: cargar FO real, eliminar artificiales
    let cM=tipo==='MIN'?c.map(x=>-x):[...c];
    for(let j=0;j<=nt;j++) T[0][j]=0;
    for(let j=0;j<nv;j++) T[0][j+1]=-cM[j];
    // actualizar fila 0 con base actual
    for(let i=1;i<=nr;i++){
      if(base[i-1]<=nv){
        const cb=-(-cM[base[i-1]-1]);
        // ya está en base, hacer eliminación
      }
    }
    for(let i=1;i<=nr;i++){
      if(base[i-1]<=nv){
        const j=base[i-1];
        const f=T[0][j];
        if(Math.abs(f)>1e-9) for(let k=0;k<=nt;k++) T[0][k]-=f*T[i][k];
      } else if(base[i-1]<=nv+nS){
        const j=base[i-1];
        const f=T[0][j];
        if(Math.abs(f)>1e-9) for(let k=0;k<=nt;k++) T[0][k]-=f*T[i][k];
      }
    }

    history.push({base:[...base],T:T.map(r=>[...r]),pc:null,pr:null,label:'Fase 2 — inicio',artCols:[...artCols],phase:2});

    let iters2=0;
    while(iters2<40){
      let pc=0,minV=-1e-9;
      for(let j=1;j<=nt;j++){if(artCols.includes(j)) continue;if(T[0][j]<minV){minV=T[0][j];pc=j;}}
      if(pc===0) break;
      let pr=0,minR=1e18;
      for(let i=1;i<=nr;i++) if(T[i][pc]>1e-9){const r=T[i][0]/T[i][pc];if(r<minR){minR=r;pr=i;}}
      if(pr===0) break;
      const prevBase=base[pr-1];
      base[pr-1]=pc;
      pivot(T,pr,pc,nr,nt);
      iters2++;
      history.push({base:[...base],T:T.map(r=>[...r]),pc,pr,label:`F2 Iter ${iters2}: entra ${vn[pc-1]}, sale ${vn[prevBase-1]}`,artCols:[...artCols],phase:2});
    }
  }

  return buildResult(T,base,cOrig,nv,nS+nA,nt,iters,false,infeasible,history,artCols,vn);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pivot(T,pr,pc,nr,nt){
  const pe=T[pr][pc];
  for(let k=0;k<=nt;k++) T[pr][k]/=pe;
  for(let i=0;i<=nr;i++) if(i!==pr){const f=T[i][pc];for(let k=0;k<=nt;k++) T[i][k]-=f*T[pr][k];}
}

function buildVarNames(nv,nS,nA,tipos){
  const names=[];
  for(let i=0;i<nv;i++) names.push(`X${i+1}`);
  let si=1,ai=1;
  tipos.forEach(t=>{
    if(t==='le') names.push(`S${si++}`);
    else if(t==='ge'){names.push(`E${si++}`);names.push(`A${ai++}`);}
    else names.push(`A${ai++}`);
  });
  return names;
}

function buildResult(T,base,cOrig,nv,nSlack,nt,iters,unbounded,infeasible,history,artCols,vn){
  const nr=base.length;
  let zOpt=T[0][0];
  if(tipo==='MIN') zOpt=-zOpt;
  let xSol=new Array(nv).fill(0);
  for(let i=0;i<nr;i++) if(base[i]<=nv) xSol[base[i]-1]=parseFloat(Math.max(0,T[i+1][0]).toFixed(6));
  let multi=false;
  for(let j=1;j<=nv;j++){let isB=base.includes(j);if(!isB&&Math.abs(T[0][j])<1e-6&&!artCols.includes(j)) multi=true;}
  let tipoSol=infeasible?'Infactible':unbounded?'No acotado':multi?'Múltiples':'Única';
  return {T,base,xSol,zOpt,tipoSol,iters,nv,nr,nt,history,c:cOrig,artCols,vn};
}

// ── UI ────────────────────────────────────────────────────────────────────────
function mostrarResultados(res,nv,nr,vars){
  const {xSol,zOpt,tipoSol,history,nt,artCols,vn}=res;
  let metricas='<div class="metrics">';
  vars.forEach((v,i)=>{metricas+=`<div class="metric"><div class="metric-label">${v}</div><div class="metric-val">${xSol[i].toFixed(3)}</div></div>`;});
  metricas+=`<div class="metric"><div class="metric-label">Z*</div><div class="metric-val">${tipoSol==='Infactible'||tipoSol==='No acotado'?'—':zOpt.toFixed(3)}</div></div></div>`;

  let badgeCls=tipoSol==='Única'?'badge-green':tipoSol==='Múltiples'?'badge-amber':'badge-red';
  let extra='';
  if(tipoSol==='Múltiples') extra=`<div class="alert">Soluciones múltiples — cualquier punto en el segmento entre vértices óptimos es válido.</div>`;
  if(tipoSol==='No acotado') extra=`<div class="alert alert-red">Problema no acotado — Z crece indefinidamente.</div>`;
  if(tipoSol==='Infactible') extra=`<div class="alert alert-red">Problema infactible — no existe solución que satisfaga todas las restricciones. Revisa los datos.</div>`;

  const exportRow=`<div class="export-row">
    <button class="btn btn-green" onclick="exportPDF()">Descargar PDF</button>
    <button class="btn btn-amber" onclick="exportCSV()">Descargar CSV</button>
  </div>`;

  document.getElementById('resultados').innerHTML=`
  <div class="result-card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
      <span style="font-size:13px;color:#a78bfa;font-weight:500">Solución <span class="badge ${badgeCls}">${tipoSol}</span></span>
    </div>
    ${metricas}${extra}
    <div class="tab-row">
      <button class="tab active" onclick="switchTab(this,'tabFinal')">Tabla final</button>
      <button class="tab" onclick="switchTab(this,'tabIter')">Paso a paso</button>
    </div>
    <div id="tabFinal" class="panel active">${buildTabla(history[history.length-1],vn,nr,null,null,artCols)}</div>
    <div id="tabIter" class="panel">${buildIterPanel(history,vn,nr,artCols)}</div>
    ${exportRow}
  </div>`;
}

function switchTab(btn,id){
  btn.closest('.result-card').querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.closest('.result-card').querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(id).classList.add('active');
}

function buildTabla(snap,vn,nr,pivCol,pivRow,artCols){
  let t=`<table><thead><tr><th>Base</th>`;
  vn.forEach((v,i)=>{const ac=artCols&&artCols.includes(i+1);t+=`<th class="${ac?'art-col':''}">${v}</th>`;});
  t+=`<th>RHS</th></tr></thead><tbody>`;
  t+=`<tr><td class="bc">Z</td>`;
  vn.forEach((_,j)=>{const ac=artCols&&artCols.includes(j+1);const pc2=pivCol&&j+1===pivCol;t+=`<td class="${pc2?'pc':ac?'art-col':''}">${fmt(snap.T[0][j+1])}</td>`;});
  t+=`<td>${fmt(snap.T[0][0])}</td></tr>`;
  for(let i=1;i<=nr;i++){
    const isArt=artCols&&artCols.includes(snap.base[i-1]);
    t+=`<tr><td class="bc${isArt?' art-col':''}">${vn[snap.base[i-1]-1]||'?'}</td>`;
    vn.forEach((_,j)=>{const pc2=pivCol&&j+1===pivCol&&pivRow&&i===pivRow;const pr2=pivRow&&i===pivRow;t+=`<td class="${pc2?'pc':pr2?'pc':''}">${fmt(snap.T[i][j+1])}</td>`;});
    t+=`<td class="${pivRow&&i===pivRow?'pc':''}">${fmt(snap.T[i][0])}</td></tr>`;
  }
  t+=`</tbody></table>`;
  if(artCols&&artCols.length) t+=`<div style="font-size:10px;color:#4b5563;margin-top:4px">Variables artificiales en cursiva dorada</div>`;
  return t;
}

function buildIterPanel(history,vn,nr,artCols){
  const phase=history[0].phase;
  return `<div>
    <div class="iter-header">
      <span class="iter-label" id="iterLabel">${history[0].label}</span>
      <div class="iter-nav">
        <button onclick="navIter(-1)">&#8592;</button>
        <span class="iter-count" id="iterCount">1/${history.length}</span>
        <button onclick="navIter(1)">&#8594;</button>
      </div>
    </div>
    ${metodo==='dosfases'?`<div id="phaseBanner" class="phase-banner">Fase 1: minimizar variables artificiales</div>`:''}
    <div id="iterTable">${buildTabla(history[0],vn,nr,null,null,artCols)}</div>
    <div style="font-size:10px;color:#4b5563;margin-top:4px">Elemento pivote resaltado en verde</div>
  </div>`;
}

function navIter(dir){
  if(!solGlobal) return;
  const h=solGlobal.history;
  iterIdx=Math.max(0,Math.min(h.length-1,iterIdx+dir));
  const snap=h[iterIdx];
  document.getElementById('iterLabel').textContent=snap.label;
  document.getElementById('iterCount').textContent=`${iterIdx+1}/${h.length}`;
  document.getElementById('iterTable').innerHTML=buildTabla(snap,solGlobal.vn,solGlobal.nr,snap.pc,snap.pr,solGlobal.artCols);
  const banner=document.getElementById('phaseBanner');
  if(banner) banner.textContent=snap.phase===1?'Fase 1: minimizar variables artificiales':'Fase 2: optimizar función objetivo';
}

function fmt(v){
  if(Math.abs(v)>1e4) return v>0?'M':'-M';
  return parseFloat(v.toFixed(3)).toString();
}

// ── GRÁFICO ───────────────────────────────────────────────────────────────────
function dibujarGrafico(A,b,tipos,xSol,zOpt,cOrig){
  const adjA=[],adjB=[];
  A.forEach((row,i)=>{
    let r=[...row],bi=b[i];
    if(tipos[i]==='ge'){r=row.map(x=>-x);bi=-bi;}
    adjA.push(r);adjB.push(bi);
  });

  const cands=[];
  cands.push({x:0,y:0});
  adjA.forEach((row,i)=>{
    if(Math.abs(row[0])>1e-9) cands.push({x:adjB[i]/row[0],y:0});
    if(Math.abs(row[1])>1e-9) cands.push({x:0,y:adjB[i]/row[1]});
  });
  for(let i=0;i<adjA.length;i++) for(let j=i+1;j<adjA.length;j++){
    const det=adjA[i][0]*adjA[j][1]-adjA[i][1]*adjA[j][0];
    if(Math.abs(det)>1e-9){
      const x=(adjB[i]*adjA[j][1]-adjB[j]*adjA[i][1])/det;
      const y=(adjA[i][0]*adjB[j]-adjA[j][0]*adjB[i])/det;
      if(x>=-1e-6&&y>=-1e-6){
        const ok=adjA.every((r,k)=>r[0]*x+r[1]*y<=adjB[k]+1e-4);
        if(ok) cands.push({x:parseFloat(x.toFixed(4)),y:parseFloat(y.toFixed(4))});
      }
    }
  }
  const factibles=cands.filter(p=>p.x>=-1e-6&&p.y>=-1e-6&&adjA.every((r,k)=>r[0]*p.x+r[1]*p.y<=adjB[k]+1e-4));
  if(!factibles.length){if(chartObj){chartObj.destroy();chartObj=null;}return;}
  const cx=factibles.reduce((s,p)=>s+p.x,0)/factibles.length;
  const cy=factibles.reduce((s,p)=>s+p.y,0)/factibles.length;
  factibles.sort((a,b2)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b2.y-cy,b2.x-cx));
  const poly=[...factibles,factibles[0]];
  const mx=Math.max(...adjB.filter(x=>x>0),...xSol,6)*1.4;
  const clrs=['#60a5fa','#34d399','#fbbf24','#f472b6'];
  const datasets=[{
    label:'Región factible',
    data:poly,
    borderColor:'#7c3aed',backgroundColor:'rgba(124,58,237,0.15)',
    fill:true,tension:0,
    pointRadius:poly.map((_,i)=>i<poly.length-1?6:0),
    pointHoverRadius:poly.map((_,i)=>i<poly.length-1?9:0),
    pointBackgroundColor:'#a78bfa',borderWidth:2,
    zVal:poly.map(p=>cOrig[0]*p.x+cOrig[1]*p.y)
  }];
  A.forEach((row,i)=>{
    const pts=[];
    if(Math.abs(row[1])>1e-9) pts.push({x:0,y:b[i]/row[1]});
    if(Math.abs(row[0])>1e-9) pts.push({x:b[i]/row[0],y:0});
    else pts.push({x:mx,y:(b[i]-row[0]*mx)/row[1]});
    if(pts.length>=2) datasets.push({
      label:`R${i+1}(${tipos[i]==='le'?'≤':tipos[i]==='ge'?'≥':'='})`,
      data:[...pts].sort((a,z)=>a.x-z.x),
      borderColor:clrs[i%clrs.length],borderWidth:1.5,borderDash:[5,4],
      fill:false,pointRadius:0,tension:0
    });
  });
  datasets.push({
    label:`Óptimo (${xSol[0].toFixed(2)},${xSol[1].toFixed(2)}) Z=${zOpt.toFixed(2)}`,
    data:[{x:xSol[0],y:xSol[1]}],
    borderColor:'#f87171',backgroundColor:'#f87171',
    pointRadius:9,pointHoverRadius:12,showLine:false,
    zVal:[zOpt]
  });
  const ctx=document.getElementById('grafico').getContext('2d');
  if(chartObj) chartObj.destroy();
  chartObj=new Chart(ctx,{type:'scatter',data:{datasets},options:{
    responsive:true,animation:{duration:500},
    scales:{
      x:{min:0,max:mx,grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748b',font:{size:10}},title:{display:true,text:'X₁',color:'#94a3b8'}},
      y:{min:0,max:mx,grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748b',font:{size:10}},title:{display:true,text:'X₂',color:'#94a3b8'}}
    },
    plugins:{
      legend:{labels:{color:'#64748b',font:{size:10},boxWidth:10,padding:6}},
      tooltip:{backgroundColor:'#1e2130',titleColor:'#a78bfa',bodyColor:'#cbd5e1',borderColor:'#7c3aed',borderWidth:1,
        callbacks:{
          title:()=>'Vértice',
          label:ctx=>{
            const ds=ctx.dataset;const i=ctx.dataIndex;
            const x=ctx.parsed.x.toFixed(3),y=ctx.parsed.y.toFixed(3);
            if(ds.zVal) return [`(X₁,X₂) = (${x}, ${y})`,`Z = ${ds.zVal[i]!==undefined?ds.zVal[i].toFixed(3):'—'}`];
            return `(${x}, ${y})`;
          }
        }
      }
    }
  }});
}

// ── EXPORTAR ──────────────────────────────────────────────────────────────────
function exportPDF(){
  if(!solGlobal){alert('Primero resuelve.');return;}
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF();
  const {xSol,zOpt,tipoSol,history,nv,nr,vn}=solGlobal;
  doc.setFontSize(16);doc.setFont('helvetica','bold');doc.setTextColor(124,58,237);
  doc.text(`Metodo: ${metodo.toUpperCase()} — ${tipo}`,14,18);
  doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(100,116,139);
  doc.text(`Variables: ${nv} | Restricciones: ${nr} | Tipo: ${tipoSol}`,14,26);
  doc.setFontSize(12);doc.setFont('helvetica','bold');doc.setTextColor(30,30,30);
  doc.text('Solucion optima',14,38);
  doc.setFont('helvetica','normal');doc.setFontSize(11);
  xSol.forEach((v,i)=>doc.text(`X${i+1} = ${v.toFixed(4)}`,14,46+i*7));
  doc.text(`Z* = ${zOpt.toFixed(4)}`,14,46+nv*7);
  let y=62+nv*7;
  history.forEach((snap,idx)=>{
    if(y>260){doc.addPage();y=20;}
    doc.setFontSize(10);doc.setFont('helvetica','bold');doc.setTextColor(124,58,237);
    doc.text(snap.label,14,y);y+=6;
    doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(30,30,30);
    const cw=Math.min(20,(doc.internal.pageSize.width-28)/(vn.length+2));
    ['Base',...vn,'RHS'].forEach((h,j)=>{doc.setFillColor(45,31,99);doc.setTextColor(167,139,250);doc.rect(14+j*cw,y-4,cw,5,'F');doc.text(h.substring(0,4),14+j*cw+1,y);});
    y+=6;doc.setTextColor(30,30,30);
    const rows=[['Z',...vn.map((_,j)=>snap.T[0][j+1].toFixed(2)),snap.T[0][0].toFixed(2)]];
    for(let i=1;i<=nr;i++) rows.push([vn[snap.base[i-1]-1]||'?',...vn.map((_,j)=>snap.T[i][j+1].toFixed(2)),snap.T[i][0].toFixed(2)]);
    rows.forEach(row=>{row.forEach((cell,j)=>doc.text(String(cell).substring(0,6),14+j*cw+1,y));y+=5;});
    y+=3;
  });
  doc.save(`simplex_${metodo}.pdf`);
}

function exportCSV(){
  if(!solGlobal){alert('Primero resuelve.');return;}
  const {xSol,zOpt,tipoSol,history,nv,nr,vn}=solGlobal;
  let csv=`METODO,${metodo.toUpperCase()}\nTIPO,${tipo}\nVariables,${nv}\nRestricciones,${nr}\nSolucion,${tipoSol}\n\n`;
  xSol.forEach((v,i)=>{csv+=`X${i+1},${v.toFixed(4)}\n`;});
  csv+=`Z*,${zOpt.toFixed(4)}\n\n`;
  history.forEach(snap=>{
    csv+=`${snap.label}\nBase,${vn.join(',')},RHS\n`;
    csv+=`Z,${vn.map((_,j)=>snap.T[0][j+1].toFixed(4)).join(',')},${snap.T[0][0].toFixed(4)}\n`;
    for(let i=1;i<=nr;i++) csv+=`${vn[snap.base[i-1]-1]||'?'},${vn.map((_,j)=>snap.T[i][j+1].toFixed(4)).join(',')},${snap.T[i][0].toFixed(4)}\n`;
    csv+='\n';
  });
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=`simplex_${metodo}.csv`;a.click();
}

buildInputs();resolver();