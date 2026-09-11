# Assets

Static assets imported by components: images, icons that are too large to inline,
and fonts if they are ever self-hosted.

Two conventions:

- **Icons live in `src/components/Icon.tsx`**, not here. They are inline SVG so
  they inherit `currentColor` and always match the text beside them.
- **Files that need a stable public URL** (the favicon, `robots.txt`, an Open
  Graph image) belong in `demo-website/public/` instead. Vite copies that
  directory verbatim; files here are processed and content-hashed.

Currently empty - the interface is drawn entirely with CSS and inline SVG,
which keeps the page fast and every graphic themeable.
