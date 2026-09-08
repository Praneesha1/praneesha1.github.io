# Gajadi Praneesha · Mechanical design portfolio

A static portfolio site. No build step. Open `index.html` through any web server.

## What is inside

| Path | What it is |
|---|---|
| `index.html` | Home page. Five views: Home, About me, Skills, Projects, Contact. The nav switches between them. |
| `projects/engine.html` | Four cylinder engine with the 3D viewer. |
| `projects/ornithopter.html` | Ornithopter with the 3D viewer. |
| `projects/components.html` | Six small parts. Pictures and the hinge video. |
| `assets/models/*.glb` | The 3D models. Made from the Fusion 360 OBJ exports. |
| `assets/js/viewer.js` | The viewer. Orbit, view presets, explode, section cut, parts list, motion. |
| `assets/js/models.js` | Part names, explode directions, and the motion maths for each model. |
| `assets/js/main.js` | Nav, theme switch, view switching, reveal on scroll. |
| `assets/css/style.css` | All styles. Dark graphite by default. Light paper theme with the switch in the nav. |
| `assets/Gajadi_Praneesha_Resume.pdf` | The resume linked from the site. Replace this file to update it. |
| `vendor/three/` | three.js 0.170, copied locally so the site works without a CDN. |

The three original project folders are the downloads from GitHub. The site does not read from them. You can delete them or keep them.

## Run it on your computer

The viewer loads model files, so the page must come from a web server. Double clicking `index.html` will not load the models.

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765 in your browser.

## Put it online with GitHub Pages

1. Make a new repository on GitHub. Name it `praneesha1.github.io` if you want the short address.
2. Upload every file and folder in this directory. Keep the folder structure.
3. In the repository go to Settings, then Pages. Set Source to "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
4. Wait a minute. The site will be at `https://praneesha1.github.io/` or at `https://praneesha1.github.io/<repo-name>/`.

## Update the models

1. In Fusion 360 open the design. File, Export, type OBJ. Save the `.obj` and `.mtl` into the project folder.
2. Run the converter. It writes the GLB files and sets the part names.

```bash
python3 tools/obj2glb.py
```

If you rename parts in `tools/obj2glb.py`, use the same names in `assets/js/models.js`.

## Edit the text

All page text lives in the HTML files. Search for the sentence you want to change and edit it there.
