const $ = (q) => document.querySelector(q);
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(`meteomix:${key}`)) ?? fallback; } catch { return fallback; } },
  set(key, value) { localStorage.setItem(`meteomix:${key}`, JSON.stringify(value)); }
};
const state = {
  place: store.get('place', {name:'Roma', admin1:'Lazio', country:'Italia', latitude:41.9028, longitude:12.4964, timezone:'Europe/Rome'}),
  mode: store.get('mode','mix'), models: store.get('models',['bestmatch','ecmwf','icon','meteofrance','italiameteo']), data:{}, errors:{}, days:5, searchTimer:null
};
const providerNames={bestmatch:'Best Match',ecmwf:'ECMWF IFS',icon:'DWD ICON',meteofrance:'Météo-France',italiameteo:'ItaliaMeteo ARPAE'};
const modelIds={bestmatch:'best_match',ecmwf:'ecmwf_ifs',icon:'icon_seamless',meteofrance:'meteofrance_seamless',italiameteo:'italia_meteo_arpae_icon_2i'};
if(state.mode!=='mix'&&!providerNames[state.mode]){state.mode='mix';store.set('mode','mix');}
state.models=state.models.filter(id=>modelIds[id]);if(!state.models.length)state.models=['bestmatch','ecmwf','icon','meteofrance','italiameteo'];
const iconMap={sun:'☀️',part:'⛅',cloud:'☁️',fog:'🌫️',drizzle:'🌦️',rain:'🌧️',snow:'🌨️',storm:'⛈️'};
const descMap={0:['Sereno','sun'],1:['Prevalentemente sereno','sun'],2:['Parzialmente nuvoloso','part'],3:['Coperto','cloud'],45:['Nebbia','fog'],48:['Nebbia con brina','fog'],51:['Pioviggine debole','drizzle'],53:['Pioviggine','drizzle'],55:['Pioviggine intensa','rain'],56:['Pioggia gelata debole','drizzle'],57:['Pioggia gelata','rain'],61:['Pioggia debole','rain'],63:['Pioggia','rain'],65:['Pioggia intensa','rain'],66:['Pioggia gelata debole','rain'],67:['Pioggia gelata','rain'],71:['Neve debole','snow'],73:['Neve','snow'],75:['Neve intensa','snow'],77:['Granelli di neve','snow'],80:['Rovesci deboli','rain'],81:['Rovesci','rain'],82:['Rovesci intensi','rain'],85:['Rovesci di neve','snow'],86:['Nevicate intense','snow'],95:['Temporale','storm'],96:['Temporale con grandine','storm'],99:['Temporale forte','storm']};
function meteoDescription(code){const found=descMap[Number(code)];return found?{text:found[0],icon:iconMap[found[1]]}:{text:'Variabile',icon:'⛅'};}
function setNotice(text=''){const n=$('#notice');n.textContent=text;n.hidden=!text;}
function fnum(n,d=0){if(n===null||n===undefined||n==='')return null;return Number.isFinite(Number(n))?Number(Number(n).toFixed(d)):null;}
function mean(arr){const vals=arr.filter(v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))).map(Number);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;}
function modeOf(arr){const vals=arr.filter(Number.isFinite);if(!vals.length)return null;const counts=new Map();for(const v of vals)counts.set(v,(counts.get(v)||0)+1);return [...counts].sort((a,b)=>b[1]-a[1])[0][0];}
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
function blendForecast(sources){
 const current={};for(const k of ['temp','feels','humidity','wind','rain','rainMm','pressure'])current[k]=mean(sources.map(x=>x.current[k]).filter(Number.isFinite));
 current.code=modeOf(sources.map(x=>x.current.code))??1;
 const grouped={};for(const source of sources)for(const h of source.hourly){const t=new Date(h.time);if(Number.isNaN(t.valueOf()))continue;const hour=Math.round(t.getHours()/3)*3%24;const date=new Date(t);date.setHours(hour,0,0,0);const key=date.toISOString();(grouped[key]??=[]).push(h);}
 const hourly=Object.entries(grouped).map(([time,xs])=>({time,temp:mean(xs.map(x=>x.temp)),rain:mean(xs.map(x=>x.rain)),rainMm:mean(xs.map(x=>x.rainMm)),code:modeOf(xs.map(x=>x.code))})).sort((a,b)=>a.time.localeCompare(b.time));
 const byDay={};for(const source of sources)for(const d of source.daily){(byDay[d.date]??=[]).push(d);}
 const daily=Object.entries(byDay).map(([date,xs])=>({date,min:mean(xs.map(x=>x.min)),max:mean(xs.map(x=>x.max)),rain:mean(xs.map(x=>x.rain)),rainMm:mean(xs.map(x=>x.rainMm)),code:modeOf(xs.map(x=>x.code))})).sort((a,b)=>a.date.localeCompare(b.date));
 const desc=meteoDescription(Math.round(current.code));return {provider:'mix',stamp:new Date().toISOString(),current:{...current,desc:desc.text,icon:desc.icon},hourly,daily};
}
async function loadWeather(){
 const button=$('#refresh');button.classList.add('loading');button.disabled=true;setNotice('');state.data={};state.errors={};
 const selected=state.mode==='mix'?state.models:[state.mode];
 const requests=selected.map(id=>[id,()=>fetchOpenMeteo(state.place,id)]);
 await Promise.all(requests.map(async([id,fn])=>{try{state.data[id]=await fn();}catch(e){state.errors[id]=e.message||'Servizio non raggiungibile';}}));
 const active=state.mode==='mix'?Object.keys(state.data):[state.mode].filter(k=>state.data[k]);
 if(state.mode!=='mix'&&!state.data[state.mode])setNotice(`${providerNames[state.mode]} non è disponibile per questa località o in questo momento. Mostro Best Match.`);
 if(state.mode==='mix'&&!active.length)setNotice('Nessun modello disponibile. Provo la selezione automatica Best Match.');
 const sources=active.map(k=>state.data[k]);
 if(!sources.length){try{state.data.bestmatch=await fetchOpenMeteo(state.place,'bestmatch');state.errors.bestmatch='';sources.push(state.data.bestmatch);}catch(e){state.errors.bestmatch=e.message||'Servizio non raggiungibile';}}
 const view=state.mode==='mix'?blendForecast(sources):sources[0];
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
 $('#hero-updated').textContent=state.mode==='mix'?`${sources.length} ${sources.length===1?'modello attivo':'modelli attivi'}`:`Modello: ${providerNames[view.provider]||'—'}`;
 $('#metric-humidity').textContent=fmt(c.humidity,'%');$('#metric-wind').innerHTML=`${fmt(c.wind)} <small>km/h</small>`;$('#metric-rain').textContent=fmt(c.rain,'%');$('#metric-pressure').innerHTML=`${fmt(c.pressure)} <small>hPa</small>`;
 renderChart(view.hourly||[]);renderWeek(view.daily||[]);
 $('#chart-note').textContent=state.mode==='mix'?`Media dei valori per fascia di 3 ore · ${sources.length} ${sources.length===1?'modello':'modelli'} disponibili.`:`Previsione oraria: ${providerNames[view.provider]||'Best Match'}.`;
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
function renderWeek(days){const list=$('#week-list');const rows=days.slice(0,state.days);list.innerHTML=rows.map((d,i)=>{const m=meteoDescription(Math.round(d.code));return `<div class="week-row"><span class="week-day">${i===0?'Oggi':dateLabel(d.date)}</span><span class="week-icon" title="${m.text}">${m.icon}</span><span class="week-rain">${d.rain?`☂ ${Math.round(d.rain)}%`:''}</span><span class="week-range">${fmt(d.max,'°')} <span>${fmt(d.min,'°')}</span></span><span></span></div>`;}).join('')||'<p class="mix-explainer">Nessuna previsione disponibile.</p>';}
function renderSources(){
 const cards=[{id:'bestmatch',label:'Best Match',logo:'BM',cls:'om',detail:'Modello adatto alla località'},{id:'ecmwf',label:'ECMWF IFS',logo:'EU',cls:'ow',detail:'Centro europeo'},{id:'icon',label:'DWD ICON',logo:'DWD',cls:'wa',detail:'Servizio tedesco'},{id:'meteofrance',label:'Météo-France',logo:'MF',cls:'om',detail:'ARPEGE · AROME dove disponibile'},{id:'italiameteo',label:'ItaliaMeteo · ARPAE',logo:'IT',cls:'wa',detail:'ICON 2I ad alta risoluzione'}].map(s=>({...s,detail:state.data[s.id]?'Disponibile per questa località':state.errors[s.id]||s.detail}));
 $('#source-cards').innerHTML=cards.map(s=>`<div class="source-card"><div class="source-logo ${s.cls}">${s.logo}</div><div class="source-info"><strong>${s.label}</strong><span>${s.detail}</span></div><i class="source-status ${state.data[s.id]?'ok':state.errors[s.id]?'error':''}" title="${state.data[s.id]?'Disponibile':s.detail}"></i></div>`).join('');
 const n=Object.keys(state.data).length;$('#source-count').textContent=`${n} ${n===1?'modello attivo':'modelli attivi'}`;
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
$('#settings-form').addEventListener('submit',e=>{if(e.submitter?.id==='save-settings'){state.models=[...document.querySelectorAll('input[name="model"]:checked')].map(input=>input.value);store.set('models',state.models);if(state.mode==='mix')setTimeout(loadWeather,0);}});
$('#privacy-open').addEventListener('click',()=>$('#privacy-dialog').showModal());
$('#week-toggle').addEventListener('click',()=>{state.days=state.days===5?7:5;$('#week-toggle').innerHTML=`${state.days} giorni <span>⌄</span>`;const view=state.mode==='mix'?blendForecast(Object.values(state.data)):state.data[state.mode]||state.data.bestmatch;if(view)renderWeek(view.daily||[]);});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();}));
loadWeather();

