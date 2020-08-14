const url = require('url');

module.exports = {
    page: function() {
        return this.pagination.num;
    },
    pages: function() {
        return this.pagination.pages.length;
    },
    page_url: function (page, options) {
        var exp = /^(.*)index\.html$/;
        return url.resolve((options.hash.absolute ? this.site.url : '/'), page.path.replace(exp, '$1'));
    }
}