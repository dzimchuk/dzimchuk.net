var defaults = require('defaults');

module.exports = function(options) {
    options = defaults(options, {
      author: './author.json'
    });
    
    return function(files, metalsmith, done) {
        var metadata = metalsmith.metadata();
        if (metadata.site){
        }

        done();
    };
}