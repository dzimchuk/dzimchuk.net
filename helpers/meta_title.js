module.exports = function() {
    if (this.title)
        return this.title;
    else
        return this.site.name;
}