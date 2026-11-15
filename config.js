module.exports = {
    source: {
        content: './content',
        styles: './assets/sass',
        scripts: './assets/js',
        media: 'media' // relative to content
    },
    mediaUrl: '/media/',
    destination: {
        site: './build',
        assets: './content/assets'
    },
    layouts: './layouts',
    helpers: './helpers',
    metadata: './content/metadata.json',
    pageSize: 10
}