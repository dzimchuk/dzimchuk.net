module.exports = function(options){
    if (this.url){
        return this.url;
    }
    else if (this.path){
        return format.call(this, this.path, options.hash.absolute);
    }
    else{
        return '';
    }
}

function format(path, absolute){
    return (absolute && this.site ? this.site.url : '') + '/' + path + '/';
}