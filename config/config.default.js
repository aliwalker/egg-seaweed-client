'use strict';

/**
 * egg-seaweed-client default config
 * @member Config#weedfs
 * @property {String} SOME_KEY - some description
 */
exports.weedfs = {
  agent: true,
  app: false,

  client: {
    server: 'localhost',
    server_port: 9333,
    filer: 'localhost',
    fport: 8888
  }
};
