const $ = (q) => document.querySelector(q);
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(`meteomix:${key}`)) ?? fallback; } catch { return fallback; } },
  set(key, value) { localStorage.setItem(`meteomix:${key}`, JSON.stringify(value)); }
};
const state = {
  place: store.get('place', {name:'Tolentino', admin1:'Marche', country:'Italia', latitude:43.2, longitude:13.2833, timezone:'Europe/Rome'}),
  mode: store.get('mode','mix'), models: store.get('models',['ecmwf','icon','meteofrance','italiameteo']), data:{}, errors:{}, days:5, searchTimer:null
};
const providerNames={bestmatch:'Best Match',ecmwf:'ECMWF IFS',icon:'DWD ICON',meteofrance:'Météo-France',italiameteo:'ItaliaMeteo ARPAE'};
const modelIds={bestmatch:'best_match',ecmwf:'ecmwf_ifs',icon:'icon_seamless',meteofrance:'meteofrance_seamless',italiameteo:'italia_meteo_arpae_icon_2i'};
const mixModelIds=['ecmwf','icon','meteofrance','italiameteo'];
const ensembleModels=[{id:'ensemble_ecmwf',label:'ECMWF IFS ENS · 9 km Europe',model:'ecmwf_ifs_europe_ensemble'},{id:'ensemble_icon',label:'DWD ICON EPS',model:'dwd_icon_global_eps'},{id:'ensemble_gfs',label:'NOAA GEFS',model:'ncep_gefs025'}];
if(state.mode!=='mix'&&!providerNames[state.mode]){state.mode='mix';store.set('mode','mix');}
state.models=state.models.filter(id=>mixModelIds.includes(id));if(!state.models.length)state.models=[...mixModelIds];
const iconMap={sun:'☀️',part:'⛅',cloud:'☁️',fog:'🌫️',drizzle:'🌦️',rain:'🌧️',snow:'🌨️',storm:'⛈️'};
const descMap={0:['Sereno','sun'],1:['Prevalentemente sereno','sun'],2:['Parzialmente nuvoloso','part'],3:['Coperto','cloud'],45:['Nebbia','fog'],48:['Nebbia con brina','fog'],51:['Pioviggine debole','drizzle'],53:['Pioviggine','drizzle'],55:['Pioviggine intensa','rain'],56:['Pioggia gelata debole','drizzle'],57:['Pioggia gelata','rain'],61:['Pioggia debole','rain'],63:['Pioggia','rain'],65:['Pioggia intensa','rain'],66:['Pioggia gelata debole','rain'],67:['Pioggia gelata','rain'],71:['Neve debole','snow'],73:['Neve','snow'],75:['Neve intensa','snow'],77:['Granelli di neve','snow'],80:['Rovesci deboli','rain'],81:['Rovesci','rain'],82:['Rovesci intensi','rain'],85:['Rovesci di neve','snow'],86:['Nevicate intense','snow'],95:['Temporale','storm'],96:['Temporale con grandine','storm'],99:['Temporale forte','storm']};
function meteoDescription(code){const found=descMap[Number(code)];return found?{text:found[0],icon:iconMap[found[1]]}:{text:'Variabile',icon:'⛅'};}
function setNotice(text=''){const n=$('#notice');n.textContent=text;n.hidden=!text;}
function fnum(n,d=0){if(n===null||n===undefined||n==='')return null;return Number.isFinite(Number(n))?Number(Number(n).toFixed(d)):null;}
function mean(arr){const vals=arr.filter(v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))).map(Number);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;}
function median(arr){const vals=arr.filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))).map(Number).sort((a,b)=>a-b);if(!vals.length)return null;const m=Math.floor(vals.length/2);return vals.length%2?vals[m]:(vals[m-1]+vals[m])/2;}
function percentile(arr,p){const vals=arr.filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))).map(Number).sort((a,b)=>a-b);if(!vals.length)return null;return vals[Math.round((vals.length-1)*p)];}
function modeOf(arr){const vals=arr.filter(Number.isFinite);if(!vals.length)return null;const counts=new Map();for(const v of vals)counts.set(v,(counts.get(v)||0)+1);return [...counts].sort((a,b)=>b[1]-a[1])[0][0];}
function weatherSeverity(code){if(code>=95)return 6;if([71,73,75,77,85,86].includes(code))return 5;if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return 4;if(code===45||code===48)return 3;if(code===3)return 2;if(code===2)return 1;if(code===1)return 0;return -1;}
function weatherMode(arr){const vals=arr.filter(Number.isFinite);if(!vals.length)return null;const counts=new Map();for(const v of vals)counts.set(v,(counts.get(v)||0)+1);const highest=Math.max(...counts.values());return [...counts].filter(([,n])=>n===highest).map(([code])=>code).sort((a,b)=>weatherSeverity(b)-weatherSeverity(a))[0];}
function fmt(n,suffix='',d=0){return Number.isFinite(n)?`${Math.round(n*10**d)/10**d}${suffix}`:'—';}
function weatherCodeFromText(text=''){const t=text.toLowerCase();if(/temporale|thunder/.test(t))return 95;if(/neve|snow|sleet|ice/.test(t))return 71;if(/piogg|rain|shower/.test(t))return 61;if(/piovig|drizzle/.test(t))return 51;if(/nebb|fog|mist/.test(t))return 45;if(/coperto|overcast/.test(t))return 3;if(/nuvol|cloud/.test(t))return /parzial|partly|interval/.test(t)?2:3;return 1;}
async function getJson(url){const response=await fetch(url);let json;try{json=await response.json();}catch{throw new Error('Risposta non valida');}if(!response.ok||json.error)throw new Error(json.message||json.error?.message||`Errore ${response.status}`);return json;}
async function fetchOpenMeteo(place,source='bestmatch'){
 const url=new URL('https://api.open-meteo.com/v1/forecast');
 const p={latitude:place.latitude,longitude:place.longitude,current:'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,pressure_msl',hourly:'temperature_2m,precipitation_probability,precipitation,weather_code',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',forecast_days:7,timezone:place.timezone||'auto',models:modelIds[source]||'best_match'};
 for(const [k,v] of Object.entries(p))url.searchParams.set(k,v);
 const j=await getJson(url);
 const c=j.current, h=j.hourly, d=j.daily;
 const nearest=Math.max(0,h.time.findIndex(t=>t>=c.time));
 return {provider:source,stamp:c.time,current:{temp:fnum(c.temperature_2m),feels:fnum(c.apparent_temperature),humidity:fnum(c.relative_humidity_2m),wind:fnum(c.wind_speed_10m),rain:fnum(h.precipitation_probability?.[nearest]),rainMm:fnum(c.precipitation,1),pressure:fnum(c.pressure_msl),code:fnum(c.weather_code),desc:meteoDescription(c.weather_code).text,icon:meteoDescription(c.weather_code).icon},hourly:h.time.map((t,i)=>({time:t,temp:fnum(h.temperature_2m[i]),rain:fnum(h.precipitation_probability?.[i]),rainMm:fnum(h.precipitation?.[i],1),code:fnum(h.weather_code[i])})).filter(x=>Number.isFinite(x.temp)),daily:d.time.map((t,i)=>({date:t,min:fnum(d.temperature_2m_min[i]),max:fnum(d.temperature_2m_max[i]),rain:fnum(d.precipitation_probability_max?.[i]),rainMm:fnum(d.precipitation_sum?.[i],1),code:fnum(d.weather_code[i])})).filter(x=>Number.isFinite(x.min)||Number.isFinite(x.max))};
}
async function fetchEnsemble(place,config){
 const url=new URL('https://ensemble-api.open-meteo.com/v1/ensemble');
 const p={latitude:place.latitude,longitude:place.longitude,hourly:'temperature_2m,precipitation,weather_code,wind_speed_10m',models:config.model,forecast_days:7,timezone:place.timezone||'auto'};
 for(const [k,v] of Object.entries(p))url.searchParams.set(k,v);
 const j=await getJson(url),h=j.hourly;
 const members=(key)=>Object.entries(h).filter(([name])=>name===key||name.startsWith(`${key}_member`)).map(([,values])=>values);
 const temps=members('temperature_2m'),precips=members('precipitation'),winds=members('wind_speed_10m'),codes=members('weather_code');
 if(!temps.length)throw new Error('Nessun membro ensemble disponibile');
 const hourly=h.time.map((time,i)=>{
  const ts=temps.map(x=>fnum(x[i])).filter(Number.isFinite),ps=precips.map(x=>fnum(x[i])).filter(Number.isFinite),ws=winds.map(x=>fnum(x[i])).filter(Number.isFinite),cs=codes.map(x=>fnum(x[i])).filter(Number.isFinite);
  return {time,temp:mean(ts),tempLow:percentile(ts,.1),tempHigh:percentile(ts,.9),rain:ps.length?100*ps.filter(v=>v>.1).length/ps.length:null,rainMm:mean(ps),wind:mean(ws),code:modeOf(cs)};
 }).filter(x=>Number.isFinite(x.temp));
 const dayIndexes={};h.time.forEach((time,i)=>{const day=String(time).slice(0,10);(dayIndexes[day]??=[]).push(i);});
 const daily=Object.entries(dayIndexes).map(([date,indexes])=>{
  const memberStats=temps.map((series,member)=>{
   const t=indexes.map(i=>fnum(series[i])).filter(Number.isFinite),p=(precips[member]||[]);const rain=indexes.map(i=>fnum(p[i])).filter(Number.isFinite);
   const dailyCode=weatherMode(indexes.map(i=>fnum(codes[member]?.[i])).filter(Number.isFinite));
   return {min:t.length?Math.min(...t):null,max:t.length?Math.max(...t):null,rain:rain.reduce((a,b)=>a+b,0),code:dailyCode};
  });
  const mins=memberStats.map(x=>x.min).filter(Number.isFinite),maxs=memberStats.map(x=>x.max).filter(Number.isFinite),rainTotals=memberStats.map(x=>x.rain);
  return {date,min:mean(mins),minLow:percentile(mins,.1),minHigh:percentile(mins,.9),max:mean(maxs),maxLow:percentile(maxs,.1),maxHigh:percentile(maxs,.9),rain:rainTotals.length?100*rainTotals.filter(v=>v>.1).length/rainTotals.length:null,rainMm:mean(rainTotals),code:weatherMode(memberStats.map(x=>x.code))};
 });
 return {provider:config.id,label:config.label,stamp:h.time[0],current:{},hourly,daily};
}
function blendForecast(sources,ensembles=[]){
 const current={};for(const k of ['temp','feels','humidity','wind','rain','rainMm','pressure'])current[k]=median(sources.map(x=>x.current[k]));
 current.code=modeOf(sources.map(x=>x.current.code))??1;
 const now=Date.now(),cutoff=now+72*60*60*1000,longSources=ensembles.length?ensembles:sources;
 const timeKeys=[...new Set([...sources,...longSources].flatMap(s=>s.hourly.map(x=>x.time)))].sort();
 const hourly=timeKeys.map(time=>{
  const future=new Date(time).getTime()>cutoff,available=future?longSources:sources;
  const records=available.map(s=>s.hourly.find(x=>x.time===time)).filter(Boolean);
  const vals=records.map(x=>x.temp).filter(Number.isFinite);
  return {time,temp:median(vals),tempLow:percentile(records.map(x=>x.tempLow??x.temp),.1),tempHigh:percentile(records.map(x=>x.tempHigh??x.temp),.9),rain:median(records.map(x=>x.rain)),rainMm:median(records.map(x=>x.rainMm)),code:modeOf(records.map(x=>x.code))};
 }).filter(x=>Number.isFinite(x.temp));
 const today=localYmd();
 const dates=[...new Set([...sources,...longSources].flatMap(s=>s.daily.map(x=>x.date)))].sort();
 const daily=dates.map(date=>{
  const dayStart=new Date(`${date}T12:00:00`).getTime(),useLong=dayStart>cutoff,available=useLong?longSources:sources;
  const records=available.map(s=>s.daily.find(x=>x.date===date)).filter(Boolean);
  const mins=records.map(x=>x.min).filter(Number.isFinite),maxs=records.map(x=>x.max).filter(Number.isFinite);
  const minLow=percentile(records.map(x=>x.minLow??x.min),.1),minHigh=percentile(records.map(x=>x.minHigh??x.min),.9),maxLow=percentile(records.map(x=>x.maxLow??x.max),.1),maxHigh=percentile(records.map(x=>x.maxHigh??x.max),.9);
  const rain=median(records.map(x=>x.rain));
  const skySources=useLong&&sources.length?sources:available;
  let code=weatherMode(skySources.map(s=>s.daily.find(x=>x.date===date)?.code));
  if(!Number.isFinite(code))code=weatherMode(records.map(x=>x.code));
  if(Number.isFinite(rain)&&Number.isFinite(code)&&code<=3){if(rain>=50)code=80;else if(rain>=35)code=3;}
  return {date,min:median(mins),max:median(maxs),minLow,minHigh,maxLow,maxHigh,spread:Number.isFinite(maxLow)&&Number.isFinite(maxHigh)?(maxHigh-maxLow)/2:null,rain,rainMm:median(records.map(x=>x.rainMm)),code,ensemble:useLong&&ensembles.length>0};
 }).filter(x=>Number.isFinite(x.min)||Number.isFinite(x.max));
 const desc=meteoDescription(Math.round(current.code));return {provider:'mix',stamp:new Date().toISOString(),current:{...current,desc:desc.text,icon:desc.icon},hourly,daily};
}
async function loadWeather(){
 const button=$('#refresh');button.classList.add('loading');button.disabled=true;setNotice('');state.data={};state.errors={};
 const selected=state.mode==='mix'?state.models:[state.mode];
 const requests=selected.map(id=>[id,()=>fetchOpenMeteo(state.place,id)]);
 await Promise.all(requests.map(async([id,fn])=>{try{state.data[id]=await fn();}catch(e){state.errors[id]=e.message||'Servizio non raggiungibile';}}));
 if(state.mode==='mix')await Promise.all(ensembleModels.map(async config=>{try{state.data[config.id]=await fetchEnsemble(state.place,config);}catch(e){state.errors[config.id]=e.message||'Servizio non raggiungibile';}}));
 const active=state.mode==='mix'?selected.filter(k=>state.data[k]):[state.mode].filter(k=>state.data[k]);
 if(state.mode!=='mix'&&!state.data[state.mode])setNotice(`${providerNames[state.mode]} non è disponibile per questa località o in questo momento. Mostro Best Match.`);
 if(state.mode==='mix'&&!active.length)setNotice('Nessun modello selezionato è disponibile. Provo Best Match come ripiego.');
 const sources=active.map(k=>state.data[k]);
 if(!sources.length){try{state.data.bestmatch=await fetchOpenMeteo(state.place,'bestmatch');state.errors.bestmatch='';sources.push(state.data.bestmatch);}catch(e){state.errors.bestmatch=e.message||'Servizio non raggiungibile';}}
 const ensembles=state.mode==='mix'?ensembleModels.map(x=>state.data[x.id]).filter(Boolean):[];
 if(state.mode==='mix'&&!ensembles.length)setNotice('Ensemble non disponibili: uso i modelli deterministici anche per i giorni successivi.');
 const view=state.mode==='mix'?blendForecast(sources,ensembles):sources[0];
 if(!Object.keys(state.data).length){setNotice('Non è stato possibile caricare i dati meteo. Controlla la connessione e riprova.');}
 render(view,sources);renderSources();
 button.classList.remove('loading');button.disabled=false;
}
function localDate(date){return new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long'}).format(date);}
function localYmd(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function dateLabel(iso){const date=new Date(`${iso}T12:00:00`);return date.toLocaleDateString('it-IT',{weekday:'short'}).replace('.','');}
function render(view,sources){
 if(!view)return;
 const c=view.current||{},place=state.place;
 $('#hero-city').textContent=place.name;$('#location-label').textContent=place.admin1||place.country||'Italia';
 $('#hero-date').textContent=`OGGI · ${localDate(new Date()).toLocaleUpperCase('it-IT')}`;
 $('#hero-condition').textContent=c.desc||'Previsioni disponibili';$('#hero-icon').textContent=c.icon||meteoDescription(c.code).icon;
 $('#hero-temp').textContent=fmt(c.temp,'°');$('#hero-feels').textContent=fmt(c.feels,'°');
 const today=view.daily?.find(x=>x.date===localYmd())||view.daily?.[0];
 $('#hero-range').innerHTML=`Massima ${fmt(today?.max,'°')} <i></i> Minima ${fmt(today?.min,'°')}`;
 $('#hero-updated').textContent=state.mode==='mix'?`${sources.length} modelli a breve termine`:`Modello: ${providerNames[view.provider]||'—'}`;
 $('#metric-humidity').textContent=fmt(c.humidity,'%');$('#metric-wind').innerHTML=`${fmt(c.wind)} <small>km/h</small>`;$('#metric-rain').textContent=fmt(c.rain,'%');$('#metric-pressure').innerHTML=`${fmt(c.pressure)} <small>hPa</small>`;
 renderChart(view.hourly||[]);renderWeek(view.daily||[]);
 $('#chart-note').textContent=state.mode==='mix'?`Prime 72 ore: mediana di ${sources.length} modelli. Giorni 4–7: ensemble ECMWF, DWD e NOAA; la dispersione indica l’incertezza.`:`Previsione oraria: ${providerNames[view.provider]||'Best Match'}.`;
 $('#sources-heading').textContent=state.mode==='mix'?'Le fonti del Mix':'Stato delle fonti';
}
function renderChart(items){
 const now=new Date();let xs=items.filter(x=>Number.isFinite(x.temp)&&new Date(x.time)>=new Date(now.getTime()-30*60*1000)).slice(0,8);if(xs.length<2)xs=items.filter(x=>Number.isFinite(x.temp)).slice(0,8);
 const vals=xs.map(x=>x.temp).filter(Number.isFinite);if(!vals.length)return;
 const min=Math.min(...vals)-2,max=Math.max(...vals)+2,span=Math.max(2,max-min),coords=xs.map((x,i)=>({x:12+i*(696/(Math.max(1,xs.length-1))),y:12+(max-x.temp)/span*112,temp:x.temp,time:x.time}));
 $('#y-top').textContent=`${Math.round(max)}°`;$('#y-mid').textContent=`${Math.round((max+min)/2)}°`;$('#y-bottom').textContent=`${Math.round(min)}°`;
 const line=coords.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');$('#chart-line').setAttribute('d',line);$('#chart-area-fill').setAttribute('d',`${line} L${coords.at(-1).x},145 L${coords[0].x},145 Z`);
 $('#chart-points').innerHTML=coords.map((p,i)=>i%2===0?`<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="4.2"><title>${fmt(p.temp,'°')}</title></circle>`:'').join('');
 $('#chart-times').innerHTML=coords.map((p,i)=>i%2===0?`<span>${new Date(p.time).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</span>`:'<span></span>').join('');
}
function renderWeek(days){const list=$('#week-list');const rows=days.slice(0,state.days);list.innerHTML=rows.map((d,i)=>{const m=meteoDescription(Math.round(d.code)),spread=Number.isFinite(d.spread)?`<small class="week-uncertainty" title="${d.ensemble?'Fascia 10°–90° degli ensemble':'Dispersione fra modelli deterministici'}">${d.ensemble?'ensemble':'modelli'} ±${fmt(d.spread,'°')}</small>`:'';return `<div class="week-row"><span class="week-day">${i===0?'Oggi':dateLabel(d.date)}</span><span class="week-icon" title="${m.text}">${m.icon}</span><span class="week-rain">${Number.isFinite(d.rain)?`☂ ${Math.round(d.rain)}%`:''}</span><span class="week-range">${fmt(d.max,'°')} <span>${fmt(d.min,'°')}</span>${spread}</span><span></span></div>`;}).join('')||'<p class="mix-explainer">Nessuna previsione disponibile.</p>';}
function renderSources(){
 const cards=[{id:'bestmatch',label:'Best Match',logo:'BM',cls:'om',detail:'Disponibile come fonte singola'},{id:'ecmwf',label:'ECMWF IFS',logo:'EU',cls:'ow',detail:'Modello deterministico'},{id:'icon',label:'DWD ICON',logo:'DWD',cls:'wa',detail:'ICON Europe / seamless'},{id:'meteofrance',label:'Météo-France',logo:'MF',cls:'om',detail:'ARPEGE · AROME dove disponibile'},{id:'italiameteo',label:'ItaliaMeteo · ARPAE',logo:'IT',cls:'wa',detail:'ICON 2I ad alta risoluzione'},{id:'ensemble_ecmwf',label:'ECMWF IFS ENS · Europe',logo:'ENS',cls:'ow',detail:'Ensemble nativo europeo · 9 km'},{id:'ensemble_icon',label:'DWD ICON EPS',logo:'EPS',cls:'wa',detail:'Ensemble · scenari DWD'},{id:'ensemble_gfs',label:'NOAA GEFS',logo:'GEFS',cls:'om',detail:'Ensemble · scenari NOAA'}].map(s=>({...s,detail:state.data[s.id]?'Disponibile':state.errors[s.id]||((s.id==='bestmatch'||mixModelIds.includes(s.id))&&!state.data[s.id]?'Non selezionato o non disponibile':s.detail)}));
 $('#source-cards').innerHTML=cards.map(s=>`<div class="source-card"><div class="source-logo ${s.cls}">${s.logo}</div><div class="source-info"><strong>${s.label}</strong><span>${s.detail}</span></div><i class="source-status ${state.data[s.id]?'ok':state.errors[s.id]?'error':''}" title="${state.data[s.id]?'Disponibile':s.detail}"></i></div>`).join('');
 const n=Object.keys(state.data).length;$('#source-count').textContent=state.mode==='mix'?`${n} fonti attive`:`${n} ${n===1?'fonte attiva':'fonti attive'}`;
}
async function searchPlace(query){
 if(query.trim().length<2){$('#suggestions').classList.remove('open');return;}
 try{const u=new URL('https://geocoding-api.open-meteo.com/v1/search');u.searchParams.set('name',query);u.searchParams.set('count','6');u.searchParams.set('language','it');u.searchParams.set('format','json');u.searchParams.set('countryCode','IT');const j=await getJson(u);const results=j.results||[];$('#suggestions').innerHTML=results.map((p,i)=>`<button class="suggestion" data-index="${i}" role="option"><span>${p.name}</span><small>${[p.admin1,p.country].filter(Boolean).join(', ')}</small></button>`).join('')||'<div class="suggestion">Nessuna località trovata</div>';$('#suggestions').classList.add('open');$('#suggestions').querySelectorAll('[data-index]').forEach(b=>b.addEventListener('click',()=>{const p=results[Number(b.dataset.index)];state.place={name:p.name,admin1:p.admin1,country:p.country,latitude:p.latitude,longitude:p.longitude,timezone:p.timezone};store.set('place',state.place);$('#location-search').value=p.name;$('#suggestions').classList.remove('open');loadWeather();}));}catch{$('#suggestions').innerHTML='<div class="suggestion">Ricerca non disponibile</div>';$('#suggestions').classList.add('open');}
}
function syncModeTabs(){document.querySelectorAll('.provider-tab').forEach(b=>{const active=b.dataset.source===state.mode;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});}
function activateMode(mode){state.mode=mode;store.set('mode',mode);syncModeTabs();loadWeather();}
syncModeTabs();
$('#location-search').value=state.place.name;
$('#location-search').addEventListener('input',e=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>searchPlace(e.target.value),260);});
$('#location-search').addEventListener('keydown',e=>{if(e.key==='Escape')$('#suggestions').classList.remove('open');});
document.addEventListener('click',e=>{if(!e.target.closest('.location-box'))$('#suggestions').classList.remove('open');});
document.querySelectorAll('.provider-tab').forEach(b=>b.addEventListener('click',()=>activateMode(b.dataset.source)));
$('#refresh').addEventListener('click',loadWeather);
$('#settings-open').addEventListener('click',()=>{document.querySelectorAll('input[name="model"]').forEach(input=>input.checked=state.models.includes(input.value));$('#settings-dialog').showModal();});
$('#settings-form').addEventListener('submit',e=>{if(e.submitter?.id==='save-settings'){state.models=[...document.querySelectorAll('input[name="model"]:checked')].map(input=>input.value);if(!state.models.length)state.models=[...mixModelIds];store.set('models',state.models);if(state.mode==='mix')setTimeout(loadWeather,0);}});
$('#privacy-open').addEventListener('click',()=>$('#privacy-dialog').showModal());
$('#week-toggle').addEventListener('click',()=>{state.days=state.days===5?7:5;$('#week-toggle').innerHTML=`${state.days} giorni <span>⌄</span>`;const fast=state.models.map(id=>state.data[id]).filter(Boolean),fallback=state.data.bestmatch?[state.data.bestmatch]:[],ensembles=ensembleModels.map(x=>state.data[x.id]).filter(Boolean);const view=state.mode==='mix'?blendForecast(fast.length?fast:fallback,ensembles):state.data[state.mode]||state.data.bestmatch;if(view)renderWeek(view.daily||[]);});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();}));
loadWeather();

