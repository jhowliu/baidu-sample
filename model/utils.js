const path = require('path');
const fs = require('fs');

let spawn = require('child_process').spawn;


module.exports.generateRandomString = function () {
        return (Math.random() * new Date().getTime()).toString(32).replace( /\./g , '');
}

// Use for voice recognize 
// Read audio from local
module.exports.getFileInBuffer = function (filename, folder='./audio') {
    const file = path.resolve(folder, filename);
    const buf = fs.readFileSync(file);
    console.log(buf.length);

    return buf;
}


// Write audio into local
module.exports.writeAudio = function (buffer, filename, callback) {
    const file = path.resolve('./audio', filename);

    fs.writeFile(file, buffer,function(err) {
        if (err) throw err; 
        callback()
    });
}

module.exports.convertAudio = function (filename, rate, callback) {
    const cmd = '/usr/bin/ffmpeg'

    const args = [
        '-y',
        '-i', path.resolve('./audio', filename),
        '-acodec', 'pcm_s16le',
        '-f', 's16le',
        '-ac', '1',
        '-ar', rate,
        path.resolve('./audio', filename)
    ]

    let proc = spawn(cmd, args);

    proc.on('close', function() {
        console.log('finished');
        callback();
    })
}
