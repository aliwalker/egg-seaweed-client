'use strict';

const mock = require('egg-mock');
const expect = require('chai').expect;

describe('test/seaweed-client.test.js', () => {
  let app;
  before(() => {
    app = mock.app({
      baseDir: 'apps/seaweed-client-test',
    });
    return app.ready();
  });

  after(() => app.close());
  afterEach(mock.restore);

  it('should GET /', () => {
    const weedfs = app.weedfs;
    expect(weedfs).to.be.an('object')
    expect(weedfs.read).to.be.a('function')
    expect(weedfs.readFiler).to.be.a('function')
    expect(weedfs.write).to.be.a('function')
    expect(weedfs.writeFiler).to.be.a('function')
    expect(weedfs.remove).to.be.a('function')
    expect(weedfs.removeFiler).to.be.a('function')
  });
});
