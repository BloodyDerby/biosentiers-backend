const _ = require('lodash');
const app = require('../app');
const config = require('../../config');
const db = require('../db');
const expect = require('chai').expect;
// FIXME: eliminate cyclical dependency between spec/utils.js & spec/expectations/response.js
const expectations = require('./expectations/response');
const httpStatuses = require('http-status');
const mailer = require('../lib/mailer');
const moment = require('moment');
const BPromise = require('bluebird');
const supertest = require('supertest-as-promised');

const logger = config.logger('spec');

exports.testApi = function(method, path, body) {
  method = (method || 'GET').toLowerCase();

  let test = supertest(app)[method](`/api${path}`);
  if (body) {
    test = test.send(body);
  }

  return test;
};

exports.testCreate = function(path, body) {
  return exports
    .testApi('POST', path)
    .send(body)
    .expect(expectations.json(201));
};

exports.testRetrieve = function(path) {
  return exports
    .testApi('GET', path)
    .expect(expectations.json(200));
};

exports.testUpdate = function(path, body) {
  return exports
    .testApi('PATCH', path)
    .send(body)
    .expect(expectations.json(200));
};

exports.setUp = function(data, beforeResolve) {

  const originalData = data;
  if (!_.isFunction(data)) {
    data = function() {
      return originalData;
    };
  }

  if (beforeResolve && !_.isArray(beforeResolve)) {
    beforeResolve = [ beforeResolve ];
  }

  const beforeSetup = moment();

  let promise = BPromise.resolve()

  if (!originalData.databaseCleaned) {
    promise = promise.then(exports.cleanDatabase)
  }

  if (!originalData.testMailsCleaned) {
    promise = promise.then(exports.cleanTestMails);
  }

  return promise.then(() => BPromise.all(_.map(beforeResolve, func => func())))
    .then(() => exports.resolve(data(), true))
    .then(function(resolvedData) {
      _.defaults(resolvedData, {
        databaseCleaned: true,
        beforeSetup: beforeSetup,
        now: moment(),
        testMailsCleaned: true
      });

      const duration = moment().diff(resolvedData.beforeSetup) / 1000;
      logger.debug('Completed test setup in ' + duration + 's');
    })
    .return(exports);
};

exports.cleanDatabase = function() {
  const start = moment();

  // Sequences of tables to delete in order to avoid foreign key conflicts
  const tablesToDelete = [
    [ 'bird', 'butterfly', 'excursions_themes', 'excursions_zones', 'flower', 'installation_event', 'participant', 'pois_zones', 'trails_zones', 'tree', 'zone_point' ],
    [ 'bird_species', 'bird_height', 'butterfly_species', 'excursion', 'flower_species', 'installation', 'poi', 'tree_species', 'zone' ],
    [ 'bird_family', 'butterfly_family', 'flora_family', 'owner', 'theme', 'trail', 'user_account' ],
    [ 'class', 'division' ],
    [ 'reign' ]
  ];

  let promise = BPromise.resolve();
  _.each(tablesToDelete, tableList => {
    promise = promise.then(function() {
      return Promise.all(tableList.map(table => {
        return db.knex.raw(`DELETE from ${table};`);
      }));
    })
  });

  return promise.then(function() {
    const duration = moment().diff(start) / 1000;
    logger.debug('Cleaned database in ' + duration + 's');
  });
};

exports.cleanTestMails = function() {
  mailer.testMails.length = 0;
};

exports.enrichExpectation = function(checkFunc) {

  checkFunc.inBody = exports.responseExpectationFactory(function(res, ...args) {
    return BPromise.resolve().then(() => checkFunc(res.body, ...args));
  });

  checkFunc.listInBody = exports.responseExpectationFactory(function(res, expected, ...args) {
    expect(res.body).to.be.an('array');

    return BPromise
      .resolve()
      .then(() => BPromise.all(expected.map((exp, i) => checkFunc(res.body[i], exp, ...args))))
      .then(() => expect(res.body).to.have.lengthOf(expected.length));
  });

  return checkFunc;
};

exports.createRecord = function(model, data) {
  return BPromise.resolve(data).then(function(resolved) {
    _.each(resolved, (value, key) => {
      if (moment.isMoment(value)) {
        throw new Error(`Value "${value}" at "${key}" is a moment object; convert it with "toDate()" before passing it to "createRecord"`);
      }
    });

    return new model(resolved).save();
  });
};

