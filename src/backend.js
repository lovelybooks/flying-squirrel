'use strict';

var _ = require('lodash');

var schemaUtils = require('./schemaUtils');

var backendUtils = {

    // writes the data to store and returns a new ref (if we are not finished yet) or null
    getRef: function getRef(schema, ref, getResource, store) {

        // TODO: REFACTOR THIS BIG UGLY FUNCTION
        // console.log('getRef', ref);

        console.assert(_.isObject(store));
        console.assert(_.isFunction(getResource));
        console.assert(schemaUtils.getTypeDeep(schema, ref) !== 'primitive');

        var path = ref.split('.');
        var callbackArgs = [];
        var newPath = [];
        var subSchema = schema;
        var subSchemaType = null;
        var prevSubSchemaType = null;
        var subStores = [store];
        var key;
        for (var i=0; i<path.length; i++) {
            // Going one level down in the schema tree.
            key = path[i];
            subSchema = schemaUtils.descendInSchema(schema, subSchema, key);
            prevSubSchemaType = subSchemaType;
            subSchemaType = schemaUtils.determineType(subSchema);

            // Handling collection items.
            if (prevSubSchemaType === 'collection') { // If yes, subSchema is a collection item.
                if (key === '*') {
                    // We want something for ALL the items in the collection.
                    if (subSchemaType === 'reference') {
                        // 1st return: All references from a collection
                        // --> resolving reference and replacing '*' with a list of ids
                        return getResource(newPath.join('.'), callbackArgs).then(function(result) {

                            console.assert(result.length === 1); // TODO: support deep stars *.*.*
                            var referencedIds = result[0];

                            // Result is a list of lists of referenecd ids, one per subStore.
                            subStores = _.map(subStores, function(subStore) {
                                console.assert(referencedIds);
                                _.each(referencedIds, function(referencedId, i) {
                                    subStore[i] = referencedId;
                                    return subStore;
                                });
                            });

                            var dereferencedPath = _.flatten([subSchema.ref, referencedIds.join(','), _.slice(path, i+1)]);
                            console.log('Resolving ref collection: ' + ref + ' → ' + dereferencedPath.join('.'));
                            return getRef(schema, dereferencedPath.join('.'), getResource, store);
                        }); // jshint ignore:line
                    } else {
                        // 2nd return: Objects referenced by '*'
                        // --> We get their ids and replace the '*' with a list of ids.
                        return getResource(newPath.join('.'), callbackArgs).then(function(referencedIds) {
                            _.each(referencedIds, function(referencedId) {
                                subStores = _.map(subStores, function(subStore) {
                                    subStore[referencedId] = {};
                                    return subStore;
                                });
                            });
                            var dereferencedPath = _.flatten([_.slice(path, 0, i), referencedIds.join(','), _.slice(path, i+1)]);
                            console.log('Resolving collection: ' + ref + ' → ' + dereferencedPath.join('.'));
                            return getRef(schema, dereferencedPath.join('.'), getResource, store);
                        }); // jshint ignore:line
                    }
                } else {
                    // We want something from inside the collection - let's continue.
                    newPath.push('{}');
                    callbackArgs.push(key.split(',')); // Oh yes, we can have many keys.
                }
            } else {
                newPath.push(key);
            }

            // Resolving reference.
            if (subSchemaType === 'reference') {
                // 3rd return: A single reference (which might be inside a '*')
                // --> resolving the reference (for all items in '*')
                return getResource(newPath.join('.'), callbackArgs).then(function(referencedIds) {
                    subStores = _.map(subStores, function(subStore, i) {
                        subStore[key] = referencedIds[i];
                        return subStore;
                    });
                    var dereferencedPath = _.flatten([subSchema.ref, referencedIds.join(','), _.slice(path, i+1)]);
                    console.log('Resolving ref: ' + ref + ' → ' + dereferencedPath.join('.'));
                    return getRef(schema, dereferencedPath.join('.'), getResource, store);
                }); // jshint ignore:line
            }

            // Updating subStores, if it's not the last element.
            if (i !== path.length - 1) {
                subStores = _.flatten(_.map(subStores, function(subStore) {
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

        // 4th return: Object referenced directly (so we got to the end of our path)
        // --> Fetching the object (or objects, if inside '*'). This is where the recursion ends.
        console.assert(subSchemaType === 'object');
        return getResource(newPath.join('.'), callbackArgs).then(function(results) {
            console.assert(key.split(',').length === results.length);
            _.each(subStores, function(subStore) {
                _.each(key.split(','), function (keyPart, i) {
                    subStore[keyPart] = results[i];
                });
            });
        });
    },
};

module.exports = backendUtils;
