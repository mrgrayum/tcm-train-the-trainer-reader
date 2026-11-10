/* app.js — wires everything together: library from books.json, reader,
   notes, export/backup, keyboard, swipe, restore of last position. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), bookEl = $('book'), appEl = $('app');
  var books = [];
  var currentBook = null;
  var countsByBook = {};
  var wasSingle = null;
  var touchStartX = null;
  var bookLoading = false; // true only while openBook() is actively opening a book

  var Reader = window.TCMReader, Notes = window.TCMNotes,
      Storage = window.TCMStorage, Export = window.TCMExport;
  // Register the stage elements once — Reader navigation renders through these.
  Reader.stageEl = stage; Reader.bookEl = bookEl;

  /* ---------- settings ---------- */
  $('studentName').value = Storage.getSetting('studentName', '');
  $('studentName').addEventListener('change', function () {
    Storage.setSetting('studentName', $('studentName').value.trim());
  });
  function studentName() { return $('studentName').value.trim(); }

  /* ---------- welcome + banner ---------- */
  if (Storage.getSetting('welcomed', false)) $('welcome').classList.add('hidden');
  else $('storageBanner').classList.add('show');
  $('welcomeStart').addEventListener('click', function () {
    Storage.setSetting('welcomed', true);
    $('welcome').classList.add('hidden');
    $('storageBanner').classList.add('show');
  });
  $('bannerDismiss').addEventListener('click', function () { $('storageBanner').classList.remove('show'); });

  /* ---------- sidebar / tabs ---------- */
  $('btnSidebar').addEventListener('click', function () {
    var hidden = appEl.classList.toggle('sidebar-hidden');
    this.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    setTimeout(rerender, 60);
  });
  $('btnFocus').addEventListener('click', function () {
    var on = appEl.classList.toggle('focus-mode');
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
    setTimeout(rerender, 60);
  });
  $('btnTheme').addEventListener('click', function () {
    var dark = document.body.classList.toggle('stage-dark');
    this.setAttribute('aria-pressed', dark ? 'true' : 'false');
    Storage.setSetting('stageDark', dark);
  });
  if (Storage.getSetting('stageDark', false)) document.body.classList.add('stage-dark');

  function showTab(which) {
    $('tabLibrary').setAttribute('aria-selected', which === 'library' ? 'true' : 'false');
    $('tabNotes').setAttribute('aria-selected', which === 'notes' ? 'true' : 'false');
    $('bookList').style.display = which === 'library' ? '' : 'none';
    $('notesPanel').classList.toggle('open', which === 'notes');
    if (which === 'notes') renderNotesList();
  }
  $('tabLibrary').addEventListener('click', function () { showTab('library'); });
  $('tabNotes').addEventListener('click', function () { showTab('notes'); });
  $('notesScope').addEventListener('change', renderNotesList);

  /* ---------- library ---------- */
  function refreshCounts() {
    return Storage.getAll().then(function (all) {
      countsByBook = {};
      Object.keys(all).forEach(function (k) { countsByBook[k] = (all[k] || []).length; });
      document.querySelectorAll('.book-card').forEach(function (card) {
        var badge = card.querySelector('.note-badge');
        var n = countsByBook[card.dataset.bookId] || 0;
        if (badge) { badge.textContent = n + (n === 1 ? ' note' : ' notes'); badge.style.display = n ? '' : 'none'; }
      });
    });
  }

  function buildLibrary() {
    var list = $('bookList');
    list.innerHTML = '';
    books.forEach(function (book) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'book-card' + (currentBook && currentBook.id === book.id ? ' active' : '');
      card.dataset.bookId = book.id;
      card.setAttribute('role', 'listitem');
      card.innerHTML =
        '<span class="cover-fallback" aria-hidden="true">Book<br>cover</span>' +
        '<span class="meta"><span class="title"></span><span class="note-badge" style="display:none"></span><br>' +
        '<span class="desc"></span><br><span class="stats">PDF not loaded yet</span></span>';
      card.querySelector('.title').textContent = book.title;
      card.querySelector('.desc').textContent = book.description || '';
      card.style.borderLeftColor = (currentBook && currentBook.id === book.id) ? '' : (book.accent || 'transparent');
      card.addEventListener('click', function () { openBook(book); });
      list.appendChild(card);
      renderCoverThumb(book, card);
    });
    refreshCounts();
  }

  function renderCoverThumb(book, card) {
    if (!window.pdfjsLib || !book.file || book.file.indexOf('TODO') === 0) return;
    window.pdfjsLib.getDocument({ url: 'books/' + encodeURIComponent(book.file), disableAutoFetch: true, disableStream: true })
      .promise.then(function (doc) { return doc.getPage(1).then(function (page) { return { doc: doc, page: page }; }); })
      .then(function (r) {
        var v = r.page.getViewport({ scale: 0.12 });
        var c = document.createElement('canvas');
        c.width = v.width; c.height = v.height;
        return r.page.render({ canvasContext: c.getContext('2d'), viewport: v }).promise.then(function () {
          var fb = card.querySelector('.cover-fallback');
          if (fb) fb.replaceWith(c);
          card.querySelector('.stats').textContent = r.doc.numPages + ' pages';
          r.doc.destroy();
        });
      }).catch(function () {
        card.querySelector('.stats').textContent = 'PDF file not found yet';
      });
  }

  /* ---------- opening + rendering ---------- */
  Reader.onProgress = function (loaded, total) {
    // PDF.js keeps emitting progress for background auto-fetch long after a
    // book has opened — only show the loader while openBook() is in flight.
    if (!bookLoading) return;
    if ($('errorBox').classList.contains('show')) return; // don't resurrect the loader over an error
    $('loadBox').classList.add('show');
    if (total > 0) { var pct = Math.min(100, Math.round((loaded / total) * 100)); $('loadProgress').value = pct; $('loadText').textContent = 'Loading book… ' + pct + '%'; }
    else $('loadText').textContent = 'Loading book…';
  };
  Reader.onRender = function (wraps) {
    $('loadBox').classList.remove('show'); // a rendered spread means loading is done
    wraps.forEach(function (w) { Notes.renderPage(w.wrap); });
    updateNav();
  };
  Notes.onSaveStatus = function (t) { $('saveStatus').textContent = t; };
  Notes.onChange = function () {
    document.querySelectorAll('.page-wrap').forEach(function (wrap) { Notes.renderPage(wrap); });
    $('btnUndo').disabled = !Notes.canUndo();
    $('btnRedo').disabled = !Notes.canRedo();
    refreshCounts();
    if ($('notesPanel').classList.contains('open')) renderNotesList();
  };

  function openBook(book, startPage) {
    currentBook = book;
    $('currentBookName').textContent = book.title;
    document.querySelectorAll('.book-card').forEach(function (c) {
      c.classList.toggle('active', c.dataset.bookId === book.id);
    });
    $('errorBox').classList.remove('show');
    bookLoading = true;
    $('loadBox').classList.add('show');
    $('loadText').textContent = 'Loading book…';
    var url = 'books/' + encodeURIComponent(book.file);
    return Reader.load(book, url).then(function () {
      bookLoading = false;
      $('loadBox').classList.remove('show');
      var card = document.querySelector('.book-card[data-book-id="' + book.id + '"] .stats');
      if (card) card.textContent = Reader.numPages + ' pages';
      return Storage.getAnnotations(book.id).then(function (anns) {
        Notes.load(book.id, anns);
        var last = Storage.getSetting('lastPosition', {});
        var page = startPage || (last.bookId === book.id ? last.page : 1) || 1;
        // Set the target spread without rendering, then render exactly once.
        Reader.spreadIndex = Reader.spreadIndexForPage(Reader.spreads, Math.min(page, Reader.numPages));
        return rerender();
      });
    }).catch(function (err) {
      bookLoading = false;
      $('loadBox').classList.remove('show');
      $('errorText').textContent = '“' + book.file + '” could not be loaded. It may not have been added to the books folder yet, or the connection dropped. (' + (err && err.message ? err.message : err) + ')';
      $('errorBox').classList.add('show');
    });
  }
  $('btnRetry').addEventListener('click', function () { if (currentBook) openBook(currentBook); });

  function rerender() {
    if (!Reader.pdfDoc) return Promise.resolve();
    checkSingleMode();
    return Reader.renderCurrent(stage, bookEl).then(updateNav);
  }
  function checkSingleMode() {
    var single = Reader.isSinglePageMode();
    $('singleNotice').classList.toggle('show', single && Reader.numPages > 0 && window.innerWidth < 900);
    if (wasSingle !== null && single !== wasSingle && Reader.pdfDoc) {
      var first = (Reader.currentPages()[0] || 1);
      Reader.recomputeSpreads(first);
    }
    wasSingle = single;
  }
  function updateNav() {
    if (!Reader.pdfDoc) return;
    var pages = Reader.currentPages();
    $('pageLabel').textContent = pages.length ? ('Pages ' + pages.join('–') + ' of ' + Reader.numPages) : '';
    var slider = $('pageSlider');
    slider.max = Math.max(0, Reader.spreads.length - 1);
    slider.value = Reader.spreadIndex;
    $('gotoPage').value = pages[0] || '';
    $('btnPrev').disabled = Reader.spreadIndex <= 0;
    $('btnNext').disabled = Reader.spreadIndex >= Reader.spreads.length - 1;
    if (currentBook && pages.length) {
      Storage.setSetting('lastPosition', { bookId: currentBook.id, page: pages[0] });
    }
  }

  /* ---------- navigation ---------- */
  $('btnPrev').addEventListener('click', function () { Reader.prev(); });
  $('btnNext').addEventListener('click', function () { Reader.next(); });
  $('pageSlider').addEventListener('input', function () { Reader.goToSpread(parseInt(this.value, 10)).then(updateNav); });
  $('gotoPage').addEventListener('change', function () {
    var p = parseInt(this.value, 10);
    if (!isNaN(p)) Reader.goToPage(p).then(updateNav);
  });
  document.addEventListener('keydown', function (ev) {
    var tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (ev.target && ev.target.isContentEditable)) return;
    if (!$('welcome').classList.contains('hidden')) return;
    if (ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); Reader.next(); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); Reader.prev(); }
  });
  stage.addEventListener('touchstart', function (ev) { touchStartX = ev.changedTouches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', function (ev) {
    if (touchStartX === null) return;
    var dx = ev.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 60) { if (dx < 0) Reader.next(); else Reader.prev(); }
    touchStartX = null;
  }, { passive: true });

  // page-edge clicks navigate; other surface clicks place notes when a tool is active
  bookEl.addEventListener('click', function (ev) {
    var edge = ev.target.closest('.page-edge');
    if (edge) { if (edge.classList.contains('edge-prev')) Reader.prev(); else Reader.next(); return; }
    if (ev.target.closest('.ann') || ev.target.closest('#noteToolbar')) return;
    var surface = ev.target.closest('.page-surface');
    if (!surface || Notes.tool === 'select') return;
    var rect = surface.getBoundingClientRect();
    var wrap = surface.closest('.page-wrap');
    Notes.placeAt(parseInt(wrap.dataset.page, 10), (ev.clientX - rect.left) / rect.width, (ev.clientY - rect.top) / rect.height);
  });

  /* ---------- zoom ---------- */
  $('btnZoomIn').addEventListener('click', function () { Reader.zoom = Math.min(3, Reader.zoom + 0.25); rerender(); });
  $('btnZoomOut').addEventListener('click', function () { Reader.zoom = Math.max(0.4, Reader.zoom - 0.25); rerender(); });
  $('btnZoomFit').addEventListener('click', function () { Reader.zoom = 1; rerender(); });
  window.addEventListener('resize', function () { rerender(); });

  /* ---------- note tools ---------- */
  function setTool(tool) {
    Notes.tool = tool;
    document.querySelectorAll('.tool-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.tool === tool ? 'true' : 'false');
    });
    bookEl.style.cursor = tool === 'select' ? '' : 'crosshair';
  }
  document.querySelectorAll('.tool-btn').forEach(function (b) {
    b.addEventListener('click', function () { setTool(b.dataset.tool); });
  });
  var sw = $('hlSwatches');
  Notes.HIGHLIGHT_COLORS.forEach(function (c, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.style.background = c.value;
    b.setAttribute('aria-label', 'Highlight colour: ' + c.name);
    b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    b.addEventListener('click', function () {
      Notes.highlightColor = c.value;
      sw.querySelectorAll('.swatch').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
    });
    sw.appendChild(b);
  });
  $('btnHighlight').addEventListener('click', function () {
    if (!Notes.highlightFromSelection()) {
      $('exportStatus').textContent = 'Select some text on the page first, then press Highlight selection.';
      setTimeout(function () { $('exportStatus').textContent = ''; }, 4000);
    }
  });
  $('btnUndo').addEventListener('click', function () { Notes.undo(); });
  $('btnRedo').addEventListener('click', function () { Notes.redo(); });

  /* ---------- notes list ---------- */
  function renderNotesList() {
    var box = $('notesList');
    var scope = $('notesScope').value;
    box.innerHTML = '';
    var render = function (items, bookFor) {
      if (!items.length) { box.innerHTML = '<p class="notes-empty">No notes yet. Open a book and use the toolbar at the bottom of the page.</p>'; return; }
      items.forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'note-item';
        var book = bookFor(a);
        b.innerHTML = '<span class="where"></span><br><span class="txt"></span>';
        b.querySelector('.where').textContent = (scope === 'all' && book ? book.title + ' · ' : '') + 'Page ' + a.page + ' · ' + a.type;
        b.querySelector('.txt').textContent = (a.text || '').slice(0, 90) || '(no text)';
        b.addEventListener('click', function () {
          var target = book || currentBook;
          if (!target) return;
          if (!currentBook || currentBook.id !== target.id) openBook(target, a.page);
          else Reader.goToPage(a.page).then(updateNav);
        });
        box.appendChild(b);
      });
    };
    if (scope === 'all') {
      Storage.getAll().then(function (all) {
        var items = [];
        books.forEach(function (book) {
          (all[book.id] || []).forEach(function (a) { a.__book = book; items.push(a); });
        });
        items.sort(function (x, y) { return (x.__book.title).localeCompare(y.__book.title) || x.page - y.page; });
        render(items, function (a) { return a.__book; });
      });
    } else {
      render(Notes.sorted(), function () { return currentBook; });
    }
  }

  /* ---------- export / backup / restore ---------- */
  function setExportStatus(t) { $('exportStatus').textContent = t; }
  $('btnSavePdf').addEventListener('click', function () {
    if (!currentBook) { setExportStatus('Open a book first.'); return; }
    Export.exportBook(currentBook, Notes.annotations, studentName(), false, setExportStatus)
      .then(function (n) { Storage.clearDirty(); setExportStatus('Saved annotated PDF (' + n + ' notes embedded).'); })
      .catch(function (e) { setExportStatus('Save failed: ' + e.message); });
  });
  $('btnFlatten').addEventListener('click', function () {
    if (!currentBook) { setExportStatus('Open a book first.'); return; }
    Export.exportBook(currentBook, Notes.annotations, studentName(), true, setExportStatus)
      .then(function (n) { Storage.clearDirty(); setExportStatus('Saved flattened PDF — notes are burned in and NOT editable (' + n + ' drawn).'); })
      .catch(function (e) { setExportStatus('Save failed: ' + e.message); });
  });
  $('btnSaveAll').addEventListener('click', function () {
    Storage.getAll().then(function (all) {
      // include the live in-memory notes for the open book (may be ahead of a debounced save)
      if (currentBook) all[currentBook.id] = Notes.annotations;
      return Export.exportAll(books, all, studentName(), setExportStatus);
    }).then(function (r) {
      Storage.clearDirty();
      setExportStatus('Saved ZIP with ' + r.included + ' book(s).' + (r.skipped.length ? ' Skipped (PDF missing): ' + r.skipped.join(', ') : ''));
    }).catch(function (e) { setExportStatus('Save all failed: ' + e.message); });
  });
  $('btnBackup').addEventListener('click', function () {
    Storage.getAll().then(function (all) {
      if (currentBook) all[currentBook.id] = Notes.annotations;
      var payload = { app: 'tcm-reader', version: 1, exportedAt: new Date().toISOString(), studentName: studentName(), annotationsByBook: all };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'TCM Notes Backup - ' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      Storage.clearDirty();
      setExportStatus('Notes backed up to a JSON file.');
    });
  });
  $('btnRestore').addEventListener('click', function () { $('restoreFile').click(); });
  $('restoreFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    file.text().then(function (text) {
      var data = JSON.parse(text);
      var byBook = data.annotationsByBook || data;
      return Storage.importAll(byBook).then(function () {
        setExportStatus('Notes restored. Reopening the current book…');
        if (currentBook) return openBook(currentBook);
        refreshCounts();
      });
    }).catch(function (e) { setExportStatus('Restore failed: ' + e.message); });
    this.value = '';
  });

  window.addEventListener('beforeunload', function (ev) {
    if (Storage.isDirty()) { ev.preventDefault(); ev.returnValue = 'You have notes that have not been backed up or exported. Back up your notes before leaving.'; }
  });

  /* ---------- boot ---------- */
  fetch('books/books.json').then(function (r) {
    if (!r.ok) throw new Error('books/books.json not found');
    return r.json();
  }).then(function (data) {
    books = data.books || [];
    buildLibrary();
    var last = Storage.getSetting('lastPosition', {});
    var first = books.find(function (b) { return b.id === last.bookId; }) || books[0];
    if (first) openBook(first);
  }).catch(function (e) {
    $('errorText').textContent = 'The book list (books/books.json) could not be loaded: ' + e.message;
    $('errorBox').classList.add('show');
  });
})();
