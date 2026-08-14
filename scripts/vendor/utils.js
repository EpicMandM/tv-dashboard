const xml_special_to_encoded_attribute = {
  '&': '&amp;',
  '<': '&lt;',
  '"': '&quot;',
  '\r': '&#xD;',
  '\n': '&#xA;',
  '\t': '&#x9;'
};

const xml_special_to_encoded_text = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '\r': '&#xD;'
};

function encodeSpecialCharactersInAttribute(attributeValue) {
  return attributeValue
    .replace(/[\r\n\t ]+/g, ' ')
    .replace(/([&<"\r\n\t])/g, function (_str, item) {
      return xml_special_to_encoded_attribute[item];
    });
}

function encodeSpecialCharactersInText(text) {
  return text.replace(/\r\n?/g, '\n').replace(/([&<>\r])/g, function (_str, item) {
    return xml_special_to_encoded_text[item];
  });
}

module.exports = {
  encodeSpecialCharactersInAttribute,
  encodeSpecialCharactersInText
};
