/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('../Ref');
var backendUtils = require('../backend');
var schemaUtils = require('../schemaUtils');

function Server (schema, resourceHandlers) {

    _.each(schemaUtils.checkResourceHandlers(schema, resourceHandlers), function(problem) {
        console.warn('FlyingSquirrel: ' + problem);
    });
    var resourceHandlersInfo = {};
    _.each(schemaUtils.generateResourcesList(schema), function(resourceHandler) {
        resourceHandlersInfo[resourceHandler.ref] = _.omit(resourceHandler, 'ref');
    });

    this.schema = schema;
    this.resourceHandlers = resourceHandlers;
    this.resourceHandlersInfo = resourceHandlersInfo;
}
Server.prototype.fetchResource = function fetchResource(resource, args) {
    var handlerInfo = this.resourceHandlersInfo[resource];
    console.assert(handlerInfo);
    console.assert(args.length === handlerInfo.inCollections.length);
    console.assert(args.length === (resource.match(/\{\}/g) || []).length);
    console.log(resource, args, handlerInfo);
    var promiseOrResult = this.resourceHandlers[resource].apply(null, args);
    console.assert(promiseOrResult);
    return Promise.resolve(promiseOrResult).then(function (result) {
        var subResult = result;
        _.each(handlerInfo.inCollections, function () {
            subResult = subResult[0];
        });
        var problemMessage = null;
        if (handlerInfo.type === 'reference' && !_.isNumber(subResult)) {
            problemMessage = 'reference (integer) expected';
        }
        if (handlerInfo.type === 'object' && (!_.isObject(subResult) || _.isArray(subResult))) {
            problemMessage = 'object (non-array) expected';
        }
        if (handlerInfo.type === 'collection' && !_.isArray(subResult)) {
            problemMessage = 'list (array) expected';
        }
        if (problemMessage) {
            _.each(handlerInfo.inCollections, function () {
                problemMessage = 'list of ' + problemMessage.replace(/(?= )|$/, 's');
            });
            console.error('FlyingSquirrel: Wrong result type from resource handler ' + resource + ': ' + problemMessage);
        }
        return result;
    });
};
Server.prototype.fetch = function fetch(ref) {
    var store = {};
    var fetchResource = this.fetchResource.bind(this);
    return backendUtils.getRef(this.schema, ref, fetchResource, store).then(function() {
        return store;
    });
};

function Client (schema, getRefsCallback) {}

var FlyingSquirrel = {
    Server: Server,
    Client: Client,
    Ref: Ref,
}

describe('Flying Squirrel integration', function () {
    var schema = {
        topics: [{
            id: 123,
            name: 'Example topic',
            entries: [new Ref('entries')],
            openingEntry: new Ref('entries'),
            participants: [new Ref('users')],
            creator: new Ref('users'),
        }],
        entries: [{
            id: 123,
            text: 'Hello world',
            author: new Ref('users'),
        }],
        users: [{
            id: 123,
            name: 'Winnie Pooh',
            avatar: {
                url: 'http://example.com/pooh.jpg',
            }
        }],
    };

    it('works for Server', function (done) {

        // example handlers
        var dbResourceHandlers = {
            'topics': function (criteria) {
                // collection
                // Promise of [{id:12}, {id:14}, {id:15}, ...]
            },
            'topics.{}': function (topicIds) {
                // object in collection
                // Promise of [{id:14, name:'topic name', type:'review'}, ...]
            },
            'topics.{}.openingEntry': function (topicIds) {
                // reference
                // Promise of [123, ...]
                return [789];
            },
            'topics.{}.entries': function (topicIds) {
                // collection of references
                // Promise of [[123, 128, 131, 132, 133, 138], ...]
                // These numbers should be entry ids, usable with the 'entries.{}' resource.
            },
            'entries': function (criteria) {
                // collection of objects
                // Promise of [{id:123}, {id:131}, {id:133}, ...]
            },
            'entries.{}': function (entryIds) {
                // object in collection
                // Promise of [{id:123, text:'Hello world, this is my first post'}, ...]
            },
            'entries.{}.author': function (entryIds) {
                // reference
                // Promise of [1337, ...]
                return [1337];
            },
            'users': function (criteria) {
                // collection of objects
                // Promise of [{id:1234}, {id:1321}, {id:1330}, ...]
            },
            'users.{}': function (userIds) {
                // object in collection
                // Promise of [{id:1337, name:'James Bond'}, ...]
                return [{id:1337, name:'James Bond'}];
            },
        };

        var server = new FlyingSquirrel.Server(schema, dbResourceHandlers);
        server.fetch('topics.123.openingEntry.author').then(function (store) {
            expect(store.users[1337]).toEqual({id:1337, name:'James Bond'});
            done();
        });
    });
});
