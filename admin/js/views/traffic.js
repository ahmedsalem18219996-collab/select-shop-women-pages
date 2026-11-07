// WOMEN Admin — GA4 reports imported locally, not uploaded or geolocated by us.
// Versioned: this view needs the funnel/grouping exports, never an older cached copy of the parser.
import { parseGa4Traffic, parseGa4Events, groupSources } from '../ga4-report.js?v=20261106-events';

const ANALYTICS = 'https://analytics.google.com/analytics/web/';
const CONNECT = 'https://app.hypd.ai/sources?utm_source=mcp&utm_content=none_selected';
const fmt = n => new Intl.NumberFormat('ar-EG',{maximumFractionDigits:1}).format(n);
const create = (name,cls,text) => {
  const x=document.createElement(name);
  if(cls)x.className=cls;
  if(text!==undefined)x.textContent=text;
  return x;
};
function bars(items,total){
  const box=create('div','traffic-bars');
  for(const item of items){
    const pct=total?Math.round((item.value/total)*1000)/10:0;
    const line=create('div','traffic-place'),row=create('div','row');
    row.style.justifyContent='space-between';row.style.gap='12px';
    row.append(create('b','',item.name),create('span','num',fmt(item.value)+' · '+fmt(pct)+'%'));
    const track=create('div','traffic-track'),bar=create('span');
    bar.style.width=pct+'%';track.append(bar);line.append(row,track);box.append(line);
  }
  return box;
}
function showFunnel(slot,{steps,conversion}){
  slot.replaceChildren();
  const top=steps[0].count;
  const list=create('div','traffic-bars');
  steps.forEach((s,i)=>{
    const prev=i?steps[i-1].count:null;
    const line=create('div','traffic-place'),row=create('div','row');
    row.style.justifyContent='space-between';row.style.gap='12px';
    const rate=prev&&s.count!==null?' · '+fmt(Math.round(s.count/prev*1000)/10)+'% من أحداث المرحلة السابقة':'';
    row.append(create('b','',s.label),create('span','num',s.count===null?'مش موجود في الملف':fmt(s.count)+rate));
    const track=create('div','traffic-track'),bar=create('span');
    bar.style.width=(top&&s.count!==null?Math.min(100,Math.round(s.count/top*100)):0)+'%';
    track.append(bar);line.append(row,track);list.append(line);
  });
  slot.append(list,create('b','',conversion===null?'النسبة غير متاحة: يلزم وجود view_item وpurchase في الملف':'نسبة أحداث الشراء إلى مشاهدة المنتج: '+fmt(Math.round(conversion*1000)/10)+'%'),
    create('p','muted traffic-note','أرقام مقاسة من GA4 في المتصفح، وقد تقل عند رفض المستخدم للكوكيز أو استخدام مانع إعلانات. عدد الطلبات الحقيقي من صفحة الطلبات، مش من الملف ده.'));
}
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
  if(report.kind==='source'&&report.items.length){
    slot.append(create('b','','حسب القناة'),bars(groupSources(report.items),report.total),create('b','','التفاصيل من GA4'));
  }
  const content=bars(report.items.slice(0,report.kind==='region'?30:20),report.total);
  slot.append(content,create('p','muted traffic-note','البيانات من الملف اللي اخترتيه، والفترة هي نفس الفترة المحددة وقت تصديره من GA4. مش بيانات مباشرة.'));
}
export default {
  title:()=> 'المحافظات ومصادر الزيارات',
  async render({el}){
    // Static markup only. All CSV-provided data is inserted with textContent.
    el.innerHTML = [
      '<div class="page"><div class="page-head"><div><h2>المحافظات ومصادر الزيارات</h2><p>مصادر الزيارات حسب المحافظة والقناة قبل تحديد ميزانية الإعلان.</p></div></div>',
      '<section class="card stack"><div class="card-head"><h3>تقرير Google Analytics 4</h3></div>',
      '<p style="margin:0">الموقع بيستخدم GA4: <b>G-NB8PZCX35Z</b>. لكن بيانات زوار المتجر المحفوظة حاليًا مش فيها محافظة، ومش هنخترع أرقام. GA4 يقدر يعرض Region تقديريًا من عنوان الإنترنت.</p>',
      '<div class="row" style="flex-wrap:wrap;gap:9px">',
      '<a class="btn btn-primary" target="_blank" rel="noopener noreferrer" href="'+ANALYTICS+'">فتح Google Analytics</a>',
      '<a class="btn btn-soft" target="_blank" rel="noopener noreferrer" href="'+CONNECT+'">توصيل GA4 لـChatGPT (اختياري)</a></div>',
      '<p class="muted" style="margin:0;font-size:12px">من GA4: Reports → User attributes → Demographic details → Region، وبعدها Country = Egypt، ثم تحديد الفترة واختيار Export → CSV. ربط GA4 بـChatGPT لا يملأ لوحة الإدارة تلقائيًا؛ لعرض الأرقام هنا، يلزم رفع ملف CSV.</p></section>',
      '<section class="card stack"><div class="card-head"><h3>الزيارات حسب المحافظة</h3><span class="muted">Region من GA4</span></div>',
      '<label class="field"><span>اختيار ملف CSV للمحافظات</span><input class="input" type="file" id="traffic-region-file" accept=".csv,text/csv"></label>',
      '<div id="traffic-region-results" aria-live="polite"><p class="muted">مفيش أرقام محافظات مؤكدة قبل اختيار التقرير.</p></div></section>',
      '<section class="card stack"><div class="card-head"><h3>مصادر الزيارات</h3><span class="muted">Facebook / Instagram / Google / مباشر</span></div>',
      '<p class="muted" style="margin:0">من GA4: Reports → Acquisition → Traffic acquisition، اختيار Session source / medium، وبعدها Export → CSV.</p>',
      '<label class="field"><span>اختيار ملف CSV لمصادر الزيارات</span><input class="input" type="file" id="traffic-source-file" accept=".csv,text/csv"></label>',
      '<div id="traffic-source-results" aria-live="polite"><p class="muted">رفع تقرير المصدر لعرض توزيع الزيارات.</p></div></section>',
      '<section class="card stack"><div class="card-head"><h3>أحداث الشراء في GA4</h3><span class="muted">أعداد الأحداث المسجلة، وليست عدد العملاء</span></div>',
      '<p class="muted" style="margin:0">من GA4: Reports → Engagement → Events، وبعدها Export → CSV.</p>',
      '<label class="field"><span>اختيار ملف CSV للأحداث</span><input class="input" type="file" id="traffic-events-file" accept=".csv,text/csv"></label>',
      '<div id="traffic-events-results" aria-live="polite"><p class="muted">رفع تقرير الأحداث لعرض أعداد الأحداث ونسبتها بين المراحل.</p></div></section>',
      '<section class="card stack"><b>الخصوصية ودقة التقرير</b><p class="muted" style="margin:0">الملف بيتقري على موبايلك/كمبيوترك من غير رفعه لسيرفر. Region تقديري وقد يكون غير معروف. ما نعتبرش الزيارات مبيعات، ولا نختار محافظات الإعلان من الزيارات لوحدها.</p></section>',
      '</div>'
    ].join('');
    for(const kind of ['region','source','events']){
      const input=el.querySelector('#traffic-'+kind+'-file');
      input?.addEventListener('change',async ()=>{
        const file=input.files?.[0],slot=el.querySelector('#traffic-'+kind+'-results');
        if(!file||!slot)return;
        if(file.size>2_000_000){slot.textContent='الملف أكبر من 2MB. صدّري فترة أقصر من GA4.';return;}
        try {
          const text=await file.text();
          if(!document.contains(slot))return;
          if(kind==='events')showFunnel(slot,parseGa4Events(text));
          else showReport(slot,parseGa4Traffic(text,kind));
        }catch(e){if(document.contains(slot))slot.textContent=e?.message||'ملف غير صالح؛ يرجى تصدير CSV من GA4.';}
      });
    }
  }
};
