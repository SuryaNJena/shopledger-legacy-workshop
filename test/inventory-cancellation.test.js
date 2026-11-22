'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const inventory = require('../lib/inventory');
const orders = require('../lib/orders');

test('the last sellable unit can be sold without consuming wholesale holds', () => {
  const products = [{ id: 1, name: 'Chilli', stock: 4, reserved: 3 }];
  const items = [{ id: 1, qty: 1 }];

  assert.equal(inventory.check(products, items).ok, true);
  inventory.reserve(products, items);
  assert.equal(inventory.getSellableStock(products[0]), 0);
  assert.equal(products[0].reserved, 3);
  assert.equal(inventory.check(products, items).ok, false);
});

test('stock check counts repeated lines for the same product together', () => {
  const products = [{ id: 1, name: 'Rice', stock: 4, reserved: 1 }];

  assert.equal(inventory.check(products, [{ id: 1, qty: 2 }, { id: '1', qty: 1 }]).ok, true);
  assert.equal(inventory.check(products, [{ id: 1, qty: 2 }, { id: '1', qty: 2 }]).ok, false);
});

test('cancelling an order restores physical stock only once and keeps holds intact', () => {
  const products = [
    { id: 1, name: 'Chilli', stock: 4, reserved: 2 },
    { id: 2, name: 'Rice', stock: 5, reserved: 1 }
  ];
  const items = [{ id: 1, qty: 1 }, { id: 2, qty: 2 }];
  inventory.reserve(products, items);
  const db = {
    products,
    orders: [{ id: 17, status: 'pending', items: [items[0], { productId: 2, qty: 2 }] }]
  };

  assert.equal(orders.cancel(db, 17).ok, true);
  assert.equal(db.orders[0].status, 'cancelled');
  assert.deepEqual(products.map(({ stock, reserved }) => [stock, reserved]), [[4, 2], [5, 1]]);
  assert.equal(orders.cancel(db, 17).ok, false);
  assert.deepEqual(products.map(({ stock }) => stock), [4, 5]);
});
