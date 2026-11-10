/* reader.js — PDF.js loading, spread logic, page rendering with a small
   render cache. Spread logic (task spec):
     - page 1 alone (front cover), last page alone if N > 1 (back cover)
     - middle pages 2..N-1 paired (2-3), (4-5), ...; a lone middle page stays alone
   Pure function computeSpreads() is exported for Node tests. */
(function (global) {
  'use strict';

  function computeSpreads(numPages, singlePage) {
    var spreads = [];
    if (!numPages || numPages < 1) return spreads;
    if (singlePage) {
      for (var i = 1; i <= numPages; i++) spreads.push([i]);
      return spreads;
    }
    if (numPages === 1) return [[1]];
    spreads.push([1]);
    var lastMiddle = numPages - 1;
    var p = 2;
    while (p <= lastMiddle) {
      if (p + 1 <= lastMiddle) { spreads.push([p, p + 1]); p += 2; }
      else { spreads.push([p]); p += 1; }
    }
    spreads.push([numPages]);
    return spreads;
  }

  function spreadIndexForPage(spreads, page) {
    for (var i = 0; i < spreads.length; i++) {
      if (spreads[i].indexOf(page) !== -1) return i;
    }
    return 0;
  }

  var Reader = {
    computeSpreads: computeSpreads,
    spreadIndexForPage: spreadIndexForPage,
    pdfDoc: null,
    book: null,
    numPages: 0,
    spreads: [],
    spreadIndex: 0,
    zoom: 1,            // 1 = fit
    singlePage: false,
    cache: new Map(),   // pageNum -> HTMLCanvasElement (rendered, offscreen or adoptable)
    stageEl: null,      // set by app.js at startup (and refreshed by renderCurrent args)
    bookEl: null,
    renderToken: 0,
    onProgress: null,   // fn(loaded, total)
    onRender: null,     // fn() after a spread is in the DOM

    isSinglePageMode: function () {
      return this.singlePage || (global.innerWidth && global.innerWidth < 900);
    },

    load: function (book, url) {
      var self = this;
      this.close();
      this.book = book;
      if (!global.pdfjsLib) return Promise.reject(new Error('PDF.js failed to load.'));
      global.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs/pdf.worker.min.js?v=20261110g';
      var loadingTask = global.pdfjsLib.getDocument({
        url: url,
        // range / streaming so the first spread appears before the whole file arrives
        disableAutoFetch: false,
        disableStream: false,
        rangeChunkSize: 65536 * 4
      });
      if (this.onProgress) {
        loadingTask.onProgress = function (p) { self.onProgress(p.loaded || 0, p.total || 0); };
      }
      return loadingTask.promise.then(function (doc) {
        self.pdfDoc = doc;
        self.numPages = doc.numPages;
        self.spreads = computeSpreads(doc.numPages, self.isSinglePageMode());
        self.spreadIndex = 0;
        self.cache.clear();
        return doc;
      });
    },

    close: function () {
      this.renderToken++;
      if (this.pdfDoc) { try { this.pdfDoc.destroy(); } catch (e) {} }
      this.pdfDoc = null; this.numPages = 0; this.spreads = []; this.spreadIndex = 0;
      this.cache.clear();
    },

    currentPages: function () { return this.spreads[this.spreadIndex] || []; },

    goToSpread: function (idx) {
      idx = Math.max(0, Math.min(idx, this.spreads.length - 1));
      this.spreadIndex = idx;
      return this.renderCurrent();
    },
    next: function () { return this.goToSpread(this.spreadIndex + 1); },
    prev: function () { return this.goToSpread(this.spreadIndex - 1); },
    goToPage: function (page) {
      page = Math.max(1, Math.min(page, this.numPages));
      return this.goToSpread(spreadIndexForPage(this.spreads, page));
    },
    recomputeSpreads: function (keepPage) {
      var first = keepPage || (this.currentPages()[0] || 1);
      this.spreads = computeSpreads(this.numPages, this.isSinglePageMode());
      this.spreadIndex = spreadIndexForPage(this.spreads, first);
    },

    /* Render one PDF page into a .page-wrap element (canvas + text layer + label).
       Returns a promise. Uses / fills the small render cache. */
    renderPageInto: function (pageNum, wrap, cssScale) {
      var self = this;
      var doc = this.pdfDoc;
      var dpr = global.devicePixelRatio || 1;
      return doc.getPage(pageNum).then(function (page) {
        var viewportCss = page.getViewport({ scale: cssScale });
        var viewport = page.getViewport({ scale: cssScale * dpr });
        var surface = wrap.querySelector('.page-surface');
        surface.style.width = Math.floor(viewportCss.width) + 'px';
        surface.style.height = Math.floor(viewportCss.height) + 'px';

        var canvas = self.cache.get(pageNum);
        var renderPromise;
        if (canvas && canvas.width === Math.floor(viewport.width)) {
          // adopt cached canvas
          self.cache.delete(pageNum);
          surface.insertBefore(canvas, surface.firstChild);
          renderPromise = Promise.resolve();
        } else {
          canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = Math.floor(viewportCss.width) + 'px';
          canvas.style.height = Math.floor(viewportCss.height) + 'px';
          canvas.setAttribute('aria-label', 'Page ' + pageNum);
          surface.insertBefore(canvas, surface.firstChild);
          renderPromise = page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
        }
        var textLayerDiv = surface.querySelector('.textLayer');
        textLayerDiv.style.width = Math.floor(viewportCss.width) + 'px';
        textLayerDiv.style.height = Math.floor(viewportCss.height) + 'px';
        textLayerDiv.style.setProperty('--scale-factor', cssScale);
        var textPromise = page.getTextContent().then(function (textContent) {
          textLayerDiv.innerHTML = '';
          if (global.pdfjsLib.renderTextLayer) {
            return global.pdfjsLib.renderTextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport: viewportCss,
              textDivs: []
            }).promise;
          }
          return null;
        }).catch(function () { /* text layer is best-effort; canvas still shows */ });
        return Promise.all([renderPromise, textPromise]);
      });
    },

    /* Compute a CSS scale that fits the current spread in the stage. */
    fitScale: function (stageEl) {
      var doc = this.pdfDoc;
      if (!doc) return Promise.resolve(1);
      var pages = this.currentPages();
      var availW = Math.max(200, stageEl.clientWidth - 48);
      var availH = Math.max(200, stageEl.clientHeight - 90);
      var self = this;
      return Promise.all(pages.map(function (n) { return doc.getPage(n); })).then(function (pdfPages) {
        var totalW = 0, maxH = 0;
        pdfPages.forEach(function (pg) {
          var v = pg.getViewport({ scale: 1 });
          totalW += v.width; if (v.height > maxH) maxH = v.height;
        });
        if (pages.length === 2) totalW += 6; // gutter
        var s = Math.min(availW / totalW, availH / maxH);
        return Math.max(0.1, s) * self.zoom;
      });
    },

    renderCurrent: function (stageEl, bookEl) {
      var self = this;
      if (!this.pdfDoc) return Promise.resolve();
      // Navigation (goToSpread/next/prev/goToPage) calls renderCurrent() with
      // no arguments — fall back to the elements registered by app.js.
      if (stageEl) this.stageEl = stageEl;
      if (bookEl) this.bookEl = bookEl;
      stageEl = stageEl || this.stageEl;
      bookEl = bookEl || this.bookEl;
      if (!stageEl || !bookEl) return Promise.resolve();
      var token = ++this.renderToken;
      return this.fitScale(stageEl).then(function (scale) {
        if (token !== self.renderToken) return;
        bookEl.innerHTML = '';
        var pages = self.currentPages();
        var isCover = pages.length === 1 && (pages[0] === 1 || pages[0] === self.numPages) && self.numPages > 1;
        bookEl.dataset.mode = pages.length === 2 ? 'spread' : (isCover ? 'cover' : 'single');
        // stack-of-pages edge effect: thickness grows then shrinks through the book
        var progress = self.numPages > 1 ? (pages[0] - 1) / (self.numPages - 1) : 0;
        bookEl.style.setProperty('--edge-left', Math.round(2 + progress * 8) + 'px');
        bookEl.style.setProperty('--edge-right', Math.round(10 - progress * 8) + 'px');

        var wraps = pages.map(function (pageNum, idx) {
          var wrap = document.createElement('div');
          wrap.className = 'page-wrap' + (pages.length === 2 ? (idx === 0 ? ' page-left' : ' page-right') : ' page-single');
          wrap.dataset.page = pageNum;
          wrap.innerHTML =
            '<div class="page-surface"><div class="textLayer"></div><div class="annotation-layer"></div>' +
            '<button type="button" class="page-edge edge-prev" aria-label="Previous page"></button>' +
            '<button type="button" class="page-edge edge-next" aria-label="Next page"></button></div>' +
            '<div class="page-number">Page ' + pageNum + ' of ' + self.numPages + '</div>';
          bookEl.appendChild(wrap);
          return { pageNum: pageNum, wrap: wrap };
        });
        bookEl.classList.remove('flip-in');
        // re-trigger the flip/fade animation
        void bookEl.offsetWidth;
        bookEl.classList.add('flip-in');

        return Promise.all(wraps.map(function (w) { return self.renderPageInto(w.pageNum, w.wrap, scale); }))
          .then(function () {
            if (token !== self.renderToken) return;
            self.evictDistant(pages);
            self.prefetchAdjacent();
            if (self.onRender) self.onRender(wraps);
          });
      });
    },

    prefetchAdjacent: function () {
      var self = this;
      if (!this.pdfDoc) return;
      var wanted = [];
      [this.spreadIndex + 1, this.spreadIndex - 1].forEach(function (si) {
        if (self.spreads[si]) self.spreads[si].forEach(function (n) { wanted.push(n); });
      });
      var stageLikeScale = null;
      wanted.forEach(function (pageNum) {
        if (self.cache.has(pageNum)) return;
        self.pdfDoc.getPage(pageNum).then(function (page) {
          // Prefetch at scale 1 * dpr is not the display scale; rendering to cache at the
          // current display scale happens in renderPageInto on demand. Here we only warm
          // PDF.js's own page cache (text + operator list) so the flip is fast.
          return page.getTextContent().then(function () { return page.getOperatorList ? page.getOperatorList() : null; });
        }).then(function () { if (stageLikeScale) {} }).catch(function () {});
      });
    },

    evictDistant: function (currentPages) {
      var self = this;
      this.cache.forEach(function (_canvas, pageNum) {
        var near = currentPages.some(function (n) { return Math.abs(n - pageNum) <= 4; });
        if (!near) self.cache.delete(pageNum);
      });
    }
  };

  global.TCMReader = Reader;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { computeSpreads: computeSpreads, spreadIndexForPage: spreadIndexForPage, Reader: Reader };
  }
})(typeof window !== 'undefined' ? window : globalThis);
