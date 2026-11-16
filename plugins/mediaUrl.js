const path = require('node:path');

// Content references media as site-relative '/media/...' URLs (mirroring content/media).
const SOURCE_PREFIX = '/media/';
const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.xml', '.xsl', '.json', '.txt']);
// Only rewrite URLs that start an attribute value, markdown/CSS url() or element text.
const REFERENCE_PATTERN = /(["'(>])\/media\//g;

function withTrailingSlash(url) {
    return url.endsWith('/') ? url : url + '/';
}

function toPosix(file) {
    return file.split(path.sep).join('/');
}

/**
 * Resolves the media base URL against the site URL.
 * Returns the normalized URL and, when media is served by the site itself,
 * the directory (relative to the site root) where media files should be published.
 */
function resolveMediaUrl(mediaUrl, siteUrl) {
    const url = withTrailingSlash(mediaUrl);
    const site = withTrailingSlash(siteUrl);

    let sitePath = null;
    if (url.startsWith('/') && !url.startsWith('//')) {
        sitePath = url;
    } else if (url.startsWith(site)) {
        sitePath = '/' + url.substring(site.length);
    }

    return {
        url,
        directory: sitePath === null ? null : sitePath.replace(/^\/+|\/+$/g, '')
    };
}

module.exports = function mediaUrl(options) {
    const {url, directory, source} = options;

    return function(files, metalsmith, done) {
        const sourceDir = toPosix(source) + '/';
        const targetDir = directory ? directory + '/' : '';

        Object.keys(files).forEach(file => {
            const posixFile = toPosix(file);

            if (posixFile.startsWith(sourceDir)) {
                if (directory !== null && sourceDir !== targetDir) {
                    const target = path.join(...(targetDir + posixFile.substring(sourceDir.length)).split('/'));
                    files[target] = files[file];
                    delete files[file];
                }
                return;
            }

            if (url === SOURCE_PREFIX || !TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) {
                return;
            }

            const data = files[file];
            const contents = data.contents.toString();
            const updated = contents.replace(REFERENCE_PATTERN, (match, prefix) => prefix + url);

            if (updated !== contents) {
                data.contents = Buffer.from(updated, 'utf8');
            }
        });

        done();
    };
};

module.exports.resolveMediaUrl = resolveMediaUrl;
