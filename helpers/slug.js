var slugify = require('slugify');

module.exports = function() {
    if (this.label) {
        return slug(this.label);
    }

    return '';
}

function slug(input){
    return slugify(input, {lower: true});
}