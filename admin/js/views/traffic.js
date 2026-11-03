// WOMEN Admin — GA4 reports imported locally, not uploaded or geolocated by us.
import { parseGa4Traffic } from '../ga4-report.js';

const ANALYTICS = 'https://analytics.google.com/analytics/web/';
const CONNECT = 'https://app.hypd.ai/sources?utm_source=mcp&utm_content=none_selected';
const fmt = n => new Intl.NumberFormat('ar-EG',{maximumFractionDigits:1}).format(n);
const create = (name,cls,text) => {
  const x=document.createElement(name);
  if(cls)x.className=cls;
  if(text!==undefined)x.textContent=text;
  return x;
};
function showReport(slot,report){
  slot.replaceChildren();
  const top=create('div','row');
  top.style.justifyContent='space-between';
  top.style.flexWrap='wrap';
  top.append(create('b','',report.metricLabel+' — '+fmt(report.total)),
             create('span','muted',fmt(report.items.length)+' منطقة / مصدر'));
  slot.append(top);
  if(report.kind==='region' && !report.hasCountryFilter)
    slot.append(create('p','err','الملف من غير Country، فمش مضمون إن الزيارات من مصر فقط. فلتر Country = Egypt داخل GA4 قبل التصدير.'));
  if(report.kind==='region' && report.droppedCountry)
    slot.append(create('p','muted','استُبعدت '+fmt(report.droppedCountry)+' سطور من خارج مصر.'));
  if(!report.items.length)slot.append(create('p','muted','مفيش بيانات صالحة في الملف.'));
  const content=create('div','traffic-bars');
  for(const item of report.items.slice(0,report.kind==='region'?30:20)){
    const pct=report.total?Math.round((item.value/report.total)*1000)/10:0;
    const line=create('div','traffic-place');
    const row=create('div','row');
    row.style.justifyContent='space-between';row.style.gap='12px';
    row.append(create('b','',item.name),create('span','num',fmt(item.value)+' · '+fmt(pct)+'%'));
    const track=create('div','traffic-track'),bar=create('span');
    bar.style.width=pct+'%';
    track.append(bar);line.append(row,track);content.append(line);
  }
  slot.append(content,create('p','muted traffic-note','البيانات من الملف اللي اخترتيه، والفترة هي نفس الفترة المحددة وقت تصديره من GA4. مش بيانات مباشرة.'));
}
export default {
  title:()=> 'المحافظات ومصادر الزيارات',
  async render({el}){
    // Static markup only. All CSV-provided data is inserted with textContent.
    el.innerHTML = [
      '<div class="page"><div class="page-head"><div><h2>المحافظات ومصادر الزيارات</h2><p>اكتشفي الناس دخلت منين قبل تحديد ميزانية الإعلان.</p></div></div>',
      '<section class="card stack"><div class="card-head"><h3>تقرير Google Analytics 4</h3></div>',
      '<p style="margin:0">الموقع بيستخدم GA4: <b>G-NB8PZCX35Z</b>. لكن بيانات زوار المتجر المحفوظة حاليًا مش فيها محافظة، ومش هنخترع أرقام. GA4 يقدر يعرض Region تقديريًا من عنوان الإنترنت.</p>',
      '<div class="row" style="flex-wrap:wrap;gap:9px">',
      '<a class="btn btn-primary" target="_blank" rel="noopener noreferrer" href="'+ANALYTICS+'">افتحي Google Analytics</a>',
      '<a class="btn btn-soft" target="_blank" rel="noopener noreferrer" href="'+CONNECT+'">توصيل GA4 لـChatGPT (اختياري)</a></div>',
      '<p class="muted" style="margin:0;font-size:12px">من GA4: Reports → User attributes → Demographic details → Region، وبعدها Country = Egypt، وحددي الفترة. اختاري Export → CSV. ربط GA4 بـChatGPT لا يملأ لوحة الإدارة تلقائيًا؛ علشان تشوفي الأرقام هنا ارفعي ملف CSV.</p></section>',
      '<section class="card stack"><div class="card-head"><h3>الزيارات حسب المحافظة</h3><span class="muted">Region من GA4</span></div>',
      '<label class="field"><span>اختاري ملف CSV للمحافظات</span><input class="input" type="file" id="traffic-region-file" accept=".csv,text/csv"></label>',
      '<div id="traffic-region-results" aria-live="polite"><p class="muted">مفيش أرقام محافظات مؤكدة قبل اختيار التقرير.</p></div></section>',
      '<section class="card stack"><div class="card-head"><h3>مصادر الزيارات</h3><span class="muted">Facebook / Instagram / Google / مباشر</span></div>',
      '<p class="muted" style="margin:0">من GA4: Reports → Acquisition → Traffic acquisition، اختاري Session source / medium، وبعدها Export → CSV.</p>',
      '<label class="field"><span>اختاري ملف CSV لمصادر الزيارات</span><input class="input" type="file" id="traffic-source-file" accept=".csv,text/csv"></label>',
      '<div id="traffic-source-results" aria-live="polite"><p class="muted">ارفعي تقرير المصدر علشان تشوفي توزيع الزيارات.</p></div></section>',
      '<section class="card stack"><b>الخصوصية ودقة التقرير</b><p class="muted" style="margin:0">الملف بيتقري على موبايلك/كمبيوترك من غير رفعه لسيرفر. Region تقديري وقد يكون غير معروف. ما نعتبرش الزيارات مبيعات، ولا نختار محافظات الإعلان من الزيارات لوحدها.</p></section>',
      '</div>'
    ].join('');
    for(const kind of ['region','source']){
      const input=el.querySelector('#traffic-'+kind+'-file');
      input?.addEventListener('change',async ()=>{
        const file=input.files?.[0],slot=el.querySelector('#traffic-'+kind+'-results');
        if(!file||!slot)return;
        if(file.size>2_000_000){slot.textContent='الملف أكبر من 2MB. صدّري فترة أقصر من GA4.';return;}
        try {
          const report=parseGa4Traffic(await file.text(),kind);
          if(document.contains(slot))showReport(slot,report);
        }catch(e){if(document.contains(slot))slot.textContent=e?.message||'ملف غير صالح؛ جرّبي تصدري CSV من GA4.';}
      });
    }
  }
};
