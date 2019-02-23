'use strict';
const weedfs = require('./lib/weedfs');

module.exports = agent => {
  if (agent.config.weedfs.agent) {
    weedfs(agent);
  }
}