/* export.js — write annotations back into the ORIGINAL PDF with pdf-lib.
   Uses low-level annotation dictionaries so the results are REAL PDF
   annotations (editable in Acrobat / Edge / Chrome / Preview):
     sticky    -> /Text annotation       (Contents + Title)
     highlight -> /Highlight annotation  (QuadPoints + colour, CA 0.5)
     textbox   -> /FreeText annotation   (Rect + Contents + DA + appearance stream)
   UI fractions use a TOP-LEFT origin; PDF uses BOTTOM-LEFT. Conversion:
     pdfX = x * pageWidth
     pdfY(top of a rect)    = pageHeight - y * pageHeight
     pdfY(bottom of a rect) = pageHeight - (y + h) * pageHeight
   The original document is loaded with PDFDocument.load and only /Annots are
   added, so page order, sizes, bookmarks and links are preserved untouched. */
(function (global) {
  'use strict';

  function getLib() { return global.PDFLib || null; }

  function hexToRgb01(hex) {
    var h = String(hex || '#FFAE4D').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return [1, 0.68, 0.3];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* Fraction rect -> PDF rect [x1, y1(bottom), x2, y2(top)] */
  function fracRectToPdf(x, y, w, h, pageW, pageH) {
    return [x * pageW, pageH - (y + h) * pageH, (x + w) * pageW, pageH - y * pageH];
  }

  /* Fraction rects -> QuadPoints (per rect: UL, UR, LL, LR in PDF coords) */
  function quadPointsForRects(rects, pageW, pageH) {
    var out = [];
    (rects || []).forEach(function (r) {
      var x1 = r.x * pageW, x2 = (r.x + r.w) * pageW;
      var yTop = pageH - r.y * pageH, yBottom = pageH - (r.y + r.h) * pageH;
      out.push(x1, yTop, x2, yTop, x1, yBottom, x2, yBottom);
    });
    return out;
  }

  function escapePdfText(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
      .replace(/[\r\n]+/g, ' ');
  }

  function wrapLines(text, maxChars) {
    var lines = [];
    String(text || '').split('\n').forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); return; }
      var cur = '';
      words.forEach(function (w) {
        if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; }
        else cur = (cur + ' ' + w).trim();
      });
      if (cur) lines.push(cur);
    });
    return lines.slice(0, 40);
  }

  function appendAnnot(page, ref, L) {
    var context = page.doc.context;
    var existing = null;
    try { existing = page.node.lookup(L.PDFName.of('Annots')); } catch (e) { existing = null; }
    if (existing && typeof existing.push === 'function' && existing.constructor && existing.constructor.name === 'PDFArray') {
      existing.push(ref);
    } else if (existing && global.PDFLib && existing instanceof global.PDFLib.PDFArray) {
      existing.push(ref);
    } else {
      page.node.set(L.PDFName.of('Annots'), context.obj([ref]));
    }
  }

  /* Add all annotations to an already-loaded PDFDocument. Returns count added. */
  function addAnnotationsToDoc(doc, annotations, studentName, L) {
    L = L || getLib();
    if (!L) throw new Error('pdf-lib is not loaded.');
    var context = doc.context;
    var pages = doc.getPages();
    var added = 0;
    var fontRef = null;
    function getFontRef() {
      if (fontRef) return fontRef;
      fontRef = context.register(context.obj({
        Type: L.PDFName.of('Font'), Subtype: L.PDFName.of('Type1'),
        BaseFont: L.PDFName.of('Helvetica'), Encoding: L.PDFName.of('WinAnsiEncoding')
      }));
      return fontRef;
    }

    (annotations || []).forEach(function (ann) {
      var page = pages[ann.page - 1];
      if (!page) return;
      var size = page.getSize();
      var W = size.width, H = size.height;
      var title = studentName ? String(studentName) : 'Student';
      var dict = context.obj({});
      dict.set(L.PDFName.of('Type'), L.PDFName.of('Annot'));
      dict.set(L.PDFName.of('F'), L.PDFNumber.of(4)); // print flag

      if (ann.type === 'sticky') {
        var px = ann.x * W, py = H - ann.y * H;
        dict.set(L.PDFName.of('Subtype'), L.PDFName.of('Text'));
        dict.set(L.PDFName.of('Rect'), context.obj(fracRectToPdf(ann.x, ann.y, 0.001, 0.001, W, H).map(function (v, i) {
          // small 20pt square centred near the anchor instead of a degenerate rect
          return [px, py - 20, px + 20, py][i];
        })));
        dict.set(L.PDFName.of('Contents'), L.PDFHexString.fromText(ann.text || ''));
        dict.set(L.PDFName.of('Title'), L.PDFHexString.fromText(title));
        dict.set(L.PDFName.of('C'), context.obj(hexToRgb01(ann.color || '#F0941C')));
        dict.set(L.PDFName.of('Open'), L.PDFBool.False);
        dict.set(L.PDFName.of('Name'), L.PDFName.of('Comment'));
      } else if (ann.type === 'highlight') {
        var rects = ann.rects && ann.rects.length ? ann.rects : [{ x: ann.x, y: ann.y, w: ann.w || 0.1, h: ann.h || 0.02 }];
        var quad = quadPointsForRects(rects, W, H);
        var minX = Math.min.apply(null, quad.filter(function (_v, i) { return i % 2 === 0; }));
        var maxX = Math.max.apply(null, quad.filter(function (_v, i) { return i % 2 === 0; }));
        var minY = Math.min.apply(null, quad.filter(function (_v, i) { return i % 2 === 1; }));
        var maxY = Math.max.apply(null, quad.filter(function (_v, i) { return i % 2 === 1; }));
        dict.set(L.PDFName.of('Subtype'), L.PDFName.of('Highlight'));
        dict.set(L.PDFName.of('Rect'), context.obj([minX, minY, maxX, maxY]));
        dict.set(L.PDFName.of('QuadPoints'), context.obj(quad));
        dict.set(L.PDFName.of('C'), context.obj(hexToRgb01(ann.color)));
        dict.set(L.PDFName.of('CA'), L.PDFNumber.of(0.5));
        dict.set(L.PDFName.of('Contents'), L.PDFHexString.fromText(ann.text || ''));
        dict.set(L.PDFName.of('Title'), L.PDFHexString.fromText(title));
      } else if (ann.type === 'textbox') {
        var w = (ann.w || 0.3), h = (ann.h || 0.06);
        var rect = fracRectToPdf(ann.x, ann.y, w, h, W, H);
        var boxW = Math.max(10, rect[2] - rect[0]), boxH = Math.max(10, rect[3] - rect[1]);
        var fontSize = 11;
        var lines = wrapLines(ann.text || '', Math.max(4, Math.floor(boxW / (fontSize * 0.55))));
        var content = 'BT /Helv ' + fontSize + ' Tf 0 0 0 rg 1 0 0 1 2 ' + (boxH - fontSize - 2) + ' Tm ' +
          (fontSize + 3) + ' TL ' + lines.map(function (ln, i) {
            return (i ? 'T* ' : '') + '(' + escapePdfText(ln) + ') Tj';
          }).join(' ') + ' ET';
        var apStream = context.stream(content, {
          Type: L.PDFName.of('XObject'), Subtype: L.PDFName.of('Form'),
          BBox: [0, 0, boxW, boxH],
          Resources: context.obj({ Font: context.obj({ Helv: getFontRef() }) })
        });
        var apRef = context.register(apStream);
        dict.set(L.PDFName.of('Subtype'), L.PDFName.of('FreeText'));
        dict.set(L.PDFName.of('Rect'), context.obj(rect));
        dict.set(L.PDFName.of('Contents'), L.PDFHexString.fromText(ann.text || ''));
        dict.set(L.PDFName.of('DA'), L.PDFString.of('0 0 0 rg /Helv ' + fontSize + ' Tf 0 g'));
        dict.set(L.PDFName.of('Q'), L.PDFNumber.of(0));
        dict.set(L.PDFName.of('DR'), context.obj({ Font: context.obj({ Helv: getFontRef() }) }));
        var ap = context.obj({}); ap.set(L.PDFName.of('N'), apRef);
        dict.set(L.PDFName.of('AP'), ap);
      } else {
        return;
      }
      var ref = context.register(dict);
      appendAnnot(page, ref, L);
      added++;
    });
    return added;
  }

  function annotatePdfBytes(pdfBytes, annotations, studentName, L) {
    L = L || getLib();
    return L.PDFDocument.load(pdfBytes).then(function (doc) {
      var n = addAnnotationsToDoc(doc, annotations, studentName, L);
      return doc.save().then(function (bytes) { return { bytes: bytes, count: n }; });
    });
  }

  /* Flatten: burn notes into page content. NON-editable by design. */
  function flattenPdfBytes(pdfBytes, annotations, studentName, L) {
    L = L || getLib();
    return L.PDFDocument.load(pdfBytes).then(function (doc) {
      return doc.embedFont(L.StandardFonts.Helvetica).then(function (font) {
        var pages = doc.getPages();
        var drawn = 0;
        (annotations || []).forEach(function (ann) {
          var page = pages[ann.page - 1];
          if (!page) return;
          var size = page.getSize(); var W = size.width, H = size.height;
          var c = hexToRgb01(ann.color || '#FFAE4D');
          var colour = L.rgb(c[0], c[1], c[2]);
          if (ann.type === 'highlight') {
            (ann.rects || []).forEach(function (r) {
              var rect = fracRectToPdf(r.x, r.y, r.w, r.h, W, H);
              page.drawRectangle({ x: rect[0], y: rect[1], width: rect[2] - rect[0], height: rect[3] - rect[1], color: colour, opacity: 0.45 });
            });
            drawn++;
          } else if (ann.type === 'sticky') {
            var px = ann.x * W, py = H - ann.y * H;
            page.drawRectangle({ x: px, y: py - 14, width: 14, height: 14, color: colour, opacity: 0.9 });
            wrapLines(ann.text || '', 42).slice(0, 6).forEach(function (ln, i) {
              page.drawText(ln, { x: px + 17, y: py - 11 - i * 12, size: 9, font: font, color: L.rgb(0.13, 0.12, 0.12) });
            });
            drawn++;
          } else if (ann.type === 'textbox') {
            var rect2 = fracRectToPdf(ann.x, ann.y, ann.w || 0.3, ann.h || 0.06, W, H);
            wrapLines(ann.text || '', Math.max(4, Math.floor((rect2[2] - rect2[0]) / 6))).forEach(function (ln, i) {
              page.drawText(ln, { x: rect2[0] + 2, y: rect2[3] - 12 - i * 14, size: 11, font: font, color: L.rgb(0.13, 0.12, 0.12) });
            });
            drawn++;
          }
        });
        return doc.save().then(function (bytes) { return { bytes: bytes, count: drawn }; });
      });
    });
  }

  /* ---------- browser-only helpers ---------- */
  function todayStamp() {
    var d = new Date();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function annotatedName(title) {
    return String(title).replace(/[\\/:*?"<>|]+/g, ' ').trim() + ' - Annotated - ' + todayStamp() + '.pdf';
  }
  function saveBlob(blob, filename) {
    if (global.showSaveFilePicker) {
      return global.showSaveFilePicker({ suggestedName: filename }).then(function (handle) {
        return handle.createWritable().then(function (w) {
          return w.write(blob).then(function () { return w.close(); });
        });
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        return anchorDownload(blob, filename);
      });
    }
    anchorDownload(blob, filename);
    return Promise.resolve();
  }
  function anchorDownload(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function fetchBookBytes(book) {
    return fetch('books/' + encodeURIComponent(book.file)).then(function (r) {
      if (!r.ok) throw new Error('Could not load ' + book.file + ' (HTTP ' + r.status + ')');
      return r.arrayBuffer();
    });
  }

  var TCMExport = {
    hexToRgb01: hexToRgb01,
    fracRectToPdf: fracRectToPdf,
    quadPointsForRects: quadPointsForRects,
    addAnnotationsToDoc: addAnnotationsToDoc,
    annotatePdfBytes: annotatePdfBytes,
    flattenPdfBytes: flattenPdfBytes,
    annotatedName: annotatedName,
    saveBlob: saveBlob,
    exportBook: function (book, annotations, studentName, flatten, onProgress) {
      if (onProgress) onProgress('Loading ' + book.title + '…');
      return fetchBookBytes(book).then(function (bytes) {
        if (onProgress) onProgress((flatten ? 'Flattening' : 'Embedding') + ' notes in ' + book.title + '…');
        var fn = flatten ? flattenPdfBytes : annotatePdfBytes;
        return fn(bytes, annotations, studentName);
      }).then(function (res) {
        var name = annotatedName(book.title) + (flatten ? '' : '');
        if (flatten) name = name.replace(' - Annotated - ', ' - Flattened (non-editable) - ');
        return saveBlob(new Blob([res.bytes], { type: 'application/pdf' }), name).then(function () { return res.count; });
      });
    },
    exportAll: function (books, annotationsByBook, studentName, onProgress) {
      var Zip = global.JSZip;
      if (!Zip) return Promise.reject(new Error('JSZip is not loaded.'));
      var zip = new Zip();
      var chain = Promise.resolve(); var included = 0; var skipped = [];
      books.forEach(function (book) {
        chain = chain.then(function () {
          if (onProgress) onProgress('Preparing ' + book.title + '…');
          return fetchBookBytes(book).then(function (bytes) {
            return annotatePdfBytes(bytes, annotationsByBook[book.id] || [], studentName);
          }).then(function (res) {
            zip.file(annotatedName(book.title), res.bytes);
            included++;
          }).catch(function () { skipped.push(book.title); });
        });
      });
      return chain.then(function () {
        if (!included) throw new Error('No book PDFs could be loaded. Skipped: ' + skipped.join(', '));
        if (onProgress) onProgress('Building ZIP…');
        return zip.generateAsync({ type: 'blob' }).then(function (blob) {
          return saveBlob(blob, 'TCM Train the Trainer - Annotated Books - ' + todayStamp() + '.zip')
            .then(function () { return { included: included, skipped: skipped }; });
        });
      });
    }
  };

  global.TCMExport = TCMExport;
  if (typeof module !== 'undefined' && module.exports) module.exports = TCMExport;
})(typeof window !== 'undefined' ? window : globalThis);
