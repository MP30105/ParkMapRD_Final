const parkingStore = require('../../parkmaprdData');
const { getDb } = require('../../db');

describe('Parking Store', () => {
  let created;

  test('createParking should create and return parking', () => {
    created = parkingStore.createParking({ id: 'TESTPARK', name: 'Test Parking', lat: 18.5, lng: -69.9, totalSpots: 20 });
    expect(created).toBeDefined();
    expect(created.id).toBe('TESTPARK');
    expect(created.availableSpots).toBe(20);
  });

  test('updateAvailability should clamp to totalSpots', () => {
    const updated = parkingStore.updateAvailability('TESTPARK', 999);
    expect(updated.availableSpots).toBe(20);
  });

  test('updateAvailability should not go below zero', () => {
    const updated = parkingStore.updateAvailability('TESTPARK', -5);
    expect(updated.availableSpots).toBe(0);
  });

  test('updateParking should allow patching name and totalSpots', () => {
    const patched = parkingStore.updateParking('TESTPARK', { name: 'Renamed', totalSpots: 25, availableSpots: 10 });
    expect(patched.name).toBe('Renamed');
    expect(patched.totalSpots).toBe(25);
    expect(patched.availableSpots).toBe(10);
  });

  test('deleteParking should remove and return entity', () => {
    const removed = parkingStore.deleteParking('TESTPARK');
    expect(removed).toBeDefined();
    const after = parkingStore.getById('TESTPARK');
    expect(after).toBeUndefined();
  });
});
