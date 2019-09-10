module.exports = {
    page: function() {
        return this.pagination.num;
    },
    pages: function() {
        return this.pagination.pages.length;
    },
    page_url: function(page) {
        var exp = /^(.*)index\.html$/;
        return '/' + page.path.replace(exp, '$1');
    }
}