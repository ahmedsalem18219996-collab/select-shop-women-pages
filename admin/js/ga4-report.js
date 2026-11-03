// Parse user-exported GA4 CSV in the browser. Never upload, infer geo or invent traffic.
const normalize=(s)=>String(s??'').trim().toLowerCase().replace(/[\s_\/\-().]/g,'');
const knownRegion=new Set(['region','المنطقة','المحافظة']);
const knownSources=new Set(['sessionsourcemedium','sessionsource','sessiondefaultchannelgroup','source/medium','مصدرالزيارة','المصدر']);
const knownCountry=new Set(['country','البلد','الدولة']);
const metrics=[
  {labels:['sessions','الجلسات','عددالجلسات'],value:'sessions',label:'الجلسات (Sessions)'},
  {labels:['activeusers','المستخدمونالنشطون','المستخدمينالنشطين'],value:'activeUsers',label:'المستخدمون النشطون'},
  {labels:['totalusers','users','المستخدمون','المستخدمين'],value:'totalUsers',label:'المستخدمون'},
  {labels:['screenpageviews','views','المشاهدات'],value:'screenPageViews',label:'المشاهدات'}
];
export function csvRows(input) {
  if(typeof input!=='string')throw new TypeError('CSV text required');
  const text=input.replace(/^\uFEFF/,'');const rows=[];
  let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);cell='';if(row.some(x=>String(x).trim()))rows.push(row);row=[];
    }else cell+=c;
  }
  if(quoted)throw new Error('ملف CSV فيه علامات تنصيص ناقصة.');
  row.push(cell);
  if(row.some(x=>String(x).trim()))rows.push(row);
  return rows;
}
function positiveNumber(raw) {
  const digits=String(raw??'').replace(/[٠-٩]/g,x=>'٠١٢٣٤٥٦٧٨٩'.indexOf(x)).replace(/[۰-۹]/g,x=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(x));
  const value=Number(digits.replace(/[,\s٬]/g,'').replace(/٫/g,'.').trim());
  return Number.isFinite(value)&&value>=0?value:null;
}
export function parseGa4Traffic(text,kind='region'){
  const rows=csvRows(text);
  const aliases=kind==='source'?knownSources:knownRegion;
  let header=-1,dimension=-1,metric=-1,metricDesc=null,country=-1;
  for(let i=0;i<Math.min(rows.length,35);i++){
    const col=rows[i].map(normalize);
    const d=col.findIndex(c=>aliases.has(c));
    if(d<0)continue;
    for(const m of metrics){
      const x=col.findIndex(c=>m.labels.includes(c));
      if(x>=0){header=i;dimension=d;metric=x;metricDesc=m;break;}
    }
    if(header>=0){country=col.findIndex(c=>knownCountry.has(c));break;}
  }
  if(header<0)throw new Error(kind==='region'
    ? 'ملف GA4 لازم يحتوي على عمود Region وعمود Sessions أو Active users.'
    : 'ملف GA4 لازم يحتوي على عمود Session source / medium وعمود Sessions.');
  const map=new Map(),unknown=new Set(['(not set)','not set','(other)','unknown','']);
  let droppedCountry=0,droppedInvalid=0;
  for(const r of rows.slice(header+1)){
    if(r[0]?.startsWith('#'))continue;
    if(country>=0&&!['egypt','مصر','eg'].includes(String(r[country]??'').trim().toLowerCase())){
      droppedCountry++;continue;
    }
    const label=String(r[dimension]??'').trim();
    if(['total','totals','grand total','الإجمالي','المجموع'].includes(label.toLowerCase()))continue;
    const value=positiveNumber(r[metric]);
    if(value===null){droppedInvalid++;continue;}
    const name=unknown.has(label.toLowerCase())?'غير معروف':label;
    map.set(name,(map.get(name)||0)+value);
  }
  const items=[...map.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name));
  return {
    items,total:items.reduce((v,r)=>v+r.value,0),metricLabel:metricDesc.label,
    hasCountryFilter:country>=0,droppedCountry,droppedInvalid,
    kind,header:rows[header]
  };
}
