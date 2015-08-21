# Flying Squirrel

![](logo.png)

Squirrel is a data fetching library which is smart enough to figure out which pieces of data should be fetched for your frontend components. Just write your code as if you already have the data fetched, without cluttering your component code with handling async responses or checking if the data wasn't already fetched somewhere else.

More technically, squirrel is a client-server library for fetching relational data. In most common scenario the client would run in browser and request the data in a HTTP request, and the server would get the data from some data source like a database, a search engine, or static files. Squirrel is responsible for managing the data store, i.e. making sure that we don’t fetch the same data many times, and that we fetch the data we need avoiding the common pitfalls, like too many HTTP requests, fetching more data than needed or having lots of inconsistent GET endpoints.

Squirrel was developed in [HGV Publishing Services](http://www.hgv-online.de/) for use on the
[LovelyBooks](http://www.lovelybooks.de/) platform. We're proud to announce our first open source project :) :octocat:

I talked about it on
[FT 2015](2015.front-trends.com/) conference, you can
[watch the talk about how it solves the data fetching problem](https://www.youtube.com/watch?v=uJg6jm5BzPs).

After it's configured, example usage in frontend looks like this:

```js
squirrelClient.IO(function (data) {
    var topic = data.topics.get(123);
    return topic.name + ', started by ' + topic.openingEntry.author.name + ' on ' + topic.openingEntry.createdAt;
}).then(function (result) {
    // So in the meanwhile there was a request for topic.123 and topic.123.openingEntry.author
    console.log('Hey look! ' + result);
});
```

## IMPORTANT: This project is in an early development stage.

The point of publishing it now is to
gain some attention from people that could potentially participate in the project.
If you're just looking for a library for handling fetching data via HTTP for your new shiny web
app, **beware** - this one is **not stable** yet. The APIs are likely to change before `1.0`,
the first stable version.


## Quick start - how to use it:

You can install the library with:

```bash
npm install --save git+ssh://git@github.com:lovelybooks/flying-squirrel.git
```

Then, in your JS, define your tree structure (schema) with some example data:

```js
var squirrel = require('flying-squirrel');
var schema = {
    topics: [{
        id: 123,
        name: 'Example topic',
        entries: [new squirrel.Ref('entries')],
        openingEntry: new squirrel.Ref('entries'),
    }],
    entries: [{
        id: 123,
        text: 'Hello world',
        author: new squirrel.Ref('users'),
    }],
    users: [{
        id: 123,
        name: 'Winnie Pooh',
        avatar: 'http://example.com/pooh.jpg',
    }],
};
```

This schema will be used by both the client and the server. It determines the resource handler
list for the server and lets the client know what operations are allowed in callbacks. For more
details about the schema structure, see below.

Then, on the server side (Node.js), do:

```js
var squirrel = require('flying-squirrel');
var schema = require('./my-squirrel-schema');
var resourceHandlers = {
    // your handlers for data will go here
};
var squirrelServer = new squirrel.Server(schema, resourceHandlers);

// and configure the API endpoint to call squirrelServer.fetch(ref) for each received ref
```

When you first run it, you'll get some informative error messages about what endpoints
you need to add.

And on the client side (in the browser code):

```js
var squirrel = require('flying-squirrel');
var schema = require('./my-squirrel-schema');
var getRefsCallback = function(refs) {
    // do the http request and return a promise of the response data
};
var client = new squirrel.Client(schema, getRefsCallback);
```

This should be enough. Now you should be able to use squirrel like in the example on the top.


# API documentation (mostly TODO)

## Server

* `new Server (schema, resourceHandlers)`
* `fetch`
* `fetchResource`
* `fetchResourceDirectly`
* `prepareBatcherForResource`


## Client

* `IO(callback)`
* `getDataForDynamicIO(onDataRequested, onDataFetched)` (new!)
* `configure` (TODO)


## More about the schema and refs

The schema you give to Squirrel determines the structure of your data tree
(on which the squirrel will jump). This tree is built out of 4 types of building blocks:

* **primitives** (like strings or numbers),
* **objects** (as in json: they have string keys and values of any type),
* **collections** (which have string keys too, but can be fetched only partially and queried in interesting ways),
* **references** (to an object inside a collection anywhere else in the tree).

For example, in the above schema `topics` is a collection, `topics.123` is an object,
`topics.123.name` is a primitive and `topics.123.openingEntry` is a reference.
`topics.123.openingEntry.text` would resolve to `entries.456.text`, which is a primitive.

These 4 types are called “ref types” in the code, and "reference" is one of these "ref types".
(Yes, it would be a good idea to change this misleading "ref" name, but for now it is as it is.)


## More about client IO()

The `IO()` function may seem magical (how does it know what data to fetch?), but in fact
there's no magic there. When you call `IO(function callback(data) {...})`:

* The `callback` is called with the mock data, generated from schema. This mock (a.k.a. `Interceptor`) also tracks the accessed fields and references, so after the callback finishes (or throws), the `IO` function has a list of all the fields that the function tried to access.
* If there were no data requests, `IO()` returns the result (synchronously) and finishes execution.
* `IO()` returns a promise of the result. This promise will later resolve to the return value of `callback`.
* The client's `getRefsCallback` is called, thus telling the server "give me these refs".
* The server calls its relevant `resourceHandlers`, attempting to do it in an optimal way (i.e. to call each handler at most once)
* The server returns a response, which contains a JSON object with the requested data in the structure defined by schema.
* `IO()` receives the response and stores the data in its store.
* `IO()` calls the `callback`, using the real data from store. If the callback tries to access some data we don't have in the store, these refs will be saved, a new request will be made, and the cycle will repeat. In most cases, however, the callback will finish successfully, returning some value.
* The mock gets locked to prevent bugs. If some async callback tries to access the data outside of the `IO`'s `callback`, an error will be thrown.
* The promise returned initially by `IO()` is resolved with the value returned by callback.

The `store` used by client is an ordinary JSON object. You can easily save it to `localStorage`,
or embed it in your js to speed up the first loading. You can also mock it for unit tests.


# How to use squirrel with React

See [this gist](https://gist.github.com/mik01aj/b4f3a7ffbd1d6df71eee) for an example simple wrapper.

The point is, that your components shouldn't know they use some magic models from some library. They should just use the data as if it was plain JSON. In the example below, the `Entry` component doesn't need to know anything about squirrel (well, except `get` and `getAll` for collections). This way you can easily make unit tests or demos of your components.

```jsx
var MyEntryComponentWithMagicDataFetching = React.createClass({
    propTypes: {
        entryId: React.PropTypes.number.isRequired,
    },
    render: function () {
        var that = this;
        return <SquirrelWrapper render={ function (data) {
            return <Entry entry={ data.entries.get(that.props.entryId) } />;
        } } />;
    },
});
```

# TODO (aka project roadmap)

* Add support for querying collections.
* Let client invalidate some parts of the store easily
* Separate the debug utilities from the core code (and make them optional)
* Refactor the tests to stop using the buggy Jasmine clock
* Think about an abstraction for handling write operations
* Nice interactive demo page


# How you can contribute

* Just download it and try to use it. Report any issues you have.
* spread the word on facebook, twitter or your company.
* write some documentation with pictures (most likely I'll do it soon)
* write more tests for edge cases
* I'd love to have some nicer logo than the current one :)

**If you'd like to help develop squirrel, please refer to [CONTRIBUTING.md](CONTRIBUTING.md)**


# License

[MIT](LICENSE.txt).
