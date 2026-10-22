/*
 * dc-shim.js — vista previa LOCAL de artboards .dc.html en un navegador normal.
 * Solo para iterar en el scratchpad: interpreta lo mínimo del formato
 * (<x-dc>, <helmet>, {{ruta}}, <sc-if>, <sc-for>, onClick="{{fn}}",
 * clase Component extends DCLogic con state/setState). No es el runtime real
 * del canvas: el artboard final carga ./support.js.
 */
(function () {
  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^'.*'$/.test(path)) return path.slice(1, -1);
    return path.split('.').reduce(function (acc, k) {
      return acc == null ? undefined : acc[k];
    }, scope);
  }
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) {
      var v = lookup(p, scope);
      return v == null ? '' : String(v);
    });
  }
  function renderChildren(tpl, scope, out) {
    tpl.childNodes.forEach(function (c) {
      renderNode(c, scope).forEach(function (n) { out.appendChild(n); });
    });
  }
  function renderNode(tpl, scope) {
    if (tpl.nodeType === 3) return [document.createTextNode(interp(tpl.nodeValue, scope))];
    if (tpl.nodeType !== 1) return [];
    var tag = tpl.tagName.toLowerCase();
    var frag;
    if (tag === 'sc-if') {
      var m = (tpl.getAttribute('value') || '').match(WHOLE);
      var ok = m ? lookup(m[1], scope) : false;
      if (!ok) return [];
      frag = document.createDocumentFragment();
      renderChildren(tpl, scope, frag);
      return Array.prototype.slice.call(frag.childNodes);
    }
    if (tag === 'sc-for') {
      var lm = (tpl.getAttribute('list') || '').match(WHOLE);
      var list = (lm ? lookup(lm[1], scope) : []) || [];
      var as = tpl.getAttribute('as') || 'item';
      var res = [];
      list.forEach(function (item, i) {
        var s = Object.assign({}, scope);
        s[as] = item;
        s.$index = i;
        var f = document.createDocumentFragment();
        renderChildren(tpl, s, f);
        res = res.concat(Array.prototype.slice.call(f.childNodes));
      });
      return res;
    }
    if (tag === 'helmet') {
      frag = document.createDocumentFragment();
      renderChildren(tpl, scope, frag);
      return Array.prototype.slice.call(frag.childNodes);
    }
    var el = tpl.cloneNode(false);
    Array.prototype.slice.call(tpl.attributes).forEach(function (a) {
      if (a.value.indexOf('{{') === -1) return;
      var whole = a.value.match(WHOLE);
      if (/^on/.test(a.name) && whole) {
        el.removeAttribute(a.name);
        var fn = lookup(whole[1], scope);
        if (typeof fn === 'function') el.addEventListener(a.name.slice(2), function (e) { fn(e); });
        return;
      }
      if (/^hint-/.test(a.name)) { el.removeAttribute(a.name); return; }
      if (whole) {
        var val = lookup(whole[1], scope);
        if (val === true) { el.setAttribute(a.name, ''); return; }
        if (val === false || val == null) { el.removeAttribute(a.name); return; }
      }
      el.setAttribute(a.name, interp(a.value, scope));
    });
    if (tag === 'style') { el.textContent = tpl.textContent; return [el]; }
    renderChildren(tpl, scope, el);
    return [el];
  }
  function boot() {
    var host = document.querySelector('x-dc');
    if (!host) return;
    var tpl = host.cloneNode(true);
    var scriptEl = document.querySelector('script[type="text/x-dc"]');
    var props = {};
    try {
      var decl = JSON.parse(scriptEl.getAttribute('data-props') || '{}');
      Object.keys(decl).forEach(function (k) {
        if (k[0] !== '$' && decl[k] && 'default' in decl[k]) props[k] = decl[k].default;
      });
    } catch (e) { console.error('data-props', e); }
    var comp;
    function render() {
      var vals = comp.renderVals() || {};
      while (host.firstChild) host.removeChild(host.firstChild);
      renderChildren(tpl, vals, host);
    }
    function DCLogic(p) { this.props = p || {}; this.state = {}; }
    DCLogic.prototype.setState = function (p) {
      Object.assign(this.state, typeof p === 'function' ? p(this.state) : p);
      render();
    };
    DCLogic.prototype.forceUpdate = function () { render(); };
    var Component = new Function('DCLogic', scriptEl.textContent + '\n;return Component;')(DCLogic);
    comp = new Component(props);
    if (!comp.state) comp.state = {};
    host.style.display = 'contents';
    render();
    if (comp.componentDidMount) comp.componentDidMount();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
