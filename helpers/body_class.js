var slugify = require('slugify');

module.exports = function() {
    if (this.isPageIndex) // generated post index pages
    {
        if (this.pagination.num == 1 && this.path == 'index.html')
        {
            return 'home-template'; // home index page
        }
        return 'paged'; // 'paged' for 2nd and other pages
    }
    else if (!this.collection && this.tag) // genereated tag pages
    {
        var result = 'tag-template';
        result = addClass(result, 'tag', this.tag);
        if (this.pagination.num > 1)
        {
            result += ' paged';
        }
        return result;
    }
    else if (this.collection.includes('posts'))
    {
        var result = 'post-template';
        if (this.tags && this.tags.length > 0)
        {
            var tags = [];
            this.tags.forEach(element => {
                tags.push('tag-' + element.slug);
            });

            result = result + ' ' + tags.join(' ');
        }
        return result;
    }
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
        return '';
}

function addClass(cls, prefix, title) {
    return cls + ' ' + slugify(prefix + ' ' + title, {lower: true});
}
