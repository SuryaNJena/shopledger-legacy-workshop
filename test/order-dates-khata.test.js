'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const orders = require('../lib/orders');
const ledger = require('../lib/ledger');

function orderHistory() {
  return {
    orders: [
      { id: 1, date: '28/12/2021' },
      { id: 2, date: '30/01/2022' },
      { id: 3, date: '01/02/2022' },
      { id: 4, date: '2022-03-15' },
      { id: 5, date: '15/03/2022' }
    ]
  };
}

function customerLedger() {
  return {
    customers: [{ id: 1, name: 'Test customer', openingBalance: 2432.01, totalSettled: 1200 }],
    settlements: [],
    nextSettlementId: 1
  };
}

test('lists dates newest first across month and year boundaries', () => {
  assert.deepEqual(orders.list(orderHistory()).map(order => order.id), [5, 4, 3, 2, 1]);
});

test('date ranges include both endpoints and accept either date format', () => {
  const db = orderHistory();

  assert.deepEqual(orders.list(db, { from: '2022-01-30', to: '01/02/2022' }).map(order => order.id), [3, 2]);
  assert.deepEqual(orders.list(db, { from: '2022-02-01' }).map(order => order.id), [5, 4, 3]);
  assert.deepEqual(orders.list(db, { to: '2022-01-30' }).map(order => order.id), [2, 1]);
});

test('adds text and numeric settlements as currency amounts', () => {
  const db = customerLedger();
  const result = ledger.recordSettlement(db, 1, '500', 'upi', 'payment');

  assert.equal(result.ok, true);
  assert.equal(result.settlement.amount, 500);
  assert.equal(result.customer.totalSettled, 1700);
  assert.equal(result.customer.balance, 732.01);

  const second = ledger.recordSettlement(db, 1, 0.1, 'cash');
  assert.equal(second.ok, true);
  assert.equal(second.customer.totalSettled, 1700.1);
  assert.equal(second.customer.balance, 731.91);
});

test('rejects invalid settlement amounts before changing the ledger or receipt sequence', () => {
  for (const amount of ['invalid', ' ', 'Infinity', Infinity, NaN, 0, -1, true, [10]]) {
    const db = customerLedger();

    assert.equal(ledger.recordSettlement(db, 1, amount).ok, false, String(amount));
    assert.deepEqual(db, customerLedger());
  }
});
