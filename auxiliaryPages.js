const defaults = require('defaults');
const path = require('path');

module.exports = function (options) {
    options = defaults(options, {
    });

    return function (files, metalsmith, done) {
        Object.keys(files).forEach(function (file) {
            var data = files[file];
            if (data.collection &&
                !data.collection.includes('posts') &&
                !data.collection.includes('pages') &&
                path.extname(file) === '.html') {

                data.path = data.path + '.html';
                delete files[file];
                files[data.path] = data;
            }
        });

        done();
    };
}