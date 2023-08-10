const _ = require('lodash');
const bugsnag = require('@bugsnag/js');
const winston = require('winston');
const util = require('util');

function BugsnagLogger(options) {

  options = options || {};
  options = _.defaultsDeep(options, {
    apiKey: process.env.BUGSNAG_API_KEY || '',
    config: {},
    name: 'bugsnag',
    silent: false,
    level: 'info',
    levelsMap: {
      silly: 'info',
      verbose: 'info',
      info: 'info',
      debug: 'info',
      warn: 'warning',
      error: 'error'
    }
  });

  winston.Transport.call(this, _.omit(options, [
    'apiKey',
    'config',
    'bugsnag',
    'levelsMap'
  ]));

  this._levelsMap = options.levelsMap;

  // expose the instance on the transport
  if (options.bugsnag) {
    this.bugsnagClient = options.bugsnag;
  } else {
    this.bugsnagClient = bugsnag({ apiKey: options.apiKey, ...options.config });
  }

};

// Inherit from `winston.Transport`
util.inherits(BugsnagLogger, winston.Transport);

// Define a getter so that `winston.transports.BugsnagLogger`
// is available and thus backwards compatible
winston.transports.BugsnagLogger = BugsnagLogger;

BugsnagLogger.prototype.log = function(level, msg, meta, fn) {

  if (this.silent) return fn(null, true);
  if (!(level in this._levelsMap)) return fn(null, true);

  meta = meta || {};
  meta.severity = this._levelsMap[level];
  meta.metaData = meta.metaData || {};
  error = meta.error || {};
  const omittedCustomErrorFields = ['stack', 'message', 'name'];

  // Custom fields now seem to vanish in Bugsnag Error tab, so we'll add them to custom; useful for GraphQL errors
  customErrorFields = _.remove(Object.getOwnPropertyNames(error), function(item) {
    !_.includes(omittedCustomErrorFields, item)
  });

  // merge all metadata into a single metaData object
  const newMeta = {
    metaData: {
      ..._.omit(meta, ['metaData']),
      ...{ metadata: _.assign({}, meta.metaData, meta.metadata) },
      ...{ custom: _.assign({}, meta.custom, _.pick(error, customErrorFields)) },
    },
  };

  //
  // TODO: this is currently unknown and poorly documented by Bugsnag
  // (e.g. bugsnag-js sends a different payload than bugsnag-node does)
  // <insert facepalm here>
  //

  if (_.isError(msg) && !_.isObject(newMeta.metaData.err)) {
    newMeta.metaData.err = { stack: msg.stack, message: msg.message };
    msg = msg.message;
  }

  if (_.isError(meta) && !_.isObject(newMeta.metaData.err)) {
    newMeta.metaData.err = { stack: newMeta.stack, message: newMeta.message };
    if (!_.isString(msg)) {
      msg = newMeta.message;
    }
  }

  this.bugsnagClient.notify(msg, newMeta, function () {
    fn(null, true);
  });
};

module.exports = BugsnagLogger;
