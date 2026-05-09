const RSS = require('rss');

function resolveUrl(base, target) {
    return new URL(target, base).toString();
}

module.exports = function feed(options) {
    options = options || {};

    const limit = options.limit != null ? options.limit : 20;
    const destination = options.destination || 'rss.xml';
    const collectionName = options.collection;

    if (!collectionName) {
        throw new Error('collection option is required');
    }

    return function(files, metalsmith, done) {
        const metadata = metalsmith.metadata();

        if (!metadata.collections) {
            return done(new Error('no collections configured'));
        }

        let collection = metadata.collections[collectionName];
        const feedOptions = Object.assign({}, metadata.site, options, {
            site_url: metadata.site != null ? metadata.site.url : undefined,
            generator: 'metalsmith-feed'
        });

        const siteUrl = feedOptions.site_url;
        if (!siteUrl) {
            return done(new Error('either site_url or metadata.site.url must be configured'));
        }

        if (feedOptions.feed_url == null) {
            feedOptions.feed_url = resolveUrl(siteUrl, destination);
        }

        const rss = new RSS(feedOptions);
        if (limit) {
            collection = collection.slice(0, limit);
        }

        const preprocess = options.preprocess || (file => file);
        collection.forEach(file => {
            const itemData = Object.assign({}, file, {
                description: file.less || file.excerpt || file.contents
            });

            if (!itemData.url && (itemData.permalink || itemData.path)) {
                itemData.url = resolveUrl(siteUrl, itemData.permalink || itemData.path);
            }

            if (itemData.link) {
                itemData.guid = itemData.url;
                itemData.url = itemData.link;
            }

            rss.item(preprocess(itemData));
        });

        files[destination] = {
            contents: Buffer.from(rss.xml(), 'utf8')
        };

        return done();
    };
};
