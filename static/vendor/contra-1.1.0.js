(function (Object) {
  'use strict';

  // { name: 'core', dependencies: [] }
  function a (o) { return Object.prototype.toString.call(o) === '[object Array]'; }
  function atoa (a) { return Array.prototype.slice.call(a); }
  function cb (fn, args, ctx) { if (!fn) { return; } tick(function run () { fn.apply(ctx || null, args || []); }); }
  function once (fn) {
    var disposed;
    function disposable () {
      if (disposed) { return; }
      disposed = true;
      fn.apply(null, arguments);
    }
    disposable.discard = function () { disposed = true; };
    return disposable;
  }
  function handle (args, done, disposable) {
    var err = args.shift();
    if (err) { if (disposable) { disposable.discard(); } cb(done, [err]); return true; }
  }

  // cross-platform ticker
  var tick, si = typeof setImmediate === 'function';
  if (typeof process === 'undefined' || !process.nextTick) {
    if (si) {
      tick = function tick (fn) { setImmediate(fn); };
    } else {
      tick = function tick (fn) { setTimeout(fn, 0); };
    }
  } else {
    tick = si ? setImmediate : process.nextTick;
  }

  // { name: 'curry', dependencies: ['core'] }
  function _curry () {
    var args = atoa(arguments);
    var method = args.shift();
    return function curried () {
      var more = atoa(arguments);
      method.apply(method, args.concat(more));
    };
  }

  // { name: 'waterfall', dependencies: ['core'] }
  function _waterfall (steps, done) {
    function next () {
      var d = once(done);
      return once(function callback () {
        var args = atoa(arguments);
        var step = steps.shift();
        if (step) {
          if (handle(args, d)) { return; }
          args.push(next());
          cb(step, args);
        } else {
          cb(d, arguments);
        }
      });
    }
    next()();
  }

  // { name: 'series', dependencies: ['core'] }
  function _series (tasks, done) {
    var d = once(done);
    var keys = Object.keys(tasks);
    var results = a(tasks) ? [] : {};
    var pk;
    function next () {
      return once(function callback () {
        var k = keys.shift();
        var args = atoa(arguments);
        var step = tasks[k];
        if (pk) {
          if (handle(args, d)) { return; }
          results[pk] = args.shift();
        }
        pk = k;
        if (step) {
          cb(step, [next()]);
        } else {
          cb(d, [null, results]);
        }
      });
    }
    next()();
  }

  // { name: 'concurrent', dependencies: ['core'] }
  function _concurrent (tasks, done) {
    var d = once(done);
    var keys = Object.keys(tasks);
    var results = a(tasks) ? [] : {};
    var completed = 0, all = keys.length;
    keys.forEach(function iterator (key) { cb(tasks[key], [next(key)]); });
    function next (k) {
      var fn = once(function callback () {
        var args = atoa(arguments);
        if (handle(args, d, fn)) { return; }
        results[k] = args.shift();
        if (++completed === all) {
          cb(d, [null, results]);
        }
      });
      return fn;
    }
  }

  // { name: 'map', dependencies: ['series', 'concurrent'] }
  function _map (flow, finish) {
    return function map (collection, iterator, done) {
      var keys = Object.keys(collection);
      var tasks = a(collection) ? [] : {};
      keys.forEach(function insert (key) {
        tasks[key] = function iterate (cb) {
          iterator(collection[key], cb);
        };
      });
      flow(tasks, finish ? finish(collection, done) : done);
    };
  }

  // { name: 'each', dependencies: ['map'] }
  function _each (flow) {
    return _map(flow, finish);
    function finish (collection, done) {
      return function mask (err) {
        done(err); // only return the error, no more arguments
      };
    }
  }

  // { name: 'filter', dependencies: ['map'] }
  function _filter (flow) {
    return _map(flow, finish);
    function finish (collection, done) {
      return function filter (err, results) {
        function exists (item, key) {
          return !!results[key];
        }
        function ofilter () {
          var filtered = {};
          Object.keys(collection).forEach(function omapper (key) {
            if (exists(null, key)) { filtered[key] = collection[key]; }
          });
          return filtered;
        }
        if (err) { done(err); return; }
        done(null, a(results) ? collection.filter(exists) : ofilter());
      };
    }
  }

  // { name: 'emitter', dependencies: ['core'] }
  function _emitter (thing) {
    /* jshint validthis:true */
    var me = this;
    var evt = {};
    thing.on = function (type, fn) {
      if (!evt[type]) {
        evt[type] = [fn];
      } else {
        evt[type].push(fn);
      }
    };
    thing.emit = function () {
      var args = atoa(arguments);
      var type = args.shift();
      var et = evt[type];
      if (type === 'error' && !et) { throw args.length === 1 ? args[0] : args; }
      if (!et) { return; }
      et.forEach(function emitter (s) { cb(s, args, me); });
    };
    return thing;
  }

  // { name: 'queue', dependencies: ['core'] }
  var _queue = function (worker, concurrency) {
    var q = [], load = 0, max = concurrency || 1, paused;
    function _add (task, top, done) {
      var m = top ? 'unshift' : 'push';
      var tasks = a(task) ? task : [task];
      tasks.forEach(function insert (t) { q[m]({ t: t, done: done }); });
      cb(labor);
    }
    function labor () {
      if (paused || load >= max || !q.length) { return; }
      load++;
      var job = q.pop();
      worker(job.t, once(complete.bind(null, job)));
    }
    function complete (job, err) {
      load--;
      cb(job.done, [err]);
      cb(labor);
    }
    var qq = {
      push: function (task, done) { _add(task, false, done); },
      unshift: function (task, done) { _add(task, true, done); },
      pause: function () { paused = true; },
      resume: function () { paused = false; labor(); },
      pending: q
    };
    if (Object.defineProperty && !Object.definePropertyPartial) {
      Object.defineProperty(qq, 'length', { get: function () { return q.length; } });
    }
    return qq;
  };

  // { name: 'outro', dependencies: ['core'] }
  var $ = {
    curry: _curry,
    concurrent: _concurrent,
    series: _series,
    waterfall: _waterfall,
    each: _each(_concurrent),
    map: _map(_concurrent),
    filter: _filter(_concurrent),
    queue: _queue,
    emitter: _emitter
  };

  $.each.series = _each(_series);
  $.map.series = _map(_series);
  $.filter.series = _filter(_series);

  // cross-platform export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = $;
  } else {
    window.contra = $;
  }
})(Object);
