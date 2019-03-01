/*
Copyright (c) 2015, atroo GbR

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
"use strict";

var qs = require('querystring');
var fs = require('fs');
var path = require('path');
var FormData = require('form-data');
var http = require("http");
var path = require('path')
var url = require("url");
var SeaweedFSError = require("./error");

module.exports = function weedfs(app) {
    app.addSingleton('weedfs', createClient);
}

function createClient(config) {
    var weedClient = new WeedFSClient(config);

    // TODO: (Yiyong.Li)
    // Validate config.
    return weedClient;
}

function WeedFSClient(opts) {
    this.usePublicUrl = opts.usePublicUrl || false;
    this.clientOpts = opts || {};

    this.masterURL = "http://" + this.clientOpts.server + ":" + this.clientOpts.mport + "/";
    if (this.clientOpts.filer && this.clientOpts.fport)
      this.filerURL = "http://" + this.clientOpts.filer + ":" + this.clientOpts.fport + "/";
}

WeedFSClient.prototype = {
    _assign: function (opts) {
        var self = this;
        return new Promise(function (resolve, reject) {
            var req = http.request(url.parse(self.masterURL + "dir/assign?" + qs.stringify(opts)), function (res) {
                let body = "";

                res.setEncoding('utf8');
                res.on("data", function (chunk) {
                    body += chunk;
                });
                res.on("end", function () {
                    var json = JSON.parse(body);
                    return resolve(json);
                });
            });
            req.on("error", function (err) {
                return reject(err);
            });
            req.end();
        });
    },

    _write: function (file, opts) {
        var proms = [];
        for (var i = 0; i < opts.count; i++) {
            proms.push(new Promise(function (resolve, reject) {
                var form = new FormData();
                var stream = typeof file[i] === "string" ? fs.createReadStream(file[i]) : null;
                form.append("file", stream ? stream : file[i]);

                var options = Object.assign({}, opts.url[i]);
                if (opts.headers) {
                    options.headers = opts.headers;
                }

                var req = form.submit(options, function (err, res) {
                    if (err) {
                        return reject(err);
                    }

                    let body = "";

                    res.setEncoding('utf8');
                    res.on("data", function (chunk) {
                        body += chunk;
                    });
                    res.on("end", function () {
                        var json = JSON.parse(body);
                        return resolve(json);
                    });
                });

                //we only check for self created streams, stream errors from outside streams should be handled outside
                if (stream) {
                    stream.on("error", function (err) {
                        reject(err);
                    });
                }

                req.on("error", function (err) {
                    reject(err);
                });

                req.on("socket", function (socket) {
                    socket.on("error", function (err) {
                        reject(err);
                    });
                })
            }));
        }

        return Promise.all(proms).then(function (res) {
            return Promise.resolve(res);
        });
    },

    // writeFiler - A helper for uploading to filer server, which delegates to `_write`.
    writeFiler: function (file, filerPath, opts) {
        if (this.filerURL == null) {
            return Promise.reject(new SeaweedFSError(
                'No filer server provided.'
            ));
        }

        opts = opts || {};
        var options = { url: [], };
        if (!Array.isArray(file)) {
            file = [file];
        }

        options.count = file.length;
        if (opts.headers) {
            options.headers = opts.headers;
        }
        // Add Urls.
        for (let i = 0; i < file.length; i++) {
            if (typeof file[i] !== 'string') {
                return Promise.reject(new SeaweedFSError(
                    'The first param to `writeFiler` must be a string or an array of strings.'
                ));
            }
            file[i] = path.resolve(process.cwd(), file[i]);
            let targetFilerPath;

            if (filerPath && typeof filerPath === 'string') {
              targetFilerPath = this.filerURL + filerPath.substr(1);
            } else if (typeof filerPath === 'function') {
              // TODO: The user provided function might throw.
              targetFilerPath = this.filerURL + filerPath(file).substr(1);
            } else {
              targetFilerPath = this.filerURL + file[i].substr(1);
            }

            options.url.push(url.parse(targetFilerPath));
        }

        return this._write(file, options);
    },

    // write - A helper for uploading files, which delegates to `_write`.
    write: function (file, opts) {
        opts = opts || {};
        var self = this;
        var assignOpts = Object.assign({}, opts);
        var fileInfo;
        delete assignOpts.headers;

        return self._assign(assignOpts).then(function (finfo) {
            if (finfo.error) {
                return Promise.reject(finfo.error);
            }
            fileInfo = finfo;

            var options = { url: [], };
            var commonUrl = "http://" + (self.usePublicUrl ? finfo.publicUrl : finfo.url) + "/" + finfo.fid;
            if (!Array.isArray(file)) {
                file = [file];
            }

            options.count = file.length;
            if (opts.headers) {
                options.headers = opts.headers;
            }

            for (let i = 0; i < options.count; i++) {
                // Tag file cookie if necessary.
                let curUrl = commonUrl + (options.count === 1 ? "" : ("_" + i));
                options.url.push(url.parse(curUrl));
                if (typeof file[i] === "string") {
                    // Make all file is absolutely path'd.
                    file[i] = path.resolve(process.cwd(), file[i]);
                }
            }

            return self._write(file, options);
        }).then(function () { return fileInfo; })
    },

    find: function (fid, opts) {
        let self = this;
        return new Promise(function (resolve, reject) {
            let options = Object.assign({}, url.parse(self.masterURL + "dir/lookup?volumeId=" + fid));
            if (opts && opts.collection) {
                options.path += `&collection=${opts.collection}`
            }
            let req = http.request(options, function (res) {
                let body = "";
                let err;

                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on("end", function () {
                    var json = JSON.parse(body);
                    if (json.error) {
                        var err = new SeaweedFSError(json.error);
                        err.volumeId = json.volumeId;
                        return reject(err);
                    } else {
                        return resolve(json);
                    }
                });
            });
            req.on("error", function (err) {
                reject(err);
            });
            req.end();
        });
    },

    clusterStatus: function () {
        var self = this;
        return new Promise(function (resolve, reject) {
            var req = http.request(url.parse(self.masterURL + "cluster/status"), function (res) {
                let body = "";
                let err;

                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on("end", function () {
                    var json = JSON.parse(body);
                    if (json.error) {
                        var err = new SeaweedFSError(json.error);
                        err.volumeId = json.volumeId;
                        return reject(err);
                    } else {
                        return resolve(json);
                    }
                });
            });
            req.on("error", function (err) {
                reject(err);
            });
            req.end();
        });
    },

    masterStatus: function () {
        var self = this;
        return new Promise(function (resolve, reject) {
            var req = http.request(url.parse(self.masterURL + "cluster/status"), function (res) {
                let body = "";
                let err;

                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on("end", function () {
                    var json = JSON.parse(body);
                    if (json.error) {
                        var err = new SeaweedFSError(json.error);
                        err.volumeId = json.volumeId;
                        return reject(err);
                    } else {
                        return resolve(json);
                    }
                });
            });
            req.on("error", function (err) {
                reject(err);
            });
            req.end();
        });
    },

    systemStatus: function (cb) {
        var self = this;
        return new Promise(function (resolve, reject) {
            var req = http.request(url.parse(self.masterURL + "dir/status"), function (res) {
                let body = "";
                let err;

                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on("end", function () {
                    var json = JSON.parse(body);
                    if (json.error) {
                        var err = new SeaweedFSError(json.error);
                        err.volumeId = json.volumeId;
                        return reject(err);
                    } else {
                        return resolve(json);
                    }
                });
            });
            req.on("error", function (err) {
                reject(err);
            });
            req.end();
        });
    },

    volumeStatus: function (host) {
        return new Promise(function (resolve, reject) {
            var req = http.request(url.parse("http://" + host + "/status"), function (res) {
                let body = "";
                let err;

                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on("end", function () {
                    var json = JSON.parse(body);
                    if (json.error) {
                        var err = new SeaweedFSError(json.error);
                        err.volumeId = json.volumeId;
                        return reject(err);
                    } else {
                        return resolve(json);
                    }
                });
            });
            req.on("error", function (err) {
                reject(err);
            });
            req.end();
        });
    },

    readFiler(file, stream, opts) {
        if (this.filerURL == null) {
            return Promise.reject(new SeaweedFSError(
                "No filer server has been set"
            ));
        }

        if (typeof file !== "string") {
            return Promise.reject(new SeaweedFSError(
                "The first param to `removeFiler` must be a string"
            ));
        }

        file = path.resolve(process.cwd(), file);
        var options = Object.assign({}, url.parse(this.filerURL + file.substr(1)));
        if (opts && opts.headers) {
            options.headers = opts.headers;
        }

        return this._read(options, stream, file);
    },

    // Assume `opts` contains url.
    _read: function (opts, stream, fid) {
        return new Promise(function (resolve, reject) {
            var req = http.request(opts, function (res) {
                // Error handling.
                if (res.statusCode === 404) {
                    var err = new SeaweedFSError("file '" + fid + "' not found");
                    if (stream) {
                        stream.emit("error", err);
                    }
                    return reject(err);
                }

                // Resolve.
                if (stream) {
                    //support for http write streams
                    if (typeof stream.writeHead === 'function') {
                        stream.writeHead(res.statusCode, res.headers)
                    }
                    res.pipe(stream);
                    resolve(stream);
                } else {
                    var tmp = [];
                    res.on("data", function (chunk) {
                        tmp.push(chunk);
                    });
                    res.on("end", function () {
                        var buffer = Buffer.concat(tmp);
                        resolve(buffer);
                    });
                }
            });
            req.on("error", function (err) {
                if (stream) {
                    stream.emit("error", err);
                }
                reject(err);
            });
            req.end();
        });
    },
    
    read: function (fid, stream, opts) {
        var self = this;
        return self.find(fid, opts).then(function (res) {
            if (res.locations.length) {
                var options = Object.assign({}, url.parse("http://" + (self.usePublicUrl ? res.locations[0].publicUrl : res.locations[0].url) + "/" + fid));
                if (opts && opts.headers) {
                    options.headers = opts.headers;
                }
                return self._read(options, stream, fid);
            } else {
                var err = new SeaweedFSError("No volume servers found for volume " + fid.split(",")[0]);
                if (stream) {
                    stream.emit("error", err);
                }
                reject(err);
            }
        })
    },
    
    removeFiler: function (file, opts) {
        if (this.filerURL == null) {
            return Promise.reject(new SeaweedFSError(
                "No filer server has been set"
            ));
        }

        if (typeof file !== "string") {
            return Promise.reject(new SeaweedFSError(
                "The first param to `removeFiler` must be a string"
            ));
        }

        file = path.resolve(process.cwd(), file);
        file = file.replace(/\/$/, '');
        opts || (opts = {});
        var filerURL = this.filerURL;

        return new Promise(function (resolve, reject) {
            var fileUrl = url.parse(filerURL + file.substr(1));
            var options = Object.assign(fileUrl, opts, {
                "method": "DELETE"
            });
            options.headers = opts.headers || {}

            var req = http.request(options, function (res) {
                if (res.statusCode === 404 || res.statusCode === 500) {
                    var err = new SeaweedFSError("file '" + file + "' not found");
                    return reject(err);
                }

                // This api does not return any response.
                if (res.statusCode === 204) {
                    return resolve();
                }
            });
            req.on("error", function(err) {
                reject(err);
            });
            req.end();
        });
    },

    remove: function (fid, opts) {
        var self = this;

        return self.find(fid, opts).then(function (result) {
            return new Promise(function (resolve, reject) {
                var proms = [];
                for (var i = 0, len = result.locations.length; i < len; i++) {
                    proms.push(new Promise(function (resolve, reject) {
                        var req = http.request(Object.assign(url.parse("http://" + (self.usePublicUrl ? result.locations[i].publicUrl : result.locations[i].url) + "/" + fid), {
                            "method": "DELETE"
                        }), function (res) {
                            if (res.statusCode === 404) {
                                var err = new SeaweedFSError("file '" + fid + "' not found");
                                return reject(err);
                            }
                            var tmp = [];
                            res.on("data", function (chunk) {
                                tmp.push(chunk);
                            });
                            res.on("end", function () {
                                var buffer = Buffer.concat(tmp);
                                var payload = JSON.parse(buffer.toString("utf-8"));

                                if (!payload.size) {
                                    return reject(new SeaweedFSError("File with fid " + fid + " could not be removed"));
                                }
                                resolve(payload);
                            });
                        });
                        req.on("error", function (err) {
                            reject(err);
                        });
                        req.end();
                    }));
                }
                Promise.all(proms).then(function () {
                    resolve({
                        count: result.locations.length
                    });
                }).catch(function (err) {
                    reject(err);
                });
            });
        });
    },

    vacuum: function (opts) {
        var self = this;
        opts = opts || {};
        return new Promise(function (resolve, reject) {
            var req = http.request(url.parse(self.masterURL + "vol/vacuum?" + qs.stringify(opts)), function (res) {
                var tmp = [];
                res.on("data", function (chunk) {
                    tmp.push(chunk);
                });
                res.on("end", function () {
                    var buffer = Buffer.concat(tmp);
                    resolve(JSON.parse(buffer.toString("utf8")));
                });
            });
            req.on("error", function (err) {
                reject(err);
            });
            req.end();
        });
    }
};

//module.exports = WeedFSClient;
