# README for developers

If you'd like to contribute, please do so according to the rules in this document. Thank you!

## How to start developing

```bash
git clone <this repo url>
cd flying-squirrel/

npm install          # install the dependencies
npm test             # run the tests (notice the report)

npm run watch        # continuous testing for use during development
```

Look at the test report to get an overview of the code.
You can also treat the tests themselves as a documentation.

## Coding style

### Error handling

We divide the errors into two categories:

* Operational errors, which are the result of the circumstances faced by a correct program.
* Programmer errors (bugs), which are errors of the humans that wrote the code.

Operational errors should be signaled by rejecting the promise with a relevant message,
or, if the function is synchronuous, the exception should be thrown.

Programmer errors should be never handled. If a programmer error occurs, the program should
crash with a stack trace. There could be also a message to report the bug in
[the project's issue tracker](https://github.com/mik01aj/flying-squirrel/issues).

For more details, refer to
[the Node.js guide to error handling](https://www.joyent.com/developers/node/design/errors).

### Committing

Before you commit, check that your code passes tests by running `npm test`.
If you added any new code, please add tests for it, or even better:
[write your tests *before* you write the code](http://en.wikipedia.org/wiki/Test-driven_development)
