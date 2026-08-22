# PSNG Literatur Blog

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
python3 scripts/generate-post-images.py               # fill in missing post images
```

Needs Hugo **extended**. Images go in `static/images/`, referenced as
`image: "/images/foo.jpg"` in the post front matter.

A post whose image file is missing shows no image at all. The script finds those posts by
itself and builds a tile for each — title, author and category in the site colours, PSNG
logo top right. `--dry-run` lists what it would do.

Got a real picture? Drop it into `static/images/` under the name the front matter uses. The
script never overwrites it: `--force` only rebuilds tiles it made itself.

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

Read the PR, flip the draft flag, merge. No cover? Drop the `image:` line and let
`generate-post-images.py` build a tile. If the backend is unreachable, the submission
form falls back to downloading the `.md` and asking the sender to mail it to
`[params.submit].mailTo`.
