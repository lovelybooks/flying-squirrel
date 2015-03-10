'use strict';

var _ = require('lodash');

var schemaUtils = require('./schemaUtils');

function fetchRef(schema, ref, getResource, store) {

    console.assert(_.isObject(store));
    console.assert(_.isFunction(getResource));
    console.assert(schemaUtils.getTypeDeep(schema, ref) !== 'primitive');

    var path = ref.split('.');
    var callbackArgs = [];
    var resourcePath = [];
    var subSchema = schema;
    var subSchemaType = null;
    var prevSubSchemaType = null;
    var subStores = [store];

    function getResourceForCurrentPath() {
        return getResource(resourcePath.join('.'), callbackArgs);
    }

    for (var pathIndex = 0; pathIndex < path.length; pathIndex++) {
        // Going one level down in the schema tree.
        var key = path[pathIndex];
        subSchema = schemaUtils.descendInSchema(schema, subSchema, key);
        prevSubSchemaType = subSchemaType;
        subSchemaType = schemaUtils.determineType(subSchema);

        // Handling stars: 'collection.*' resolves to a new ref like 'collection.2,3,5'
        if (prevSubSchemaType === 'collection' && key === '*') {
            return getResourceForCurrentPath().then(function(result) {
                var referencedIds, newCollectionRef;

                if (subSchemaType === 'reference') {
                    // We fetch all references from a collection

                    console.assert(result.length === 1); // TODO: support collection.*.nested.*
                    referencedIds = result[0];
                    console.assert(referencedIds);

                    // Result is a list of lists of referenecd ids, one list per subStore.
                    _.each(subStores, function(subStore) {
                        // subStore will become an object with array-like structure
                        _.assign(subStore, referencedIds);
                    });

                    newCollectionRef = subSchema.ref; // By the way: we resolve the reference
                } else {
                    // We fetch ids of all objects from the collection.

                    referencedIds = result;
                    newCollectionRef = _.slice(path, 0, pathIndex).join('.');
                }
                var newRef = _.flatten([
                    newCollectionRef, referencedIds.join(','), _.slice(path, pathIndex+1)
                ]).join('.');
                console.log('Resolving star: ' + ref + ' → ' + newRef);
                return fetchRef(schema, newRef, getResource, store);
            }); // jshint ignore:line
        }

        if (prevSubSchemaType === 'collection') {
            // We fetch stuff for some specific key(s) from the collection - let's continue.
            resourcePath.push('{}');
            callbackArgs.push(key.split(',')); // Oh yes, we can have many keys.
        } else {
            resourcePath.push(key);
        }

        // Fetching and resolving a single reference (which might be inside a '*')
        if (subSchemaType === 'reference') {
            return getResourceForCurrentPath().then(function(referencedIds) {
                _.each(subStores, function(subStore, i) {
                    subStore[key] = referencedIds[i];
                });
                var newRef = _.flatten([
                    subSchema.ref, referencedIds.join(','), _.slice(path, pathIndex+1)
                ]).join('.');
                console.log('Resolving ref: ' + ref + ' → ' + newRef);
                return fetchRef(schema, newRef, getResource, store);
            }); // jshint ignore:line
        }

        if (pathIndex === path.length - 1) {
            // It's the end of our path and it's not a star, not a ref - we fetch object(s)
            // referenced directly. This is where the recursion ends.
            console.assert(subSchemaType === 'object');
            return getResourceForCurrentPath().then(function(results) {
                console.assert(key.split(',').length === results.length);
                _.each(subStores, function(subStore) {
                    _.each(key.split(','), function (keyPart, i) {
                        console.assert(!results[i].id || results[i].id == keyPart, // jshint ignore:line
                                'invalid id: expected ' + keyPart + ', got ' + results[i].id);
                        subStore[keyPart] = results[i];
                    });
                });
                return store; // No more recursion
            }); // jshint ignore:line
        }

        // Updating subStores (if it's not the last element).
        subStores = _.flatten(_.map(subStores, function(subStore) {
            // NOTE: that's where the subStores multiplicate.
            return _.map(key.split(','), function(keyPart) {
                if (!subStore[keyPart]) {
                    subStore[keyPart] = {};
                }
                return subStore[keyPart];
            });
        })); // jshint ignore:line
        console.assert(_.all(subStores, _.isObject));
    }

}

var backendUtils = {

    // writes the data to store and returns a new ref (if we are not finished yet) or null
    fetchRef: fetchRef,
};

module.exports = backendUtils;
