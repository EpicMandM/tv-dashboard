var utils = require('./utils');

exports.ExclusiveCanonicalization = ExclusiveCanonicalization;

function ExclusiveCanonicalization() {
  this.includeComments = false;
}

ExclusiveCanonicalization.prototype.attrCompare = function (a, b) {
  if (!a.namespaceURI && b.namespaceURI) return -1;
  if (!b.namespaceURI && a.namespaceURI) return 1;
  var left = a.namespaceURI + a.localName;
  var right = b.namespaceURI + b.localName;
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

ExclusiveCanonicalization.prototype.nsCompare = function (a, b) {
  if (a.prefix == b.prefix) return 0;
  return a.prefix.localeCompare(b.prefix);
};

ExclusiveCanonicalization.prototype.renderAttrs = function (node) {
  var res = [];
  var attrListToRender = [];
  if (node.attributes) {
    for (var i = 0; i < node.attributes.length; ++i) {
      var attr = node.attributes[i];
      if (attr.name.indexOf('xmlns') === 0) continue;
      attrListToRender.push(attr);
    }
  }
  attrListToRender.sort(this.attrCompare);
  for (var a in attrListToRender) {
    if (!Object.prototype.hasOwnProperty.call(attrListToRender, a)) continue;
    attr = attrListToRender[a];
    res.push(' ', attr.name, '="', utils.encodeSpecialCharactersInAttribute(attr.value), '"');
  }
  return res.join('');
};

ExclusiveCanonicalization.prototype.renderNs = function (
  node,
  prefixesInScope,
  defaultNs,
  defaultNsForPrefix,
  inclusiveNamespacesPrefixList
) {
  var res = [];
  var newDefaultNs = defaultNs;
  var nsListToRender = [];
  var currNs = node.namespaceURI || '';

  if (node.prefix) {
    if (prefixesInScope.indexOf(node.prefix) == -1) {
      nsListToRender.push({
        prefix: node.prefix,
        namespaceURI: node.namespaceURI || defaultNsForPrefix[node.prefix]
      });
      prefixesInScope.push(node.prefix);
    }
  } else if (defaultNs != currNs) {
    newDefaultNs = node.namespaceURI;
    res.push(' xmlns="', newDefaultNs, '"');
  }

  if (node.attributes) {
    for (var i = 0; i < node.attributes.length; ++i) {
      var attr = node.attributes[i];
      if (
        attr.prefix &&
        prefixesInScope.indexOf(attr.localName) === -1 &&
        inclusiveNamespacesPrefixList.indexOf(attr.localName) >= 0
      ) {
        nsListToRender.push({ prefix: attr.localName, namespaceURI: attr.value });
        prefixesInScope.push(attr.localName);
      }
      if (
        attr.prefix &&
        prefixesInScope.indexOf(attr.prefix) == -1 &&
        attr.prefix != 'xmlns' &&
        attr.prefix != 'xml'
      ) {
        nsListToRender.push({ prefix: attr.prefix, namespaceURI: attr.namespaceURI });
        prefixesInScope.push(attr.prefix);
      }
    }
  }

  nsListToRender.sort(this.nsCompare);
  for (var a in nsListToRender) {
    if (!Object.prototype.hasOwnProperty.call(nsListToRender, a)) continue;
    var p = nsListToRender[a];
    res.push(' xmlns:', p.prefix, '="', p.namespaceURI, '"');
  }

  return { rendered: res.join(''), newDefaultNs: newDefaultNs };
};

ExclusiveCanonicalization.prototype.processInner = function (
  node,
  prefixesInScope,
  defaultNs,
  defaultNsForPrefix,
  inclusiveNamespacesPrefixList
) {
  if (node.data) return utils.encodeSpecialCharactersInText(node.data);

  var ns = this.renderNs(
    node,
    prefixesInScope,
    defaultNs,
    defaultNsForPrefix,
    inclusiveNamespacesPrefixList
  );
  var res = ['<', node.tagName, ns.rendered, this.renderAttrs(node, ns.newDefaultNs), '>'];
  for (var i = 0; i < node.childNodes.length; ++i) {
    res.push(
      this.processInner(
        node.childNodes[i],
        prefixesInScope.slice(0),
        ns.newDefaultNs,
        defaultNsForPrefix,
        inclusiveNamespacesPrefixList
      )
    );
  }
  res.push('</', node.tagName, '>');
  return res.join('');
};

ExclusiveCanonicalization.prototype.process = function (node, options) {
  options = options || {};
  var inclusiveNamespacesPrefixList = options.inclusiveNamespacesPrefixList || [];
  var defaultNs = options.defaultNs || '';
  var defaultNsForPrefix = options.defaultNsForPrefix || {};
  if (!(inclusiveNamespacesPrefixList instanceof Array)) {
    inclusiveNamespacesPrefixList = inclusiveNamespacesPrefixList.split(' ');
  }
  return this.processInner(node, [], defaultNs, defaultNsForPrefix, inclusiveNamespacesPrefixList);
};
