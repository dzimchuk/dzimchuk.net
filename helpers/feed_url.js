module.exports = {
    feed_url: function () {
        return 'https://feedly.com/i/subscription/feed/' + resolveUrl(this.site.url, this.site.feedRss);
    },
    local_feed_url: function () {
        return resolveUrl(this.site.url, this.site.feedRss);
    }
}

function resolveUrl(base, relative) {
    return new URL(relative, base).toString();
}
