/* SELECT SHOP WOMEN · Claude design v2 · DEMO CATALOG
   ⚠️ Every product, price, discount, stock state, look, story and size-chart number below is
   INVENTED for the design preview. None of it is real WOMEN inventory. Do not publish it as real.
   Replace through js/store-adapter.js (loadCatalog) with the verified WOMEN public catalog.

   Product shape the UI expects:
   {
     id:      unique id (number or string)
     name:    Arabic display name
     cat:     one of `categories` below (used by the measuring tape)
     price:   current price in EGP (number)
     was:     optional original price → shows a "خصم %" badge and a struck-through price
     c:       hex colour used as the placeholder background while there is no photo
     sw:      array of hex colours for the small swatch dots
     out:     sizes that are sold out, e.g. ['S', 'XXL'] (shown struck through in the size sheet)
     one:     true for one-size items (bags, scarves): the sheet shows "مقاس واحد"
     isNew:   true → appears under "الجديد"
     badge:   optional short label, e.g. 'آخر 3 قطع'
     image:   optional photo URL (3:4). null = coloured placeholder with "صورة المنتج"
     url:     optional product page URL. null = tapping the name opens the size sheet
   }
*/
window.SELECT_DEMO_DATA = {
  sizes: ['S', 'M', 'L', 'XL', 'XXL'],

  /* Order of segments on the measuring tape. 'الكل', 'الجديد' and 'تخفيضات' are computed filters. */
  categories: ['الكل', 'الجديد', 'فساتين', 'أطقم', 'عبايات', 'بلوزات', 'جيبات وبناطيل', 'إكسسوارات', 'تخفيضات'],

  products: [
    { id: 1, name: 'فستان ميدي كتان', cat: 'فساتين', price: 1450, c: '#C9B79C', sw: ['#C9B79C', '#6B7353'], out: [], isNew: true, image: null, url: null },
    { id: 2, name: 'فستان سهرة مخمل', cat: 'فساتين', price: 2750, c: '#4A1C26', sw: ['#4A1C26', '#16192B'], out: ['S', 'XXL'], badge: 'آخر 3 قطع', image: null, url: null },
    { id: 3, name: 'فستان قميص مقلم', cat: 'فساتين', price: 1180, c: '#8FA3BF', sw: ['#8FA3BF'], out: [], isNew: true, image: null, url: null },
    { id: 4, name: 'طقم بليزر وبنطلون', cat: 'أطقم', price: 2300, c: '#2F3B57', sw: ['#2F3B57', '#A9AAA2'], out: ['XXL'], isNew: true, image: null, url: null },
    { id: 5, name: 'طقم تريكو بيت', cat: 'أطقم', price: 1250, c: '#A9AAA2', sw: ['#A9AAA2', '#C9B79C'], out: ['XL', 'XXL'], image: null, url: null },
    { id: 6, name: 'عباية كريب مطرزة', cat: 'عبايات', price: 1900, c: '#24262C', sw: ['#24262C'], out: [], isNew: true, image: null, url: null },
    { id: 7, name: 'عباية كتان بزراير', cat: 'عبايات', price: 1650, c: '#6B7353', sw: ['#6B7353', '#C9B79C'], out: ['S'], image: null, url: null },
    { id: 8, name: 'بلوزة ساتان بكسرات', cat: 'بلوزات', price: 780, c: '#D8BFB8', sw: ['#D8BFB8', '#E4E1D8'], out: [], isNew: true, image: null, url: null },
    { id: 9, name: 'قميص بوبلين واسع', cat: 'بلوزات', price: 690, c: '#E2DFD6', sw: ['#E2DFD6', '#8FA3BF'], out: ['XXL'], image: null, url: null },
    { id: 10, name: 'بنطلون واسع بكسرة', cat: 'جيبات وبناطيل', price: 880, was: 1100, c: '#34405A', sw: ['#34405A'], out: [], image: null, url: null },
    { id: 11, name: 'جيبة بليسيه طويلة', cat: 'جيبات وبناطيل', price: 950, c: '#7C8A63', sw: ['#7C8A63', '#4A1C26'], out: [], image: null, url: null },
    { id: 12, name: 'كارديجان تريكو', cat: 'بلوزات', price: 840, was: 1100, c: '#A68A66', sw: ['#A68A66'], out: ['M'], image: null, url: null },
    { id: 13, name: 'شنطة كلاتش ساتان', cat: 'إكسسوارات', price: 520, c: '#1E2130', sw: ['#1E2130'], out: [], one: true, image: null, url: null },
    { id: 14, name: 'إيشارب شيفون', cat: 'إكسسوارات', price: 260, c: '#CDB9A0', sw: ['#CDB9A0'], out: [], one: true, image: null, url: null }
  ],

  /* Weekly looks: `ids` must point at real product ids. The total is summed from those prices. */
  looks: [
    { name: 'لوك الشغل', ids: [4, 8, 14], note: 'من الاجتماع للعشا' },
    { name: 'خروجة بالليل', ids: [2, 13, 12], note: 'مخمل وساتان' },
    { name: 'جمعة العيلة', ids: [7, 14, 9], note: 'كتان ومريح' }
  ],

  /* Stories: one slide per product id; `lines[i]` is the big headline of slide i. */
  stories: [
    { name: 'الجديد', ids: [1, 4, 8], lines: ['وصل الخميس', 'بليزر بقصة جديدة', 'ساتان مات'] },
    { name: 'سهرة', ids: [2, 13], lines: ['مخمل نبيتي', 'الكلاتش اللي يكمّله'] },
    { name: 'عبايات', ids: [6, 7], lines: ['تطريز بالإيد', 'كتان للصيف والشتا'] },
    { name: 'شغل', ids: [4, 9, 10], lines: ['طقم كامل', 'قميص لكل يوم', 'بنطلون واسع'] },
    { name: 'تخفيضات', ids: [10, 12], lines: ['خصم 20%', 'لحد ما يخلص'] }
  ],

  /* DEMO size chart (cm): [size, max bust, max waist]. Must be replaced with real measured values. */
  sizeChart: [['S', 88, 70], ['M', 94, 76], ['L', 100, 82], ['XL', 107, 89], ['XXL', 114, 96]],
  sizeChartMin: { bust: 80, waist: 62 }
};
