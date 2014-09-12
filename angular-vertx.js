/*
 *   Copyright (c) 2011-2013 The original author or authors
 *   ------------------------------------------------------
 *   All rights reserved. This program and the accompanying materials
 *   are made available under the terms of the Eclipse Public License v1.0
 *   and Apache License v2.0 which accompanies this distribution.
 *
 *       The Eclipse Public License is available at
 *       http://www.eclipse.org/legal/epl-v10.html
 *
 *       The Apache License v2.0 is available at
 *       http://www.opensource.org/licenses/apache2.0.php
 *
 *   You may elect to redistribute this code under either of these licenses.
 */

var vertx = vertx || {};

var sockJsFactory = function(factory) {
  if (typeof define === "function" && define.amd) {
    // Expose as an AMD module with SockJS dependency.
    // "vertxbus" and "sockjs" names are used because
    // AMD module names are derived from file names.
    define("vertxbus", ["sockjs"], factory);
  } else {
    // No AMD-compliant loader
    factory(SockJS);
  }
};

sockJsFactory(function(SockJS) {
  vertx.EventBus = function(url, options) {

    var that = this;
    var sockJSConn = new SockJS(url, undefined, options);
    var handlerMap = {};
    var replyHandlers = {};
    var state = vertx.EventBus.CONNECTING;
    var pingTimerID = null;
    var pingInterval = null;
    var authAddress = null;

    if (options) {
      pingInterval = options['vertxbus_ping_interval'];
      authAddress = options['vertxbus_auth_manager'];
    }

    if (!pingInterval) { pingInterval = 5000; }
    if (!authAddress) { authAddress = 'vertx.basicauthmanager'; }

    that.onopen = null;
    that.onclose = null;

    that.login = function(username, password, replyHandler) {
      sendOrPub("send", authAddress + '.login', {username: username, password: password}, function(reply) {
        if (reply.status === 'ok') {
          that.sessionID = reply.sessionID;
        }
        if (replyHandler) {
          delete reply.sessionID;
          replyHandler(reply);
        }
      });
    };

    that.send = function(address, message, replyHandler) {
      sendOrPub("send", address, message, replyHandler);
    };

    that.publish = function(address, message) {
      sendOrPub("publish", address, message, null);
    };

    that.registerHandler = function(address, handler) {
      checkSpecified("address", 'string', address);
      checkSpecified("handler", 'function', handler);
      checkOpen();
      var handlers = handlerMap[address];
      if (!handlers) {
        handlers = [handler];
        handlerMap[address] = handlers;
        // First handler for this address so we should register the connection
        var msg = { type : "register",
                    address: address };
        sockJSConn.send(JSON.stringify(msg));
      } else {
        handlers[handlers.length] = handler;
      }
    };

    that.unregisterHandler = function(address, handler) {
      checkSpecified("address", 'string', address);
      checkSpecified("handler", 'function', handler);
      checkOpen();
      var handlers = handlerMap[address];
      if (handlers) {
        var idx = handlers.indexOf(handler);
        if (idx !== -1) { handlers.splice(idx, 1); }
        if (handlers.length === 0) {
          // No more local handlers so we should unregister the connection

          var msg = { type : "unregister",
                      address: address };
          sockJSConn.send(JSON.stringify(msg));
          delete handlerMap[address];
        }
      }
    };

    that.close = function() {
      checkOpen();
      state = vertx.EventBus.CLOSING;
      sockJSConn.close();
    };

    that.readyState = function() {
      return state;
    };

    sockJSConn.onopen = function() {
      // Send the first ping then send a ping every pingInterval milliseconds
      sendPing();
      pingTimerID = setInterval(sendPing, pingInterval);
      state = vertx.EventBus.OPEN;
      if (that.onopen) {
        that.onopen();
      }
    };

    sockJSConn.onclose = function() {
      state = vertx.EventBus.CLOSED;
      if (pingTimerID) { clearInterval(pingTimerID); }
      if (that.onclose) {
        that.onclose();
      }
    };

    sockJSConn.onmessage = function(e) {
      var msg = e.data;
      var json = JSON.parse(msg);
      var body = json.body;
      var replyAddress = json.replyAddress;
      var address = json.address;
      var replyHandler;
      if (replyAddress) {
        replyHandler = function(reply, replyHandler) {
          // Send back reply
          that.send(replyAddress, reply, replyHandler);
        };
      }
      var handlers = handlerMap[address];
      if (handlers) {
        // We make a copy since the handler might get unregistered from within the
        // handler itself, which would screw up our iteration
        var copy = handlers.slice(0);
        for (var i  = 0; i < copy.length; i++) {
          copy[i](body, replyHandler);
        }
      } else {
        // Might be a reply message
        var handler = replyHandlers[address];
        if (handler) {
          delete replyHandlers[address];
          handler(body, replyHandler);
        }
      }
    };

    function sendPing() {
      var msg = {
        type: "ping"
      };
      sockJSConn.send(JSON.stringify(msg));
    }

    function sendOrPub(type, address, message, replyHandler) {
      checkSpecified("address", 'string', address);
      checkSpecified("replyHandler", 'function', replyHandler, true);
      checkOpen();
      var envelope = { type: type,
                       address: address,
                       body: message };
      if (that.sessionID) {
        envelope.sessionID = that.sessionID;
      }
      if (replyHandler) {
        var replyAddress = makeUUID();
        envelope.replyAddress = replyAddress;
        replyHandlers[replyAddress] = replyHandler;
      }
      var str = JSON.stringify(envelope);
      sockJSConn.send(str);
    }

    function checkOpen() {
      if (state !== vertx.EventBus.OPEN) {
        throw new Error('INVALID_STATE_ERR');
      }
    }

    function checkSpecified(paramName, paramType, param, optional) {
      if (!optional && !param) {
        throw new Error("Parameter " + paramName + " must be specified");
      }
      if (param && typeof param !== paramType) {
        throw new Error("Parameter " + paramName + " must be of type " + paramType);
      }
    }

    function makeUUID(){
      return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function(a,b){
          return b=Math.random()*16,(a==="y"?b&3|8:b|0).toString(16);
        }
      );
    }
  };

  vertx.EventBus.CONNECTING = 0;
  vertx.EventBus.OPEN = 1;
  vertx.EventBus.CLOSING = 2;
  vertx.EventBus.CLOSED = 3;

  return vertx.EventBus;

});
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
      var waitUntilOpen = function(retries, execute, reject) {
        if ( --retries <= 0 ) {
          reject('Bus did not open timely');

        } else {
          if ( eb.readyState() === vertx.EventBus.CLOSED ) {
            api.connect(execute);

          } else if (eb.readyState() === vertx.EventBus.OPEN) {
            execute();

          } else {
            setTimeout(function() { waitUntilOpen(retries, execute, reject); }, 200);
          }
        }
      };

      var waitUntilClosed = function(retries, execute, reject) {
        if ( --retries <= 0 ) {
          reject('Bus did not close properly');

        } else {
          if ( eb.readyState() === vertx.EventBus.CLOSED ) {
            api.connect(execute);

          } else if (eb.readyState() === vertx.EventBus.OPEN) {
            execute();

          } else {
            setTimeout(function() { waitUntilOpen(retries, execute, reject); }, 200);
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
              waitUntilClosed(retries, execute, d.reject);
            }, 200);

          } else if ( eb.readyState() === vertx.EventBus.CONNECTING ) {
            // wait until open
            setTimeout(function() {
              waitUntilOpen(retries, execute, d.reject);
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
