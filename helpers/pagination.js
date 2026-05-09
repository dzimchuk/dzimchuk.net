module.exports = {
    page: function() {
        return this.pagination.num;
    },
    pages: function() {
        return this.pagination.pages.length;
    },
    page_url: function (page, options) {
        var exp = /^(.*)index\.html$/;
        var path = page.permalink || page.path.replace(exp, '$1');
        return options.hash.absolute
            ? new URL(path, this.site.url).toString()
            : '/' + path.replace(/^\/+/, '');
    }
}
