## DLCS Workbench

This repository contains scripts for ingesting files in Digirati's [Digital Library Cloud Services](https://iiif-cloud.digirati.com/) (DLCS). The DLCS is used as a [IIIF](https://iiif.io/) Server for hosting images presented on [heritage.tudelft.nl](https://heritage.tudelft.nl/) and other applications. These scripts are used for adding new images to the server and manupulating existing records using the [DLCS API](https://dlcs-book.readthedocs.io/en/latest/API_Reference/introduction.html).

## Get started

First install [Bun](https://bun.sh/).

To install dependencies run the following command in the root of the repository:

```bash
bun install
```

## Setting environment variables

The following environment variables need to be set:

```
DLCS_CUSTOMER_ID=
DLCS_API_KEY=
WEBDAV_USER=
WEBDAV_PASS=
```

You can do this by adding a `.env` file to the root of the repository and adding the lines above with the corresponding values after `=`.

## Settings

Additional settings can be customized in the `settings.json` file in the root of the repository.

## Webdav to DLCS ingest collection

_This will only work on the TU Delft network or with an active [eduVPN](https://www.eduvpn.org/client-apps/) connection._

```bash
bun src/webdav.ts [path] --options
```

Will write output file to the `_data/` folder.

Options:
- `--space [number]` DLCS space to use. Defaults to `16` (test).
- `--raw` Write raw JSON output of WebDAV listing.
- `--include-directories` Include directories in raw output.
- `--recursive` List subfolders. Caution: infinite depth!
- `--filter [jpg|tif|mp4|MIME type]` Filter for certain file types. See also [Common MIME types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types).
- `--regex [pattern]` Regex pattern to match against path. Can be used to populate the values for `string1`, `string2` and/or `string3`, see below.
- `--string1 [value]` Value for string1 field. 
- `--string2 [value]` Value for string2 field. 
- `--string3 [value]` Value for string3 field.
- `--number1 [value]` Initial value for number1 field. Defaults to `0`.
- `--output [filename]` Filename for output (without extension). Defaults to upper folder name.
- `--batches` Create separate files with batches of max 1000 items.

### Regex patterns

You might want to base the values for `string1`, `string2` and/or `string3` on segments of the file path, such as the filename or a subfolder. This is possible by providing a [regex pattern](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions) and using named groups. Example:

Path: `/staff-umbrella/digitalcollections/library/magazijn/oclc-72677405-delta/delta/tif/1983/01`

Regex pattern: `\/delta\/tif\/(?<string2>.*?)\/(?<string3>.*?)`

Command:

```bash
bun src/webdav.ts /staff-umbrella/digitalcollections/library/magazijn/oclc-72677405-delta/delta/tif \
    --recursive \
    --output delta \
    --filter tif \
    --regex "\/delta\/tif\/(?<string2>.*?)\/(?<string3>.*?)\/" \
    --space 29 \
    --string1 delta \
    --batches
```

The script will list files for which no matches were found. If values for `string1`, `string2` and `string3` were provided as part of the options, those have been used instead.

## DLCS operations

```bash
bun src/dlcs.ts [path(s) to files] --options
```

Options:
- `--list-spaces` List the available spaces. Output to console.
- `--list-images [space]` List the images in the provided space. Will write output file to `_data` folder.
- `--full` List all the images in the space. To be used with `--list-images`
- `--string1 [value]` Query the selected space for images with the provided value for `string1`. To be used with `list-images`.
- `--string2 [value]` Query the selected space for images with the provided value for `string2`. To be used with `list-images`.
- `--string3 [value]` Query the selected space for images with the provided value for `string3`. To be used with `list-images`.
- `--ingest` Ingests the input collection(s). Returns the batch URL(s).
- `--batches` Creates batches when the ingest collection is too large. To be used with `--ingest`
- `--delete` Deletes the images in the input collection(s).
- `--patch` Patches the `string1`, `string2`, `string3`, `number1`, `number2`, `number3` fields of the images in the input collection(s).

---

This project was created using `bun init` in bun v1.0.23. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
