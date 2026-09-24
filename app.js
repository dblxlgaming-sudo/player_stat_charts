const V2_CSV_URL = './data/player-stat-v2.csv';
const LEGACY_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTUgynZkMlV0EmiCfbuxUoIw6C9_dHoYByxdKwWFnBoUeHUnompM-_FJ4sD_fBfVlX3PcsjhAIQVno4/pub?gid=512698170&single=true&output=csv';
const USE_LEGACY = new URLSearchParams(window.location.search).get('source') === 'legacy';

let DATA = {};
let NAME_DISPLAY = {};

function nullableNumber(value){
  const text = String(value ?? '').trim();
  if(!text || ['-', '--', 'N/A', 'NA', 'NULL'].includes(text.toUpperCase())) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseCSV(text){
  const rows = [];
  let row = [], field = '', quoted = false;
  for(let i=0;i<text.length;i++){
    const char = text[i];
    if(char === '"'){
      if(quoted && text[i+1] === '"'){ field += '"'; i++; }
      else quoted = !quoted;
    } else if(char === ',' && !quoted){ row.push(field); field = ''; }
    else if((char === '\n' || char === '\r') && !quoted){
      if(char === '\r' && text[i+1] === '\n') i++;
      row.push(field); field = '';
      if(row.some(cell=>cell.length)) rows.push(row);
      row = [];
    } else field += char;
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.map(values => Object.fromEntries(headers.map((header,index)=>[header.trim(), values[index] ?? ''])));
}

function parseMatchDate(value){
  const text = String(value ?? '').trim();
  if(/^\d+(?:\.\d+)?$/.test(text)){
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Number(text) * 86400000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function displayDate(date, raw){
  if(!date) return raw || '';
  return date.toLocaleDateString('en-US', {month:'short', day:'numeric', timeZone:'UTC'});
}

function v2Observation(row){
  const parsedDate = parseMatchDate(row.MatchDate);
  return {
    matchId: row.MatchID || '', dateRaw: row.MatchDate || '', dateValue: parsedDate,
    date: displayDate(parsedDate, row.MatchDate), opp: (row.Opponent || '').trim(),
    tournament: (row.Tournament || '').trim(), round: (row.Round || '').trim(),
    surface: (row.Surface || '').trim(), result: (row.Result || '').trim(),
    matchStatus: (row.MatchStatus || '').trim(), finalScore: (row.FinalScore || '').trim(),
    tg: nullableNumber(row.TotalGames), gw: nullableNumber(row.GamesWon),
    aces: nullableNumber(row.Aces), bp: nullableNumber(row.BPWon), df: nullableNumber(row.DoubleFaults),
    psw: nullableNumber(row.PlayerSetsWon), ts: nullableNumber(row.TotalSets),
    fstg: nullableNumber(row.FirstSetTotalGames), pfsg: nullableNumber(row.PlayerFirstSetGamesWon)
  };
}

function legacyObservation(row){
  const values = Object.values(row);
  const [player, date, opp, surface, tg, gw, aces, bp, df] = values;
  const parsedDate = parseMatchDate(date);
  return {player, dateRaw:date || '', dateValue:parsedDate, date:displayDate(parsedDate,date), opp:(opp||'').trim(),
    surface:(surface||'').trim(), tournament:'', round:'', result:'', matchStatus:'Completed', finalScore:'',
    tg:nullableNumber(tg), gw:nullableNumber(gw), aces:nullableNumber(aces), bp:nullableNumber(bp),
    df:nullableNumber(df), psw:null, ts:null, fstg:null, pfsg:null};
}

function ingestRows(rows, legacy=false){
  DATA = {}; NAME_DISPLAY = {};
  rows.forEach(row=>{
    const player = legacy ? Object.values(row)[0] : row.Player;
    if(!player) return;
    const display = player.trim();
    const key = display.toLowerCase();
    if(!NAME_DISPLAY[key]) NAME_DISPLAY[key] = display;
    if(!DATA[key]) DATA[key] = [];
    DATA[key].push(legacy ? legacyObservation(row) : v2Observation(row));
  });
  Object.values(DATA).forEach(matches=>matches.sort((a,b)=>{
    const aTime = a.dateValue ? a.dateValue.getTime() : -Infinity;
    const bTime = b.dateValue ? b.dateValue.getTime() : -Infinity;
    return bTime - aTime || String(b.matchId||'').localeCompare(String(a.matchId||''));
  }));
}

async function loadData(){
  try{
    const response = await fetch(USE_LEGACY ? LEGACY_CSV_URL : V2_CSV_URL, {cache:'no-store'});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    ingestRows(parseCSV(await response.text()), USE_LEGACY);
  } catch(error){
    document.getElementById('directory').innerHTML =
      '<div class="emptystate">Could not load player statistics. Please try again later.</div>';
    return;
  }
  renderDirectory('');
}

const STATS = [
  {key:'tg', label:'Total Games', defaultLine:21.5},
  {key:'gw', label:'Games Won', defaultLine:11.5},
  {key:'aces', label:'Aces', defaultLine:3.5},
  {key:'bp', label:'Break Points Won', defaultLine:3.5},
  {key:'df', label:'Double Faults', defaultLine:2.5},
  {key:'psw', label:'Player Sets Won', defaultLine:0.5, presets:[0.5,1.5]},
  {key:'ts', label:'Total Sets', defaultLine:2.5, presets:[2.5]},
  {key:'fstg', label:'1st Set Total Games', defaultLine:9.5},
  {key:'pfsg', label:'Player 1st Set Games Won', defaultLine:4.5}
];
const WINDOWS = [5,10,15];
const SURFACES = ['All','Hard','Clay','Grass'];
let currentWindow=10, currentPlayer=null, currentStat='tg', currentSurface='All';

function renderDirectory(filter){
  const wrap=document.getElementById('directory');
  const names=Object.keys(DATA).sort((a,b)=>NAME_DISPLAY[a].localeCompare(NAME_DISPLAY[b]));
  const matched=filter?names.filter(n=>NAME_DISPLAY[n].toLowerCase().includes(filter.toLowerCase())):names;
  if(!filter){
    wrap.innerHTML='<div class="emptystate">Search a player above, or pick one from the full list below.</div>'+matched.map(rowHtml).join('');
  } else if(!matched.length){
    wrap.innerHTML='<div class="emptystate">No players match "'+escapeHtml(filter)+'"</div>';
  } else wrap.innerHTML=matched.map(rowHtml).join('');
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function rowHtml(key){
  const matches=DATA[key], latest=matches[0], display=NAME_DISPLAY[key];
  const last=latest?'Last: '+escapeHtml(latest.date)+(latest.opp?' vs '+escapeHtml(latest.opp):''):'';
  return `<div class="playerrow" data-player="${escapeHtml(key)}"><div><div class="name">${escapeHtml(display)}</div><div class="meta">${matches.length} matches on file</div></div><div class="meta">${last}</div></div>`;
}

function bindDirectoryClicks(){
  document.querySelectorAll('.playerrow').forEach(row=>row.onclick=()=>openPlayer(row.dataset.player));
}

const originalRenderDirectory=renderDirectory;
renderDirectory=function(filter){ originalRenderDirectory(filter); bindDirectoryClicks(); };

function filterDirectory(){ renderDirectory(document.getElementById('search').value.trim()); }
function openPlayer(name){
  currentPlayer=name; currentWindow=10; currentSurface='All';
  document.getElementById('directory').style.display='none';
  document.getElementById('searchWrap').style.display='none';
  document.getElementById('backBtn').classList.add('show');
  document.getElementById('detail').style.display='block';
  document.getElementById('playerName').textContent=NAME_DISPLAY[name];
  document.getElementById('playerSub').textContent=DATA[name].length+' matches on file, explicitly date-sorted';
  document.getElementById('statTabs').innerHTML=STATS.map(s=>`<div class="stattab ${s.key===currentStat?'active':''}" data-stat="${s.key}">${s.label}</div>`).join('');
  document.querySelectorAll('#statTabs .stattab').forEach(tab=>tab.onclick=()=>switchStat(tab.dataset.stat));
  document.getElementById('lineInput').value=STATS.find(s=>s.key===currentStat).defaultLine;
  renderChart();
}
function showDirectory(){
  document.getElementById('directory').style.display='flex'; document.getElementById('searchWrap').style.display='block';
  document.getElementById('backBtn').classList.remove('show'); document.getElementById('detail').style.display='none';
  document.getElementById('search').value=''; renderDirectory('');
}
function switchStat(key){
  currentStat=key; const stat=STATS.find(s=>s.key===key);
  document.getElementById('lineInput').value=stat.defaultLine; renderChart();
}
function switchWindow(value){ currentWindow=value; renderChart(); }
function switchSurface(value){ currentSurface=value; renderChart(); }
function setLine(value){ document.getElementById('lineInput').value=value; renderChart(); }

function usable(matches,key){ return matches.filter(match=>Number.isFinite(match[key])); }
function gradeActual(actual,line){ return actual>line?'hit':actual<line?'miss':'push'; }
function hitRate(matches,key,line){
  const observations=usable(matches,key);
  const grades=observations.map(match=>gradeActual(match[key],line));
  const hits=grades.filter(g=>g==='hit').length, pushes=grades.filter(g=>g==='push').length;
  const decisions=observations.length-pushes;
  const average=observations.length?observations.reduce((sum,match)=>sum+match[key],0)/observations.length:null;
  return {hr:decisions?Math.round(hits/decisions*100):null, avg:average===null?null:average.toFixed(1),
    usable:observations.length, decisions, hits, pushes};
}

function selectedObservations(matches,key,surface,windowSize){
  const filtered=surface==='All'?matches:matches.filter(match=>match.surface.toLowerCase()===surface.toLowerCase());
  return usable(filtered,key).slice(0,windowSize);
}

function badge(label,result){
  const rate=result.hr===null?'—':result.hr+'%';
  const detail=result.usable?`${result.hits}/${result.decisions} · n=${result.usable}${result.pushes?' · '+result.pushes+' push':''}`:'unavailable';
  return `<div class="badge"><div class="label">${label}</div><div class="hr">${rate}</div><div class="avg">${detail}</div></div>`;
}

function renderChart(){
  const stat=STATS.find(s=>s.key===currentStat);
  document.getElementById('statTabs').querySelectorAll('.stattab').forEach(tab=>tab.classList.toggle('active',tab.dataset.stat===currentStat));
  document.getElementById('windowTabs').innerHTML=WINDOWS.map(w=>`<div class="stattab ${w===currentWindow?'active':''}" data-window="${w}">Last ${w}</div>`).join('');
  document.querySelectorAll('#windowTabs .stattab').forEach(tab=>tab.onclick=()=>switchWindow(Number(tab.dataset.window)));
  document.getElementById('surfaceTabs').innerHTML=SURFACES.map(s=>`<div class="surfacetab ${s===currentSurface?'active':''}" data-surface="${s}">${s}</div>`).join('');
  document.querySelectorAll('#surfaceTabs .surfacetab').forEach(tab=>tab.onclick=()=>switchSurface(tab.dataset.surface));
  document.getElementById('linePresets').innerHTML=(stat.presets||[]).map(line=>`<button class="linepreset ${Number(document.getElementById('lineInput').value)===line?'active':''}" data-line="${line}">${line}</button>`).join('');
  document.querySelectorAll('.linepreset').forEach(button=>button.onclick=()=>setLine(Number(button.dataset.line)));

  const bySurface=currentSurface==='All'?DATA[currentPlayer]:DATA[currentPlayer].filter(m=>m.surface.toLowerCase()===currentSurface.toLowerCase());
  const available=usable(bySurface,currentStat); // sorted newest to oldest before selecting L5/L10/L15
  document.getElementById('surfaceSummary').textContent=`${available.length} usable ${stat.label.toLowerCase()} observations for ${currentSurface==='All'?'all surfaces':currentSurface}`;
  const line=Number(document.getElementById('lineInput').value);
  document.getElementById('lineHint').textContent='Over '+line+' '+stat.label.toLowerCase();
  document.getElementById('badges').innerHTML=badge('L5',hitRate(available.slice(0,5),currentStat,line))+badge('L10',hitRate(available.slice(0,10),currentStat,line))+badge('L15',hitRate(available.slice(0,15),currentStat,line));

  const recentMatches=selectedObservations(DATA[currentPlayer],currentStat,currentSurface,currentWindow);
  renderRecentMatches(recentMatches,stat,line);
  const matches=recentMatches.slice().reverse();
  const chart=document.getElementById('chart1'), labels=document.getElementById('xlabels1');
  chart.innerHTML=''; labels.innerHTML='';
  if(!matches.length){
    chart.innerHTML='<div class="emptystate" style="width:100%;padding:65px 10px;">No usable '+escapeHtml(stat.label)+' observations for this surface.</div>';
    return;
  }
  const maxValue=Math.max(...matches.map(m=>m[currentStat]),line,1);
  matches.forEach(match=>{
    const value=match[currentStat], grade=gradeActual(value,line), bar=document.createElement('div');
    bar.className='bar1 '+(grade==='hit'?'green':'red');
    if(grade==='push') bar.style.background='var(--muted)';
    bar.style.height=Math.max(value/maxValue*100,3)+'%'; bar.textContent=value;
    bar.onmouseenter=event=>showTooltip(event,match); bar.onmouseleave=hideTooltip; bar.onclick=event=>showTooltip(event,match); chart.appendChild(bar);
  });
  if(line<=maxValue){ const marker=document.createElement('div'); marker.className='avgline'; marker.style.bottom=(line/maxValue*100)+'%'; chart.appendChild(marker); }
  labels.innerHTML=matches.map(m=>`<div>${escapeHtml(m.date)}</div>`).join('');
}

function fullDisplayDate(match){
  if(!match.dateValue) return match.dateRaw || match.date || '—';
  return match.dateValue.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
}
function renderRecentMatches(matches,stat,line){
  const wrap=document.getElementById('recentMatches');
  document.getElementById('recentContext').textContent=`${stat.label} · ${currentSurface} · Over ${line} · L${currentWindow}`;
  if(!matches.length){
    wrap.innerHTML=`<div class="emptystate">No usable ${escapeHtml(stat.label)} observations for this surface.</div>`;
    return;
  }
  const rows=matches.map(match=>{
    const actual=match[currentStat], grade=gradeActual(actual,line);
    const result=matchResultText(match) || '—';
    const resultClass=match.result==='W'?'result-win':match.result==='L'?'result-loss':'';
    const comparison=grade==='hit'?'Over hit':grade==='miss'?'Under':'Push';
    return `<tr><td>${escapeHtml(fullDisplayDate(match))}</td><td>${escapeHtml(match.tournament||'—')}</td><td>${escapeHtml(match.surface||'—')}</td><td>${escapeHtml(match.opp||'—')}</td><td class="${resultClass}">${escapeHtml(result)}</td><td><strong>${escapeHtml(actual)}</strong></td><td><span class="grade-pill grade-${grade}">${comparison}</span></td></tr>`;
  }).join('');
  wrap.innerHTML=`<table class="recent-table"><thead><tr><th>Date</th><th>Tournament</th><th>Surface</th><th>Opponent</th><th>Result</th><th>${escapeHtml(stat.label)}</th><th>vs ${escapeHtml(line)}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function matchResultText(match){
  if(match.result && match.psw!==null && match.ts!==null) return `${match.result==='W'?'Won':'Lost'} ${match.psw}–${match.ts-match.psw}`;
  return match.result==='W'?'Won':match.result==='L'?'Lost':'';
}
function showTooltip(event,match){
  const tip=document.getElementById('tooltip'), lines=[];
  lines.push(`<div class="t1">${escapeHtml(match.date)}${match.opp?' · vs '+escapeHtml(match.opp):''}</div>`);
  const context=[match.tournament,match.surface].filter(Boolean).map(escapeHtml).join(' · '); if(context) lines.push(`<div class="t2">${context}</div>`);
  const result=matchResultText(match); if(result) lines.push(`<div class="t2">${escapeHtml(result)}</div>`);
  const stats=[]; if(match.aces!==null) stats.push(match.aces+' Aces'); if(match.df!==null) stats.push(match.df+' DF'); if(match.bp!==null) stats.push(match.bp+' BP Won');
  if(stats.length) lines.push(`<div class="t2">${stats.join(' · ')}</div>`);
  tip.innerHTML=lines.join(''); tip.style.display='block';
  const rect=event.target.getBoundingClientRect(), wrap=event.target.closest('.chartwrap').getBoundingClientRect();
  tip.style.left=Math.max(0,Math.min(rect.left-wrap.left-20,wrap.width-170))+'px'; tip.style.top=Math.max(0,rect.top-wrap.top-90)+'px';
}
function hideTooltip(){ document.getElementById('tooltip').style.display='none'; }

if(typeof module!=='undefined') module.exports={nullableNumber,parseCSV,parseMatchDate,v2Observation,ingestRows,usable,gradeActual,hitRate,selectedObservations};
if(typeof document!=='undefined') loadData();