exports.resolve = function(data, inPlace) {
  if (_.isFunction(data)) {
    return exports.resolve(data(), inPlace);
  } else if (_.isPlainObject(data)) {
    return BPromise.props(_.mapValues(data, function(value) {
      return exports.resolve(value, inPlace);
    })).then(resolvedDataUpdater(data, inPlace));
  } else if (_.isArray(data)) {
    return BPromise.all(_.map(data, function(value) {
      return exports.resolve(value, inPlace);
    })).then(resolvedDataUpdater(data, inPlace));
  } else {
    return BPromise.resolve(data);
  }
};

exports.responseExpectationFactory = function(func) {
  return function(...args) {
    return handleResponseAssertionError(res => {
      return func(res, ...args);
    });
  };
};

exports.hasExpectedTimestamp = function(expected, timestampType) {
  return _.some([ timestampType, `${timestampType}At`, `${timestampType}After`, `${timestampType}Before` ], property => expected[property]);
};

exports.expectTimestamp = function(type, actual, expected, timestampType, options) {
  if (!_.isString(type)) {
    throw new Error('Type must be a string describing the type of record');
  } else if (!_.isString(timestampType)) {
    throw new Error('Timestamp type must be a string identifying the timestamp (e.g. "created" or "updated")');
  }

  const name = timestampType + 'At';
  const afterName = timestampType + 'After';
  const beforeName = timestampType + 'Before';
  const desc = `${type}.${name}`;

  options = _.extend({}, options);
  const required = _.get(options, 'required', true);

  if (_.isString(expected[name]) && expected[name].match(/At$/)) {
    expect(actual[name], desc).to.equal(actual[expected[name]]);
  } else if (expected[name]) {
    expect(actual[name], desc).to.be.iso8601(expected[name]);
  } else if (expected[afterName]) {
    expect(actual[name], desc).to.be.iso8601('justAfter', expected[afterName]);
  } else if (expected[beforeName]) {
    expect(actual[name], desc).to.be.iso8601('justBefore', expected[beforeName]);
  } else if (!required) {
    expect(actual, desc).not.to.have.property(name);
  } else {
    throw new Error(`Expectation for ${name} requires either "${name}", "${afterName}" or "${beforeName}" to be specified`);
  }
};

exports.expectIfElse = function(actual, desc, condition, ifFunc, elseFunc) {
  if (!_.isString(desc)) {
    throw new Error('Description must be a string');
  } else if (!_.isFunction(ifFunc)) {
    throw new Error('If function is required');
  } else if (!_.isFunction(elseFunc)) {
    throw new Error('Else function is required');
  }

  const fulfilled = _.isFunction(condition) ? condition() : condition;
  (fulfilled ? ifFunc : elseFunc)(expect(actual, desc));
};

function resolvedDataUpdater(data, update) {
  return function(resolved) {
    if (update) {
      _.each(resolved, function(value, key) {
        data[key] = value;
      });

      return data;
    } else {
      return resolved;
    }
  };
}

function handleResponseAssertionError(func) {
  return function(res) {
    try {
      const result = func(res);
      return BPromise.resolve(result).catch(function(err) {
        return BPromise.reject(enrichResponseAssertionError(err, res));
      }).return(res);
    } catch(err) {
      throw enrichResponseAssertionError(err, res);
    }
  };
}

function enrichResponseAssertionError(err, res) {
  if (err.name != 'AssertionError' || err.stack.match(/^\s*HTTP\/1\.1/)) {
    return err;
  }

  let resDesc = 'HTTP/1.1 ' + res.status;

  const code = httpStatuses[res.status];
  if (code) {
    resDesc = resDesc + ' ' + code;
  }

  _.each(res.headers, function(value, key) {
    resDesc = resDesc + '\n' + key + ': ' + value;
  });

  if (res.body) {
    resDesc = resDesc + '\n\n';

    const contentType = res.get('Content-Type');
    if (contentType.match(/^application\/json/)) {
      resDesc = resDesc + JSON.stringify(res.body, null, 2);
    } else {
      resDesc = resDesc + res.body.toString();
    }
  }

  let rest;
  let message = 'AssertionError: ' + err.message;

  if (err.stack.indexOf(message) === 0) {
    rest = err.stack.slice(message.length + 1);
  } else {
    const firstEol = err.stack.indexOf('\n');
    message = err.stack.slice(0, firstEol);
    rest = err.stack.slice(firstEol);
  }

  let indent = '';

  const indentMatch = rest.match(/^\s+/);
  if (indentMatch) {
    indent = Array(indentMatch[0].length + 1).join(' ');
  }

  err.stack = message + '\n' + resDesc.replace(/^/gm, indent) + '\n\n' + rest;

  return err;
}
