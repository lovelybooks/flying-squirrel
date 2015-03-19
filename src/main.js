'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('./Ref');
var backendUtils = require('./backend');
var frontendUtils = require('./frontend');
var schemaUtils = require('./schemaUtils');


function Server (schema, resourceHandlers) {
    _.each(schemaUtils.checkResourceHandlers(schema, resourceHandlers), function(problem) {
        console.warn('FlyingSquirrel: ' + problem);
    });
    var resourceHandlersInfo = schemaUtils.getResourcesInfo(schema);

    this.schema = schema;
    this.resourceHandlers = resourceHandlers;
    this.resourceHandlersInfo = resourceHandlersInfo;
}
Server.prototype.fetchResource = function fetchResource(resource, args) {
    console.assert(_.isString(resource), 'Resource should be a string');
    console.assert(_.isArray(args), 'Args should be an array');
    var handler = this.resourceHandlers[resource];
    var handlerInfo = this.resourceHandlersInfo[resource];
    return Promise.resolve().then(function () {
        console.assert(_.isFunction(handler), 'Handler for ' + resource + ' not found');
        console.assert(handlerInfo, 'Invalid handler');
        console.log('Fetching from ' + resource + ' ' +
                _.map(args, function(arg) { return JSON.stringify(arg); }).join(', '));
        var promiseOrResult = handler.apply(null, args);
        console.assert(promiseOrResult);
        return promiseOrResult;
    }).then(function (result) {
        _.each(schemaUtils.checkResourceResult(resource, handlerInfo, args, result), function(problem) {
            console.error('FlyingSquirrel: Problem with resource ' + resource + ': ' + problem);
        });
        return result;
    });
};
Server.prototype.fetch = function fetch(ref) {
    var fetchResource = this.fetchResource.bind(this);
    var schema = this.schema;

    // We use Promise.resolve().then(...) so that exceptions from fetchRef will reject the Promise.
    return Promise.resolve().then(function () {
        return backendUtils.fetchRef(schema, ref, fetchResource, {});
    });
};


function Client (schema, fetchRefsCallback) {
    this.schema = schema;
    this.fetchRefsCallback = fetchRefsCallback;
    this.store = {};
}
Client.prototype.IO = function (callback) {
    var IO = frontendUtils.generateApiProxy(this.schema, this.fetchRefsCallback, this.store);
    return IO(callback).then(function (result) {
        _.merge(this.store, result);
        return this.store;
    }.bind(this));
};

var FlyingSquirrel = {
    Server: Server,
    Client: Client,
    Ref: Ref,
};

module.exports = FlyingSquirrel;
