/*jshint jasmine: true */
'use strict';

// Mocking console.assert for tests
console.assert = function(condition, message) {
    if (!condition) {
        message = message || 'Assertion failed';
        jasmine.getEnv().fail(message);
    }
};

jasmine.DEFAULT_TIMEOUT_INTERVAL = 100; // miliseconds
