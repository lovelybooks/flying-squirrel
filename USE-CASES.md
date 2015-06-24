# Normal usage in some JS code

```js
squirrelClient.IO(function (data) {
    var topic = data.topics.get(123);
    return topic.name + ', started by ' + topic.openingEntry.author.name + ' on ' + topic.openingEntry.createdAt;
}).then(function (result) {
    // So in the meanwhile there was a request for topic.123 and topic.123.openingEntry.author
    console.log('Hey look! ' + result);
});
```

# Usage in a React component (rendered in browser)

So we write the code as if it was a normal object

```js
var MyComponent = React.createClass({
    render: function () {
        return <div>
            <Avatar user={ this.props.user } size={ 15 } />
            { this.props.user.name }
        </div>;
    },
});
```

And then activate the squirrel magic with:

```js
var squirrelClient = new squirrel.Client({
    fetchRefsCallback: function () {
        // ...
    },
});

// this logic could be refactored to some SquirrelLoadingFeedbackWrapper
var SomeBigPartOfThePage = React.createClass({
    getInitialState: function () { return (); },
    componentWillMount: function () {
        this.squirrelData = squirrelClient.getDataForDynamicIO(
            this.setState.bind(this, {loading: true}),
            this.setState.bind(this, {loading: false})
        );
    },
    render: function () {
        return <div className={ this.state.loading && 'loading' }>
            <MyComponent user={ this.squirrelData.users.get(1337) } />
        </div>;
    },
});
```

The reponsibility of `SquirrelLoadingFeedbackWrapper` would be watching the `squirrelClient`,
freezing the component during loading and providing visual feedback for the loading process.
And, importantly: re-rendering the child component whenever squirrel reports any new data.


# Writing unit-tests for the React components, or providing usage examples for the style guide

Super-simple. Just use JSON data. This is possible because all the small components
(building blocks) have no idea that Squirrel even exists. Caveat: you can't do it for components
like `SomeBigPartOfThePage` above.

The mock object would be something like:

```js
{
    topics: {getAll: function () { return [{
        id: 123
        title: "Hello",
        entries: {getAll: function () { return [{
            id: 1,
            text: "Ahoi",
            author: {
                id: 1337,
                name: 'Captain Hook',
            }
        }, {
            id: 2,
            text: "This is my second entry",
            author: {
                id: 1337,
                name: 'Captain Hook',
            }
        }]; }}
    }]; }}
}
```

(Btw, maybe the repeated `{getAll: function () { return [` part could be refactored to some
`mockCollection` util function.)

And... if your component queries collections, you'll have to implement `getAll`, this kinda sucks.

You could also create a `Client` that would use a mocked store + mock from the schema.
All the data should be delivered synchronously then.
This options looks more scalable.


# Server-side rendering of React components

```js
squirrelClient.IO(function (data) {
    return React.renderToString(<MyComponent user={ data.users.get(1337) } />);
});
```
