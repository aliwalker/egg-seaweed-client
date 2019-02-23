'use strict';

const weedfs = require('./lib/weedfs');

module.exports = app => {
  if (app.config.weedfs.app) {
    weedfs(app);
  }
}