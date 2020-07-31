module.exports = function(){
    if (this.url){
        return this.url;
    }
    else if (this.path){
        return format(this.path);
    }
    else{
        return '';
    }
}

function format(path){
    return '/' + path + '/';
}