import test from 'node:test';
import assert from 'node:assert/strict';
import { egyptianMobile, followupScripts, snapshotItems } from '../../admin/js/order-followup.js';

const item = {
  product_title: 'جاكيت تجريبي',
  product_public_code: 'SS-TEST',
  quantity: 1,
  option_selections: [{ name: 'Size', value: 'M' }, { name: 'اللون', value: 'أسود' }],
};
const order = {
  buyer_name: 'عميلة تجريبية',
  delivery_address: 'القاهرة، شارع تجريبي',
  delivery_region_label: 'القاهرة',
  payment_method: 'cod',
  grand_total_minor: 86575,
  merchandise_subtotal_minor: 80000,
  items: [item],
};

test('Egyptian mobile normalization accepts local and international formats with Arabic or Persian digits', () => {
  for (const input of ['٠١٠ ٠٠٠٠ ٠٠٠٠', '+۲۰ (۱۰) ۰۰۰۰.۰۰۰۰', '0020-10-0000-0000', '201000000000', '1000000000']) {
    assert.equal(egyptianMobile(input), '201000000000', input);
  }
  for (const network of ['10', '11', '12', '15']) {
    assert.equal(egyptianMobile('0' + network + '00000000'), '20' + network + '00000000');
  }
  for (const input of [null, '', '+971500000000', '01300000000', '010000000000', '+201000000000 ext 10', '+2+01000000000', '01000000000;123']) {
    assert.equal(egyptianMobile(input), null, input);
  }
});

test('the two scripts use frozen product choices and the actual COD total', () => {
  const scripts = followupScripts(order, 'اسم تجريبي');
  assert.equal(scripts.call, 'أهلًا يا فندم، معاكي اسم تجريبي من SELECT SHOP. حضرتك سجّلتي طلب جاكيت تجريبي لون أسود مقاس M، والإجمالي 865.75 جنيه، دفع عند الاستلام وتقدري تعاينيه قبل ما تدفعي. العنوان القاهرة، شارع تجريبي، مظبوط؟');
  assert.equal(scripts.whatsapp, 'أهلًا عميلة تجريبية، حاولت أتصل بحضرتك بخصوص طلب جاكيت تجريبي لون أسود مقاس M. الإجمالي 865.75 جنيه دفع عند الاستلام وتعاينيه قبل ما تدفعي. اكتبيلي "تأكيد" هنا لو البيانات مظبوطة، أو قوليلي لو عايزة تغيّري لون أو مقاس.');
});

test('grouped order snapshots take precedence and item quantities stay attached to the right selections', () => {
  const other = { product_public_code: 'SS-OTHER', quantity: 2, option_selections: [{ name: 'Colour', value: 'أخضر' }] };
  const grouped = { ...order, groups: [{ items: [item] }, { items: [other] }], items: [item, other] };
  assert.deepEqual(snapshotItems(grouped), [item, other]);
  assert.match(followupScripts(grouped).whatsapp, /جاكيت تجريبي لون أسود مقاس M، وSS-OTHER لون أخضر عدد 2/);
});

test('legacy and non-COD orders avoid fabricated names, data, totals and payment promises', () => {
  const scripts = followupScripts({ public_order_code: 'ORD-TEST', payment_method: 'prepaid' });
  assert.match(scripts.call, /معاكي فريق SELECT SHOP/);
  assert.match(scripts.call, /طلب ORD-TEST/);
  assert.doesNotMatch(scripts.call, /اللون|لون |مقاس|العنوان|الإجمالي|دفع عند الاستلام|تعاين/);
  assert.match(scripts.whatsapp, /^أهلًا يا فندم/);
  assert.doesNotMatch(scripts.whatsapp, /الإجمالي|دفع عند الاستلام|تعاين/);
  assert.doesNotMatch(followupScripts({ ...order, payment_method: 'prepaid' }).whatsapp, /دفع عند الاستلام|تعاين/);
});
