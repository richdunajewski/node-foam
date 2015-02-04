var hyperquest = require('hyperquest')
  , XML = require('simple-xml')
  , StringStream = require('stream-ext').StringStream
  , zlib = require('zlib')
  ;

module.exports = function soap (uri, operation, action, message, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  var xml = envelope(operation, message, options);
  if (options.benchmark) console.time('soap request: ' + uri);

  var stream = new StringStream();
  stream.on('error', callback);
  stream.on('end', function (data) {
    if (options.benchmark) console.timeEnd('soap request: ' + uri);
    try {
      var obj = XML.parse(data)['Envelope']['Body'];
      callback(null, obj);
    }
    catch (err) {
      callback(err);
    }
  });

  var req = hyperquest.post(uri, {
    headers: headers(action, xml.length),
    rejectUnauthorized: options.rejectUnauthorized,
    secureProtocol: options.secureProtocol
  });
  req.on('error', callback);
  req.on('response', function (res) {
    if (isGzipped(res))
      res.pipe(gunzip(callback)).pipe(stream);
    else
      res.pipe(stream);
  });
  req.end(xml);
};

function envelope (operation, message, options) {
  var xml = '<?xml version="1.0" encoding="UTF-8"?>';
  xml += '<s12:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:s12="http://www.w3.org/2003/05/soap-envelope">';

  if (options.header) {
    xml += '<s12:Header>';
    xml += typeof options.header === 'object' ? XML.stringify(options.header) : options.header.toString();
    xml += '</s12:Header>';
  }

  xml += '<s12:Body>';
  xml += serializeOperation(operation, options); // '<' + operation + ' xmlns="' + options.namespace + '"' + '>';
  xml += XML.stringify(message);
  xml += '</ns1:' + operation + '>';
  xml += '</s12:Body>';
  xml += '</s12:Envelope>';

  return xml;
}

function headers (schema, length) {
  return {
    Soapaction: schema,
    'Content-Type': 'text/xml;charset=UTF-8',
    'Content-Length': length,
    'Accept-Encoding': 'gzip',
    Accept: '*/*'
  }
}

function namespaces (ns) {
  var attributes = '';
  for (var name in ns) {
    attributes += name + '="' + ns[name] + '" ';
  }
  return attributes.trim();
}

function serializeOperation (operation, options) {
  return '<ns:1' + operation + (options.namespace ? ' xmlns:ns1="' + options.namespace + '"' : '') + '>';
}

function gunzip (callback) {
  var gunzip = zlib.createGunzip();
  gunzip.on('error', callback);
  return gunzip;
}

function isGzipped(response) {
  return /gzip/.test(response.headers['content-encoding']);
}
