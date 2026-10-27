PARKED FEATURE (not loaded by the app): clip-art & picture search.
clipart.js searches Pixabay (free key), Wikimedia Commons and Iconify, shows 10 results with "More like this" refinement and
"Add to assets" into the left-panel Assets list. It was built as v3.99 beta but taken out before publishing.

To bring it back:
 1. Move clipart.js to js/ and add <script src="js/clipart.js"></script> after groups.js in index.html (and 'js/clipart.js' to the SHELL list in sw.js).
 2. In index.html's Content-Security-Policy add to connect-src: https://api.iconify.design https://pixabay.com https://cdn.pixabay.com https://commons.wikimedia.org https://upload.wikimedia.org https://thumb.wikimedia.org
    and to img-src: https://pixabay.com https://cdn.pixabay.com https://upload.wikimedia.org https://thumb.wikimedia.org
 3. In js/groups.js add a button with id grpClip in the "Assets & saved groups" header, and: $('#grpClip').onclick = ()=> MS.clipart && MS.clipart.open();
 4. Update the "no outside connections" text in make-download.ps1 and THIRD-PARTY-NOTICES.txt, bump js/version.js.
Not yet tested: the Pixabay source (needs a key). Wikimedia and Iconify were tested.
