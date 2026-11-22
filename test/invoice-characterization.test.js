'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

function orderFromCheckout(items, coupon) {
  const totals = pricing.computeTotals(items, coupon);
  return {
    id: 17,
    date: '22/11/2026',
    customer: 'In-memory customer',
    status: 'completed',
    paymentMode: 'cash',
    items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('checkout and invoice both apply the HSN slab', () => {
  const items = [{ id: 1, sku: 'RICE-1', name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  const checkout = pricing.computeTotals(items, '');
  const printedInvoice = invoice.computeInvoiceFigures({ items, coupon: '' });

  assert.equal(checkout.tax, 5);
  assert.equal(checkout.total, 105);
  assert.equal(printedInvoice.rows[0].gstPercent, 5);
  assert.equal(printedInvoice.tax, 5);
  assert.equal(printedInvoice.total, 105);
});

test('invoice interprets decimal GST rates like checkout', () => {
  const figures = invoice.computeInvoiceFigures({
    items: [{ name: 'Tea', price: 100, qty: 1, gstRate: 0.05 }],
    coupon: ''
  });

  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.tax, 5);
  assert.equal(figures.total, 105);
});

test('checkout and invoice apply percentage coupons before GST', () => {
  const items = [{ id: 1, name: 'Tea', hsn: '0902', price: 100, qty: 1 }];
  const checkout = pricing.computeTotals(items, 'WELCOME');
  const printedInvoice = invoice.computeInvoiceFigures({ items, coupon: 'WELCOME' });

  assert.equal(checkout.discount, 5);
  assert.equal(checkout.tax, 17.1);
  assert.equal(checkout.total, 112.1);
  assert.equal(printedInvoice.discount, 5);
  assert.equal(printedInvoice.tax, 17.1);
  assert.equal(printedInvoice.total, 112.1);
});

test('invoice fallback honors coupon minimums and active status', () => {
  const items = [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  const belowMinimum = invoice.computeInvoiceFigures({ items, coupon: 'FLAT50' });
  const expiredCoupon = invoice.computeInvoiceFigures({ items, coupon: 'DIWALI20' });

  assert.equal(belowMinimum.discount, 0);
  assert.equal(belowMinimum.total, 105);
  assert.equal(expiredCoupon.discount, 0);
  assert.equal(expiredCoupon.total, 105);
});

test('reconciliation matches invoice and ledger amounts', () => {
  const order = orderFromCheckout(
    [{ id: 1, sku: 'RICE-1', name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
    ''
  );
  const db = { orders: [order] };
  const result = reports.getGstReconciliation(db);

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.equal(result.rows[0].ledgerTax, 5);
  assert.equal(result.rows[0].invoiceTax, 5);
  assert.equal(result.rows[0].ledgerTotal, 105);
  assert.equal(result.rows[0].invoiceTotal, 105);
  assert.equal(result.rows[0].matched, true);
});

test('CURRENT BEHAVIOUR: reconciliation excludes cancelled orders', () => {
  const order = orderFromCheckout(
    [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
    ''
  );
  order.status = 'cancelled';

  assert.deepEqual(reports.getGstReconciliation({ orders: [order] }), {
    totalChecked: 0,
    mismatchCount: 0,
    totalDelta: 0,
    rows: []
  });
});


test('invoice matches the billed total and GST breakdown for a discounted HSN item', () => {
  const order = orderFromCheckout([{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }], 'WELCOME');
  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(order.total, 99.75);
  assert.equal(figures.total, order.total);
  assert.equal(figures.discount, 5);
  assert.equal(figures.tax, 4.75);
  assert.deepEqual([figures.cgst, figures.sgst], [2.38, 2.37]);
  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.rows[0].lineTax, 4.75);
  const html = invoice.render(order);
  assert.match(html, /Invoice Total<\/td><td class="r">₹99\.75/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('invoice preserves recorded amounts when current pricing differs', () => {
  const order = {
    items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
    subtotal: 100,
    discount: 10,
    tax: 6.01,
    total: 96.01
  };
  const figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    [figures.subtotal, figures.discount, figures.tax, figures.total, figures.cgst, figures.sgst],
    [100, 10, 6.01, 96.01, 3.01, 3]
  );
});
