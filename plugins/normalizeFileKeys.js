const path = require('path');

// Metalsmith's match() returns keys with native separators, while plugins such as
// pagination and tags create keys with forward slashes. On Windows that makes
// files[matchedKey] undefined, so keys are normalized to the native separator.
module.exports = function normalizeFileKeys() {
    return function(files, metalsmith, done) {
        if (path.sep !== '/') {
            Object.keys(files).forEach(file => {
                const normalized = file.split('/').join(path.sep);
                if (normalized !== file) {
                    files[normalized] = files[file];
                    delete files[file];
                }
            });
        }

        done();
    };
};
