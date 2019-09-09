module.exports = function() {
    if (this.collection.includes('home'))
        return 'home-template';
    else if (this.collection.includes('posts'))
        return 'post-template'; // plus add post tags: tag-one-slug, tag-two-slug
    else if (this.collection.includes('pages'))
        return 'page-template'; // plus add page-title-slug
    else 
        return 'tag-template'; // plus tag-slug
}
