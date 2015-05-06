# Flying Squirrel

![](logo.png)

Squirrel is a client-server library for fetching relational data. In most common scenario the client would run in browser and request the data in a HTTP request, and the server would get the data from some data source like a database, a search engine, or static files. Squirrel is responsible for managing the data store, i.e. making sure that we don’t fetch the same data many times, and that we fetch the data we need avoiding the common pitfalls, like too many HTTP requests, fetching more data than needed or having lots of inconsistent GET endpoints.

Usage in frontend looks like this:

    squirrelClient.IO(function (data) {
        var topic = data.topics.get(123);
        return topic.name + ', started by ' + topic.openingEntry.author.name + ' on ' + topic.openingEntry.createdAt;
    }).then(function (result) {
        // So in the meanwhile there was a request for topic.123 and topic.123.openingEntry.author
        console.log('Hey look! ' + result);
    });

**IMPORTANT: This project is in an early development stage.** The point of publishing it now is to
gain some attention from people that could potentially participate in the project.
If you're just looking for a library for handling fetching data via HTTP for your new shiny web
app, beware - this one is not stable yet.

## How you can contribute

* Just download it and try to use it. Report any issues you have.
* spread the word on facebook, twitter or your company.
* write some documentation with pictures (most likely I'll do it soon)
* write more tests for edge cases
* I'd love to have some nicer logo than the current one :)

## Quick start - how to use it:

NOTE: this will, hopefully, get simpler. Stay tuned :)

First, define your schema (i.e. your tree structure) with some example data:

    var schema = {
        topics: [{
            id: 123,
            name: 'Example topic',
            entries: [new FlyingSquirrel.Ref('entries')],
            openingEntry: new FlyingSquirrel.Ref('entries'),
        }],
        entries: [{
            id: 123,
            text: 'Hello world',
            author: new FlyingSquirrel.Ref('users'),
        }],
        users: [{
            id: 123,
            name: 'Winnie Pooh',
            avatar: 'http://example.com/pooh.jpg',
        }],
    };

on the server side (Node.js), do:

    var squirrel = require('flying-squirrel');
    var resourceHandlers = {};
    var squirrelServer = new squirrel.Server(schema, resourceHandlers);

    // and configure the API endpoint to call squirrelServer.fetch(ref) for each received ref

And on the client side (in the browser code):

    var getRefsCallback = function(refs) {
        // do the http request and return a promise of the response data
    };
    var client = new FlyingSquirrel.Client(schema, getRefsCallback);

## The schema and refs

The schema you give to Squirrel defines your data tree (on which the squirrel will jump). This tree is built out of 4 types of building blocks (in the code they are called “ref types”):
* **primitives** (like strings or numbers),
* **objects** (as in json: they have string keys and values of any type),
* **collections** (which have string keys too, but can be fetched only partially and queried in interesting ways),
* **references** (to an object inside a collection anywhere else in the tree).

## How to start developing

    git clone <this repo url>
    cd flying-squirrel/

    npm install          # install the dependencies
    npm test             # run the tests (notice the report)

    npm run watch        # continuous testing for use during development

Look at the test report to get an overview of the code.
You can also treat the tests themselves as a documentation.
