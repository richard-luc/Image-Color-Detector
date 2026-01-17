# Image Color Detector

A static website that lets clients upload an image and detect its colors directly in the browser.

## How to run

Open `index.html` in a browser.

## Features

- Upload PNG, JPG, WEBP, or SVG images.
- Drag and drop support.
- Exact pixel color counts for visible pixels.
- Smart palette mode that groups near-identical anti-aliased colors.
- Transparent pixels are ignored.
- Copy detected HEX colors.

## Accuracy note

Exact mode reports the actual visible RGB pixels the browser can read from the image. Smart palette mode is intentionally grouped so it is more useful for brand-color extraction.
