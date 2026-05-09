const {extname} = require('node:path');
const {DomUtils, parseDocument} = require('htmlparser2');

function isHtml(file) {
    return /\.html?/.test(extname(file));
}

function containsImage(paragraph) {
    return DomUtils.getElementsByTagName('img', paragraph.children, true).length > 0;
}

function findExcerptParagraph(contents) {
    const document = parseDocument(contents);
    const paragraphs = DomUtils.getElementsByTagName('p', document, true);

    return paragraphs.find(paragraph => !containsImage(paragraph));
}

module.exports = function excerpts(options) {
    options = options || {};

    return function(files, metalsmith, done) {
        Object.keys(files).forEach(file => {
            if (!isHtml(file)) {
                return;
            }

            const data = files[file];

            if (typeof data.excerpt === 'string' && data.excerpt.length > 0) {
                return;
            }

            const paragraph = findExcerptParagraph(data.contents.toString());
            const html = paragraph ? DomUtils.getOuterHTML(paragraph).trim() : '';

            if (options.multipleFormats) {
                data.excerpt = {
                    html,
                    text: paragraph ? DomUtils.textContent(paragraph).trim() : ''
                };
            } else {
                data.excerpt = html;
            }
        });

        done();
    };
};
