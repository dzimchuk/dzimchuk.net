module.exports = function updateFilePaths() {
    return function(files, metalsmith, done) {
        Object.keys(files).forEach(file => {
            files[file].path = file;
        });

        done();
    };
};
