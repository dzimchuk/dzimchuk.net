module.exports = function(options){
    return options.fn({ name: this.tag });
}