const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const Dom = require('@xmldom/xmldom').DOMParser;
const ExclusiveCanonicalization = require('./exclusive-canonicalization').ExclusiveCanonicalization;

const authorPropDgst = 'lpo8tUDs054eLlBQXiDPVDVKfw30ZZdtkRs1jd7H5K8=';
const distributorPropDgst = 'u/jU3U4Zm5ihTMSjKGlGYbWzDfRkGphPPHx3gJIYEJ4=';

class Reference {
  constructor(uri) {
    this.uri = uri;
    this.digestValue = '';
  }

  digest(content) {
    if (this.uri == '#prop') {
      this.digestValue = content;
    } else {
      const shasum = crypto.createHash('sha256');
      shasum.update(content, 'utf8');
      this.digestValue = shasum.digest('base64');
    }
  }

  getElement() {
    const transform =
      '<Transforms>\n' +
      '<Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"></Transform>\n' +
      '</Transforms>\n';
    return (
      '<Reference URI="' +
      this.uri +
      '">\n' +
      (this.uri == '#prop' ? transform : '') +
      '<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>\n' +
      '<DigestValue>' +
      this.digestValue +
      '</DigestValue>\n' +
      '</Reference>\n'
    );
  }
}

class Signature {
  constructor(id, projectRoot) {
    this.id = id;
    this.projectRoot = projectRoot;
    this.signedInfo = '';
    this.signatureValue = '';
    this.keyInfo = '';
  }

  _listFiles() {
    const dirList = [];
    const excludeFile =
      this.id == 'AuthorSignature'
        ? ['author-signature.xml', 'signature1.xml', 'signature2.xml']
        : ['signature1.xml', 'signature2.xml'];
    const root = this.projectRoot;

    function listDirs(curDir) {
      fs.readdirSync(curDir, { withFileTypes: true }).forEach((item) => {
        if (item.name.startsWith('.') || excludeFile.includes(item.name)) return;
        const full = path.resolve(curDir, item.name);
        if (item.isDirectory()) listDirs(full);
        else dirList.push(full);
      });
    }

    listDirs(root);
    return dirList.sort();
  }

  _addReferences(fileList) {
    let references = '';
    fileList.forEach((file) => {
      const uri = encodeURIComponent(file.substring(this.projectRoot.length + 1).replace(/\\/g, '/'));
      const ref = new Reference(uri);
      ref.digest(fs.readFileSync(file));
      references += ref.getElement();
    });
    const propRef = new Reference('#prop');
    propRef.digest(this.id == 'AuthorSignature' ? authorPropDgst : distributorPropDgst);
    references += propRef.getElement();
    return references;
  }

  sign(key) {
    const references = this._addReferences(this._listFiles());
    this.signedInfo =
      '<SignedInfo>\n' +
      '<CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod>\n' +
      '<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>\n' +
      references +
      '</SignedInfo>\n';

    const signWrapper =
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">' + this.signedInfo + '</Signature>';
    const xml = new Dom().parseFromString(signWrapper, 'application/xml');
    const canoned = new ExclusiveCanonicalization().process(xml.documentElement.firstChild, {
      defaultNsForPrefix: { ds: 'http://www.w3c.org/2000/09/xmldsig#' }
    });
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(canoned);
    this.signatureValue = '<SignatureValue>' + signer.sign(key, 'base64') + '</SignatureValue>';
  }

  addKeyInfo(certChain) {
    this.keyInfo = '<KeyInfo><X509Data>\n';
    certChain.forEach((cert) => {
      this.keyInfo += '<X509Certificate>' + cert.replace(/\r\n/g, '\n') + '</X509Certificate>\n';
    });
    this.keyInfo += '</X509Data>\n</KeyInfo>\n';
  }

  generateSignatureXml() {
    const role = this.id == 'AuthorSignature' ? 'author' : 'distributor';
    return (
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#" Id="' +
      this.id +
      '">\n' +
      this.signedInfo +
      this.signatureValue +
      this.keyInfo +
      '<Object Id="prop"><SignatureProperties xmlns:dsp="http://www.w3.org/2009/xmldsig-properties"><SignatureProperty Id="profile" Target="#' +
      this.id +
      '"><dsp:Profile URI="http://www.w3.org/ns/widgets-digsig#profile"></dsp:Profile></SignatureProperty><SignatureProperty Id="role" Target="#' +
      this.id +
      '"><dsp:Role URI="http://www.w3.org/ns/widgets-digsig#role-' +
      role +
      '"></dsp:Role></SignatureProperty><SignatureProperty Id="identifier" Target="#' +
      this.id +
      '"><dsp:Identifier></dsp:Identifier></SignatureProperty></SignatureProperties></Object>\n' +
      '</Signature>\n'
    );
  }
}

module.exports = class PackageSigner {
  constructor() {
    this.profileInfo = { author: null, distributor1: null, distributor2: null };
  }

  signPackage(projectRoot) {
    const authorSig = new Signature('AuthorSignature', projectRoot);
    authorSig.sign(this.profileInfo.author.privateKey);
    authorSig.addKeyInfo(this.profileInfo.author.certChain);
    fs.writeFileSync(path.resolve(projectRoot, 'author-signature.xml'), authorSig.generateSignatureXml(), {
      encoding: 'utf-8'
    });

    const distributorSig = new Signature('DistributorSignature', projectRoot);
    distributorSig.sign(this.profileInfo.distributor1.privateKey);
    distributorSig.addKeyInfo(this.profileInfo.distributor1.certChain);
    fs.writeFileSync(path.resolve(projectRoot, 'signature1.xml'), distributorSig.generateSignatureXml(), {
      encoding: 'utf-8'
    });
  }
};
