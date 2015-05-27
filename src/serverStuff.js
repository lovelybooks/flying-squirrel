'use strict';

var _ = require('lodash');

var schemaUtils = require('./schemaUtils');

// TODO: this code can be greatly simplified if we would end ust with the first resolved ref.
// This way, store logic could be re-used to handle the reference raversal.

function fetchRef(schema, ref, getResource, store) {

    console.assert(_.isObject(store));
    console.assert(_.isFunction(getResource));

    var path = ref.split('.');
    var callbackArgs = [];
    var resourcePath = [];
    var subSchema = schema;
    var subSchemaType = null;
    var prevSubSchemaType = null;
    var subStores = [store];

    if (schemaUtils.getTypeDeep(schema, ref) === 'collection') {
        throw 'This ref is a collection. Did you mean "' + ref + '.*" ?';
    }
    if (schemaUtils.getTypeDeep(schema, ref) === 'primitive') {
        throw 'This ref is a primitive. Did you mean "' + _.dropRight(path).join('.') + '" ?';
    }

    function getResourceForCurrentPath() {
        var promise = getResource(resourcePath.join('.'), callbackArgs).then(function (result) {
            console.assert(result, 'Resource ' + resourcePath.join('.') + ' returned no data');
            return result;
        });
        console.assert(_.isFunction(promise.then), 'getResource didn\'t return a Promise');
        return promise;
    }

    for (var pathIndex = 0; pathIndex < path.length; pathIndex++) {
        // Going one level down in the schema tree.
        var key = path[pathIndex];
        subSchema = schemaUtils.descendInSchema(schema, subSchema, key);
        prevSubSchemaType = subSchemaType;
        subSchemaType = schemaUtils.determineType(subSchema);

        // Handling stars: 'collection.*' resolves to a new ref like 'collection.2,3,5'
        if (prevSubSchemaType === 'collection' && key === '*') {
            callbackArgs.push({}); // The search criteria.
            return getResourceForCurrentPath().then(function(result) {
                var referencedIds, newCollectionRef;

                if (subSchemaType === 'reference') {
                    // We fetch all references from a collection

                    // Result is a list of lists of referenecd ids, one list per subStore.
                    // But currently we support querying only one collection at a time.
                    console.assert(result.length === 1, 'Nested collections not supported'); // TODO
                    referencedIds = result[0];
                    console.assert(referencedIds);

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

                // Saving the keys
                _.each(subStores, function(subStore) {
                    subStore.__keys = _.map(referencedIds, function (id) {
                        return '' + id; // converting all keys to strings
                    });
                });

                if (referencedIds.length === 0) {
                    return store; // The collection is empty - we end the recursion.
                }

                var newRef = _.flatten([
                    newCollectionRef, referencedIds.join(','), _.slice(path, pathIndex+1)
                ]).join('.');
                // console.log('Resolving star: ' + ref + ' → ' + newRef); // TODO: make output configurable
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
                referencedIds = _.compact(_.unique(referencedIds)); // Stripping nulls and dupes.
                if (referencedIds.length === 0) {
                    // All our fetched references were nulls, so we don't follow te reference.
                    return store; // Ending recursion.
                }
                var newRef = _.flatten([
                    subSchema.ref, referencedIds.join(','), _.slice(path, pathIndex+1)
                ]).join('.');
                // console.log('Resolving ref: ' + ref + ' → ' + newRef); // TODO: make output configurable
                return fetchRef(schema, newRef, getResource, store);
            }); // jshint ignore:line
        }

        if (pathIndex === path.length - 1) {
            // It's the end of our path and it's not a star, not a ref - we fetch object(s)
            // referenced directly. This is where the recursion ends.
            console.assert(subSchemaType === 'object');
            return getResourceForCurrentPath().then(function(results) {
                console.assert(key.split(',').length === results.length, 'Invalid result count');
                _.each(subStores, function(subStore) {
                    _.each(key.split(','), function (keyPart, i) {
                        if (results[i] && results[i].id && results[i].id != keyPart) { // jshint ignore:line
                            // NOTE: this is wrapped in an if, to avoid exception when accessing results[i].id
                            console.assert(false, 'invalid id: expected ' + keyPart + ', got ' + results[i].id);
                        }
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

function batchArgs(arrayOfArgArrays, handlerInfo) {
    console.assert(_.isArray(arrayOfArgArrays[0]));
    console.assert(_.isObject(handlerInfo));

    // TODO: make this more generic

    if (handlerInfo.inCollections.length === 1 && handlerInfo.args.length === 1) { // special, but common, case
        var firstArgsFromEachArray = _.map(arrayOfArgArrays, '0');
        var allIds = _.unique(_.flatten(firstArgsFromEachArray));
        console.assert(!_.isArray(allIds[0])); // It should be a list of ids.
        var newArgs = [allIds];
        // console.log('Batched: ' + JSON.stringify(arrayOfArgArrays) + ' ------> ' + JSON.stringify(newArgs));
        return {
            arrayOfArgArrays: [newArgs],
            getIndividualResult: function (result, args) {
                console.assert(_.isArray(result) && result.length === 1);
                return _.map(args[0], function (id) {
                    var indexInResult = _.findKey(allIds, function (id2) { return id2 === id; });
                    return result[0][indexInResult]; // We take it from the result of the first call
                });
            },
        };
    } else {
        // Some other resource - we don't batch anything.
        // TODO: we could remove duplicated arg sets
        return {
            arrayOfArgArrays: arrayOfArgArrays,
            getIndividualResult: function (result, args) {
                console.assert(_.isArray(result) && result.length === arrayOfArgArrays.length);
                var indexInResult = _.findKey(arrayOfArgArrays, args);
                return result[indexInResult];
            },
        };
    }
}

var serverStuff = {

    // writes the data to store and returns a new ref (if we are not finished yet) or null
    fetchRef: fetchRef,

    batchArgs: batchArgs,
};

module.exports = serverStuff;
