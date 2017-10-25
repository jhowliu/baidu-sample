const url = require('url');
const requireDir = require('require-dir');

const net = require('./networks');
const manifest = requireDir('../manifest');

// To get the authorization token from Baidu.
module.exports.askAuth = function (method, callback) {
    const URL = url.resolve(manifest.vendor.api.auth, '/oauth/2.0/token');

    let options = net.buildOpt('POST', URL);
    options.form = net.buildAuthObj();

    net.invokeApi(options, function(res, body) {
        callback(res, body);
    });
}

// To use the Baidu recognization API.
module.exports.sendRecognize = function (meta, callback) {
    const URL = url.resolve(manifest.vendor.api.service.recognize, '/server_api');
    const filename = meta.filename
    const rate = meta.rate

    let format = undefined
    if (meta.format != 'wav' || meta.format != 'pcm') {
        format = 'wav'
    }

    let options = net.buildOpt('POST', URL);
    options.body= net.buildVoiceObj(filename, format, rate, manifest.token.access_token);

    net.invokeApi(options, function(res, body) {
        callback(res, body);
    });
}

module.exports.text2Speech = function (text, callback) {
    const URL = url.resolve(manifest.vendor.api.service.tts.host, 
                            manifest.vendor.api.service.tts.path);

    let options = net.buildOpt('POST', URL);
    options.form = net.buildTextObj(text, manifest.token.access_token);
    // 預設是UTF-8, 因為格式是BINARY, 所以不需要encoding
    options.encoding = null;

    net.invokeApi(options, function(res, body) {
        callback(res, body);
    });
}
