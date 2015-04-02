/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('./Ref');
var determineType = require('./schemaUtils').determineType;

// A constructor for our objects (this name will show up in the debugger)
function Interceptor() {}

function createInterceptor(schema, store, newRefCallback) {
    console.assert(_.isObject(schema));
    console.assert(_.isObject(store));
    console.assert(_.isFunction(newRefCallback));

    function createSubInterceptorForReference(subSchema, subStore, path) {
        console.assert(subSchema instanceof Ref);
        console.assert(!subStore || _.isNumber(subStore) || _.isString(subStore));
        return returnValueForGetter(
            subSchema.get(schema)[0], // UGLY
            // TODO: write test for traversing to entries.123 when store.entries is undefined
            subStore ? (subSchema.get(store) || {})[subStore] : undefined,
            path
        );
    }

    function createSubInterceptorForCollection(subSchema, subStore, path) {
        console.assert(_.isArray(subSchema));
        console.assert(subSchema.length === 1);
        var collectionObj = {
            keys: function () {
                if (_.isObject(subStore)) {
                    return _.keys(subStore); // Note this works for both objects and arrays.
                } else {
                    // TODO: This causes a conflict between fetching data by keys and then calling
                    // getAll() - it will return only the already-fetched keys and not try to
                    // discover more.
                    console.warn('FlyingSquirrel bug: the collection ' + path + ' might not be complete');
                    newRefCallback(path + '.*', subSchema[0]);
                    return ['*']; // hacky: the getter on this key should return item from schema
                }
            },
            getAll: function() {
                return _.map(this.keys(), this.get.bind(this));
            },
            get: function(id) {
                if (id == null) {
                    throw new Error(id + ' id requested in ' + path);
                }
                return returnValueForGetter(
                    subSchema[0],
                    _.isObject(subStore) ? subStore[id] : undefined,
                    path + '.' + id
                );
            },
            toJSON: function() {
                var keys = this.keys();
                return JSON.stringify(_.zipObject(keys, _.map(keys, this.get.bind(this))));
            },
        };
        Object.defineProperty(collectionObj, 'length', {
            get: function () {
                throw new Error(path + '.length is not supported, use ' + path + '.getAll().length instead.');
            },
        });
        return collectionObj;
    }

    function createSubInterceptorForObject(subSchema, subStore, path) {
        if (path) {
            path += '.';
        } else {
            path = ''; // Special case for the root path.
        }
        var subInterceptor = new Interceptor();
        _.each(_.keys(subSchema), function (fieldName) {

            // Putting primitives directly to object. This way JSON.stringify may work.
            if (_.has(subStore, fieldName) && determineType(subSchema[fieldName]) === 'primitive') {
                subInterceptor[fieldName] = subStore[fieldName];
                return;
            }

            // For each field in subInterceptor, we define a getter that calls the newRefCallback
            // whenever we need to use data from schema (i.e. we don't have the data in the store).
            Object.defineProperty(subInterceptor, fieldName, {
                get: function () {
                    return returnValueForGetter(
                        subSchema[fieldName],
                        subStore && subStore[fieldName],
                        path + fieldName
                    );
                },
            });
        });
        return subInterceptor;
    }

    function returnValueForGetter(valueFromSchema, valueFromStore, path) {
        if (_.isUndefined(valueFromStore)) {
            // If we don't have a valueFromStore, we'll need to get it.
            newRefCallback(path, valueFromSchema);
        }

        var type = determineType(valueFromSchema);
        if (type === 'reference') {
            if (valueFromStore === null) {
                return null;
            }
            return createSubInterceptorForReference(valueFromSchema, valueFromStore, path);
        } else if (type === 'collection') {
            return createSubInterceptorForCollection(valueFromSchema, valueFromStore, path);
        } else if (type === 'object') {
            return createSubInterceptorForObject(valueFromSchema, valueFromStore, path);
        } else {
            return valueFromStore || valueFromSchema; // primitive value
        }
    }

    return createSubInterceptorForObject(schema, store, null);
}

module.exports = createInterceptor;
