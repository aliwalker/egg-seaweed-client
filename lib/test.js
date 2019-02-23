var weedfs = require('./weedfs')
var conf = {
    server: 'localhost',
    mport: 9333,
    filer: 'localhost',
    fport: 8888
}

var client = new weedfs(conf)
client.removeFiler('/Users/Yiyong.Li/Developer/', {
  recursive: true,
})
    .then(c => c)
    .catch(err => console.log(err))