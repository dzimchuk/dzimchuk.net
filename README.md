# dzimchuk.net
This is my [blog](https://dzimchuk.net) where I share my experience and knowledge in software development. It gets built with [Metalsmith](https://github.com/segmentio/metalsmith) and [gulp](https://github.com/gulpjs/gulp).

## Commands

1. `npm run dev` - Run a development build
1. `npm run debug` - Run a development build in debug mode
1. `npm run production` - Run a production build
1. `npm run start` - Run a development build, start the development server and watchers
1. `npm run watch` - Start the gulp watchers
1. `npm run serve` - Start the development server

All build commands accept `--media-url=<base url>` (e.g. `npm run production -- --media-url=https://blogcontent.azureedge.net/`).

## Media

Images and other files live in `content/media` and are referenced from content as site-relative `/media/...` URLs
(e.g. `![](/media/2017/08/cover3.jpg)`). At build time these references are rewritten to the base URL given by
`--media-url` (default: `/media/`):

- If the media URL points to the site itself (a relative path or a URL under `url` from `content/metadata.json`),
  `content/media` is published with the site at that path.
- Otherwise (e.g. a CDN), media isn't published with the site and is expected to be uploaded separately.

## Deployment

### Azure Storage static website

[azure-storage-static-website.yml](.github/workflows/azure-storage-static-website.yml) runs on every push to `master`.
It builds with `--media-url=https://blogcontent.azureedge.net/` and uploads the site to the `$web` container.
Media files are uploaded manually to the container behind the `blogcontent.azureedge.net` CDN endpoint.
