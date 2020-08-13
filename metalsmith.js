var Metalsmith = require('metalsmith'),
	markdown   = require('metalsmith-markdown'),
	excerpts = require('metalsmith-excerpts'),
	collections = require('metalsmith-collections'),
	pagination = require('metalsmith-pagination'),
	permalinks  = require('metalsmith-permalinks'),
	tags = require('metalsmith-tags'),
	registerPartials = require('./partials.js'),
	registerHelpers = require('metalsmith-register-helpers'),
	layouts = require('metalsmith-layouts'),
	debug = require('metalsmith-debug'),
	updateMetadata = require('./metadata.js'),
	htmlMinifier = require('metalsmith-html-minifier'),
	feed = require('metalsmith-feed'),
	config = require('./config.js'),
	fs = require('fs');

module.exports = function(production){
	let ms = new Metalsmith(process.cwd());
	let metadata = JSON.parse(fs.readFileSync(config.metadata, {encoding: 'utf8'}));
	
	return initialize(ms, metadata, production);
};

function initialize(ms, metadata, production){
	ms.metadata({
		site: metadata
	})
	.source(config.source.content)
	.destination(config.destination.site)
	.use(updateMetadata())
	.use(collections({
		pages: {
			pattern: 'pages/*.md'
		},
		posts: {
			pattern: 'posts/*.md',
			sortBy: 'date',
			reverse: true
		}
	}))
	.use(markdown())
	.use(excerpts())
    .use(permalinks({
		pattern: ':title',
		relative: false,
		duplicatesFail: true
		/* linksets: [
			{
			  match: { collection: 'posts' },
			  pattern: 'blog/:date/:title',
			  date: 'mmddyy'
			},
			{
			  match: { collection: 'pages' },
			  pattern: 'pages/:title'
			}
		  ] */
	}))
	.use(pagination({
		'collections.posts': {
			perPage: config.pageSize,
		  	layout: 'index.hbs',
			first: 'index.html',
			noPageOne: false,
		  	path: 'page/:num/index.html',
			pageMetadata: {
				isPageIndex: true
		  	}
		}
	}))
	.use(tags({
		handle: 'tags',
		path:'tag/:tag/index.html',
		pathPage: "tag/:tag/page/:num/index.html",
  		perPage: config.pageSize,
		layout:'tag.hbs',
		sortBy: 'date',
		reverse: true,
		skipMetadata: false,
		metadataKey: "tags", // global tag list
		slug: { mode: 'rfc3986', remove: /[.]/g } // uses https://github.com/dodo/node-slug but can be replaced with a custom function
	}))
	.use(registerHelpers({
		directory: config.helpers
	}))
	.use(registerPartials({
		directory: config.layouts + '/partials'
	}))
	.use(layouts({
        engine: 'handlebars',
		directory: config.layouts,
		pattern: "**/*.html",
        default: 'post.hbs'
	}))
	.use(feed({
		collection: 'posts',
		destination: metadata.feedRss,
		limit: 15,
		preprocess: file => ({
			...file,
			url: file.url + '/',
			custom_elements: [
				{ 'content:encoded': { _cdata: file.contents } }
			],
			categories: file.tags && file.tags.length > 0 ? file.tags.map(element => element.name) : null
		}),
		author: metadata.author.name,
		image_url: metadata.feedImage,
		ttl: 60
	})); 

	if (production) {
		ms.use(htmlMinifier({
			"removeAttributeQuotes": false,
        	"keepClosingSlash": true
		}));
	}

	return ms.use(debug()); // set environment variable DEBUG=metalsmith:*
}
