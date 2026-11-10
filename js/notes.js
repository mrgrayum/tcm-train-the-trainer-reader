/* notes.js — annotation model + on-page rendering + interaction.
   Every annotation: {id, bookId, page, type:'sticky'|'highlight'|'textbox',
   x, y (fractions of page w/h, top-left origin), w, h (fractions, textbox/highlight),
   rects (highlight only: [{x,y,w,h}]), color, text, created}
   Positions are ALWAYS fractions of the page, never pixels. */
(function (global) {
  'use strict';

  var HIGHLIGHT_COLORS = [
    { name: 'Bolt light', value: '#FFAE4D' },
    { name: 'Yellow', value: '#F2E394' },
    { name: 'Green', value: '#A8D5A2' },
    { name: 'Blue', value: '#A9C7E8' }
  ];
  var STICKY_COLOR = '#F0941C';

  function uid() {
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  var Notes = {
    HIGHLIGHT_COLORS: HIGHLIGHT_COLORS,
    bookId: null,
    annotations: [],
    tool: 'select',           // 'select' | 'sticky' | 'textbox'
    highlightColor: HIGHLIGHT_COLORS[0].value,
    undoStack: [],
    redoStack: [],
    HISTORY_LIMIT: 30,
    saveTimer: null,
    onChange: null,           // fn() after render/counts change
    onSaveStatus: null,       // fn(text)
    expandedId: null,

    load: function (bookId, annotations) {
      this.bookId = bookId;
      this.annotations = (annotations || []).slice();
      this.undoStack = []; this.redoStack = []; this.expandedId = null;
    },
    forPage: function (page) { return this.annotations.filter(function (a) { return a.page === page; }); },
    sorted: function () {
      return this.annotations.slice().sort(function (a, b) { return a.page - b.page || a.created - b.created; });
    },

    snapshot: function () { return JSON.stringify(this.annotations); },
    pushHistory: function () {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > this.HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
    },
    undo: function () {
      if (!this.undoStack.length) return false;
      this.redoStack.push(this.snapshot());
      this.annotations = JSON.parse(this.undoStack.pop());
      this.afterChange(true);
      return true;
    },
    redo: function () {
      if (!this.redoStack.length) return false;
      this.undoStack.push(this.snapshot());
      this.annotations = JSON.parse(this.redoStack.pop());
      this.afterChange(true);
      return true;
    },
    canUndo: function () { return this.undoStack.length > 0; },
    canRedo: function () { return this.redoStack.length > 0; },

    add: function (ann) {
      this.pushHistory();
      ann.id = ann.id || uid();
      ann.bookId = this.bookId;
      ann.created = ann.created || Date.now();
      this.annotations.push(ann);
      this.afterChange(true);
      return ann;
    },
    update: function (id, patch, recordHistory) {
      if (recordHistory) this.pushHistory();
      var a = this.annotations.find(function (x) { return x.id === id; });
      if (!a) return;
      Object.keys(patch).forEach(function (k) { a[k] = patch[k]; });
      this.afterChange(true);
    },
    remove: function (id) {
      this.pushHistory();
      this.annotations = this.annotations.filter(function (x) { return x.id !== id; });
      if (this.expandedId === id) this.expandedId = null;
      this.afterChange(true);
    },

    afterChange: function (save) {
      if (save) this.scheduleSave();
      if (this.onChange) this.onChange();
    },
    scheduleSave: function () {
      var self = this;
      if (this.onSaveStatus) this.onSaveStatus('Saving…');
      global.clearTimeout(this.saveTimer);
      this.saveTimer = global.setTimeout(function () {
        if (!global.TCMStorage || !self.bookId) return;
        global.TCMStorage.setAnnotations(self.bookId, self.annotations).then(function () {
          if (self.onSaveStatus) self.onSaveStatus('Saved');
        }).catch(function () {
          if (self.onSaveStatus) self.onSaveStatus('Could not save — back up your notes');
        });
      }, 250);
    },

    /* ---------- rendering into a page's .annotation-layer ---------- */
    renderPage: function (wrap) {
      var self = this;
      var layer = wrap.querySelector('.annotation-layer');
      var surface = wrap.querySelector('.page-surface');
      if (!layer || !surface) return;
      layer.innerHTML = '';
      var page = parseInt(wrap.dataset.page, 10);
      var W = surface.clientWidth, H = surface.clientHeight;
      this.forPage(page).forEach(function (ann) {
        if (ann.type === 'highlight') layer.appendChild(self.renderHighlight(ann, W, H));
        else if (ann.type === 'sticky') layer.appendChild(self.renderSticky(ann, W, H));
        else if (ann.type === 'textbox') layer.appendChild(self.renderTextbox(ann, W, H));
      });
    },

    renderHighlight: function (ann, W, H) {
      var self = this;
      var holder = document.createElement('div');
      holder.className = 'ann ann-highlight'; holder.dataset.id = ann.id;
      holder.setAttribute('role', 'button');
      holder.setAttribute('aria-label', 'Highlight: ' + (ann.text || '').slice(0, 60) + '. Activate to change colour or delete.');
      (ann.rects || []).forEach(function (r) {
        var d = document.createElement('div');
        d.className = 'hl-rect';
        d.style.left = (r.x * W) + 'px'; d.style.top = (r.y * H) + 'px';
        d.style.width = (r.w * W) + 'px'; d.style.height = (r.h * H) + 'px';
        d.style.background = ann.color;
        holder.appendChild(d);
      });
      holder.addEventListener('click', function (ev) {
        if (self.tool !== 'select') return;
        ev.stopPropagation();
        self.showHighlightMenu(ann, ev.clientX, ev.clientY);
      });
      return holder;
    },

    renderSticky: function (ann, W, H) {
      var self = this;
      var el = document.createElement('div');
      el.className = 'ann ann-sticky'; el.dataset.id = ann.id;
      el.style.left = (ann.x * W) + 'px'; el.style.top = (ann.y * H) + 'px';
      var expanded = self.expandedId === ann.id;
      el.innerHTML =
        '<button type="button" class="sticky-icon" aria-label="Sticky note' + (ann.text ? ': ' + ann.text.slice(0, 40) : '') + '" aria-expanded="' + expanded + '">Note</button>' +
        (expanded ?
          '<div class="sticky-editor"><textarea aria-label="Sticky note text" rows="4">' + escapeHtml(ann.text || '') + '</textarea>' +
          '<div class="ann-actions"><button type="button" class="btn small sticky-done">Done</button>' +
          '<button type="button" class="btn small danger sticky-delete">Delete</button></div></div>' : '');
      el.querySelector('.sticky-icon').addEventListener('click', function (ev) {
        ev.stopPropagation();
        self.expandedId = expanded ? null : ann.id;
        if (self.onChange) self.onChange();
      });
      this.attachDrag(el.querySelector('.sticky-icon'), el, ann, W, H);
      if (expanded) {
        var ta = el.querySelector('textarea');
        ta.addEventListener('change', function () { self.update(ann.id, { text: ta.value }, true); });
        ta.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
        el.querySelector('.sticky-done').addEventListener('click', function () { self.expandedId = null; if (self.onChange) self.onChange(); });
        el.querySelector('.sticky-delete').addEventListener('click', function () { self.remove(ann.id); });
      }
      return el;
    },

    renderTextbox: function (ann, W, H) {
      var self = this;
      var el = document.createElement('div');
      el.className = 'ann ann-textbox'; el.dataset.id = ann.id;
      el.style.left = (ann.x * W) + 'px'; el.style.top = (ann.y * H) + 'px';
      el.style.width = ((ann.w || 0.3) * W) + 'px'; el.style.minHeight = ((ann.h || 0.06) * H) + 'px';
      el.innerHTML =
        '<div class="textbox-handle" role="button" aria-label="Move text box" tabindex="0">Text</div>' +
        '<textarea aria-label="Text box text">' + escapeHtml(ann.text || '') + '</textarea>' +
        '<div class="ann-actions"><button type="button" class="btn small danger textbox-delete">Delete</button></div>';
      var ta = el.querySelector('textarea');
      ta.addEventListener('change', function () {
        var patch = { text: ta.value };
        // CSS resize on the textarea can change the box size — store as fractions
        patch.w = clamp01(ta.clientWidth / W); patch.h = clamp01(ta.clientHeight / H);
        self.update(ann.id, patch, true);
      });
      ta.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      // observe resize (CSS resize handle) and store fractions on mouse-up anywhere
      ta.addEventListener('mouseup', function () {
        var w = clamp01(ta.clientWidth / W), h = clamp01(ta.clientHeight / H);
        if (Math.abs(w - (ann.w || 0)) > 0.005 || Math.abs(h - (ann.h || 0)) > 0.005) {
          self.update(ann.id, { w: w, h: h }, true);
        }
      });
      this.attachDrag(el.querySelector('.textbox-handle'), el, ann, W, H);
      el.querySelector('.textbox-delete').addEventListener('click', function () { self.remove(ann.id); });
      return el;
    },

    /* Drag an annotation element; on drop, store the new fraction position. */
    attachDrag: function (handle, el, ann, W, H) {
      var self = this;
      handle.addEventListener('pointerdown', function (ev) {
        if (self.tool !== 'select') return;
        var startX = ev.clientX, startY = ev.clientY;
        var origX = ann.x, origY = ann.y;
        var moved = false;
        function move(e2) {
          var dx = (e2.clientX - startX) / W, dy = (e2.clientY - startY) / H;
          if (Math.abs(e2.clientX - startX) + Math.abs(e2.clientY - startY) > 4) moved = true;
          if (!moved) return;
          el.style.left = (clamp01(origX + dx) * W) + 'px';
          el.style.top = (clamp01(origY + dy) * H) + 'px';
          el.dataset.dragX = clamp01(origX + dx); el.dataset.dragY = clamp01(origY + dy);
        }
        function up() {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          if (moved) self.update(ann.id, { x: parseFloat(el.dataset.dragX), y: parseFloat(el.dataset.dragY) }, true);
        }
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });
    },

    /* Small menu for a clicked highlight: recolour or delete. */
    showHighlightMenu: function (ann, clientX, clientY) {
      this.hideHighlightMenu();
      var self = this;
      var menu = document.createElement('div');
      menu.className = 'hl-menu'; menu.id = 'hlMenu';
      menu.setAttribute('role', 'menu');
      menu.style.left = clientX + 'px'; menu.style.top = clientY + 'px';
      HIGHLIGHT_COLORS.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'hl-swatch'; b.style.background = c.value;
        b.setAttribute('aria-label', 'Change highlight colour to ' + c.name);
        b.addEventListener('click', function () { self.update(ann.id, { color: c.value }, true); self.hideHighlightMenu(); });
        menu.appendChild(b);
      });
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'btn small danger'; del.textContent = 'Delete highlight';
      del.addEventListener('click', function () { self.remove(ann.id); self.hideHighlightMenu(); });
      menu.appendChild(del);
      document.body.appendChild(menu);
      setTimeout(function () {
        document.addEventListener('pointerdown', function h(ev) {
          if (!menu.contains(ev.target)) { self.hideHighlightMenu(); document.removeEventListener('pointerdown', h); }
        });
      }, 0);
    },
    hideHighlightMenu: function () {
      var m = document.getElementById('hlMenu');
      if (m) m.remove();
    },

    /* Placement: called by app.js when the user clicks a page surface with a tool active. */
    placeAt: function (page, fx, fy) {
      if (this.tool === 'sticky') {
        var s = this.add({ page: page, type: 'sticky', x: clamp01(fx), y: clamp01(fy), color: STICKY_COLOR, text: '' });
        this.expandedId = s.id;
        if (this.onChange) this.onChange();
        return s;
      }
      if (this.tool === 'textbox') {
        var t = this.add({ page: page, type: 'textbox', x: clamp01(fx), y: clamp01(fy), w: 0.3, h: 0.06, color: '#221F1F', text: '' });
        if (this.onChange) this.onChange();
        return t;
      }
      return null;
    },

    /* Highlight from the current text selection inside a page surface. */
    highlightFromSelection: function () {
      var sel = global.getSelection ? global.getSelection() : null;
      if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
      var range = sel.getRangeAt(0);
      var node = range.commonAncestorContainer;
      var surface = (node.nodeType === 1 ? node : node.parentElement);
      while (surface && !(surface.classList && surface.classList.contains('page-surface'))) surface = surface.parentElement;
      if (!surface) return null;
      var wrap = surface.closest('.page-wrap');
      var page = parseInt(wrap.dataset.page, 10);
      var sRect = surface.getBoundingClientRect();
      var rects = [];
      var clientRects = range.getClientRects();
      for (var i = 0; i < clientRects.length; i++) {
        var r = clientRects[i];
        if (r.width < 1 || r.height < 1) continue;
        rects.push({
          x: clamp01((r.left - sRect.left) / sRect.width),
          y: clamp01((r.top - sRect.top) / sRect.height),
          w: clamp01(r.width / sRect.width),
          h: clamp01(r.height / sRect.height)
        });
      }
      if (!rects.length) return null;
      var ann = this.add({
        page: page, type: 'highlight', x: rects[0].x, y: rects[0].y,
        rects: rects, color: this.highlightColor, text: sel.toString()
      });
      sel.removeAllRanges();
      return ann;
    }
  };

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  global.TCMNotes = Notes;
  if (typeof module !== 'undefined' && module.exports) module.exports = Notes;
})(typeof window !== 'undefined' ? window : globalThis);
