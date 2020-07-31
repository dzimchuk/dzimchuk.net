var Metalsmith = require('metalsmith'),
	markdown   = require('metalsmith-markdown'),
	excerpts = require('metalsmith-excerpts')
	collections = require('metalsmith-collections'),
	pagination = require('metalsmith-pagination'),
	permalinks  = require('metalsmith-permalinks'),
	tags = require('metalsmith-tags'),
	registerPartials = require('./partials.js'),
	registerHelpers = require('metalsmith-register-helpers'),
	layouts = require('metalsmith-layouts'),
	serve = require('metalsmith-serve'),
	debug = require('metalsmith-debug');

var pageSize = 5;

Metalsmith(__dirname)
	.metadata({
		site: {
			name: 'Andrei Dzimchuk',
			description: "I build solutions on Microsoft Azure and write about it here",
			lang: 'en',
			cover_image: 'https://blogcontent.azureedge.net/2017/08/cover3.jpg',
			navigation: [
				{ label: 'Home', url: '/' },
				{ label: 'Cloud Patterns', url: '/tag/cloud-patterns/' },
				{ label: 'Service Fabric', url: '/tag/azure-service-fabric/' },
				{ label: 'Azure AD', url: '/tag/azure-active-directory/' },
				{ label: 'Azure Services', url: '/tag/azure-services/' },
				{ label: 'About', url: '/about/' }
			]
		}
	})
	.source('./src')
	.destination('./build')
	.use(collections({
		pages: {
			pattern: 'content/pages/*.md'
		},
		posts: {
			pattern: 'content/posts/*.md',
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
			perPage: pageSize,
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
  		perPage: pageSize,
		layout:'tag.hbs',
		sortBy: 'date',
		reverse: true,
		skipMetadata: false,
		metadataKey: "tags", // global tag list
		slug: { mode: 'rfc3986', remove: /[.]/g } // uses https://github.com/dodo/node-slug but can be replaced with a custom function
	}))
	.use(registerHelpers({
		directory: './helpers'
	}))
	.use(registerPartials({
		directory: './layouts/partials'
	}))
	.use(layouts({
        engine: 'handlebars',
        directory: './layouts',
        default: 'post.hbs'
	}))
	//.use(serve())
	.use(debug()) // set environment variable DEBUG=metalsmith:*
    .build(function (err, files) { if(err) console.log(err) });