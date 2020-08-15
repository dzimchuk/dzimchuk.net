module.exports = {
    isHomePage: function () {
        return this.isPageIndex && this.pagination.num == 1;
    },
    isTagPage: function () {
        return !this.collection && this.tag;
    },
    isPostOrPage: function () {
        return this.collection && (this.collection.includes('posts') || this.collection.includes('pages'));
    },
    isNextPage: function () {
        return this.pagination && this.pagination.num > 1;
    }
}