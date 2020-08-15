module.exports = function() {
    if (this.title)
        return this.title;
    else if (this.tag)
        return this.tag + ' - ' + this.site.title;
    else
        return this.site.title;
}