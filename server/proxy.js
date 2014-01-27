"use strict";

var util = require("util");
var https = require("https");
https.globalAgent.maxSockets = 2000;
var app = require("./server").app;

/**
 * Proxifies Google Contacts Photo API, because it doesn't send CORS compatible
 * headers for browser consumption.
 */
app.get("/proxy/google/avatar/:email/:id", function(req, res) {
  console.log("incoming request");
  var format = req.query.format === "json" ? "json" : "image";
  var options = {
    method: "GET",
    host: "www.google.com",
    port: 443,
    path: util.format("/m8/feeds/photos/media/%s/%s?v=3.0&access_token=%s",
                      req.params.email,
                      req.params.id,
                      req.query.token),
  };

  var request = https.request(options, function(response) {
    var currentByte = 0,
        // don't ask me why sometimes headers use caps and sometimes not
        contentType = response.headers["Content-Type"] || "image/jpeg",
        // google doesn't always provide a Content-Length header, defaulting to
        // something large enough to deal with avatars; final image is sliced
        // back before sending the result
        size = parseInt(response.headers["content-length"], 10) || 999999,
        imageData = new Buffer(size);

    if (response.statusCode === 200) {
      console.log("request succeeded");
    } else if (response.statusCode === 404) {
      return res.sendfile("/Users/niko/Sites/talkilla/static/img/default-avatar.png");
    } else if (response.statusCode === 503) {
      console.log("503!!!", response.headers, response.connection._buffer.toString());
      return res.sendfile("/Users/niko/Dropbox/Photos/Icons/twitter-icon2.png");
    } else {
      console.log("request failed", response.statusCode, response.headers);
      return res.send(response.statusCode,
                      util.format("HTTP %d", response.statusCode));
    }

    response.setEncoding('binary');

    response.on("data", function(chunk) {
      imageData.write(chunk, currentByte, "binary");
      currentByte += chunk.length;
    });

    response.on("end", function() {
      console.log("request.end");
      // trim out unneeded contents
      var finalImageData = imageData.slice(0, currentByte);
      if (format === "image") {
        // raw image contents
        res.type(contentType);
        res.send(finalImageData);
      } else {
        // json/base64 export
        res.type("application/json");
        res.json({
          type: contentType,
          data: finalImageData.toString('base64')
        });
      }
      // manual gc ftw
      imageData = undefined;
    });
  });

  request.end();

  request.setTimeout(2000, function() {
    res.send(503, "timed out");
    console.log("timed out");
  });

  request.on("error", function(err) {
    // XXX send appropriate format (eg. default avatar on 404, json when needed,
    //     etc.)
    console.log("error", err);
    res.send(err, 500);
  });
});
