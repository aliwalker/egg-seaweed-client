# egg-seaweed-client


## Install

```bash
$ npm i egg-seaweed-client --save
```

## Usage

```js
// {app_root}/config/plugin.js
exports.weedfs = {
  enable: true,
  package: 'egg-seaweed-client',
};
```

## Configuration

```js
// {app_root}/config/config.default.js
exports.weedfs = {
  client: {
    server: 'localhost',
    mport: 9333,
    filer: 'localhost',
    fport: 8888,
  }
};
```

see [config/config.default.js](config/config.default.js) for more detail.

## Example



## Questions & Suggestions

Please open an issue [here](https://github.com/eggjs/egg/issues).

## License

[MIT](LICENSE)
