var defaults = require('defaults');
var path = require('path');
var fs = require('fs');

var config = require('./config');

module.exports = function(options) {
    options = defaults(options, {
    });
    
    return function(files, metalsmith, done) {
        var metadata = metalsmith.metadata();
        if (metadata.site){
        }

        var manifest = path.join(__dirname, config.destination.assets, 'rev-manifest.json');
        if (fs.existsSync(manifest)){
          metadata['rev-manifest'] = require(manifest);
        }

        done();
    };
}