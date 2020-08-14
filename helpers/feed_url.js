const url = require('url');

module.exports = {
    feed_url: function () {
        return 'https://feedly.com/i/subscription/feed/' + url.resolve(this.site.url, this.site.feedRss);
    },
    local_feed_url: function () {
        return url.resolve(this.site.url, this.site.feedRss);
    }
}