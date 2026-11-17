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

### DigitalOcean App Platform

[digitalocean-app-platform.yml](.github/workflows/digitalocean-app-platform.yml) is run manually (`workflow_dispatch`).
It builds the site, including media (default `media_url` input: `https://dzimchuk.net/media/`), force-pushes the build output to the `do-site` branch and deploys the static site defined in [.do/app.yaml](.do/app.yaml) using
[digitalocean/app_action](https://github.com/digitalocean/app_action). App Platform doesn't build anything, it only serves the prebuilt files from its CDN.

Setup:

1. Create a DigitalOcean [personal access token](https://docs.digitalocean.com/reference/api/create-personal-access-token/)
   with App Platform create/read/update scopes and add it as the `DIGITALOCEAN_ACCESS_TOKEN` repository secret.
1. Run the workflow. The first run creates the app, subsequent runs update it.
   Use `/media/` as `media_url` to test on the `*.ondigitalocean.app` domain before switching the custom domain.

The app spec is applied as a whole on every run, so custom domains must be configured in `.do/app.yaml` rather than only in the control panel.
