# angular-vertx [![Build Status](https://secure.travis-ci.org/coffeeaddict/angular-vertx.png?branch=master)](http://travis-ci.org/coffeeaddict/angular-vertx)

A simple Vert.x event bus integration for AngularJS

## Getting Started

Install the module with: `bower install angular-vertx --save`

Add it to your apps dependencies

```javascript
angular.module('myApp', [
  // ...
  'vertx',
]);
```

and use it in your services

```javascript
angular.module('myApp')
  .factory('users', [
    'vertxBus',
    function(vertxBus) {
      return {
        create: function(details) {
          return vertxBus.send('my.users.service', { action: 'create', user: details });
        }
      };
    }]);
```

## Documentation

_(Coming soon)_

## Examples

_(Coming soon)_

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Release History

_(Nothing yet)_

## License
Copyright (c) 2014 Hartog C. de Mik, see the LICENSE file for details.
