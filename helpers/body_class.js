var slugify = require('slugify');

module.exports = function() {
    if (this.isPageIndex)
        return 'paged';
    else if (this.collection.includes('home'))
        return 'home-template'; // 'paged' for 2nd and other pages
    else if (this.collection.includes('posts'))
        return 'post-template'; // plus add post tags: tag-one-slug, tag-two-slug
    else if (this.collection.includes('pages'))
    {
        var result = 'page-template';
        if (this.permalink)
        {
            result = addClass(result, 'page', this.permalink);
        }
        else if (this.title)
        {
            result = addClass(result, 'page', this.title);
        }
        return result;
    }
    else 
        return 'tag-template'; // plus tag-slug
}

function addClass(cls, prefix, title) {
    return cls + ' ' + slugify(prefix + ' ' + title, {lower: true});
}
