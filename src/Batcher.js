/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');


// batchCallback: function(requests) -> Promise
// postprocessCallback: function(request, batchResult) -> result
function Batcher(batchCallback, postprocessCallback) {
    console.assert(_.isFunction(batchCallback));
    console.assert(_.isFunction(postprocessCallback) || postprocessCallback == null);
    this.batchCallback = batchCallback;
    this.requested = [];
    this.requestTimeout = null;

    this.get = function(request) {
        return new Promise(function (resolve, reject) {
            this.requested.push({request: request, resolve: resolve, reject: reject});
            if (!this.requestTimeout) {
                this.requestTimeout = setTimeout(this.fetchRequested.bind(this), 0);
            }
        }.bind(this));
    }.bind(this);

    this.fetchRequested = function() {
        this.requestTimeout = null;
        var acceptedRequests = this.requested;
        this.requested = [];

        var requests = _.map(acceptedRequests, 'request');
        console.assert(_.isArray(requests));
        return this.batchCallback(requests).then(function(response) {
            // resolving promises that could be resolved
            _.each(acceptedRequests, function(promiseCallbacks) {
                if (postprocessCallback) {
                    try {
                        var postprocessed = postprocessCallback(promiseCallbacks.request, response);
                        promiseCallbacks.resolve(postprocessed);
                    } catch(err) {
                        promiseCallbacks.reject(err);
                    }
                } else {
                    promiseCallbacks.resolve(response);
                }
            });
        }).catch(function (err) {
            console.error('Batcher: ' + requests + ' --> ERROR: ', err);
            _.each(acceptedRequests, function(promiseCallbacks) {
                promiseCallbacks.reject(err);
            });
        });
    }.bind(this);
}

module.exports = Batcher;
