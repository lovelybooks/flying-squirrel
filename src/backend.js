'use strict';

var _ = require('lodash');

var Ref = require('./Ref');
var schemaUtils = require('./schemaUtils');

var backendUtils = {

    // writes the data to store and returns a new ref (if we are not finished yet) or null
    getRef: function getRef(schema, ref, getResource, store) {
        console.assert(_.isObject(store));
        console.assert(_.isFunction(getResource));
        console.assert(schemaUtils.getTypeDeep(schema, ref) !== 'primitive');

        var path = ref.split('.');
        var subSchema = schema;
        var callbackArgs = [];
        var newPath = [];
        var subSchemaType = null;
        var subStore = store;
        var key;
        for (var i=0; i<path.length; i++) {
            key = path[i];
            subSchema = schemaUtils.descendInSchema(schema, subSchema, key);

            // Handling collection items.
            if (subSchemaType === 'collection') { // collection item!
                newPath.push('{}');
                callbackArgs.push([key]); // TODO list handling somewhere else
            } else {
                newPath.push(key);
            }

            // Resolving reference.
            subSchemaType = schemaUtils.determineType(subSchema);
            if (subSchemaType === 'reference') {
                return getResource(newPath.join('.'), callbackArgs).then(function(referencedIds) {
                    var referencedId = referencedIds[0];
                    subStore[key] = referencedId;
                    var dereferencedPath = _.flatten([subSchema.ref, referencedId, _.slice(path, i+1)]);
                    // console.log('Resolving ref: ' + ref + ' → ' + dereferencedPath.join('.'));
                    return getRef(schema, dereferencedPath.join('.'), getResource, store);
                }); // jshint ignore:line
            }

            // Updating subStore.
            if (i !== path.length - 1) {
                if (!subStore[key]) {
                    subStore[key] = {};
                }
                subStore = subStore[key];
                console.assert(_.isObject(subStore));
            }
        }

        // Fetching something from collection
        return getResource(newPath.join('.'), callbackArgs).then(function(xs) {
            subStore[key] = xs[0];
        });
    },

    createDbBackend: function createDbBackend(schema, getRef) {
        console.assert(_.isFunction(getRef));
        var prefix = '/?refs=';
        var store = {};
        return {
            get: function(path) {
                console.assert(_.startsWith(path, prefix), 'Invalid path: ' + path);
                var refs = path.substring(prefix.length).split(',');
                return Promise.all(_.map(refs, function (ref) {
                    return getRef(schema, ref, store);
                })).then(function () {
                    return store;
                });
            },
        };
    },
};

module.exports = backendUtils;
