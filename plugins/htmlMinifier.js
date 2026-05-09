const {minify} = require('html-minifier-terser');

const minifierOptions = {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    removeAttributeQuotes: true,
    removeComments: true,
    removeEmptyAttributes: true,
    removeRedundantAttributes: true
};

module.exports = function htmlMinifier() {
    return function(files, metalsmith, done) {
        Promise.all(Object.keys(files)
            .filter(file => file.endsWith('.html'))
            .map(async file => {
                const data = files[file];
                const contents = data.contents.toString();
                const minified = await minify(contents, minifierOptions);
                data.contents = Buffer.from(minified, 'utf8');
            }))
            .then(() => done())
            .catch(done);
    };
};
