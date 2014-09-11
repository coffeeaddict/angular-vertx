/*
 * angular-vertx
 * https://github.com/coffeeaddict/angular-vertx
 *
 * Copyright (c) 2014 Hartog C. de Mik
 * Licensed under the MIT license.
 */

'use strict';

/**
 * @ngdoc service
 * @name coreApp.vertxBus
 * @description
 * # vertxBus
 * Provider in the coreApp.
 */
var vertxModule = angular.module('vertx', ['ng'])
  .provider('vertxBus', function () {
    var busLocation = 'http://localhost:8080/eventbus',
        eb;

    this.setBusLocation = function(location) {
      busLocation = location;
    };


    this.$get = function($q, $rootScope) {
      var waitUntilOpen = function(retries, execute, d) {
        if ( --retries <= 0 ) {
          d.reject('Bus did not open timely');

        } else {
          if ( eb.readyState() === vertx.EventBus.CLOSED ) {
            api.connect(execute);

          } else if (eb.readyState() === vertx.EventBus.OPEN) {
            execute();

          } else {
            setTimeout(function() { waitUntilOpen(retries, execute); }, 200);
          }
        }
      };

      var waitUntilClosed = function(retries, execute, d) {
        if ( --retries <= 0 ) {
          d.reject('Bus did not close properly');

        } else {
          if ( eb.readyState() === vertx.EventBus.CLOSED ) {
            api.connect(execute);

          } else if (eb.readyState() === vertx.EventBus.OPEN) {
            execute();

          } else {
            setTimeout(function() { waitUntilOpen(retries, execute); }, 200);
          }
        }
      };

      // Public API here
      var api = {
        /** (Re-)Opens the eventbus
         *
         * @param {boolean} reUse - Re-use an already opened connection?
         * @returns A promise, for chaining.
         *
         */
        connect: function(onopen) {
          var api = this;

          if ( eb !== undefined ) {
            eb.onclose = function() {
              eb = undefined;
              api.connect(onopen);
            };

            try {
              eb.close();
            } catch(e) {
              // i do not care the closing did not succeed
            }

            return;
          }

          eb = new vertx.EventBus(busLocation);
          eb.onopen = onopen;
        },

        /** Send a message on the eventBus
         *
         * @param {string} address - The address to send to, eg: 'test.ping'
         * @param {object} msg - The message to send. Any JS object will do.
         *
         * @returns A promise, which resolves with the reply.
         *
         */
        send: function(address, msg) {
          var d = $q.defer(),
              execute = function() { api._send(address, msg, d); },
              retries = 10;

          if ( eb === undefined ) {
            api.connect(execute);

          } else if ( eb.readyState() === vertx.EventBus.CLOSED ) {
            api.connect(execute);

          } else if ( eb.readyState() === vertx.EventBus.CLOSING ) {
            // wait until closed
            setTimeout(function() {
              waitUntilClosed(retries, execute, d);
            }, 200);

          } else if ( eb.readyState() === vertx.EventBus.CONNECTING ) {
            // wait until open
            setTimeout(function() {
              waitUntilOpen(retries, execute, d);
            }, 200);

          } else {
            execute();

          }

          return d.promise;
        },

        _send: function(address, msg, d) {
          eb.send(address, msg, function(reply) {
            d.resolve(reply);
            $rootScope.$apply();
          });
        }
      };

      return api;
    };
  });


exports.angularVertx = function() {
  return vertxModule;
};
