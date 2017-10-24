const path = require('path');
const requireDir = require('require-dir');

const net = require('./networks');
const manifest = requireDir('../manifest');

module.exports.greeting = function(user, sid, callback) {
    let options = net.buildOpt('GET', manifest.services.apis.sunshine.host);

    const payload = net.buildIVRObj(user, sid);

    console.log(payload);

    options.qs = payload

    net.invokeApi(options, function(res, body) {
        console.log("In Greeting: \n" + JSON.stringify(body));
        callback(body);
    });
}

module.exports.conversation = function(text) {
    let options = net.buildOpt('GET', manifest.services.apis.sunshine.host);
}
