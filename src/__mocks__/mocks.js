/*jshint jasmine: true */
'use strict';

// Mocking console.assert for tests
console.assert = function(condition, message) {
    message = message || 'Assertion failed';
    expect(condition).toBeTruthy(message);
};

jasmine.DEFAULT_TIMEOUT_INTERVAL = 100; // miliseconds
