# PSNG Literatur Blog

Hugo site for <https://literature.parab.ch/>. Push to `main` and it deploys itself.

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

## Reader submissions (`/einreichen/`)

A form that writes the post for you: guided fields, live preview, then the browser uploads
the `index.md` and the cover to Cloudinary and opens your mail program with the download
links. Configured in `[params.submit]` in `hugo.toml`.

The Cloudinary upload preset must be **unsigned**, and its allowed formats must include
`md` next to the image types — otherwise the cover arrives and the post text does not.

Each mail names its target paths. Submissions come in as `draft: true`:

```
content/posts/<Titel aus der Mail>/index.md
static/images/<slug aus der Mail>.jpg
```

Read it, flip the draft flag, commit. No cover? Drop the `image:` line and let
`generate-post-images.py` build a tile.
