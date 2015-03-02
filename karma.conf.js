'use strict';

// Karma doc: http://karma-runner.github.io/0.12/config/configuration-file.html

module.exports = function (config) {
    config.set({

        basePath: '.',
        frameworks: ['jasmine', 'browserify'],
        files: [
            'node_modules/es5-shim/es5-shim.js', // Because JS in PhantomJS sucks.
            'src/**/__mocks__/*.js',
            'src/**/__tests__/*.js',
        ],
        reportSlowerThan: 100,

        browsers: [
            'PhantomJS',
            // 'Chrome',
            // 'ChromeCanary',
        ],
        captureTimeout: 10000,

        // logLevel: config.LOG_DEBUG,
        logLevel: config.LOG_WARN,

        reporters: ['mocha'],
        preprocessors: {
            'src/**/*.js': ['browserify'],
        },

        browserify: {
            debug: true, // for meaningful stacktraces
            transform: ['rewireify'],
        },
        mochaReporter: {
            //output: 'autowatch', // Uncomment to display the full test report only once.
        },
    });
};
