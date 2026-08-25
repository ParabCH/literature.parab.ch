# PSNG Medien Blog

Hugo site for <http://literatur.psng.info/>. Push to `main` and it deploys itself.

## Run this once after cloning

```
git config core.hooksPath .githooks
```

`git clone` does not copy this. Without it, nothing stops you from committing a file or
folder name that breaks the repo on Windows: `< > : " | ? * \`, trailing spaces, trailing
dots. Umlauts are fine.

## Everything else

```
hugo server -D                                        # preview on localhost:1313
hugo new content --kind post "posts/Titel/index.md"   # new post (--kind post is required)
hugo --minify                                         # build into public/
```

Needs Hugo **extended**. Images go in `static/images/`, referenced as
`image: "/images/foo.jpg"` in the post front matter.

## Posts without a picture

Nothing to do — Hugo makes the cover. A post with no `image:` (or one that points at a
file which is not there) gets a tile with its title, author and publication in the colours
of its category, PSNG logo top right.

On the page itself the tile is HTML, not a picture: `layouts/partials/post-cover.html`
plus `assets/scss/_cover.scss`. The text stays sharp at every size and costs no download.

For the preview when someone shares the link, `layouts/partials/post-og-image.html` writes
a real 1200x750 JPEG during the build, from a base picture under `assets/cover/` and the
fonts under `assets/fonts/`.

Got a real picture? Drop it into `static/images/`, add the `image:` line, and it wins over
the tile.

Change the colours or add a category in `layouts/partials/cover-theme.html`. The base
pictures carry the same colours, so run `python3 scripts/make-cover-bases.py` afterwards
and commit what it writes. That is the only step that needs Python, and only when the
look changes.

## Ratings, comments, edit proposals, submissions

All four talk to [literatur-backend](../literatur-backend), a small Go service. The blog
side is configured in `[params.comments]` in `hugo.toml`: `apiBase` for the published
site, `devApiBase` for `hugo server`. Both empty = none of it loads and the site behaves
as before. The scripts in `assets/js/` (`rating.js`, `comments.js`, `edit.js`) are
vendored from the backend repo with `make vendor` over there — edit them there, not here.

Ratings and comments live in the backend's SQLite database. Edit proposals and reader
submissions (`/einreichen/`) arrive as pull requests on this repo, one commit each,
posts as `draft: true`:

```
content/posts/<Titel>/index.md
static/images/<slug>.jpg
```

Read the PR, flip the draft flag, merge. No cover? Drop the `image:` line and Hugo builds
a tile. If the backend is unreachable, the submission form falls back to downloading the
`.md` and asking the sender to mail it to `[params.submit].mailTo`.
