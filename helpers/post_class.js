module.exports = function() {
    var result = 'post';
    if (this.collection.includes('posts'))
    {
        if (this.tags && this.tags.length > 0)
        {
            var tags = [];
            this.tags.forEach(element => {
                tags.push('tag-' + element.slug);
            });

            result = result + ' ' + tags.join(' ');
        }
    }
    else if (this.collection.includes('pages'))
    {
        result += ' page';
    }
    
    return result;
}