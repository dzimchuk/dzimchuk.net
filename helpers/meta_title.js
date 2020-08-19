module.exports = function() {
    if (this.title)
        return this.title;
    else if (this.tag) {
        let result = this.tag + ' - ' + this.site.title;
        return this.pagination.num == 1 ? result : result + ' (Page ' + this.pagination.num + ')';
    }
    else if (this.isPageIndex) {
        let result = this.site.title;
        return this.pagination.num == 1 ? result : result + ' (Page ' + this.pagination.num + ')';
    }
    else
        return this.site.title;
}