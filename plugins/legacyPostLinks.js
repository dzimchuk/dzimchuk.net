const path = require('node:path');
const {DomUtils, parseDocument} = require('htmlparser2');

function isHtml(file) {
    return /\.html?/.test(path.extname(file));
}

function formatPermalink(permalink) {
    const trimmed = permalink.replace(/^\/+|\/+$/g, '');
    return `/${trimmed}/`;
}

function buildPermalinkMap(files) {
    return Object.values(files)
        .filter(file => typeof file.permalink === 'string' && file.permalink.length > 0)
        .reduce((links, file) => {
            links.set(file.permalink.toLowerCase(), formatPermalink(file.permalink));
            return links;
        }, new Map());
}

function parseLegacyPostHref(href) {
    if (typeof href !== 'string') {
        return null;
    }

    const match = href.match(/^\/?post\/([^/?#]+)\/?([?#].*)?$/i);
    if (!match) {
        return null;
    }

    try {
        return {
            slug: decodeURIComponent(match[1]).toLowerCase(),
            suffix: match[2] || ''
        };
    } catch {
        return null;
    }
}

function serialize(document) {
    return document.children.map(node => DomUtils.getOuterHTML(node)).join('');
}

module.exports = function legacyPostLinks() {
    return function(files, metalsmith, done) {
        const permalinks = buildPermalinkMap(files);

        Object.keys(files).forEach(file => {
            if (!isHtml(file)) {
                return;
            }

            const data = files[file];
            const document = parseDocument(data.contents.toString());
            let changed = false;

            DomUtils.getElementsByTagName('a', document, true).forEach(anchor => {
                const legacy = parseLegacyPostHref(anchor.attribs.href);

                if (!legacy || !permalinks.has(legacy.slug)) {
                    return;
                }

                anchor.attribs.href = permalinks.get(legacy.slug) + legacy.suffix;
                changed = true;
            });

            if (changed) {
                data.contents = Buffer.from(serialize(document), 'utf8');
            }
        });

        done();
    };
};
