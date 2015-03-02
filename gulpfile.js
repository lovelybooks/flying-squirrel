'use strict';

var gulp = require('gulp');
var del = require('del');
var path = require('path');

var karma = require('karma');
var karmaLibConfig = require('karma/lib/config');

// Load plugins
var $ = require('gulp-load-plugins')();
var source = require('vinyl-source-stream'),
    sourceFile = './app/scripts/app.jsx',
    destFolder = './dist/scripts',
    destFileName = 'app.js';

function runKarma(configFilePath, options, exitCallback) {
    var karmaConfig = karmaLibConfig.parseConfig(path.resolve(configFilePath), {});

    Object.keys(options).forEach(function (key) {
        karmaConfig[key] = options[key];
    });

	karma.server.start(karmaConfig, function (exitCode) {
		if (exitCode !== 0) {
			$.util.log('Karma has exited with code ' + $.util.colors.red(exitCode));
		}
        exitCallback();
        process.exit(exitCode);
    });
}

gulp.task('test', function (doneCallback) {
    runKarma('karma.conf.js', {
        autoWatch: false,
        singleRun: true,
    }, doneCallback);
});

gulp.task('tdd', function (doneCallback) {
    runKarma('karma.conf.js', {
        autoWatch: true,
        singleRun: false,
    }, doneCallback);
});

// Watch
gulp.task('watch', ['tdd']);

// Default task
gulp.task('default', ['test']);
